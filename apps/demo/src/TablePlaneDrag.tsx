import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import type { Group } from "three";
import { Plane, Raycaster, Vector2, Vector3, type Camera } from "three";

type Props = {
  active: boolean;
  /** World-space Y of the horizontal drag plane. */
  planeY: number;
  onDrag: (local: [number, number, number]) => void;
  onEnd: () => void;
  parentRef: RefObject<Group | null>;
  /**
   * When `active` turns true (e.g. hand vertical-drag start), project this once so the ghost has an
   * initial hit before the first `pointermove`.
   */
  seedPointerClient?: { clientX: number; clientY: number } | null;
};

/**
 * While `active`, projects pointer to `planeY` in world space, converts to the parent group’s
 * local space, and flattens to y = 0 (table) so cards stay in the zone.
 */
export function TablePlaneDrag({
  active,
  planeY,
  onDrag,
  onEnd,
  parentRef,
  seedPointerClient,
}: Props) {
  const { camera, gl } = useThree();
  const worldHit = useRef(new Vector3());
  const localHit = useRef(new Vector3());
  const ndc = useMemo(() => new Vector2(), []);
  const raycaster = useMemo(() => new Raycaster(), []);
  const plane = useMemo(
    () => new Plane(new Vector3(0, 1, 0), -planeY),
    [planeY]
  );

  useEffect(() => {
    if (!active) {
      return;
    }
    const el = gl.domElement;
    const hitFromClient = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 2 - 1;
      const yNdc = -((clientY - rect.top) / rect.height) * 2 + 1;
      ndc.set(x, yNdc);
      raycaster.setFromCamera(ndc, camera as unknown as Camera);
      if (raycaster.ray.intersectPlane(plane, worldHit.current)) {
        const p = parentRef.current;
        if (!p) {
          return;
        }
        localHit.current.copy(worldHit.current);
        p.worldToLocal(localHit.current);
        onDrag([localHit.current.x, 0, localHit.current.z]);
      }
    };
    const move = (e: PointerEvent) => {
      hitFromClient(e.clientX, e.clientY);
    };
    if (seedPointerClient) {
      hitFromClient(seedPointerClient.clientX, seedPointerClient.clientY);
    }
    const up = () => onEnd();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [
    active,
    camera,
    gl,
    ndc,
    onDrag,
    onEnd,
    parentRef,
    plane,
    raycaster,
    seedPointerClient,
  ]);
  return null;
}
