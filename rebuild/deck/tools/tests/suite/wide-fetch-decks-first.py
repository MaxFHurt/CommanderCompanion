# Step B: for the 24 most-built usable precons: commander EDHREC page (data3/edhrec), top theme pages (data2/themes),
# and up to MAX public Archidekt decks for the commander (corpus5/<file>.jsonl, the format bench.js reads)
import json, os, re, sys, time, unicodedata, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
P='/tmp/dc3/proto'; MAX=400; N=24
ok=json.load(open('wide/ok.json'))[:N]
def get(u, tries=4):
    for t in range(tries):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent':'DeckCompanion-benchmark/1.0'}), timeout=30))
        except Exception: time.sleep(2**t)
def slug(n):
    n=n.split(' // ')[0].lower(); n=unicodedata.normalize('NFD', n); n=''.join(ch for ch in n if unicodedata.category(ch)!='Mn')
    n=re.sub(r'[^a-z0-9 -]','',n).strip(); return re.sub(r'\s+','-',n)
def deck(i):
    d=get('https://archidekt.com/api/decks/%d/' % i)
    if not d or d.get('deckFormat')!=3: return None
    cards=[]
    for c in d.get('cards', []):
        oc=(c.get('card') or {}).get('oracleCard') or {}
        if oc.get('name'): cards.append([oc['name'], c.get('quantity',1), c.get('categories') or [], (c.get('card') or {}).get('uid')])
    return {'id':d['id'],'name':d.get('name'),'updated':d.get('updatedAt'),'views':d.get('viewCount'),'bracket':d.get('edhBracket'),'theory':d.get('theorycrafted'),'cards':cards}
os.makedirs(P+'/data3/edhrec', exist_ok=True)
sets=[]
for x in ok:
    cmd=x['cmdN']; s=slug(cmd); f=re.sub(r'[^A-Za-z0-9]+','_',cmd.split(',')[0]).strip('_')
    j=get('https://json.edhrec.com/pages/commanders/%s.json' % s)
    if j: json.dump(j, open(P+'/data3/edhrec/%s.json' % s,'w'))
    tags=[]
    try: tags=[t['href'].split('/')[-1] for t in j['panels']['taglinks']][:5]
    except Exception: pass
    for t in tags:
        tj=get('https://json.edhrec.com/pages/commanders/%s/%s.json' % (s, t))
        if tj: json.dump(tj, open(P+'/data2/themes/%s__%s.json' % (s, t),'w'))
    ids, page = [], 1
    while len(ids) < MAX*2 and page <= 30:
        q=urllib.parse.urlencode({'commanderName':cmd,'deckFormat':3,'orderBy':'-updatedAt','pageSize':50,'page':page})
        r=get('https://archidekt.com/api/decks/v3/?'+q)
        if not r or not r.get('results'): break
        ids += [d['id'] for d in r['results'] if not d.get('theorycrafted') and (d.get('size') or 0) >= 90]
        if not r.get('next'): break
        page += 1
    with ThreadPoolExecutor(8) as ex: rows=[d for d in ex.map(deck, ids[:MAX*2]) if d]
    rows=rows[:MAX]
    with open(P+'/../corpus5/%s.jsonl' % f,'w') as fo:
        for d in rows: d['cmd']=cmd; fo.write(json.dumps(d)+'\n')
    sets.append([x['slug'], f, len(rows), len(tags)])
    print(x['slug'], f, len(ids), 'ids', len(rows), 'decks', len(tags), 'themes', flush=True)
json.dump(sets, open('wide/sets.json','w'))
