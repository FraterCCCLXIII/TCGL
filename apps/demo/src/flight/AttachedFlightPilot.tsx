import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import { Group } from "three";
import type { CardSpatialPose } from "tcgl";
import {
  CARD_MOTION_PRESETS,
  easeInOutCubic,
  interpolateCardPose,
  setCardFlipRigY,
} from "tcgl";

/** Matches {@link Card} inner pitch when `screenOverlay` is false (lay-flat toward mat). */
export const cardLayFlatTableRx = -Math.PI / 2;
/** Matches {@link Card} inner pitch when `screenOverlay` (HUD portrait plane). */
export const cardLayFlatHudRx = 0;

function applyLayFlatPitchBridge(root: Group, rx: number): void {
  root.traverse((o) => {
    const ud = o.userData as Record<string, unknown> | undefined;
    if (ud?.tcglLayFlatPitchGroup === true && o instanceof Group) {
      o.rotation.x = rx;
      o.rotation.y = 0;
      o.rotation.z = 0;
    }
  });
}

/** Enough for interpolation without importing App flight union types. */
export type AttachedFlightPilotFlight =
  | {
      playerId: "p1" | "p2";
      from: CardSpatialPose;
      to: CardSpatialPose;
      nonce: number;
      /** Inner mesh pitch bridge — required for correct table ↔ HUD visuals (see {@link Card}). */
      layFlatPitchFrom: number;
      layFlatPitchTo: number;
      /**
       * When both set, drives {@link Card} flip rig each frame: `0` = face-up, `Math.PI` = face-down.
       * Used for opponent HUD (hidden hand) → table reveal and return.
       */
      flipRYFrom?: number;
      flipRYTo?: number;
    }
  | null;

/**
 * Drives motion on the card root already attached (`Object3D.attach`) under the shell for that side.
 * Deck→hand and strip↔HUD flights share this — poses match {@link CARD_MOTION_PRESETS.deckToHand} arc.
 */
export function AttachedFlightPilot({
  flight,
  shellNearRef,
  shellFarRef,
  onComplete,
}: {
  flight: AttachedFlightPilotFlight;
  shellNearRef: RefObject<Group | null>;
  shellFarRef: RefObject<Group | null>;
  onComplete: () => void;
}) {
  const progressRef = useRef(0);
  const nonceRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  /** Rough equivalent total duration for spring preset (~tension 92 / friction 24 settle). */
  const durationSec = 0.62;

  useEffect(() => {
    if (!flight) {
      progressRef.current = 0;
      nonceRef.current = null;
      completedRef.current = false;
      return;
    }
    if (nonceRef.current !== flight.nonce) {
      nonceRef.current = flight.nonce;
      progressRef.current = 0;
      completedRef.current = false;
    }
  }, [flight]);

  useFrame((_, dt) => {
    if (flight == null || completedRef.current) {
      return;
    }
    const shell =
      flight.playerId === "p2" ? shellFarRef.current : shellNearRef.current;
    const child = shell?.children[0] as Group | undefined;
    if (!child) {
      return;
    }

    progressRef.current += dt / durationSec;
    const tLin = Math.min(1, progressRef.current);
    const u = easeInOutCubic(tLin);
    const pose = interpolateCardPose(
      flight.from,
      flight.to,
      u,
      CARD_MOTION_PRESETS.deckToHand.arcLiftMax
    );

    child.position.set(
      pose.position[0]!,
      pose.position[1]!,
      pose.position[2]!
    );
    const rot = pose.rotation ?? [0, 0, 0];
    child.rotation.set(rot[0]!, rot[1]!, rot[2]!);
    child.scale.setScalar(pose.scale ?? 1);

    const innerRx =
      flight.layFlatPitchFrom +
      (flight.layFlatPitchTo - flight.layFlatPitchFrom) * u;
    applyLayFlatPitchBridge(child, innerRx);

    if (flight.flipRYFrom !== undefined && flight.flipRYTo !== undefined) {
      const ry =
        flight.flipRYFrom + (flight.flipRYTo - flight.flipRYFrom) * u;
      setCardFlipRigY(child, ry);
    }

    if (tLin >= 1 - 1e-5 && !completedRef.current) {
      completedRef.current = true;
      onComplete();
    }
  });

  return null;
}
