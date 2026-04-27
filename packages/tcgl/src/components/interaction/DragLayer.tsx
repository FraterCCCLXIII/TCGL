import type { ReactNode } from "react";
import type { R3FGroupProps } from "../../types";

export type DragLayerProps = { children?: ReactNode } & R3FGroupProps;

/**
 * Host-driven drag: render a card proxy here with a high `renderOrder` and update position from pointer. Stub group for now.
 */
export function DragLayer({ children, ...rest }: DragLayerProps) {
  return (
    <group
      name="TCGL_DragLayer"
      renderOrder={1000}
      {...rest}
    >
      {children}
    </group>
  );
}
