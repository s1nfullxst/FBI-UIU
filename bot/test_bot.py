import asyncio
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from bot import Records, UIUBot, install_commands, promotion_problem, case_check, case_manager_role_id, staff_check, operation_time, OperationSignup
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
        self.assertEqual(set(commands), {'case', 'promotion', 'stats', 'help', 'setup', 'operation', 'mycases', 'profile', 'backup', 'privacy', 'dossier', 'training', 'commendation', 'announcement'})
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

    def test_public_activity_filters_and_privacy(self):
        future = self.records.schedule('Public patrol', 'PRIVATE BRIEFING', 'ERLC', '2099-10-20T19:00Z', 987654)
        cancelled = self.records.schedule('Cancelled', 'Hidden briefing', 'BRM5', '2099-10-21T19:00Z', 987654)
        self.records.operation_status(cancelled, 'cancelled', 1)
        completed = self.records.schedule('Completed', 'Hidden briefing', 'Both', '2099-10-22T19:00Z', 987654)
        with self.records.db:
            self.records.db.execute("UPDATE operations SET starts_at='2020-01-01T00:00:00+00:00' WHERE id=?", (completed,))
        self.records.mark_attendance(completed, 123456, True, 987654)
        self.records.mark_attendance(completed, 654321, False, 987654)
        self.records.operation_status(completed, 'completed', 1)
        result = UIUBot(123, self.records).public_activity()
        self.assertEqual(result['completed_operations'], 1)
        self.assertEqual(result['verified_attendances'], 1)
        self.assertEqual([r['id'] for r in result['upcoming_operations']], [future])
        self.assertEqual(set(result['upcoming_operations'][0]), {'id','title','game','starts_at'})
        for private in ('PRIVATE BRIEFING', '987654', '123456', '654321', 'Cancelled'):
            self.assertNotIn(private, str(result))
        for i in range(15):
            self.records.schedule('Additional', 'Private', 'ERLC', '2099-11-20T19:00Z', 1)
        self.assertEqual(len(UIUBot(123, self.records).public_activity()['upcoming_operations']), 12)

    def test_privacy_erasure_and_restart(self):
        uid = 123456789012345678
        other = 223456789012345678
        mine = self.records.create('Private authored title', 'Private authored description', uid)
        theirs = self.records.create('Keep this case', f'Reference <@{uid}>; unrelated {other}', other)
        self.records.add_note(theirs, uid, 'My private note')
        self.records.add_note(theirs, other, f'About {uid}', f'https://example.com/{uid}')
        self.records.assign(theirs, uid, other)
        op = self.records.schedule('Authored operation', 'My private briefing', 'ERLC', '2099-10-20T19:00Z', uid)
        self.records.signup(op, uid, True)
        with self.records.db:
            self.records.db.execute("UPDATE operations SET starts_at='2020-01-01T00:00:00+00:00' WHERE id=?", (op,))
        self.records.mark_attendance(op, uid, True, other)
        self.records.mark_attendance(op, other, True, uid)
        self.records.request_deletion(uid)
        self.records.request_deletion(uid)
        self.assertEqual(self.records.db.execute('SELECT COUNT(*) FROM privacy_requests').fetchone()[0], 1)
        self.records.erase_user(uid)
        self.records.db.close()
        self.records = Records(self.path)
        dump = '\n'.join(self.records.db.iterdump())
        for text in (str(uid), 'Private authored title', 'Private authored description', 'My private note', 'My private briefing'):
            self.assertNotIn(text, dump)
        self.assertIn(str(other), dump)
        self.assertIn('Keep this case', dump)
        self.assertEqual(self.records.get(mine)['status'], 'open')
        self.assertEqual(self.records.db.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
        self.records.erase_user(uid)  # safe to reapply after restoring an old backup

    def test_privacy_commands_permissions_and_confirmation(self):
        bot = UIUBot(123, self.records)
        install_commands(bot)
        group = bot.tree.get_command('privacy')
        denied = SimpleNamespace(permissions=SimpleNamespace(manage_guild=False))
        for name in ('requests', 'erase'):
            command = group.get_command(name)
            with self.assertRaises(app_commands.CheckFailure):
                asyncio.run(command.checks[0](denied))
        with self.assertRaises(ValueError):
            asyncio.run(group.get_command('erase').callback(None, '123456', 'DELETE 999999'))
        with self.assertRaises(ValueError):
            self.records.erase_user('not an ID')
        self.assertEqual(len(group.get_command('request').checks), 0)

    def test_service_records_persist_revoke_and_erase(self):
        uid, other = 123456789012345678, 223456789012345678
        self.records.set_dossier(uid, 'Tactical Pilots', 'GOI-25', other)
        cert = self.records.award_credential(uid, 'training', ' Pilot ', 'Completed flight assessment', other)
        with self.assertRaises(ValueError):
            self.records.award_credential(uid, 'training', 'PILOT', 'Duplicate', other)
        medal = self.records.award_credential(uid, 'commendation', 'Teamwork', 'Supported the team', other)
        with self.assertRaises(ValueError):
            self.records.revoke_credential(medal, 'training', 'Wrong kind', other)
        self.records.revoke_credential(cert, 'training', 'Needs refresher', other)
        with self.assertRaises(ValueError):
            self.records.revoke_credential(cert, 'training', 'Again', other)
        self.records.award_credential(uid, 'training', 'Pilot', 'Refresher completed', other)
        theirs = self.records.award_credential(other, 'training', 'Investigator', f'Review with {uid}', uid)
        self.records.db.close()
        self.records = Records(self.path)
        self.assertEqual(self.records.db.execute('SELECT callsign FROM dossiers WHERE member_id=?', (str(uid),)).fetchone()[0], 'GOI-25')
        self.assertEqual(self.records.db.execute('SELECT COUNT(*) FROM credentials WHERE member_id=? AND active=1', (str(uid),)).fetchone()[0], 2)
        self.assertNotIn('GOI-25', str(UIUBot(1,self.records).stats()))
        self.records.erase_user(uid)
        dump = '\n'.join(self.records.db.iterdump())
        self.assertNotIn(str(uid), dump)
        self.assertIsNotNone(self.records.db.execute('SELECT id FROM credentials WHERE id=?', (theirs,)).fetchone())

    def test_service_command_permissions_and_help_length(self):
        from unittest.mock import AsyncMock
        bot = UIUBot(123, self.records)
        install_commands(bot)
        interaction = SimpleNamespace(user=SimpleNamespace(id=10,display_name='Agent'),
            guild=SimpleNamespace(fetch_member=AsyncMock(return_value=SimpleNamespace(guild_permissions=SimpleNamespace(manage_guild=False),roles=[]))),
            response=SimpleNamespace(send_message=AsyncMock()))
        async def run():
            for kind in ('training','commendation'):
                group = bot.tree.get_command(kind)
                for name in ('award','revoke'):
                    self.assertIn(staff_check, group.get_command(name).checks)
                await group.get_command('list').callback(interaction)
                with self.assertRaises(app_commands.CheckFailure):
                    await group.get_command('list').callback(interaction,SimpleNamespace(id=20))
                with self.assertRaises(ValueError):
                    await group.get_command('award').callback(interaction,SimpleNamespace(id=10,bot=False),'Medal','Reason')
            await bot.tree.get_command('dossier').get_command('view').callback(interaction)
            self.assertIn(staff_check,bot.tree.get_command('dossier').get_command('set').checks)
            await bot.tree.get_command('help').callback(interaction)
            call = interaction.response.send_message.call_args
            if call.args:
                self.assertLessEqual(len(call.args[0]),2000)
            else:
                self.assertLessEqual(len(call.kwargs['embed'].description),4096)
        asyncio.run(run())

    def test_announcements_public_projection_removal_and_privacy(self):
        uid, other = 123456789012345678, 223456789012345678
        first = self.records.publish_announcement('Welcome', 'Read the new member guide.', uid)
        self.assertEqual(self.records.publish_announcement('Welcome', 'Read the new member guide.', uid), first)
        for i in range(6):
            self.records.publish_announcement(f'Update {i}', 'Public text', other)
        self.records.db.close()
        self.records = Records(self.path)
        bot = UIUBot(123,self.records)
        install_commands(bot)
        for command in bot.tree.get_command('announcement').commands:
            self.assertIn(staff_check, command.checks)
        data=bot.stats()['announcements']
        self.assertEqual(len(data),5)
        self.assertEqual(data[0]['title'],'Update 5')
        self.assertEqual(set(data[0]),{'id','title','body','published_at'})
        self.assertNotIn(str(other),str(data))
        self.records.remove_announcement(data[0]['id'],other)
        self.assertNotEqual(bot.stats()['announcements'][0]['id'],data[0]['id'])
        self.records.erase_user(uid)
        self.assertIsNone(self.records.db.execute('SELECT id FROM announcements WHERE id=?',(first,)).fetchone())
        with self.assertRaises(ValueError):
            self.records.publish_announcement('  ', 'Body',other)
        with self.assertRaises(ValueError):
            self.records.remove_announcement(9999,other)

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
            self.assertIn(case_check, bot.tree.get_command('case').get_command(name).checks)
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


class RoleSyncTests(unittest.IsolatedAsyncioTestCase):
    async def test_case_role_is_scoped_and_revocation_is_checked(self):
        from unittest.mock import AsyncMock
        member = SimpleNamespace(roles=[SimpleNamespace(id=case_manager_role_id())],
                                 guild_permissions=SimpleNamespace(manage_guild=False))
        interaction = SimpleNamespace(guild=SimpleNamespace(id=123,fetch_member=AsyncMock(return_value=member)),
                                      client=SimpleNamespace(guild_id=123), user=SimpleNamespace(id=5))
        self.assertTrue(await case_check(interaction))
        with self.assertRaises(app_commands.CheckFailure):
            await staff_check(interaction)
        member.roles = []
        with self.assertRaises(app_commands.CheckFailure):
            await case_check(interaction)
        member.guild_permissions.manage_guild = True
        self.assertTrue(await case_check(interaction))
        interaction.guild.id = 999
        with self.assertRaises(app_commands.CheckFailure):
            await case_check(interaction)

    async def test_complete_count_roster_and_failure(self):
        from unittest.mock import AsyncMock
        import discord
        bot = UIUBot(123, None)
        bot._connection.user = SimpleNamespace(id=7)
        members = [
            SimpleNamespace(id=1,bot=False,display_name='<Agent>',roles=[SimpleNamespace(id=case_manager_role_id())]),
            SimpleNamespace(id=2,bot=False,display_name='Member',roles=[]),
            SimpleNamespace(id=7,bot=True,display_name='UIU',roles=[]),
            SimpleNamespace(id=8,bot=True,display_name='Other bot',roles=[SimpleNamespace(id=case_manager_role_id())])]
        async def all_members(**kwargs):
            self.assertIsNone(kwargs['limit'])
            for member in members: yield member
        guild = SimpleNamespace(fetch_members=all_members)
        bot.fetch_guild = AsyncMock(return_value=guild)
        await bot.refresh_members()
        self.assertEqual(bot.member_count,3)
        self.assertEqual(bot.case_managers,[{'display_name':'<Agent>'}])
        self.assertIsNotNone(bot.member_updated_at)
        members[0].roles = []
        await bot.refresh_members()
        self.assertEqual(bot.case_managers,[])
        async def failed(**kwargs):
            yield members[0]
            raise discord.ClientException('failed')
        guild.fetch_members = failed
        await bot.refresh_members()
        self.assertIsNone(bot.member_count)
        self.assertIsNone(bot.case_managers)
        self.assertIsNone(bot.member_updated_at)

if __name__ == '__main__':
    unittest.main()
