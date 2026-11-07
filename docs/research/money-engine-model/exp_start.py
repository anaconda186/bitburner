import math
from engine import *
def lvl(M,e): return max(1,M*(32*math.log(e+534.6)-200))
def rate(bn,L,mm,mc,spd,mg,gb,spacing=1.0):
    bv=None
    for s in S:
        if s[4]>L: continue
        b=best(srv(s,bn),bn,L,mm,mc,spd,mg,gb,spacing)
        if b and (bv is None or b['v']>bv[0]['v']): bv=(b,s[0])
    return bv
def sim(bn,M,mm,mc,spd,mg,mexp,tb,policy,hours=3,dt=30,e0=1e4):
    gb=tb*1024;e=e0;money=0;log=[];tgt=None;pend=0
    for i in range(int(hours*3600/dt)):
        t_=i*dt;L=lvl(M,e);ex=policy(t_,L);g=gb*(1-ex);r=0;bx=0
        if g>0:
            bv=rate(bn,L,mm,mc,spd,mg,g)
            if bv:
                b,n=bv;r=b['v']
                if n!=tgt:
                    sv=srv([x for x in S if x[0]==n][0],bn);pend=4*T(sv,sv['base'],L,spd);tgt=n
                if pend>0: pend-=dt;r=0
                bx=b['xp']*mexp*b['used']
        money+=r*dt
        tt=3125/(L+50)/spd;base=7.5*BN[bn]['xp']*mexp
        e+=(base*(.96/(1.7*tt)+.04/(7*tt))*gb*ex+bx)*dt
        log.append((t_,L,r,money,tgt))
    return log
scen=[("BN1 M2 50TB",1,2,2,1.1,1.2,1.05,2.5,50),("BN1 M2 150TB",1,2,2,1.1,1.2,1.05,2.5,150),("BN4 M1.5 50TB",4,1.5,1.5,1.2,1.2,1,1.5,50),("BN4 M4 50TB",4,4,3,1.3,1.4,1.1,4,50)]
pols={"all money":lambda t,L:0,"exp 5min":lambda t,L:1 if t<300 else 0,"exp 10min":lambda t,L:1 if t<600 else 0,"exp 15min":lambda t,L:1 if t<900 else 0,"exp 30min":lambda t,L:1 if t<1800 else 0}
for nm,bn,M,mm,mc,spd,mg,mx,tb in scen:
    print(nm)
    base=None
    for p,f in pols.items():
        lg=sim(bn,M,mm,mc,spd,mg,mx,tb,f)
        if base is None: base=lg[-1][3]
        print(f"  {p:10} $1h {fm(lg[119][3]):>8} $3h {fm(lg[-1][3]):>8} x{lg[-1][3]/base:5.2f}  L@1h {lg[119][1]:5.0f} L@3h {lg[-1][1]:5.0f} rate {fm(lg[-1][2])}/s tgt {lg[-1][4]}")
print("batch exp as share of farm exp per GB-s")
for name,bn,L,mm,mc,spd,mg,n in [("BN1 L100",1,100,1,1,1,1,"harakiri"),("BN1 L300",1,300,1.2,1.05,1.05,1,"phantasy"),("BN1 L600",1,600,2,1.1,1.2,1.05,"the-hub"),("BN1 L1000",1,1000,4.68,1.3,1.41,1.2,"rho"),("BN4 L300",4,300,1.5,1.2,1.2,1,"phantasy"),("BN4 L1100",4,1100,4.7,1.3,1.5,1.2,"b-and-a"),("BN4 L2000",4,2000,4.7,1.3,1.5,1.2,"clarkinc")]:
    q=plan(srv([x for x in S if x[0]==n][0],bn),bn,L,mm,mc,spd,mg,.05)
    t=3125/(L+50)/spd;e=7.5*BN[bn]['xp'];c=min(1,(1.75*L-10)/(1.75*L)*.95*mc);h=e*(c+(1-c)/4)/(1.7*t)
    print(f"  {name} {n}: {100*q['xp']/h:.1f}%")
