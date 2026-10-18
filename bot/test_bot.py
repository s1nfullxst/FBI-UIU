import asyncio
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from bot import Records, UIUBot, install_commands, promotion_problem, staff_check, operation_time, OperationSignup
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
        self.assertEqual(set(commands), {'case', 'promotion', 'stats', 'help', 'setup', 'operation', 'mycases', 'profile', 'backup'})
        self.assertEqual({c.name for c in commands['case'].commands}, {'open', 'close', 'reopen', 'view', 'list', 'assign', 'unassign', 'note', 'notes'})
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

    def test_notes_validation_persistence_and_privacy(self):
        case_id = self.records.create('Notes test', 'Details', 1)
        self.records.add_note(case_id, 1, 'Private note', 'https://example.com/evidence')
        for url in ('http://example.com', 'javascript:alert(1)', 'https://user:pass@example.com', 'https://example.com/a b'):
            with self.assertRaises(ValueError):
                self.records.add_note(case_id, 1, 'Note', url)
        self.records.db.close()
        self.records = Records(self.path)
        self.assertEqual(self.records.notes(case_id, 1)[0]['body'], 'Private note')
        bot = UIUBot(123, self.records)
        install_commands(bot)
        for name in ('note', 'notes'):
            self.assertIn(staff_check, bot.tree.get_command('case').get_command(name).checks)
        self.assertNotIn('Private note', str(bot.stats()))
        self.records.transition(case_id, 'closed', 'Done', 1)
        with self.assertRaises(ValueError):
            self.records.add_note(case_id, 1, 'Not allowed')

    def test_signup_duplicates_restart_and_profiles(self):
        op = self.records.schedule('Patrol', 'Briefing', 'BRM5', '2099-10-20T19:00Z', 1)
        self.records.signup(op, 10, True)
        self.assertIn('already', self.records.signup(op, 10, True))
        self.records.signup(op, 20, True)
        self.records.signup(op, 20, False)
        case_id = self.records.create('Agent case', 'Private', 1)
        self.records.assign(case_id, 10, 1)
        self.records.db.close()
        self.records = Records(self.path)
        self.assertEqual(len(self.records.my_cases(10)), 1)
        self.assertEqual(self.records.my_cases(20), [])
        self.assertEqual(self.records.profile(10)['scheduled_operations'], 1)
        self.assertEqual(self.records.profile(20)['scheduled_operations'], 0)
        self.records.operation_status(op, 'completed', 1)
        self.assertEqual(self.records.profile(10)['completed_operations'], 1)
        with self.assertRaises(ValueError):
            self.records.signup(op, 10, False)

    def test_buttons_restore_and_scope(self):
        from unittest.mock import AsyncMock
        async def run():
            op = self.records.schedule('Patrol', 'Briefing', 'ERLC', '2099-10-20T19:00Z', 1)
            bot = UIUBot(123, self.records)
            old_view = OperationSignup(bot, op)
            restored = OperationSignup(bot, op)
            self.assertTrue(restored.is_persistent())
            self.assertEqual([b.custom_id for b in old_view.children], [b.custom_id for b in restored.children])
            interaction = SimpleNamespace(guild_id=999, user=SimpleNamespace(id=10, bot=False), response=SimpleNamespace(send_message=AsyncMock()))
            await restored.children[0].callback(interaction)
            self.assertEqual(self.records.profile(10)['scheduled_operations'], 0)
            interaction.guild_id = 123
            await restored.children[0].callback(interaction)
            self.assertEqual(self.records.profile(10)['scheduled_operations'], 1)
            await restored.children[1].callback(interaction)
            self.assertEqual(self.records.profile(10)['scheduled_operations'], 0)
            with self.records.db:
                self.records.db.execute("UPDATE operations SET starts_at='2000-01-01T12:00:00+00:00' WHERE id=?", (op,))
            with self.assertRaises(ValueError):
                self.records.signup(op, 10, True)
        asyncio.run(run())

    def test_other_profile_requires_staff(self):
        from unittest.mock import AsyncMock
        bot = UIUBot(123, self.records)
        install_commands(bot)
        interaction = SimpleNamespace(user=SimpleNamespace(id=10, display_name='Agent'),
            guild=SimpleNamespace(fetch_member=AsyncMock(return_value=SimpleNamespace(guild_permissions=SimpleNamespace(manage_guild=False), roles=[]))),
            response=SimpleNamespace(send_message=AsyncMock()))
        async def run():
            await bot.tree.get_command('profile').callback(interaction)
            interaction.response.send_message.assert_awaited_once()
            with self.assertRaises(app_commands.CheckFailure):
                await bot.tree.get_command('profile').callback(interaction, SimpleNamespace(id=20))
        asyncio.run(run())

    def test_attendance_credit_and_corrections(self):
        op = self.records.schedule('Patrol', 'Briefing', 'ERLC', '2099-10-20T19:00Z', 1)
        with self.assertRaises(ValueError):
            self.records.mark_attendance(op, 10, True, 1)
        with self.records.db:
            self.records.db.execute("UPDATE operations SET starts_at='2000-01-01T12:00:00+00:00' WHERE id=?", (op,))
        self.records.mark_attendance(op, 10, True, 1)
        self.assertEqual(self.records.profile(10)['verified_completed'], 0)
        self.records.operation_status(op, 'completed', 1)
        self.assertEqual(self.records.profile(10)['verified_completed'], 1)
        self.records.mark_attendance(op, 10, True, 1)
        self.assertEqual(self.records.profile(10)['verified_completed'], 1)
        self.records.mark_attendance(op, 10, False, 1)
        self.assertEqual(self.records.profile(10)['verified_completed'], 0)

    def test_backup_restores_all_records(self):
        import sqlite3
        case_id = self.records.create('Backup case', 'Notes', 1)
        self.records.add_note(case_id, 1, 'Preserve this')
        self.records.assign(case_id, 10, 1)
        op = self.records.schedule('Patrol', 'Briefing', 'ERLC', '2099-10-20T19:00Z', 1)
        self.records.signup(op, 10, True)
        data = self.records.backup_bytes()
        restored = sqlite3.connect(':memory:')
        try:
            restored.deserialize(data)
            self.assertEqual(restored.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
            self.assertEqual(restored.execute('SELECT body FROM case_notes').fetchone()[0], 'Preserve this')
            self.assertEqual(restored.execute('SELECT COUNT(*) FROM signups').fetchone()[0], 1)
        finally:
            restored.close()

    def test_backup_permission_guard(self):
        from unittest.mock import AsyncMock
        bot = UIUBot(123, self.records)
        install_commands(bot)
        interaction = SimpleNamespace(permissions=SimpleNamespace(manage_guild=False))
        check = bot.tree.get_command('backup').checks[1]
        # Inspect actual permission predicate independently of the cooldown.
        denied = False
        for predicate in bot.tree.get_command('backup').checks:
            if predicate.__name__ == 'predicate':
                try:
                    result = predicate(interaction)
                except app_commands.MissingPermissions:
                    denied = True
                    break
                if asyncio.iscoroutine(result):
                    result.close()
        self.assertTrue(denied)


if __name__ == '__main__':
    unittest.main()
