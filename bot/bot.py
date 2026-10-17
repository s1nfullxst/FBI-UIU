"""FBI UIU community bot. Python 3.11+. Secrets belong in hosting variables."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import discord
from discord import app_commands
from discord.ext import tasks
from aiohttp import web

LOG = logging.getLogger("uiu")
GOLD = 0xC6AC72


def now():
    return datetime.now(timezone.utc).isoformat()


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
            "Cases require Manage Server or the configured staff role. Promotions require Manage Roles. Responses are private to you.", ephemeral=True)


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    token = os.getenv("DISCORD_TOKEN", "").strip()
    guild_id = os.getenv("GUILD_ID", "").strip()
    if not token or not guild_id.isdigit() or int(guild_id) <= 0:
        raise SystemExit("Set DISCORD_TOKEN and GUILD_ID in the hosting Environment settings, then restart.")
    data_dir = Path(os.getenv("DATA_DIR") or Path(__file__).resolve().parent / "data")
    records = Records(data_dir / "uiu.sqlite3")
    bot = UIUBot(int(guild_id), records)
    install_commands(bot)
    try:
        bot.run(token, log_level=logging.INFO)
    finally:
        records.db.close()


if __name__ == "__main__":
    main()
