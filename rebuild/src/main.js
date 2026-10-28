// App entry point: load saved data, register screens, show the landing screen.

import { VERSION } from './version.js';
import { registerScreen, go } from './app/router.js';
import { initDeckStore } from './data/deck-store.js';
import { initProfileStore, loadProfile, saveAccountProfile } from './data/profile.js';
import { initPlaymats } from './data/playmats.js';
import { startUpdateChecks, shouldResumeAfterUpdate } from './app/update-check.js';
import { watchCardImages } from './ui/card-view.js';
import { landingScreen } from './ui/screens/landing.js';
import { modeSelectScreen } from './ui/screens/mode-select.js';
import { trackerSetupScreen } from './ui/screens/tracker-setup.js';
import { trackerScreen } from './ui/screens/tracker.js';
import { trackerJoinScreen } from './ui/screens/tracker-join.js';
import { profileScreen } from './ui/screens/profile.js';
import { playerSetupScreen } from './ui/screens/player-setup.js';
import { gameScreen } from './ui/screens/game.js';
import { lobbyScreen } from './ui/screens/lobby.js';
import { joinScreen } from './ui/screens/join.js';
import { takeReturn, builderPlayerName } from './data/deck-builder.js';

registerScreen('landing', landingScreen);
registerScreen('mode-select', modeSelectScreen);
registerScreen('tracker-setup', trackerSetupScreen);
registerScreen('tracker', trackerScreen);
registerScreen('tracker-join', trackerJoinScreen);
registerScreen('profile', profileScreen);
registerScreen('player-setup', playerSetupScreen);
registerScreen('game', gameScreen);
registerScreen('lobby', lobbyScreen);
registerScreen('join', joinScreen);

async function start() {
  // Card images that fail to load fall back to the text version everywhere (screens and popups).
  watchCardImages(document);
  // Saved data loads in parallel; a failure in one store must not block the app.
  await Promise.allSettled([initDeckStore(), initProfileStore(), initPlaymats()]);
  try { screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch { /* not supported */ }
  // One player name. Before the merge the Deck Builder kept its own; adopt it once if this side has none.
  const builderName = builderPlayerName();
  if (builderName && !loadProfile().account?.displayName) await saveAccountProfile({ displayName: builderName }).catch(() => {});
  const back = takeReturn();   // coming back from the Deck Builder: reopen the screen that opened it
  if (shouldResumeAfterUpdate()) go('game', { resume: true }); else if (!back || !go(back.screen, back.params)) go('landing');
  window.__ccReady = true;
  window.__ccVersion = VERSION;
  document.getElementById('bootError').hidden = true;
  registerServiceWorker();
  startUpdateChecks();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').catch(error => console.warn('Service worker not registered', error));
}

start();

// Installed on an iPad home screen, the page can be reported shorter than the display. Size the
// backdrop from the display itself so the art always reaches the bottom edge.
function sizeBackdrop() {
  const landscape = window.innerWidth >= window.innerHeight;
  const full = landscape ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height);
  document.documentElement.style.setProperty('--cc-screen-h', `${Math.max(window.innerHeight, navigator.standalone ? full : 0)}px`);
}
sizeBackdrop();
window.addEventListener('resize', sizeBackdrop);
window.addEventListener('orientationchange', () => setTimeout(sizeBackdrop, 300));
