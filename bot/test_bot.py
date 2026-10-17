import asyncio
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from bot import Records, UIUBot, install_commands, promotion_problem, staff_check
from discord import app_commands


class Role:
    def __init__(self, position, managed=False):
        self.position = position
        self.managed = managed

    def __ge__(self, other):
        return self.position >= other.position

    def __le__(self, other):
        return self.position <= other.position

    def is_default(self):
        return self.position == 0


class BotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'uiu.sqlite3'
        self.records = Records(self.path)

    def tearDown(self):
        self.records.db.close()
        self.temp.cleanup()

    def test_case_lifecycle_and_restart(self):
        case_id = self.records.create('Missouri', 'Incident report', 123)
        self.assertEqual(self.records.counts(), {'open': 1, 'closed': 0})
        self.records.transition(case_id, 'closed', 'Resolved', 123)
        with self.assertRaises(ValueError):
            self.records.transition(case_id, 'closed', 'Again', 123)
        self.assertEqual(self.records.counts(), {'open': 0, 'closed': 1})
        self.records.db.close()
        self.records = Records(self.path)
        self.assertEqual(self.records.get(case_id)['resolution'], 'Resolved')
        self.records.transition(case_id, 'open', 'New evidence', 123)
        self.assertEqual(self.records.counts(), {'open': 1, 'closed': 0})
        self.assertEqual(self.records.db.execute('SELECT COUNT(*) FROM audit').fetchone()[0], 3)

    def test_invalid_cases_dont_change_counts(self):
        with self.assertRaises(ValueError):
            self.records.create(' ', 'report', 1)
        with self.assertRaises(ValueError):
            self.records.transition(999, 'closed', 'Missing', 1)
        self.assertEqual(self.records.counts(), {'open': 0, 'closed': 0})

    def test_pagination(self):
        for n in range(12):
            self.records.create(f'Case {n}', 'Report', 1)
        self.assertEqual(len(self.records.listing('open', 1)), 10)
        self.assertEqual(len(self.records.listing('open', 2)), 2)
        self.assertEqual(self.records.listing('open', 3), [])

    def test_promotion_hierarchy(self):
        old, new = Role(2), Role(3)
        actor = SimpleNamespace(id=1, top_role=Role(5))
        target = SimpleNamespace(id=2, bot=False, top_role=old, roles=[old])
        me = SimpleNamespace(top_role=Role(10))
        self.assertIsNone(promotion_problem(actor, target, new, old, me, 99))
        self.assertIsNotNone(promotion_problem(actor, actor, new, None, me, 99))
        self.assertIsNotNone(promotion_problem(actor, target, Role(5), old, me, 99))
        self.assertIsNotNone(promotion_problem(actor, target, Role(11), old, me, 99))
        self.assertIsNotNone(promotion_problem(actor, target, Role(4, managed=True), old, me, 99))
        self.assertIsNotNone(promotion_problem(actor, target, Role(1), old, me, 99))

    def test_commands_and_private_stats(self):
        self.records.create('Private case title', 'Confidential text', 456)
        bot = UIUBot(123, self.records)
        install_commands(bot)
        commands = {cmd.name: cmd for cmd in bot.tree.get_commands()}
        self.assertEqual(set(commands), {'case', 'promotion', 'stats', 'help'})
        self.assertEqual({c.name for c in commands['case'].commands}, {'open', 'close', 'reopen', 'view', 'list'})
        for cmd in commands.values():
            cmd.to_dict(bot.tree)  # Validate Discord command schemas, including option types.
        payload = bot.stats()
        self.assertEqual(payload['open_cases'], 1)
        self.assertNotIn('Private case title', str(payload))
        self.assertNotIn('Confidential text', str(payload))
        self.assertIsNone(payload['members'])
        response = asyncio.run(bot.stats_route(None))
        self.assertEqual(response.headers['Access-Control-Allow-Origin'], 'https://s1nfullxst.github.io')

    def test_staff_permission_denial(self):
        async def fetch_member(user_id):
            return SimpleNamespace(guild_permissions=SimpleNamespace(manage_guild=False), roles=[])
        interaction = SimpleNamespace(guild=SimpleNamespace(fetch_member=fetch_member), user=SimpleNamespace(id=5))
        with self.assertRaises(app_commands.CheckFailure):
            asyncio.run(staff_check(interaction))


if __name__ == '__main__':
    unittest.main()
