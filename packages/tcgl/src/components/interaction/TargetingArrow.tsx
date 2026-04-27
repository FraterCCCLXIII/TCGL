import { Line } from "@react-three/drei";
import { useLayoutEffect, useMemo, useState } from "react";
import { QuadraticBezierCurve3, Vector3, type Vector3 as Vector3Type } from "three";
import type { R3FGroupProps } from "../../types";

export type TargetingArrowProps = {
  from: [number, number, number] | Vector3Type;
  to: [number, number, number] | Vector3Type;
  color?: string;
  lineWidth?: number;
} & R3FGroupProps;

/**
 * Draws a curved “arrow” line between two points. Purely visual — the host supplies endpoints.
 */
export function TargetingArrow({
  from,
  to,
  color = "#fbbf24",
  lineWidth = 2.5,
  ...rest
}: TargetingArrowProps) {
  const [points, setPoints] = useState<Vector3Type[]>([]);
  const curve = useMemo(() => {
    const a = from instanceof Vector3 ? from : new Vector3(...from);
    const b = to instanceof Vector3 ? to : new Vector3(...to);
    const mid = a.clone().lerp(b, 0.5).add(new Vector3(0, 0.6, 0));
    return new QuadraticBezierCurve3(a, mid, b);
  }, [from, to]);
  useLayoutEffect(() => {
    setPoints(curve.getPoints(24));
  }, [curve]);
  if (points.length === 0) {
    return null;
  }
  return (
    <group {...rest}>
      <Line points={points} color={color} lineWidth={lineWidth} dashed opacity={0.9} />
    </group>
  );
}
