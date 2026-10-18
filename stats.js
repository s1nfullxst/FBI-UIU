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
      note.textContent = 'Synced ' + lastSync.toLocaleTimeString() + '. ' + (membersFresh ? 'Members are approximate and include bots.' : 'Member count is temporarily unavailable.') + ' Refreshes every minute.';
    } catch (_) {
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
    } catch (_) { note.textContent = snapshot + ' Live connection unavailable.'; }
  }
  start();
})();
