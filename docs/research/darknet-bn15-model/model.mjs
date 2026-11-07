// Darknet lab model for Bitburner v3.0.1 (BN15). Everything printed here is INFERENCE:
// formulas are copied from the v3.0.1 source (see docs/research/darknet-bn15.md for links),
// the scenarios (thread counts, multipliers, walker strategy) are my assumptions.
// Run: node model.mjs   (Node 18+, no dependencies)

const LABS = [ // labyrinth.ts#L37-L110; BN15 order from getCurrentLabName (labyrinth.ts#L434-L473)
  { n: 1, name: "Normal", depth: 7, cha: 300, w: 20, h: 14, off: false },
  { n: 2, name: "Cruel", depth: 12, cha: 600, w: 30, h: 20, off: false },
  { n: 3, name: "Merciless", depth: 19, cha: 1500, w: 40, h: 26, off: false },
  { n: 4, name: "Uber", depth: 23, cha: 2500, w: 60, h: 40, off: true },
  { n: 5, name: "Eternal (TRP in BN15)", depth: 29, cha: 3000, w: 60, h: 40, off: true },
];

// ---------- maze: port of generateMaze / mazeMaker (labyrinth.ts#L120-L186) ----------
const WALL = "#";
const PATH = " ";
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
function mazeMaker(sw, sh) {
  const w = sw % 2 === 0 ? sw + 1 : sw;
  const h = sh % 2 === 0 ? sh + 1 : sh;
  const m = Array.from({ length: h }, () => Array(w).fill(WALL));
  const st = [[1, 1]];
  while (st.length) {
    const [x, y] = st.pop();
    const nb = DIRS.map(([dx, dy]) => [x + dx * 2, y + dy * 2]).filter(
      ([nx, ny]) => nx > 0 && nx < w && ny > 0 && ny < h && m[ny][nx] === WALL,
    );
    if (nb.length) {
      st.push([x, y]);
      const [nx, ny] = nb[Math.floor(Math.random() * nb.length)];
      m[(y + ny) / 2][(x + nx) / 2] = PATH;
      m[ny][nx] = PATH;
      st.push([nx, ny]);
    }
  }
  return m;
}
function generateMaze(width, height) {
  const hw = Math.ceil(width / 2);
  const hh = Math.ceil(height / 2);
  const [m1, m2, m3, m4] = [0, 1, 2, 3].map(() => mazeMaker(hw, hh));
  const top = m1.map((r, y) => r.slice(0, -1).concat(m2[y]));
  const bot = m3.map((r, y) => r.slice(0, -1).concat(m4[y]));
  const R = top.slice(0, -1).concat(bot);
  const sw = m1[0].length - 1;
  const sh = m1.length - 1;
  R[Math.floor((Math.random() * hw) / 4) * 2 + 1][sw] = PATH;
  R[sh][Math.floor((Math.random() * hh) / 4) * 2 + 1] = PATH;
  R[height - (Math.floor((Math.random() * hw) / 4) + 1) * 2 - 1][sw] = PATH;
  R[sh][width - (Math.floor((Math.random() * hh) / 4) + 1) * 2 - 1] = PATH;
  return R;
}
const offs = (on) => (on ? [Math.floor(Math.random() * 3) * 2, Math.floor(Math.random() * 3) * 2] : [0, 0]);

// Walkers. A move is 2 cells and costs one authenticate call. Every reply carries the 3x3 view
// around the new position (labyrinth.ts#L285-L331), so a walker never needs to bump into walls.
function solve(maze, start, end, strategy) {
  const key = (x, y) => y * 1000 + x;
  const open = (x, y, [dx, dy]) => maze[y + dy]?.[x + dx] === PATH;
  if (strategy === "shortest") {
    // BFS: a lower bound that assumes the map is known in advance.
    const q = [[start[0], start[1], 0]];
    const seen = new Set([key(...start)]);
    for (let i = 0; i < q.length; i++) {
      const [x, y, d] = q[i];
      if (x === end[0] && y === end[1]) return d;
      for (const dir of DIRS) {
        if (!open(x, y, dir)) continue;
        const nx = x + dir[0] * 2;
        const ny = y + dir[1] * 2;
        if (!seen.has(key(nx, ny))) {
          seen.add(key(nx, ny));
          q.push([nx, ny, d + 1]);
        }
      }
    }
    return NaN;
  }
  // DFS with physical backtracking; "greedy" tries directions toward the end first.
  let moves = 0;
  const seen = new Set([key(...start)]);
  const stack = [start];
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    if (x === end[0] && y === end[1]) return moves;
    const score = (d) => d[0] * Math.sign(end[0] - x) + d[1] * Math.sign(end[1] - y);
    const order = DIRS.slice().sort((a, b) => (strategy === "greedy" ? score(b) - score(a) : 0) || Math.random() - 0.5);
    const next = order.find((d) => open(x, y, d) && !seen.has(key(x + d[0] * 2, y + d[1] * 2)));
    if (next) {
      const nx = x + next[0] * 2;
      const ny = y + next[1] * 2;
      seen.add(key(nx, ny));
      stack.push([nx, ny]);
      moves++;
    } else {
      stack.pop();
      if (stack.length) moves++;
    }
  }
  return NaN;
}

// ---------- authentication time (effects.ts#L60-L90) ----------
function authMs({ difficulty, reqCha, depth }, cha, { boots = false, threads = 1 } = {}) {
  const baseDiff = (difficulty + 1) * 100;
  const skill = (5 * reqCha + baseDiff) / (cha + 150);
  const under = cha <= reqCha && depth > 1 ? 1.5 + (reqCha + 50) / (cha + 50) : 1;
  return (850 * skill * under * (boots ? 0.8 : 1)) / (1 + 0.2 * (threads - 1));
}

const fmt = (s) =>
  !Number.isFinite(s) ? "never" : s < 90 ? `${s.toFixed(0)} s` : s < 5400 ? `${(s / 60).toFixed(1)} min` : s < 172800 ? `${(s / 3600).toFixed(1)} h` : `${(s / 86400).toFixed(1)} d`;
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const pct = (a, p) => [...a].sort((x, y) => x - y)[Math.floor(p * (a.length - 1))];

console.log("=== A. Maze size and walk length (inference; 400 random mazes per lab) ===");
console.log("lab | maze WxH | shortest moves (mean) | greedy DFS moves (mean / p90) | blind DFS moves (mean / p90) | unreachable");
const walk = {};
for (const lab of LABS) {
  const res = { shortest: [], greedy: [], blind: [] };
  let dims = "";
  let unreachable = 0;
  for (let i = 0; i < 400; i++) {
    const maze = generateMaze(lab.w, lab.h);
    dims = `${maze[0].length}x${maze.length}`;
    const [eo, eo2] = offs(lab.off);
    const [so, so2] = offs(lab.off);
    const end = [maze[0].length - 2 - eo, maze.length - 2 - eo2];
    const start = [1 + so, 1 + so2];
    const sp = solve(maze, start, end, "shortest");
    if (!Number.isFinite(sp)) {
      unreachable++;
      continue;
    }
    res.shortest.push(sp);
    res.greedy.push(solve(maze, start, end, "greedy"));
    res.blind.push(solve(maze, start, end, "blind"));
  }
  walk[lab.n] = { shortest: mean(res.shortest), greedy: mean(res.greedy), blind: mean(res.blind) };
  console.log(
    `${lab.n} | ${dims} | ${walk[lab.n].shortest.toFixed(0)} | ${walk[lab.n].greedy.toFixed(0)} / ${pct(res.greedy, 0.9)} | ${walk[lab.n].blind.toFixed(0)} / ${pct(res.blind, 0.9)} | ${unreachable}`,
  );
}

console.log("\n=== B. Time for one walker to finish the maze (moves x authenticate time on the lab server) ===");
console.log("lab | ms per move at cha=req+1 (Boots from lab 3 on) | ms per move at cha=1.5*req | greedy walk at req+1 | at 1.5*req | blind walk at req+1");
for (const lab of LABS) {
  const boots = lab.n >= 3; // The Boots is lab 2's reward, installed before lab 3
  const srv = { difficulty: 10, reqCha: lab.cha, depth: -1 };
  const a = authMs(srv, lab.cha + 1, { boots });
  const b = authMs(srv, lab.cha * 1.5, { boots });
  console.log(
    `${lab.n} | ${a.toFixed(0)} | ${b.toFixed(0)} | ${fmt((walk[lab.n].greedy * a) / 1000)} | ${fmt((walk[lab.n].greedy * b) / 1000)} | ${fmt((walk[lab.n].blind * a) / 1000)}`,
  );
}

console.log("\n=== C. Charisma experience the lab thresholds need (inverse of calculateSkill, skill.ts#L7-L15) ===");
const expFor = (skill, mult) => Math.exp((skill / mult + 200) / 32) - 534.6;
const reqMult = (skill, exp) => skill / (32 * Math.log(exp + 534.6) - 200);
// BN15 CharismaLevelMultiplier 1.1 (BitNode.tsx#L1098) times the charisma lab augs already installed.
const labAugCha = [1.05, 1.06, 1.07, 1.0 /* Staff: cha_exp only */, 1.09];
let prod = 1.1;
const labMult = [];
LABS.forEach((l, i) => {
  labMult.push(prod);
  prod *= labAugCha[i];
});
console.log("lab | cha | mult with only BN15 + earlier lab augs | exp needed at that mult");
LABS.forEach((l, i) => console.log(`${l.n} | ${l.cha} | ${labMult[i].toFixed(3)} | ${expFor(l.cha, labMult[i]).toExponential(2)}`));
const budgets = [1e8, 1e10, 1e12, 1e14, 1e16];
console.log("\nTotal charisma multiplier (BN15 1.1 included) needed to reach the threshold with a given exp budget:");
console.log("lab | cha | " + budgets.map((b) => `exp ${b.toExponential(0)}`).join(" | "));
for (const l of LABS) console.log(`${l.n} | ${l.cha} | ` + budgets.map((b) => reqMult(l.cha, b).toFixed(2)).join(" | "));

// Product of every distinct charisma-level aug multiplier other than the lab augs, Stanek's Gift and NeuroFlux.
const chaAugs = {
  ADRPheromone2: 1.1, BeautyOfAphrodite: 1.1, BigDsBigBrain: 2, DermaForce: 1.05, Eloquence: 1.05,
  EnhancedSocialInteractionImplant: 1.6, GoldenTongue: 1.1, HemoRecirculator: 1.08, Hypersight: 1.03,
  LuminCloaking1: 1.03, Magnetism: 1.05, NanofiberWeave: 1.05, Neotra: 1.55, NuoptimalInjectorImplant: 1.03,
  nextSENS: 1.2, PCMatrix: 1.0777, PhotosyntheticCells: 1.2, PowerRecirculator: 1.05, Primer: 1.1,
  SocialDynamo: 1.1, SmartJaw: 1.5, SpeechEnhancement: 1.1, SpeechProcessor: 1.2, SyntheticHeart: 1.3,
  TITN41Injection: 1.15, Wit: 1.03, Xanipher: 1.2,
};
const allProd = Object.values(chaAugs).reduce((a, b) => a * b, 1);
console.log(`\nProduct of ${Object.keys(chaAugs).length} non-lab charisma-level augs: ${allProd.toFixed(1)}x (an upper bound; cost and faction access unknown).`);
for (const [label, m] of [["sqrt of that product", Math.sqrt(allProd)], ["all of it", allProd]]) {
  const total = 1.1 * m * 1.05 * 1.06 * 1.07 * 1.09;
  console.log(`  BN15 x ${label} x lab augs = ${total.toFixed(1)}x -> exp for cha 3000: ${expFor(3000, total).toExponential(2)}, for 2500: ${expFor(2500, total).toExponential(2)}, 1500: ${expFor(1500, total).toExponential(2)}`);
}

console.log("\n=== D. Charisma exp income from phishing (phishing.ts#L12-L66), thread-limited ===");
// xp per call = charisma_exp * 50 * threads; wait = max(10000*400/(400+cha), 200) ms.
// Script RAM = 1.6 base + 2.0 for phishingAttack = 3.6 GB. Server RAM per DarknetServerOptions.ts#L196-L200.
const ramPerServer = (depth) => {
  let t = 0;
  for (let d = 0; d < depth; d++) t += 16 * 2 ** Math.floor(d / 6) * mean([0.5, 1, 1, 1.15, 1.4]);
  return t / depth;
};
const threadsAvail = (lab, frac) => Math.floor((lab.depth * 8 * 0.6 * frac * ramPerServer(lab.depth)) / 3.6);
console.log("lab | movable servers | mean RAM/server | threads if all RAM runs phishing | at 25%");
for (const l of LABS) console.log(`${l.n} | ${(l.depth * 8 * 0.6).toFixed(0)} | ${ramPerServer(l.depth).toFixed(0)} GB | ${threadsAvail(l, 1)} | ${threadsAvail(l, 0.25)}`);

function secondsToLevel(target, mult, expMult, threads) {
  let exp = expFor(1, mult);
  let t = 0;
  for (; t < 3e8; t += 1) {
    const cha = Math.max(1, Math.floor(mult * (32 * Math.log(exp + 534.6) - 200)));
    if (cha >= target) return t;
    const wait = Math.max((10000 * 400) / (400 + cha), 200) / 1000;
    exp += ((expMult * 50 * threads) / wait) * 1;
  }
  return Infinity;
}
console.log("\nSeconds for charisma to reach each lab's threshold from a fresh install, phishing at 25% of network RAM, nothing else (inference):");
const scen = [
  ["lab augs only, exp mult 1", (i) => labMult[i], 1],
  ["3x that mult, exp mult 3", (i) => labMult[i] * 3, 3],
  ["mult 6, exp mult 5", () => 6, 5],
  ["mult 12, exp mult 10", () => 12, 10],
];
LABS.forEach((l, i) => {
  const th = threadsAvail(l, 0.25);
  console.log(`lab ${l.n} (cha ${l.cha}, ${th} threads): ` + scen.map(([name, m, e]) => `${name}: ${fmt(secondsToLevel(l.cha, m(i), e, th))}`).join(" ; "));
});

console.log("\n=== E. Mutation pace (darknetNetworkUtils.ts#L9-L14, NetworkMovement.ts#L45-L66) ===");
for (const l of LABS) {
  const ms = ((30000 / 200) / l.depth) * 200;
  console.log(`lab ${l.n}: depth ${l.depth}: mutation check every ${(ms / 1000).toFixed(2)} s in BN15 (${((2 * ms) / 1000).toFixed(2)} s elsewhere); each check proceeds with p=${Math.min(1, 16 / l.depth).toFixed(2)}`);
}

console.log("\n=== F. Crossing an air gap by induceServerMigration (effects.ts#L245-L262, Darknet.ts#L413-L503) ===");
// Rows 8, 16, 24, ... hold no random servers (darknetNetworkUtils.ts#L103), so band-to-band travel needs a server to move.
const gaps = (depth) => { let g = 0; for (let r = 8; r <= depth - 1; r += 8) g++; return g; };
console.log("lab | air-gap rows between row 0 and the lab row: " + LABS.map((l) => `${l.n}: ${gaps(l.depth)}`).join(", "));
console.log("Calls to fully charge one server = 100 / (((cha+500)/(200*difficulty+1000)) * 1% * threads); each call takes 6 s regardless of threads.");
for (const [cha, diff, threads] of [[300, 5, 1], [1000, 10, 1], [1000, 10, 50], [3000, 24, 1], [3000, 24, 100]]) {
  const per = ((cha + 500) / (diff * 200 + 1000)) * 0.01 * threads;
  const calls = Math.ceil(1 / per);
  console.log(`cha ${cha}, server difficulty ${diff}, ${threads} thread(s): ${calls} calls = ${fmt(calls * 6)}`);
}
