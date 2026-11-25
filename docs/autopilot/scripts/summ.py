import json,sys,statistics as st,re
rows=[]
for f in sys.argv[1:]: rows+=json.load(open(f,encoding='utf-8'))
media=re.compile(r'/media/')
def real(errs): return [e for e in errs if not media.search(e)]
print("== issues (non-/media)")
for r in rows:
    e=real(r['errs']); fl=[x for x in r['failed'] if not media.search(x)]; d=r['dom']
    flags=[]
    if r['status']!=200: flags.append(f"status {r['status']}")
    if e: flags.append("errs: "+" | ".join(e[:2]))
    if fl: flags.append("failed: "+" | ".join(fl[:2]))
    if d['scrollW']>d['vw']: flags.append(f"overflow {d['scrollW']}>{d['vw']} {d['over'][:2]}")
    if d['broken']: flags.append(f"broken {d['broken'][:2]}")
    if d['h1']!=1: flags.append(f"h1={d['h1']}")
    if d['noAlt']: flags.append(f"noAlt={d['noAlt']}")
    if not d['og']: flags.append("no og:image")
    if flags: print(f"{r['prof']:7} {r['path']:48} "+" ; ".join(flags))
print("\n== vitals by profile (median / worst)")
for prof in ['mobile','desktop','wide']:
    R=[r for r in rows if r['prof']==prof]
    if not R: continue
    for k in ['lcp','tbt']:
        v=[r[k] for r in R if r[k]]
        w=max(R,key=lambda r:r[k])
        print(f"{prof:7} {k}: median {st.median(v):.0f}  worst {w[k]} {w['path']}")
    w=max(R,key=lambda r:r['cls']); print(f"{prof:7} cls worst {w['cls']} {w['path']}")
    w=max(R,key=lambda r:r['scroll']['slowFrames']); print(f"{prof:7} scroll jank worst {w['scroll']['slowFrames']}/{w['scroll']['frames']} LT {w['scroll']['longTasks']} {w['path']}")
    print(f"{prof:7} small tap targets (<24px) worst: "+", ".join(f"{r['path']}={r['dom']['small']}" for r in sorted(R,key=lambda r:-r['dom']['small'])[:3]))
print("\n== videos (attrs)")
seen=set()
for r in rows:
    for v in r['dom']['vids']:
        k=(v['preload'],v['poster'],v['autoplay'])
        if k not in seen: seen.add(k); print(r['path'],v)
print("\n== main pages")
for r in rows:
    if r['path'] in ['/','/about','/ai-cuts','/contact','/horizontal-cuts','/vertical-cuts','/search']:
        print(f"{r['prof']:7} {r['path']:18} LCP {r['lcp']:5} CLS {r['cls']:.3f} TBT {r['tbt']:5}  scroll slow {r['scroll']['slowFrames']}/{r['scroll']['frames']}  js {r['bytes']['js']//1024}KB  lcpEl {r['lcpEl'][:60]}")
