import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import { cardStackIndex } from "../layout/stackLayout";
import type { R3FGroupProps } from "../types";

export type CardStackProps = {
  children?: ReactNode;
  yStep?: number;
} & R3FGroupProps;

/** Ordered, neat vertical stack (deck / resolution). */
export function CardStack({ children, yStep = 0.02, ...groupProps }: CardStackProps) {
  const list = Children.toArray(children);
  return (
    <group {...groupProps}>
      {list.map((child, i) => {
        if (!isValidElement(child)) {
          return child;
        }
        const p = cardStackIndex(i, yStep);
        return (
          <group key={child.key ?? i} position={p}>
            {cloneElement(child, {})}
          </group>
        );
      })}
    </group>
  );
}
