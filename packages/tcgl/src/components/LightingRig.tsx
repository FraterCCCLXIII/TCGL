import { type ReactNode, useMemo } from "react";
import type { R3FGroupProps } from "../types";

export type LightingRigProps = {
  children?: ReactNode;
  /** Add warm fill from the side. */
  fillIntensity?: number;
  rimPosition?: [number, number, number];
} & R3FGroupProps;

/**
 * Composable fill + rim. TCGL canvas already includes ambient + key — this adds “table” polish.
 */
export function LightingRig({
  children,
  fillIntensity = 0.42,
  rimPosition = [-4, 3, 2],
  ...rest
}: LightingRigProps) {
  const pos = useMemo(() => rimPosition, [rimPosition]);
  return (
    <group {...rest}>
      <pointLight position={[-2, 4, 3]} intensity={fillIntensity} color="#e8e8ee" />
      <pointLight position={pos} intensity={0.34} color="#c8c8d4" />
      {children}
    </group>
  );
}
