import {
  createEmptyState,
  type GameState,
  type CardInstance,
} from "@tcgl/core";

const Z = {
  hand: "p1:hand",
  /** Staging row between hand and shared battlefield — spells / creatures played from hand (demo). */
  frontPlay: "p1:front-play",
  bf: "shared:battlefield",
  gy: "p1:graveyard",
  /** Face-down pile drawn into hand by tap (demo). */
  deck: "p1:deck",
  stack: "shared:stack",
  /** Far-side opponent (mirror zones). */
  p2Hand: "p2:hand",
  p2FrontPlay: "p2:front-play",
  p2Gy: "p2:graveyard",
  p2Deck: "p2:deck",
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
  s.zoneContents[Z.frontPlay] = [];
  s.zoneContents[Z.bf] = [];
  s.zoneContents[Z.gy] = ["c-gy-1", "c-gy-2", "c-gy-3"];
  s.zoneContents[Z.stack] = [];
  s.zoneContents[Z.deck] = [
    "c-deck-0",
    "c-deck-1",
    "c-deck-2",
    "c-deck-3",
    "c-deck-4",
  ];
  s.zoneContents[Z.p2Hand] = [
    "c-p2-hand-1",
    "c-p2-hand-2",
    "c-p2-hand-3",
    "c-p2-hand-4",
  ];
  s.zoneContents[Z.p2FrontPlay] = [];
  s.zoneContents[Z.p2Gy] = ["c-p2-gy-1", "c-p2-gy-2", "c-p2-gy-3"];
  s.zoneContents[Z.p2Deck] = [
    "c-p2-deck-0",
    "c-p2-deck-1",
    "c-p2-deck-2",
    "c-p2-deck-3",
    "c-p2-deck-4",
  ];

  const p1: CardInstance[] = [
    card("c-hand-1", "face-1", "p1"),
    card("c-hand-2", "face-2", "p1"),
    card("c-hand-3", "face-1", "p1"),
    card("c-hand-4", "face-1", "p1"),
    card("c-gy-1", "face-1", "p1"),
    card("c-gy-2", "face-2", "p1"),
    card("c-gy-3", "face-1", "p1"),
    card("c-deck-0", "face-1", "p1"),
    card("c-deck-1", "face-2", "p1"),
    card("c-deck-2", "face-1", "p1"),
    card("c-deck-3", "face-2", "p1"),
    card("c-deck-4", "face-1", "p1"),
  ];
  const p2: CardInstance[] = [
    card("c-p2-hand-1", "face-2", "p2"),
    card("c-p2-hand-2", "face-1", "p2"),
    card("c-p2-hand-3", "face-2", "p2"),
    card("c-p2-hand-4", "face-1", "p2"),
    card("c-p2-gy-1", "face-1", "p2"),
    card("c-p2-gy-2", "face-2", "p2"),
    card("c-p2-gy-3", "face-1", "p2"),
    card("c-p2-deck-0", "face-2", "p2"),
    card("c-p2-deck-1", "face-1", "p2"),
    card("c-p2-deck-2", "face-2", "p2"),
    card("c-p2-deck-3", "face-1", "p2"),
    card("c-p2-deck-4", "face-2", "p2"),
  ];
  for (const c of p1) {
    s.cards[c.id] = c;
  }
  for (const c of p2) {
    s.cards[c.id] = c;
  }
  return s;
}

export const demoZones = Z;
