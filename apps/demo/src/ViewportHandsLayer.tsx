import { useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { Group } from "three";

/**
 * Renders children as a **child of the active camera** so content stays fixed in view (HUD-style)
 * while the table/camera rig moves.
 */
export function CameraAttachedHandsRoot({ children }: { children: ReactNode }) {
  const camera = useThree((s) => s.camera);
  const shellRef = useRef<Group>(null);

  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }
    camera.add(shell);
    return () => {
      camera.remove(shell);
    };
  }, [camera]);

  return (
    <group ref={shellRef} renderOrder={24}>
      {children}
    </group>
  );
}
