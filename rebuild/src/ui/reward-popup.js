// "You unlocked …" pop-up for new playmats and dice. Shown once per reward (remembered in the profile, profile.rewardsShown),
// only on the main menu (a calm moment: after a game, never mid-turn). Several rewards at once give one pop-up.
import { html } from './dom.js';
import { openModal } from './modal.js';
import { go } from '../app/router.js';
import { loadProfile, newRewards, markRewardsShown } from '../data/profile.js';

let open = false;

export async function showNewRewards() {
  if (open) return;
  const list = newRewards(loadProfile());
  if (!list.length) return;
  open = true;
  const keys = list.map(r => `${r.kind}:${r.id}`);
  const done = () => { open = false; };
  openModal({
    title: list.length === 1 ? 'New reward unlocked' : `${list.length} new rewards unlocked`,
    size: 'small',
    dismissible: false,
    body: html`<div class="reward-popup" data-reward-popup>
      ${list.map(r => html`<div class="reward-popup__row" data-reward="${r.kind}:${r.id}">
        <span class="reward-popup__swatch reward-popup__swatch--${r.kind}" style="display:inline-block;width:44px;height:44px;border-radius:${r.kind === 'die' ? '50%' : '8px'};vertical-align:middle;margin-right:10px;background:${r.art ? `url('${r.art}') center / ${r.kind === 'die' ? 'contain' : 'cover'} no-repeat` : r.kind === 'die' ? `radial-gradient(circle at 35% 30%, ${r.secondary}, ${r.primary} 70%)` : `linear-gradient(135deg, ${r.primary}, ${r.secondary})`}"></span>
        <strong>${r.name} ${r.kind === 'mat' ? 'playmat' : 'die'}</strong></div>`)}
    </div>`,
    actions: [
      { label: 'Later', kind: 'cancel', onClick: async ({ close }) => { close(); done(); await markRewardsShown(keys); } },
      { label: 'Equip now', kind: 'confirm', onClick: async ({ close }) => { close(); done(); await markRewardsShown(keys); go('profile', { open: 'playmats' }); } }
    ]
  });
}
