// ---------- boot ----------
// Engine v2 phase 4: "?engine=old" runs every choice the way 0.9.3 made it (the rules reading, synergy and practice-game changes
// off), so the two engines can be compared side by side. The worker gets the same settings with each job.
// Profile → Upgrade engine keeps the choice on this device (owner, 24 Oct).
const engineMode = () => (/[?&]engine=old(&|$)/.test(location.search) || lsGet('dc.engine') === 'old' ? 'old' : 'new');
if (engineMode() === 'old') Object.assign(UP, ENGINE_OLD);
ornaments();
paintSky();
let rz = 0;
let wasNarrow = isNarrow();
addEventListener('resize', () => {
  clearTimeout(rz);
  rz = setTimeout(paintSky, 250);
  const nw = isNarrow();
  if (nw !== wasNarrow) {
    wasNarrow = nw;
    render();
  } else fitWork();
});
loadLocal();
ccAdoptName();
if (!S.profile.decks.length) {
  exampleDeck();
  S.profile.example = true;
} else S.deckId = S.profile.decks[0].id;
S.view = 'home';
S.open = false;
restoreSpot();
{
  const bn = $('#build-no');
  if (bn) bn.textContent = (window.VERSION || '') + ' (build ' + window.BUILD + ')';
}
render();
loadSavedLibrary();
initBackup();
checkShareLink();
addEventListener('hashchange', checkShareLink);
