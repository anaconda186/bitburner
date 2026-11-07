# BN1 UI technique lab

The throwaway harness behind [Do the BN1 UI techniques work in a live v3.0.1 build?](https://github.com/anaconda186/bitburner/issues/20). The findings are on that ticket; this is how they were produced. It isn't part of the build and isn't release-quality: use it as a starting point for the Playwright smoke test, not as a dependency.

## Setup

Needs Node 24 and a Chromium-based browser.

1. `npm ci`
2. Get the v3.0.1 production build. Download `bitburner-win32-x64.zip` from the [v3.0.1 release](https://github.com/bitburner-official/bitburner-src/releases/tag/v3.0.1) and extract its `resources/app/` folder to `lab-harness/game/`, or point `LAB_GAME` at it. The folder must hold `index.html` and `dist/`.
3. Choose a browser:
   - `LAB_EXE=<path to chrome.exe>`: any Chrome or Chromium build. [Chrome for Testing](https://googlechromelabs.github.io/chrome-for-testing/) is the closest to what a run uses.
   - `LAB_CHANNEL=msedge`: an installed browser channel.
   - Neither: Playwright's `chromium` channel, after `npx playwright install chromium`. That installer stalled twice on the Windows machine this was built on. Downloading the zip and extracting it, then using `LAB_EXE`, took seconds.

## What to run

Everything runs in real time, headless, in a fresh browser context. Screenshots and raw logs go to `out/`, which is ignored.

| Command | What it checks | About |
|---|---|---|
| `node run_guards.mjs` | Faked clicks on blackjack and Join, with plain clicks as a control; the terminal recipe; clicks with dialogs open; an invitation across a reload | 1 min |
| `node run_unload.mjs` | The leave-page prompt, cleared and not, with and without a keypress on that page load | 20 s |
| `node run_restart.mjs` | Which scripts restart after a reload: normal, `--temporary`, autoexec | 30 s |
| `node run_reset.mjs` | The `atExit` timer across a UI-driven install and a BitNode entry | 1 min |
| `node run_casino.mjs <label> [startMoney]` | A full casino run to the $10b cap, with a timing summary | 3–4 min |

`lab/` holds the in-game scripts. The runners write them into edited saves, so they never go through `wget`.

## Traps

- **`page.evaluate` carries a user gesture.** Any evaluate or auto-waiting locator can count as a keypress on the page, so `run_unload.mjs` calls neither after its first real keypress. Keep it that way, or the prompt test stops meaning anything.
- **Playwright's real clicks hit modals.** The Offline alert raised on each load blocks them, though scripted `.click()` goes through it. Click the save icon with `page.evaluate` once a save is loaded.
- **Sidebar text includes the badge.** Factions can read `1Factions`, so match on the end of the text.
- **Hacking level comes from exp.** It's recomputed on load: level = 32 × ln(exp + 534.6) − 200. Set `exp.hacking`; level 3000 needs about 1e44.
- **A script dying also fires `atExit`.** After a reset test, check the install or BitNode entry really happened (owned augs, current node) before believing that the timer worked. An early version of this test passed on a crash.

## Results

`results/` holds the summary of four of the five casino runs; each is named after its browser. Times are in ms unless the key says otherwise. The fifth run, on Edge 156, took 210 s to reach the cap, with 260 hands and 136 reloads. Those figures were recovered from its log, because a bug in the stop check kept it running past the cap until it was stopped by hand, so it has no summary.
