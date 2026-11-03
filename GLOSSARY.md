# Bitburner speedrun

Scripts that take Bitburner from a fresh save to the finish line from one command, as fast as possible in real time, under a fixed set of rules.

## The run

**Run**:
One attempt, timed in real time, from typing the start command on a fresh save until the finish line is reached.
_Avoid_: Playthrough, session

**Fresh save**:
The state immediately after "Start new game": no Source-Files, 8 GB home RAM, starting money.
_Avoid_: New save, clean save

**Finish line**:
Owning every BitNode's Source-File at level 3 or higher, the condition of the in-game "More BitNodes, please!" achievement.
_Avoid_: Beating the game, 100%, max SF

**Milestone**:
A named intermediate state on the way to the finish line, such as the first destruction of BitNode 1 or reaching SF4.3.
_Avoid_: Checkpoint, stage, phase

**Start command**:
The single terminal command the human types to begin a run, after exiting the tutorial.
_Avoid_: Launcher, entry point

**Target version**:
The Bitburner build the run is made for: the web release v3.0.1.

## The route

**BitNode order**:
The fixed sequence of the 45 BitNode destructions that every run follows from the fresh save to the finish line.
_Avoid_: Route, path, BN progression

**Finish**:
The way a single BitNode is destroyed: the **hacking finish** (The Red Pill, then hacking the World Daemon) or the **Black Ops finish** (completing every Bladeburner Black Operation).
_Avoid_: Win condition, ending, kill

**Enabler**:
A Source-File level whose effect speeds up many later destructions, beyond adding small multipliers. SF4.3 is the clearest example.
_Avoid_: Unlock, key SF

## Rules

**Exploit**:
Anything the game itself records as an exploit (e.g. editing the save, time compression, prototype tampering, dodging the DOM RAM cost). A run may not use any.
_Avoid_: Cheat, hack

**UI automation**:
A script driving the game's interface through `document` or `window`, paying the 25 GB RAM cost per reference. Allowed in a run.
_Avoid_: DOM hacking, clicker

**BitNode options**:
The game's own settings chosen when entering a BitNode, such as lowering an active Source-File level. Allowed in a run: they are not an exploit.

**Human action**:
Anything the person does during a run. A run allows only: start a new game, exit the tutorial, type the start command, and retype the start command after a page reload.

## Development

**Milestone save**:
A save file taken when a milestone is reached, used only in development as a starting point; never part of a run.
_Avoid_: Checkpoint, snapshot

**Split**:
The real time elapsed from the start of a run until a milestone is reached.
_Avoid_: Lap, segment time
