# Step A: every non-Secret-Lair precon not already in the benchmark -> precon page + retail fixture; prints candidates
import json, os, urllib.request, time
P='/tmp/dc3/proto'
have=set(f[7:-4] for f in os.listdir(P+'/data2/fixtures') if f.startswith('retail-'))|set(f[7:-4] for f in os.listdir(P+'/fixtures') if f.startswith('retail-'))
rows=json.load(open('precons.json'))
out=[]
def get(u):
    for t in range(4):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent':'DeckCompanion-benchmark/1.0'}), timeout=30))
        except Exception: time.sleep(2**t)
for hdr, slug, cmd, label in rows:
    if hdr.startswith('Secret Lair') or slug in have: continue
    j=get('https://json.edhrec.com/pages/precon/%s.json' % slug)
    if not j or not isinstance(j.get('deck'), dict): continue
    dk=j['deck']; cmds=[c[0] for c in dk.get('commander_v2') or []] or dk.get('commander') or []
    cards=[(c[0], c[1]) for cat in dk.get('cards', {}).values() for c in cat]
    n=sum(q for _, q in cards)+len(cmds)
    if n < 98 or not cmds: continue
    json.dump(j, open(P+'/data2/precon/%s.json' % slug, 'w'))
    with open(P+'/data2/fixtures/retail-%s.txt' % slug, 'w') as f:
        f.write('Commander\n' + ''.join('1 %s\n' % c for c in cmds) + '\nDeck\n' + ''.join('%d %s\n' % (q, nm) for nm, q in cards))
    cnt=(j.get('precon_commander_counts') or [{}])[0].get('count', 0)
    out.append({'slug': slug, 'set': hdr, 'cmd': cmds[0], 'n': n, 'count': cnt})
    time.sleep(0.2)
json.dump(out, open('wide/cands.json','w'), indent=0)
print(len(out), 'precons with full lists')
