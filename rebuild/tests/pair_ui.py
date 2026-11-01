"""QR pairing without internet (local-link.js): a host room and a joining device connect by exchanging the offer and
answer codes (the QR text) — no PeerJS and no signaling server — then a game message goes across. Also checks the lobby
shows the pairing QR code. Needs the static server on port 4180."""
import asyncio, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(__file__))
from shots import URL

PASS, FAIL = [], []
def check(name, ok, info=''):
    (PASS if ok else FAIL).append(name)
    print(('  ok  ' if ok else 'FAIL  ') + name + ('' if ok else f'  [{info}]'))

async def main():
    async with async_playwright() as p:
        # Plain local addresses in the candidates (headless Chromium can't resolve mDNS names between pages).
        browser = await p.chromium.launch(args=['--disable-features=WebRtcHideLocalIpsWithMdns'])
        host = await (await browser.new_context()).new_page()
        guest = await (await browser.new_context()).new_page()
        for pg in (host, guest):
            await pg.goto(URL + '?net=loopback')
            await pg.wait_for_function('window.__ccReady === true', timeout=20000)
        # Host: a room (same-browser transport underneath, as offline) with QR pairing on top.
        offer = await host.evaluate("""async () => {
          const { hostRoom } = await import('./src/net/room.js');
          window.__room = await hostRoom('QRPA', { remoteSeats: 1 });
          return window.__room.pairOffer();
        }""")
        check('the host makes a compact pairing code for the QR', offer.startswith('CCL1|o|QRPA|') and len(offer) < 900, len(offer))
        # Guest: scans it (the text), shows its answer, waits to be joined.
        await guest.evaluate("""offer => {
          window.__answer = null;
          window.__joined = (async () => {
            const { joinRoom } = await import('./src/net/room.js');
            window.__link = await joinRoom('QRPA', { clientId: 'guest-1', seat: { name: 'Guest', deckName: 'Test deck' }, name: 'Guest', local: { offer, onAnswer: t => { window.__answer = t; } } });
            return true;
          })();
        }""", offer)
        await guest.wait_for_function('window.__answer', timeout=15000)
        answer = await guest.evaluate('window.__answer')
        check('the joining device answers with its own code', answer.startswith('CCL1|a|'), answer[:20])
        await host.evaluate('a => window.__room.pairAccept(a)', answer)
        ok = await guest.evaluate('window.__joined.then(() => true, e => String(e))')
        check('the devices connect directly and the guest joins the room', ok is True, ok)
        players = await host.evaluate('window.__room.lobby().players.map(p => p.name)')
        check('the host lobby lists the paired player', players == ['Guest'], players)
        # The UI: the lobby offers pairing and shows the QR code.
        await host.evaluate("""async () => { const { go } = await import('./src/app/router.js'); go('lobby', { mode: 'fully-tracked', hostDevice: true, localSeats: [], remoteSeats: 1 }); }""")
        await host.wait_for_selector('[data-act="pair"]', timeout=15000)
        await host.click('[data-act="pair"]')
        await host.wait_for_selector('.modal [data-qr] svg', timeout=15000)
        check('the lobby shows a pairing QR code', await host.locator('.modal [data-qr] svg').count() > 0)
        await browser.close()
    print(f'\n{len(PASS)}/{len(PASS) + len(FAIL)} passed')
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
