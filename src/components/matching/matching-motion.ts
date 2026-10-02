export interface CrowdStopSlot {
  index: number;
  x: number;
}

/** Reserve horizontal stops only; every walker retains its original depth and size. */
export function createCrowdStopSlots(width: number, count: number): CrowdStopSlot[] {
  const spacing = width * 0.64 / count;
  return Array.from({ length: count }, (_, index) => ({
    index,
    x: width * 0.18 + (index + 0.5) * spacing + Math.sin(index * 2.39 + 0.7) * spacing * 0.12,
  }));
}

export interface WalkingRoute {
  startX: number;
  direction: 1 | -1;
  entryX: number;
  firstLeg: number;
  distance: number;
  wraps: boolean;
}

/** Continue in the same direction; an offscreen wrap never reverses a walker. */
export function createWalkingRoute(startX: number, targetX: number, width: number, figureWidth: number, direction: 1 | -1, minimumTravel: number): WalkingRoute {
  const wraps = direction * (targetX - startX) < minimumTravel;
  const exitX = direction === 1 ? width + figureWidth : -figureWidth;
  const entryX = direction === 1 ? -figureWidth : width + figureWidth;
  const firstLeg = wraps ? Math.max(0, direction * (exitX - startX)) : 0;
  const distance = firstLeg + Math.max(0, direction * (targetX - (wraps ? entryX : startX)));
  return { startX, direction, entryX, firstLeg, distance, wraps };
}

export function walkingRouteX(route: WalkingRoute, progress: number): number {
  const traveled = route.distance * Math.max(0, Math.min(1, progress));
  return route.wraps && traveled >= route.firstLeg ?
    route.entryX + route.direction * (traveled - route.firstLeg) :
    route.startX + route.direction * traveled;
}
