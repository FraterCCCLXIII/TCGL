import { useMemo, type ReactNode, type Ref, forwardRef } from "react";
import type { Group } from "three";
import type { LayoutKind, R3FGroupProps, ZoneKind } from "../types";

export type ZoneProps = {
  id: string;
  zoneKind: ZoneKind;
  /** Expected layout; host arranges children — TCGL may add helpers (fan/stack) later. */
  layout: LayoutKind;
  /**
   * When set, stored on `userData.defaultFaceUp` so hosts can align motion (e.g. deck draw flip)
   * and presentation with the zone’s engine id. Does not enforce rules — hosts map zone ids to
   * defaults (see demo `getZoneDefaultFaceUp`).
   */
  defaultFaceUp?: boolean;
  children?: ReactNode;
} & R3FGroupProps;

/**
 * Primary abstraction: a named 3D region. Tagging only — no game rules.
 * Use `userData` via raycast: `userData.zoneId`, `userData.zoneKind`, `userData.layout`,
 * optional `userData.defaultFaceUp`.
 */
export const Zone = forwardRef<Group, ZoneProps>(function Zone(
  { id, zoneKind, layout, defaultFaceUp, userData, children, ...rest },
  ref
) {
  const merged = useMemo(
    () => ({
      ...userData,
      zoneId: id,
      zoneKind,
      layout,
      ...(defaultFaceUp !== undefined ? { defaultFaceUp } : {}),
    }),
    [userData, id, zoneKind, layout, defaultFaceUp]
  );
  return (
    <group ref={ref as Ref<Group>} userData={merged} {...rest}>
      {children}
    </group>
  );
});
