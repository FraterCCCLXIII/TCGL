# TCGL monorepo

## Packages

| Package | Role |
|--------|------|
| `@tcgl/core` | Headless rules: `GameAction` → `dispatch` → `GameEvent[]` + `GameState`. |
| `tcgl` | React Three Fiber **presentation** (cards, playmat, zones) — not game rules. |
| `@tcgl/server` | WebSocket gateway; **server-authoritative** `dispatch` (optional for local dev). |
| `@tcgl/game-mtg-lite` | Stub extension points (triggers, replacements, layers) for a future MTG-like module. |
| `demo` | Vite app: 3D zones render cards from `GameState.zoneContents`; the drawer dispatches `GameAction`s. |

## Scripts

```bash
npm install
npm run build
npm run dev
npm test
```

## Adding a new `GameAction`

1. Extend the `GameAction` union in [`packages/core/src/types/actions.ts`](packages/core/src/types/actions.ts).
2. Add a factory in [`packages/core/src/factories.ts`](packages/core/src/factories.ts).
3. Handle the branch in [`packages/core/src/engine/dispatch.ts`](packages/core/src/engine/dispatch.ts) and emit `GameEvent`s.
4. Bump `SCHEMA_VERSION` if the wire shape is incompatible with old clients.
5. In the UI, call `dispatch` and **only** update presentation from returned `events` (or server `patch`).

See [`packages/core/ARCHITECTURE.md`](packages/core/ARCHITECTURE.md) for invariants.
