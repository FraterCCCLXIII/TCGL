import { useMemo, type ReactNode, type Ref, forwardRef } from "react";
import type { Group } from "three";
import type { LayoutKind, R3FGroupProps, ZoneKind } from "../types";

export type ZoneProps = {
  id: string;
  zoneKind: ZoneKind;
  /** Expected layout; host arranges children — TCGL may add helpers (fan/stack) later. */
  layout: LayoutKind;
  children?: ReactNode;
} & R3FGroupProps;

/**
 * Primary abstraction: a named 3D region. Tagging only — no game rules.
 * Use `userData` via raycast: `userData.zoneId`, `userData.zoneKind`, `userData.layout`.
 */
export const Zone = forwardRef<Group, ZoneProps>(function Zone(
  { id, zoneKind, layout, userData, children, ...rest },
  ref
) {
  const merged = useMemo(
    () => ({ ...userData, zoneId: id, zoneKind, layout }),
    [userData, id, zoneKind, layout]
  );
  return (
    <group ref={ref as Ref<Group>} userData={merged} {...rest}>
      {children}
    </group>
  );
});
