import math
from engine import *
print("== loss from wider batch spacing (one target, RAM-limited) ==")
for name,bn,L,mm,mc,spd,mg,tb,n in [("BN4 L300 50TB",4,300,1.5,1.2,1.2,1,50,"phantasy"),("BN4 L1100 50TB",4,1100,4.7,1.3,1.5,1.2,50,"b-and-a"),("BN4 L2000 50TB",4,2000,4.7,1.3,1.5,1.2,50,"clarkinc"),("BN4 L2000 400TB",4,2000,4.7,1.3,1.5,1.2,400,"clarkinc"),("BN1 L300 100TB",1,300,1.2,1.05,1.05,1,100,"phantasy"),("BN1 L1000 100TB",1,1000,4.68,1.3,1.41,1.2,100,"rho"),("BN1 L2500 100TB",1,2500,4.68,1.3,1.41,1.2,100,"clarkinc")]:
    sv=srv([x for x in S if x[0]==n][0],bn); out=[]
    for sp in (.1,.5,1,2,5,20,60):
        b=best(sv,bn,L,mm,mc,spd,mg,tb*1024,sp); out.append(f"{sp}s:{fm(b['v'])}(f{b['f']})")
    print(f"{name:18}{n:9}"," ".join(out))
print()
print("== exp per GB-s: money batches vs hack-heavy farm (same player) ==")
for name,bn,L,mm,mc,spd,mg,mexp,n in [("BN4 L1100",4,1100,4.7,1.3,1.5,1.2,6,"b-and-a"),("BN4 L2000",4,2000,4.7,1.3,1.5,1.2,6,"clarkinc"),("BN1 L300",1,300,1.2,1.05,1.05,1,1.5,"phantasy"),("BN1 L1000",1,1000,4.68,1.3,1.41,1.2,5.6,"rho")]:
    sv=srv([x for x in S if x[0]==n][0],bn); q=plan(sv,bn,L,mm,mc,spd,mg,.05)
    t=3125/(L+50)/spd; e=7.5*BN[bn]['xp']*mexp; c=min(1,(1.75*L-10)/(1.75*L)*.95*mc)
    h=e*(c+(1-c)/4)/(1.7*t); 
    print(f"{name}: batches on {n}: {q['xp']*mexp:.3f}/GB-s, {fm(q['rate'])}/GB-s | hack-heavy farm on joesguns: {h:.2f}/GB-s, grow+weaken {e*1.08/(6.16*t):.2f}")
print()
print("== rep/s split while working for rep (no donation yet). rep rate ~ L x share bonus; 4 hours in a reset, M and mexp as given ==")
def lvl(M,e): return M*(32*math.log(e+534.6)-200)
def repavg(M,mexp,tb,frac,hours=4,bn=4,mode='h'):
    gb=tb*1024; sg=gb*frac; th=sg/4; bonus=1+math.log(th+1)/25; R=gb*(1-frac)
    e=1e6; tot=0; dt=60; 
    for i in range(int(hours*3600/dt)):
        L=lvl(M,e); t=3125/(L+50)/1.5; base=7.5*BN[bn]['xp']*mexp
        r=base*(.96/(1.7*t)+.04/(7*t)) if mode=='h' else base*1.08/(6.16*t)
        e+=r*R*dt; tot+=L*bonus*dt
    return tot/(hours*3600), lvl(M,e),bonus
for M,mx,tb,bn in [(3,3,25,1),(4,5,25,1),(4,5,100,1),(5,6,50,4),(8,8,50,4),(12,10,100,4)]:
    base=None; row=[]
    for fr in (.05,.1,.2,.3,.5,.9):
        a,Lf,b=repavg(M,mx,tb,fr,bn=bn)
        row.append((fr,a,Lf,b))
    mx_=max(r[1] for r in row)
    print(f"M{M} mexp{mx} {tb}TB BN{bn}: "+" ".join(f"{int(fr*100)}%:{a/mx_:.3f}" for fr,a,_,_ in row)+f"  (best rep x L avg {mx_:.0f})")
