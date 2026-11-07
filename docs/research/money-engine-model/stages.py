import math
from engine import *
print("== after-casino: lots of RAM, low level. How much of the fleet can money batches even use? ==")
for name,bn,L,mm,mc,spd,mg in [("BN1 L100",1,100,1,1,1,1),("BN1 L300",1,300,1.2,1.05,1.05,1),("BN1 L600 (mid-augs)",1,600,2,1.1,1.2,1.05),
 ("BN4 L100",4,100,1.16,1.16,1.16,1),("BN4 L300",4,300,1.5,1.2,1.2,1),("BN4 L600",4,600,2.5,1.2,1.3,1.05),("BN4 L1100",4,1100,4.7,1.3,1.5,1.2)]:
    for sp in (.05,.2,.5):
        for r in (50,):
            tot,u=fleet(bn,L,mm,mc,spd,mg,r*1024,sp)
            usedT=sum(x[5] for x in u)/1024
            print(f"{name:22} spacing {sp:4}s {r}TB: {fm(tot)}/s using {usedT:5.1f} TB on {len(u)} targets: "+", ".join(f"{a}({fm(v)} f{f} T{t:.0f}s)" for a,v,f,t,c,us in u[:4]))
print()
print("== exp per GB-second, by method, on joesguns at min security (BN4 xp .4, mexp=1) ==")
def lvl(M,exp): return max(1,M*(32*math.log(exp+534.6)-200))
for L,spd in [(100,1.2),(500,1.3),(1000,1.5),(3000,1.8),(9000,1.8)]:
    t=3125/(L+50)/spd; e=7.5*.4; c=min(1,(1.75*L-10)/(1.75*L)*.95*1.3)
    print(f"L{L}: T={t:.2f}s weaken-only {e/(1.75*4*t):.3f}  grow+weaken {e*1.08/((1.75*3.2+.08*1.75*4)*t):.3f}  hack-heavy {e*(c+(1-c)/4)/(1.7*t):.3f} (+weaken share ~4%)")
print()
print("== climb: hours from exp 0 to hacking 9000, BN4, at speed x1.8 ==")
def climb(M,mexp,tb,method,target=9000):
    gb=tb*1024; exp=0.0; h=0.0
    req=math.exp((target/M+200)/32)-534.6
    # integrate in log-exp steps
    e=1.0
    while e<req:
        L=lvl(M,e); t=3125/(L+50)/1.8
        base=7.5*.4*mexp
        if method=="w": r=base/(1.75*4*t)
        if method=="gw": r=base*1.08/((1.75*3.2+.08*1.75*4)*t)
        if method=="h":
            c=min(1,(1.75*L-10)/(1.75*L)*.95*1.3)
            # 96% hack, 4% weaken share of RAM
            r=.96*base*(c+(1-c)/4)/(1.7*t)+.04*base/(1.75*4*t)
        de=e*.02; h+=de/(r*gb)/3600; e+=de
    return req,h
print("M  mexp  exp-needed | 25TB: weaken  g+w  hack | 100TB: g+w hack | 400TB: g+w hack")
for M,mx in [(12,10),(13,10.5),(14,11),(15,12),(16,12.5),(18,14)]:
    q=[climb(M,mx,tb,m) for tb,m in [(25,"w"),(25,"gw"),(25,"h"),(100,"gw"),(100,"h"),(400,"gw"),(400,"h")]]
    print(f"{M:2} {mx:5} {q[0][0]:.2g} | "+"  ".join(f"{x[1]:7.1f}" for x in q))
print()
print("== share vs RAM ==")
for tb in [.0625,.25,1,4,25,100,400]:
    th=tb*1024/4
    print(f"{tb:7} TB in share: {th:8.0f} threads  rep x{1+math.log(th+1)/25:.3f}")
print()
print("== prep: time for first weaken wave from base security, BN4 / BN1 grow threads to reach max ==")
for n,L,spd in [("joesguns",100,1.2),("phantasy",300,1.2),("the-hub",400,1.2),("rho",600,1.3),("b-and-a",1100,1.5),("clarkinc",1100,1.5),("clarkinc",2000,1.5),("ecorp",1300,1.5),("ecorp",3000,1.8)]:
    s=[x for x in S if x[0]==n][0]
    for bn in (4,):
        sv=srv(s,bn); tb=T(sv,sv['base'],L,spd); tm=T(sv,sv['sec'],L,spd)
        k=min(math.log1p(.03/sv['sec']),.00349388925)*sv['g']/100
        print(f"{n:10} L{L:5}: weaken from base {4*tb/60:6.1f} min; batch period at min sec 4T={4*tm/60:5.1f} min; grow x{sv['mm']/sv['start']:.2f} threads {math.log(sv['mm']/sv['start'])/k:7.0f} (BN1 x25: {math.log(25)/k:7.0f})")
print()
print("== cloud cost ==")
for bn in (1,4):
    for g in (64,1024,2048,4096,16384,65536,1048576):
        upg=max(0,math.log2(g)-6); c=g*55000*BN[bn]['soft']**upg
        print(f"BN{bn} {g:8} GB ${c:.3g} each, 25x = ${25*c:.3g}, ${c/g:.3g}/GB")
