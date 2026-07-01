import { type Point } from './DataManager';

export interface PathNode {
  x: number;
  y: number;
  floor: string;
}

// Check if segment AB intersects segment CD
export function isIntersecting(a: Point, b: Point, c: Point, d: Point): boolean {
  const ccw = (p1: Point, p2: Point, p3: Point) => {
    return (p3.y - p1.y) * (p2.x - p1.x) > (p2.y - p1.y) * (p3.x - p1.x);
  };
  // Check if they share end points - share endpoints shouldn't block visibility
  const eq = (p1: Point, p2: Point) => Math.abs(p1.x - p2.x) < 0.1 && Math.abs(p1.y - p2.y) < 0.1;
  if (eq(a, c) || eq(a, d) || eq(b, c) || eq(b, d)) return false;

  return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
}

// Check if segment AB intersects any walls in the given floor
function hitsAnyWall(a: Point, b: Point, floor: string, walls: { [key: string]: [Point, Point][] }): boolean {
  const floorWalls = walls[floor] || [];
  for (const w of floorWalls) {
    if (isIntersecting(a, b, w[0], w[1])) {
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
): PathNode[] | null {
  // 1. Gather all nodes
  const nodes: PathNode[] = [start, end];

  // Map floor keys
  const activeFloors = new Set([start.floor, end.floor]);
  markers.forEach(m => {
    if (m.floor) activeFloors.add(m.floor);
  });

  // Extract wall end points and create offset bypass nodes
  // To avoid huge complexity, filter walls close to start/end or limit count (e.g. max 150 nodes)
  const bypassOffsets = [
    { dx: -15, dy: -15 }, { dx: 15, dy: -15 },
    { dx: -15, dy: 15 }, { dx: 15, dy: 15 },
    { dx: 0, dy: -20 }, { dx: 0, dy: 20 },
    { dx: -20, dy: 0 }, { dx: 20, dy: 0 }
  ];

  activeFloors.forEach(fl => {
    const flWalls = walls[fl] || [];
    // If too many walls, filter by proximity to speed up
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

        // Generate bypass nodes around corner points
        bypassOffsets.forEach(off => {
          const bp = { x: p.x + off.dx, y: p.y + off.dy };
          // Ensure bypass point doesn't hit walls immediately
          if (!hitsAnyWall(p, bp, fl, walls)) {
            nodes.push({ x: bp.x, y: bp.y, floor: fl });
          }
        });
      });
    });
  });

  // Add warp & stairs markers as connection nodes
  markers.forEach(m => {
    if ((m.type === 'warp' || m.type === 'iwarp' || m.type === 'stairs') && m.floor) {
      nodes.push({ x: m.x, y: m.y, floor: m.floor });
    }
  });

  // Remove duplicate nodes
  const uniqueNodes: PathNode[] = [];
  const visitedNodes = new Set<string>();
  nodes.forEach(n => {
    const key = `${n.floor}:${Math.round(n.x)},${Math.round(n.y)}`;
    if (!visitedNodes.has(key)) {
      visitedNodes.add(key);
      uniqueNodes.push(n);
    }
  });

  // Limit node count to prevent crash/hang
  if (uniqueNodes.length > 200) {
    // Keep start, end, markers, and closest wall nodes
    const priorityNodes = uniqueNodes.filter((_, i) => i < 2 || i >= uniqueNodes.length - markers.length);
    const wallNodes = uniqueNodes.slice(2, uniqueNodes.length - markers.length);
    wallNodes.sort((a, b) => {
      const da = Math.min(Math.hypot(a.x - start.x, a.y - start.y), Math.hypot(a.x - end.x, a.y - end.y));
      const db = Math.min(Math.hypot(b.x - start.x, b.y - start.y), Math.hypot(b.x - end.x, b.y - end.y));
      return da - db;
    });
    uniqueNodes.length = 0;
    uniqueNodes.push(...priorityNodes, ...wallNodes.slice(0, 150));
  }

  // 2. Build Adjacency List for Visibility Graph
  const adj = new Map<number, { to: number; cost: number }[]>();
  for (let i = 0; i < uniqueNodes.length; i++) {
    adj.set(i, []);
  }

  // Check visibility for every node pair on the SAME floor
  for (let i = 0; i < uniqueNodes.length; i++) {
    const ni = uniqueNodes[i];
    for (let j = i + 1; j < uniqueNodes.length; j++) {
      const nj = uniqueNodes[j];
      if (ni.floor === nj.floor) {
        if (!hitsAnyWall(ni, nj, ni.floor, walls)) {
          const dist = Math.hypot(ni.x - nj.x, ni.y - nj.y);
          adj.get(i)!.push({ to: j, cost: dist });
          adj.get(j)!.push({ to: i, cost: dist });
        }
      }
    }
  }

  // Connect warp and stairs link edges (Teleport across floors/same floor links)
  markers.forEach(m => {
    if ((m.type === 'warp' || m.type === 'iwarp' || m.type === 'stairs') && m.linkedWarpId) {
      const partner = markers.find(x => x.id === m.linkedWarpId);
      if (partner) {
        // Find indices in uniqueNodes
        const idxA = uniqueNodes.findIndex(n => n.floor === m.floor && Math.abs(n.x - m.x) < 5 && Math.abs(n.y - m.y) < 5);
        const idxB = uniqueNodes.findIndex(n => n.floor === partner.floor && Math.abs(n.x - partner.x) < 5 && Math.abs(n.y - partner.y) < 5);
        if (idxA >= 0 && idxB >= 0) {
          // Connect with tiny cost (e.g. 5px virtual length representing transition)
          const transitionCost = 5;
          adj.get(idxA)!.push({ to: idxB, cost: transitionCost });
          adj.get(idxB)!.push({ to: idxA, cost: transitionCost });
        }
      }
    }
  });

  // 3. A* Search
  const startIndex = 0;
  const endIndex = 1;

  const dist = new Array(uniqueNodes.length).fill(Infinity);
  const parent = new Array(uniqueNodes.length).fill(-1);
  dist[startIndex] = 0;

  // Min-heap simulation queue
  const queue: { idx: number; fScore: number }[] = [{ idx: startIndex, fScore: Math.hypot(start.x - end.x, start.y - end.y) }];

  while (queue.length > 0) {
    // Sort to get node with lowest fScore
    queue.sort((a, b) => a.fScore - b.fScore);
    const { idx } = queue.shift()!;

    if (idx === endIndex) {
      // Reconstruct path
      const path: PathNode[] = [];
      let cur = endIndex;
      while (cur !== -1) {
        path.push(uniqueNodes[cur]);
        cur = parent[cur];
      }
      return path.reverse();
    }

    const neighbors = adj.get(idx) || [];
    for (const edge of neighbors) {
      const nextDist = dist[idx] + edge.cost;
      if (nextDist < dist[edge.to]) {
        dist[edge.to] = nextDist;
        parent[edge.to] = idx;
        const targetNode = uniqueNodes[edge.to];
        // Heuristic: Euclidean distance to end node (only on same floor, otherwise 0 heuristic)
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

  return null; // No path found
}
