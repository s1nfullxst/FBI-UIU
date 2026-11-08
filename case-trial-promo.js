/* Public fictional investigation experience for prospective members. */
(() => {
  'use strict';
  const style = document.createElement('style');
  style.textContent = '.trial-promo{display:grid;grid-template-columns:1fr auto;gap:24px;align-items:center;padding:25px;margin:24px 0;border:1px solid var(--line);border-top:2px solid var(--gold);background:var(--panel)}.trial-promo h3{font:28px Georgia,serif;margin:10px 0}.trial-promo p{font-size:14px;margin:8px 0;color:var(--muted);max-width:700px}.trial-promo .mono{font-size:10px}.trial-promo a{white-space:nowrap}.trial-promo .trial-fineprint{font-size:12px}@media(max-width:700px){.trial-promo{grid-template-columns:1fr;gap:14px;padding:21px}.trial-promo a{justify-self:start}}';
  document.head.append(style);
  for (const [id, promoId] of [['member-guide','investigation-trial'], ['recruitment','recruitment-trial']]) {
    const section = document.getElementById(id);
    if (!section || document.getElementById(promoId)) continue;
    const card = document.createElement('aside');
    card.className = 'trial-promo';
    card.id = promoId;
    const copy = document.createElement('div');
    const label = document.createElement('span');
    label.className = 'mono';
    label.textContent = 'TRY AN INVESTIGATION / NO SIGN-IN';
    const title = document.createElement('h3');
    title.textContent = 'Could you solve The Second Tide?';
    const description = document.createElement('p');
    description.textContent = 'Inspect eight fictional evidence files, challenge a witness account and reconstruct the timeline of a maritime anomaly. Get a feel for UIU casework before deciding whether to join.';
    const note = document.createElement('p');
    note.className = 'trial-fineprint';
    note.textContent = 'About 10–15 minutes · Hints available · Practice case, not an application';
    const link = document.createElement('a');
    link.href = './case-trial.html';
    link.className = 'button';
    link.textContent = 'TRY THE CASE →';
    copy.append(label, title, description, note);
    card.append(copy, link);
    const anchor = section.querySelector('.section-head') || section.querySelector('h2')?.nextElementSibling;
    if (anchor) anchor.after(card); else section.prepend(card);
  }
})();
