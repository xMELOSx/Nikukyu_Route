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



export function findBypassingPath(
  start: PathNode, end: PathNode,
  walls: { [key: string]: [Point, Point][] },
  markers: any[],
  hiddenIds?: Set<string>,
  hiddenTypes?: Set<string>,
  guidePoints?: Point[]
): PathfindingResult {
  const distPointSeg = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
    const ex = bx - ax, ey = by - ay;
    const l2 = ex * ex + ey * ey;
    if (l2 === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * ex + (py - ay) * ey) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * ex), py - (ay + t * ey));
  };

  const getDistanceToGuide = (p: Point): number => {
    if (!guidePoints || guidePoints.length < 2) return 0;
    let minDist = Infinity;
    for (let i = 0; i < guidePoints.length - 1; i++) {
      const d = distPointSeg(p.x, p.y, guidePoints[i].x, guidePoints[i].y, guidePoints[i + 1].x, guidePoints[i + 1].y);
      if (d < minDist) minDist = d;
    }
    return minDist;
  };

  const nodes: PathNode[] = [start, end];
  const activeFloors = new Set<string>([start.floor, end.floor]);
  Object.keys(walls).forEach(fl => activeFloors.add(fl));
  markers.forEach(m => { if (m.floor) activeFloors.add(m.floor); });

  // -------------------------------------------------------------
  // Fast Spatial Hash for Wall collision checks
  // Divide map into 100x100 cells. For any bounding box of a segment or point,
  // query only the walls overlapping that cell bucket.
  // -------------------------------------------------------------
  const CELL_SIZE = 100;
  const spatialGrid = new Map<string, [Point, Point][]>();

  const getCellKeysForSegment = (p1: Point, p2: Point) => {
    const keys = new Set<string>();
    const minX = Math.floor(Math.min(p1.x, p2.x) / CELL_SIZE);
    const maxX = Math.floor(Math.max(p1.x, p2.x) / CELL_SIZE);
    const minY = Math.floor(Math.min(p1.y, p2.y) / CELL_SIZE);
    const maxY = Math.floor(Math.max(p1.y, p2.y) / CELL_SIZE);

    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        keys.add(`${cx},${cy}`);
      }
    }
    return Array.from(keys);
  };


  // Build spatial grid for walls on all floors
  Object.keys(walls).forEach(fl => {
    const flWalls = walls[fl] || [];
    flWalls.forEach(w => {
      const keys = getCellKeysForSegment(w[0], w[1]);
      keys.forEach(key => {
        const fullKey = `${fl}:${key}`;
        if (!spatialGrid.has(fullKey)) spatialGrid.set(fullKey, []);
        spatialGrid.get(fullKey)!.push(w);
      });
    });
  });

  const getNearbyWallsForPoint = (fl: string, x: number, y: number, radius: number = 20): [Point, Point][] => {
    const list: [Point, Point][] = [];
    const minCx = Math.floor((x - radius) / CELL_SIZE);
    const maxCx = Math.floor((x + radius) / CELL_SIZE);
    const minCy = Math.floor((y - radius) / CELL_SIZE);
    const maxCy = Math.floor((y + radius) / CELL_SIZE);

    const seen = new Set<[Point, Point]>();
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const bucket = spatialGrid.get(`${fl}:${cx},${cy}`);
        if (bucket) {
          bucket.forEach(w => {
            if (!seen.has(w)) {
              seen.add(w);
              list.push(w);
            }
          });
        }
      }
    }
    return list;
  };

  const getNearbyWallsForSegment = (fl: string, p1: Point, p2: Point): [Point, Point][] => {
    const keys = getCellKeysForSegment(p1, p2);
    const list: [Point, Point][] = [];
    const seen = new Set<[Point, Point]>();
    keys.forEach(key => {
      const bucket = spatialGrid.get(`${fl}:${key}`);
      if (bucket) {
        bucket.forEach(w => {
          if (!seen.has(w)) {
            seen.add(w);
            list.push(w);
          }
        });
      }
    });
    return list;
  };

  const hitsAnyWallOptimized = (a: Point, b: Point, floor: string, thickness: number = 4.0): boolean => {
    const nearby = getNearbyWallsForSegment(floor, a, b);
    for (const w of nearby) {
      if (isIntersecting(a, b, w[0], w[1], thickness)) return true;
    }
    return false;
  };

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
        // Query nearby walls in spatial hash grid (radius 20 to comfortably cover segment check range)
        const pt = { x, y };
        const nearby = getNearbyWallsForPoint(fl, pt.x, pt.y, 2);
        let touches = false;
        for (const w of nearby) {
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
        if (!hitsAnyWallOptimized(ni, nj, ni.floor, 0.1)) {
          const d = Math.hypot(ni.x - nj.x, ni.y - nj.y);
          adj.get(i)!.push({ to: j, cost: d, isTeleport: false });
          adj.get(j)!.push({ to: i, cost: d, isTeleport: false });
        }
      }
    });

    // 2. Portal connections (Connect portals to grid. If the portal is hidden, do NOT allow physical entry from grid)
    if (ni.isPortal) {
      // Check if this portal has any valid pairing in markers
      const hasPartner = markers.some((x: any) =>
        x.id !== ni.markerId && (
          (ni.linkedMarkerId && x.id === ni.linkedMarkerId) ||
          (x.linkedWarpId && x.linkedWarpId === ni.markerId)
        )
      );

      // Check if the portal itself is hidden in the current user settings
      const isPortalHidden = ni.markerId ? (
        (hiddenIds && hiddenIds.has(ni.markerId)) || 
        (hiddenTypes && ni.markerId && markers.some((m: any) => m.id === ni.markerId && hiddenTypes.has(m.type)))
      ) : false;

      if (hasPartner) {
        for (let j = 0; j < uniqueNodes.length; j++) {
          if (i === j) continue;
          const nj = uniqueNodes[j];
          if (ni.floor !== nj.floor) continue;
          const d = Math.hypot(ni.x - nj.x, ni.y - nj.y);
          if (d < 40) {
            if (!hitsAnyWallOptimized(ni, nj, ni.floor, 0.1)) {
              // If the portal is hidden, we only allow leaving it (ni -> nj), NOT entering it (nj -> ni)
              if (isPortalHidden) {
                adj.get(i)!.push({ to: j, cost: d, isTeleport: false });
              } else {
                // Normal bidirectional physical connection for visible portals
                adj.get(i)!.push({ to: j, cost: d, isTeleport: false });
                adj.get(j)!.push({ to: i, cost: d, isTeleport: false });
              }
            }
          }
        }
      }
    }
    // 3. Start/End Node connections (Allow start/end to connect to regular grid nodes or portal nodes within 40px radius to snap to grid)
    if (i === 0 || i === 1) {
      for (let j = 0; j < uniqueNodes.length; j++) {
        if (i === j) continue;
        const nj = uniqueNodes[j];
        
        // Portal snapping constraints
        if (nj.isPortal) {
          const isTargetPortalHidden = nj.markerId ? (
            (hiddenIds && hiddenIds.has(nj.markerId)) || 
            (hiddenTypes && nj.markerId && markers.some((m: any) => m.id === nj.markerId && hiddenTypes.has(m.type)))
          ) : false;
          
          if (isTargetPortalHidden) {
            // For hidden portals:
            // - Start node (i === 0) cannot snap TO it (cannot enter/start from a hidden portal)
            // - End node (i === 1) CAN receive a connection FROM it (hidden portal -> end node is allowed as it exits the warp to reach target)
            if (i === 0) {
              continue;
            }
          }
        }

        if (ni.floor !== nj.floor) continue;
        const d = Math.hypot(ni.x - nj.x, ni.y - nj.y);
        if (d < 40) {
          if (!hitsAnyWallOptimized(ni, nj, ni.floor, 0.1)) {
            if (nj.isPortal && i === 1) {
              // One-way edge: only allow hidden portal -> end node (nj -> ni)
              adj.get(j)!.push({ to: i, cost: d, isTeleport: false });
            } else {
              // Bidirectional connection for standard snapping
              adj.get(i)!.push({ to: j, cost: d, isTeleport: false });
              adj.get(j)!.push({ to: i, cost: d, isTeleport: false });
            }
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
      // Teleport cost is set to a minimal value (1) so that portals are heavily preferred shortcuts
      adj.get(idxA)!.push({ to: idxB, cost: 1, isTeleport: true });
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

  // Dijkstra search with state expansion (idx, wasTeleport) to block consecutive teleports!
  // State representation: nodeIdx * 2 + (wasTeleport ? 1 : 0)
  const numStates = uniqueNodes.length * 2;
  const dist = new Array(numStates).fill(Infinity);
  const parentState = new Array(numStates).fill(-1);
  dist[0] = 0; // Start node (index 0, wasTeleport=0)

  // Simple binary heap/sorted queue implementation for high performance
  const queue: { stateIdx: number; f: number }[] = [{ stateIdx: 0, f: 0 }];

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
      
      // Calculate basic distance cost
      let stepCost = edge.cost;
      
      // If guidePoints are provided, add a penalty based on distance to the hand-drawn guide line.
      // We skip the penalty on active teleports, as teleporting crosses rooms.
      if (guidePoints && guidePoints.length >= 2 && !edge.isTeleport) {
        const targetNode = uniqueNodes[edge.to];
        const distToGuide = getDistanceToGuide(targetNode);
        stepCost += distToGuide * 12.0; // Strong penalty factor to tightly bind path to the user's line
      }

      const nd = dist[stateIdx] + stepCost;

      if (nd < dist[nextState]) {
        dist[nextState] = nd;
        parentState[nextState] = stateIdx;
        // Use h = 0 to execute Dijkstra search, guaranteeing mathematically shortest paths
        const f = nd;

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
