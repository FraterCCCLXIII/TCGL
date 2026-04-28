import type { GameState } from "@tcgl/core";
import { Group } from "three";
import { cardPileIndex, cardStackIndex } from "tcgl";
import type { CardSpatialPose } from "tcgl";
import { demoZones } from "./seedDemoGame";
import {
  computeFrontPlayCardPoseFromVisualOffsets,
  getBattlefieldLocalPosition,
  getFrontPlayVisualOffsets,
  FRONT_PLAY_ZONE_PA,
} from "./zoneView";
import { sampleCardSpatialPoseInAncestor } from "./poseSample";
import type { StackPresentationKind } from "./stackModel";

/** Deep-copy zone lists after a hypothetical `MOVE_CARD` (card removed from `fromZ`, appended to `toZ`). */
export function zoneListsAfterMove(
  state: GameState,
  cardId: string,
  fromZ: string,
  toZ: string
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const key of Object.keys(state.zoneContents)) {
    out[key] = [...(state.zoneContents[key] ?? [])];
  }
  const from = out[fromZ];
  if (!from) {
    throw new Error(`zoneListsAfterMove: missing ${fromZ}`);
  }
  const fi = from.indexOf(cardId);
  if (fi < 0) {
    throw new Error(`zoneListsAfterMove: ${cardId} not in ${fromZ}`);
  }
  from.splice(fi, 1);
  const to = [...(out[toZ] ?? []).filter((id) => id !== cardId), cardId];
  out[toZ] = to;
  return out;
}

export type RelocateLand =
  | { t: "p1-hand" }
  | { t: "p2-hand" }
  | { t: "p1-strip" }
  | { t: "p2-strip" }
  | { t: "bf" }
  | { t: "p1-gy" }
  | { t: "p2-gy" }
  | { t: "p1-deck" }
  | { t: "p2-deck" };

export const RELOCATE_ZONE_OPTIONS: {
  id: string;
  label: string;
  land: RelocateLand;
}[] = [
  { id: demoZones.hand, label: "P1 hand (HUD)", land: { t: "p1-hand" } },
  { id: demoZones.frontPlay, label: "P1 staging strip", land: { t: "p1-strip" } },
  { id: demoZones.bf, label: "Battlefield", land: { t: "bf" } },
  { id: demoZones.gy, label: "P1 graveyard", land: { t: "p1-gy" } },
  { id: demoZones.deck, label: "P1 deck", land: { t: "p1-deck" } },
  { id: demoZones.p2Hand, label: "P2 hand (HUD)", land: { t: "p2-hand" } },
  { id: demoZones.p2FrontPlay, label: "P2 staging strip", land: { t: "p2-strip" } },
  { id: demoZones.p2Gy, label: "P2 graveyard", land: { t: "p2-gy" } },
  { id: demoZones.p2Deck, label: "P2 deck", land: { t: "p2-deck" } },
];

export function landForZoneId(toZone: string): RelocateLand | null {
  const o = RELOCATE_ZONE_OPTIONS.find((x) => x.id === toZone);
  return o?.land ?? null;
}

function tempPoseInAncestor(
  parent: Group,
  localPos: [number, number, number],
  localRot: [number, number, number],
  scale: number,
  ancestor: Group
): CardSpatialPose {
  const t = new Group();
  t.position.set(localPos[0]!, localPos[1]!, localPos[2]!);
  t.rotation.set(localRot[0]!, localRot[1]!, localRot[2]!);
  t.scale.setScalar(scale);
  parent.add(t);
  t.updateMatrixWorld(true);
  const p = sampleCardSpatialPoseInAncestor(t, ancestor);
  parent.remove(t);
  return { ...p, scale };
}

/**
 * Target pose (PlayerArea- or opponent-Area–local) for a card landing in `toZone` after the move.
 */
export function computeRelocateTargetPose(args: {
  cardId: string;
  toZone: string;
  lists: Record<string, string[]>;
  playerArea: Group;
  stackOnFp: Record<string, string>;
  stackOnFpP2: Record<string, string>;
  fpStackKind: StackPresentationKind;
  battlefieldGroup: Group;
  p1GyGroup: Group;
  p2GyGroup: Group;
  p1DeckStackGroup: Group;
  p2DeckStackGroup: Group;
  tableCardScale: number;
}): CardSpatialPose {
  const {
    cardId,
    toZone,
    lists,
    playerArea,
    stackOnFp,
    stackOnFpP2,
    fpStackKind,
    battlefieldGroup,
    p1GyGroup,
    p2GyGroup,
    p1DeckStackGroup,
    p2DeckStackGroup,
    tableCardScale,
  } = args;

  if (toZone === demoZones.frontPlay) {
    const fp = lists[demoZones.frontPlay] ?? [];
    const offs = getFrontPlayVisualOffsets(fp, stackOnFp, fpStackKind);
    const pose = computeFrontPlayCardPoseFromVisualOffsets(cardId, offs);
    return tempPoseInAncestor(
      playerArea,
      [
        FRONT_PLAY_ZONE_PA.position[0]! + pose.position[0]!,
        FRONT_PLAY_ZONE_PA.position[1]! + pose.position[1]!,
        FRONT_PLAY_ZONE_PA.position[2]! + pose.position[2]!,
      ],
      pose.rotation ?? [0, 0, 0],
      tableCardScale,
      playerArea
    );
  }
  if (toZone === demoZones.p2FrontPlay) {
    const fp = lists[demoZones.p2FrontPlay] ?? [];
    const offs = getFrontPlayVisualOffsets(fp, stackOnFpP2, fpStackKind);
    const pose = computeFrontPlayCardPoseFromVisualOffsets(cardId, offs);
    const localPos: [number, number, number] = [
      FRONT_PLAY_ZONE_PA.position[0]! + pose.position[0]!,
      FRONT_PLAY_ZONE_PA.position[1]! + pose.position[1]!,
      FRONT_PLAY_ZONE_PA.position[2]! + pose.position[2]!,
    ];
    const rot: [number, number, number] = [
      pose.rotation?.[0] ?? 0,
      (pose.rotation?.[1] ?? 0) + Math.PI,
      pose.rotation?.[2] ?? 0,
    ];
    return tempPoseInAncestor(playerArea, localPos, rot, tableCardScale, playerArea);
  }
  if (toZone === demoZones.bf) {
    const bf = (lists[demoZones.bf] ?? []).filter((id) => id !== "c-bf-2");
    const pos = getBattlefieldLocalPosition(cardId, bf, [0.55, 0, 0]);
    return tempPoseInAncestor(
      battlefieldGroup,
      pos,
      [0, 0, 0],
      tableCardScale,
      playerArea
    );
  }
  if (toZone === demoZones.gy) {
    const gy = lists[demoZones.gy] ?? [];
    const i = Math.max(0, gy.indexOf(cardId));
    const { position, rotation } = cardPileIndex(i, 0.018);
    return tempPoseInAncestor(
      p1GyGroup,
      position as [number, number, number],
      rotation as [number, number, number],
      tableCardScale,
      playerArea
    );
  }
  if (toZone === demoZones.p2Gy) {
    const gy = lists[demoZones.p2Gy] ?? [];
    const i = Math.max(0, gy.indexOf(cardId));
    const { position, rotation } = cardPileIndex(i, 0.018);
    return tempPoseInAncestor(
      p2GyGroup,
      position as [number, number, number],
      rotation as [number, number, number],
      tableCardScale,
      playerArea
    );
  }
  if (toZone === demoZones.deck) {
    const deck = lists[demoZones.deck] ?? [];
    const i = Math.max(0, deck.indexOf(cardId));
    const p = cardStackIndex(i, 0.025);
    return tempPoseInAncestor(
      p1DeckStackGroup,
      p as [number, number, number],
      [0, 0, 0],
      tableCardScale,
      playerArea
    );
  }
  if (toZone === demoZones.p2Deck) {
    const deck = lists[demoZones.p2Deck] ?? [];
    const i = Math.max(0, deck.indexOf(cardId));
    const p = cardStackIndex(i, 0.025);
    return tempPoseInAncestor(
      p2DeckStackGroup,
      p as [number, number, number],
      [0, 0, 0],
      tableCardScale,
      playerArea
    );
  }
  throw new Error(`computeRelocateTargetPose: unsupported toZone ${toZone}`);
}

/** Whether `toZone` is a valid context-menu relocate target (any controller may move there). */
export function canControllerUseZone(
  _playerId: "p1" | "p2",
  toZone: string
): boolean {
  return RELOCATE_ZONE_OPTIONS.some((o) => o.id === toZone);
}
