import type { Vec3 } from "../types";

/** World-space pose for the **wrapper group** around a Card (mesh stays identity inside). */
export type CardSpatialPose = {
  position: Vec3;
  /** Euler XYZ radians on the wrapper group (same convention as `Card`). */
  rotation?: Vec3;
  /** Uniform scale of the wrapper group. */
  scale?: number;
};

/**
 * How `Card.faceUp` resolves during motion.
 * - **none**: fixed terminal orientation (`faceUp`).
 * - **threshold**: flip exactly once when eased progress crosses `at` (triggers Card’s flip animation).
 */
export type CardMotionFlip =
  | { mode: "none"; faceUp: boolean }
  | {
      mode: "threshold";
      faceUpStart: boolean;
      faceUpEnd: boolean;
      /** Crossing point in **eased** 0…1 space (e.g. `0.5` = midpoint). */
      at: number;
    };
