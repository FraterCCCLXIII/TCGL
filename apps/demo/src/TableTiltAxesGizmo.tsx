import { GizmoHelper, GizmoViewport } from "@react-three/drei";

/**
 * Right-corner orientation widget (drei {@link GizmoHelper} + {@link GizmoViewport}): the outer
 * group syncs to `inverse(camera)` every frame exactly like drei; inner group uses the same radians
 * and Euler order (**XYZ**) as `Playmat`’s `rotation={tilt}`, so visually
 * **`InvCam ∘ R_tilt`** without hand-rolled quaternion math.
 */
export function TableTiltAxesGizmo({
  tilt,
  visible,
  alignment = "bottom-right",
  margin = [88, 128],
}: {
  /** Radians — same `[pitch, yaw, roll]` tuple as `{@link Playmat}` `tilt`. */
  tilt: [number, number, number];
  visible: boolean;
  /** See drei `GizmoHelper` `alignment` */
  alignment?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /** From viewport edge in px — bottom margin large enough to sit above settings FAB */
  margin?: [number, number];
}) {
  if (!visible) {
    return null;
  }

  return (
    <GizmoHelper alignment={alignment} margin={margin}>
      {/* Same euler as Playmat root — Drei HUD parent applies inverted camera orientation */}
      <group rotation={[tilt[0]!, tilt[1]!, tilt[2]!]} name="tcgl-playmat-orientation-gizmo-inner">
        <GizmoViewport
          disabled
          hideNegativeAxes
          labels={["X", "Y", "Z"]}
        />
      </group>
    </GizmoHelper>
  );
}
