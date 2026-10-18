import asyncio
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from bot import Records, UIUBot, install_commands, promotion_problem, staff_check, operation_time
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
        self.assertEqual(set(commands), {'case', 'promotion', 'stats', 'help', 'setup', 'operation'})
        self.assertEqual({c.name for c in commands['case'].commands}, {'open', 'close', 'reopen', 'view', 'list', 'assign', 'unassign'})
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

    def test_import_once_preserves_existing_cases(self):
        original = self.records.create('Missouri', 'Existing notes', 123)
        self.records.seed_archives()
        self.records.seed_archives()
        self.assertEqual(self.records.counts(), {'open': 1, 'closed': 1})
        self.assertEqual(self.records.get(original)['description'], 'Existing notes')
        self.records.db.close()
        self.records = Records(self.path)
        self.records.seed_archives()
        self.assertEqual(self.records.counts(), {'open': 1, 'closed': 1})

    def test_import_closed_and_no_reset(self):
        self.records.seed_archives()
        self.assertEqual(self.records.counts(), {'open': 0, 'closed': 2})
        case_id = self.records.listing('closed', 1)[0]['id']
        self.records.transition(case_id, 'open', 'New evidence', 123)
        self.records.seed_archives()
        self.assertEqual(self.records.get(case_id)['status'], 'open')

    def test_assignment_persists_and_closed_case_rejected(self):
        case_id = self.records.create('Assignment test', 'Notes', 123)
        self.records.assign(case_id, 456, 123)
        self.records.db.close()
        self.records = Records(self.path)
        self.assertEqual(self.records.assignee(case_id), '456')
        self.records.assign(case_id, None, 123)
        self.assertIsNone(self.records.assignee(case_id))
        self.records.transition(case_id, 'closed', 'Done', 123)
        with self.assertRaises(ValueError):
            self.records.assign(case_id, 456, 123)

    def test_operations_and_times(self):
        operation_id = self.records.schedule('Patrol', 'Briefing', 'ERLC', '2099-10-20T19:00+02:00', 123)
        self.assertEqual(self.records.operation(operation_id)['starts_at'], '2099-10-20T17:00:00+00:00')
        self.records.operation_status(operation_id, 'cancelled', 123)
        with self.assertRaises(ValueError):
            self.records.operation_status(operation_id, 'completed', 123)
        for value in ('2099-10-20T19:00', 'bad date', '2000-01-01T12:00Z'):
            with self.assertRaises(ValueError):
                operation_time(value)

    def test_announcement_failure_does_not_erase_record(self):
        from unittest.mock import AsyncMock
        import discord
        bot = UIUBot(123, self.records)
        self.records.setting('operation_channel', 789)
        response = SimpleNamespace(status=403, reason='Forbidden')
        bot.fetch_channel = AsyncMock(side_effect=discord.Forbidden(response, 'Denied'))
        operation_id = self.records.schedule('Patrol', 'Briefing', 'ERLC', '2099-10-20T19:00Z', 123)
        result = asyncio.run(bot.announce(None, 'operation_channel', discord.Embed(title='Test')))
        self.assertIn('announcement failed', result)
        self.assertEqual(self.records.operation(operation_id)['status'], 'scheduled')


if __name__ == '__main__':
    unittest.main()
