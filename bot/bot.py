"""FBI UIU community bot. Python 3.11+. Secrets belong in hosting variables."""
from __future__ import annotations

import asyncio
import json
import io
import logging
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

import discord
from discord import app_commands
from discord.ext import tasks
from aiohttp import web

LOG = logging.getLogger("uiu")
GOLD = 0xC6AC72


def now():
    return datetime.now(timezone.utc).isoformat()


def operation_time(value):
    try:
        date = datetime.fromisoformat(value.strip().replace('Z', '+00:00'))
    except ValueError:
        raise ValueError('Use a date like 2026-10-20T19:00+02:00, including your UTC offset.')
    if date.tzinfo is None or date <= datetime.now(timezone.utc):
        raise ValueError('Enter a future time including its UTC offset, for example +02:00.')
    return date.astimezone(timezone.utc).isoformat()


class Records:
    def __init__(self, path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS cases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL, description TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('open','closed')),
                created_by TEXT NOT NULL, created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL, resolution TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS audit (
                id INTEGER PRIMARY KEY AUTOINCREMENT, time TEXT NOT NULL,
                actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL
            );
        """)
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS assignments(case_id INTEGER PRIMARY KEY, member_id TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS operations(
                id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL,
                briefing TEXT NOT NULL, game TEXT NOT NULL, starts_at TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'scheduled', created_by TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS case_notes(
                id INTEGER PRIMARY KEY AUTOINCREMENT, case_id INTEGER NOT NULL,
                author TEXT NOT NULL, body TEXT NOT NULL, evidence_url TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS signups(
                operation_id INTEGER NOT NULL, member_id TEXT NOT NULL, joined_at TEXT NOT NULL,
                PRIMARY KEY(operation_id,member_id)
            );
            CREATE TABLE IF NOT EXISTS attendance(
                operation_id INTEGER NOT NULL, member_id TEXT NOT NULL,
                present INTEGER NOT NULL CHECK(present IN (0,1)),
                confirmed_by TEXT NOT NULL, updated_at TEXT NOT NULL,
                PRIMARY KEY(operation_id,member_id)
            );
        """)

    def mark_attendance(self, operation_id, member_id, present, actor):
        row = self.operation(operation_id)
        if row is None or row['status'] == 'cancelled':
            raise ValueError('Choose an existing operation that is not cancelled.')
        if datetime.fromisoformat(row['starts_at']) > datetime.now(timezone.utc):
            raise ValueError('Attendance can only be confirmed after the scheduled start time.')
        with self.db:
            self.db.execute('INSERT OR REPLACE INTO attendance VALUES(?,?,?,?,?)',
                (operation_id, str(member_id), int(present), str(actor), now()))
            self.audit(actor, 'operation.attendance', json.dumps({'operation': operation_id, 'member': member_id, 'present': present}))

    def backup_bytes(self):
        # SQLite's backup API creates a consistent snapshot while the bot is running.
        snapshot = sqlite3.connect(':memory:')
        try:
            self.db.backup(snapshot)
            return snapshot.serialize()
        finally:
            snapshot.close()

    def add_note(self, case_id, author, body, evidence_url=''):
        case = self.get(case_id)
        if case is None or case['status'] != 'open':
            raise ValueError('Choose an existing open case. Reopen closed cases before adding notes.')
        body, evidence_url = body.strip(), evidence_url.strip()
        if not body or len(body) > 1000 or len(evidence_url) > 500:
            raise ValueError('Use a note of 1–1000 characters and an evidence link of at most 500 characters.')
        if evidence_url:
            try:
                url = urlsplit(evidence_url)
                valid = url.scheme == 'https' and url.hostname and not url.username and not url.password
            except ValueError:
                valid = False
            if not valid or any(c.isspace() for c in evidence_url):
                raise ValueError('Evidence must be a valid HTTPS link without spaces or embedded login details.')
        with self.db:
            cur = self.db.execute('INSERT INTO case_notes(case_id,author,body,evidence_url,created_at) VALUES(?,?,?,?,?)',
                (case_id, str(author), body, evidence_url, now()))
            self.audit(author, 'case.note', str(cur.lastrowid))
        return cur.lastrowid

    def notes(self, case_id, page):
        if self.get(case_id) is None:
            raise ValueError('That case ID does not exist.')
        return self.db.execute('SELECT * FROM case_notes WHERE case_id=? ORDER BY id DESC LIMIT 3 OFFSET ?',
                               (case_id, (page-1)*3)).fetchall()

    def signup(self, operation_id, member_id, join):
        row = self.operation(operation_id)
        if row is None or row['status'] != 'scheduled':
            raise ValueError('Sign-ups are closed for this operation.')
        if datetime.fromisoformat(row['starts_at']) <= datetime.now(timezone.utc):
            raise ValueError('This operation has started; its sign-up roster is locked.')
        with self.db:
            if join:
                cur = self.db.execute('INSERT OR IGNORE INTO signups VALUES(?,?,?)', (operation_id, str(member_id), now()))
                message = 'You joined the operation.' if cur.rowcount else 'You are already signed up.'
            else:
                cur = self.db.execute('DELETE FROM signups WHERE operation_id=? AND member_id=?', (operation_id, str(member_id)))
                message = 'You left the operation.' if cur.rowcount else 'You were not signed up.'
            if cur.rowcount:
                self.audit(member_id, 'operation.join' if join else 'operation.leave', str(operation_id))
        return message

    def my_cases(self, member_id, page=1):
        return self.db.execute('SELECT c.* FROM cases c JOIN assignments a ON a.case_id=c.id WHERE a.member_id=? ORDER BY c.id DESC LIMIT 10 OFFSET ?',
                               (str(member_id), (page-1)*10)).fetchall()

    def profile(self, member_id):
        counts = {'open': 0, 'closed': 0, 'scheduled_operations': 0, 'completed_operations': 0}
        for row in self.db.execute('SELECT c.status,COUNT(*) n FROM cases c JOIN assignments a ON a.case_id=c.id WHERE a.member_id=? GROUP BY c.status', (str(member_id),)):
            counts[row['status']] = row['n']
        for row in self.db.execute('SELECT o.status,COUNT(*) n FROM operations o JOIN signups s ON s.operation_id=o.id WHERE s.member_id=? GROUP BY o.status', (str(member_id),)):
            if row['status'] in ('scheduled', 'completed'):
                counts[row['status'] + '_operations'] = row['n']
        counts['verified_completed'] = self.db.execute("SELECT COUNT(*) FROM attendance a JOIN operations o ON o.id=a.operation_id WHERE a.member_id=? AND a.present=1 AND o.status='completed'", (str(member_id),)).fetchone()[0]
        return counts

    def setting(self, key, value=None):
        if value is not None:
            with self.db:
                self.db.execute('INSERT OR REPLACE INTO settings VALUES(?,?)', (key, str(value)))
        row = self.db.execute('SELECT value FROM settings WHERE key=?', (key,)).fetchone()
        return row['value'] if row else None

    def seed_archives(self):
        # One-time import. Never resets an existing case or repeats after a restart.
        if self.setting('archives_v1'):
            return
        with self.db:
            for title, aliases in [('Wyoming UIU File #1', ('wyoming', 'wyoming uiu file #1', 'wyoming case file #1')),
                                   ('Missouri UIU File #3', ('missouri', 'missouri uiu file #3', 'missouri uiu file 3'))]:
                existing = self.db.execute('SELECT title FROM cases').fetchall()
                if any(row['title'].strip().lower() in aliases for row in existing):
                    continue
                date = now()
                self.db.execute("INSERT INTO cases(title,description,status,created_by,created_at,updated_at,resolution) VALUES(?,?,'closed','archive-import',?,?,?)",
                    (title, 'Existing website archive: https://s1nfullxst.github.io/FBI-UIU/#case-files', date, date,
                     'Confirmed completed by server management. Imported closed.'))
                self.audit('archive-import', 'case.import', title)
            self.db.execute("INSERT INTO settings VALUES('archives_v1','done')")

    def assign(self, case_id, member_id, actor):
        row = self.get(case_id)
        if row is None:
            raise ValueError('That case ID does not exist.')
        if row['status'] != 'open':
            raise ValueError('Reopen this case before changing its assignment.')
        with self.db:
            if member_id is None:
                self.db.execute('DELETE FROM assignments WHERE case_id=?', (case_id,))
            else:
                self.db.execute('INSERT OR REPLACE INTO assignments VALUES(?,?)', (case_id, str(member_id)))
            self.audit(actor, 'case.assign', json.dumps({'case': case_id, 'member': member_id}))

    def assignee(self, case_id):
        row = self.db.execute('SELECT member_id FROM assignments WHERE case_id=?', (case_id,)).fetchone()
        return row['member_id'] if row else None

    def schedule(self, title, briefing, game, starts_at, actor):
        date = operation_time(starts_at)
        if not title.strip() or not briefing.strip():
            raise ValueError('Enter a title and briefing.')
        if game not in ('ERLC', 'BRM5', 'Both'):
            raise ValueError('Choose ERLC, BRM5 or Both.')
        with self.db:
            cursor = self.db.execute('INSERT INTO operations(title,briefing,game,starts_at,created_by) VALUES(?,?,?,?,?)',
                (title.strip(), briefing.strip(), game, date, str(actor)))
            self.audit(actor, 'operation.schedule', str(cursor.lastrowid))
        return cursor.lastrowid

    def operation(self, operation_id):
        return self.db.execute('SELECT * FROM operations WHERE id=?', (operation_id,)).fetchone()

    def operation_status(self, operation_id, status, actor):
        row = self.operation(operation_id)
        if row is None:
            raise ValueError('That operation ID does not exist.')
        if row['status'] != 'scheduled' or status not in ('completed', 'cancelled'):
            raise ValueError('Only scheduled operations can be completed or cancelled.')
        with self.db:
            self.db.execute('UPDATE operations SET status=? WHERE id=?', (status, operation_id))
            self.audit(actor, 'operation.' + status, str(operation_id))

    def audit(self, actor, action, detail):
        self.db.execute("INSERT INTO audit(time,actor,action,detail) VALUES(?,?,?,?)",
                        (now(), str(actor), action, detail))

    def create(self, title, description, actor):
        title, description = title.strip(), description.strip()
        if not title or not description:
            raise ValueError("Please enter a title and description, not just spaces.")
        with self.db:
            date = now()
            result = self.db.execute(
                "INSERT INTO cases(title,description,status,created_by,created_at,updated_at) VALUES(?,?,'open',?,?,?)",
                (title, description, str(actor), date, date))
            case_id = result.lastrowid
            self.audit(actor, "case.open", str(case_id))
        return case_id

    def transition(self, case_id, status, reason, actor):
        if status not in ("open", "closed"):
            raise ValueError("Invalid case status.")
        if not reason.strip():
            raise ValueError("Please enter a reason.")
        with self.db:
            row = self.get(case_id)
            if row is None:
                raise ValueError("That case ID does not exist.")
            if row["status"] == status:
                raise ValueError(f"Case #{case_id} is already {status}.")
            self.db.execute("UPDATE cases SET status=?,resolution=?,updated_at=? WHERE id=?",
                            (status, reason.strip(), now(), case_id))
            self.audit(actor, f"case.{status}", json.dumps({"id": case_id, "reason": reason}))

    def get(self, case_id):
        return self.db.execute("SELECT * FROM cases WHERE id=?", (case_id,)).fetchone()

    def counts(self):
        counts = {"open": 0, "closed": 0}
        for row in self.db.execute("SELECT status,COUNT(*) AS n FROM cases GROUP BY status"):
            counts[row["status"]] = row["n"]
        return counts

    def listing(self, status, page):
        return self.db.execute("SELECT * FROM cases WHERE status=? ORDER BY id DESC LIMIT 10 OFFSET ?",
                               (status, (page - 1) * 10)).fetchall()


def promotion_problem(actor, target, role, previous_role, me, owner_id):
    if actor.id == target.id:
        return "You cannot promote yourself."
    if target.bot or target.id == owner_id:
        return "Choose a human member other than the server owner."
    if target.top_role >= me.top_role:
        return "The bot's role must be above the member's highest role."
    if actor.id != owner_id and target.top_role >= actor.top_role:
        return "You can only promote members below your highest role."
    if role in target.roles:
        return "That member already has the selected role."
    if previous_role:
        if previous_role not in target.roles:
            return "The member does not have the previous role you selected."
        if role <= previous_role:
            return "The new rank must be above the previous rank."
    for candidate in (role, previous_role):
        if candidate is None:
            continue
        if candidate.is_default() or candidate.managed or candidate >= me.top_role:
            return "That role cannot be managed by this bot. Move the bot role above the rank roles."
        if actor.id != owner_id and candidate >= actor.top_role:
            return "You can only manage roles below your own highest role."
    return None


class OperationSignup(discord.ui.View):
    def __init__(self, bot, operation_id):
        super().__init__(timeout=None)
        self.bot = bot
        self.operation_id = operation_id
        for joining, label, style in [(True, 'Join operation', discord.ButtonStyle.success),
                                       (False, 'Leave operation', discord.ButtonStyle.secondary)]:
            button = discord.ui.Button(label=label, style=style, custom_id=f'uiu:operation:{operation_id}:{"join" if joining else "leave"}')
            async def callback(interaction, join=joining):
                if interaction.guild_id != self.bot.guild_id or interaction.user.bot:
                    await interaction.response.send_message('Use these buttons in the configured UIU server.', ephemeral=True)
                    return
                try:
                    message = self.bot.records.signup(self.operation_id, interaction.user.id, join)
                except ValueError as exc:
                    message = str(exc)
                await interaction.response.send_message(message, ephemeral=True)
            button.callback = callback
            self.add_item(button)

    async def on_error(self, interaction, error, item):
        LOG.error('Sign-up failed: %s', type(error).__name__)
        message = 'Unable to update your sign-up. Try again or ask staff to check the roster.'
        if interaction.response.is_done():
            await interaction.followup.send(message, ephemeral=True)
        else:
            await interaction.response.send_message(message, ephemeral=True)


class UIUTree(app_commands.CommandTree):
    async def interaction_check(self, interaction):
        if interaction.guild_id != self.client.guild_id:
            await interaction.response.send_message("This bot is configured for the FBI UIU server only.", ephemeral=True)
            return False
        return True

    async def on_error(self, interaction, error):
        original = getattr(error, "original", error)
        if isinstance(original, (app_commands.CheckFailure, discord.Forbidden)):
            message = "Permission denied. Check your staff permissions and the bot's permissions/role position."
        elif isinstance(original, ValueError):
            message = str(original)
        else:
            LOG.error("Command failed: %s", type(original).__name__)
            message = "The command could not finish. Check the bot console and current case/member state before retrying."
        if interaction.response.is_done():
            await interaction.followup.send(message, ephemeral=True)
        else:
            await interaction.response.send_message(message, ephemeral=True)


class UIUBot(discord.Client):
    def __init__(self, guild_id, records):
        super().__init__(intents=discord.Intents.default(), allowed_mentions=discord.AllowedMentions.none())
        self.guild_id = guild_id
        self.records = records
        self.tree = UIUTree(self)
        self.member_count = None
        self.member_updated_at = None
        self.runner = None
        self.promotion_lock = asyncio.Lock()

    async def setup_hook(self):
        # Restore callbacks for old announcement buttons, including closed operations.
        for row in self.records.db.execute('SELECT id FROM operations'):
            self.add_view(OperationSignup(self, row['id']))
        self.tree.copy_global_to(guild=discord.Object(id=self.guild_id))
        await self.tree.sync(guild=discord.Object(id=self.guild_id))
        port = int(os.getenv("PORT") or os.getenv("SERVER_PORT") or "8080")
        app = web.Application(client_max_size=1024)
        app.router.add_get("/stats", self.stats_route)
        app.router.add_get("/health", self.health_route)
        self.runner = web.AppRunner(app, access_log=None)
        await self.runner.setup()
        await web.TCPSite(self.runner, "0.0.0.0", port).start()
        self.refresh_members.start()
        LOG.info("Stats HTTP server listening on port %s", port)

    async def on_ready(self):
        LOG.info("UIU bot ready. Commands synced to configured server.")

    @tasks.loop(minutes=5)
    async def refresh_members(self):
        try:
            guild = await self.fetch_guild(self.guild_id, with_counts=True)
            if guild.approximate_member_count is not None:
                self.member_count = guild.approximate_member_count
                self.member_updated_at = now()
        except discord.HTTPException as exc:
            LOG.warning("Member count refresh failed (HTTP %s); retaining previous count.", exc.status)

    @refresh_members.before_loop
    async def before_members(self):
        await self.wait_until_ready()

    def stats(self):
        counts = self.records.counts()
        return {"members": self.member_count, "members_approximate": True,
                "members_updated_at": self.member_updated_at,
                "open_cases": counts["open"], "closed_cases": counts["closed"],
                "generated_at": now(), "bot_online": self.is_ready()}

    async def stats_route(self, request):
        # Only aggregate counts are public. No names, case text, IDs or credentials.
        return web.json_response(self.stats(), headers={
            "Access-Control-Allow-Origin": "https://s1nfullxst.github.io",
            "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})

    async def health_route(self, request):
        return web.json_response({"ready": self.is_ready()}, status=200 if self.is_ready() else 503)

    async def announce(self, interaction, key, embed, view=None):
        channel_id = self.records.setting(key)
        if not channel_id or channel_id == '0':
            return 'No announcement channel configured; use /setup channels.'
        try:
            channel = await self.fetch_channel(int(channel_id))
            actor = await interaction.guild.fetch_member(interaction.user.id)
            if (not isinstance(channel, discord.TextChannel) or channel.guild.id != self.guild_id
                    or not channel.permissions_for(actor).view_channel
                    or not channel.permissions_for(actor).send_messages):
                return 'Saved, but you cannot announce in the configured channel.'
            await channel.send(embed=embed, view=view, allowed_mentions=discord.AllowedMentions.none())
            return 'Announcement posted.'
        except discord.HTTPException:
            return 'Saved, but the announcement failed. Check channel permissions; do not repeat the action.'

    async def close(self):
        self.refresh_members.cancel()
        if self.runner:
            await self.runner.cleanup()
        await super().close()


async def staff_check(interaction):
    if not interaction.guild:
        raise app_commands.CheckFailure("Server only")
    member = await interaction.guild.fetch_member(interaction.user.id)
    staff_role_id = int(os.getenv("STAFF_ROLE_ID") or "0")
    if member.guild_permissions.manage_guild or (staff_role_id and any(r.id == staff_role_id for r in member.roles)):
        return True
    raise app_commands.CheckFailure("Manage Server or configured staff role required")


def install_commands(bot):
    cases = app_commands.Group(name="case", description="UIU case records", guild_only=True)

    @cases.command(name="open", description="Open a new case and receive its ID")
    @app_commands.check(staff_check)
    async def case_open(interaction: discord.Interaction,
                        title: app_commands.Range[str, 1, 100],
                        description: app_commands.Range[str, 1, 2000]):
        case_id = bot.records.create(title, description, interaction.user.id)
        await interaction.response.send_message(f"Case #{case_id} opened: {discord.utils.escape_markdown(title)}", ephemeral=True)

    @cases.command(name="close", description="Close a case with a resolution")
    @app_commands.check(staff_check)
    async def case_close(interaction: discord.Interaction, case_id: app_commands.Range[int, 1],
                         resolution: app_commands.Range[str, 1, 1000]):
        bot.records.transition(case_id, "closed", resolution, interaction.user.id)
        await interaction.response.send_message(f"Case #{case_id} closed. Stats updated.", ephemeral=True)

    @cases.command(name="reopen", description="Reopen a closed case")
    @app_commands.check(staff_check)
    async def case_reopen(interaction: discord.Interaction, case_id: app_commands.Range[int, 1],
                          reason: app_commands.Range[str, 1, 1000]):
        bot.records.transition(case_id, "open", reason, interaction.user.id)
        await interaction.response.send_message(f"Case #{case_id} reopened. Stats updated.", ephemeral=True)

    @cases.command(name="view", description="Read a case record privately")
    @app_commands.check(staff_check)
    async def case_view(interaction: discord.Interaction, case_id: app_commands.Range[int, 1]):
        row = bot.records.get(case_id)
        if row is None:
            raise ValueError("That case ID does not exist.")
        embed = discord.Embed(title=f"Case #{row['id']} | {row['title']}", description=row["description"], color=GOLD)
        embed.add_field(name="Status", value=row["status"].upper())
        embed.add_field(name="Opened", value=row["created_at"][:10])
        assignee = bot.records.assignee(case_id)
        embed.add_field(name='Assigned agent', value=f'<@{assignee}>' if assignee else 'Unassigned')
        if row["resolution"]:
            embed.add_field(name="Latest resolution / reopen reason", value=row["resolution"], inline=False)
        await interaction.response.send_message(embed=embed, ephemeral=True)

    @cases.command(name="list", description="List open or closed cases, ten per page")
    @app_commands.choices(status=[app_commands.Choice(name="Open", value="open"), app_commands.Choice(name="Closed", value="closed")])
    @app_commands.check(staff_check)
    async def case_list(interaction: discord.Interaction, status: str = "open", page: app_commands.Range[int, 1, 100000] = 1):
        if status not in ("open", "closed"):
            raise ValueError("Choose open or closed.")
        rows = bot.records.listing(status, page)
        description = "\n".join(f"**#{r['id']}** — {discord.utils.escape_markdown(r['title'])}" for r in rows)
        await interaction.response.send_message(embed=discord.Embed(
            title=f"{status.title()} cases | Page {page}", description=description or "No cases on this page.", color=GOLD), ephemeral=True)

    bot.tree.add_command(cases)

    @cases.command(name='note', description='Add a staff-only case note and optional evidence link')
    @app_commands.check(staff_check)
    async def case_note(interaction: discord.Interaction, case_id: app_commands.Range[int, 1],
                        text: app_commands.Range[str, 1, 1000], evidence_url: app_commands.Range[str, 1, 500] | None = None):
        note_id = bot.records.add_note(case_id, interaction.user.id, text, evidence_url or '')
        await interaction.response.send_message(f'Note #{note_id} saved to case #{case_id}.', ephemeral=True)

    @cases.command(name='notes', description='Read staff-only notes and evidence, three per page')
    @app_commands.check(staff_check)
    async def case_notes(interaction: discord.Interaction, case_id: app_commands.Range[int, 1], page: app_commands.Range[int, 1, 100000] = 1):
        rows = bot.records.notes(case_id, page)
        embed = discord.Embed(title=f'Case #{case_id} | Notes | Page {page}', color=GOLD)
        for row in rows:
            embed.add_field(name=f"Note #{row['id']} | {row['created_at'][:10]}", value=row['body'], inline=False)
            embed.add_field(name='Author', value=f"<@{row['author']}>")
            if row['evidence_url']:
                embed.add_field(name='Evidence link', value=row['evidence_url'], inline=False)
        if not rows:
            embed.description = 'No notes on this page.'
        await interaction.response.send_message(embed=embed, ephemeral=True)

    @bot.tree.command(name='mycases', description='Privately see cases assigned to you')
    @app_commands.guild_only()
    async def mycases(interaction: discord.Interaction, page: app_commands.Range[int, 1, 100000] = 1):
        rows = bot.records.my_cases(interaction.user.id, page)
        text = '\n'.join(f"**#{r['id']}** {discord.utils.escape_markdown(r['title'])} — {r['status'].upper()}" for r in rows)
        await interaction.response.send_message(text or 'No assigned cases on this page.', ephemeral=True)

    @bot.tree.command(name='profile', description='See your agent summary; staff may look up another member')
    @app_commands.guild_only()
    async def profile(interaction: discord.Interaction, member: discord.Member | None = None):
        target = member or interaction.user
        if target.id != interaction.user.id:
            await staff_check(interaction)
        data = bot.records.profile(target.id)
        embed = discord.Embed(title=f'Agent profile | {target.display_name}', color=GOLD)
        embed.add_field(name='Assigned open cases', value=str(data['open']))
        embed.add_field(name='Assigned closed cases', value=str(data['closed']))
        embed.add_field(name='Scheduled operation sign-ups', value=str(data['scheduled_operations']))
        embed.add_field(name='Completed operation sign-ups', value=str(data['completed_operations']))
        embed.add_field(name='Verified completed operations', value=str(data['verified_completed']))
        embed.set_footer(text='Verified attendance is confirmed by staff. Case counts reflect current assignments.')
        await interaction.response.send_message(embed=embed, ephemeral=True)

    @cases.command(name='assign', description='Assign a lead agent to an open case')
    @app_commands.check(staff_check)
    async def case_assign(interaction: discord.Interaction, case_id: app_commands.Range[int, 1], member: discord.Member):
        if member.bot:
            raise ValueError('Choose a human agent.')
        bot.records.assign(case_id, member.id, interaction.user.id)
        await interaction.response.send_message(f'Case #{case_id} assigned to {member.display_name}.', ephemeral=True)

    @cases.command(name='unassign', description='Remove the lead agent from an open case')
    @app_commands.check(staff_check)
    async def case_unassign(interaction: discord.Interaction, case_id: app_commands.Range[int, 1]):
        bot.records.assign(case_id, None, interaction.user.id)
        await interaction.response.send_message(f'Case #{case_id} is now unassigned.', ephemeral=True)

    setup = app_commands.Group(name='setup', description='Configure UIU announcement channels', guild_only=True,
                              default_permissions=discord.Permissions(manage_guild=True))

    @setup.command(name='channels', description='Set promotion and operation announcement channels')
    @app_commands.checks.has_permissions(manage_guild=True)
    async def setup_channels(interaction: discord.Interaction, promotions: discord.TextChannel, operations: discord.TextChannel):
        for channel in (promotions, operations):
            perms = channel.permissions_for(interaction.guild.me)
            if channel.guild.id != bot.guild_id or not (perms.view_channel and perms.send_messages and perms.embed_links):
                raise ValueError('The bot needs View Channel, Send Messages and Embed Links in both channels.')
        bot.records.setting('promotion_channel', promotions.id)
        bot.records.setting('operation_channel', operations.id)
        await interaction.response.send_message('Announcement channels saved. Promotions and operation changes will be posted there without pings.', ephemeral=True)

    bot.tree.add_command(setup)
    operations = app_commands.Group(name='operation', description='Schedule and manage UIU operations', guild_only=True)

    def operation_embed(row):
        date = datetime.fromisoformat(row['starts_at'])
        embed = discord.Embed(title=f"Operation #{row['id']} | {row['title']}", description=row['briefing'], color=GOLD)
        embed.add_field(name='Game', value=row['game'])
        embed.add_field(name='Status', value=row['status'].upper())
        embed.add_field(name='Start time', value=discord.utils.format_dt(date, 'F'), inline=False)
        return embed

    @operations.command(name='schedule', description='Schedule an operation and post its briefing')
    @app_commands.choices(game=[app_commands.Choice(name=g, value=g) for g in ('ERLC', 'BRM5', 'Both')])
    @app_commands.describe(starts_at='Date and UTC offset, e.g. 2026-10-20T19:00+02:00')
    @app_commands.check(staff_check)
    async def operation_schedule(interaction: discord.Interaction, title: app_commands.Range[str, 1, 100],
                                 game: str, starts_at: str, briefing: app_commands.Range[str, 1, 2000]):
        await interaction.response.defer(ephemeral=True)
        operation_id = bot.records.schedule(title, briefing, game, starts_at, interaction.user.id)
        result = await bot.announce(interaction, 'operation_channel', operation_embed(bot.records.operation(operation_id)), OperationSignup(bot, operation_id))
        await interaction.followup.send(f'Operation #{operation_id} scheduled. {result}', ephemeral=True)

    @operations.command(name='view', description='Read an operation briefing')
    async def operation_view(interaction: discord.Interaction, operation_id: app_commands.Range[int, 1]):
        row = bot.records.operation(operation_id)
        if row is None:
            raise ValueError('That operation ID does not exist.')
        view = OperationSignup(bot, operation_id) if row['status'] == 'scheduled' else None
        await interaction.response.send_message(embed=operation_embed(row), view=view, ephemeral=True)

    @operations.command(name='roster', description='Staff: view operation sign-ups, twenty per page')
    @app_commands.check(staff_check)
    async def operation_roster(interaction: discord.Interaction, operation_id: app_commands.Range[int, 1], page: app_commands.Range[int, 1, 100000] = 1):
        if bot.records.operation(operation_id) is None:
            raise ValueError('That operation ID does not exist.')
        rows = bot.records.db.execute('SELECT member_id FROM signups WHERE operation_id=? ORDER BY joined_at LIMIT 20 OFFSET ?', (operation_id, (page-1)*20)).fetchall()
        text = '\n'.join(f"<@{r['member_id']}>" for r in rows)
        await interaction.response.send_message(f'**Operation #{operation_id} roster | Page {page}**\n' + (text or 'No sign-ups on this page.'), ephemeral=True)

    @operations.command(name='list', description='List scheduled operations, ten per page')
    async def operation_list(interaction: discord.Interaction, page: app_commands.Range[int, 1, 100000] = 1):
        rows = bot.records.db.execute("SELECT * FROM operations WHERE status='scheduled' ORDER BY starts_at LIMIT 10 OFFSET ?", ((page-1)*10,)).fetchall()
        text = '\n'.join(f"**#{r['id']}** {discord.utils.escape_markdown(r['title'])} | <t:{int(datetime.fromisoformat(r['starts_at']).timestamp())}:f>" for r in rows)
        await interaction.response.send_message(text or 'No scheduled operations on this page.', ephemeral=True)

    async def finish_operation(interaction, operation_id, status):
        await interaction.response.defer(ephemeral=True)
        bot.records.operation_status(operation_id, status, interaction.user.id)
        result = await bot.announce(interaction, 'operation_channel', operation_embed(bot.records.operation(operation_id)))
        await interaction.followup.send(f'Operation #{operation_id} {status}. {result}', ephemeral=True)

    @operations.command(name='cancel', description='Cancel a scheduled operation and announce it')
    @app_commands.check(staff_check)
    async def operation_cancel(interaction: discord.Interaction, operation_id: app_commands.Range[int, 1]):
        await finish_operation(interaction, operation_id, 'cancelled')

    @operations.command(name='complete', description='Mark an operation completed and announce it')
    @app_commands.check(staff_check)
    async def operation_complete(interaction: discord.Interaction, operation_id: app_commands.Range[int, 1]):
        await finish_operation(interaction, operation_id, 'completed')

    bot.tree.add_command(operations)

    @operations.command(name='attendance', description='Staff: confirm or correct a member attendance record')
    @app_commands.check(staff_check)
    async def operation_attendance(interaction: discord.Interaction, operation_id: app_commands.Range[int, 1], member: discord.Member, present: bool):
        if member.bot:
            raise ValueError('Choose a human member.')
        bot.records.mark_attendance(operation_id, member.id, present, interaction.user.id)
        await interaction.response.send_message(f'Attendance saved for {member.display_name}: {"present" if present else "absent"}. Verified profile credit applies when the operation is completed.', ephemeral=True)

    @operations.command(name='attendance_list', description='Staff: view recorded attendance, twenty members per page')
    @app_commands.check(staff_check)
    async def attendance_list(interaction: discord.Interaction, operation_id: app_commands.Range[int, 1], page: app_commands.Range[int, 1, 100000] = 1):
        if bot.records.operation(operation_id) is None:
            raise ValueError('That operation ID does not exist.')
        rows = bot.records.db.execute('SELECT * FROM attendance WHERE operation_id=? ORDER BY member_id LIMIT 20 OFFSET ?', (operation_id, (page-1)*20)).fetchall()
        lines = '\n'.join(f"<@{r['member_id']}> — {'Present' if r['present'] else 'Absent'}" for r in rows)
        await interaction.response.send_message(f'**Operation #{operation_id} attendance | Page {page}**\n' + (lines or 'No recorded attendance on this page. Unrecorded members are not automatically absent.'), ephemeral=True)

    @bot.tree.command(name='backup', description='Manage Server only: privately download a database backup')
    @app_commands.guild_only()
    @app_commands.default_permissions(manage_guild=True)
    @app_commands.checks.has_permissions(manage_guild=True)
    @app_commands.checks.cooldown(1, 60, key=lambda i: i.guild_id)
    async def backup(interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        with bot.records.db:
            bot.records.audit(interaction.user.id, 'backup.export', 'Database snapshot requested')
        payload = bot.records.backup_bytes()
        if len(payload) > interaction.guild.filesize_limit:
            await interaction.followup.send('Backup exceeds the server attachment limit. Stop the bot and download data/uiu.sqlite3 through the hosting Files tab instead.', ephemeral=True)
            return
        filename = 'uiu-backup-' + datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S') + '.sqlite3'
        await interaction.followup.send('Download this backup now and keep it private: it includes case notes, evidence links and member records. It contains no bot token. Restore only while the bot is stopped.',
            file=discord.File(io.BytesIO(payload), filename=filename), ephemeral=True)

    @bot.tree.command(name="promotion", description="Give a member a rank; optionally remove their previous rank")
    @app_commands.guild_only()
    @app_commands.default_permissions(manage_roles=True)
    @app_commands.describe(member="Member being promoted", new_rank="Rank role to give", previous_rank="Optional old rank to remove", reason="Reason for promotion")
    async def promotion(interaction: discord.Interaction, member: discord.Member, new_rank: discord.Role,
                        reason: app_commands.Range[str, 1, 500], previous_rank: discord.Role | None = None):
        await interaction.response.defer(ephemeral=True)
        async with bot.promotion_lock:
            guild = interaction.guild
            actor = await guild.fetch_member(interaction.user.id)
            target = await guild.fetch_member(member.id)
            me = await guild.fetch_member(bot.user.id)
            if not actor.guild_permissions.manage_roles or not me.guild_permissions.manage_roles:
                raise app_commands.CheckFailure("Manage Roles required")
            roles = {r.id: r for r in await guild.fetch_roles()}
            role = roles.get(new_rank.id)
            previous = roles.get(previous_rank.id) if previous_rank else None
            if role is None or (previous_rank and previous is None):
                raise ValueError("A selected rank no longer exists.")
            problem = promotion_problem(actor, target, role, previous, me, guild.owner_id)
            if problem:
                raise ValueError(problem)
            audit_reason = f"UIU promotion by {actor.id}: {reason}"[:512]
            await target.add_roles(role, reason=audit_reason)
            if previous:
                try:
                    await target.remove_roles(previous, reason=audit_reason)
                except discord.HTTPException:
                    with bot.records.db:
                        bot.records.audit(actor.id, "promotion.partial", json.dumps({"member": target.id, "added": role.id, "old_role_not_removed": previous.id}))
                    await interaction.followup.send("New rank added, but the previous rank could not be removed. Both roles may still be present; ask an administrator to check.", ephemeral=True)
                    return
            with bot.records.db:
                bot.records.audit(actor.id, "promotion", json.dumps({"member": target.id, "rank": role.id, "previous": previous.id if previous else None, "reason": reason}))
        embed = discord.Embed(title="FBI UIU | Promotion", description=f"**{discord.utils.escape_markdown(target.display_name)}** has been promoted to **{discord.utils.escape_markdown(role.name)}**.", color=GOLD)
        embed.add_field(name="Reason", value=reason, inline=False)
        embed.set_footer(text=f"Approved by {actor.display_name}")
        result = await bot.announce(interaction, 'promotion_channel', embed)
        await interaction.followup.send(result, ephemeral=True)
        await interaction.followup.send(embed=embed, ephemeral=True)

    @bot.tree.command(name="stats", description="See UIU member and case counts")
    @app_commands.guild_only()
    async def stats(interaction: discord.Interaction):
        data = bot.stats()
        embed = discord.Embed(title="FBI UIU | Statistics", color=GOLD)
        embed.add_field(name="Members (approx.)", value=str(data["members"]) if data["members"] is not None else "Updating")
        embed.add_field(name="Open cases", value=str(data["open_cases"]))
        embed.add_field(name="Closed cases", value=str(data["closed_cases"]))
        embed.set_footer(text="Member count includes bots. Cases tracked by this bot only.")
        await interaction.response.send_message(embed=embed, ephemeral=True)

    @bot.tree.command(name="help", description="Show UIU bot commands")
    @app_commands.guild_only()
    async def help_command(interaction: discord.Interaction):
        await interaction.response.send_message(
            "**FBI UIU commands**\n`/promotion` — give a rank and optionally remove the old rank\n"
            "`/case open` — create a case\n`/case close` — close with a resolution\n"
            "`/case reopen` — reopen a case\n`/case view` — read a case\n"
            "`/case list` — browse cases\n`/stats` — community counts\n\n"
            "`/case assign` / `/case unassign` — manage case agents\n"
            "`/operation schedule` / `list` / `view` / `cancel` / `complete` — operation planning\n"
            "`/setup channels` — choose announcement channels (Manage Server required)\n\n"
            "`/case note` / `/case notes` — staff-only notes and evidence links\n"
            "`/mycases` / `/profile` — your assignments and agent summary\n"
            "Operation Join/Leave buttons manage your sign-up. `/operation roster` is staff-only.\n\n"
            "`/operation attendance` / `attendance_list` — staff-confirmed attendance\n"
            "`/backup` — private database download (Manage Server required)\n\n"
            "Cases and operation changes require Manage Server or the configured staff role. Promotions require Manage Roles. "
            "Promotion and operation announcements go to the configured channels; case details stay private.", ephemeral=True)


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    token = os.getenv("DISCORD_TOKEN", "").strip()
    guild_id = os.getenv("GUILD_ID", "").strip()
    if not token or not guild_id.isdigit() or int(guild_id) <= 0:
        raise SystemExit("Set DISCORD_TOKEN and GUILD_ID in the hosting Environment settings, then restart.")
    data_dir = Path(os.getenv("DATA_DIR") or Path(__file__).resolve().parent / "data")
    records = Records(data_dir / "uiu.sqlite3")
    records.seed_archives()
    bot = UIUBot(int(guild_id), records)
    install_commands(bot)
    try:
        bot.run(token, log_level=logging.INFO)
    finally:
        records.db.close()


if __name__ == "__main__":
    main()
