import { demoZones } from "./seedDemoGame";

/**
 * Logical face-up default per **engine** zone id (`demoZones.*`) when a card has no host
 * `faceUpById` override. Hosts should pass the same value on {@link ZoneProps.defaultFaceUp}
 * where convenient.
 */
export const ZONE_DEFAULT_FACE_UP: Readonly<Record<string, boolean>> = {
  [demoZones.deck]: false,
  [demoZones.p2Deck]: false,
  [demoZones.hand]: true,
  /** Opponent HUD: backs toward near player until host `faceUpById` reveals. */
  [demoZones.p2Hand]: false,
  [demoZones.frontPlay]: true,
  [demoZones.p2FrontPlay]: true,
  [demoZones.bf]: true,
  [demoZones.gy]: true,
  [demoZones.p2Gy]: true,
  [demoZones.stack]: true,
};

export function getZoneDefaultFaceUp(zoneId: string): boolean {
  return ZONE_DEFAULT_FACE_UP[zoneId] ?? true;
}

export function logicalFaceUpForCard(
  cardId: string,
  zoneId: string | null,
  faceUpById: Record<string, boolean>
): boolean {
  if (cardId in faceUpById) {
    return faceUpById[cardId]!;
  }
  return zoneId != null ? getZoneDefaultFaceUp(zoneId) : true;
}
