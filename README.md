# bitburner

My scripts for [Bitburner](https://github.com/bitburner-official/bitburner-src).

## Development

Needs Node 24.

```
npm ci
npm run fetch-game   # pinned v3.0.1 game build and type definitions into .game/
npm run typecheck
npm test
npm run build        # src/ -> build/
```

A push to `main` that passes CI publishes `build/` to the `release` branch. Start a run in the game with:

```
wget https://raw.githubusercontent.com/anaconda186/bitburner/release/boot.js boot.js; run boot.js
```

On a fresh save, submit it twice. Layout, conventions and the release format are described in [docs/agents/project-layout.md](docs/agents/project-layout.md).
