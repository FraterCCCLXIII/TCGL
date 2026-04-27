# @tcgl/core — architecture invariants

## Layers

- **Headless** — no React, no DOM, no WebGL. Importable in Node (server) and the browser.
- **Authoritative** — the same `GameState` updates only through `dispatch(state, action)` (or the server’s copy of that fold).

## Actions vs events

- **`GameAction`**: a player (or the UI) *requests* a change. May be invalid.
- **`GameEvent`**: a *fact* that already happened, emitted by the engine after a successful transition.
- The UI **must not** assume an action succeeded until it processes the returned `EngineResult` (or a server `patch` with the same events).

## Replays and determinism

- **Canonical input** for a match is the ordered list of `GameAction`s the authority accepted, not the derived `EventLog` (though you may also persist events for analytics).
- `replayFromActions(initial, actions)` re-folds the reducer. **Same (version, initial, actions) ⇒ same final state.**
- `projectStateFromEventLog` is reserved for a future true event-sourcing projection. Until then, use `replayFromAction`s.

## Versioning

- `schemaVersion` on `GameState` and each `GameAction` must be bumped on incompatible wire format changes. Reject or migrate older clients explicitly.

## Networking (with `@tcgl/server`)

- Only the **server** runs `dispatch` on the shared state.
- Clients send `ClientToServer` messages with `type: "dispatch"`. They never apply a peer’s state snapshot as truth without matching `seq` and engine validation.
- `ServerToClient.patch` includes `state`, `events`, and monotonic `seq` for ordering and idempotency.
