# FBI UIU Discord bot

Python 3.11 or newer. All bot logic is in `bot.py`.

## Hosting setup

1. Upload `bot.py` and `requirements.txt` into the deployment's root Files folder.
2. In Startup choose Python and set Entry File / STARTUP_FILE to `bot.py`.
3. Add Environment variables:
   - `DISCORD_TOKEN`: your bot token, entered privately in the host.
   - `GUILD_ID`: FBI UIU Discord server ID.
   - `STAFF_ROLE_ID`: optional role ID allowed to use case commands. Without this, Manage Server is required.
   - `PORT`: HTTP listening port configured for the hosting service (default 8080; SERVER_PORT is also supported).
   - `DATA_DIR`: optional persistent data folder; defaults to `data` beside bot.py.
4. Create a Discord application at https://discord.com/developers/applications and use its Bot token. Install it into your server with the `bot` and `applications.commands` scopes. Give it View Channels, Send Messages, Embed Links and Manage Roles. Administrator permission is not needed.
5. Put the bot's role above the ranks it should assign and above the members it should manage. Privileged member and message content intents are not required.
6. Start it. Requirements are installed from requirements.txt. Commands are synced to GUILD_ID.

Never paste tokens into bot.py, screenshots, chat or GitHub.

## Commands

- `/promotion member new_rank reason [previous_rank]`: gives the new role and optionally removes the previous role. Requires Manage Roles, respects both the invoker's and bot's role hierarchy, and blocks self-promotion. Posts a promotion announcement in the configured channel and privately confirms the result.
- `/case open title description`: creates a case and returns its numeric ID.
- `/case close case_id resolution`: closes that case.
- `/case reopen case_id reason`: reopens it without erasing the audit history.
- `/case view case_id`: reads a case privately.
- `/case list status page`: lists ten cases at a time.
- `/stats`: displays member and case counts.
- `/help`: lists commands and permissions.

Cases require Manage Server or STAFF_ROLE_ID. On the first start of this update, Missouri UIU File #3 and Wyoming UIU File #1 are imported as CLOSED, as confirmed by management. These are short records linking to the existing website reports, not copies of all PDF text. Recognized existing records are preserved, including their current statuses; no case is reset on later restarts. Database IDs are assigned automatically and may differ from the original PDF file numbers. Use `/case list status:closed` to find them.

## New commands

- `/setup channels promotions:#promotions operations:#operations`: choose where announcements go. Requires Manage Server. The bot needs View Channel, Send Messages and Embed Links in both channels. The person making an announcement also needs access and Send Messages in that channel. No mass pings are sent.
- `/case assign case_id member`: assign one lead agent to an open case (replaces the previous assignment).
- `/case unassign case_id`: remove the lead agent. `/case view` shows the assignment. Closed cases retain their assignment history and must be reopened before reassignment.
- `/operation schedule title game starts_at briefing`: create and announce an operation. Example time: `2026-10-20T19:00+02:00`. Use the actual UTC offset for the event date. Discord displays the saved time in each viewer's timezone.
- `/operation list [page]` and `/operation view operation_id`: let members view scheduled operations and briefings.
- `/operation cancel operation_id` and `/operation complete operation_id`: update and announce a scheduled operation's status. These actions require staff permissions, as does scheduling.

Operations persist in SQLite and have numeric IDs. Scheduling posts a briefing now; it does not send timed reminders or create a Discord Scheduled Event. If an announcement fails, the operation/promotion remains saved and the bot reports the failure. Do not repeat a promotion to retry an announcement.

## Updating an existing deployment

### Attendance and backups

- `/operation attendance operation_id member present`: staff record or correct attendance after the scheduled start. `present:True` means attended; `False` means absent. Members do not need to have signed up. Cancelled operations cannot receive attendance records.
- `/operation attendance_list operation_id [page]`: private staff view of confirmed records. Members with no record are unconfirmed, not automatically absent.
- `/profile` shows **Verified completed operations**, counting each operation once only when staff mark the member present AND the operation is completed. Correcting attendance updates this count. Sign-up totals remain separately labelled.
- `/backup`: requires Manage Server, even if STAFF_ROLE_ID is configured. Privately sends a consistent SQLite snapshot containing cases, notes, assignments, operations, sign-ups, attendance, channel settings and audit history. It does not contain environment variables or the Discord token. Keep this file private and download it before the attachment expires. Limited to one request per minute per server.
- To restore: stop the hosted bot, keep a copy of its current database, upload the backup as `data/uiu.sqlite3` (or your configured DATA_DIR), then restart. Do not restore into a running bot. If the database exceeds Discord's attachment limit, download it from the host while stopped.

Website sync code is ready in the site root: `stats.js` reads `stats-config.json`. Set its `endpoint` to the host's public HTTPS `/stats` address. No token belongs in either file. It refreshes every minute, checks freshness and shows unavailable/stale labels on failures. Until a URL is configured, the website shows only a dated snapshot of the two confirmed closed archive cases. This does not claim to count new cases created in the running bot. Public HTTPS hosting configuration and an end-to-end connection check are still required.

### Case notes, sign-ups and agent summaries

- `/case note case_id text [evidence_url]`: staff can add a note and an optional HTTPS evidence link to an open case. Links are stored, not fetched or downloaded. Keep the linked file's sharing permissions appropriate; this bot does not manage external file access.
- `/case notes case_id [page]`: staff-only, private response with three notes per page. Notes retain their author and creation time and survive restarts.
- Operation announcements now have **Join operation** and **Leave operation** buttons. Members can only change their own sign-up. Duplicate joins are ignored. Sign-ups lock when the scheduled start time arrives, or when the operation is completed/cancelled. Restarting restores the announcement buttons.
- For an operation posted before this update, use `/operation view operation_id` to get a fresh briefing with buttons. Private briefing buttons expire after Discord's standard timeout; run the command again if needed. Public announcement buttons persist through bot restarts.
- `/operation roster operation_id [page]`: staff-only, private roster, twenty members per page.
- `/mycases [page]`: any member can privately see the IDs, titles and statuses of cases currently assigned to them. This grants no access to staff-only notes, evidence or other agents' cases.
- `/profile [member]`: your own private summary of assigned open/closed cases and operation sign-ups. Only staff can inspect another member's profile. Completed operation counts mean sign-ups for completed operations, not verified attendance. Cancelled operations are excluded.

These features use additional tables in the existing SQLite file. They require no new packages or privileged Discord intents. Case notes, evidence links, agent summaries and sign-up rosters are never exposed by the public `/stats` endpoint.

Stop the bot and back up `data/uiu.sqlite3`. Replace only `bot.py`, retain your Environment settings and data folder, then restart. Dependencies are unchanged. New tables are created alongside existing records. Run `/setup channels` once after restarting.

## Website connection

Enable a public HTTPS address in the hosting panel routed to the HTTP port. The bot serves `/stats` with member/open/closed counts, update timestamps and connection status. Member counts are approximate, include bots, and refresh every five minutes. The website archive count remains separate.

Only aggregate statistics are publicly exposed; there is no public endpoint for changing cases or reading case text. CORS allows https://s1nfullxst.github.io. `/health` returns 200 when Discord is ready and 503 otherwise.

The website still needs the deployment's public HTTPS URL configured before it can read this feed. Do not put the Discord token in website JavaScript.

## Keeping records

Cases and promotion audit history are stored in `data/uiu.sqlite3`. They survive normal restarts when the host retains that folder. Do not delete or overwrite it when uploading code. Stop the bot before downloading a backup copy, then restart it. Losing/deleting the deployment without a backup loses its records.

## Troubleshooting

- Missing token or server ID: add the hosting variables, then restart.
- Commands absent: confirm the bot was installed in GUILD_ID with applications.commands.
- Promotion denied: check Manage Roles and both role hierarchies.
- Old rank removal fails: the bot reports that the new rank was added but the old one remains; an administrator should review those roles.
- Website stats unavailable: verify the public HTTPS route points to the correct PORT, then open `/stats` in a browser.

Hosting reference: https://bot-hosting.net/docs/guides/set-up-a-deployment
Discord library reference: https://discordpy.readthedocs.io/en/stable/

## Website operations dashboard
The public /stats response now includes up to 12 future scheduled operations (ID, title, game and start time), the total completed operations, and confirmed participations in completed operations. Titles and schedules are public; briefings, member IDs, staff notes and evidence remain private. The website polls every minute and displays times in the visitor's timezone. Cancelled and past-start sessions are excluded from the upcoming list.

To enable this on the running host, replace bot.py with the updated version and restart. Keep data/uiu.sqlite3 and environment variables. No new dependencies or settings are needed.

