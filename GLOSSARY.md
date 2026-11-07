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
The one terminal line the human types to begin a run, after exiting the tutorial. On a fresh save it is submitted twice, because the first submission only downloads; that still counts as typing it once. After a page reload, a single submission is enough.
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

**Install**:
Applying the augmentations queued so far, which sends the player back to the start of the current BitNode.
_Avoid_: Ascend, prestige

**Reset**:
Any event that wipes the run's scripts: an install or entering a BitNode.
_Avoid_: Using it to mean an install

## The system

**Driver**:
The script that does a run's UI automation.
_Avoid_: Clicker, UI script

**Conductor**:
The small script on home that keeps a run going by handing work to short-lived helper scripts.
_Avoid_: Orchestrator, daemon

## Rules

**Category**:
A named set of rules a run is timed under. Splits are compared only within one category. There are two:
- **Open** (the default): faked trusted clicks and script reloads are allowed.
- **Strict**: neither is allowed.
_Avoid_: Mode, variant, ruleset

**Faked trusted click**:
A script's click that gets past a guard the game puts on scripted input, which accepts only real clicks. Allowed only in Open.
_Avoid_: Trusted click, isTrusted bypass

**Script reload**:
The run reloading the page by itself, for example to save-scum the casino. Allowed only in Open. It is not the page reload of the human-action list, which happens to a run rather than being caused by it.
_Avoid_: Forced reload, refresh

**Exploit**:
Anything in a category the game names as an exploit, however it is done and whether or not the game detects it (e.g. editing the save, time compression, prototype tampering, dodging the DOM RAM cost). A run may not use any, whatever its category.
_Avoid_: Cheat, hack

**UI automation**:
A script driving the game's interface through `document` or `window`. The script's own source must name each of the two it uses, so it pays the game's 25 GB RAM cost for each. When that code runs, even after the script has ended, doesn't matter. Allowed in a run.
_Avoid_: DOM hacking, clicker

**BitNode options**:
The game's own settings chosen when entering a BitNode, such as lowering an active Source-File level. Allowed in a run: they are not an exploit.

**Human action**:
Anything the person does during a run. A run allows only: start a new game, exit the tutorial, type the start command, and retype the start command after a page reload.

## Development

**Milestone save**:
A save file taken when a milestone is reached, used only in development as a starting point; never part of a run.
_Avoid_: Checkpoint, snapshot

**Lab save**:
A save made only to measure the game's behaviour, which may be edited and may carry the game's exploit flag. It is never a milestone save, never a starting point for a scenario test, and never part of a run.
_Avoid_: Test save, debug save

**Release**:
The latest build that passed every check required before runs may use it. The start command always downloads the current release.
_Avoid_: Deploy, version

**Smoke test**:
A short automated check, from a fresh save, that the start command gets a run going and that retyping it after a page reload resumes the run. A build becomes a release only if it passes.
_Avoid_: Sanity check, end-to-end test

**Scenario test**:
An automated test that loads a milestone save, types the start command once, and checks that the run reaches the next milestone.
_Avoid_: Integration test, end-to-end test

**Split**:
The real time elapsed from the start of a run until a milestone is reached.
_Avoid_: Lap, segment time
