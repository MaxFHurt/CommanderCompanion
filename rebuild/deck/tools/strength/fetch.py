import json, os, sys, time, urllib.request
S = sys.argv[1]; UA = {'User-Agent': 'CommanderCompanion/1.0 (card strength research)'}
def get(path):
    for k in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request('https://json.edhrec.com/pages/' + path, headers=UA), timeout=30) as r: return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (403, 404): return None
            time.sleep(2 ** k * 2)
        except Exception: time.sleep(2 ** k * 2)
    return None
# commanders: top 1,000 of the past year, plus extra slugs given in a file
cmds = [tuple(x) for x in json.load(open(os.path.join(S, 'commanders.json')))] if os.path.exists(os.path.join(S, 'commanders.json')) else []
for p in ([] if cmds else range(0, 10)):
    j = get('commanders/year.json' if p == 0 else f'commanders/year-{p}.json'); time.sleep(1)
    if not j: break
    cv = j.get('cardviews') or [v for l in j.get('container', {}).get('json_dict', {}).get('cardlists', []) for v in l.get('cardviews', [])]
    cmds += [(v.get('sanitized'), v.get('name'), v.get('num_decks')) for v in cv if v.get('sanitized')]
extra = os.path.join(S, 'extra.txt')
if os.path.exists(extra): cmds = [(l.strip(), l.strip(), 0) for l in open(extra) if l.strip() and '.' not in l] + cmds   # test commanders first
seen = set(); cmds = [c for c in cmds if not (c[0] in seen or seen.add(c[0]))]
json.dump(cmds, open(os.path.join(S, 'commanders.json'), 'w'))
print('commanders', len(cmds), flush=True)
from concurrent.futures import ThreadPoolExecutor
def one(arg):
    i, (slug, name, n) = arg
    out = os.path.join(S, 'br', slug + '.json')
    if os.path.exists(out): return
    rec = {'slug': slug, 'name': name, 'decks': n, 'b': {}}
    for b in ['all', 'exhibition', 'core', 'upgraded', 'optimized', 'cedh']:
        j = get(f'commanders/{slug}.json' if b == 'all' else f'commanders/{slug}/{b}.json'); time.sleep(1)
        if not j: continue
        cv = [v for l in j.get('container', {}).get('json_dict', {}).get('cardlists', []) for v in l.get('cardviews', [])]
        cards = {}
        for v in cv:
            if v.get('name') and v.get('potential_decks'): cards[v['name']] = [v.get('num_decks', 0), v['potential_decks']]
        rec['b'][b] = {'decks': max([x[1] for x in cards.values()] or [0]), 'cards': cards}
    json.dump(rec, open(out, 'w'))
    if i % 25 == 0: print(i, slug, flush=True)
with ThreadPoolExecutor(4) as ex: list(ex.map(one, enumerate(cmds)))
print('done', flush=True)
