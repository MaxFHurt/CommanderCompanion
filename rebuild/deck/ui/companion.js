// ---------- Commander Companion ----------
// The Deck Builder is part of Commander Companion (the game side, one folder up). Both pages share one origin, so
// they share storage:
// - One profile: the player's name, avatar, games and achievements live in the game side's profile (ccv07-profile).
//   The name is shown here read-only; decks, collection, buy lists and tablemates stay here (cc.deckProfile;
//   dc.profile before 0.9.23).
// - Home goes back to Commander Companion, which reopens the screen that opened the Deck Builder.
const CC = {profileKey: 'ccv07-profile', returnKey: 'cc.return', url: '../'};
function ccProfile() {
  try {
    return JSON.parse(localStorage.getItem(CC.profileKey) || 'null') || {};
  } catch (e) {
    return {};
  }
}
function ccName() {
  const a = ccProfile().account || {};
  return String(a.displayName || '').trim();
}
// Leave for the game side. screen: the screen to open there (none: the one that opened the Deck Builder, or home).
function ccOpen(screen) {
  if (screen) {
    try {
      sessionStorage.setItem(CC.returnKey, JSON.stringify({screen: screen, params: {}}));
    } catch (e) {}
  }
  clearTimeout(saveT);
  persist(); // save now: a change made in the last moment is still waiting for its save timer
  location.href = CC.url;
}
// The name from the game side replaces this side's own, before the first render.
function ccAdoptName() {
  const n = ccName();
  if (n && S.profile && S.profile.name !== n) S.profile.name = n;
}
// The game record and the link to the player profile, for this side's Profile page.
function ccRecordHtml() {
  const p = ccProfile(),
    games = Number(p.games || 0),
    wins = Number(p.wins || 0);
  return (
    '<div class="grp"><span class="lab">Game record</span><div class="row">' +
    '<span class="chip">' +
    games +
    ' game' +
    (games === 1 ? '' : 's') +
    '</span><span class="chip">' +
    wins +
    ' win' +
    (wins === 1 ? '' : 's') +
    '</span><span class="chip">' +
    (games ? Math.round((wins / games) * 100) : 0) +
    '% win rate</span><button class="btn sm" data-act="cc-profile">' +
    (ccName() ? 'Open player profile' : 'Set your name in the player profile') +
    '</button></div><p class="note" style="margin:0">Your name, avatar, games and achievements are kept in your Commander Companion player profile. Its Save Profile backup also saves everything here.</p></div>'
  );
}
