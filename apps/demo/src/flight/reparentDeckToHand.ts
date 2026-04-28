import type { Group } from "three";

/**
 * Deck → HUD hand flight using the **same** {@link THREE.Group} as the deck card (no proxy swap).
 *
 * **Why this module exists:** `CardMotion` duplicates a card under `PlayerArea`, then zone state updates
 * mount the “real” card in the HUD — two instances. Games that want continuity attach the deck card’s
 * root group into a transient flight shell, tween toward the fan slot, then either attach into the fan
 * wrapper or hand off via `<primitive object={group}>` so one mesh survives the whole trip.
 *
 * **R3F constraint:** If `visibleDeckIds` drops the flying id **before** reparent runs, React may unmount
 * the deck `Card` fiber and dispose the scene graph — grab `/ attach` must happen **before** that state
 * commit (see ordering notes when wiring `beginDeckDraw`).
 *
 * **Three.js:** {@link THREE.Object3D.attach} removes the object from its previous parent and inserts it
 * under a new parent while preserving world transform — ideal after grabbing the ref.
 *
 * Planned wiring (incremental):
 * 1. Dedicated flight `<group ref={flightShellRef} />` under the scene/camera rig (not duplicated Card).
 * 2. `flightShell.attach(cardRoot)` using the ref from {@link apps/demo/src/App.tsx} `cardGroupById`.
 * 3. Tween position/rotation/scale each frame — reuse `interpolateCardPose` from `tcgl` toward HUD pose
 *    from {@link ../engine/poseSample.mapHandPaPoseToPlayerAreaMotionSpace} / viewport slot poses.
 * 4. On rest: `moveCardAction`, then attach into fan slot group **or** swap to declarative HUD render with
 *    `<primitive object={cardRoot} />` keyed by card id so React doesn’t recreate geometry.
 */

/** Lifecycle label for orchestrating grab → tween → land (optional future state machine). */
export type ReparentDeckFlightPhase = "idle" | "grabbed" | "flying" | "landed";

export type ReparentDeckFlightDeps = {
  /** Deck root group — must still exist (deck zone still mounting this Card). */
  cardRoot: Group;
  /** Temporary parent for world-space tween (camera-adjacent or world shell). */
  flightShell: Group;
  /** Fan slot wrapper group under HUD — optional until landing timing resolved */
  hudSlotParent?: Group | null;
};

/**
 * Attach deck root → flight shell (preserve world transform), drive tween, then land in HUD slot.
 * P1 deck→hand uses {@link DeckFlightPilot} + {@link ../App.tsx} `deckFlightShellRef.attach` instead.
 */
export function attachDeckCardForFlightShell(_deps: ReparentDeckFlightDeps): void {
  /* Reserved for optional imperative helpers — animation runs in DeckFlightPilot */
}
