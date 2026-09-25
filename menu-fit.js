/* V0.8 HN. Presentation-only menu layout. Never targets landing, mode chooser,
   player setup, gameplay boards, or card-resolution dialogs. */
const menuTitles = new Set(['MY ACCOUNT','MY ACCOUNT — PROFILE EDITOR','MY ACCOUNT — PLAYER STATS','PLAYER PROFILE','PLAYER RESCUE','LEARN COMMANDER','SETTINGS','GAME CONTROLS & SETTINGS','RULE MODIFICATIONS','PRECON CATALOG','COMMAND CENTER','GAME LOGS','CARD ID']);
const dialogs = [...document.querySelectorAll('#modal,#deckDialog,#modeSetupDialog,#networkDialog')];
const pagers = new WeakMap();
const tabsMade = new WeakSet();
function tabs(root, panels, names) {
  if (tabsMade.has(root) && !root.querySelector(':scope>.fit-tabs')) tabsMade.delete(root);
  if (tabsMade.has(root) || !panels.length) return;
  tabsMade.add(root);
  const nav=document.createElement('nav');nav.className='fit-tabs';nav.setAttribute('aria-label','Menu sections');
  const select=index=>{panels.forEach((p,i)=>{p.hidden=i!==index;p.classList.add('fit-tab-panel')});[...nav.children].forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));schedule()};
  panels.forEach((p,i)=>{const b=document.createElement('button');b.type='button';b.textContent=names[i];b.onclick=()=>select(i);nav.append(b)});
  root.prepend(nav);root.classList.add('fit-tabbed');select(0);
  return select;
}
function pageList(root, columns=3, rowHeight=70) {
  if (!root) return;
  let state=pagers.get(root);
  if (!state) {
    const nav=document.createElement('nav');nav.className='fit-pager';nav.setAttribute('aria-label','Result pages');
    const prev=document.createElement('button'),label=document.createElement('span'),next=document.createElement('button');
    prev.type=next.type='button';prev.textContent='PREVIOUS';next.textContent='NEXT';label.setAttribute('aria-live','polite');nav.append(prev,label,next);root.after(nav);
    state={page:0,nav,prev,next,label,items:[]};pagers.set(root,state);
    prev.onclick=()=>{state.page--;layout()};next.onclick=()=>{state.page++;layout()};
  }
  const items=[...root.children];
  if(items.length!==state.items.length||items.some((n,i)=>n!==state.items[i])){state.page=0;state.items=items}
  root.classList.add('fit-results');root.style.setProperty('--fit-columns',columns);
  function layout(){
    if(!root.isConnected)return;
    const rows=Math.max(1,Math.floor(root.clientHeight/rowHeight));const perPage=columns*rows;
    const pages=Math.max(1,Math.ceil(state.items.length/perPage));state.page=Math.max(0,Math.min(state.page,pages-1));
    state.items.forEach((el,i)=>{el.hidden=i<state.page*perPage||i>=(state.page+1)*perPage});
    state.prev.disabled=state.page===0;state.next.disabled=state.page>=pages-1;
    state.label.textContent=`${state.page+1} / ${pages}`;
  }
  layout();
}
function prepareDeck(dialog){
  const section=dialog.querySelector('.deck-editor-grid>section');
  if(!section||tabsMade.has(section))return;
  const nodes=[...section.children];const details=document.createElement('div'),cards=document.createElement('div'),analysis=document.createElement('div');
  details.className='fit-deck-details';cards.className='fit-deck-cards';analysis.className='fit-deck-analysis';
  nodes.forEach(node=>{if(node.matches('label:has(#deckNameInput),.setup-line'))details.append(node);else if(node.matches('#deckAnalytics,#deckEditorStatus'))analysis.append(node);else cards.append(node)});
  section.append(details,cards,analysis);const select=tabs(section,[details,cards,analysis],['DETAILS','CARDS','ANALYSIS']);
  document.querySelector('#validateDeckBtn').addEventListener('click',()=>select(2));
  document.querySelector('#newDeckBtn').addEventListener('click',()=>select(0));
}
function update(){
  observer.disconnect();
  for(const dialog of dialogs){
    const title=dialog.querySelector('header h2')?.textContent.trim()||'';
    const eligible=dialog.id!=='modal'||menuTitles.has(title)||/ — (OPENING HAND|CUSTOMIZE HAND|BOTTOM \d+)$/.test(title);
    dialog.classList.toggle('cc-menu-fit',eligible);
    if(!eligible||!dialog.open)continue;
    const back=dialog.querySelector('.dialog-back');
    if(back&&!back.querySelector('.fit-back-label')){const span=document.createElement('span');span.className='fit-back-label';span.textContent='BACK';back.append(span)}
    if(dialog.id==='deckDialog'){
      prepareDeck(dialog);
      pageList(dialog.querySelector('#savedDeckList'),1,48);
      pageList(dialog.querySelector('#deckCardResults'),1,66);
    }
    const content=dialog.querySelector('.modal-content');
    if(title==='PLAYER RESCUE'){
      const root=content.querySelector('.rescue-center');
      if(root)tabs(root,[...root.children].filter(n=>n.tagName==='SECTION'),['ADVISOR','ACTIONS','DIRECTION','LEGEND','RULES','TURN ORDER']);
    }
    if(['LEARN COMMANDER','PLAYER PROFILE','MY ACCOUNT — PLAYER STATS'].includes(title)){
      const sections=[...content.querySelectorAll(':scope>.menu-info-section')];
      if(sections.length&&!content.querySelector(':scope>.fit-tabs')){
        // Keep the existing profile summary with its first section.
        const names=sections.map(s=>s.querySelector('h3')?.textContent||'OVERVIEW');
        const first=sections[0],summary=[];for(const n of [...content.children]){if(n===first)break;summary.push(n)}
        first.prepend(...summary);tabs(content,sections,names);
      }
    }
    if(title==='PRECON CATALOG')pageList(content.querySelector('#preconResults'),3,72);
    if(title==='CARD ID')pageList(content.querySelector('#cardSearchResults'),3,74);
    if(/ — (CUSTOMIZE HAND|BOTTOM \d+)$/.test(title))pageList(content.querySelector('.card-search-results'),4,85);
  }
  for(const dialog of dialogs)observer.observe(dialog,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
}
let queued=false;
function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;update()})}
const observer=new MutationObserver(schedule);
window.addEventListener('resize',schedule);
update();
