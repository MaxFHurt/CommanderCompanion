// App entry point: load saved data, register screens, show the landing screen.

import { VERSION } from './version.js';
import { registerScreen, go } from './app/router.js';
import { initDeckStore } from './data/deck-store.js';
import { initProfileStore } from './data/profile.js';
import { initPlaymats } from './data/playmats.js';
import { startUpdateChecks, shouldResumeAfterUpdate } from './app/update-check.js';
import { watchCardImages } from './ui/card-view.js';
import { landingScreen } from './ui/screens/landing.js';
import { modeSelectScreen } from './ui/screens/mode-select.js';
import { trackerSetupScreen } from './ui/screens/tracker-setup.js';
import { trackerScreen } from './ui/screens/tracker.js';
import { profileScreen } from './ui/screens/profile.js';
import { playerSetupScreen } from './ui/screens/player-setup.js';
import { gameScreen } from './ui/screens/game.js';
import { lobbyScreen } from './ui/screens/lobby.js';
import { joinScreen } from './ui/screens/join.js';
import { deckEditorScreen } from './ui/screens/deck-editor.js';

registerScreen('landing', landingScreen);
registerScreen('mode-select', modeSelectScreen);
registerScreen('tracker-setup', trackerSetupScreen);
registerScreen('tracker', trackerScreen);
registerScreen('profile', profileScreen);
registerScreen('player-setup', playerSetupScreen);
registerScreen('game', gameScreen);
registerScreen('lobby', lobbyScreen);
registerScreen('join', joinScreen);
registerScreen('deck-editor', deckEditorScreen);

async function start() {
  // Card images that fail to load fall back to the text version everywhere (screens and popups).
  watchCardImages(document);
  // Saved data loads in parallel; a failure in one store must not block the app.
  await Promise.allSettled([initDeckStore(), initProfileStore(), initPlaymats()]);
  try { screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch { /* not supported */ }
  if (shouldResumeAfterUpdate()) go('game', { resume: true }); else go('landing');
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
