import type { GameState } from "@tcgl/core";
import { demoZones } from "./seedDemoGame";

export const DRAG_CARD_ID = "c-bf-2" as const;

export function getZoneIds(state: GameState, zoneId: string): string[] {
  return [...(state.zoneContents[zoneId] ?? [])];
}

export function getHandIds(state: GameState): string[] {
  return getZoneIds(state, demoZones.hand);
}

export function getBattlefieldIds(state: GameState): string[] {
  return getZoneIds(state, demoZones.bf);
}

export function getGraveyardIds(state: GameState): string[] {
  return getZoneIds(state, demoZones.gy);
}

/**
 * Pile in zone + spell / ability objects on the abstract `state.stack` (LIFO: zone bottom → top, then
 * stack objects' source cards on top).
 */
export function getStack3dIds(state: GameState): string[] {
  const pile = getZoneIds(state, demoZones.stack);
  const spell = state.stack.map((s) => s.sourceCardId);
  return [...pile, ...spell];
}

/** Local XZ offset on the battlefield (group space). The drag sample uses `bf2Pos` in full 3D. */
export function getBattlefieldLocalPosition(
  id: string,
  bfIds: string[],
  bf2Pos: [number, number, number]
): [number, number, number] {
  if (id === DRAG_CARD_ID) {
    return bf2Pos;
  }
  const nonDrag = bfIds.filter((c) => c !== DRAG_CARD_ID);
  const j = nonDrag.indexOf(id);
  if (j < 0) {
    return [0, 0, 0];
  }
  const n = nonDrag.length;
  if (n === 1) {
    return [-0.55, 0, 0];
  }
  return [(j - (n - 1) / 2) * 1.1, 0, 0];
}

export function definitionIdToFaceN(definitionId: string): number {
  const m = /face-(\d+)/.exec(definitionId);
  if (m) {
    return Math.max(1, parseInt(m[1]!, 10) || 1);
  }
  return 1;
}

export function allOnTableCardIds(state: GameState): Set<string> {
  const s = new Set<string>();
  for (const k of Object.keys(state.zoneContents)) {
    for (const id of state.zoneContents[k] ?? []) {
      s.add(id);
    }
  }
  for (const o of state.stack) {
    s.add(o.sourceCardId);
  }
  return s;
}
