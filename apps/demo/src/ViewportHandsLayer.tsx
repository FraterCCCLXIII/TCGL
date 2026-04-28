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
    /** Bridge duplicate `@types/three` installs (fiber vs demo) without weakening runtime types. */
    const cam = camera as unknown as {
      add: (o: Group) => void;
      remove: (o: Group) => void;
    };
    cam.add(shell);
    return () => {
      cam.remove(shell);
    };
  }, [camera]);

  return (
    <group ref={shellRef} renderOrder={24}>
      {children}
    </group>
  );
}
