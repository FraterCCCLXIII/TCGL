import { demoZones } from "../engine/seedDemoGame";

const UP = 0;
const DOWN = Math.PI;

/**
 * Inner flip-rig Y for {@link setCardFlipRigY} when a card rests in `zoneId`, matching
 * `finishZoneFlight` / `finishDeckFlight` conventions (including hidden opponent hand).
 */
export function cardFlipRigYInZone(
  playerId: "p1" | "p2",
  zoneId: string,
  logicalFaceUp: boolean
): number {
  const face = logicalFaceUp ? UP : DOWN;

  if (playerId === "p2") {
    if (zoneId === demoZones.p2Hand) {
      return DOWN;
    }
    if (zoneId === demoZones.p2Gy || zoneId === demoZones.p2Deck) {
      return DOWN;
    }
    return face;
  }

  return face;
}
