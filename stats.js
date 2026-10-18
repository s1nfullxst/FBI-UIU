(() => {
  const footer = document.querySelector('footer');
  if (!footer) return;
  const links = document.createElement('nav');
  links.setAttribute('aria-label', 'Bot policies');
  links.style.cssText = 'display:flex;gap:20px;flex-wrap:wrap;padding:12px 0;font-size:13px';
  for (const [title, href] of [['Terms of Service', './terms.html'], ['Privacy Policy', './privacy.html']]) {
    const link = document.createElement('a'); link.href = href; link.textContent = title; links.append(link);
  }
  footer.append(links);
})();
/* Public website enhancements. No private case or member records are requested. */
(() => {
  'use strict';
  const ops = document.getElementById('operations');
  if (!ops) return;
  const style = document.createElement('style');
  style.textContent = `
    .live-panel{margin:30px 0;padding:28px;border:1px solid var(--line);border-top:3px solid var(--gold);background:var(--panel)}
    .live-heading{display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap}.live-heading h3{margin:0;font:30px Georgia,serif}
    .connection-pill{border:1px solid var(--line);padding:9px 12px;font:12px monospace;color:var(--muted)}.connection-pill[data-state=online]{color:#a1d5b2;border-color:#609876}
    .activity-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:26px 0}.activity-grid div{border-left:2px solid var(--gold);padding:8px 16px}.activity-grid dt{font:11px monospace;color:var(--muted)}.activity-grid dd{margin:12px 0 0;font-size:30px}
    .live-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.live-item{border:1px solid var(--line);padding:22px;min-width:0}.live-item h4{font:24px Georgia,serif;margin:12px 0;overflow-wrap:anywhere}.live-item p{font-size:13px}.live-item time{color:var(--gold)}
    .archive-tools{display:flex;align-items:end;gap:14px;flex-wrap:wrap;margin:22px 0}.archive-tools label{display:flex;flex-direction:column;gap:8px;font:12px monospace;color:var(--gold)}.archive-tools input,.archive-tools select,.live-select{background:#101c2c;color:var(--ink);border:1px solid var(--line);padding:12px;font:14px Arial,sans-serif;max-width:100%}.archive-tools input{width:280px}.archive-tools button{padding:12px;cursor:pointer;background:transparent;color:var(--gold);border:1px solid var(--line)}
    .archive-tools :focus-visible,.live-select:focus-visible{outline:2px solid var(--gold);outline-offset:3px}.public-case[hidden],.live-item[hidden]{display:none!important}.archive-badge{font:11px monospace;color:#a1d5b2;border:1px solid #609876;padding:6px 9px}.dashboard-note{font-size:12px;color:var(--muted)}
    @media(max-width:600px){.live-panel{padding:18px}.activity-grid{grid-template-columns:1fr}.live-list{grid-template-columns:1fr}.archive-tools label{width:100%}.archive-tools input{width:100%;box-sizing:border-box}}
  `;
  document.head.append(style);
  const panel = document.createElement('div');
  panel.className = 'live-panel';
  panel.innerHTML = `<div class="live-heading"><h3>Live operations</h3><span class="connection-pill" id="bot-connection" role="status">Checking connection</span></div>
    <dl class="activity-grid"><div><dt>UPCOMING SESSIONS</dt><dd id="activity-upcoming">—</dd></div><div><dt>COMPLETED OPERATIONS</dt><dd id="activity-completed">—</dd></div><div><dt>VERIFIED ATTENDANCES</dt><dd id="activity-attendance">—</dd></div></dl>
    <p class="dashboard-note">Attendance counts confirmed participations in completed operations, not unique members.</p>
    <label for="live-game" class="mono">GAME </label><select class="live-select" id="live-game"><option value="all">All games</option><option value="ERLC">ERLC</option><option value="BRM5">BRM5</option></select>
    <p id="live-state" class="dashboard-note" role="status">Waiting for the operation schedule.</p><div class="live-list" id="live-list"></div>
    <p class="dashboard-note">Times are shown in your local timezone. Join sessions using the bot’s Join button in Discord. Showing up to 12 upcoming sessions.</p>`;
  ops.querySelector('.section-head').after(panel);
  const badge = document.getElementById('bot-connection');
  const state = document.getElementById('live-state');
  const list = document.getElementById('live-list');
  const game = document.getElementById('live-game');
  let rows = null, lastUpdate = null, connected = false;
  function render() {
    if (!rows) return;
    list.replaceChildren();
    const visible = rows.filter(row => game.value === 'all' || row.game === game.value || row.game === 'Both');
    for (const row of visible) {
      const card = document.createElement('article'); card.className = 'live-item';
      const tag = document.createElement('span'); tag.className = 'mono'; tag.textContent = row.game + ' / SCHEDULED';
      const title = document.createElement('h4'); title.textContent = row.title;
      const time = document.createElement('time'); time.dateTime = row.starts_at;
      time.textContent = new Date(row.starts_at).toLocaleString(undefined, {dateStyle:'medium',timeStyle:'short'});
      const hint = document.createElement('p'); hint.textContent = 'Operation #' + row.id + ' · Check Discord for the briefing and sign-up.';
      card.append(tag,title,time,hint); list.append(card);
    }
    state.textContent = connected
      ? (visible.length ? visible.length + ' upcoming session' + (visible.length === 1 ? '' : 's') + ' · Updated ' + lastUpdate.toLocaleTimeString() : 'No upcoming sessions for this game.')
      : 'Connection unavailable. Showing the last schedule from ' + lastUpdate.toLocaleTimeString() + '.';
  }
  game.addEventListener('change', render);
  document.addEventListener('uiu-stats', event => {
    connected = true;
    badge.textContent = 'Bot online'; badge.dataset.state = 'online';
    const activity = event.detail.activity;
    const count = n => Number.isSafeInteger(n) && n >= 0;
    if (!activity || !count(activity.completed_operations) || !count(activity.verified_attendances) ||
        !Array.isArray(activity.upcoming_operations) || activity.upcoming_operations.length > 12 ||
        !activity.upcoming_operations.every(r => r && count(r.id) && typeof r.title === 'string' && r.title.length <= 100 && ['ERLC','BRM5','Both'].includes(r.game) && Number.isFinite(Date.parse(r.starts_at)))) {
      state.textContent = 'The live schedule is not available yet. Check Discord for confirmed sessions.';
      rows = null; list.replaceChildren();
      ['upcoming','completed','attendance'].forEach(id => document.getElementById('activity-' + id).textContent = '—');
      return;
    }
    rows = activity.upcoming_operations; lastUpdate = new Date();
    document.getElementById('activity-upcoming').textContent = rows.length === 12 ? '12+' : rows.length;
    document.getElementById('activity-completed').textContent = activity.completed_operations.toLocaleString();
    document.getElementById('activity-attendance').textContent = activity.verified_attendances.toLocaleString();
    render();
  });
  document.addEventListener('uiu-unavailable', () => {
    connected = false; badge.textContent = 'Connection unavailable'; badge.dataset.state = 'unavailable';
    if (rows) render(); else state.textContent = 'Schedule unavailable. Check Discord for confirmed sessions.';
  });

  // The existing public reports are independently searchable; private bot cases stay in Discord.
  const archive = document.getElementById('case-files');
  const files = archive ? Array.from(archive.querySelectorAll('.public-case')) : [];
  if (files.length) {
    const tools = document.createElement('div'); tools.className = 'archive-tools';
    tools.innerHTML = `<label>SEARCH ARCHIVE<input id="archive-search" type="search" placeholder="Location, name or keyword…"></label><label>STATUS<select id="archive-status"><option value="all">All files</option><option value="closed">Closed</option><option value="open">Open</option></select></label><button type="button" id="archive-reset">Reset filters</button><span id="archive-result" role="status" class="dashboard-note"></span>`;
    files[0].before(tools);
    const indexed = files.map(file => {
      const summary = file.querySelector('summary');
      const badge = document.createElement('span'); badge.className = 'archive-badge'; badge.textContent = 'CLOSED'; summary.append(badge);
      return {file,text:file.textContent.toLowerCase(),status:'closed'};
    });
    const search = document.getElementById('archive-search'), filter = document.getElementById('archive-status');
    function apply() {
      const query = search.value.trim().toLowerCase(); let matches = 0;
      for (const item of indexed) { item.file.hidden = !(item.text.includes(query) && (filter.value === 'all' || filter.value === item.status)); if (!item.file.hidden) matches++; }
      document.getElementById('archive-result').textContent = matches ? matches + ' archived file' + (matches === 1 ? '' : 's') : 'No archived files match. Try another keyword or status.';
    }
    search.addEventListener('input',apply); filter.addEventListener('change',apply);
    document.getElementById('archive-reset').addEventListener('click',()=>{search.value='';filter.value='all';apply();search.focus();});
    apply();
    const note = document.createElement('p'); note.className = 'dashboard-note'; note.textContent = 'Search the published reports below. Their closed status was confirmed on 18 October 2026; active bot cases are managed in Discord.'; tools.after(note);
  }
})();

(() => {
  'use strict';
  const note = document.getElementById('stats-status');
  if (!note) return;
  const fields = {members: document.getElementById('stat-members'), open_cases: document.getElementById('stat-open'), closed_cases: document.getElementById('stat-closed')};
  let endpoint = '';
  let lastSync = null;
  let busy = false;
  const snapshot = 'Archive snapshot: 0 open / 2 closed, confirmed 18 October 2026.';
  async function getJSON(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, {cache: 'no-store', signal: controller.signal, credentials: 'omit'});
      if (!response.ok) throw new Error('Unavailable');
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  const validCount = n => Number.isSafeInteger(n) && n >= 0;
  async function refresh() {
    if (busy || document.hidden) return;
    busy = true;
    try {
      const data = await getJSON(endpoint);
      const generated = Date.parse(data.generated_at);
      if (data.bot_online !== true || !Number.isFinite(generated) || Math.abs(Date.now() - generated) > 120000 ||
          !validCount(data.open_cases) || !validCount(data.closed_cases) ||
          !(data.members === null || validCount(data.members))) throw new Error('Stale or invalid stats');
      for (const key of ['open_cases', 'closed_cases']) fields[key].textContent = data[key].toLocaleString();
      const memberAge = Date.now() - Date.parse(data.members_updated_at);
      const membersFresh = data.members !== null && Number.isFinite(memberAge) && memberAge >= -120000 && memberAge < 900000;
      fields.members.textContent = membersFresh ? data.members.toLocaleString() : '—';
      fields.members.setAttribute('aria-label', membersFresh ? 'Approximate server member count, including bots' : 'Member count unavailable');
      lastSync = new Date();
      document.dispatchEvent(new CustomEvent('uiu-stats', {detail: data}));
      note.textContent = 'Synced ' + lastSync.toLocaleTimeString() + '. ' + (membersFresh ? 'Members are approximate and include bots.' : 'Member count is temporarily unavailable.') + ' Refreshes every minute.';
    } catch (_) {
      document.dispatchEvent(new CustomEvent('uiu-unavailable'));
      note.textContent = lastSync ? 'Live stats unavailable. Showing last update from ' + lastSync.toLocaleTimeString() + '.' : snapshot + ' Live stats unavailable.';
    } finally { busy = false; }
  }
  async function start() {
    try {
      const config = await getJSON('./stats-config.json');
      if (!config.endpoint) { note.textContent = snapshot + ' Live connection pending.'; return; }
      const url = new URL(config.endpoint);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid endpoint');
      endpoint = url.href;
      await refresh();
      setInterval(refresh, 60000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    } catch (_) { document.dispatchEvent(new CustomEvent('uiu-unavailable')); note.textContent = snapshot + ' Live connection unavailable.'; }
  }
  start();
})();
