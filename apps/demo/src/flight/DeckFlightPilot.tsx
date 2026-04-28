import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import type { Group } from "three";
import type { CardSpatialPose } from "tcgl";
import {
  CARD_MOTION_PRESETS,
  easeInOutCubic,
  interpolateCardPose,
} from "tcgl";

/** Mirrors {@link DeckFlightAnim} enough for the pilot (avoid importing App). */
export type DeckFlightPilotFlight =
  | {
      playerId: "p1" | "p2";
      cardId: string;
      from: CardSpatialPose;
      to: CardSpatialPose;
      nonce: number;
    }
  | null;

/**
 * Drives motion on the deck card root already attached (`Object3D.attach`) under `shellRef`.
 * P1 deck→hand only — physics timing approximates {@link CARD_MOTION_PRESETS.deckToHand}.
 */
export function DeckFlightPilot({
  deckFlight,
  shellRef,
  onComplete,
}: {
  deckFlight: DeckFlightPilotFlight;
  shellRef: RefObject<Group | null>;
  onComplete: () => void;
}) {
  const progressRef = useRef(0);
  const nonceRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  /** Rough equivalent total duration for spring preset (~tension 92 / friction 24 settle). */
  const durationSec = 0.62;

  useEffect(() => {
    if (!deckFlight || deckFlight.playerId !== "p1") {
      progressRef.current = 0;
      nonceRef.current = null;
      completedRef.current = false;
      return;
    }
    if (nonceRef.current !== deckFlight.nonce) {
      nonceRef.current = deckFlight.nonce;
      progressRef.current = 0;
      completedRef.current = false;
    }
  }, [deckFlight]);

  useFrame((_, dt) => {
    if (
      deckFlight == null ||
      deckFlight.playerId !== "p1" ||
      completedRef.current
    ) {
      return;
    }
    const shell = shellRef.current;
    const child = shell?.children[0] as Group | undefined;
    if (!child) {
      return;
    }

    progressRef.current += dt / durationSec;
    const tLin = Math.min(1, progressRef.current);
    const u = easeInOutCubic(tLin);
    const pose = interpolateCardPose(
      deckFlight.from,
      deckFlight.to,
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

    if (tLin >= 1 - 1e-5 && !completedRef.current) {
      completedRef.current = true;
      onComplete();
    }
  });

  return null;
}
