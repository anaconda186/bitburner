# Money engine model

The scripts behind the numbers in [How does the hacking money engine grow from 8 GB to a full fleet?](https://github.com/anaconda186/bitburner/issues/22). They were written to compare design options, not to be part of a run.

Run each script from this folder with Python 3 and no dependencies:

| Script | What it prints |
|---|---|
| `engine.py` | The shared formulas and server table. Run directly: income by stage and fleet size |
| `stages.py` | Income with lots of RAM at a low hacking level, exp per GB by method, climb times, share bonus, first-weaken times and cloud prices |
| `spacing_and_share.py` | Income at each batch spacing, and rep at each share fraction |
| `exp_start.py` | Money over 3 hours with and without an exp start, and batch exp against the exp farm |

## What to trust

- **Formulas:** copied by hand from the game's source at tag v3.0.1 (commit `3162fd2`), and not yet checked against golden values from a lab save.
- **Server stats:** midpoints of the ranges in `servers.ts`. A real save rolls its own values, so target order can differ.
- **Player multipliers and fleet sizes:** assumptions, set per scenario in each script. M is the total hacking multiplier.
- **Left out:** batches drifting out of sync, main-thread load, and hack chance as anything but an average. Only `exp_start.py` charges for switching target.

Nothing here has been run against the game, so treat every output as an estimate until splits replace it.
