import {
  createEmptyState,
  type GameState,
  type CardInstance,
} from "@tcgl/core";

const Z = {
  hand: "p1:hand",
  bf: "shared:battlefield",
  gy: "p1:graveyard",
  stack: "shared:stack",
} as const;

function card(
  id: string,
  definitionId: string,
  controllerId: "p1" | "p2"
): CardInstance {
  return { id, definitionId, controllerId, tapped: false };
}

/**
 * Authoritative game snapshot aligned with demo card `id`s. The 3D table reads zone membership from
 * `GameState.zoneContents` (and stack spell objects) via `zoneView` helpers.
 */
export function seedDemoGame(): GameState {
  const s = createEmptyState("demo", ["p1", "p2"], "p1");
  s.zoneContents[Z.hand] = ["c-hand-1", "c-hand-2", "c-hand-3", "c-hand-4"];
  s.zoneContents[Z.bf] = ["c-bf-1", "c-bf-2"];
  s.zoneContents[Z.gy] = ["c-gy-1", "c-gy-2", "c-gy-3"];
  s.zoneContents[Z.stack] = ["c-stack-1", "c-stack-2"];

  const p1: CardInstance[] = [
    card("c-hand-1", "face-1", "p1"),
    card("c-hand-2", "face-2", "p1"),
    card("c-hand-3", "face-1", "p1"),
    card("c-hand-4", "face-1", "p1"),
    card("c-bf-1", "face-2", "p1"),
    card("c-bf-2", "face-2", "p1"),
    card("c-gy-1", "face-1", "p1"),
    card("c-gy-2", "face-2", "p1"),
    card("c-gy-3", "face-1", "p1"),
    card("c-stack-1", "face-1", "p1"),
    card("c-stack-2", "face-2", "p1"),
  ];
  for (const c of p1) {
    s.cards[c.id] = c;
  }
  return s;
}

export const demoZones = Z;
