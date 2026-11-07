# Darknet labs and the BN15 route (v3.0.1)

Research date: 2026-11-07. Answers [#27](https://github.com/anaconda186/bitburner/issues/27).

Sources:
- The game's source at tag [`v3.0.1`](https://github.com/bitburner-official/bitburner-src/tree/v3.0.1) (commit `3162fd2`), read from a local clone. I did not run the game. Every `V301/...` link below is `https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/...`.
- The game's own darknet page, [V301/src/Documentation/doc/en/programming/darknet.md](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Documentation/doc/en/programming/darknet.md).

Statements marked **(inference)** are my reasoning or a model result. No source states them directly. The model is [darknet-bn15-model/model.mjs](darknet-bn15-model/model.mjs) and its printed output is [output.txt](darknet-bn15-model/output.txt). A Math.random() maze sample was used, so the numbers move a little between runs.

---

## Summary

1. **BN15 needs five labs in a row, and each lab needs its own install.** The Red Pill is the reward of the 5th lab (Eternal). Each lab reward is only *queued*, and the next lab opens only when the previous aug is *installed*. So the lab part of the route is 4 installs to open lab 5, then a 5th install to get The Red Pill.
2. **Charisma is the gate, not the maze.** Lab 5 needs charisma skill 3000. Charisma exp is wiped on every install. With only BN15's x1.1 and the lab augs' charisma, lab 3 already needs about 2e19 exp and lab 5 about 6e33 exp **(inference)**, which is out of reach. The route therefore depends on buying other charisma augs in the earlier installs. How many, and how fast, is the open question.
3. **The maze itself is cheap.** One walker needs about 280-320 moves (greedy depth-first) in the 60x40 labs. At about 3.5 s per move that is roughly 15-20 minutes for labs 4 and 5, and 2-6 minutes for labs 1-3 **(inference)**.
4. **Getting to the lab is the unmodelled cost.** The lab hangs off the deepest row (row 28 for lab 5). The path crosses up to three "air gaps" (rows 8, 16, 24) that can only be crossed by a server moving, on a network that mutates about once a second in BN15.
5. **I cannot give a total BN15 time.** The sum depends on how fast charisma multipliers and money can be bought across five installs, which this note does not model. The pieces that can be bounded are in the tables below.

---

## 1. How a lab works (fact)

### Which lab, in what order

- `getCurrentLabName` picks the lab from the augs the player has **installed** (`Player.augmentations`, not queued) ([labyrinth.ts#L432-L473](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/labyrinth.ts#L432-L473)).
- In BN15 the order is: Normal, Cruel, Merciless, Uber, **Eternal**. The labs after Eternal (Endless, Final, Bonus) exist only after The Red Pill ([labyrinth.ts#L449-L460](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/labyrinth.ts#L449-L460)).
- The reward is `getLabAugReward`: The Broken Wings, The Boots, The Hammer, The Staff, then **on BN15 The Red Pill instead of The Law** ([labyrinth.ts#L403-L430](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/labyrinth.ts#L403-L430), BN15 case at L419-L422).
- Outside BN15 the Red Pill is the 7th lab (Final, charisma 4000), and it is absent in BN8, where `DarknetLabyrinthRewardsTheRedPill` is 0 ([labyrinth.ts#L462-L472](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/labyrinth.ts#L462-L472); [BitNode.tsx#L792](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L792)). The BN15 lab 5 is therefore the cheapest Red Pill lab, which bears on survey open question 2.

### Per-lab data ([labyrinth.ts#L37-L110](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/labyrinth.ts#L37-L110))

| Lab | Host key | Net depth (rows) | Charisma required | Maze arg (WxH) | Start/end offset | Reward in BN15 |
|---|---|---|---|---|---|---|
| 1 | Normal | 7 | 300 | 20x14 | no | The Broken Wings |
| 2 | Cruel | 12 | 600 | 30x20 | no | The Boots |
| 3 | Merciless | 19 | 1500 | 40x26 | no | The Hammer |
| 4 | Uber | 23 | 2500 | 60x40 | yes (0, 2 or 4 cells) | The Staff |
| 5 | Eternal | 29 | **3000** | 60x40 | yes | **The Red Pill** |

### What entering a lab involves

- **Access.** BN15 or any SF15 level gives the labs ([effects.ts#L280](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/effects.ts#L280)). In BN15, `DarkscapeNavigator.exe` and TOR are handed out at every install and BN entry ([Prestige.ts#L100-L102](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L100-L102), [#L238-L240](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L238-L240); [effects.ts#L264-L273](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/effects.ts#L264-L273)).
- **The network is sized by the current lab.** `getNetDepth()` returns the current lab's depth. The network has depth x 8 slots, filled to 60% density ([NetworkGenerator.ts#L91-L111](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/controllers/NetworkGenerator.ts#L91-L111); [Enums.ts#L6-L10](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/Enums.ts#L6-L10); [labyrinth.ts#L393-L396](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/labyrinth.ts#L393-L396)).
  - Lab 5 means 29 rows and about 139 movable servers.
  - An install clears the network, the maze and all lab positions ([DarknetState.ts#L189-L206](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/models/DarknetState.ts#L189-L206)), so each lab gets a fresh network.
- **The lab is stationary and only touches the last row.** A server placed at row `depth - 1` is linked to the lab ([NetworkGenerator.ts#L226-L230](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/controllers/NetworkGenerator.ts#L226-L230)). A script must run on a server directly connected to the lab to talk to it ([Darknet.ts#L641-L706](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Darknet.ts#L641-L706) for the `labreport`/`labradar` checks; `authenticate` requires a direct connection at [L93-L178](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Darknet.ts#L93-L178)).
- **Moving in the maze is `ns.dnet.authenticate(lab, "go north")`.** The words n/e/s/w, north/east/south/west and up/right/down/left are accepted ([labyrinth.ts#L340-L362](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/labyrinth.ts#L340-L362)).
  - One move is 2 cells.
  - A wall bump is a failed attempt and costs a call. Every reply carries the 3x3 view around the walker ([labyrinth.ts#L285-L331](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/labyrinth.ts#L285-L331)).
  - `ns.dnet.labradar()` returns a 7x7 view with the exit `X` shown, and `labreport()` returns coordinates and open directions. Each call costs one authentication delay ([Darknet.ts#L641-L706](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Darknet.ts#L641-L706)).
  - **Position is per script PID**, so several scripts can walk the same maze independently ([DarknetState.ts#L147-L153](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/models/DarknetState.ts#L147-L153); [labyrinth.ts#L334-L338](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/labyrinth.ts#L334-L338)). A killed script loses its place.
  - Guessing the lab password is rejected ([labyrinth.ts#L278-L284](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/labyrinth.ts#L278-L284)).
- **Charisma check.** Any attempt below the lab's required charisma returns "Not Enough Charisma" without moving ([labyrinth.ts#L243-L255](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/labyrinth.ts#L243-L255)). Ordinary darknet servers have no such check on `authenticate`; only `heartbleed` does ([Darknet.ts#L248-L260](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Darknet.ts#L248-L260)). For them a low charisma only slows authentication ([effects.ts#L77-L78](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/effects.ts#L77-L78)).
- **Finishing.** Reaching the exit sets admin rights on the lab and puts one `the_great_work` cache file on it ([labyrinth.ts#L308-L323](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/labyrinth.ts#L308-L323)).
  - A script **running on the lab server** then calls `ns.dnet.openCache`, which queues the lab aug ([Darknet.ts#L292-L313](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Darknet.ts#L292-L313); [cacheFiles.ts#L35-L46](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/cacheFiles.ts#L35-L46), [#L173-L180](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/cacheFiles.ts#L173-L180)).
  - `queueAugmentation` only queues, so an **install** is needed before the next lab ([PlayerObjectGeneralMethods.ts#L473](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Player/PlayerObjectGeneralMethods.ts#L473)). This confirms the survey's "one install per lab".
  - The lab aug costs no money or rep to obtain, only the cache open. Installing it still goes through the normal install.

### The lab augs also change the next lab ([Augmentations.ts#L1850-L1943](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/Augmentations.ts#L1850-L1943))

| Aug | Effect that matters here |
|---|---|
| The Broken Wings | charisma x1.05, stasis-link limit +1 |
| The Boots | charisma x1.06, **authentication 20% faster** ([effects.ts#L79](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/effects.ts#L79)) |
| The Hammer | charisma x1.07, stasis-link limit +1 |
| The Staff | charisma **exp** x1.1, stasis-link limit +1 |

The stasis link limit is `1 + Wings + Hammer + Staff` ([effects.ts#L211-L216](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/effects.ts#L211-L216)). A stasis-linked server cannot be moved, restarted or deleted ([NetworkMovement.ts#L227-L228](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/controllers/NetworkMovement.ts#L227-L228)), so it is the natural launch pad next to the lab. By lab 5 the limit is 4.

---

## 2. Charisma is the bottleneck

### The formula (fact)

- Skill = `floor(mult x (32 ln(exp + 534.6) - 200))`, and exp resets on every install ([skill.ts#L7-L15](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/formulas/skill.ts#L7-L15); [Prestige.ts#L49](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L49); [PlayerObjectGeneralMethods.ts#L93-L100](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Player/PlayerObjectGeneralMethods.ts#L93-L100)).
- BN15's charisma multiplier is 1.1 ([BitNode.tsx#L1098](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L1098)). Augmentations multiply it ([Augmentations.ts](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/Augmentations.ts), 27 non-lab augs raise `charisma`, from x1.03 to x2.0).

Because the exponent is exp = e^((skill/mult + 200)/32), a small change in the multiplier changes the exp needed by many orders of magnitude.

### Exp each lab needs (inference, [model section C](darknet-bn15-model/output.txt))

| Lab | Charisma | Mult with only BN15 + earlier lab augs | Exp needed at that mult |
|---|---|---|---|
| 1 | 300 | 1.10 | 2.6e6 |
| 2 | 600 | 1.155 | 5.8e9 |
| 3 | 1500 | 1.224 | 2.2e19 |
| 4 | 2500 | 1.31 | 4.1e28 |
| 5 | 3000 | 1.31 | 6.2e33 |

Total charisma multiplier (BN15 x1.1 included) needed for a given total exp:

| Lab | 1e8 exp | 1e10 | 1e12 | 1e14 | 1e16 |
|---|---|---|---|---|---|
| 3 (1500) | 3.85 | 2.79 | 2.19 | 1.80 | 1.53 |
| 4 (2500) | 6.42 | 4.66 | 3.65 | 3.01 | 2.55 |
| 5 (3000) | 7.70 | 5.59 | 4.38 | 3.61 | 3.06 |

Reading: only lab 1 is reachable on BN15's x1.1 alone (lab 2 needs 5.8e9 exp, about 58 days of phishing at 25% of the lab-2 network). From lab 2 on the run must have bought a stack of charisma augs, roughly x2 to x4 more than the lab augs give. The product of all 27 non-lab charisma-level augs is x68 (inference), so the headroom exists, but the survey's "Plausibly fastest: a darknet crawler" skips the cost of buying them, at x3 money cost in BN15.

### Where charisma exp comes from (fact)

| Source | Exp | Rate limit |
|---|---|---|
| `phishingAttack` | `charisma_exp x 50 x threads` per call, a quarter on a miss | wait `max(10000 x 400/(400+cha), 200)` ms ([phishing.ts#L12-L66](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/phishing.ts#L12-L66)) |
| `promoteStock` | `charisma_exp x threads x 10 x (200+cha)/200` | wait `max(8000 x 600/(600+cha), 200)` ms ([Darknet.ts#L582-L610](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Darknet.ts#L582-L610)) |
| Password attempt | `(3 + 1.1^difficulty) x threads x charisma_exp`, x10 on the first success, x1.5 with bonus time | one authentication delay ([effects.ts#L113-L121](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/effects.ts#L113-L121)) |
| `heartbleed` | `50 x (500+cha)/500 x charisma_exp` | 1.5 x an authentication delay ([Darknet.ts#L262](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Darknet.ts#L262)) |
| `induceServerMigration` | `5 x threads x difficulty x charisma_exp` | 6 s per call ([Darknet.ts#L413-L503](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Darknet.ts#L413-L503); [effects.ts#L245-L262](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/effects.ts#L245-L262)) |
| University courses | Management 2 or Leadership 4 exp per second, base | [ClassWork.tsx#L43-L52](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Work/ClassWork.tsx#L43-L52) |

Phishing and promotion scale **linearly with threads**, and the script must run on a darknet server (`expectRunningOnDarknetServer`), so the limit is the RAM of the servers the crawler owns. A phishing script costs 1.6 GB base plus 2 GB for `phishingAttack` ([RamCostGenerator.ts#L11](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts#L11), `phishingAttack: 2` in the `dnet` table).

### Modelled exp rate and time (inference, [model section D](darknet-bn15-model/output.txt))

Assumptions: server RAM follows `16 x 2^floor(difficulty/6)` with difficulty spread evenly over the rows ([DarknetServerOptions.ts#L206](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/models/DarknetServerOptions.ts#L206)); blocked RAM ignored; phishing only; 25% of network RAM running it.

| Lab | Movable servers | Mean RAM/server | Threads at 100% | At 25% |
|---|---|---|---|---|
| 1 | 34 | 18 GB | 172 | 43 |
| 2 | 58 | 24 GB | 387 | 96 |
| 3 | 91 | 43 GB | 1077 | 269 |
| 4 | 110 | 58 GB | 1766 | 441 |
| 5 | 139 | 95 GB | 3662 | 915 |

Time for charisma to reach the lab's threshold from a fresh install at 25% of the RAM:

| Lab | Lab augs only, exp mult 1 | Mult x3 that, exp mult 3 | Mult 6, exp mult 5 | Mult 12, exp mult 10 |
|---|---|---|---|---|
| 1 (300) | 2.0 h | 9 s | 2 s | 1 s |
| 2 (600) | 58 days | 38 s | 3 s | 1 s |
| 3 (1500) | never | 2.8 h | 47 s | 2 s |
| 4 (2500) | never | 56 days | 53 min | 4 s |
| 5 (3000) | never | 1225 days | 4.8 h | 5 s |

The scenario multipliers are my picks, not a purchase plan. The point is the shape: below a multiplier of about x4-x6 the lab is out of reach at any thread count, above about x10 the charisma time stops mattering. **The multiplier decides the route; the run's money and rep decide the multiplier.**

---

## 3. Walking the maze (inference, [model sections A and B](darknet-bn15-model/output.txt))

I ported `generateMaze` ([labyrinth.ts#L120-L186](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/labyrinth.ts#L120-L186)) and walked 400 random mazes per lab. The actual mazes are 21x13, 29x21, 41x25, 61x41 and 61x41 cells. No sampled maze was unreachable.

| Lab | Shortest path (moves) | Greedy DFS (mean / p90) | Blind DFS (mean / p90) |
|---|---|---|---|
| 1 | 17 | 31 / 58 | 53 / 88 |
| 2 | 33 | 60 / 90 | 116 / 208 |
| 3 | 53 | 105 / 150 | 213 / 372 |
| 4 | 114 | 317 / 689 | 512 / 926 |
| 5 | 113 | 284 / 462 | 497 / 908 |

"Greedy" tries open directions toward the bottom-right first, which matches where the exit sits. Wall bumps are avoided using the 3x3 view in each reply.

Time per move is one authentication delay on the lab server ([effects.ts#L60-L90](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/effects.ts#L60-L90)). For the lab, difficulty is 10 and required charisma is the lab's ([NetworkGenerator.ts#L235-L261](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/controllers/NetworkGenerator.ts#L235-L261)). At exactly the required charisma the underlevelled penalty applies (`<=`), so the player should have at least required + 1.

| Lab | ms/move at cha = req+1 | at 1.5 x req | Greedy walk at req+1 | at 1.5 x req | Blind walk at req+1 |
|---|---|---|---|---|---|
| 1 | 4900 | 3683 | 2.5 min | 1.9 min | 4.3 min |
| 2 | 4640 | 3319 | 4.7 min | 3.3 min | 9.0 min |
| 3 (Boots) | 3542 | 2437 | 6.2 min | 4.3 min | 12.6 min |
| 4 (Boots) | 3488 | 2371 | 18.4 min | 12.5 min | 29.8 min |
| 5 (Boots) | 3474 | 2354 | 16.4 min | 11.1 min | 28.8 min |

Threads shorten each move (`1/(1 + 0.2(threads-1))`), and several PIDs can search the maze in parallel, so these are single-walker upper-ish bounds. Not modelled: a walker's host server being moved or killed, which resets its PID position.

---

## 4. Getting to the lab (partly fact, mostly open)

- **Air gaps.** Rows that are a multiple of 8 (8, 16, 24, ...) never receive random servers ([darknetNetworkUtils.ts#L103](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/utils/darknetNetworkUtils.ts#L103); [#L16-L34](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/utils/darknetNetworkUtils.ts#L16-L34)). Servers connect only to their own and adjacent rows (`addRandomConnections` at [NetworkGenerator.ts#L178-L201](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/controllers/NetworkGenerator.ts#L178-L201)). The game's page says these gaps "can only be crossed via riding a server as it moves" ([darknet.md#L158](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Documentation/doc/en/programming/darknet.md#L158)).
  - Gaps between row 0 and the lab's row: lab 1: 0, lab 2: 1, lab 3: 2, lab 4: 2, lab 5: **3** (inference from the depths above).
  - `induceServerMigration` charges +`(cha+500)/(200 x difficulty + 1000) x 1% x threads` per 6 s call and moves the server at 100% to a random open row within difficulty -2 to +4 ([effects.ts#L245-L262](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/effects.ts#L245-L262); [NetworkMovement.ts#L230-L260](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/controllers/NetworkMovement.ts#L230-L260)). So the *direction is random*. Charge time (inference, [model F](darknet-bn15-model/output.txt)): about 17-25 min with one thread, 12-24 s with 50-100 threads.
- **Mutation pace.** One mutation check runs every `30 s / depth` in BN15 (twice as often as elsewhere), and a check proceeds with probability `min(1, 16/depth)` ([darknetNetworkUtils.ts#L9-L14](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/utils/darknetNetworkUtils.ts#L9-L14); [NetworkMovement.ts#L45-L66](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/controllers/NetworkMovement.ts#L45-L66)). Lab 5: a check every 1.03 s, 55% proceeding. A proceeding check can move up to 3 servers, restart one, delete up to 3, or rewire connections ([NetworkMovement.ts#L64-L134](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/controllers/NetworkMovement.ts#L64-L134)). The random moves and restarts can hit any movable server. The targeted restarts (10%) and deletions (5%) pick from *backdoored* servers, and stasis-linked servers are excluded from every one of them ([darknetNetworkUtils.ts#L69-L78](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/utils/darknetNetworkUtils.ts#L69-L78)).
- **Per-server cost.** Each of the ~29 hops needs one password cracked. Required charisma of a row-`d` server is about `(d/labDepth)^1.5 x labCha x 0.85` plus a random term of -1x to +2x `d` ([DarknetServerOptions.ts#L68-L72](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/models/DarknetServerOptions.ts#L68-L72)). One attempt takes about 1-4 s at the lab's own charisma (inference from the same formula). The number of attempts depends on the server model (25 models, from no password to prime-factor and timing puzzles) and I did not model it.
- **Server models by difficulty.** Difficulty 2 and below gets only the easiest models; difficulty above 18 gets only the two hardest tiers ([ServerGenerator.ts#L18-L63](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/controllers/ServerGenerator.ts#L18-L63)).
- **Authentication cost grows with backdoors.** More backdoored servers than `max(servers / 24, 2)` slows authentication by 1.07^surplus and adds timeouts ([effects.ts#L92-L99](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/effects.ts#L92-L99); [offlineServerHandling.ts#L149-L152](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/offlineServerHandling.ts#L149-L152)). Stasis links are a backdoor too, but the limit caps them at 1-4.

---

## 5. What the BN15 route looks like (inference)

1. Enter BN15 with no SF15: DarkscapeNavigator is free. Charisma 1, multiplier 1.1.
2. **Lab 1** (cha 300, 7 rows, no air gap). Needs 2.6e6 exp. At 43-172 phishing threads this is about 0.5-2 hours; maze 2-5 minutes. Queue The Broken Wings, buy other charisma augs with whatever money exists, install.
3. **Lab 2** (cha 600, 12 rows, one gap). Needs 5.8e9 exp at x1.155, so the run must have bought charisma augs in the first install. Maze about 5 minutes. Install The Boots.
4. **Labs 3, 4 and 5.** Thresholds 1500 / 2500 / 3000. Each needs the stacked multiplier from the table above, a 19-29-row climb with 2-3 air-gap crossings, then a 15-20 minute maze. Each ends in an install.
5. Install The Red Pill, then run the normal hacking finish at 6000 and x0.6 speed, per the survey. That part does not involve the darknet.

Counting installs: at least 5 (one per lab aug including The Red Pill). The charisma augs are bought at those same installs, so they force no extra install.

---

## What I could not establish

- **Total wall-clock for the BN15 route.** It needs a purchase model for charisma augs under x3 money cost, and a measured time to build a path to the lab on a live network.
- **Attempts per server.** The 25 server models differ widely in how many guesses they need. A measurement with a lab save (see GLOSSARY: Lab save) would settle this faster than reading all 25 configs.
- **How often a crawler loses its host server** to a mutation, and how many scripts it can keep alive near the lab. Stasis links (1-4) help but are few.
- **Faction and cost of each charisma aug** (which factions sell them, and at what rep and money in BN15).
- **Whether the lab's per-PID position survives a script restart.** It is keyed by PID and cleaned when the PID dies ([DarknetState.ts#L225-L242](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/models/DarknetState.ts#L225-L242)), so I expect a new script to start at the maze entrance, but I did not test it.
- **Survey open question 2** (is the lab route ever faster than Daedalus outside BN15?). From the code: outside BN15 it needs 7 labs and 4000 charisma, so it is strictly harder than BN15's version. I have not compared it with the Daedalus route's time.

## Suggested follow-ups

1. Measure authentication attempts per server model, and the real time to reach row `depth-1`, from a lab save in BN15 (a ticket for the lab-save method).
2. Cost the charisma aug stack: which factions sell the x1.2 to x2 augs and how soon a run can afford them under x3 aug money cost.
3. Settle survey open question 2 by costing the 7-lab route (charisma 4000) against Daedalus outside BN15.
