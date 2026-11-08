# The strength data file the app reads: per-card ratings (with cEDH / without) and per-commander bracket keep rates (>= 25%).
import json, glob, gzip, sys, os
S = sys.argv[1]; date = sys.argv[2]
A = json.load(open(S + '/r_new.json')); C = json.load(open(S + '/r_casual.json'))
cards = {n: [round(A[n]['r']), round(C.get(n, {}).get('r', 0))] for n in A if A[n]['r'] >= 1 or C.get(n, {}).get('r', 0) >= 1}
cmd = {}
for f in glob.glob(S + '/br/*.json'):
    slug = os.path.basename(f)[:-5]
    if '.' in slug: continue
    r = json.load(open(f))
    out = {}
    for b in ['upgraded', 'optimized', 'cedh']:
        x = r['b'].get(b)
        if x and x['decks']: out[b[0]] = [x['decks'], {n: round(100 * k / p) for n, (k, p) in x['cards'].items() if k / p >= 0.25}]
    if out: cmd[slug] = out
blob = {'v': 1, 'date': date, 'cards': cards, 'cmd': cmd}
raw = json.dumps(blob, separators=(',', ':'), ensure_ascii=False).encode()
open(S + '/strength.json.gz', 'wb').write(gzip.compress(raw, 9))
print(len(cards), 'cards;', len(cmd), 'commanders;', len(gzip.compress(raw, 9)) // 1024, 'KB gz')
