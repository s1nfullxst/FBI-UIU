/* Case Manager roster uses public display names only. */
(() => {
'use strict';
const main = document.querySelector('main'); if (!main) return;
const section = document.createElement('section'); section.id = 'case-managers';
const title = document.createElement('h2'); title.textContent = 'Case Managers.';
const description = document.createElement('p'); description.textContent = 'Members of the Discord Case Manager team. They can open, assign, update and close cases through the UIU bot.';
const status = document.createElement('p'); status.className = 'resource-note'; status.setAttribute('role','status');
const list = document.createElement('ul'); list.className = 'resource-grid';
section.append(title,description,status,list);
const archive = document.getElementById('case-files');
if (archive) archive.before(section); else main.append(section);
function unavailable() { list.replaceChildren(); status.textContent = 'Case Manager roster unavailable. Waiting for the bot to sync.'; }
unavailable();
document.addEventListener('uiu-unavailable', unavailable);
document.addEventListener('uiu-stats', event => {
  const data = event.detail, age = Date.now() - Date.parse(data.members_updated_at);
  if (!Number.isFinite(age) || age < -120000 || age >= 900000 ||
      !Array.isArray(data.case_managers) || !data.case_managers.every(m => m && typeof m.display_name === 'string')) { unavailable(); return; }
  list.replaceChildren();
  for (const member of data.case_managers) {
    const item = document.createElement('li'); item.className = 'resource-card'; item.textContent = member.display_name; list.append(item);
  }
  status.textContent = data.case_managers.length ? 'Synced from Discord. Role changes appear within about six minutes.' : 'No members currently have the Case Manager role.';
});
})();

/* Community resources: calendar, recruitment, timelines, gallery and commands. */
(() => {
'use strict';
const main=document.querySelector('main');if(!main)return;
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
function section(id,title,description,before){const s=el('section');s.id=id;const h=el('h2',title);h.id=id+'-title';s.setAttribute('aria-labelledby',h.id);s.append(el('span','UIU / COMMUNITY RESOURCES','mono'),h,el('p',description));if(before)before.before(s);else main.append(s);return s;}
const style=el('style');style.textContent='.resource-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.resource-card{padding:24px;border:1px solid var(--line);background:var(--panel);min-width:0}.resource-card h3{font:26px Georgia,serif}.resource-card p{font-size:14px;overflow-wrap:anywhere}.resource-tools{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:22px 0}.resource-tools label{display:flex;flex-direction:column;gap:8px;font:12px monospace;color:var(--gold)}.resource-tools input,.resource-tools select,.resource-button{padding:12px;background:#101c2c;color:var(--ink);border:1px solid var(--line);font:14px Arial,sans-serif;max-width:100%;box-sizing:border-box}.resource-button{cursor:pointer}.resource-tools :focus-visible,.cal-day:focus-visible,.photo-button:focus-visible{outline:2px solid var(--gold);outline-offset:3px}.resource-note{font:12px/1.8 monospace;color:var(--muted)}.cal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}.cal-heading{text-align:center;font:11px monospace;color:var(--muted);padding:10px 0}.cal-day{min-height:58px;border:1px solid var(--line);background:var(--panel);color:var(--ink);cursor:pointer;font:15px Arial,sans-serif}.cal-day.has-events{border-bottom:3px solid var(--gold)}.cal-day[aria-pressed=true]{outline:2px solid var(--gold);outline-offset:-2px}.cal-day.today{color:var(--gold);font-weight:bold}.cal-count{display:block;font:10px monospace;margin-top:5px}.report-timeline{border-left:2px solid var(--gold);margin:20px 0 25px 12px;padding-left:26px}.report-timeline li{padding:10px 0 16px}.report-timeline p{font-size:13px}.gallery-image{width:100%;aspect-ratio:16/9;object-fit:cover;display:block}.photo-button{padding:0;border:0;background:transparent;width:100%;cursor:zoom-in}.photo-dialog{max-width:min(950px,95vw);max-height:90vh;background:#101c2c;color:var(--ink);border:1px solid var(--gold);padding:20px}.photo-dialog::backdrop{background:#000b}.photo-dialog img{max-width:100%;max-height:65vh;object-fit:contain;display:block;margin:16px auto}.command-row{padding:18px 0;border-bottom:1px solid var(--line)}.command-row code{color:var(--gold);overflow-wrap:anywhere}.command-row p{font-size:14px;margin:7px 0}.command-row small{color:var(--muted)}@media(max-width:650px){.resource-grid{grid-template-columns:1fr}.cal-day{min-height:50px}.resource-tools label{width:100%}.cal-heading{font-size:10px}}';document.head.append(style);
const calendar=section('operation-calendar','Operation calendar.','Browse the bot’s feed of up to 12 upcoming sessions. Times are shown in your local timezone.',document.getElementById('operations'));
const tools=el('div',undefined,'resource-tools'),prev=el('button','Previous','resource-button'),next=el('button','Next','resource-button'),today=el('button','This month','resource-button'),monthName=el('strong');monthName.setAttribute('aria-live','polite');
const gameLabel=el('label','Game'),game=el('select');for(const value of ['All games','ERLC','BRM5']){const o=el('option',value);o.value=value;game.append(o);}gameLabel.append(game);tools.append(prev,monthName,next,today,gameLabel);
const status=el('p','Connecting to schedule…','resource-note');status.setAttribute('role','status');const grid=el('div',undefined,'cal-grid'),agenda=el('div');calendar.append(tools,status,grid,agenda);
let month=new Date();month=new Date(month.getFullYear(),month.getMonth(),1);let events=null,selected=null;
const same=(a,b)=>a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();
function draw(){monthName.textContent=month.toLocaleDateString(undefined,{month:'long',year:'numeric'});grid.replaceChildren();agenda.replaceChildren();
for(const name of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])grid.append(el('span',name,'cal-heading'));
for(let i=0;i<(month.getDay()+6)%7;i++)grid.append(el('span'));
const visible=(events||[]).filter(r=>(game.value==='All games'||r.game===game.value||r.game==='Both')&&new Date(r.starts_at).getFullYear()===month.getFullYear()&&new Date(r.starts_at).getMonth()===month.getMonth());
for(let day=1;day<=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();day++){const date=new Date(month.getFullYear(),month.getMonth(),day),matches=visible.filter(r=>same(new Date(r.starts_at),date));const button=el('button',String(day),'cal-day');button.type='button';button.setAttribute('aria-label',date.toLocaleDateString(undefined,{dateStyle:'full'})+', '+matches.length+' sessions');button.setAttribute('aria-pressed',String(selected===day));button.dataset.day=day;if(same(date,new Date()))button.classList.add('today');if(matches.length){button.classList.add('has-events');button.append(el('span',String(matches.length)+' ops','cal-count'));}button.onclick=()=>{selected=selected===day?null:day;draw();grid.querySelector('[data-day="'+day+'"]').focus();};grid.append(button);}
if(events===null){agenda.append(el('p','The calendar will populate when the live schedule is available.'));return;}
const shown=visible.filter(r=>selected===null||new Date(r.starts_at).getDate()===selected);agenda.append(el('h3',selected===null?'Sessions this month':'Sessions on '+selected+' '+month.toLocaleDateString(undefined,{month:'long'})));
if(!shown.length)agenda.append(el('p','No sessions in the current feed for this selection. Check Discord for the full schedule.'));
for(const r of shown){const card=el('article',undefined,'resource-card');card.append(el('h3',r.title),el('p',new Date(r.starts_at).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})+' · '+r.game));const link=el('a','Open Discord for the briefing and sign-up');link.href='https://discord.gg/qmdEWAhBUy';card.append(link);agenda.append(card);}}
prev.onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()-1,1);selected=null;draw();};next.onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()+1,1);selected=null;draw();};today.onclick=()=>{const n=new Date();month=new Date(n.getFullYear(),n.getMonth(),1);selected=null;draw();};game.onchange=()=>{selected=null;draw();};
document.addEventListener('uiu-stats',event=>{const rows=event.detail.activity?.upcoming_operations;if(!Array.isArray(rows)||rows.length>12||!rows.every(r=>r&&typeof r.title==='string'&&r.title.length<=100&&['ERLC','BRM5','Both'].includes(r.game)&&Number.isFinite(Date.parse(r.starts_at)))){events=null;status.textContent='Schedule unavailable. Check Discord.';}else{events=rows;status.textContent='Updated '+new Date().toLocaleTimeString()+'. Select a day to filter.';}draw();});
document.addEventListener('uiu-unavailable',()=>{status.textContent=events?'Connection unavailable. Sessions shown are from the last successful update.':'Schedule unavailable. Check Discord.';});draw();
const recruitment=section('recruitment','Find your team.','Check published recruitment statuses, then contact leadership. Unconfirmed does not mean open.',document.getElementById('briefings')),recruitGrid=el('div',undefined,'resource-grid'),recruitNote=el('p','Loading statuses…','resource-note');recruitment.append(recruitGrid,recruitNote);
const gallery=section('gallery','From the field.','Community screenshots from operations and training.',document.getElementById('questions')),galleryTools=el('div',undefined,'resource-tools'),photoLabel=el('label','Category'),photoFilter=el('select');
for(const value of ['All','Operations','Training']){const o=el('option',value);o.value=value;photoFilter.append(o);}photoLabel.append(photoFilter);galleryTools.append(photoLabel);const galleryGrid=el('div',undefined,'resource-grid'),photoNote=el('p','Loading photographs…','resource-note');photoNote.setAttribute('role','status');gallery.append(galleryTools,photoNote,galleryGrid);
const modal=el('dialog',undefined,'photo-dialog');modal.setAttribute('aria-label','Community photograph');const close=el('button','Close photograph','resource-button'),large=el('img'),caption=el('p');close.onclick=()=>modal.close();modal.append(close,large,caption);document.body.append(modal);let photos=[];
function drawPhotos(){galleryGrid.replaceChildren();const shown=photos.filter(p=>photoFilter.value==='All'||p.category===photoFilter.value);photoNote.textContent=shown.length?shown.length+' photographs':photos.length?'No photos in this category.':'No photos published yet. Share an operation or training screenshot with staff for the gallery.';
for(const p of shown){const card=el('figure',undefined,'resource-card'),button=el('button',undefined,'photo-button'),img=el('img',undefined,'gallery-image');img.src=p.url.href;img.alt=p.caption;img.loading='lazy';button.setAttribute('aria-label','Enlarge '+p.caption);button.append(img);button.onclick=()=>{large.src=p.url.href;large.alt=p.caption;caption.textContent=p.caption+(p.credit?' · '+p.credit:'');modal.showModal();};img.onerror=()=>{button.replaceChildren(el('p','Photo unavailable'));button.disabled=true;};card.append(button,el('figcaption',p.caption+(p.credit?' · '+p.credit:'')));galleryGrid.append(card);}}
photoFilter.onchange=drawPhotos;
async function content(){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);try{const response=await fetch('./community-content.json',{cache:'no-store',credentials:'omit',signal:controller.signal});if(!response.ok)throw Error();const data=await response.json();if(!Array.isArray(data.recruitment)||!Array.isArray(data.gallery))throw Error();const labels={open:'Accepting members',closed:'Recruitment closed',unconfirmed:'Status unconfirmed'};
for(const row of data.recruitment.slice(0,20)){if(!row||typeof row.department!=='string'||!Object.hasOwn(labels,row.status))continue;const card=el('article',undefined,'resource-card');card.append(el('h3',row.department),el('p',labels[row.status],'community-status'),el('p',typeof row.note==='string'?row.note:''));if(row.updated_at&&Number.isFinite(Date.parse(row.updated_at)))card.append(el('p','Confirmed '+new Date(row.updated_at).toLocaleDateString()));const a=el('a','Ask leadership in Discord');a.href='https://discord.gg/qmdEWAhBUy';card.append(a);recruitGrid.append(card);}recruitNote.textContent=recruitGrid.children.length?'Contact leadership for current requirements and availability.':'No recruitment statuses published.';
photos=data.gallery.slice(0,60).filter(p=>p&&typeof p.src==='string'&&typeof p.caption==='string'&&['Operations','Training'].includes(p.category)).flatMap(p=>{try{const url=new URL(p.src,location.href);return url.origin===location.origin&&/\.(png|jpe?g|webp)$/i.test(url.pathname)?[{...p,url}]:[];}catch{return[];}});drawPhotos();
}catch{recruitNote.textContent='Recruitment statuses unavailable. Ask leadership in Discord.';photoNote.textContent='Gallery unavailable. Please try again later.';}finally{clearTimeout(timer);}}content();
document.querySelectorAll('.public-case').forEach(file=>{const parts=Array.from(file.querySelectorAll('.case-report-details'));if(!parts.length)return;const timeline=el('details'),list=el('ol',undefined,'report-timeline');timeline.append(el('summary','Case timeline — report sequence'),el('p','Events follow the published report’s order. Unknown dates are not assigned.'));
for(const part of parts){const title=part.querySelector('summary')?.textContent?.trim();if(!title)continue;const li=el('li');li.append(el('strong',title));const text=part.querySelector('p')?.textContent?.trim();if(text)li.append(el('p',text.length>280?text.slice(0,277)+'…':text));list.append(li);}const end=el('li');end.append(el('strong','Archive status: closed'),el('p','Confirmed by management on 18 October 2026. This is a status confirmation, not the incident’s closure date.'));list.append(end);timeline.append(list);file.querySelector('.public-case-body')?.prepend(timeline);});
const guide=section('command-guide','Find the right command.','Search by command or purpose. Case commands also allow Case Managers. Staff means Manage Server or the configured staff role. Other members’ private records require staff access.',document.getElementById('join'));
const searchTools=el('div',undefined,'resource-tools'),searchLabel=el('label','Search'),search=el('input');search.type='search';search.placeholder='Try case, attendance or training';searchLabel.append(search);const accessLabel=el('label','Access'),access=el('select');
for(const value of ['All','Members','Staff','Case Managers / Staff','Manage Server','Manage Roles']){const o=el('option',value);o.value=value;access.append(o);}accessLabel.append(access);searchTools.append(searchLabel,accessLabel);const result=el('p',undefined,'resource-note');result.setAttribute('role','status');const list=el('div');guide.append(searchTools,result,list);
const commands=[],add=(group,permission,items)=>items.forEach(([name,description])=>commands.push({name:'/'+(group?group+' ':'')+name,description,permission}));
add('','Members',[['profile','View your profile and activity.'],['mycases','List cases assigned to you.'],['stats','Show member and case counts.'],['help','Show bot help.']]);
add('dossier','Members',[['view','View your dossier; staff may select another member.']]);add('dossier','Staff',[['set','Set a member’s department and callsign.']]);
for(const group of ['training','commendation']){add(group,'Members',[['list','View your active and revoked records; staff may view others.']]);add(group,'Staff',[['award','Award another member a qualification or recognition. No self-awards.'],['revoke','Revoke a record by ID with a reason.']]);}
add('case','Case Managers / Staff',[['open','Create a case.'],['close','Close a case with its resolution.'],['reopen','Reopen a case with a reason.'],['view','Read a case privately.'],['list','List cases by status.'],['assign','Assign a lead agent to an open case.'],['unassign','Remove the lead agent from an open case.'],['note','Add a note and optional evidence URL.'],['notes','Read saved case notes.']]);
add('operation','Members',[['list','List scheduled operations.'],['view','Read a briefing and join or leave before its start.']]);add('operation','Staff',[['schedule','Schedule an operation with game, briefing and a future time including UTC offset.'],['roster','View signed-up members.'],['attendance','Mark someone present or absent after the scheduled start.'],['attendance_list','View recorded attendance.'],['complete','Mark an operation completed.'],['cancel','Cancel an operation.']]);
add('announcement','Staff',[['publish','Publish a title and message on the public website.'],['list','List announcement IDs.'],['remove','Remove a website announcement.']]);add('','Manage Roles',[['promotion','Give a new rank and optionally remove the old role; hierarchy applies.']]);add('setup','Manage Server',[['channels','Choose announcement channels.']]);add('','Manage Server',[['backup','Download a private database backup.']]);
add('privacy','Members',[['policy','Open the policies.'],['request','Submit a data deletion request for review.']]);add('privacy','Manage Server',[['requests','List pending deletion requests.'],['erase','Permanently remove linked data after verification and explicit confirmation. External copies need separate review.']]);
function filter(){list.replaceChildren();const q=search.value.trim().toLowerCase(),shown=commands.filter(c=>(access.value==='All'||c.permission===access.value)&&(c.name+' '+c.description).toLowerCase().includes(q));result.textContent=shown.length+' commands found';for(const c of shown){const row=el('article',undefined,'command-row');row.append(el('code',c.name),el('p',c.description),el('small',c.permission));list.append(row);}}search.oninput=filter;access.onchange=filter;filter();
const jumps=el('nav',undefined,'resource-tools');jumps.setAttribute('aria-label','Community resources');for(const [text,id] of [['Calendar','operation-calendar'],['Recruitment','recruitment'],['Gallery','gallery'],['Commands','command-guide']]){const a=el('a',text,'resource-button');a.href='#'+id;jumps.append(a);}document.getElementById('about')?.before(jumps);
})();

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
/* Public announcements and member guide. */
(() => {
  const about = document.getElementById('about');
  if (!about) return;
  const style = document.createElement('style');
  style.textContent = `header nav{flex-wrap:wrap;row-gap:12px;min-width:0}.news-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.news-card{padding:26px;border:1px solid var(--line);background:var(--panel);min-width:0}.news-card:first-child{border-top:3px solid var(--gold)}.news-card h3{font:28px Georgia,serif;overflow-wrap:anywhere}.news-card p{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px}.news-card time{font:11px monospace;color:var(--gold)}.member-steps{list-style:none;counter-reset:steps;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}.member-steps li{counter-increment:steps;padding:24px;border-top:1px solid var(--line)}.member-steps li:before{content:'0' counter(steps);font:13px monospace;color:var(--gold)}.member-steps h3{font:26px Georgia,serif}.member-steps p{font-size:14px}.guide-links{display:flex;gap:20px;flex-wrap:wrap;font-size:13px}.news-state{font-size:13px;color:var(--muted)}@media(max-width:650px){.news-grid,.member-steps{grid-template-columns:1fr}}`;
  document.head.append(style);
  const news = document.createElement('section'); news.id = 'announcements'; news.setAttribute('aria-labelledby','news-title');
  news.innerHTML = `<div class="section-head"><div><span class="mono">UIU / COMMUNITY UPDATES</span><h2 id="news-title">Latest announcements.</h2></div><p>Updates published by community staff. Check Discord for conversations and full session briefings.</p></div><p id="news-state" class="news-state" role="status">Checking for announcements…</p><div id="news-list" class="news-grid"></div>`;
  about.before(news);
  const guide = document.createElement('section'); guide.id = 'member-guide'; guide.setAttribute('aria-labelledby','guide-title');
  guide.innerHTML = `<div class="section-head"><div><span class="mono">NEW TO THE UIU?</span><h2 id="guide-title">Your first steps.</h2></div><p>From joining the server to your first operation: start here, then follow the community’s current instructions in Discord.</p></div>
    <ol class="member-steps"><li><h3>Meet the community.</h3><p>Join our Discord, read the rules and follow any verification instructions shown there. Ask staff if you need help getting access.</p><a href="https://discord.gg/qmdEWAhBUy" class="button" target="_blank" rel="noopener noreferrer">JOIN DISCORD &rarr;</a></li>
    <li><h3>Find your department.</h3><p>Explore the teams and their duties. Contact the relevant department lead in Discord about openings and requirements; a listing does not mean recruitment is open.</p><a href="#departments">EXPLORE DEPARTMENTS &rarr;</a></li>
    <li><h3>Prepare your agent.</h3><p>Use <code>/dossier view</code> to check your profile. Staff can set your department and callsign, then record qualifications as you complete training.</p><p>Need a correction? Ask staff rather than creating a second record.</p></li>
    <li><h3>Join your first operation.</h3><p>Check the Ops Board for upcoming sessions. Read the briefing in Discord and use the bot’s Join button before the scheduled start. Staff confirm attendance afterward.</p><a href="#operations">VIEW OPS BOARD &rarr;</a></li></ol>
    <div class="contact-note"><h3>Keep it fictional. Keep it respectful.</h3><p>Use fictional details in case reports, follow server rules, and agree roleplay boundaries with others. Questions about participation go to staff in Discord.</p><div class="guide-links"><a href="#questions">Read the FAQ</a><a href="./privacy.html">Your privacy</a><a href="./terms.html">Terms of Service</a></div></div>`;
  const questions = document.getElementById('questions');
  if (questions) questions.before(guide); else about.after(guide);
  const nav = document.querySelector('header nav');
  if (nav) for (const [label,href] of [['Updates','#announcements'],['Start here','#member-guide']]) {
    const link = document.createElement('a');link.textContent=label;link.href=href;nav.append(link);
  }
  const state = document.getElementById('news-state'), list = document.getElementById('news-list');
  let lastUpdate = null;
  document.addEventListener('uiu-stats', event => {
    const rows = event.detail.announcements;
    if (!Array.isArray(rows) || rows.length > 5 || !rows.every(row => row && Number.isSafeInteger(row.id) && row.id > 0 && typeof row.title === 'string' && row.title.length <= 100 && typeof row.body === 'string' && row.body.length <= 1200 && Number.isFinite(Date.parse(row.published_at)))) {
      list.replaceChildren();lastUpdate=null;state.textContent='Announcements are not available here yet. Check Discord for updates.';return;
    }
    list.replaceChildren();
    for (const row of rows) {
      const card=document.createElement('article');card.className='news-card';
      const date=document.createElement('time');date.dateTime=row.published_at;date.textContent=new Date(row.published_at).toLocaleDateString(undefined,{dateStyle:'medium'});
      const title=document.createElement('h3');title.textContent=row.title;
      const body=document.createElement('p');body.textContent=row.body;
      card.append(date,title,body);list.append(card);
    }
    lastUpdate=new Date();state.textContent=rows.length ? 'Latest '+rows.length+' update'+(rows.length===1?'':'s')+' · Synced '+lastUpdate.toLocaleTimeString() : 'No announcements published yet. Check Discord for community updates.';
  });
  document.addEventListener('uiu-unavailable',()=>{
    state.textContent=lastUpdate ? 'Connection unavailable. Showing announcements last checked at '+lastUpdate.toLocaleTimeString()+'. They may have changed.' : 'Announcements unavailable. Check Discord for updates.';
  });
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
      const membersFresh = data.members_scope === 'humans_and_uiu_bot' && data.members !== null && Number.isFinite(memberAge) && memberAge >= -120000 && memberAge < 900000;
      fields.members.textContent = membersFresh ? data.members.toLocaleString() : '—';
      fields.members.setAttribute('aria-label', membersFresh ? 'Server members: people plus the UIU bot' : 'Member count unavailable');
      lastSync = new Date();
      document.dispatchEvent(new CustomEvent('uiu-stats', {detail: data}));
      note.textContent = 'Synced ' + lastSync.toLocaleTimeString() + '. ' + (membersFresh ? 'Members count people plus the UIU bot; other bots are excluded.' : 'Member count is temporarily unavailable.') + ' Refreshes every minute.';
    } catch (_) {
      document.dispatchEvent(new CustomEvent('uiu-unavailable'));
      fields.members.textContent = '-';
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
