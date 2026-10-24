# FBI UIU Discord bot

Python 3.11 or newer. All bot logic is in `bot.py`.

## Hosting setup

1. Upload `bot.py` and `requirements.txt` into the deployment's root Files folder.
2. In Startup choose Python and set Entry File / STARTUP_FILE to `bot.py`.
3. Add Environment variables:
   - `DISCORD_TOKEN`: your bot token, entered privately in the host.
   - `GUILD_ID`: FBI UIU Discord server ID.
   - `STAFF_ROLE_ID`: optional role ID allowed to use case commands. Case Managers also have case access.
   - `PORT`: HTTP listening port configured for the hosting service (default 8080; SERVER_PORT is also supported).
   - `DATA_DIR`: optional persistent data folder; defaults to `data` beside bot.py.
4. Create a Discord application at https://discord.com/developers/applications and use its Bot token. Install it into your server with the `bot` and `applications.commands` scopes. Give it View Channels, Send Messages, Embed Links and Manage Roles. Administrator permission is not needed.
5. Put the bot's role above the ranks it should assign and above the members it should manage. Enable Server Members Intent in the Discord Developer Portal before starting this version. Message Content Intent is not needed.
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

Cases require the Case Manager role, Manage Server or STAFF_ROLE_ID. On the first start of this update, Missouri UIU File #3 and Wyoming UIU File #1 are imported as CLOSED, as confirmed by management. These are short records linking to the existing website reports, not copies of all PDF text. Recognized existing records are preserved, including their current statuses; no case is reset on later restarts. Database IDs are assigned automatically and may differ from the original PDF file numbers. Use `/case list status:closed` to find them.

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

These features use additional tables in the existing SQLite file. They require no new packages. Case notes, evidence links, agent summaries and sign-up rosters are never exposed by the public `/stats` endpoint.

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


## Privacy requests (18 October 2026 update)

Replace bot.py and restart; no new dependencies or environment variables. Existing data is preserved on startup. No deletion is performed by installing this update.

- `/privacy policy`: private links to terms/privacy and contact instructions.
- `/privacy request`: saves the caller's deletion request once, surviving restart. Members should also contact the operator privately. This queues a request; it does not erase data or send staff notifications.
- `/privacy requests [page]`: Manage Server only; ten pending requests per page.
- `/privacy erase user_id confirmation`: Manage Server only. Verify the requester first. Enter the numeric Discord user ID (works for departed members), with confirmation `DELETE <same ID>`. This permanently removes sign-ups, attendance, assignments, authored notes, authors' case/operation text, identifying audit entries and exact ID references from the active database. Case/operation IDs and statuses remain; other users' unrelated data is retained. SQLite secure_delete and VACUUM reduce deleted remnants in the active database file. They cannot erase host snapshots.

Operator procedure:
1. Check `/privacy requests` regularly, verify account ownership privately, and discuss scope. Do not request passwords, tokens or identity documents.
2. Review names/aliases in other people's free text and the public website separately. The command matches exact IDs, not names. Export/access requests need a manual review to avoid disclosing other users' records.
3. Execute `/privacy erase` only for the verified request. It also removes the queue entry. Complete the remaining review before telling the requester deletion is complete.
4. Remove/restrict relevant Discord announcements, attachments and downloaded database exports. Ask hosting support how to remove or expire snapshots containing the erased data. The bot cannot control provider backups or other people's downloads.
5. Do not restore a pre-deletion backup into service unchanged. Reapply the verified deletion and manual redactions before restarting it. Keep any necessary temporary tracking of unfinished external-copy work private and remove it when finished.
6. For access/correction/export requests or users who cannot access the server, use the private operator contact route in the policy.

### Encryption status: not verification-ready on this evidence alone

Bot-Hosting's official backup article confirms encrypted off-server backups: https://bot-hosting.net/blog/how-safe-is-your-data-with-bot-hosting . It does not confirm encryption of the live volume. The bot's SQLite database and /backup exports are not encrypted by this code.

Ask hosting support: "Does the live filesystem/volume storing my deployment's data/uiu.sqlite3 use encryption at rest, including temporary storage and snapshots? I need confirmation for Discord Developer Terms section 5(c), not just HTTPS or off-server backup encryption. What encryption/key management applies, and how can I remove personal data from retained backups?"

Until this is answered, do not claim full encryption-at-rest compliance. Protect or encrypt downloaded exports separately. Published policy URLs and these commands do not themselves constitute Discord verification or legal certification.

## Agent dossiers, training and commendations

Replace bot.py with the latest code, save and restart. No new requirements or environment variables. New tables are added without resetting existing records.

- `/dossier view [member]` or `/profile [member]`: private dossier showing department, callsign, highest Discord role, existing case/operation counts, and active qualifications/commendations. Members can see themselves; viewing others requires Manage Server or STAFF_ROLE_ID.
- `/dossier set member department callsign`: staff set the two dossier fields. This does not change Discord roles. The highest role shown is read from Discord and is not necessarily a server's designated rank.
- `/training award member title reason`: staff record a completed qualification, for example Pilot or Field Investigator.
- `/training list [member] [page]`: active and revoked records, four per page.
- `/training revoke record_id reason`: staff invalidate a qualification without erasing its history.
- `/commendation award member title reason`, `/commendation list [member] [page]`, `/commendation revoke record_id reason`: same workflow for medals and recognition.

Staff cannot award themselves or bot accounts. Active titles are unique per member and type, ignoring capitalization and repeated spaces; repeated submissions do not create duplicates. A revoked title may be awarded again. Records are private, persist across restarts, are included in database backups, and are covered by `/privacy erase`. No role rewards or public announcements are sent by these commands.

## Public website announcements and new member guide

- `/announcement publish title message`: staff explicitly publish text to everyone on the website. Titles are 1-100 characters and messages 1-1200. Do not include private information. Duplicate title/message submissions return the existing ID.
- `/announcement list [page]`: staff list saved IDs, ten per page.
- `/announcement remove announcement_id`: staff remove a post. Viewers see the change on the next successful refresh; external copies cannot be recalled.

All commands require Manage Server or STAFF_ROLE_ID. Publishing does not send a Discord announcement or ping. The public /stats feed includes only the latest five announcements, without publisher IDs. Records persist across restarts and are included in backups. Privacy erasure removes posts authored by the subject and exact ID references in other posts; manually review names and external copies.

The website includes an Updates section and a Start here guide. It polls once a minute, distinguishes an empty feed from unavailable data, and marks cached announcements as stale after a connection failure. Install this bot.py update and restart to enable the new feed; no new settings or dependencies.

## Member counting and Case Managers (24 October 2026)

Enable Server Members Intent under your application's Bot settings in the Discord Developer Portal. Verified applications may need Discord approval. Replace bot.py in Wispbyte, keep the data folder and environment settings, and restart. The existing dependencies are unchanged.

CASE_MANAGER_ROLE_ID defaults to 1562783587198042272. This role grants only /case commands, not other staff commands. The public website lists human role holders by display name only. Every five minutes a complete member list is fetched: people plus this bot are counted, all other bots excluded. Failed fetches publish unavailable values instead of partial counts. The website refreshes every minute.
