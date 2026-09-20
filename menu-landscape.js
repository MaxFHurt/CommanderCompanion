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
