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

- `/promotion member new_rank reason [previous_rank]`: gives the new role and optionally removes the previous role. Requires Manage Roles, respects both the invoker's and bot's role hierarchy, and blocks self-promotion. The confirmation embed is private; no public announcement is sent.
- `/case open title description`: creates a case and returns its numeric ID.
- `/case close case_id resolution`: closes that case.
- `/case reopen case_id reason`: reopens it without erasing the audit history.
- `/case view case_id`: reads a case privately.
- `/case list status page`: lists ten cases at a time.
- `/stats`: displays member and case counts.
- `/help`: lists commands and permissions.

Cases require Manage Server or STAFF_ROLE_ID. Cases start empty: existing website PDF archives are not automatically imported or assigned open/closed status. Create records for those cases if they should count.

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
