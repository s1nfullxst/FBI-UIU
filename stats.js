/* Weekly overview: public schedules and announcements only. */
(() => {
'use strict';
const about=document.getElementById('about'); if(!about)return;
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const section=el('section');section.id='uiu-week';section.setAttribute('aria-labelledby','week-title');
const heading=el('h2','This week in UIU.');heading.id='week-title';
const status=el('p','Connecting to the unit feed.','resource-note');status.setAttribute('role','status');
const grid=el('div',undefined,'week-grid');
section.append(el('span','UIU / LIVE BRIEFING','mono'),heading,el('p','Operations and training over the next seven days, plus announcements from the past seven days. Times are local to you.'),status,grid);
about.before(section);
const style=el('style');style.textContent='.week-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.week-column{border:1px solid var(--line);border-top:3px solid var(--gold);padding:24px;background:var(--panel);min-width:0}.week-column h3{font:25px Georgia,serif}.week-entry{padding:16px 0;border-bottom:1px solid var(--line)}.week-entry h4{font:18px Georgia,serif;margin:0 0 10px;overflow-wrap:anywhere}.week-entry p,.week-column>p{font-size:13px;overflow-wrap:anywhere}.week-entry time{font:12px monospace;color:var(--gold)}.week-column>a{display:inline-block;margin-top:20px;font-size:12px}.week-entry code{overflow-wrap:anywhere}@media(max-width:850px){.week-grid{grid-template-columns:1fr}}';document.head.append(style);
const columns={};
for(const [key,title,href,label] of [
 ['ops','Operations','#operations','View Ops Board'],
 ['training','Training','https://discord.gg/qmdEWAhBUy','Find training in Discord'],
 ['news','Announcements','#announcements','Read all announcements']]){
 const card=el('article',undefined,'week-column'),body=el('div'),link=el('a',label);link.href=href;card.append(el('h3',title),body,link);grid.append(card);columns[key]=body;
}
function message(key,text){columns[key].replaceChildren(el('p',text));}
function unavailable(){status.textContent='Live briefing unavailable. Check Discord for the latest schedule.';for(const key of Object.keys(columns))message(key,'Waiting for a live update.');}
unavailable();
function schedule(key,rows,current,end){
 if(!Array.isArray(rows)||rows.length>12||!rows.every(r=>r&&Number.isSafeInteger(r.id)&&r.id>0&&typeof r.title==='string'&&r.title.length<=100&&Number.isFinite(Date.parse(r.starts_at)))){message(key,'Schedule unavailable. Check Discord for sessions.');return false;}
 const chosen=rows.filter(r=>Date.parse(r.starts_at)>=current&&Date.parse(r.starts_at)<end).sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at));
 columns[key].replaceChildren();
 if(!chosen.length)message(key,'No sessions scheduled in the next seven days.');
 for(const row of chosen.slice(0,4)){
  const item=el('div',undefined,'week-entry'),time=el('time',new Date(row.starts_at).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}));time.dateTime=row.starts_at;
  item.append(el('h4',row.title),time,el('p',(key==='training'?'Training #':'Operation #')+row.id));
  if(key==='training')item.append(el('code','/training join session_id:'+row.id));
  else item.append(el('p','Read the briefing and join in Discord.'));
  columns[key].append(item);
 }
 if(chosen.length>4)columns[key].append(el('p','Showing the next four sessions. Check Discord for more.'));
 return true;
}
document.addEventListener('uiu-unavailable',unavailable);
document.addEventListener('uiu-stats',event=>{
 const data=event.detail,current=Date.now(),week=7*24*60*60*1000;
 const generated=Date.parse(data.generated_at);
 if(data.bot_online!==true||!Number.isFinite(generated)||Math.abs(current-generated)>120000){unavailable();return;}
 const ops=schedule('ops',data.activity?.upcoming_operations,current,current+week);
 const training=schedule('training',data.activity?.upcoming_training,current,current+week);
 const rows=data.announcements;
 let news=false;
 if(!Array.isArray(rows)||rows.length>5||!rows.every(r=>r&&typeof r.title==='string'&&r.title.length<=100&&Number.isFinite(Date.parse(r.published_at))))message('news','Announcements unavailable.');
 else{
  news=true;
  const recent=rows.filter(r=>Date.parse(r.published_at)>=current-week&&Date.parse(r.published_at)<=current).sort((a,b)=>Date.parse(b.published_at)-Date.parse(a.published_at));
  columns.news.replaceChildren();
  if(!recent.length)message('news','No announcements published in the past seven days.');
  for(const row of recent.slice(0,3)){const item=el('div',undefined,'week-entry'),time=el('time',new Date(row.published_at).toLocaleDateString(undefined,{dateStyle:'medium'}));time.dateTime=row.published_at;item.append(el('h4',row.title),time);columns.news.append(item);}
 }
 status.textContent=(ops&&training&&news?'Updated ':'Partially synced ')+new Date().toLocaleTimeString()+'. Refreshes every minute.';
});
})();
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
const gallery=section('gallery','Operation photos.','Community screenshots from operations and training.',document.getElementById('questions')),galleryTools=el('div',undefined,'resource-tools'),photoLabel=el('label','Category'),photoFilter=el('select');
for(const value of ['All','Operations','Training']){const o=el('option',value);o.value=value;photoFilter.append(o);}photoLabel.append(photoFilter);galleryTools.append(photoLabel);const galleryGrid=el('div',undefined,'resource-grid'),photoNote=el('p','Loading photographs…','resource-note');photoNote.setAttribute('role','status');gallery.append(galleryTools,photoNote,galleryGrid);
const modal=el('dialog',undefined,'photo-dialog');modal.setAttribute('aria-label','Community photograph');const close=el('button','Close photograph','resource-button'),large=el('img'),caption=el('p');close.onclick=()=>modal.close();modal.append(close,large,caption);document.body.append(modal);let photos=[];
function drawPhotos(){galleryTools.hidden=photos.length===0;galleryGrid.replaceChildren();const shown=photos.filter(p=>photoFilter.value==='All'||p.category===photoFilter.value);photoNote.textContent=shown.length?shown.length+' photographs':photos.length?'No photos in this category.':'Photos coming soon';
for(const p of shown){const card=el('figure',undefined,'resource-card'),button=el('button',undefined,'photo-button'),img=el('img',undefined,'gallery-image');img.src=p.url.href;img.alt=p.caption;img.loading='lazy';button.setAttribute('aria-label','Enlarge '+p.caption);button.append(img);button.onclick=()=>{large.src=p.url.href;large.alt=p.caption;caption.textContent=p.caption+(p.credit?' · '+p.credit:'');modal.showModal();};img.onerror=()=>{button.replaceChildren(el('p','Photo unavailable'));button.disabled=true;};card.append(button,el('figcaption',p.caption+(p.credit?' · '+p.credit:'')));galleryGrid.append(card);}}
photoFilter.onchange=drawPhotos;
async function content(){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);try{const response=await fetch('./community-content.json',{cache:'no-store',credentials:'omit',signal:controller.signal});if(!response.ok)throw Error();const data=await response.json();if(!Array.isArray(data.recruitment)||!Array.isArray(data.gallery))throw Error();const labels={open:'Accepting members',closed:'Recruitment closed',unconfirmed:'Status unconfirmed'};
for(const row of data.recruitment.slice(0,20)){if(!row||typeof row.department!=='string'||!Object.hasOwn(labels,row.status))continue;const card=el('article',undefined,'resource-card');card.append(el('h3',row.department),el('p',labels[row.status],'community-status'),el('p',typeof row.note==='string'?row.note:''));if(row.updated_at&&Number.isFinite(Date.parse(row.updated_at)))card.append(el('p','Confirmed '+new Date(row.updated_at).toLocaleDateString()));const a=el('a','Ask leadership in Discord');a.href='https://discord.gg/qmdEWAhBUy';card.append(a);recruitGrid.append(card);}recruitNote.textContent=recruitGrid.children.length?'Contact leadership for current requirements and availability.':'No recruitment statuses published.';
document.dispatchEvent(new CustomEvent('uiu-community',{detail:{recruitment:data.recruitment}}));
photos=data.gallery.slice(0,60).filter(p=>p&&typeof p.src==='string'&&typeof p.caption==='string'&&['Operations','Training'].includes(p.category)).flatMap(p=>{try{const url=new URL(p.src,location.href);return url.origin===location.origin&&/\.(png|jpe?g|webp)$/i.test(url.pathname)?[{...p,url}]:[];}catch{return[];}});drawPhotos();
}catch{recruitNote.textContent='Recruitment statuses unavailable. Ask leadership in Discord.';photoNote.textContent='Gallery unavailable. Please try again later.';}finally{clearTimeout(timer);}}content();
document.querySelectorAll('.public-case').forEach(file=>{const parts=Array.from(file.querySelectorAll('.case-report-details'));if(!parts.length)return;const timeline=el('details'),list=el('ol',undefined,'report-timeline');timeline.append(el('summary','Case timeline — report sequence'),el('p','Events follow the published report’s order. Unknown dates are not assigned.'));
for(const part of parts){const title=part.querySelector('summary')?.textContent?.trim();if(!title)continue;const li=el('li');li.append(el('strong',title));const text=part.querySelector('p')?.textContent?.trim();if(text)li.append(el('p',text.length>280?text.slice(0,277)+'…':text));list.append(li);}const end=el('li');end.append(el('strong','Archive status: closed'),el('p','Confirmed by management on 18 October 2026. This is a status confirmation, not the incident’s closure date.'));list.append(end);timeline.append(list);file.querySelector('.public-case-body')?.prepend(timeline);});
const guide=section('command-guide','Find the right command.','Search by command or purpose. Case commands also allow Case Managers. Staff means Manage Server or the configured staff role. Other members’ private records require staff access.',document.getElementById('join'));
const commandDialog=el('dialog',undefined,'command-dialog');commandDialog.id='command-dialog';commandDialog.setAttribute('aria-labelledby','command-dialog-title');
const dialogHead=el('div',undefined,'command-dialog-head'),dialogTitle=el('h2','Find a command.'),closeCommands=el('button','Close','resource-button');
dialogTitle.id='command-dialog-title';closeCommands.type='button';closeCommands.setAttribute('aria-label','Close command finder');
dialogHead.append(dialogTitle,closeCommands);
commandDialog.append(dialogHead,el('p','Search commands and filter by access. Staff means Manage Server or the configured staff role. Case Managers also have access to case commands.','resource-note'));
document.body.append(commandDialog);
const commandStyle=el('style');commandStyle.textContent='.command-dialog{box-sizing:border-box;width:min(780px,calc(100vw - 32px));max-height:85vh;max-height:85dvh;overflow-y:auto;overscroll-behavior:contain;padding:28px;background:#101c2c;color:var(--ink);border:1px solid var(--gold)}.command-dialog::backdrop{background:rgba(0,0,0,.78)}.command-dialog-head{display:flex;gap:16px;align-items:center;justify-content:space-between}.command-dialog-head h2{font:32px Georgia,serif;margin:0}.command-dialog-head button{flex-shrink:0}.command-dialog .resource-tools{margin-top:24px}.command-dialog input{width:100%}.command-dialog :focus-visible{outline:2px solid var(--gold);outline-offset:3px}@media(max-width:650px){.command-dialog{padding:20px}.command-dialog-head h2{font-size:26px}}';document.head.append(commandStyle);
const openCommands=el('button','Find a command','resource-button');openCommands.type='button';openCommands.setAttribute('aria-haspopup','dialog');openCommands.setAttribute('aria-controls','command-dialog');guide.append(openCommands);
let commandOpener=null,previousOverflow='';
function showCommands(){if(commandDialog.open)return;commandOpener=document.activeElement;previousOverflow=document.body.style.overflow;commandDialog.showModal();document.body.style.overflow='hidden';search.focus();}
openCommands.onclick=showCommands;
closeCommands.onclick=()=>commandDialog.close();
commandDialog.addEventListener('close',()=>{document.body.style.overflow=previousOverflow;commandOpener?.focus();});
commandDialog.addEventListener('click',event=>{if(event.target!==commandDialog)return;const box=commandDialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)commandDialog.close();});
const searchTools=el('div',undefined,'resource-tools'),searchLabel=el('label','Search'),search=el('input');search.type='search';search.placeholder='Try case, attendance or training';searchLabel.append(search);const accessLabel=el('label','Access'),access=el('select');
for(const value of ['All','Members','Staff','Case Managers / Staff','Manage Server','Manage Roles']){const o=el('option',value);o.value=value;access.append(o);}accessLabel.append(access);searchTools.append(searchLabel,accessLabel);const result=el('p',undefined,'resource-note');result.setAttribute('role','status');const list=el('div');commandDialog.append(searchTools,result,list);
const commands=[],add=(group,permission,items)=>items.forEach(([name,description])=>commands.push({name:'/'+(group?group+' ':'')+name,description,permission}));
add('','Members',[['profile','View your profile and activity.'],['mycases','List cases assigned to you.'],['stats','Show member and case counts.'],['help','Show bot help.']]);
add('dossier','Members',[['view','View your dossier; staff may select another member.']]);add('dossier','Staff',[['set','Set a member’s department and callsign.']]);
for(const group of ['training','commendation']){add(group,'Members',[['list','View your active and revoked records; staff may view others.']]);add(group,'Staff',[['award','Award another member a qualification or recognition. No self-awards.'],['revoke','Revoke a record by ID with a reason.']]);}
add('training','Members',[['sessions','Browse scheduled, completed and cancelled training.'],['join','Sign yourself up before training starts.'],['leave','Withdraw before training starts.'],['results','View your session results; staff may view another member.']]);
add('training','Staff',[['schedule','Schedule a training session with a future date and UTC offset.'],['roster','Privately view training sign-ups and results.'],['result','Record or correct a signed-up member pass/fail after training starts. No self-assessment.'],['complete','Complete training after it starts.'],['cancel','Cancel scheduled training without recorded results.']]);
add('case','Case Managers / Staff',[['open','Create a case.'],['close','Close a case with its resolution.'],['reopen','Reopen a case with a reason.'],['view','Read a case privately.'],['list','List cases by status.'],['assign','Assign a lead agent to an open case.'],['unassign','Remove the lead agent from an open case.'],['note','Add a note and optional evidence URL.'],['notes','Read saved case notes.']]);
add('operation','Members',[['list','List scheduled operations.'],['view','Read a briefing and join or leave before its start.']]);add('operation','Staff',[['schedule','Schedule an operation with game, briefing and a future time including UTC offset.'],['roster','View signed-up members.'],['attendance','Mark someone present or absent after the scheduled start.'],['attendance_list','View recorded attendance.'],['complete','Mark an operation completed.'],['cancel','Cancel an operation.']]);
add('announcement','Staff',[['publish','Publish a title and message on the public website.'],['list','List announcement IDs.'],['remove','Remove a website announcement.']]);add('','Manage Roles',[['promotion','Give a new rank and optionally remove the old role; hierarchy applies.']]);add('setup','Manage Server',[['channels','Choose announcement channels.']]);add('','Manage Server',[['backup','Download a private database backup.']]);
add('privacy','Members',[['policy','Open the policies.'],['request','Submit a data deletion request for review.']]);add('privacy','Manage Server',[['requests','List pending deletion requests.'],['erase','Permanently remove linked data after verification and explicit confirmation. External copies need separate review.']]);
function filter(){list.replaceChildren();const q=search.value.trim().toLowerCase(),shown=commands.filter(c=>(access.value==='All'||c.permission===access.value)&&(c.name+' '+c.description).toLowerCase().includes(q));result.textContent=shown.length+' commands found';for(const c of shown){const row=el('article',undefined,'command-row');row.append(el('code',c.name),el('p',c.description),el('small',c.permission));list.append(row);}}search.oninput=filter;access.onchange=filter;filter();
const jumps=el('nav',undefined,'resource-tools');jumps.setAttribute('aria-label','Community resources');for(const [text,id] of [['Calendar','operation-calendar'],['Recruitment','recruitment'],['Gallery','gallery'],['Commands','command-guide']]){const a=el(id==='command-guide'?'button':'a',text,'resource-button');if(id==='command-guide'){a.type='button';a.onclick=showCommands;a.setAttribute('aria-haspopup','dialog');a.setAttribute('aria-controls','command-dialog');}else a.href='#'+id;jumps.append(a);}document.getElementById('about')?.before(jumps);
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
  guide.innerHTML = `<div class="section-head"><div><span class="mono">NEW TO THE UIU?</span><h2 id="guide-title">Start here.</h2></div><p>From joining the server to your first operation: start here, then follow the community’s current instructions in Discord.</p></div>
    <ol class="member-steps"><li><h3>Meet the community.</h3><p>Join our Discord, read the rules and follow any verification instructions shown there. Ask staff if you need help getting access.</p><a href="https://discord.gg/qmdEWAhBUy" class="button" target="_blank" rel="noopener noreferrer">JOIN DISCORD &rarr;</a></li>
    <li><h3>Find your department.</h3><p>Explore the teams and their duties. Contact the relevant department lead in Discord about openings and requirements; a listing does not mean recruitment is open.</p><a href="#departments">EXPLORE DEPARTMENTS &rarr;</a></li>
    <li><h3>Attend your first training.</h3><p>Use <code>/training sessions</code> in Discord to find a session, then <code>/training join</code> with its ID before it starts. Ask staff which training suits your department.</p><p>Check your results with <code>/training results</code>. Staff record qualifications separately.</p><a href="#uiu-week">SEE WHAT IS COMING UP &rarr;</a></li>
    <li><h3>Join your first operation.</h3><p>Check the Ops Board for upcoming sessions. Read the briefing in Discord and use the bot’s Join button before the scheduled start. Staff confirm attendance afterward.</p><a href="#operations">VIEW OPS BOARD &rarr;</a></li></ol>
    <div class="contact-note"><h3>Keep it fictional. Keep it respectful.</h3><p>Use fictional details in case reports, follow server rules, and agree roleplay boundaries with others. Questions about participation go to staff in Discord.</p><div class="guide-links"><a href="#questions">Read the FAQ</a><a href="./privacy.html">Your privacy</a><a href="./terms.html">Terms of Service</a></div></div>`;
  const questions = document.getElementById('questions');
  const weekly = document.getElementById('uiu-week');
  if (weekly) weekly.after(guide); else if (questions) questions.before(guide); else about.after(guide);
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


/* Four-page navigation; query URLs work directly on GitHub Pages. */
(() => {
'use strict';
const main=document.querySelector('main'),nav=document.querySelector('header nav');
if(!main||!nav)return;
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const pages={home:{label:'Home',title:'FBI / UIU — Unusual Incidents Unit'},unit:{label:'Our unit',title:'Our unit — FBI / UIU'},operations:{label:'Operations',title:'Operations — FBI / UIU'},archives:{label:'Case archives',title:'Case archives — FBI / UIU'}};
const groups={
 home:['uiu-week','announcements'],
 unit:['member-guide','about','leadership','departments','recruitment','community','questions','join'],
 operations:['operations','training-schedule','operation-calendar','gallery','games'],
 archives:['case-files','case-managers','briefings','experience']
};
const destinations={};
for(const [page,ids] of Object.entries(groups))for(const id of ids)destinations[id]=page;
const style=el('style');style.textContent=`
main>[hidden]{display:none!important}header .nav{display:flex;flex-wrap:wrap;gap:20px;align-items:center}header nav{flex:1;justify-content:center;gap:22px}header nav a{white-space:nowrap}header nav a[aria-current=page]{color:var(--gold);border-bottom:2px solid var(--gold);padding-bottom:6px}.site-actions{display:flex;gap:10px;align-items:center}.site-actions .resource-button,.site-actions .button{font:12px Arial,sans-serif;padding:11px 13px;white-space:nowrap}.site-page-heading{padding:48px 0 10px}.site-page-heading h1{font:clamp(36px,5vw,60px) Georgia,serif;margin:16px 0}.site-page-heading p{color:var(--muted);max-width:650px}.hero{min-height:480px}.hero h1{font-size:clamp(42px,6vw,72px)}.page-home #news-list:not(.show-older) .news-card:nth-child(n+2){display:none}.page-home #news-list{grid-template-columns:1fr}.older-updates{margin-top:18px}.site-footer-links{display:flex;gap:18px;flex-wrap:wrap;margin-top:20px;font-size:13px}.site-footer-links button{background:none;border:0;color:var(--gold);padding:0;font:inherit;cursor:pointer}.site-actions :focus-visible,.site-footer-links :focus-visible{outline:2px solid var(--gold);outline-offset:4px}
@media(max-width:1050px){header .brand span{display:none}header nav{gap:15px}.site-actions{margin-left:auto}}
@media(max-width:720px){header .nav{gap:14px}header nav{order:3;flex-basis:100%;justify-content:space-between;gap:10px;font-size:12px}.site-actions .button,.site-actions .resource-button{padding:10px}.hero{min-height:auto}.site-page-heading{padding-top:30px}}
`;document.head.append(style);
function urlFor(page,hash=''){const url=new URL(location.href);url.search='';if(page!=='home')url.searchParams.set('page',page);url.hash=hash;return url.pathname+url.search+url.hash;}
function routeLink(label,page,hash){const a=el('a',label);a.href=urlFor(page,hash);a.dataset.uiuRoute='true';return a;}
nav.replaceChildren();
const navLinks={};
for(const [key,page] of Object.entries(pages)){const a=routeLink(page.label,key);navLinks[key]=a;nav.append(a);}
const openButton=document.querySelector('#command-guide button');
function commandButton(){const button=el('button','Find a command','resource-button');button.type='button';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','command-dialog');button.onclick=()=>openButton?.click();return button;}
const actions=el('div',undefined,'site-actions'),discord=el('a','Join Discord','button');discord.href='https://discord.gg/qmdEWAhBUy';actions.append(commandButton(),discord);nav.after(actions);
const brand=document.querySelector('header .brand');if(brand){brand.href=urlFor('home');brand.dataset.uiuRoute='true';}
const commandGuide=document.getElementById('command-guide');if(commandGuide)commandGuide.hidden=true;
const resourceNav=document.querySelector('nav[aria-label="Community resources"]');if(resourceNav)resourceNav.remove();
const pageHeading=el('div',undefined,'site-page-heading'),pageTitle=el('h1'),pageDescription=el('p');
pageHeading.append(el('span','FBI / UIU','mono'),pageTitle,pageDescription);main.prepend(pageHeading);
const descriptions={unit:'Meet the leadership, find your department and get started in the unit.',operations:'Plan your next operation or training session and explore moments from the field.',archives:'Read published case reports, meet the Case Managers and explore roleplay briefings.'};
const training=el('section');training.id='training-schedule';training.setAttribute('aria-labelledby','training-schedule-title');
const trainingTitle=el('h2','Training sessions.');trainingTitle.id='training-schedule-title';
const trainingState=el('p','Training schedule unavailable. Check /training sessions in Discord.','resource-note'),trainingList=el('div',undefined,'resource-grid');trainingState.setAttribute('role','status');
training.append(trainingTitle,el('p','Upcoming training, with times shown in your local timezone. Sign up through the UIU bot in Discord.'),trainingState,trainingList);main.append(training);
document.addEventListener('uiu-stats',event=>{
 const rows=event.detail.activity?.upcoming_training;
 trainingList.replaceChildren();
 if(!Array.isArray(rows)||rows.length>12||!rows.every(r=>r&&Number.isSafeInteger(r.id)&&r.id>0&&typeof r.title==='string'&&r.title.length<=100&&Number.isFinite(Date.parse(r.starts_at)))){trainingState.textContent='Training schedule unavailable. Check /training sessions in Discord.';return;}
 const upcoming=rows.filter(r=>Date.parse(r.starts_at)>=Date.now()).sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at));
 trainingState.textContent=upcoming.length?'Updated '+new Date().toLocaleTimeString()+'. Showing up to 12 upcoming sessions.':'No training sessions scheduled yet.';
 for(const row of upcoming){const card=el('article',undefined,'resource-card'),time=el('time',new Date(row.starts_at).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}));time.dateTime=row.starts_at;card.append(el('h3',row.title),time,el('p','Training #'+row.id),el('code','/training join session_id:'+row.id));trainingList.append(card);}
});
document.addEventListener('uiu-unavailable',()=>{trainingList.replaceChildren();trainingState.textContent='Live training schedule unavailable. Check Discord for confirmed sessions.';});
const news=document.getElementById('announcements'),newsList=document.getElementById('news-list');
if(news&&newsList){const older=el('button','Show older updates','resource-button older-updates');older.type='button';older.setAttribute('aria-expanded','false');older.setAttribute('aria-controls','news-list');older.onclick=()=>{const expanded=newsList.classList.toggle('show-older');older.setAttribute('aria-expanded',String(expanded));older.textContent=expanded?'Hide older updates':'Show older updates';};news.append(older);older.hidden=true;document.addEventListener('uiu-stats',()=>{older.hidden=newsList.children.length<=1;});}
const footer=document.querySelector('footer');
if(footer){const links=el('div',undefined,'site-footer-links');links.append(routeLink('Start here','unit','member-guide'),routeLink('FAQ','unit','questions'),commandButton());footer.append(links);}
const heroAction=document.querySelector('.hero .actions a');if(heroAction)heroAction.setAttribute('href','#member-guide');
// Repair every old section link, including archived links from earlier versions.
for(const a of document.querySelectorAll('a[href^="#"]')){
 const hash=a.getAttribute('href').slice(1);
 const target=document.getElementById(hash);
 const section=target?.closest('main > section');
 const page=destinations[hash]||destinations[section?.id]||(hash===''?'home':null);
 if(page){a.href=urlFor(page,hash);a.dataset.uiuRoute='true';}
}
for(const [page,ids] of Object.entries(groups))for(const id of ids){const node=document.getElementById(id);if(node){node.dataset.uiuPage=page;main.append(node);}}
for(const node of main.children){
 if(node.matches('.hero,.hero-meta,.strip,.community-stats'))node.dataset.uiuPage='home';
}

const compactStyle=el('style');compactStyle.textContent=`
.subpage-menu{display:flex;gap:10px;flex-wrap:wrap;padding:20px 0;border-bottom:1px solid var(--line);margin-bottom:20px}.subpage-menu a{font:13px Arial,sans-serif;padding:11px 16px;border:1px solid var(--line);color:var(--ink)}.subpage-menu a[aria-current=page]{background:var(--gold);color:#101c2c}.subpage-menu a:focus-visible,.compact-detail-button:focus-visible{outline:2px solid var(--gold);outline-offset:3px}
main>section{padding-top:25px;padding-bottom:25px}.site-page-heading{padding-top:22px}.site-page-heading h1{font-size:38px;margin:8px 0}.site-page-heading p{margin:8px 0}.page-home .hero{min-height:0;padding-top:20px;padding-bottom:20px;gap:20px}.page-home .hero h1{font-size:clamp(36px,5vw,58px)}.page-home .seal-panel{min-height:300px;max-height:none;padding:12px 0;box-sizing:border-box;gap:14px}.page-home .seal-panel:before{position:static;transform:none;flex:none;line-height:1.5}.page-home .seal-panel img{max-height:230px;width:auto;max-width:100%;object-fit:contain;flex-shrink:0}.page-home .seal-panel .logo-credit{margin-top:0;flex:none}.page-home .emblem-orbit{max-height:270px;max-width:270px}
#leadership .leadership{grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}#leadership .person{padding:16px;min-width:0}#leadership .person h3{font-size:21px;margin:10px 0}#leadership .person .mono{font-size:10px}#leadership .leader-portrait{margin-bottom:12px;height:135px;object-fit:contain;background:#101c2c}#leadership .initial{font-size:22px;margin-bottom:12px}#leadership .group-title{margin:18px 0 12px;font-size:18px}#leadership>.draft-note{display:none}#leadership>.section-head p{display:none}.compact-detail-button{margin-top:14px;padding:9px 12px;font-size:12px}.compact-dialog{box-sizing:border-box;width:min(700px,calc(100vw - 30px));max-height:85vh;overflow:auto;padding:25px;background:#101c2c;color:var(--ink);border:1px solid var(--gold)}.compact-dialog::backdrop{background:#000b}.compact-dialog h2{font:30px Georgia,serif}.compact-dialog p,.compact-dialog li{font-size:15px;line-height:1.7}.compact-dialog-head{display:flex;justify-content:space-between;align-items:center;gap:20px}.compact-dialog [hidden],.person [hidden],.department-list [hidden]{display:none!important}#departments .department-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}#departments .department-list article{padding:20px;display:block}#departments h3{font-size:24px}
@media(max-width:900px){#leadership .leadership{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){#departments .department-list{grid-template-columns:1fr}.subpage-menu{gap:7px}.subpage-menu a{padding:10px;font-size:12px}#leadership .person{padding:12px}#leadership .leader-portrait{height:110px}.page-home .seal-panel{display:none}}
`;document.head.append(compactStyle);
const detailDialog=el('dialog',undefined,'compact-dialog'),detailHead=el('div',undefined,'compact-dialog-head'),detailTitle=el('h2'),detailClose=el('button','Close','resource-button'),detailBody=el('div');
detailTitle.id='compact-detail-title';detailDialog.setAttribute('aria-labelledby',detailTitle.id);detailClose.type='button';detailHead.append(detailTitle,detailClose);detailDialog.append(detailHead,detailBody);document.body.append(detailDialog);
let detailOpener=null,detailOverflow='';
function openDetails(title,nodes){detailTitle.textContent=title;detailBody.replaceChildren();for(const node of nodes){const copy=node.cloneNode(true);copy.hidden=false;copy.removeAttribute('id');for(const child of copy.querySelectorAll('[id]'))child.removeAttribute('id');detailBody.append(copy);}detailOpener=document.activeElement;detailOverflow=document.body.style.overflow;detailDialog.showModal();document.body.style.overflow='hidden';detailClose.focus();}
detailClose.onclick=()=>detailDialog.close();detailDialog.addEventListener('close',()=>{document.body.style.overflow=detailOverflow;detailOpener?.focus();});
detailDialog.addEventListener('click',event=>{if(event.target!==detailDialog)return;const r=detailDialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)detailDialog.close();});
for(const card of document.querySelectorAll('#leadership .person')){const nodes=[...card.querySelectorAll('.role-description,.duties')];nodes.forEach(n=>n.hidden=true);const button=el('button','View duties','resource-button compact-detail-button');button.type='button';button.setAttribute('aria-haspopup','dialog');button.onclick=()=>openDetails(card.querySelector('h3').textContent,nodes);card.append(button);}
for(const card of document.querySelectorAll('#departments .department-list article')){const nodes=[...card.querySelectorAll('p,a')];nodes.forEach(n=>n.hidden=true);const button=el('button','Explore department','resource-button compact-detail-button');button.type='button';button.setAttribute('aria-haspopup','dialog');button.onclick=()=>openDetails(card.querySelector('h3').textContent,nodes);card.append(button);}

// Community additions.
const extraStyle=el('style');extraStyle.textContent=".home-tools{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;padding:8px 0 24px}.home-tools article{padding:20px;border:1px solid var(--line);background:var(--panel);min-width:0}.home-tools h2{font:23px Georgia,serif;margin:10px 0}.home-tools p{font-size:13px;line-height:1.65;margin:8px 0}.home-tools a{display:inline-block;margin-top:10px;color:var(--gold)}.feature-label{font:10px monospace;letter-spacing:1.2px;color:var(--gold)}.department-statusline{font-size:12px;line-height:1.7;margin:12px 0}.recruit-badge{display:inline-block;padding:5px 8px;border:1px solid var(--line);color:var(--muted);font:11px monospace}.recruit-badge[data-status=open]{border-color:#7ca998;color:#b6decf}.recruit-badge[data-status=closed]{border-color:#c4997e;color:#e9bea3}.profile-portrait{display:block;border:0;padding:0;background:transparent;width:100%;cursor:pointer}.profile-portrait .leader-portrait{width:100%}.profile-portrait:focus-visible{outline:2px solid var(--gold);outline-offset:3px}.profile-meta{color:var(--gold);line-height:1.8}.compact-dialog .leader-portrait{display:block;width:min(100%,360px);height:auto;max-height:230px;object-fit:contain;margin:16px 0}.leader-tools{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:14px 0 20px}.leader-tools label{font-size:12px}.leader-tools input,.support-form select,.support-form textarea,.site-search-input{box-sizing:border-box;background:#0b1421;color:var(--ink);border:1px solid var(--line);padding:12px;font:14px Arial,sans-serif;max-width:100%}.leader-tools input{display:block;margin-top:7px;width:290px}.leader-count{font-size:12px;color:var(--muted)}#leadership .leadership[hidden],#leadership .group-title[hidden]{display:none!important}.support-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.support-form label{display:block;font-size:13px;margin:15px 0 7px}.support-form textarea,.support-form select{width:100%}.support-form textarea{min-height:120px;resize:vertical;line-height:1.6}.support-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.support-form .resource-note{font-size:12px}.join-checklist{border:1px solid var(--line);padding:22px;margin-top:24px}.join-checklist h3{margin-top:0;font:25px Georgia,serif}.join-checklist label{display:flex;gap:12px;align-items:flex-start;padding:10px 0;font-size:14px;line-height:1.6;cursor:pointer}.join-checklist input{accent-color:var(--gold);margin-top:4px;flex:none}.join-checklist progress{width:100%;height:8px;accent-color:var(--gold)}.site-search-input{width:100%;margin:18px 0 12px}.site-search-results{display:grid;gap:8px}.site-search-results a{display:block;border:1px solid var(--line);padding:13px;color:var(--ink);line-height:1.5}.site-search-results small{display:block;color:var(--muted);font-size:12px}.site-actions{flex-wrap:wrap}.support-grid a{color:var(--gold)}@media(max-width:850px){.home-tools,.support-grid{grid-template-columns:1fr}.home-tools article{padding:17px}.site-actions{gap:7px}.site-actions .resource-button{padding:10px;font-size:11px}}";document.head.append(extraStyle);
const contactsByDepartment={'Tactical Pilots':'Impaled / GOI-22','TOD':'Jacksaan / GOI-23','Mobile Occult Operations Team':'SiloMaro','Financial':'Shaxx / GOI-25','Internal Affairs':'Shaxx / GOI-25'};
const leaderDepartments=['UIU leadership','UIU leadership','FBI leadership','FBI leadership','Tactical Pilots','TOD','Mobile Occult Operations Team','Financial / Internal Affairs'];
const leaders=[...document.querySelectorAll('#leadership .person')];
leaders.forEach((card,i)=>{
 const name=card.querySelector('h3').textContent,rank=card.querySelector('.mono'),callsign=card.querySelector('.callsign'),portrait=card.querySelector('img');
 const nodes=[portrait,rank,callsign,el('p',leaderDepartments[i],'profile-meta'),...card.querySelectorAll('.role-description,.duties')].filter(Boolean);
 const button=card.querySelector('.compact-detail-button');button.textContent='View profile';button.setAttribute('aria-label','View profile of '+name);button.onclick=()=>openDetails(name,nodes);
 if(portrait){const b=el('button',undefined,'profile-portrait');b.type='button';b.setAttribute('aria-label','Open profile of '+name);b.setAttribute('aria-haspopup','dialog');portrait.before(b);b.append(portrait);b.onclick=button.onclick;}
 card.dataset.leaderSearch=(name+' '+rank?.textContent+' '+leaderDepartments[i]+' '+(callsign?.textContent||'')).toLowerCase();
});
const leaderSection=document.getElementById('leadership'),leaderTools=el('div',undefined,'leader-tools'),leaderLabel=el('label','Find a leader'),leaderInput=el('input'),leaderCount=el('p',undefined,'leader-count');
leaderInput.type='search';leaderInput.placeholder='Name, rank or department';leaderInput.id='leader-search';leaderLabel.htmlFor=leaderInput.id;leaderLabel.append(leaderInput);leaderCount.setAttribute('role','status');leaderTools.append(leaderLabel,leaderCount);leaderSection.querySelector('.section-head').after(leaderTools);
function filterLeaders(){let count=0;const q=leaderInput.value.trim().toLowerCase();for(const card of leaders){card.hidden=!card.dataset.leaderSearch.includes(q);if(!card.hidden)count++;}for(const grid of leaderSection.querySelectorAll('.leadership')){const empty=[...grid.querySelectorAll('.person')].every(c=>c.hidden);grid.hidden=empty;const title=grid.previousElementSibling;if(title?.classList.contains('group-title'))title.hidden=empty;}leaderCount.textContent=count?count+' of '+leaders.length+' leaders':'No matching leaders. Try another name or department.';}
leaderInput.addEventListener('input',filterLeaders);filterLeaders();
const departmentCards=[...document.querySelectorAll('#departments .department-list article')],recruitmentState=new Map(),statusLabels={open:'Accepting members',closed:'Recruitment closed',unconfirmed:'Status unconfirmed'};
function departmentStatus(card){
 const department=card.querySelector('h3').textContent,row=recruitmentState.get(department),state=row?.status||'unconfirmed';let line=card.querySelector('.department-statusline');if(!line){line=el('div',undefined,'department-statusline');card.querySelector('h3').after(line);}line.replaceChildren();const badge=el('span',statusLabels[state],'recruit-badge');badge.dataset.status=state;line.append(badge);if(contactsByDepartment[department])line.append(el('p','Contact: '+contactsByDepartment[department]));const button=card.querySelector('.compact-detail-button');button.onclick=()=>openDetails(department,[line,...card.querySelectorAll('p[hidden],a[hidden]')]);
}
departmentCards.forEach(departmentStatus);
document.addEventListener('uiu-community',event=>{
 for(const row of event.detail.recruitment)if(row&&typeof row.department==='string'&&Object.hasOwn(statusLabels,row.status))recruitmentState.set(row.department,row);
 departmentCards.forEach(departmentStatus);
 for(const card of document.querySelectorAll('#recruitment .resource-card')){const contact=contactsByDepartment[card.querySelector('h3')?.textContent];if(contact&&!card.querySelector('.recruit-contact'))card.append(el('p','Department contact: '+contact,'recruit-contact'));}
});
const support=el('section');support.id='support';support.dataset.uiuPage='unit';support.setAttribute('aria-labelledby','support-title');const supportTitle=el('h2','Need a hand?');supportTitle.id='support-title';support.append(el('span','UIU / SUPPORT','mono'),supportTitle,el('p','Get help with the website, joining the unit or finding the right person.'));
const supportGrid=el('div',undefined,'support-grid'),report=el('article',undefined,'resource-card support-form'),contacts=el('article',undefined,'resource-card');supportGrid.append(report,contacts);support.append(supportGrid);main.append(support);groups.unit.push('support');destinations.support='unit';
report.append(el('h3','Report a website issue'),el('p','Prepare a short report, then paste it to staff in Discord. Nothing is sent from this page.'));
const typeLabel=el('label','What needs attention?'),issueType=el('select');issueType.id='issue-type';typeLabel.htmlFor=issueType.id;for(const value of ['Website bug','Outdated information','Suggestion'])issueType.append(el('option',value));
const descriptionLabel=el('label','What happened or needs changing?'),issueDescription=el('textarea');issueDescription.id='issue-description';issueDescription.maxLength=1500;descriptionLabel.htmlFor=issueDescription.id;issueDescription.placeholder='Include the affected page, what you expected and what you saw.';
const reportStatus=el('p','A screenshot can help staff understand a visual issue.','resource-note');reportStatus.setAttribute('role','status');const reportActions=el('div',undefined,'support-actions'),copyReport=el('button','Copy report','resource-button'),discordReport=el('a','Open Discord','button');copyReport.type='button';discordReport.href=discord.href;discordReport.target='_blank';discordReport.rel='noopener noreferrer';reportActions.append(copyReport,discordReport);report.append(typeLabel,issueType,descriptionLabel,issueDescription,reportActions,reportStatus);
copyReport.onclick=async()=>{const details=issueDescription.value.trim();if(!details){reportStatus.textContent='Add a short description before copying your report.';issueDescription.focus();return;}const text='FBI UIU WEBSITE REPORT\nType: '+issueType.value+'\nPage: '+location.origin+location.pathname+location.search+location.hash+'\nDetails: '+details;try{await navigator.clipboard.writeText(text);reportStatus.textContent='Report copied. Open Discord and paste it to staff.';}catch{reportStatus.textContent='Copy is unavailable in this browser. Select your description and copy it manually.';issueDescription.focus();issueDescription.select();}};
contacts.append(el('h3','Find the right contact'),el('p','Joining or verification: ask staff in Discord.'),el('p','Department openings: contact the listed department lead.'),el('p','Casework: check the Case Manager roster.'),routeLink('Department contacts','unit','departments'),el('br'),routeLink('Case Managers','archives','case-managers'),el('p',"For reports about members, use the server's reporting process. Do not put passwords or personal details in a website report.",'resource-note'));
footer?.querySelector('.site-footer-links')?.append(routeLink('Report an issue','unit','support'));
const checklist=el('div',undefined,'join-checklist');checklist.append(el('h3','Your joining checklist'),el('p','Track your next steps. Saved only in this browser; this does not verify membership or training.','resource-note'));
const checklistProgress=el('progress'),checklistStatus=el('p',undefined,'resource-note');checklistProgress.max=3;checklistProgress.setAttribute('aria-label','Joining checklist progress');checklistStatus.setAttribute('role','status');checklist.append(checklistProgress,checklistStatus);
let savedChecklist=[];try{const saved=JSON.parse(localStorage.getItem('uiu-joining-checklist-v1')||'[]');if(Array.isArray(saved))savedChecklist=saved.filter(v=>Number.isInteger(v)&&v>=0&&v<3);}catch{}
const checklistInputs=[];let checklistStorage=true;
function checklistUpdate(save=false){const checked=checklistInputs.flatMap((box,i)=>box.checked?[i]:[]);checklistProgress.value=checked.length;if(save)try{localStorage.setItem('uiu-joining-checklist-v1',JSON.stringify(checked));}catch{checklistStorage=false;}checklistStatus.textContent=checked.length+' of 3 steps complete'+(checklistStorage?'':' (saved for this visit only)');}
['Join Discord, read the rules and complete verification.','Ask a department lead about the role you want.','Check the operation or training schedule for your first session.'].forEach((text,i)=>{const label=el('label'),input=el('input');input.type='checkbox';input.checked=savedChecklist.includes(i);input.addEventListener('change',()=>checklistUpdate(true));label.append(input,el('span',text));checklistInputs.push(input);checklist.append(label);});
const resetChecklist=el('button','Reset checklist','resource-button');resetChecklist.type='button';resetChecklist.onclick=()=>{checklistInputs.forEach(b=>b.checked=false);checklistUpdate(true);};checklist.append(resetChecklist);document.getElementById('member-guide').append(checklist);checklistUpdate();
const caseIndex=[...document.querySelectorAll('.public-case')].map((file,i)=>{file.id=file.id||'published-case-'+(i+1);const summary=file.querySelector('summary'),title=[...summary.children].map(n=>n.textContent).join(' ').replace(/OPEN\s*\/\s*CLOSE FILE|CLOSED|\+/g,'').replace(/\s+/g,' ').trim();const dt=[...file.querySelectorAll('dt')].find(n=>n.textContent.trim()==='File date'),dateText=dt?.nextElementSibling?.textContent.split('/')[0].trim();return{file,title,dateText,date:Date.parse(dateText)};});
const latest=caseIndex.filter(r=>Number.isFinite(r.date)).sort((a,b)=>b.date-a.date)[0],homeTools=el('div',undefined,'home-tools');homeTools.dataset.uiuPage='home';homeTools.setAttribute('aria-label','Community quick links');
function homeCard(label,title,description,link){const c=el('article');c.append(el('span',label,'feature-label'),el('h2',title),el('p',description),link);homeTools.append(c);}
homeCard('FIND YOUR TEAM','Department openings','Check recruitment status and find the right lead before applying.',routeLink('Explore departments','unit','departments'));
if(latest)homeCard('LATEST FILE BY REPORT DATE',latest.title,'File dated '+latest.dateText+'. Read the full published dossier.',routeLink('Read case report','archives',latest.file.id));
homeCard('COMMUNITY SUPPORT','Need help?','Find a contact or report a website bug or outdated information.',routeLink('Get help','unit','support'));document.querySelector('.community-stats').after(homeTools);
const siteSearch=el('dialog',undefined,'compact-dialog');siteSearch.id='site-search-dialog';siteSearch.setAttribute('aria-labelledby','site-search-title');
const siteSearchHead=el('div',undefined,'compact-dialog-head'),siteSearchTitle=el('h2','Search the site'),siteSearchClose=el('button','Close','resource-button');siteSearchTitle.id='site-search-title';siteSearchClose.type='button';siteSearchHead.append(siteSearchTitle,siteSearchClose);
const siteSearchInput=el('input',undefined,'site-search-input');siteSearchInput.type='search';siteSearchInput.setAttribute('aria-label','Search pages, people and case files');siteSearchInput.placeholder='Try Impaled, Financial, Missouri or training';const searchStatus=el('p',undefined,'resource-note'),searchResults=el('div',undefined,'site-search-results');searchStatus.setAttribute('role','status');siteSearch.append(siteSearchHead,siteSearchInput,searchStatus,searchResults);document.body.append(siteSearch);
const searchEntries=[['Start here','Joining guide and checklist','unit','member-guide'],['Departments','Recruitment status and department contacts','unit','departments'],['Recruitment','Published department openings','unit','recruitment'],['This week','Upcoming operations, training and announcements','home','uiu-week'],['Updates','Community announcements','home','announcements'],['Ops Board','Operations and briefings','operations','operations'],['Training','Upcoming training sessions','operations','training-schedule'],['Calendar','Operation dates','operations','operation-calendar'],['Help','Report a website issue or find a contact','unit','support'],['Case Managers','Public casework roster','archives','case-managers'],['FAQ','Frequently asked questions','unit','questions']];
leaders.forEach((card,i)=>searchEntries.push([card.querySelector('h3').textContent,leaderDepartments[i]+' / '+(card.querySelector('.mono')?.textContent||''),'unit','leadership',i]));caseIndex.forEach(c=>searchEntries.push([c.title,'Published case file / '+c.dateText,'archives',c.file.id]));
let searchOpener=null,searchOverflow='';
function drawSiteSearch(){searchResults.replaceChildren();const q=siteSearchInput.value.trim().toLowerCase(),rows=searchEntries.filter(r=>(r[0]+' '+r[1]).toLowerCase().includes(q));searchStatus.textContent=rows.length+' '+(rows.length===1?'result':'results')+(rows.length>10?' (showing the first 10)':'');for(const [title,description,page,id,leader] of rows.slice(0,10)){const a=routeLink(title,page,id);a.append(el('small',description));a.addEventListener('click',()=>{if(leader!==undefined){leaderInput.value='';filterLeaders();}siteSearch.close();if(leader!==undefined)requestAnimationFrame(()=>leaders[leader].querySelector('.compact-detail-button').click());});searchResults.append(a);}}
const searchSiteButton=el('button','Search site','resource-button');searchSiteButton.type='button';searchSiteButton.setAttribute('aria-haspopup','dialog');searchSiteButton.setAttribute('aria-controls',siteSearch.id);searchSiteButton.onclick=()=>{if(detailDialog.open)detailDialog.close();searchOpener=document.activeElement;searchOverflow=document.body.style.overflow;siteSearchInput.value='';drawSiteSearch();siteSearch.showModal();document.body.style.overflow='hidden';siteSearchInput.focus();};actions.prepend(searchSiteButton);siteSearchClose.onclick=()=>siteSearch.close();siteSearchInput.addEventListener('input',drawSiteSearch);siteSearch.addEventListener('close',()=>{document.body.style.overflow=searchOverflow;searchOpener?.focus();});



// Reference desk and browser-local case reading tools.
const deskStyle=el('style');deskStyle.textContent='.desk-tools{display:flex;gap:12px;flex-wrap:wrap;align-items:end;margin:22px 0}.desk-tools label{display:block;font-size:12px}.desk-tools input{display:block;box-sizing:border-box;margin-top:8px;width:320px;max-width:100%;padding:12px;background:#0b1421;border:1px solid var(--line);color:var(--ink);font:14px Arial,sans-serif}.desk-result{font-size:13px;color:var(--muted)}.glossary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.glossary-card{padding:20px;border:1px solid var(--line);background:var(--panel);min-width:0}.glossary-card h3{font:23px Georgia,serif;margin:0 0 12px}.glossary-card p{font-size:14px;line-height:1.75;margin:0}.case-reading-tools{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:16px 0;border-bottom:1px solid var(--line);margin-bottom:20px}.case-reading-tools button{font-size:12px}.case-reading-status{flex-basis:100%;font-size:12px;color:var(--muted);margin:0}.saved-report-card a{display:inline-block;color:var(--gold);margin:10px 15px 10px 0}.saved-report-card h3{font:25px Georgia,serif}.saved-empty{padding:24px;border:1px dashed var(--line);color:var(--muted)}#glossary [hidden],#saved-reports [hidden]{display:none!important}@media(max-width:650px){.glossary-grid{grid-template-columns:1fr}.desk-tools label,.desk-tools input{width:100%}.case-reading-tools{gap:8px}.case-reading-tools button{padding:10px;font-size:11px}}';document.head.append(deskStyle);
function deskSection(id,title,description,page){const s=el('section');s.id=id;s.dataset.uiuPage=page;const h=el('h2',title);h.id=id+'-title';s.setAttribute('aria-labelledby',h.id);s.append(el('span','UIU / REFERENCE DESK','mono'),h,el('p',description));main.append(s);groups[page].push(id);destinations[id]=page;return s;}
const glossary=deskSection('glossary','Unit glossary.','A quick reference for terms used across our roleplay. Department rules and instructions are confirmed in Discord.','unit');
const glossaryTools=el('div',undefined,'desk-tools'),glossaryLabel=el('label','Find a term'),glossarySearch=el('input'),glossaryCount=el('p',undefined,'desk-result'),glossaryGrid=el('div',undefined,'glossary-grid');
glossarySearch.id='glossary-search';glossarySearch.type='search';glossarySearch.placeholder='Try IA, anomaly or debrief';glossaryLabel.htmlFor=glossarySearch.id;glossaryLabel.append(glossarySearch);glossaryCount.setAttribute('role','status');glossaryTools.append(glossaryLabel,glossaryCount);glossary.append(glossaryTools,glossaryGrid);
const terms=[
 ['UIU','Unusual Incidents Unit','Our fictional unit investigates unusual incidents and brings specialist departments together for roleplay.'],
 ['IA','Internal Affairs','The internal review function, led by Shaxx. Concerns about personnel conduct, missing evidence or misuse of unusual objects should follow the server reporting process.'],
 ['M.O.O.T','Mobile Occult Operations Team','The specialist team for field-based occult and unusual-incident roleplay, led by SiloMaro.'],
 ['Anomaly','An unusual phenomenon','An object, entity or event with unexplained properties within a fictional scenario. Its details depend on the case.'],
 ['IC','In character','Actions, knowledge and conversations belonging to your roleplay character.'],
 ['OOC','Out of character','Conversations between players about planning, rules or other matters outside the fictional scene.'],
 ['Case file','The investigation record','A record of a fictional incident, its evidence, developments and findings. Published dossiers are available in Case archives.'],
 ['Case Manager','Casework coordination','A member of the Case Manager team who can manage cases through the UIU bot. Check the public roster for current members.'],
 ['Briefing','Before the session','A shared explanation of the scenario, roles and objectives before an operation. Confirm attendance and instructions in Discord.'],
 ['Debrief','After the session','A review of what happened, what was learned and what needs to be recorded or followed up.'],
 ['Containment','Managing an anomalous incident','A fictional effort to secure an unusual object or limit its effects within an agreed roleplay scenario.'],
 ['Financial','Funding and financial casework','The division led by Shaxx, covering fictional unit resources and financial leads connected to anomalous incidents.']
];
function drawGlossary(){glossaryGrid.replaceChildren();const q=glossarySearch.value.trim().toLowerCase(),rows=terms.filter(r=>r.join(' ').toLowerCase().includes(q));glossaryCount.textContent=rows.length+' '+(rows.length===1?'term':'terms')+' found';if(!rows.length)glossaryGrid.append(el('p','No matching terms. Try an abbreviation or another word.','saved-empty'));for(const [term,title,description] of rows){const card=el('article',undefined,'glossary-card');card.append(el('span',term,'feature-label'),el('h3',title),el('p',description));glossaryGrid.append(card);}}
glossarySearch.addEventListener('input',drawGlossary);drawGlossary();
const savedReports=deskSection('saved-reports','Saved reports.','Keep published case reports handy. Saved reports stay in this browser and do not change the case or its status.','archives'),savedNote=el('p',undefined,'desk-result'),savedGrid=el('div',undefined,'resource-grid');savedNote.setAttribute('role','status');savedReports.append(savedNote,savedGrid);
const readingRows=caseIndex.map(row=>({...row,key:row.title.toLowerCase().replace(/[^a-z0-9]+/g,'-')}));
let savedKeys=new Set(),savedPersistent=true;
try{const rows=JSON.parse(localStorage.getItem('uiu-saved-reports-v1')||'[]');if(Array.isArray(rows))savedKeys=new Set(rows.filter(key=>typeof key==='string'&&readingRows.some(r=>r.key===key)));}catch{savedPersistent=false;}
const saveButtons=new Map();
function persistSaved(){try{localStorage.setItem('uiu-saved-reports-v1',JSON.stringify([...savedKeys]));}catch{savedPersistent=false;}}
function updateSaved(){
 savedGrid.replaceChildren();const rows=readingRows.filter(row=>savedKeys.has(row.key));savedNote.textContent=rows.length+' saved '+(rows.length===1?'report':'reports')+(savedPersistent?' in this browser.':' for this visit. Browser storage is unavailable.');
 for(const row of readingRows){const button=saveButtons.get(row.key);if(button){const saved=savedKeys.has(row.key);button.textContent=saved?'Saved report':'Save report';button.setAttribute('aria-pressed',String(saved));button.setAttribute('aria-label',(saved?'Unsave ':'Save ')+row.title);}}
 if(!rows.length){const empty=el('div',undefined,'saved-empty');empty.append(el('p','No saved reports yet. Open a dossier and choose Save report.'),routeLink('Browse case reports','archives','case-files'));savedGrid.append(empty);}
 for(const row of rows){const card=el('article',undefined,'resource-card saved-report-card'),remove=el('button','Remove','resource-button');remove.type='button';remove.setAttribute('aria-label','Remove '+row.title+' from saved reports');remove.onclick=()=>{savedKeys.delete(row.key);persistSaved();updateSaved();};card.append(el('h3',row.title),el('p','File dated '+row.dateText),routeLink('Read report','archives',row.file.id),remove);savedGrid.append(card);}
}
for(const row of readingRows){const body=row.file.querySelector('.public-case-body');if(!body)continue;const bar=el('div',undefined,'case-reading-tools'),save=el('button','Save report','resource-button'),expand=el('button','Expand sections','resource-button'),collapse=el('button','Collapse sections','resource-button'),note=el('p','Read by section or save this report for later.','case-reading-status');for(const b of [save,expand,collapse])b.type='button';note.setAttribute('role','status');saveButtons.set(row.key,save);
 save.onclick=()=>{const wasSaved=savedKeys.has(row.key);if(wasSaved)savedKeys.delete(row.key);else savedKeys.add(row.key);persistSaved();updateSaved();note.textContent=wasSaved?'Removed from saved reports.':savedPersistent?'Report saved in this browser.':'Report saved for this visit only.';};
 expand.onclick=()=>{for(const part of row.file.querySelectorAll('.case-report-details'))part.open=true;note.textContent='All report sections expanded.';};
 collapse.onclick=()=>{for(const part of row.file.querySelectorAll('.case-report-details'))part.open=false;note.textContent='All report sections collapsed. Open a heading to read it.';};
 bar.append(save,expand,collapse,note);body.prepend(bar);
}
updateSaved();
searchEntries.push(['Internal Affairs','IA / Shaxx / internal review and personnel conduct','unit','department-internal-affairs'],['Unit glossary','Abbreviations and roleplay terms','unit','glossary'],['Saved reports','Bookmarked case files saved in this browser','archives','saved-reports']);
const iaContact=el('p','Internal Affairs matters: contact Shaxx / GOI-25 in Discord and follow the server reporting process.');contacts.querySelector('h3').after(iaContact);



// Chain of command, report drafting and uniform reference guide.
const resourcesStyle=el('style');resourcesStyle.textContent="\n.resource-switch{display:flex;gap:9px;flex-wrap:wrap;margin:24px 0}.resource-switch a{padding:11px 15px;border:1px solid var(--line);font:13px Arial,sans-serif}.resource-switch a[aria-current=page]{background:var(--gold);color:#101c2c}.resource-view[hidden],.generated-report[hidden]{display:none!important}.resource-view>h3{font:30px Georgia,serif;margin:24px 0 12px}.resource-intro{color:var(--muted);font-size:14px;max-width:760px;line-height:1.75}.coc-layout{display:grid;grid-template-columns:1.4fr 1fr;gap:20px;align-items:start}.coc-column{border:1px solid var(--line);padding:22px;background:var(--panel);min-width:0}.coc-column h4{font:25px Georgia,serif;margin:0 0 18px}.coc-chain{list-style:none;padding:0;margin:0;display:grid;gap:12px}.coc-chain>li{padding:16px;border-left:2px solid var(--gold);background:#0a1421}.coc-chain .feature-label{display:block;line-height:1.6}.coc-person{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px}.coc-person>div{min-width:0}.coc-person strong{display:block;overflow-wrap:anywhere}.coc-person small{display:block;color:var(--muted);line-height:1.6}.coc-person button{font-size:11px;padding:8px;flex:none}.coc-departments{display:grid;gap:14px;margin-top:12px}.coc-departments>div{padding-top:10px;border-top:1px solid var(--line)}.form-layout{display:grid;grid-template-columns:minmax(0,1.8fr) minmax(220px,1fr);gap:20px;align-items:start}.unit-form,.form-help,.uniform-card{padding:24px;border:1px solid var(--line);background:var(--panel);min-width:0}.unit-form fieldset{border:0;padding:0;margin:0 0 22px;min-width:0}.unit-form legend{font:23px Georgia,serif;margin-bottom:15px}.unit-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.unit-form-field{display:block;min-width:0;font-size:13px;line-height:1.6}.unit-form-field.wide{grid-column:1/-1}.unit-form-field input,.unit-form-field select,.unit-form-field textarea,.uniform-tools select,.draft-preview{box-sizing:border-box;display:block;width:100%;margin-top:7px;padding:12px;background:#0b1421;border:1px solid var(--line);color:var(--ink);font:14px Arial,sans-serif}.unit-form-field textarea{min-height:105px;resize:vertical;line-height:1.6}.unit-form :focus-visible,.resource-switch a:focus-visible,.uniform-tools select:focus-visible,.draft-preview:focus-visible{outline:2px solid var(--gold);outline-offset:3px}.form-help h4{font:23px Georgia,serif;margin:0 0 15px}.form-help p,.form-help li{font-size:13px;line-height:1.8}.form-help ul{padding-left:18px}.form-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}.form-actions button:disabled{opacity:.5;cursor:not-allowed}.form-status{font-size:13px;line-height:1.6;color:var(--muted)}.generated-report{margin-top:25px}.generated-report h4{font:24px Georgia,serif;margin:0 0 12px}.draft-preview{min-height:280px;font:12px/1.8 monospace;white-space:pre-wrap;resize:vertical}.uniform-tools{display:flex;gap:16px;flex-wrap:wrap;margin:22px 0}.uniform-tools label{min-width:180px;font-size:12px;flex:1}.uniform-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.uniform-card h4{font:26px Georgia,serif;margin:15px 0}.uniform-card dl{margin:18px 0}.uniform-card dt{font:11px monospace;letter-spacing:1px;color:var(--gold);margin-top:16px}.uniform-card dd{margin:7px 0 0;font-size:14px;line-height:1.7;color:var(--muted)}.uniform-checks{list-style:decimal;padding-left:20px}.uniform-checks li{font-size:14px;line-height:1.8;margin-bottom:12px}.uniform-card a{color:var(--gold)}\n@media(max-width:800px){.coc-layout,.form-layout,.uniform-grid{grid-template-columns:1fr}.form-help{order:-1}.coc-person{align-items:flex-start}.resource-switch{gap:7px}.resource-switch a{padding:10px;font-size:12px}}\n@media(max-width:560px){.unit-form-grid{grid-template-columns:1fr}.unit-form,.form-help,.uniform-card,.coc-column{padding:18px}.uniform-tools label{min-width:100%}.coc-person button{max-width:100px}.unit-form-field.wide{grid-column:auto}}";document.head.append(resourcesStyle);
const resourceSection=deskSection('resources','Unit resources.','Leadership contacts, report drafts and uniform references in one place.','unit'),resourceSwitch=el('nav'),resourceBody=el('div');
resourceSwitch.className='resource-switch';resourceSwitch.setAttribute('aria-label','Unit resources');resourceSection.append(resourceSwitch,resourceBody);
const resourceViews={},resourceLinks={};
for(const [id,label] of [['chain-of-command','Chain of command'],['finance-form','Finance form'],['ia-form','IA form'],['uniform-guide','Uniform guide']]){const a=routeLink(label,'unit',id);resourceSwitch.append(a);resourceLinks[id]=a;const view=el('div',undefined,'resource-view');view.id=id;view.hidden=true;resourceBody.append(view);resourceViews[id]=view;}
function selectResourcePanel(hash){const chosen=Object.hasOwn(resourceViews,hash)?hash:'chain-of-command';for(const [id,node] of Object.entries(resourceViews)){node.hidden=id!==chosen;resourceLinks[id].toggleAttribute('aria-current',id===chosen);if(id===chosen)resourceLinks[id].setAttribute('aria-current','page');}}
function resourceHeading(view,title,description){view.append(el('h3',title),el('p',description,'resource-intro'));}
const chainView=resourceViews['chain-of-command'];resourceHeading(chainView,'Chain of command','Find the right leadership contact. Start with your department lead for routine matters and follow the server rules for reporting and escalation. UIU and FBI leadership are shown separately.');
const chainLayout=el('div',undefined,'coc-layout'),uiuChain=el('article',undefined,'coc-column'),fbiChain=el('article',undefined,'coc-column');uiuChain.append(el('h4','UIU command'));fbiChain.append(el('h4','FBI leadership'));chainLayout.append(uiuChain,fbiChain);chainView.append(chainLayout);
function chainPerson(name,roleOverride){const source=leaders.find(c=>c.querySelector('h3').textContent===name),row=el('div',undefined,'coc-person'),text=el('div');text.append(el('strong',name),el('small',roleOverride||source?.querySelector('.mono')?.textContent||''));const callsign=source?.querySelector('.callsign')?.textContent;if(callsign)text.append(el('small',callsign));row.append(text);if(source){const b=el('button','View profile','resource-button');b.type='button';b.setAttribute('aria-label','View '+name+' from chain of command');b.setAttribute('aria-haspopup','dialog');b.onclick=()=>source.querySelector('.compact-detail-button').click();row.append(b);}return row;}
function chainStage(list,label,person){const li=el('li');li.append(el('span',label,'feature-label'));if(person)li.append(person);list.append(li);return li;}
const uiuList=el('ol',undefined,'coc-chain'),fbiList=el('ol',undefined,'coc-chain');uiuChain.append(uiuList);fbiChain.append(fbiList);
chainStage(uiuList,'DIRECTOR',chainPerson('gdandraffriend'));chainStage(uiuList,'DEPUTY DIRECTOR',chainPerson('Logibear'));const departmentStage=chainStage(uiuList,'DEPARTMENT LEADERSHIP'),departmentChain=el('div',undefined,'coc-departments');departmentStage.append(departmentChain);
for(const [name,dept] of [['Impaled','Tactical Pilots'],['Jacksaan','TOD / Trial director'],['SiloMaro','Mobile Occult Operations Team'],['Shaxx','Financial and Internal Affairs']])departmentChain.append(chainPerson(name,dept));
chainStage(uiuList,'DEPARTMENT PERSONNEL',el('p','Follow your department leadership and the instructions for the current session.'));
chainStage(fbiList,'FBI DIRECTOR',chainPerson('HIM12345t'));chainStage(fbiList,'FBI DEPUTY DIRECTOR',chainPerson('AgentK_0081'));chainStage(fbiList,'FBI PERSONNEL',el('p','Follow bureau leadership and the current server role structure.'));
chainView.append(el('p','This view lists the leadership supplied for the website. The full rank structure and any reporting exceptions follow the current server rules.','resource-note'));
const formDepartments=['UIU','FBI','Tactical Pilots','TOD','Mobile Occult Operations Team','Financial','Internal Affairs'];
function formField(grid,prefix,spec){const label=el('label',spec.label+(spec.required?' *':''),'unit-form-field'+(spec.type==='textarea'?' wide':''));let input;if(spec.options){input=el('select');const prompt=el('option','Choose an option');prompt.value='';input.append(prompt);for(const item of spec.options){const option=el('option',item);option.value=item;input.append(option);}}else{input=el(spec.type==='textarea'?'textarea':'input');if(spec.type!=='textarea')input.type=spec.type||'text';input.maxLength=spec.type==='textarea'?4000:120;}input.id=prefix+'-'+spec.key;label.htmlFor=input.id;input.required=!!spec.required;if(spec.placeholder)input.placeholder=spec.placeholder;if(spec.type==='number'){input.min=String(spec.min??0);input.max='999999999';input.step='0.01';}if(spec.type==='textarea'&&spec.required)input.minLength=10;input.autocomplete='off';label.append(input);grid.append(label);return{...spec,input};}
function reportForm(view,kind,types,schemaFactory){const layout=el('div',undefined,'form-layout'),form=el('form',undefined,'unit-form'),help=el('aside',undefined,'form-help');form.noValidate=true;layout.append(form,help);view.append(layout);
 help.append(el('h4','Prepare, review, then send'),el('p','This page creates a draft for Discord. It does not submit a report or create a case.'),el('p','Contact: Shaxx / GOI-25'),el('p',kind==='IA'?'Send IA reports through the approved private reporting route in Discord. Describe observations clearly and identify uncertain details.':'Use fictional roleplay funds and records. A funding request does not approve a purchase or reserve resources.'),el('p','Drafts are not saved by this page. Copy anything you want to keep before reloading.','resource-note'));
 const commonSet=el('fieldset'),commonLegend=el('legend','Your details'),commonGrid=el('div',undefined,'unit-form-grid');commonSet.append(commonLegend,commonGrid);form.append(commonSet);
 const prefix=kind.toLowerCase(),common=[formField(commonGrid,prefix,{key:'reporter',label:'Roblox username',required:true,placeholder:'Your Roblox username'}),formField(commonGrid,prefix,{key:'callsign',label:'Callsign',placeholder:'If assigned'}),formField(commonGrid,prefix,{key:'department',label:'Department / team',required:true,options:formDepartments}),formField(commonGrid,prefix,{key:'case',label:'Case or operation reference',placeholder:'Optional reference'})];
 const detailSet=el('fieldset'),detailLegend=el('legend',kind==='IA'?'Incident details':'Request details'),detailGrid=el('div',undefined,'unit-form-grid');detailSet.append(detailLegend,detailGrid);form.append(detailSet);
 const typeGrid=el('div',undefined,'unit-form-grid'),typeField=formField(typeGrid,prefix,{key:'type',label:kind==='IA'?'Concern type':'Report type',required:true,options:types});commonSet.append(typeGrid);const typeNote=el('p','Changing the report type clears the detail fields.','resource-note');commonSet.append(typeNote);
 let details=[],draft='';const actionRow=el('div',undefined,'form-actions'),generate=el('button','Generate draft','button'),reset=el('button','Clear form','resource-button');generate.type='submit';reset.type='button';actionRow.append(generate,reset);form.append(el('p','* Required fields','resource-note'),actionRow);
 const status=el('p','Complete the fields to generate a draft.','form-status');status.setAttribute('role','status');form.append(status);
 const generated=el('div',undefined,'generated-report'),draftLabel=el('h4','Review your draft'),preview=el('textarea',undefined,'draft-preview'),copy=el('button','Copy draft','resource-button'),select=el('button','Select draft','resource-button'),open=el('a','Open Discord','button'),draftActions=el('div',undefined,'form-actions');generated.hidden=true;preview.readOnly=true;preview.setAttribute('aria-label',kind+' report draft');copy.type=select.type='button';open.href=discord.href;open.target='_blank';open.rel='noopener noreferrer';draftActions.append(copy,select,open);generated.append(draftLabel,preview,draftActions);form.append(generated);
 function invalidate(){draft='';generated.hidden=true;copy.disabled=select.disabled=true;status.textContent='Draft changed. Generate a new preview when ready.';}
 function drawDetails(){detailGrid.replaceChildren();details=schemaFactory(typeField.input.value).map(spec=>formField(detailGrid,prefix,spec));invalidate();}
 typeField.input.addEventListener('change',drawDetails);
 form.addEventListener('input',event=>{event.target.setCustomValidity?.('');invalidate();});form.addEventListener('change',invalidate);
 form.addEventListener('submit',event=>{event.preventDefault();const fields=[...common,typeField,...details];for(const field of fields){field.input.setCustomValidity('');if(field.required&&!field.input.value.trim())field.input.setCustomValidity('Complete this field.');}if(!form.reportValidity()){status.textContent='Complete the required fields and check any highlighted values.';return;}const lines=['FBI / UIU - '+kind+' DRAFT','Type: '+typeField.input.value,''];for(const field of [...common,...details]){const value=field.input.value.trim();if(value)lines.push(field.label+': '+value);}lines.push('','Draft for review - not submitted through the website.');draft=lines.join('\n');preview.value=draft;generated.hidden=false;copy.disabled=select.disabled=false;status.textContent='Draft ready. Review the text, then copy it and send through Discord.';});
 copy.onclick=async()=>{if(!draft)return;try{await navigator.clipboard.writeText(draft);status.textContent='Draft copied. Send it to the appropriate contact in Discord.';}catch{preview.focus();preview.select();status.textContent='Copy is unavailable. The draft is selected; copy it manually.';}};
 select.onclick=()=>{preview.focus();preview.select();status.textContent='Draft selected. Copy it using your browser or keyboard.';};
 reset.onclick=()=>{form.reset();drawDetails();generated.hidden=true;status.textContent='Form cleared. No draft is saved by this page.';};
 drawDetails();status.textContent='Complete the fields to generate a draft.';return{form,common,typeField,get details(){return details;},preview,generated};
}
const financeView=resourceViews['finance-form'];resourceHeading(financeView,'Finance forms','Prepare a funding request, suspicious-transaction report or seized-asset record for review by Financial.');
const financeTypes=['Funding request','Suspicious transaction','Seized asset record'];
const financeForm=reportForm(financeView,'FINANCE',financeTypes,type=>{
 if(type==='Suspicious transaction')return[{key:'entity',label:'Person, group or company involved',required:true},{key:'date',label:'Transaction date, if known',type:'date'},{key:'transaction',label:'Observed transaction',type:'textarea',required:true},{key:'anomalous-link',label:'Connection to the unusual incident',type:'textarea',required:true},{key:'evidence',label:'Evidence links or references',type:'textarea'}];
 if(type==='Seized asset record')return[{key:'asset',label:'Asset or property description',type:'textarea',required:true},{key:'value',label:'Estimated fictional value and currency'},{key:'custody',label:'In-character storage or custody reference',required:true},{key:'circumstances',label:'How the asset was recovered',type:'textarea',required:true},{key:'evidence',label:'Evidence links or references',type:'textarea'}];
 return[{key:'amount',label:'Requested fictional amount',type:'number',min:0.01,required:true},{key:'currency',label:'Currency / fictional unit',required:true,placeholder:'State the unit used in your roleplay'},{key:'needed-by',label:'Needed by, if known',type:'date'},{key:'items',label:'Items or resources requested',type:'textarea',required:true},{key:'reason',label:'Purpose and justification',type:'textarea',required:true}];
});
const iaView=resourceViews['ia-form'];resourceHeading(iaView,'Internal Affairs form','Prepare a factual report for Internal Affairs. Reports are drafts until you send them through the approved Discord reporting process.');
const iaForm=reportForm(iaView,'IA',['Personnel conduct','Evidence handling','Information leak','Misuse of anomalous objects','Other internal concern'],()=>[
 {key:'subject',label:'Personnel or unit involved',required:true,placeholder:'Roblox username, unit, or unknown'},
 {key:'date',label:'Incident date, if known',type:'date'},
 {key:'setting',label:'Game / setting',required:true,options:['ERLC','BRM5','Discord','Other / cross-game']},
 {key:'location',label:'In-character location or channel reference'},
 {key:'observations',label:'What did you observe?',type:'textarea',required:true},
 {key:'witnesses',label:'Witness Roblox usernames, if any'},
 {key:'evidence',label:'Evidence links or references',type:'textarea'},
 {key:'uncertainty',label:'Uncertain details or additional context',type:'textarea'}
]);
const uniformView=resourceViews['uniform-guide'];resourceHeading(uniformView,'Uniform guide','Choose a department and game to find the right uniform contact. Exact approved outfits have not yet been provided for publication.');
const uniformTools=el('div',undefined,'uniform-tools'),uniformDeptLabel=el('label','Department'),uniformGameLabel=el('label','Game'),uniformDept=el('select'),uniformGame=el('select');
uniformDept.id='uniform-department';uniformGame.id='uniform-game';uniformDeptLabel.htmlFor=uniformDept.id;uniformGameLabel.htmlFor=uniformGame.id;for(const value of formDepartments){const o=el('option',value);o.value=value;uniformDept.append(o);}for(const value of ['ERLC','BRM5']){const o=el('option',value);o.value=value;uniformGame.append(o);}uniformDeptLabel.append(uniformDept);uniformGameLabel.append(uniformGame);uniformTools.append(uniformDeptLabel,uniformGameLabel);uniformView.append(uniformTools);
const uniformGrid=el('div',undefined,'uniform-grid'),uniformCard=el('article',undefined,'uniform-card'),uniformSteps=el('article',undefined,'uniform-card');uniformGrid.append(uniformCard,uniformSteps);uniformView.append(uniformGrid);
uniformSteps.append(el('h4','Before joining a session'));const checks=el('ol',undefined,'uniform-checks');for(const text of ['Confirm your department and the game being played.','Ask the listed lead for the approved outfit or loadout reference.','Check that rank and unit identification match your assigned role.','Follow any session-specific uniform instructions in Discord.'])checks.append(el('li',text));uniformSteps.append(checks,routeLink('View chain of command','unit','chain-of-command'));
function drawUniformGuide(){const department=uniformDept.value,game=uniformGame.value,contact=contactsByDepartment[department]||(department==='FBI'?'HIM12345t / AgentK_0081':'gdandraffriend / GOI-01 or Logibear / GOI-02');uniformCard.replaceChildren();const badge=el('span','APPROVED REFERENCES PENDING','recruit-badge');uniformCard.append(badge,el('h4',department+' / '+game),el('p','Contact: '+contact));const dl=el('dl');for(const title of game==='ERLC'?['Approved shirt reference','Approved pants reference','Accessories / rank identification']:['Approved clothing reference','Approved loadout reference','Unit / rank identification'])dl.append(el('dt',title),el('dd','Awaiting a confirmed reference from leadership.'));const link=el('a','Ask in Discord');link.href=discord.href;link.target='_blank';link.rel='noopener noreferrer';uniformCard.append(dl,link,el('p','This guide does not approve an outfit. Follow the current instructions from your department lead.','resource-note'));}
uniformDept.addEventListener('change',drawUniformGuide);uniformGame.addEventListener('change',drawUniformGuide);drawUniformGuide();
searchEntries.push(['Chain of command','COC / UIU and FBI leadership contacts','unit','chain-of-command'],['Finance form','Funding requests, suspicious transactions and seized assets','unit','finance-form'],['Internal Affairs form','IA reports for review through Discord','unit','ia-form'],['Uniform guide','ERLC and BRM5 outfit references by department','unit','uniform-guide']);
contacts.append(el('br'),routeLink('Chain of command','unit','chain-of-command'));selectResourcePanel(currentHash());


const submenu=el('nav',undefined,'subpage-menu');submenu.setAttribute('aria-label','Page sections');pageHeading.after(submenu);
const panels={
 home:[['overview','Overview'],['uiu-week','This week'],['announcements','Updates']],
 unit:[['leadership','Leadership'],['departments','Departments'],['member-guide','Start here'],['about','About'],['recruitment','Recruitment'],['community','Community'],['glossary','Glossary'],['resources','Resources'],['support','Help']],
 operations:[['operations','Ops Board'],['training-schedule','Training'],['operation-calendar','Calendar'],['gallery','Photos'],['games','Games']],
 archives:[['case-files','Reports'],['saved-reports','Saved'],['case-managers','Case Managers'],['briefings','Briefings'],['experience','Case process']]
};
destinations.overview='home';
function currentHash(){try{return decodeURIComponent(location.hash.slice(1));}catch{return '';}}
function compactPage(page){
 let hash=currentHash();
 if(hash==='join'&&page==='unit')hash='member-guide';
 const target=document.getElementById(hash),parent=target?.closest('main > section');
 let active=panels[page].some(([id])=>id===hash)?hash:panels[page].some(([id])=>id===parent?.id)?parent.id:panels[page][0][0];
 submenu.hidden=false;submenu.replaceChildren();
 for(const [id,label] of panels[page]){const a=routeLink(label,page,id);if(id===active)a.setAttribute('aria-current','page');submenu.append(a);}
 if(page==='unit'){const faq=el('button','FAQ','resource-button');faq.type='button';faq.setAttribute('aria-haspopup','dialog');faq.onclick=()=>openDetails('Frequently asked questions',[...document.querySelectorAll('#questions > :not(.section-head)')]);submenu.append(faq);}
 for(const node of main.children){if(node===pageHeading||node===submenu)continue;node.hidden=!(active==='overview'?node.matches('.hero,.community-stats,.home-tools'):node.id===active);}
 if(hash==='questions'&&page==='unit'&&!detailDialog.open)openDetails('Frequently asked questions',[...document.querySelectorAll('#questions > :not(.section-head)')]);
 if(page==='unit')selectResourcePanel(hash);
 // Existing join links open the newcomer guide rather than another long panel.
 if(hash==='join'&&page==='unit'){document.getElementById(active).hidden=true;document.getElementById('member-guide').hidden=false;}
}

function resolvePage(){const requested=new URL(location.href).searchParams.get('page');if(Object.hasOwn(pages,requested))return requested;const hash=currentHash();const target=document.getElementById(hash),section=target?.closest('main > section');return destinations[hash]||destinations[section?.id]||'home';}
function render(navigate=false){
 const page=resolvePage();document.title=pages[page].title;document.body.classList.remove('page-home','page-unit','page-operations','page-archives');document.body.classList.add('page-'+page);
 for(const node of main.children){if(node===pageHeading)continue;node.hidden=node.dataset.uiuPage!==page;}
 pageHeading.hidden=page==='home';pageTitle.textContent=pages[page].label;pageDescription.textContent=descriptions[page]||'';
 for(const [key,a] of Object.entries(navLinks)){if(key===page)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
 compactPage(page);
 const id=currentHash(),target=id?document.getElementById(id):null;
 if(target?.matches('details.public-case')){document.getElementById('archive-reset')?.click();target.open=true;}
 if(target&&!target.closest('[hidden]')){requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'instant'}));}
 else if(navigate){window.scrollTo({top:0,behavior:'instant'});}
 if(navigate){const focusTarget=page==='home'?main.querySelector('.hero h1'):pageTitle;focusTarget?.setAttribute('tabindex','-1');focusTarget?.focus({preventScroll:true});}
}
document.addEventListener('click',event=>{
 const a=event.target.closest?.('a[data-uiu-route]');if(!a||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
 event.preventDefault();if(detailDialog.open)detailDialog.close();history.pushState({},'',a.href);render(true);
});
window.addEventListener('popstate',()=>render(true));window.addEventListener('hashchange',()=>render());render();
})();
