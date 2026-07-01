import { type Point } from './DataManager';

export interface PathNode {
  x: number;
  y: number;
  floor: string;
  isPortal?: boolean; // warp or stairs marker
  portalName?: string;
  markerId?: string;  // marker ID for portal nodes
  linkedMarkerId?: string; // linked partner's marker ID
}

export interface PathfindingResult {
  path: PathNode[] | null;
  portalStats: {
    total: number;
    connected: number;
    details: { name: string; floor: string; edges: number }[];
  };
}

// Calculate minimum distance between segment AB and segment CD to allow thickness-based collision
export function getSegmentsMinDistance(a: Point, b: Point, c: Point, d: Point): number {
  const ccw = (p1: Point, p2: Point, p3: Point) => {
    return (p3.y - p1.y) * (p2.x - p1.x) > (p2.y - p1.y) * (p3.x - p1.x);
  };

  // Check if they geometrically intersect
  const intersects = ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
  if (intersects) return 0;

  const getDistanceToSegment = (p: Point, s1: Point, s2: Point): number => {
    const abx = s2.x - s1.x;
    const aby = s2.y - s1.y;
    const l2 = abx * abx + aby * aby;
    if (l2 === 0) return Math.hypot(p.x - s1.x, p.y - s1.y);
    let t = ((p.x - s1.x) * abx + (p.y - s1.y) * aby) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (s1.x + t * abx), p.y - (s1.y + t * aby));
  };

  return Math.min(
    getDistanceToSegment(a, c, d),
    getDistanceToSegment(b, c, d),
    getDistanceToSegment(c, a, b),
    getDistanceToSegment(d, a, b)
  );
}

// Check if segment AB intersects segment CD
export function isIntersecting(a: Point, b: Point, c: Point, d: Point, thickness: number = 4.0): boolean {
  const eq = (p1: Point, p2: Point) => Math.abs(p1.x - p2.x) < 1.0 && Math.abs(p1.y - p2.y) < 1.0;
  if (eq(a, c) || eq(a, d) || eq(b, c) || eq(b, d)) return false;

  return getSegmentsMinDistance(a, b, c, d) < thickness;
}

// Check if segment AB intersects any walls in the given floor
function hitsAnyWall(a: Point, b: Point, floor: string, walls: { [key: string]: [Point, Point][] }, thickness: number = 4.0): boolean {
  const floorWalls = walls[floor] || [];
  for (const w of floorWalls) {
    if (isIntersecting(a, b, w[0], w[1], thickness)) {
      return true;
    }
  }
  return false;
}

// Find path bypassing walls using A* with Visibility Graph
export function findBypassingPath(
  start: PathNode,
  end: PathNode,
  walls: { [key: string]: [Point, Point][] },
  markers: any[]
): PathfindingResult {
  const nodes: PathNode[] = [start, end];

  // Collect all existing floors to allow pathfinding through intermediate floors/levels (like basement or floor2)
  const activeFloors = new Set<string>([start.floor, end.floor]);
  Object.keys(walls).forEach(fl => activeFloors.add(fl));
  markers.forEach(m => {
    if (m.floor) activeFloors.add(m.floor);
  });

  const bypassOffsets = [
    { dx: -25, dy: -25 }, { dx: 25, dy: -25 },
    { dx: -25, dy: 25 }, { dx: 25, dy: 25 },
    { dx: 0, dy: -30 }, { dx: 0, dy: 30 },
    { dx: -30, dy: 0 }, { dx: 30, dy: 0 }
  ];

  activeFloors.forEach(fl => {
    const flWalls = walls[fl] || [];
    const filteredWalls = flWalls.filter(w => {
      const distToStart = Math.min(Math.hypot(w[0].x - start.x, w[0].y - start.y), Math.hypot(w[1].x - start.x, w[1].y - start.y));
      const distToEnd = Math.min(Math.hypot(w[0].x - end.x, w[0].y - end.y), Math.hypot(w[1].x - end.x, w[1].y - end.y));
      return start.floor !== end.floor || distToStart < 1500 || distToEnd < 1500;
    });

    const pts = new Set<string>();
    filteredWalls.forEach(w => {
      [w[0], w[1]].forEach(p => {
        const key = `${Math.round(p.x)},${Math.round(p.y)}`;
        if (pts.has(key)) return;
        pts.add(key);

        bypassOffsets.forEach(off => {
          const bp = { x: p.x + off.dx, y: p.y + off.dy };
          if (!hitsAnyWall(p, bp, fl, walls)) {
            nodes.push({ x: bp.x, y: bp.y, floor: fl });
          }
        });
      });
    });
  });

  // Keep track of portal index to diagnose connections
  const portalNodeIndices: number[] = [];
  markers.forEach(m => {
    if ((m.type === 'warp' || m.type === 'iwarp' || m.type === 'stairs') && m.floor) {
      const name = (m.note && m.note.trim()) ? m.note : (m.type === 'stairs' ? 'Stairs' : 'Warp') + '#' + m.id.substring(m.id.length - 4);
      nodes.push({ x: m.x, y: m.y, floor: m.floor, isPortal: true, portalName: name, markerId: m.id, linkedMarkerId: m.linkedWarpId });
      portalNodeIndices.push(nodes.length - 1);
    }
  });

  const uniqueNodes: PathNode[] = [];
  const visitedNodes = new Set<string>();
  nodes.forEach(n => {
    const key = `${n.floor}:${Math.round(n.x)},${Math.round(n.y)}`;
    if (!visitedNodes.has(key)) {
      visitedNodes.add(key);
      uniqueNodes.push(n);
    }
  });

  // Re-map portal indices in uniqueNodes
  const finalPortalIndices = uniqueNodes.map((n, idx) => n.isPortal ? idx : -1).filter(idx => idx !== -1);

  if (uniqueNodes.length > 200) {
    // Keep start, end, portals, and closest wall nodes
    const priorityNodes = uniqueNodes.filter((n, i) => i < 2 || n.isPortal);
    const wallNodes = uniqueNodes.filter((n, i) => i >= 2 && !n.isPortal);
    wallNodes.sort((a, b) => {
      const da = Math.min(Math.hypot(a.x - start.x, a.y - start.y), Math.hypot(a.x - end.x, a.y - end.y));
      const db = Math.min(Math.hypot(b.x - start.x, b.y - start.y), Math.hypot(b.x - end.x, b.y - end.y));
      return da - db;
    });
    uniqueNodes.length = 0;
    uniqueNodes.push(...priorityNodes, ...wallNodes.slice(0, 150));
  }

  const adj = new Map<number, { to: number; cost: number }[]>();
  for (let i = 0; i < uniqueNodes.length; i++) {
    adj.set(i, []);
  }

  for (let i = 0; i < uniqueNodes.length; i++) {
    const ni = uniqueNodes[i];
    for (let j = i + 1; j < uniqueNodes.length; j++) {
      const nj = uniqueNodes[j];
      if (ni.floor === nj.floor) {
        const thickness = (ni.isPortal || nj.isPortal) ? 1.0 : 4.0;
        if (!hitsAnyWall(ni, nj, ni.floor, walls, thickness)) {
          const dist = Math.hypot(ni.x - nj.x, ni.y - nj.y);
          adj.get(i)!.push({ to: j, cost: dist });
          adj.get(j)!.push({ to: i, cost: dist });
        }
      }
    }
  }

  markers.forEach(m => {
    if (m.type === 'warp' || m.type === 'iwarp' || m.type === 'stairs') {
      const partner = markers.find(x => 
        (m.linkedWarpId && x.id === m.linkedWarpId) || 
        (x.linkedWarpId && x.linkedWarpId === m.id)
      );
      if (partner) {
        const idxA = uniqueNodes.findIndex(n => n.floor === m.floor && Math.abs(n.x - m.x) < 25 && Math.abs(n.y - m.y) < 25);
        const idxB = uniqueNodes.findIndex(n => n.floor === partner.floor && Math.abs(n.x - partner.x) < 25 && Math.abs(n.y - partner.y) < 25);
        if (idxA >= 0 && idxB >= 0) {
          const transitionCost = 5;
          adj.get(idxA)!.push({ to: idxB, cost: transitionCost });
          adj.get(idxB)!.push({ to: idxA, cost: transitionCost });
        }
      }
    }
  });

  // Debug: log all portal edges for diagnosis
  console.log('[PathFinder] Portals in uniqueNodes:', uniqueNodes.filter(n => n.isPortal).map(n => ({
    name: n.portalName, floor: n.floor, x: Math.round(n.x), y: Math.round(n.y)
  })));
  console.log('[PathFinder] Portal marker links:', markers
    .filter(m => m.type === 'warp' || m.type === 'iwarp' || m.type === 'stairs')
    .map(m => ({ id: m.id.substring(m.id.length - 6), type: m.type, floor: m.floor, linkedWarpId: m.linkedWarpId?.substring(m.linkedWarpId.length - 6) || 'NONE', x: Math.round(m.x), y: Math.round(m.y) }))
  );

  // Calculate diagnostic portal connection stats
  const portalDetails = finalPortalIndices.map(idx => {
    const node = uniqueNodes[idx];
    const edges = adj.get(idx) || [];
    // Only count physical edges to same floor (excluding portal teleport link)
    const physicalEdges = edges.filter(e => uniqueNodes[e.to].floor === node.floor).length;
    return {
      name: node.portalName || 'Portal',
      floor: node.floor,
      edges: physicalEdges
    };
  });

  const connectedPortals = portalDetails.filter(p => p.edges > 0).length;

  const startIndex = 0;
  const endIndex = 1;

  const dist = new Array(uniqueNodes.length).fill(Infinity);
  const parent = new Array(uniqueNodes.length).fill(-1);
  dist[startIndex] = 0;

  const queue: { idx: number; fScore: number }[] = [{ idx: startIndex, fScore: Math.hypot(start.x - end.x, start.y - end.y) }];

  while (queue.length > 0) {
    queue.sort((a, b) => a.fScore - b.fScore);
    const { idx } = queue.shift()!;

    if (idx === endIndex) {
      const path: PathNode[] = [];
      let cur = endIndex;
      while (cur !== -1) {
        path.push(uniqueNodes[cur]);
        cur = parent[cur];
      }
      return {
        path: path.reverse(),
        portalStats: {
          total: portalDetails.length,
          connected: connectedPortals,
          details: portalDetails
        }
      };
    }

    const neighbors = adj.get(idx) || [];
    for (const edge of neighbors) {
      const nextDist = dist[idx] + edge.cost;
      if (nextDist < dist[edge.to]) {
        dist[edge.to] = nextDist;
        parent[edge.to] = idx;
        const targetNode = uniqueNodes[edge.to];
        const h = targetNode.floor === end.floor ? Math.hypot(targetNode.x - end.x, targetNode.y - end.y) : 0;
        const fScore = nextDist + h;

        const qIdx = queue.findIndex(q => q.idx === edge.to);
        if (qIdx >= 0) {
          queue[qIdx].fScore = fScore;
        } else {
          queue.push({ idx: edge.to, fScore });
        }
      }
    }
  }

  return {
    path: null,
    portalStats: {
      total: portalDetails.length,
      connected: connectedPortals,
      details: portalDetails
    }
  };
}
