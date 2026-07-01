import { type Point } from './DataManager';

export interface PathNode {
  x: number;
  y: number;
  floor: string;
  isPortal?: boolean;
  isPassage?: boolean;
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
  const distPointSeg = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
    const ex = bx - ax, ey = by - ay;
    const l2 = ex * ex + ey * ey;
    if (l2 === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * ex + (py - ay) * ey) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * ex), py - (ay + t * ey));
  };

  const nodes: PathNode[] = [start, end];
  const activeFloors = new Set<string>([start.floor, end.floor]);
  Object.keys(walls).forEach(fl => activeFloors.add(fl));
  markers.forEach(m => { if (m.floor) activeFloors.add(m.floor); });

  // Generate grid nodes on the floors to guarantee topological connectivity
  activeFloors.forEach(fl => {
    // Determine bounds from walls and markers
    const flWalls = walls[fl] || [];
    let minX = start.x, maxX = start.x, minY = start.y, maxY = start.y;
    flWalls.forEach(w => {
      minX = Math.min(minX, w[0].x, w[1].x);
      maxX = Math.max(maxX, w[0].x, w[1].x);
      minY = Math.min(minY, w[0].y, w[1].y);
      maxY = Math.max(maxY, w[0].y, w[1].y);
    });
    // Add margin
    minX -= 40; maxX += 40;
    minY -= 40; maxY += 40;

    // Grid spacing (dense enough to capture small 10px gaps, but thin enough to compute fast)
    const step = 18;
    for (let x = Math.floor(minX / step) * step; x <= maxX; x += step) {
      for (let y = Math.floor(minY / step) * step; y <= maxY; y += step) {
        // Only keep if it does not touch any wall within 1px thickness
        const pt = { x, y };
        let touches = false;
        for (const w of flWalls) {
          if (distPointSeg(pt.x, pt.y, w[0].x, w[0].y, w[1].x, w[1].y) < 1.0) {
            touches = true;
            break;
          }
        }
        if (!touches) {
          nodes.push({ x, y, floor: fl });
        }
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

  // Deduplicate nodes: always prefer portal nodes (which carry markerId metadata) over grid nodes
  const uniqueNodes: PathNode[] = [];
  const visited = new Map<string, PathNode>();
  
  nodes.forEach(n => {
    const key = `${n.floor}:${Math.round(n.x)},${Math.round(n.y)}`;
    const existing = visited.get(key);
    if (!existing) {
      visited.set(key, n);
      uniqueNodes.push(n);
    } else {
      // Robustly preserve portal metadata: if either the existing node or new node is a portal,
      // propagate all portal properties onto the preserved uniqueNode.
      if (n.isPortal) {
        existing.isPortal = true;
        if (n.portalName) existing.portalName = n.portalName;
        if (n.markerId) existing.markerId = n.markerId;
        if (n.linkedMarkerId) existing.linkedMarkerId = n.linkedMarkerId;
      }
    }
  });

  // Build adjacency
  const adj = new Map<number, { to: number; cost: number; isTeleport: boolean }[]>();
  for (let i = 0; i < uniqueNodes.length; i++) adj.set(i, []);

  // Spatial hashing or Grid-neighbor optimization:
  // Map coordinates to node indices to find adjacent nodes in O(1) instead of O(N^2)
  const coordMap = new Map<string, number>();
  uniqueNodes.forEach((n, idx) => {
    // Map both exact coordinates and integer rounded coordinates to catch all neighboring nodes
    coordMap.set(`${n.floor}:${Math.round(n.x)},${Math.round(n.y)}`, idx);
  });

  // Connect neighbors. For each node, check surrounding offsets
  // (covering grid step of 18 and diagonal step of ~25.5)
  const searchOffsets: { dx: number; dy: number }[] = [];
  const GRID_STEP = 18;
  for (let dx = -GRID_STEP; dx <= GRID_STEP; dx += GRID_STEP) {
    for (let dy = -GRID_STEP; dy <= GRID_STEP; dy += GRID_STEP) {
      if (dx === 0 && dy === 0) continue;
      searchOffsets.push({ dx, dy });
    }
  }



  for (let i = 0; i < uniqueNodes.length; i++) {
    const ni = uniqueNodes[i];

    // 1. Grid neighbor connections (Local)
    searchOffsets.forEach(off => {
      const tx = Math.round(ni.x + off.dx);
      const ty = Math.round(ni.y + off.dy);
      const key = `${ni.floor}:${tx},${ty}`;
      const j = coordMap.get(key);
      if (j !== undefined && j > i) {
        const nj = uniqueNodes[j];
        if (!hitsAnyWall(ni, nj, ni.floor, walls, 0.1)) {
          const d = Math.hypot(ni.x - nj.x, ni.y - nj.y);
          adj.get(i)!.push({ to: j, cost: d, isTeleport: false });
          adj.get(j)!.push({ to: i, cost: d, isTeleport: false });
        }
      }
    });

    // 2. Portal connections (Only connect portals to grid if they have a valid partner linked)
    if (ni.isPortal) {
      // Check if this portal has any valid pairing in markers
      const hasPartner = markers.some((x: any) =>
        x.id !== ni.markerId && (
          (ni.linkedMarkerId && x.id === ni.linkedMarkerId) ||
          (x.linkedWarpId && x.linkedWarpId === ni.markerId)
        )
      );

      if (hasPartner) {
        for (let j = 0; j < uniqueNodes.length; j++) {
          if (i === j) continue;
          const nj = uniqueNodes[j];
          if (ni.floor !== nj.floor) continue;
          const d = Math.hypot(ni.x - nj.x, ni.y - nj.y);
          if (d < 40) {
            if (!hitsAnyWall(ni, nj, ni.floor, walls, 0.1)) {
              adj.get(i)!.push({ to: j, cost: d, isTeleport: false });
              adj.get(j)!.push({ to: i, cost: d, isTeleport: false });
            }
          }
        }
      }
    }
    // 3. Start/End Node connections (Allow start/end to connect to any node within 40px radius to snap to grid)
    if (i === 0 || i === 1) {
      for (let j = 0; j < uniqueNodes.length; j++) {
        if (i === j) continue;
        const nj = uniqueNodes[j];
        if (ni.floor !== nj.floor) continue;
        const d = Math.hypot(ni.x - nj.x, ni.y - nj.y);
        if (d < 40) {
          if (!hitsAnyWall(ni, nj, ni.floor, walls, 0.1)) {
            adj.get(i)!.push({ to: j, cost: d, isTeleport: false });
            adj.get(j)!.push({ to: i, cost: d, isTeleport: false });
          }
        }
      }
    }
  }

  // Teleport edges (linked portal pairs) - strictly directed based on linkedWarpId!
  markers.forEach(m => {
    if (!(m.type === 'warp' || m.type === 'iwarp' || m.type === 'stairs')) return;
    if (!m.linkedWarpId) return;

    const partner = markers.find((x: any) => x.id === m.linkedWarpId);
    if (!partner) return;

    const idxA = uniqueNodes.findIndex(n => n.markerId === m.id);
    const idxB = uniqueNodes.findIndex(n => n.markerId === partner.id);
    if (idxA >= 0 && idxB >= 0) {
      // Connect strictly A -> B (directed edge)
      adj.get(idxA)!.push({ to: idxB, cost: TELEPORT_COST, isTeleport: true });
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

  // A* search with state expansion (idx, wasTeleport) to block consecutive teleports!
  // State representation: nodeIdx * 2 + (wasTeleport ? 1 : 0)
  const numStates = uniqueNodes.length * 2;
  const dist = new Array(numStates).fill(Infinity);
  const parentState = new Array(numStates).fill(-1);
  dist[0] = 0; // Start node (index 0, wasTeleport=0)

  // Simple binary heap/sorted queue implementation for high performance
  const queue: { stateIdx: number; f: number }[] = [{ stateIdx: 0, f: Math.hypot(start.x - end.x, start.y - end.y) }];

  const insertQueue = (item: { stateIdx: number; f: number }) => {
    let low = 0, high = queue.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (queue[mid].f < item.f) low = mid + 1;
      else high = mid;
    }
    queue.splice(low, 0, item);
  };

  while (queue.length > 0) {
    const { stateIdx } = queue.shift()!;
    const curIdx = stateIdx >> 1;
    const curWasTeleport = (stateIdx & 1) === 1;

    // Target reached (End node index 1, regardless of how we reached it)
    if (curIdx === 1) {
      // Reconstruct path states
      const pathStates: number[] = [];
      let cur = stateIdx;
      while (cur !== -1) {
        pathStates.push(cur);
        cur = parentState[cur];
      }
      pathStates.reverse();

      const path = pathStates.map(st => uniqueNodes[st >> 1]);
      const teleportIndices: number[] = [];
      for (let i = 1; i < pathStates.length; i++) {
        const prevWasTeleport = (pathStates[i - 1] & 1) === 1;
        const curWasTeleport = (pathStates[i] & 1) === 1;
        // If cur state is teleport and prev state is not teleport, this transition path[i-1] -> path[i] is a teleport
        // Wait, the transition itself sets wasTeleport=1 for the destination node
        if (curWasTeleport && !prevWasTeleport) {
          teleportIndices.push(i - 1);
        }
      }

      console.log('[PathFinder] Directed Path found:', path.map((n, i) => ({
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

    const edges = adj.get(curIdx) || [];
    for (const edge of edges) {
      // Rule: Do not allow back-to-back teleports!
      if (curWasTeleport && edge.isTeleport) continue;

      const nextWasTeleport = edge.isTeleport ? 1 : 0;
      const nextState = (edge.to << 1) + nextWasTeleport;
      const nd = dist[stateIdx] + edge.cost;

      if (nd < dist[nextState]) {
        dist[nextState] = nd;
        parentState[nextState] = stateIdx;
        const tn = uniqueNodes[edge.to];
        const h = tn.floor === end.floor ? Math.hypot(tn.x - end.x, tn.y - end.y) : 0;
        const f = nd + h;

        // Fast queue update
        const qi = queue.findIndex(q => q.stateIdx === nextState);
        if (qi >= 0) {
          queue.splice(qi, 1);
        }
        insertQueue({ stateIdx: nextState, f });
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
