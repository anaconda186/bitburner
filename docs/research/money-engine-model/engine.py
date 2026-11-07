import math
# (name, base money, base sec, growth, req, ports) midpoints from servers.ts v3.0.1
S=[("ecorp",50e9,99,99,1225,5),("megacorp",50e9,99,99,1225,5),("b-and-a",22.5e9,80,70,1025,5),("blade",25e9,92,70,1050,5),
("nwo",30e9,99,80,1125,5),("clarkinc",20e9,55,60,1100,5),("omnitek",17.5e9,95,97,1000,5),("4sigma",20e9,65,87,1075,5),("kuai-gong",25e9,97,95,1125,5),
("fulcrumtech",1.6e9,90,90,1100,5),("stormtech",1.1e9,85,80,975,5),("defcomm",875e6,90,60,950,5),("infocomm",750e6,80,55,912,5),("helios",650e6,90,75,850,5),
("vitalife",750e6,85,70,837,5),("icarus",950e6,90,90,887,5),("univ-energy",1150e6,85,85,850,4),("titan-labs",825e6,75,70,837,5),("microdyne",600e6,70,80,837,5),
("taiyang",850e6,75,75,900,5),("galactic",800e6,60,80,850,5),("aerocorp",1100e6,85,60,887,5),("omnia",950e6,90,65,900,5),("zb-def",1000e6,60,70,800,4),
("applied-en",850e6,70,72,812,4),("solaris",800e6,75,75,800,5),("deltaone",1500e6,80,60,850,5),("global-pharm",1625e6,80,85,800,4),("nova-med",1175e6,70,75,812,4),
("zeus-med",1400e6,80,75,825,5),("unitalife",1050e6,75,75,800,4),("lexo-corp",750e6,70,60,700,4),("rho",600e6,50,50,500,3),("alpha-ent",675e6,60,55,550,4),
("aevum-police",300e6,75,40,425,4),("rothman",212e6,50,40,400,3),("zb-inst",950e6,75,80,750,5),("summit",275e6,55,50,450,3),("syscore",500e6,70,65,600,4),
("catalyst",425e6,65,40,425,3),("the-hub",175e6,40,50,300,2),("computek",235e6,60,55,350,3),("netlink",275e6,70,60,400,3),("johnson",77e6,50,50,275,2),
("n00dles",70e3,1,3000,1,0),("foodnstuff",2e6,10,5,1,0),("sigma",2.3e6,10,10,5,0),("joesguns",2.5e6,15,20,10,0),("zer0",7.5e6,25,40,75,1),("nectar",2.75e6,20,25,20,0),
("neo-net",5e6,25,25,50,1),("silver-helix",45e6,30,30,150,2),("hong-fang",3e6,15,20,30,0),("harakiri",4e6,15,40,40,0),("phantasy",24e6,20,35,100,2),("max-hw",10e6,15,30,80,1),
("omega-net",65e6,30,35,200,2),("crush",50e6,40,30,250,2),("iron-gym",20e6,30,20,100,1),("millenium",250e6,50,35,500,3),("powerhouse",900e6,60,55,1025,5),("snap",450e6,50,50,737,4)]
BN={1:dict(mm=1,shm=1,gr=1,xp=1,soft=1.0),4:dict(mm=.1125,shm=.2,gr=1,xp=.4,soft=1.2)}
def srv(s,bn):
    n,b,sec,g,req,p=s; mins=max(1,round(sec/3))
    return dict(n=n,mm=25*b*BN[bn]['mm'],start=b*(.75 if bn==4 else 1),sec=mins,base=sec,g=g,req=req,ports=p)
def T(sv,sec,L,spd): return 5*(2.5*sv['req']*sec+500)/(L+50)/spd
def plan(sv,bn,L,mm,mc,spd,mg,f):
    B=BN[bn]; sec=sv['sec']
    p=(100-sec)/100*(L-(sv['req']-1))/L*mm*B['shm']/240
    if p<=0:return None
    sk=max(1.75*L,1); c=min(1,max(0,(sk-sv['req'])/sk*(100-sec)/100*mc))
    if c<=0:return None
    k=min(math.log1p(.03/sec),.00349388925)*sv['g']/100*B['gr']*mg
    th=f/p; gt=-math.log(1-f)/k*1.05; wt=(.002*th+.004*gt)/.05*1.05
    t=T(sv,sec,L,spd)
    gbs=th*1.7*t+gt*1.75*3.2*t+wt*1.75*4*t
    money=f*sv['mm']*c
    xp=(3+.3*sv['base'])*B['xp']*(th*(c+(1-c)/4)+gt+wt)
    return dict(rate=money/gbs,money=money,gbs=gbs,t=t,c=c,th=th,gt=gt,wt=wt,xp=xp/gbs,f=f)
def best(sv,bn,L,mm,mc,spd,mg,ram,spacing):
    # best sustained $/s on this target with `ram` GB, batches no closer than spacing
    bestv=None
    for f in [.02,.05,.1,.2,.3,.4,.5,.6,.7,.8,.9]:
        q=plan(sv,bn,L,mm,mc,spd,mg,f)
        if not q: continue
        batches=ram/q['gbs']   # batches per second RAM allows
        bps=min(batches,1/spacing)
        v=bps*q['money']; 
        if not bestv or v>bestv['v']: bestv=dict(q,v=v,bps=bps,used=bps*q['gbs'])
    return bestv
def fleet(bn,L,mm,mc,spd,mg,ram,spacing,maxports=5):
    left=ram;tot=0;used=[]
    cand=[srv(s,bn) for s in S if s[4]<=L and s[5]<=maxports]
    # greedy by $/GB-s at small f then fill
    while left>ram*.01 and cand:
        rs=[]
        for sv in cand:
            b=best(sv,bn,L,mm,mc,spd,mg,left,spacing)
            if b: rs.append((b['v']/max(b['used'],1e-9) if False else b['v'],sv,b))
        if not rs:break
        rs.sort(key=lambda x:-x[0]); v,sv,b=rs[0]
        tot+=v;left-=b['used'];used.append((sv['n'],v,b['f'],b['t'],b['c'],b['used']));cand.remove(sv)
        if len(used)>=12:break
    return tot,used
def fm(x):
    for u,d in(("t",1e12),("b",1e9),("m",1e6),("k",1e3)):
        if abs(x)>=d:return f"${x/d:.3g}{u}"
    return f"${x:.3g}"
if __name__=="__main__":
    print("== INCOME by stage (spacing .2s per batch; expected-value; steady state, ignores prep) ==")
    cases=[("BN1 first reset, L60, no augs",1,60,1,1,1,1,[.032,.064,.128,.256]),
    ("BN1 L200, no augs",1,200,1,1,1,1,[.128,.5,1,4]),
    ("BN1 L500, some augs",1,500,1.5,1.1,1.1,1.05,[1,4,16,64]),
    ("BN1 L1000, set2",1,1000,4.68,1.3,1.41,1.2,[4,25,100,400]),
    ("BN1 L2500, set2",1,2500,4.68,1.3,1.41,1.2,[25,100,400,1600]),
    ("BN4 L60, SF1",4,60,1.16,1.16,1.16,1,[.032,.064,.128]),
    ("BN4 L200",4,200,1.3,1.2,1.2,1,[.128,.5,1,4]),
    ("BN4 L500",4,500,2,1.2,1.3,1.05,[1,4,16,25]),
    ("BN4 L1100",4,1100,4.7,1.3,1.5,1.2,[4,25,50,100,400]),
    ("BN4 L2000",4,2000,4.7,1.3,1.5,1.2,[25,50,100,400]),
    ("BN4 L4000",4,4000,10,1.3,1.8,1.2,[25,50,100,400]),]
    for name,bn,L,mm,mc,spd,mg,rams in cases:
        print(name)
        for r in rams:
            tot,u=fleet(bn,L,mm,mc,spd,mg,r*1024,.2)
            top=", ".join(f"{a}({fm(v)}/s f{f} T{t:.0f}s c{c:.2f})" for a,v,f,t,c,us in u[:3])
            print(f"  {r:>7} TB -> {fm(tot)}/s  n={len(u)}  {top}")
