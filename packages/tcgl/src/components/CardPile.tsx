import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  type ReactNode,
} from "react";
import type { Group } from "three";
import { cardPileIndex } from "../layout/stackLayout";
import type { R3FGroupProps } from "../types";

export type CardPileProps = {
  children?: ReactNode;
  yStep?: number;
} & R3FGroupProps;

/** Overlapping pile with slight jitter (graveyard / discard feel). */
export const CardPile = forwardRef<Group, CardPileProps>(function CardPile(
  { children, yStep = 0.018, ...groupProps },
  ref
) {
  const list = Children.toArray(children);
  return (
    <group ref={ref} {...groupProps}>
      {list.map((child, i) => {
        if (!isValidElement(child)) {
          return child;
        }
        const { position, rotation } = cardPileIndex(i, yStep);
        return (
          <group
            key={child.key ?? i}
            position={position}
            rotation={rotation}
          >
            {cloneElement(child, {})}
          </group>
        );
      })}
    </group>
  );
});
