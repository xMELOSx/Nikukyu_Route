import { type Point } from './DataManager';

export interface PathNode {
  x: number;
  y: number;
  floor: string;
  isPortal?: boolean;
  portalName?: string;
  markerId?: string;
  linkedMarkerId?: string;
}

export interface PathfindingResult {
  path: PathNode[] | null;
  /** Indices i where path[i]→path[i+1] is a teleport (no line should be drawn). */
  teleportIndices: number[];
  portalStats: {
    total: number;
    connected: number;
    details: { name: string; floor: string; edges: number }[];
  };
}

export function getSegmentsMinDistance(a: Point, b: Point, c: Point, d: Point): number {
  const ccw = (p1: Point, p2: Point, p3: Point) =>
    (p3.y - p1.y) * (p2.x - p1.x) > (p2.y - p1.y) * (p3.x - p1.x);
  const intersects = ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
  if (intersects) return 0;
  const ptSeg = (p: Point, s1: Point, s2: Point): number => {
    const dx = s2.x - s1.x, dy = s2.y - s1.y;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(p.x - s1.x, p.y - s1.y);
    let t = ((p.x - s1.x) * dx + (p.y - s1.y) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (s1.x + t * dx), p.y - (s1.y + t * dy));
  };
  return Math.min(ptSeg(a, c, d), ptSeg(b, c, d), ptSeg(c, a, b), ptSeg(d, a, b));
}

export function isIntersecting(a: Point, b: Point, c: Point, d: Point, thickness: number = 4.0): boolean {
  return getSegmentsMinDistance(a, b, c, d) < thickness;
}

function hitsAnyWall(a: Point, b: Point, floor: string, walls: { [key: string]: [Point, Point][] }, thickness: number = 4.0): boolean {
  const floorWalls = walls[floor] || [];
  for (const w of floorWalls) {
    if (isIntersecting(a, b, w[0], w[1], thickness)) return true;
  }
  return false;
}

const TELEPORT_COST = 5;

export function findBypassingPath(
  start: PathNode, end: PathNode,
  walls: { [key: string]: [Point, Point][] },
  markers: any[]
): PathfindingResult {
  const nodes: PathNode[] = [start, end];
  const activeFloors = new Set<string>([start.floor, end.floor]);
  Object.keys(walls).forEach(fl => activeFloors.add(fl));
  markers.forEach(m => { if (m.floor) activeFloors.add(m.floor); });

  const offsets = [
    { dx: -20, dy: -20 }, { dx: 20, dy: -20 },
    { dx: -20, dy: 20 },  { dx: 20, dy: 20 },
    { dx: 0, dy: -24 },   { dx: 0, dy: 24 },
    { dx: -24, dy: 0 },   { dx: 24, dy: 0 }
  ];

  activeFloors.forEach(fl => {
    const flWalls = walls[fl] || [];
    const pts = new Set<string>();
    flWalls.forEach(w => {
      [w[0], w[1]].forEach(p => {
        const key = `${Math.round(p.x)},${Math.round(p.y)}`;
        if (pts.has(key)) return;
        pts.add(key);
        offsets.forEach(off => {
          const bp = { x: p.x + off.dx, y: p.y + off.dy };
          if (!hitsAnyWall(p, bp, fl, walls, 2)) {
            nodes.push({ x: bp.x, y: bp.y, floor: fl });
          }
        });
      });
    });

    // Detect narrow gaps (doorways) between roughly parallel opposing wall
    // segments on the same floor. For each gap, drop a "passage" node at the
    // midpoint so A* has a waypoint to route through the opening. We only
    // consider wall pairs that are close (≤ 24px gap), not parallel to each
    // other, and where the segment between their midpoints is wall-free.
    const PASSAGE_GAP_MAX = 24;
    for (let i = 0; i < flWalls.length; i++) {
      const wa = flWalls[i];
      const amid = { x: (wa[0].x + wa[1].x) / 2, y: (wa[0].y + wa[1].y) / 2 };
      const aDx = wa[1].x - wa[0].x, aDy = wa[1].y - wa[0].y;
      const aLen = Math.hypot(aDx, aDy);
      if (aLen === 0) continue;
      for (let j = i + 1; j < flWalls.length; j++) {
        const wb = flWalls[j];
        const bmid = { x: (wb[0].x + wb[1].x) / 2, y: (wb[0].y + wb[1].y) / 2 };
        const bDx = wb[1].x - wb[0].x, bDy = wb[1].y - wb[0].y;
        const bLen = Math.hypot(bDx, bDy);
        if (bLen === 0) continue;

        // Skip if the two wall segments themselves are too long (likely not
        // the two sides of the same doorway opening).
        if (aLen > 60 || bLen > 60) continue;

        // Midpoint-to-midpoint distance is the gap width.
        const gap = Math.hypot(amid.x - bmid.x, amid.y - bmid.y);
        if (gap <= 0 || gap > PASSAGE_GAP_MAX) continue;

        // The two wall segments must be roughly parallel (same orientation).
        const dot = (aDx * bDx + aDy * bDy) / (aLen * bLen);
        if (Math.abs(dot) < 0.7) continue;

        // Make sure the line between the midpoints isn't blocked by another
        // wall (otherwise this isn't a real opening).
        if (hitsAnyWall(amid, bmid, fl, walls, 1.0)) continue;

        const passage = { x: (amid.x + bmid.x) / 2, y: (amid.y + bmid.y) / 2, floor: fl };
        nodes.push(passage);
      }
    }
  });

  // Add portal (warp/stairs) nodes with marker metadata
  markers.forEach(m => {
    if ((m.type === 'warp' || m.type === 'iwarp' || m.type === 'stairs') && m.floor) {
      const name = (m.note && m.note.trim()) ? m.note : (m.type === 'stairs' ? 'Stairs' : 'Warp') + '#' + m.id.substring(m.id.length - 4);
      nodes.push({
        x: m.x, y: m.y, floor: m.floor,
        isPortal: true, portalName: name,
        markerId: m.id, linkedMarkerId: m.linkedWarpId
      });
    }
  });

  // Deduplicate nodes
  const uniqueNodes: PathNode[] = [];
  const visited = new Set<string>();
  nodes.forEach(n => {
    const key = `${n.floor}:${Math.round(n.x)},${Math.round(n.y)}`;
    if (!visited.has(key)) {
      visited.add(key);
      uniqueNodes.push(n);
    }
  });

  // Cap node count but always keep portals
  if (uniqueNodes.length > 250) {
    const keep = uniqueNodes.filter((n, i) => i < 2 || n.isPortal);
    const rest = uniqueNodes.filter((n, i) => i >= 2 && !n.isPortal);
    rest.sort((a, b) => {
      const da = Math.min(Math.hypot(a.x - start.x, a.y - start.y), Math.hypot(a.x - end.x, a.y - end.y));
      const db = Math.min(Math.hypot(b.x - start.x, b.y - start.y), Math.hypot(b.x - end.x, b.y - end.y));
      return da - db;
    });
    uniqueNodes.length = 0;
    uniqueNodes.push(...keep, ...rest.slice(0, 200));
  }


  // Add bypass nodes specifically around portal locations to ensure connectivity
  uniqueNodes.forEach((n) => {
    if (!n.isPortal) return;
    const portalOffsets = [
      { dx: -15, dy: 0 }, { dx: 15, dy: 0 },
      { dx: 0, dy: -15 }, { dx: 0, dy: 15 },
      { dx: -10, dy: -10 }, { dx: 10, dy: -10 },
      { dx: -10, dy: 10 }, { dx: 10, dy: 10 }
    ];
    portalOffsets.forEach(off => {
      const bp = { x: n.x + off.dx, y: n.y + off.dy };
      const key = `${n.floor}:${Math.round(bp.x)},${Math.round(bp.y)}`;
      if (!visited.has(key) && !hitsAnyWall(n, bp, n.floor, walls, 1)) {
        visited.add(key);
        uniqueNodes.push({ x: bp.x, y: bp.y, floor: n.floor });
      }
    });
  });

  // Rebuild adjacency after adding portal bypass nodes
  const adj = new Map<number, { to: number; cost: number; isTeleport: boolean }[]>();
  for (let i = 0; i < uniqueNodes.length; i++) adj.set(i, []);

  // Physical edges (same floor, wall check with appropriate thickness)
  for (let i = 0; i < uniqueNodes.length; i++) {
    const ni = uniqueNodes[i];
    for (let j = i + 1; j < uniqueNodes.length; j++) {
      const nj = uniqueNodes[j];
      if (ni.floor !== nj.floor) continue;
      // Portal edges use 1px thickness (pure geometric intersection only)
      // Regular edges use a thin 2px thickness so narrow corridors (≧ 4px gap)
      // can still be traversed while wall gaps are clearly avoided.
      const thickness = (ni.isPortal || nj.isPortal) ? 1.0 : 2.0;
      if (!hitsAnyWall(ni, nj, ni.floor, walls, thickness)) {
        const d = Math.hypot(ni.x - nj.x, ni.y - nj.y);
        adj.get(i)!.push({ to: j, cost: d, isTeleport: false });
        adj.get(j)!.push({ to: i, cost: d, isTeleport: false });
      }
    }
  }

  // Teleport edges (linked portal pairs)
  const processed = new Set<string>();
  markers.forEach(m => {
    if (!(m.type === 'warp' || m.type === 'iwarp' || m.type === 'stairs')) return;
    const partner = markers.find((x: any) =>
      x.id !== m.id && (
        (m.linkedWarpId && x.id === m.linkedWarpId) ||
        (x.linkedWarpId && x.linkedWarpId === m.id)
      )
    );
    if (!partner) return;
    const pairKey = [m.id, partner.id].sort().join(':');
    if (processed.has(pairKey)) return;
    processed.add(pairKey);

    const idxA = uniqueNodes.findIndex(n => n.markerId === m.id);
    const idxB = uniqueNodes.findIndex(n => n.markerId === partner.id);
    if (idxA >= 0 && idxB >= 0) {
      adj.get(idxA)!.push({ to: idxB, cost: TELEPORT_COST, isTeleport: true });
      adj.get(idxB)!.push({ to: idxA, cost: TELEPORT_COST, isTeleport: true });
    }
  });

  // Portal stats
  const portalIndices = uniqueNodes.map((n, i) => n.isPortal ? i : -1).filter(i => i >= 0);
  const portalDetails = portalIndices.map(idx => {
    const node = uniqueNodes[idx];
    const edges = adj.get(idx) || [];
    const physicalEdges = edges.filter(e => !e.isTeleport).length;
    return { name: node.portalName || 'Portal', floor: node.floor, edges: physicalEdges };
  });

  // A* search
  const dist = new Array(uniqueNodes.length).fill(Infinity);
  const parentIdx = new Array(uniqueNodes.length).fill(-1);
  // Track which edge was used to reach each node (to identify teleports in path)
  const parentEdgeTeleport = new Array(uniqueNodes.length).fill(false);
  dist[0] = 0;

  const queue: { idx: number; f: number }[] = [{ idx: 0, f: Math.hypot(start.x - end.x, start.y - end.y) }];

  while (queue.length > 0) {
    queue.sort((a, b) => a.f - b.f);
    const { idx } = queue.shift()!;

    if (idx === 1) {
      // Reconstruct path
      const pathIndices: number[] = [];
      let cur = 1;
      while (cur !== -1) { pathIndices.push(cur); cur = parentIdx[cur]; }
      pathIndices.reverse();

      const path = pathIndices.map(i => uniqueNodes[i]);
      const teleportIndices: number[] = [];
      for (let i = 1; i < pathIndices.length; i++) {
        if (parentEdgeTeleport[pathIndices[i]]) {
          teleportIndices.push(i - 1); // path[i-1] → path[i] is teleport
        }
      }

      console.log('[PathFinder] Path found:', path.map((n, i) => ({
        i, x: Math.round(n.x), y: Math.round(n.y), floor: n.floor,
        portal: n.isPortal ? n.portalName : undefined,
        teleportAfter: teleportIndices.includes(i)
      })));

      return {
        path,
        teleportIndices,
        portalStats: {
          total: portalDetails.length,
          connected: portalDetails.filter(p => p.edges > 0).length,
          details: portalDetails
        }
      };
    }

    for (const edge of (adj.get(idx) || [])) {
      const nd = dist[idx] + edge.cost;
      if (nd < dist[edge.to]) {
        dist[edge.to] = nd;
        parentIdx[edge.to] = idx;
        parentEdgeTeleport[edge.to] = edge.isTeleport;
        const tn = uniqueNodes[edge.to];
        const h = tn.floor === end.floor ? Math.hypot(tn.x - end.x, tn.y - end.y) : 0;
        const qi = queue.findIndex(q => q.idx === edge.to);
        if (qi >= 0) queue[qi].f = nd + h;
        else queue.push({ idx: edge.to, f: nd + h });
      }
    }
  }

  return {
    path: null,
    teleportIndices: [],
    portalStats: {
      total: portalDetails.length,
      connected: portalDetails.filter(p => p.edges > 0).length,
      details: portalDetails
    }
  };
}
