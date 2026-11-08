# Card strength from every bracket of every commander fetched: how often decks that could play a card do, weighted
# toward the stronger brackets, with credit for being played more as power rises. Output: name -> 0..100.
import json, glob, math, sys
S = sys.argv[1]; ALL = sys.argv[2]
cards = {}
for c in json.load(open(ALL)):
    ci = set(c.get('color_identity') or []); cards[c['name']] = ci
    if ' // ' in c['name']: cards[c['name'].split(' // ')[0]] = ci
BR = ['exhibition', 'core', 'upgraded', 'optimized', 'cedh']; import os
W = json.loads(os.environ.get('RW', '{"exhibition": 0, "core": 0.5, "upgraded": 1, "optimized": 3, "cedh": 4}'))
LW = float(os.environ.get('LW', '1'))
num = {b: {} for b in BR}; den = {b: {} for b in BR}
recs = [json.load(open(f)) for f in glob.glob(S + '/br/*.json')]
# each commander's colour identity: the union over its name's halves (partners) from Scryfall
def ident(name):
    out = set()
    for part in name.split(' // '):
        out |= cards.get(part, set())
    return out
for r in recs:
    ci = ident(r['name'])
    if not ci and r['name'] not in cards: continue
    for b in BR:
        x = r['b'].get(b)
        if not x or not x['decks']: continue
        w = math.sqrt(x['decks'])          # one very popular commander must not decide every card
        for n, (k, pot) in x['cards'].items():
            num[b][n] = num[b].get(n, 0) + w * (k / pot)
        # the denominator: every card this commander could play (identity fits) gets this commander's weight
        x['w'] = w
    r['ci'] = ci
allnames = set(n for b in BR for n in num[b])
out = {}
for n in allnames:
    cci = cards.get(n, cards.get(n.split(' // ')[0], set()))
    P = {}
    for b in BR:
        d = sum(r['b'][b]['w'] for r in recs if b in r['b'] and 'w' in r['b'][b] and cci <= r.get('ci', set()))
        P[b] = num[b].get(n, 0) / d if d else 0
    base = sum(W[b] * P[b] for b in BR) / sum(W.values())
    lift = max(0, (P['optimized'] + P['cedh']) / 2 - (P['exhibition'] + P['core']) / 2)
    out[n] = {'s': base + LW * lift, 'P': {b: round(P[b], 3) for b in BR}}
vals = sorted(v['s'] for v in out.values())
top = vals[int(len(vals) * float(os.environ.get('TOPQ', '0.999')))] or 1
for n, v in out.items(): v['r'] = round(min(100, 100 * v['s'] / top), 1)
json.dump(out, open(os.environ.get('OUT', S + '/ratings.json'), 'w'))
print(len(recs), 'commanders,', len(out), 'cards rated')
