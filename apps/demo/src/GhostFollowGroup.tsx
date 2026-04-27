import { useFrame } from "@react-three/fiber";
import { useRef, type MutableRefObject, type ReactNode } from "react";
import type { Group } from "three";

type Props = {
  /** Latest plane-local `[x, yFlat, z]` from raycast (`y` ignored — use `yLift`). Updated without React state. */
  posRef: MutableRefObject<[number, number, number] | null>;
  /** PlayerArea-local Y for card clearance above the drag plane. */
  yLift: number;
  children: ReactNode;
  renderOrder?: number;
};

/**
 * Drives `group.position` each frame from `posRef` so plane-drag ghosts stay fluid without one React
 * commit per pointermove (matches how lightweight battlefield drag feels vs heavy App-wide rerenders).
 */
export function GhostFollowGroup({
  posRef,
  yLift,
  children,
  renderOrder,
}: Props) {
  const groupRef = useRef<Group>(null);
  useFrame(() => {
    const g = groupRef.current;
    const p = posRef.current;
    if (!g) {
      return;
    }
    if (!p) {
      g.visible = false;
      return;
    }
    g.visible = true;
    g.position.set(p[0]!, yLift, p[2]!);
  });
  return (
    <group ref={groupRef} renderOrder={renderOrder}>
      {children}
    </group>
  );
}
