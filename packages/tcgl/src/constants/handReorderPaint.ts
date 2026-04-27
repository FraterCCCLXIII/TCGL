/** Transparent meshes still depth-sort — neighbors paint below the lifted card. */
export const HAND_REORDER_MESH_UNDER = -50;
/** Lifted card + faces — must beat neighbors after JSX reconciliation each spring frame. */
export const HAND_REORDER_MESH_DRAGGED_ON_TOP = 5000;
