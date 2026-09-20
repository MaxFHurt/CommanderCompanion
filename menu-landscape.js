// Presentation only: preserve the original nodes, input values, and event handlers.
function groupHeadings(root) {
  let section = null;
  for (const node of [...root.children]) {
    if (node.tagName === 'H3') {
      section = document.createElement('section');
      section.className = 'menu-info-section';
      root.insertBefore(section, node);
    } else if (node.tagName === 'SECTION') section = null;
    if (section) section.appendChild(node);
  }
}
export function prepareMenuLayout(title, content) {
  content.dataset.menuTitle = title;
  content.classList.remove('menu-form-grid', 'menu-info-grid', 'menu-option-grid');
  const labels = [...content.children].filter(el => el.tagName === 'LABEL');
  if (labels.length > 1) content.classList.add('menu-form-grid');
  if (['PLAYER PROFILE', 'LEARN COMMANDER', 'MY ACCOUNT — PLAYER STATS'].includes(title)) {
    groupHeadings(content);
    content.classList.add('menu-info-grid');
  }
  const rescue = content.querySelector('.rescue-center');
  if (rescue) groupHeadings(rescue);
  if ([...content.children].filter(el => el.matches('button.search-result')).length > 1)
    content.classList.add('menu-option-grid');
}

export function labelRuleOptions(root) {
  const labels = {
    CommanderDamage:'Commander damage (21)', PoisonLoss:'Poison loss (10)',
    CommanderTax:'Commander tax (+2)', Banned:'Banned list', ColorIdentity:'Color identity',
    Singleton:'Singleton', Wishes:'Wish effects', Zero:'Rule Zero overrides',
    FirstDraw:'Confirm draws', EndConfirm:'Confirm end turn', ExtraLand:'Extra land play (+1)',
    SecondLand:'Extra land play (+1)', Override:'Freeplay overrides'
  };
  root.querySelectorAll('label.check').forEach(label => {
    const input=label.querySelector('input');
    if (!input) return;
    const key=input.id.replace(/^(?:modeRule|rule)/,'');
    if (!labels[key]) return;
    label.title=label.textContent.trim();
    input.setAttribute('aria-label',label.title);
    const full=document.createElement('span');full.className='menu-rule-full';
    const compact=document.createElement('span');compact.className='menu-rule-short';compact.textContent=labels[key];
    for (const node of [...label.childNodes]) if (node.nodeType===3) full.appendChild(node);
    label.append(full,compact);
  });
}

export function preparePlayerSetup(root) {
  root.previousElementSibling?.matches('.menu-player-tabs') && root.previousElementSibling.remove();
  const panels=[...root.querySelectorAll('[data-player-setup]')];
  const nav=document.createElement('div');nav.className='menu-player-tabs';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Player setup');
  const select=index=>{
    panels.forEach((panel,i)=>panel.classList.toggle('menu-player-active',i===index));
    [...nav.children].forEach((button,i)=>{button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1;});
  };
  panels.forEach((panel,i)=>{
    panel.id=`menu-player-panel-${i}`;
    const button=document.createElement('button');button.type='button';button.textContent=`PLAYER ${i+1}`;
    button.setAttribute('role','tab');button.setAttribute('aria-controls',panel.id);
    button.onclick=()=>select(i);
    button.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?panels.length-1:(i+(e.key==='ArrowRight'?1:-1)+panels.length)%panels.length;select(next);nav.children[next].focus();};
    nav.appendChild(button);
  });
  root.before(nav);select(0);
}
