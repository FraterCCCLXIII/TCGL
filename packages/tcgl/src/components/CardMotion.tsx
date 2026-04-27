import { forwardRef, useCallback, type ReactNode } from "react";
import type { Group } from "three";
import type { R3FGroupProps } from "../types";
import {
  useCardMotion,
  type UseCardMotionOptions,
} from "../motion/useCardMotion";

export type CardMotionProps = UseCardMotionOptions &
  Omit<R3FGroupProps, "position" | "rotation" | "scale"> & {
    /**
     * Render the animated Card here at local identity (`position`/`rotation` on Card stay default).
     * Function form receives resolved `faceUp` for this frame rule set.
     */
    children?: ReactNode | ((state: { faceUp: boolean }) => ReactNode);
  };

/**
 * World-space wrapper driven by `useCardMotion`: interpolate wrapper pose `from` → `to`, optional arc
 * lift, optional timed flip (`flip`), react-spring duration or physics (`durationMs: 0`).
 */
export const CardMotion = forwardRef<Group, CardMotionProps>(function CardMotion(
  {
    active,
    arcLiftMax,
    durationMs,
    easing,
    flip,
    friction,
    from,
    onComplete,
    tension,
    to,
    children,
    ...groupProps
  },
  ref
) {
  const { groupRef, faceUp } = useCardMotion({
    active,
    arcLiftMax,
    durationMs,
    easing,
    flip,
    friction,
    from,
    onComplete,
    tension,
    to,
  });

  const mergedRef = useCallback(
    (node: Group | null) => {
      (groupRef as React.MutableRefObject<Group | null>).current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [groupRef, ref]
  );

  return (
    <group ref={mergedRef} {...groupProps}>
      {typeof children === "function" ? children({ faceUp }) : children}
    </group>
  );
});

CardMotion.displayName = "CardMotion";
