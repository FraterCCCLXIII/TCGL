import { createContext, useContext } from "react";

/**
 * While reordering a hand, which card id is being dragged (`string`), or idle (`null`).
 * **`undefined`** if no Provider (card not inside {@link ReorderableCardFan}).
 */
export const HandReorderDragIdContext = createContext<string | null | undefined>(
  undefined
);

/** @returns whether a hand-drag is active and whether `cardId` is the dragged card. */
export function useHandReorderDragPaint(cardId: string): {
  /** True only when this card is the one being reordered (lifted). */
  isDragged: boolean;
  /** True when some hand card is being reordered (this card may be a neighbor). */
  isFanDragging: boolean;
} {
  const target = useContext(HandReorderDragIdContext);
  const isFanDragging = typeof target === "string";
  return {
    isDragged: isFanDragging && target === cardId,
    isFanDragging,
  };
}
