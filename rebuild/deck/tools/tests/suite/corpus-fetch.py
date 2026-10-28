# Fetches public Archidekt Commander decks for each benchmark commander into a corpus folder, in the format bench.js reads
# (one deck per line: id, cmd, name, updated, views, bracket, theory, cards [[name, qty, categories, uid]]).
# Decks already in the older corpus folders are kept and not fetched again; each file ends with up to MAX decks, newest first.
# python3 corpus-fetch.py <out dir> [MAX=1000] [old corpus dirs...]
import json, os, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

OUT = sys.argv[1]
MAX = int(sys.argv[2]) if len(sys.argv) > 2 else 1000
OLD = sys.argv[3:]
os.makedirs(OUT, exist_ok=True)

def get(url, tries=4):
    for t in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'DeckCompanion-benchmark/1.0'})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception as e:
            time.sleep(2 ** t)
    return None

def deck(i):
    d = get('https://archidekt.com/api/decks/%d/' % i)
    if not d or d.get('deckFormat') != 3:
        return None
    cards = []
    for c in d.get('cards', []):
        oc = (c.get('card') or {}).get('oracleCard') or {}
        if oc.get('name'):
            cards.append([oc['name'], c.get('quantity', 1), c.get('categories') or [], (c.get('card') or {}).get('uid')])
    return {'id': d['id'], 'name': d.get('name'), 'updated': d.get('updatedAt'), 'views': d.get('viewCount'),
            'bracket': d.get('edhBracket'), 'theory': d.get('theorycrafted'), 'cards': cards}

files = {}
for o in OLD:
    for f in os.listdir(o):
        if f.endswith('.jsonl'):
            files.setdefault(f, []).append(os.path.join(o, f))
for f, paths in sorted(files.items()):
    rows, seen = [], set()
    for p in paths:
        for line in open(p):
            if line.strip():
                r = json.loads(line)
                if r['id'] not in seen:
                    seen.add(r['id']); rows.append(r)
    cmd = rows[0]['cmd']
    ids, page = [], 1
    while len(ids) + len(seen) < MAX * 2 and page <= 40:
        q = urllib.parse.urlencode({'commanderName': cmd, 'deckFormat': 3, 'orderBy': '-updatedAt', 'pageSize': 50, 'page': page})
        j = get('https://archidekt.com/api/decks/v3/?' + q)
        if not j or not j.get('results'):
            break
        ids += [r['id'] for r in j['results'] if r['id'] not in seen and not r.get('theorycrafted') and (r.get('size') or 0) >= 90]
        if not j.get('next'):
            break
        page += 1
    need = max(0, MAX - len(rows))
    new = []
    with ThreadPoolExecutor(4) as ex:
        for d in ex.map(deck, ids[: int(need * 1.3) + 10]):
            if d and len(new) < need:
                d['cmd'] = cmd
                new.append(d)
    allr = new + rows
    with open(os.path.join(OUT, f), 'w') as w:
        for r in allr[:MAX]:
            w.write(json.dumps(r) + '\n')
    print(cmd, 'kept', len(rows), 'new', len(new), 'total', min(MAX, len(allr)), flush=True)
