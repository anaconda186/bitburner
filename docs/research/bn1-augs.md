# BN1 augmentation catalogue

Research for [What is the plan for the first BitNode 1?](https://github.com/anaconda186/bitburner/issues/13), part of map [#1](https://github.com/anaconda186/bitburner/issues/1). Research date: 2026-11-03. Target version: web **v3.0.1**.

Sources: the game's source at [`bitburner-official/bitburner-src`](https://github.com/bitburner-official/bitburner-src), tag **v3.0.1** (commit `3162fd2`). I read it and did not run the game. References such as `Blackjack.tsx#L16` are to files under `src/` at that tag. Statements marked (inferred) and the simulations are my own work, and their scripts aren't committed.

**Which faction set the plan uses:** set 2 below, the eastern city factions. Most tables here were first worked out for set 1, the Sector-12/Aevum bloc, as the column and section names say. [Costs for the plan's faction set](#costs-for-the-plans-faction-set) has the set 2 figures.

## Catalogue

Source: `src/Augmentation/Augmentations.ts` (line ranges per row). Non-special augs only (`isSpecial` unset), excluding Congruity Implant (factions: [], grafting only, L391-399). Special augs excluded: NeuroFlux Governor (L1159-1202), The Red Pill (L1946-1953), Bladeburner/SoA/Stanek/Icarus-line augs. Prices are base: BN1 multipliers are all 1 (`src/BitNode/BitNode.tsx#L572-574`), and actual price = base x 1.9^(queued non-SoA augs) (`AugmentationHelpers.ts#L29-37,L156-158`). Blank multiplier = 1. `hchance` = hacking_chance, included for reference.

| # | Aug | Factions | Rep | Price | Prereqs | hacking | hacking_exp | faction_rep | hacking_money | hacking_speed | hchance | in set 1 | src lines |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Neurotrainer I | CyberSec, Aevum | 1,000 | $4m |  |  | 1.1 |  |  |  |  | Y | 1241-1256 |
| 2 | Wired Reflexes | Tian Di Hui, Slum Snakes, Sector-12, Volhaven, Aevum, Ishima, The Syndicate, The Dark Army, Speakers for the Dead | 1,250 | $2.5m |  |  |  |  |  |  |  | Y | 2007-2026 |
| 3 | LuminCloaking-V1 Skin Implant | Slum Snakes, Tetrads | 1,500 | $5m |  |  |  |  |  |  |  |  | 1027-1038 |
| 4 | Hacknet Node NIC Architecture Neural-Upload | Netburners | 1,875 | $4.5m |  |  |  |  |  |  |  | Y | 895-905 |
| 5 | Synaptic Enhancement Implant | CyberSec, Aevum | 2,000 | $7.5m |  |  |  |  |  | 1.03 |  | Y | 1725-1733 |
| 6 | Hacknet Node Cache Architecture Neural-Upload | Netburners | 2,500 | $5.5m |  |  |  |  |  |  |  | Y | 864-874 |
| 7 | Speech Enhancement | Tian Di Hui, Speakers for the Dead, Four Sigma, KuaiGong International, Clarke Incorporated, Bachman & Associates | 2,500 | $12.5m |  |  |  |  |  |  |  | Y | 1555-1572 |
| 8 | BitWire | CyberSec, NiteSec | 3,750 | $10m |  | 1.05 |  |  |  |  |  | Y | 181-189 |
| 9 | Hacknet Node CPU Architecture Neural-Upload | Netburners | 3,750 | $11m |  |  |  |  |  |  |  | Y | 853-863 |
| 10 | ADR-V1 Pheromone Gene | Tian Di Hui, The Syndicate, NWO, MegaCorp, Four Sigma | 3,750 | $17.5m |  |  |  | 1.1 |  |  |  | Y | 13-30 |
| 11 | Neural Wit Amplifier | Slum Snakes, BitRunners | 5,000 | $10m |  |  |  |  |  |  |  | Y | 2035-2045 |
| 12 | Augmented Targeting I | Slum Snakes, The Dark Army, The Syndicate, Sector-12, Ishima, OmniTek Incorporated, KuaiGong International, Blade Industries | 5,000 | $15m |  |  |  |  |  |  |  | Y | 1785-1802 |
| 13 | Nuoptimal Nootropic Injector Implant | Tian Di Hui, Volhaven, New Tokyo, Chongqing, Clarke Incorporated, Four Sigma, Bachman & Associates | 5,000 | $20m |  |  |  |  |  |  |  | Y | 1287-1305 |
| 14 | LuminCloaking-V2 Skin Implant | Slum Snakes, Tetrads | 5,000 | $30m | LuminCloaking-V1 Skin Implant |  |  |  |  |  |  |  | 1039-1053 |
| 15 | NutriGen Implant | New Tokyo | 6,250 | $2.5m |  |  |  |  |  |  |  |  | 1306-1319 |
| 16 | Social Negotiation Assistant (S.N.A) | Tian Di Hui | 6,250 | $30m |  |  |  | 1.15 |  |  |  | Y | 1483-1494 |
| 17 | Artificial Synaptic Potentiation | The Black Hand, NiteSec | 6,250 | $80m |  |  | 1.05 |  |  | 1.02 | 1.05 | Y | 62-72 |
| 18 | Combat Rib I | Slum Snakes, The Dark Army, The Syndicate, Volhaven, Ishima, OmniTek Incorporated, KuaiGong International, Blade Industries | 7,500 | $23.75m |  |  |  |  |  |  |  |  | 336-354 |
| 19 | INFRARET Enhancement | Ishima | 7,500 | $30m |  |  |  |  |  |  |  |  | 991-999 |
| 20 | Hacknet Node Kernel Direct-Neural Interface | Netburners | 7,500 | $40m |  |  |  |  |  |  |  | Y | 885-894 |
| 21 | Speech Processor Implant | Tian Di Hui, Chongqing, Sector-12, New Tokyo, Aevum, Ishima, Volhaven, Silhouette | 7,500 | $50m |  |  |  |  |  |  |  | Y | 1573-1591 |
| 22 | Augmented Targeting II | The Dark Army, The Syndicate, Sector-12, OmniTek Incorporated, KuaiGong International, Blade Industries | 8,750 | $42.5m | Augmented Targeting I |  |  |  |  |  |  | Y | 1803-1819 |
| 23 | HemoRecirculator | Tetrads, The Dark Army, The Syndicate | 10,000 | $45m |  |  |  |  |  |  |  |  | 906-916 |
| 24 | Neurotrainer II | BitRunners, NiteSec | 10,000 | $45m |  |  | 1.15 |  |  |  |  | Y | 1257-1271 |
| 25 | Cranial Signal Processors - Gen I | CyberSec, NiteSec | 10,000 | $70m |  | 1.05 |  |  |  | 1.01 |  | Y | 418-429 |
| 26 | Hacknet Node Core Direct-Neural Interface | Netburners | 12,500 | $60m |  |  |  |  |  |  |  | Y | 875-884 |
| 27 | BrachiBlades | The Syndicate | 12,500 | $90m |  |  |  |  |  |  |  |  | 298-307 |
| 28 | CashRoot Starter Kit | Sector-12 | 12,500 | $125m |  |  |  |  |  |  |  | Y | 320-327 |
| 29 | DermaForce Particle Barrier | Volhaven | 15,000 | $50m |  |  |  |  |  |  |  |  | 512-522 |
| 30 | Embedded Netburner Module | BitRunners, The Black Hand, NiteSec, ECorp, MegaCorp, Fulcrum Secret Technologies, NWO, Blade Industries | 15,000 | $250m |  | 1.08 |  |  |  |  |  | Y | 550-570 |
| 31 | Magnetism Amplifier | The Black Hand, The Dark Army | 15,000 | $250m |  |  |  |  |  |  |  | Y | 1055-1062 |
| 32 | Combat Rib II | The Dark Army, The Syndicate, Volhaven, OmniTek Incorporated, KuaiGong International, Blade Industries | 18,750 | $65m | Combat Rib I |  |  |  |  |  |  |  | 355-372 |
| 33 | Cranial Signal Processors - Gen II | CyberSec, NiteSec | 18,750 | $125m | Cranial Signal Processors - Gen I | 1.07 |  |  |  | 1.02 | 1.05 | Y | 430-443 |
| 34 | Neural-Retention Enhancement | NiteSec | 20,000 | $250m |  |  | 1.25 |  |  |  |  | Y | 1118-1126 |
| 35 | SmartSonar Implant | Slum Snakes | 22,500 | $75m |  |  |  |  |  |  |  |  | 1546-1554 |
| 36 | Neurotrainer III | NWO, Four Sigma | 25,000 | $130m |  |  | 1.2 |  |  |  |  |  | 1272-1286 |
| 37 | Power Recirculation Core | Tetrads, The Dark Army, The Syndicate, NWO | 25,000 | $180m |  | 1.05 | 1.1 |  |  |  |  |  | 1436-1456 |
| 38 | TITN-41 Gene-Modification Injection | Silhouette | 25,000 | $190m |  |  |  |  |  |  |  |  | 1774-1784 |
| 39 | Eloquence Module | Speakers for the Dead | 25,000 | $250m |  |  |  |  |  |  |  |  | 524-535 |
| 40 | Augmented Targeting III | The Dark Army, The Syndicate, OmniTek Incorporated, KuaiGong International, Blade Industries, The Covenant | 27,500 | $115m | Augmented Targeting II, Augmented Targeting I |  |  |  |  |  |  |  | 1820-1834 |
| 41 | Combat Rib III | The Dark Army, The Syndicate, OmniTek Incorporated, KuaiGong International, Blade Industries, The Covenant | 35,000 | $120m | Combat Rib II, Combat Rib I |  |  |  |  |  |  |  | 373-390 |
| 42 | Nanofiber Weave | The Dark Army, The Syndicate, OmniTek Incorporated, Blade Industries, Tian Di Hui, Speakers for the Dead, Fulcrum Secret Technologies | 37,500 | $125m |  |  |  |  |  |  |  | Y | 1075-1093 |
| 43 | Neuregen Gene Modification | Chongqing | 37,500 | $375m |  |  | 1.4 |  |  |  |  |  | 1149-1158 |
| 44 | The Shadow's Simulacrum | The Syndicate, The Dark Army, Speakers for the Dead | 37,500 | $400m |  |  |  | 1.15 |  |  |  |  | 1520-1532 |
| 45 | Glibness Enhancement | Tetrads, Bladeburners | 40,500 | $2.5b |  |  |  |  |  |  |  |  | 757-767 |
| 46 | Bionic Spine | Speakers for the Dead, The Syndicate, KuaiGong International, OmniTek Incorporated, Blade Industries | 45,000 | $125m |  |  |  |  |  |  |  |  | 161-180 |
| 47 | CRTX42-AA Gene Modification | NiteSec | 45,000 | $225m |  | 1.08 | 1.15 |  |  |  |  | Y | 309-319 |
| 48 | Cranial Signal Processors - Gen III | NiteSec, The Black Hand, BitRunners | 50,000 | $550m | Cranial Signal Processors - Gen II, Cranial Signal Processors - Gen I | 1.09 |  |  | 1.15 | 1.02 |  | Y | 444-457 |
| 49 | Neuralstimulator | The Black Hand, Chongqing, Sector-12, New Tokyo, Aevum, Ishima, Volhaven, Bachman & Associates, Clarke Incorporated, Four Sigma | 50,000 | $3b |  |  | 1.12 |  |  | 1.02 | 1.1 | Y | 1127-1148 |
| 50 | Bionic Arms | Tetrads | 62,500 | $275m |  |  |  |  |  |  |  |  | 140-147 |
| 51 | ADR-V2 Pheromone Gene | Silhouette, Four Sigma, Bachman & Associates, Clarke Incorporated | 62,500 | $550m |  |  |  | 1.2 |  |  |  |  | 31-47 |
| 52 | Neuroreceptor Management Implant | Tian Di Hui | 75,000 | $550m |  |  |  |  |  |  |  | Y | 1229-1240 |
| 53 | FocusWire | Bachman & Associates, Clarke Incorporated, Four Sigma, KuaiGong International | 75,000 | $900m |  |  | 1.05 |  |  |  |  |  | 737-755 |
| 54 | The Black Hand | The Black Hand | 100,000 | $550m |  | 1.1 |  |  | 1.1 | 1.02 |  | Y | 1835-1849 |
| 55 | Enhanced Myelin Sheathing | Fulcrum Secret Technologies, BitRunners, The Black Hand | 100,000 | $1.375b |  | 1.08 | 1.1 |  |  | 1.03 |  | Y | 679-691 |
| 56 | PCMatrix | Aevum | 100,000 | $2b |  |  |  | 1.0777 |  |  |  | Y | 1405-1421 |
| 57 | DataJack | BitRunners, The Black Hand, NiteSec, Chongqing, New Tokyo | 112,500 | $450m |  |  |  |  | 1.25 |  |  | Y | 496-511 |
| 58 | Golden Tongue Module | Speakers for the Dead | 125,000 | $125m |  |  |  |  |  |  |  |  | 768-778 |
| 59 | Cranial Signal Processors - Gen IV | The Black Hand, BitRunners | 125,000 | $1.1b | Cranial Signal Processors - Gen III, Cranial Signal Processors - Gen II, Cranial Signal Processors - Gen I |  |  |  | 1.2 | 1.02 |  | Y | 458-475 |
| 60 | Bionic Legs | Speakers for the Dead, The Syndicate, KuaiGong International, OmniTek Incorporated, Blade Industries | 150,000 | $375m |  |  |  |  |  |  |  |  | 148-160 |
| 61 | HyperSight Corneal Implant | Blade Industries, KuaiGong International | 150,000 | $2.75b |  |  |  |  | 1.1 | 1.03 |  |  | 977-989 |
| 62 | Embedded Netburner Module Core Implant | BitRunners, The Black Hand, ECorp, MegaCorp, Fulcrum Secret Technologies, NWO, Blade Industries | 175,000 | $2.5b | Embedded Netburner Module | 1.07 | 1.07 |  | 1.1 | 1.03 | 1.03 | Y | 589-610 |
| 63 | Neuronal Densification | Clarke Incorporated | 187,500 | $1.375b |  | 1.15 | 1.1 |  |  | 1.03 |  |  | 1217-1228 |
| 64 | The Illustrated Primer | The Dark Army, The Syndicate | 187,500 | $3.375b |  |  |  |  |  |  |  |  | 1457-1466 |
| 65 | Neural Accelerator | BitRunners | 200,000 | $1.75b |  | 1.1 | 1.15 |  | 1.2 |  |  | Y | 1107-1117 |
| 66 | Social Dynamics Processor | MegaCorp, ECorp, OmniTek Incorporated | 225,000 | $1.2b |  |  |  |  |  |  |  |  | 1495-1504 |
| 67 | Graphene BrachiBlades Upgrade | Speakers for the Dead | 225,000 | $2.5b | BrachiBlades |  |  |  |  |  |  |  | 838-851 |
| 68 | Cranial Signal Processors - Gen V | BitRunners | 250,000 | $2.25b | Cranial Signal Processors - Gen IV, Cranial Signal Processors - Gen III, Cranial Signal Processors - Gen II, Cranial Signal Processors - Gen I | 1.3 |  |  | 1.25 |  |  | Y | 476-494 |
| 69 | Artificial Bio-neural Network Implant | BitRunners, Fulcrum Secret Technologies | 275,000 | $3b |  | 1.12 |  |  | 1.15 | 1.03 |  | Y | 48-61 |
| 70 | Unstable Circadian Modulator | Speakers for the Dead | 362,500 | $5b |  |  |  |  |  |  |  |  | 1963 (CircadianModulator.ts 9-26) |
| 71 | Enhanced Social Interaction Implant | Bachman & Associates, NWO, Clarke Incorporated, OmniTek Incorporated, Four Sigma | 375,000 | $1.375b |  |  |  |  |  |  |  |  | 692-710 |
| 72 | SmartJaw | Bachman & Associates | 375,000 | $2.75b |  |  |  | 1.25 |  |  |  |  | 1533-1545 |
| 73 | PC Direct-Neural Interface | Four Sigma, OmniTek Incorporated, ECorp, Blade Industries | 375,000 | $3.75b |  | 1.08 |  |  |  |  |  |  | 1363-1378 |
| 74 | Synfibril Muscle | KuaiGong International, Fulcrum Secret Technologies, Speakers for the Dead, NWO, The Covenant, Daedalus, Illuminati, Blade Industries | 437,500 | $1.125b |  |  |  |  |  |  |  |  | 1734-1753 |
| 75 | nextSENS Gene Modification | Clarke Incorporated | 437,500 | $1.925b |  | 1.2 |  |  |  |  |  |  | 1320-1334 |
| 76 | Graphene Bionic Arms Upgrade | The Dark Army | 500,000 | $3.75b | Bionic Arms |  |  |  |  |  |  |  | 795-806 |
| 77 | PC Direct-Neural Interface Optimization Submodule | Fulcrum Secret Technologies, ECorp, Blade Industries | 500,000 | $4.5b | PC Direct-Neural Interface | 1.1 |  |  |  |  |  |  | 1393-1404 |
| 78 | Photosynthetic Cells | KuaiGong International | 562,500 | $2.75b |  |  |  |  |  |  |  |  | 1422-1435 |
| 79 | Neotra | Blade Industries | 562,500 | $2.875b |  |  |  |  |  |  |  |  | 1094-1106 |
| 80 | OmniTek InfoLoad | OmniTek Incorporated | 625,000 | $2.875b |  | 1.2 | 1.25 |  |  |  |  |  | 1336-1346 |
| 81 | Embedded Netburner Module Analyze Engine | ECorp, MegaCorp, Fulcrum Secret Technologies, NWO, Daedalus, The Covenant, Illuminati | 625,000 | $6b | Embedded Netburner Module |  |  |  |  | 1.1 |  |  | 571-588 |
| 82 | Synthetic Heart | KuaiGong International, Fulcrum Secret Technologies, Speakers for the Dead, NWO, The Covenant, Daedalus, Illuminati | 750,000 | $2.875b |  |  |  |  |  |  |  |  | 1754-1772 |
| 83 | Graphene Bionic Legs Upgrade | MegaCorp, ECorp, Fulcrum Secret Technologies | 750,000 | $4.5b | Bionic Legs |  |  |  |  |  |  |  | 807-816 |
| 84 | NEMEAN Subdermal Weave | The Syndicate, Fulcrum Secret Technologies, Illuminati, Daedalus, The Covenant | 875,000 | $3.25b |  |  |  |  |  |  |  |  | 1707-1724 |
| 85 | Xanipher | NWO | 875,000 | $4.25b |  | 1.2 | 1.15 |  |  |  |  |  | 2047-2067 |
| 86 | BitRunners Neurolink | BitRunners | 875,000 | $4.375b |  | 1.15 | 1.2 |  |  | 1.05 | 1.1 | Y | 1203-1216 |
| 87 | Embedded Netburner Module Core V2 Upgrade | BitRunners, ECorp, MegaCorp, Fulcrum Secret Technologies, NWO, Blade Industries, OmniTek Incorporated, KuaiGong International | 1,000,000 | $4.5b | Embedded Netburner Module Core Implant, Embedded Netburner Module | 1.08 | 1.15 |  | 1.3 | 1.05 | 1.05 | Y | 611-635 |
| 88 | Embedded Netburner Module Direct Memory Access Upgrade | ECorp, MegaCorp, Fulcrum Secret Technologies, NWO, Daedalus, The Covenant, Illuminati | 1,000,000 | $7b | Embedded Netburner Module |  |  |  | 1.4 |  | 1.2 |  | 659-678 |
| 89 | Graphene Bone Lacings | Fulcrum Secret Technologies, The Covenant | 1,125,000 | $4.25b |  |  |  |  |  |  |  |  | 830-837 |
| 90 | CordiARC Fusion Reactor | MegaCorp | 1,125,000 | $5b |  |  |  |  |  |  |  |  | 400-417 |
| 91 | SPTN-97 Gene Modification | The Covenant | 1,250,000 | $4.875b |  | 1.15 |  |  |  |  |  |  | 1505-1519 |
| 92 | Hydroflame Left Arm | NWO | 1,250,000 | $2.5t |  |  |  |  |  |  |  |  | 939-949 |
| 93 | ECorp HVMind Implant | ECorp | 1,500,000 | $5.5b |  |  |  |  |  |  |  |  | 917-929 |
| 94 | PC Direct-Neural Interface NeuroNet Injector | Fulcrum Secret Technologies | 1,500,000 | $7.5b | PC Direct-Neural Interface | 1.1 |  |  |  | 1.05 |  |  | 1379-1392 |
| 95 | Graphene Bionic Spine Upgrade | Fulcrum Secret Technologies, ECorp | 1,625,000 | $6b | Bionic Spine |  |  |  |  |  |  |  | 817-829 |
| 96 | Embedded Netburner Module Core V3 Upgrade | ECorp, MegaCorp, Fulcrum Secret Technologies, NWO, Daedalus, The Covenant, Illuminati | 1,750,000 | $7.5b | Embedded Netburner Module Core V2 Upgrade, Embedded Netburner Module Core Implant, Embedded Netburner Module | 1.1 | 1.25 |  | 1.4 | 1.05 | 1.1 |  | 636-658 |
| 97 | QLink | Illuminati | 1,875,000 | $25t |  | 1.75 |  |  | 4 | 2 | 2.5 |  | 1468-1480 |

Unstable Circadian Modulator (Speakers for the Dead): multipliers are one of 7 random bonus sets re-rolled hourly (`CircadianModulator.ts#L9-26,L33-117`); set 2 is hacking 1.15 / hacking_exp 2. Excluded from the products below.

## Faction-set totals

| Set | distinct augs | prod hacking | prod hacking_exp | hacking x hacking_exp | prod faction_rep | prod hacking_money | prod hacking_speed |
|---|---|---|---|---|---|---|---|
| 1: hacking 4 + TDH + Netburners + Sector-12 + Aevum | 41 | 3.792 | 3.994 | 15.15 | 1.363 | 4.681 | 1.411 |
| 2: hacking 4 + TDH + Netburners + Chongqing + New Tokyo + Ishima | 42 | 3.792 | 5.592 | 21.21 | 1.265 | 4.681 | 1.411 |
| 3: set 1 + all 10 megacorps | 76 | 11.375 | 10.943 | 124.47 | 2.045 | 10.091 | 1.816 |
| 4: set 1 + 6 crime factions | 66 | 3.982 | 4.394 | 17.50 | 1.881 | 4.681 | 1.411 |
| 4b: set 4 + The Covenant + Illuminati | 72 | 8.815 | 5.492 | 48.42 | 1.881 | 36.696 | 3.260 |
| 1 + Daedalus | 47 | 4.172 | 4.993 | 20.83 | 1.363 | 9.174 | 1.630 |
| everything in the Sector-12/Aevum bloc | 92 | 22.892 | 10.943 | 250.50 | 2.352 | 40.366 | 3.632 |

Counts and products exclude Unstable Circadian Modulator; add 1 to the count for any set containing Speakers for the Dead.

## Costs for the plan's faction set

The 30 cheapest-by-rep augs in set 2, worked out the same way as the set 1 figures below. That method reproduces all of the set 1 figures.

- Sum of base prices: $2.70b. All 30 in one install: about $824t.
- In installs of 5: about $11.3b. In 6s: about $17.8b. In 8s: about $24.6b. In 10s: about $80.6b.
- Highest rep needed from any faction: 50k. Neuregen Gene Modification (37.5k, Chongqing) is among the 30. Neuroreceptor Management Implant (75k, Tian Di Hui) is not, though the plan buys it early.
- The product of faction_rep across the set is 1.265, against 1.363 for set 1.

These are order-of-magnitude figures: the plan buys by value, not by cheapest rep.

## 30 cheapest-by-rep augs in set 1

| # | Aug | Rep | Base price | Cheapest set-1 seller(s) | Prereqs |
|---|---|---|---|---|---|
| 1 | Neurotrainer I | 1,000 | $4m | CyberSec, Aevum |  |
| 2 | Wired Reflexes | 1,250 | $2.5m | Tian Di Hui, Sector-12, Aevum |  |
| 3 | Hacknet Node NIC Architecture Neural-Upload | 1,875 | $4.5m | Netburners |  |
| 4 | Synaptic Enhancement Implant | 2,000 | $7.5m | CyberSec, Aevum |  |
| 5 | Hacknet Node Cache Architecture Neural-Upload | 2,500 | $5.5m | Netburners |  |
| 6 | Speech Enhancement | 2,500 | $12.5m | Tian Di Hui |  |
| 7 | BitWire | 3,750 | $10m | CyberSec, NiteSec |  |
| 8 | Hacknet Node CPU Architecture Neural-Upload | 3,750 | $11m | Netburners |  |
| 9 | ADR-V1 Pheromone Gene | 3,750 | $17.5m | Tian Di Hui |  |
| 10 | Neural Wit Amplifier | 5,000 | $10m | BitRunners |  |
| 11 | Augmented Targeting I | 5,000 | $15m | Sector-12 |  |
| 12 | Nuoptimal Nootropic Injector Implant | 5,000 | $20m | Tian Di Hui |  |
| 13 | Social Negotiation Assistant (S.N.A) | 6,250 | $30m | Tian Di Hui |  |
| 14 | Artificial Synaptic Potentiation | 6,250 | $80m | The Black Hand, NiteSec |  |
| 15 | Hacknet Node Kernel Direct-Neural Interface | 7,500 | $40m | Netburners |  |
| 16 | Speech Processor Implant | 7,500 | $50m | Tian Di Hui, Sector-12, Aevum |  |
| 17 | Augmented Targeting II | 8,750 | $42.5m | Sector-12 | Augmented Targeting I |
| 18 | Neurotrainer II | 10,000 | $45m | BitRunners, NiteSec |  |
| 19 | Cranial Signal Processors - Gen I | 10,000 | $70m | CyberSec, NiteSec |  |
| 20 | Hacknet Node Core Direct-Neural Interface | 12,500 | $60m | Netburners |  |
| 21 | CashRoot Starter Kit | 12,500 | $125m | Sector-12 |  |
| 22 | Embedded Netburner Module | 15,000 | $250m | BitRunners, The Black Hand, NiteSec |  |
| 23 | Magnetism Amplifier | 15,000 | $250m | The Black Hand |  |
| 24 | Cranial Signal Processors - Gen II | 18,750 | $125m | CyberSec, NiteSec | Cranial Signal Processors - Gen I |
| 25 | Neural-Retention Enhancement | 20,000 | $250m | NiteSec |  |
| 26 | Nanofiber Weave | 37,500 | $125m | Tian Di Hui |  |
| 27 | CRTX42-AA Gene Modification | 45,000 | $225m | NiteSec |  |
| 28 | Cranial Signal Processors - Gen III | 50,000 | $550m | NiteSec, The Black Hand, BitRunners | Cranial Signal Processors - Gen II, Cranial Signal Processors - Gen I |
| 29 | Neuralstimulator | 50,000 | $3b | The Black Hand, Sector-12, Aevum |  |
| 30 | Neuroreceptor Management Implant | 75,000 | $550m | Tian Di Hui |  |

Sum of base prices: $5.9875b. Buying all 30 in one install (most expensive first): $991.071t (1.9^29 = 1.21e+08).
- In installs of 5 (cheapest group first, each group bought most-expensive-first): total $16.941b over 6 installs.
- In installs of 6 (cheapest group first, each group bought most-expensive-first): total $24.3867b over 5 installs.
- In installs of 8 (cheapest group first, each group bought most-expensive-first): total $32.7378b over 4 installs.
- In installs of 10 (cheapest group first, each group bought most-expensive-first): total $119.146b over 3 installs.

## City-faction-only augs (outside the Sector-12/Aevum bloc)

Enemies: Sector-12 and Aevum each list Chongqing, New Tokyo, Ishima, Volhaven as enemies (`FactionInfo.tsx#L498,L540`); Chongqing/New Tokyo/Ishima list Sector-12, Aevum, Volhaven (`#L508,L520,L530`); Volhaven is the enemy of all five (`#L552`).

| Aug | Only seller | Rep | Hacking-relevant mults |
|---|---|---|---|
| Neuregen Gene Modification | Chongqing | 37.5k | hacking_exp 1.4 (`Augmentations.ts#L1149-1158`) |
| NutriGen Implant | New Tokyo | 6.25k | none |
| INFRARET Enhancement | Ishima | 7.5k | none |
| DermaForce Particle Barrier | Volhaven | 15k | none |

Every other aug those four cities sell is also sold by a Sector-12/Aevum-bloc faction (DataJack via BitRunners/BH/NiteSec; Neuralstimulator via BH/S12/Aevum; Nuoptimal via TDH; Combat Rib I/II via crime factions/megacorps).

## NeuroFlux Governor and The Red Pill

- NFG base rep 500, base price $750k (`Augmentations.ts#L1159-1161`). Each level is x(1.01 + 262/1e6/100) on most mults (`#L9,L1170-1195`; Donations=262 `Constants.ts#L107`).
- Cost (`AugmentationHelpers.ts#L133-138`): rep = 500 x 1.14^L; price = 750k x 1.14^L x 1.9^Q. L = owned level + queued NFG count (`Augmentation.ts#L238-246`). Q = number of queued non-SoA augs including queued NFGs (`AugmentationHelpers.ts#L32-37`). So each extra NFG multiplies the next NFG price by 1.14 x 1.9 = 2.166 and its rep by 1.14.
- Installed NFG is one `Player.augmentations` entry with a level (`AugmentationHelpers.ts#L55-59`). Daedalus checks `p.augmentations.length` (`FactionJoinCondition.ts#L116-131`), so NFG counts once.
- The Red Pill: rep 2.5m, moneyCost 0 (`Augmentations.ts#L1946-1953`). The default cost branch multiplies 0 by the queue multiplier, so the price is always $0 (`AugmentationHelpers.ts#L156-158`), and the money check is skipped when the cost is 0 (`FactionHelpers.tsx#L98`). It still counts as a queued aug for the 1.9^Q multiplier on anything bought after it, so buy it last.

## Casino

- The casino is in Aevum (`LocationsMetadata.ts#L126-130`). Max bets: Blackjack $100m, initial $1m (`Blackjack.tsx#L15-16`); Roulette $10m (`Roulette.tsx#L12`); Slots $1m (`SlotMachine.tsx#L138`); Coin flip $10k (`CoinFlip.tsx#L13`). Min bet: any positive amount, rounded (`BetInput.tsx#L55-66`).
- Blackjack rules: 5 decks (`Blackjack.tsx#L18`). The deck is reshuffled only when empty (`CardDeck/Deck.ts#L23-29`) and is created fresh on each component mount (`Blackjack.tsx#L46`). The shuffle uses lodash, which uses Math.random (`Deck.ts#L13`). No double, split or surrender. Naturals are checked on the deal for both sides (`#L80-89`). The dealer hits on 16 or less and stands on every 17, soft included (`#L162-169`, `#L114-125`). Payouts: a win returns 2x the stake, a blackjack 2.5x, a push 1x (`#L204-220`). The bet is deducted at the start via win(-bet) (`#L66`). Start, Hit and Stay check `event.isTrusted` (`#L143,L160,L241`). The dealer's hole card is hidden (`#L329`).
- A simulation of these rules with basic hit/stand play (not game code): win 43.4% (blackjack 4.5%), push 8.7%, loss 48.0%, EV -2.4% per hand (inferred).
- Cap: `gainLimit = 10e9`. `reachedLimit()` is `Player.getCasinoWinnings() > 10e9`; it shows "Alright cheater get out of here..." and blocks new hands and payouts (`Casino/Game.ts#L4-19`). Winnings are `moneySourceA.casino` (`PlayerObjectGeneralMethods.ts#L599-601`), a net figure because bets are recorded as negative gains (`Game.ts#L6-11`, `PlayerObjectGeneralMethods.ts#L216-224`). `moneySourceA.reset()` runs in `prestigeAugmentation` (`PlayerObjectGeneralMethods.ts#L128`), so the counter resets on every aug install.
- Save: these call `saveObject.saveGame()`:
  - the save icon in the overview panel (`CharacterOverview.tsx#L181`, wired at `GameRoot.tsx#L538-540`)
  - the Save button on the Options page (`GameRoot.tsx#L444-446`)
  - autosave every `AutosaveInterval` seconds, default 60 (`engine.tsx#L225-235`, `Settings.ts#L17`)
  - script-editor save when `SaveGameOnFileSave` is on, which is the default (`ScriptEditor/ui/utils.ts#L97-99`, `Settings.ts#L53`)
  - kill-all-scripts, which saves and then reloads (`GameRoot.tsx#L220-232`)
  - Electron's `triggerSave` (`Electron.tsx#L80`)

  Ctrl+S is bound only to `ScriptEditor-Save` (`KeyBindingUtils.ts#L226-233`). A full grep of src found no global game-save hotkey.
- Reload: on load, each server's saved running scripts restart, and home also gets `Settings.AutoexecScript` prepended (`NetscriptWorker.ts#L218-264`). The save holds every script running at save time except `temporary` ones (autoexec is marked temporary), unless `ExcludeRunningScriptsFromSave` is on (`BaseServer.ts#L295-315`, `NetscriptWorker.ts#L209-210`). `?noScripts` in the URL skips all of them (`NetscriptWorker.ts#L236-249`). The web build sets `window.onbeforeunload` to return a "leave page" prompt, except in dev or under file:// (Electron) (`index.tsx#L53-58`). Expect `location.reload()` to trigger that browser prompt (inferred).
- Hand estimate (inferred): save before each hand and reload on a loss.
  - Phase 1, all-in doubling from $300k to at least $100m: 9 wins (300k x 2^9 = $154m), about 9/0.434 = 21 hands.
  - Phase 2, at $100m: the average win is +$105m (10.4% of wins are blackjacks at +$150m). About 95 wins push net casino winnings past $10b, which is about 95/0.434 = 220 hands.
  - Total: about 240 hands and 125 reloads. Final cash about $10.0-10.15b.

## Megacorp factions

- Invite: employed by the company and company rep at least 400k (`FactionInfo.tsx#L191` etc., `Constants.ts#L25`). Fulcrum Secret Technologies also needs a backdoor on its server (`FactionInfo.tsx#L378-379`). The required rep is x0.75 (300k) if the company's server is backdoored (`Company/utils.ts#L15-19`, `Constants.ts#L110`, `ServerHelpers.ts#L278-285`). Megacorp invites are kept across installs (`keepOnInstall`, `FactionInfo.tsx#L196`, `Prestige.ts#L61-67,L121-124`).
- Job stat requirements are the base plus `jobStatReqOffset` (`CompanyPosition.ts#L144-154`): 249 for ECorp, MegaCorp and NWO, 224 for the rest (`CompaniesMetadata.ts#L27`...). The software intern job needs hacking 250 or 225.
- Rep per cycle (5 cycles/s): `jobPerformance x company_rep x (1 + companyFavor/100) x CompanyWorkRepGain(1)` (`Work/Formulas.ts#L131,L154-156`). Multiply by the focus factor: 0.8 when unfocused unless you have Neuroreceptor Management, and always 1 for part-time jobs (`CompanyWork.tsx#L35-38`, `PlayerObjectGeneralMethods.ts#L622-628`, `Constants.ts#L87`). `jobPerformance = repMultiplier x sum(eff_i x skill_i / 975) / 100 + int/975` (`CompanyPosition.ts#L156-172`). Software track (hacking/charisma effectiveness, repMultiplier, rep needed): intern 85/15, 0.9; junior 85/15, 1.1 at 8k; senior 80/20, 1.3 at 40k; lead 75/25, 1.5 at 200k (`CompanyPositionsMetadata.ts#L7-56`).
- Worked examples (focused, mults 1):
  - intern, hacking 250, charisma 50: 1.0 rep/s, so 400k takes 110 h
  - junior, hacking 300: 1.5 rep/s
  - senior, hacking 500, charisma 300: 3.1 rep/s
  - lead, hacking 650, charisma 400: 4.5 rep/s

  Climbing from intern to lead at hacking around 500 puts 400k at roughly 30-40 h (inferred).

## Favor

- At install: newFavor = repToFavor(favorToRep(oldFavor) + rep), where favorToRep(f) = 25000 x (1.02^f - 1) (`Faction/formulas/favor.ts#L12-24`, `Faction.ts#L77-85`, `Prestige.ts#L104-106`). 150 favor needs 462.5k total rep. 2.5m rep in one run gives 233 favor.
- Faction work rep is multiplied by (1 + favor/100) x FactionWorkRepGain (`PersonObjects/formulas/reputation.ts#L8-14`), for hacking, security and field work (`#L16-52`). 150 favor gives x2.5, so a second Daedalus membership earns x2.5.
- Hacking work per cycle: (hacking + int/3)/975 x faction_rep x intBonus x favorMult x shareBonus (`reputation.ts#L16-24`). Example: hacking 200 gives about 1.0 rep/s focused.
- Donation: rep = $ / 1e6 x faction_rep x FactionWorkRepGain (`donation.ts#L8-10`). It unlocks at favor of at least floor(150 x FavorToDonateToFaction) = 150 (`donation.ts#L16-18`, `FactionRoot.tsx#L103-104`).

## Crime

- Success = min(1, (sum w_i x skill_i + 0.025 x int) / 975 / difficulty x crime_success x CrimeSuccessRate x intBonus) (`Crime/Crime.ts#L120-136`). A failure pays no money and gives exp and karma /4 (`Work/CrimeWork.ts#L69-77`). Gains and karma loss are multiplied by the focus factor (`#L64-67,L84`).

| Crime | Time | Money | Difficulty | Karma |
|---|---|---|---|---|
| Shoplift | 2s | $15k | 1/20 | 0.1 |
| Rob Store | 60s | $400k | 1/5 | 0.5 |
| Mug | 4s | $36k | 1/5 | 0.25 |
| Larceny | 90s | $800k | 1/3 | 1.5 |
| Deal Drugs | 10s | $120k | 1 | 0.5 |
| Bond Forgery | 300s | $4.5m | 1/2 | 0.1 |
| Traffick Arms | 40s | $600k | 2 | 1 |
| Homicide | 3s | $45k | 1 | 3 |
| Grand Theft Auto | 80s | $1.6m | 8 | 5 |
| Kidnap | 120s | $3.6m | 5 | 6 |
| Assassination | 300s | $12m | 8 | 10 |
| Heist | 600s | $120m | 18 | 15 |

Source: `Crimes.ts#L6-260`.
- Expected $/s, focused (from a script, not game code):
  - all stats 1: Shoplift is best at 4.1% success, $308/s
  - hacking 50, combat 30: Shoplift at 100%, $7.5k/s
  - hacking 100, combat 75, charisma 50: Mug at 100%, $9k/s
  - combat 200: Homicide at 100%, $15k/s and 1 karma/s
