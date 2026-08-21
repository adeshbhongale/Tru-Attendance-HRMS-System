const cardWidth = 185;
const siblingGap = 35; // Gap between sibling subtrees
const levelRowGap = 180; // Vertical spacing between corporate level rows (180px gives generous clearance for OrgEdge bus lines)

/**
 * Calculates top-down level-wise coordinates for React Flow nodes using a
 * Recursive Centered Tree Layout Engine (SAP/Oracle/Microsoft enterprise org chart standard).
 *
 * Key guarantees:
 * 1. Every parent is placed at the exact mathematical midpoint of its direct children.
 * 2. Independent subtrees are positioned compactly without massive horizontal stretching.
 * 3. Every node stays locked to its corporate Level Y row (Y = (lvl - 1) * 180).
 */
export const getLayoutedElements = (nodes, edges, direction = 'TB') => {
  if (!nodes || nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const nodesMap = {};
  nodes.forEach((n) => {
    nodesMap[n.id] = n;
  });

  // Build parent-child relationships from edges
  const parentToChildren = {};
  const childToParent = {};
  const nodeIdsInEdges = new Set();

  edges.forEach((edge) => {
    const { source, target } = edge;
    nodeIdsInEdges.add(source);
    nodeIdsInEdges.add(target);

    if (!parentToChildren[source]) {
      parentToChildren[source] = [];
    }
    parentToChildren[source].push(target);
    childToParent[target] = source;
  });

  // Sort children by department first (so same department subordinates stay near each other), then by level number and name
  Object.keys(parentToChildren).forEach((parentId) => {
    parentToChildren[parentId].sort((aId, bId) => {
      const nodeA = nodesMap[aId];
      const nodeB = nodesMap[bId];
      const deptA = nodeA?.data?.department || '';
      const deptB = nodeB?.data?.department || '';
      if (deptA !== deptB) return deptA.localeCompare(deptB);
      const lvlA = Number(nodeA?.data?.levelNumber || 99);
      const lvlB = Number(nodeB?.data?.levelNumber || 99);
      if (lvlA !== lvlB) return lvlA - lvlB;
      return (nodeA?.data?.name || '').localeCompare(nodeB?.data?.name || '');
    });
  });

  // Find root nodes (nodes with no parent in the dataset)
  const rootIds = nodes
    .filter((n) => !childToParent[n.id])
    .map((n) => n.id);

  // If no explicit roots found (cycles or disconnected graph), use top-level nodes as roots
  if (rootIds.length === 0 && nodes.length > 0) {
    const minLvl = Math.min(...nodes.map((n) => Number(n.data?.levelNumber || 1)));
    nodes.filter((n) => Number(n.data?.levelNumber || 1) === minLvl).forEach((n) => rootIds.push(n.id));
  }

  // Position map holding absolute X positions
  const xPositions = {};

  /**
   * Recursively computes subtree relative positions & width bottom-up.
   * Returns { width, centerOffset, positions: { nodeId: relativeX } }
   */
  const layoutSubtree = (nodeId, visited = new Set()) => {
    if (visited.has(nodeId)) {
      return { width: cardWidth, centerOffset: cardWidth / 2, positions: { [nodeId]: 0 } };
    }
    visited.add(nodeId);

    const children = parentToChildren[nodeId] || [];

    // Leaf Node: simple card width
    if (children.length === 0) {
      return {
        width: cardWidth,
        centerOffset: cardWidth / 2,
        positions: { [nodeId]: 0 }
      };
    }

    // Node with Children: layout children side-by-side
    let currentX = 0;
    const childLayouts = [];
    const subtreePositions = {};

    children.forEach((childId) => {
      const childLayout = layoutSubtree(childId, new Set(visited));
      childLayouts.push({ childId, ...childLayout });
    });

    const childCenters = [];

    childLayouts.forEach(({ childId, width, centerOffset, positions }, idx) => {
      const childSubtreeStartX = currentX;
      const childNodeX = childSubtreeStartX + centerOffset;
      childCenters.push(childNodeX);

      // Merge child's subtree relative positions
      Object.keys(positions).forEach((id) => {
        subtreePositions[id] = childSubtreeStartX + positions[id];
      });

      currentX += width + siblingGap;
    });

    const totalChildrenWidth = currentX - siblingGap;

    // Parent positioning:
    // If odd number of children: center parent over the exact middle child
    // If even number of children: center parent at midpoint of first and last child center
    let parentX;
    const nChildren = children.length;
    if (nChildren % 2 === 1) {
      const midIdx = Math.floor(nChildren / 2);
      parentX = childCenters[midIdx];
    } else {
      const firstChildCenter = childCenters[0];
      const lastChildCenter = childCenters[nChildren - 1];
      parentX = (firstChildCenter + lastChildCenter) / 2;
    }

    // Calculate left & right boundaries of the combined subtree
    let minX = Math.min(0, parentX - cardWidth / 2);
    let maxX = Math.max(totalChildrenWidth, parentX + cardWidth / 2);

    // Shift positions so minX starts at 0
    const shift = -minX;
    parentX += shift;
    subtreePositions[nodeId] = parentX - cardWidth / 2; // Stores top-left X of parent

    Object.keys(subtreePositions).forEach((id) => {
      if (id !== nodeId) {
        subtreePositions[id] += shift;
      }
    });

    const totalWidth = maxX - minX;

    return {
      width: totalWidth,
      centerOffset: parentX,
      positions: subtreePositions
    };
  };

  // Lay out each root subtree side-by-side
  let globalX = 0;
  rootIds.forEach((rootId) => {
    const rootLayout = layoutSubtree(rootId);
    Object.keys(rootLayout.positions).forEach((id) => {
      xPositions[id] = globalX + rootLayout.positions[id];
    });
    globalX += rootLayout.width + siblingGap * 2;
  });

  // Handle any orphan nodes not connected to roots
  nodes.forEach((n) => {
    if (xPositions[n.id] === undefined) {
      xPositions[n.id] = globalX;
      globalX += cardWidth + siblingGap;
    }
  });

  // Level-row overlap resolution (prevents any subtrees from overlapping on the same row)
  const minCardSpacing = cardWidth + 30; // 215px minimum center-to-center distance
  const nodesByLevel = {};

  nodes.forEach((n) => {
    const rawLvl = Number(n.data?.levelNumber || 1);
    const lvl = rawLvl >= 1 ? rawLvl : 1;
    if (!nodesByLevel[lvl]) nodesByLevel[lvl] = [];
    nodesByLevel[lvl].push(n);
  });

  // Post-process to adjust overlaps on each level row
  Object.keys(nodesByLevel).forEach((lvl) => {
    const rowNodes = nodesByLevel[lvl];
    rowNodes.sort((a, b) => (xPositions[a.id] || 0) - (xPositions[b.id] || 0));

    for (let i = 1; i < rowNodes.length; i++) {
      const prevId = rowNodes[i - 1].id;
      const currId = rowNodes[i].id;
      const prevX = xPositions[prevId];
      const currX = xPositions[currId];

      if (currX < prevX + minCardSpacing) {
        const delta = prevX + minCardSpacing - currX;
        // Shift current node and all nodes to its right
        for (let j = i; j < rowNodes.length; j++) {
          xPositions[rowNodes[j].id] += delta;
        }
      }
    }
  });

  // Re-center parents bottom-up across levels to maintain exact parent-child alignment
  // (Odd children count -> exact middle child alignment, Even -> equal children on both sides)
  const sortedLevelsDesc = Object.keys(nodesByLevel)
    .map(Number)
    .sort((a, b) => b - a); // Process deepest levels first up to top level

  sortedLevelsDesc.forEach((lvl) => {
    const rowNodes = nodesByLevel[lvl];
    rowNodes.forEach((node) => {
      const parentId = node.id;
      const children = parentToChildren[parentId];
      if (children && children.length > 0) {
        const nChildren = children.length;
        if (nChildren % 2 === 1) {
          // Odd children: parent X aligns with the exact middle child
          const midChildId = children[Math.floor(nChildren / 2)];
          if (xPositions[midChildId] !== undefined) {
            xPositions[parentId] = xPositions[midChildId];
          }
        } else {
          // Even children: parent X aligns with midpoint of first and last child
          const firstChildX = xPositions[children[0]];
          const lastChildX = xPositions[children[nChildren - 1]];
          if (firstChildX !== undefined && lastChildX !== undefined) {
            xPositions[parentId] = (firstChildX + lastChildX) / 2;
          }
        }
      }
    });
  });

  // Map distinct present levels to sequential row indices (eliminates empty vertical gaps for missing level numbers)
  const presentLevels = [
    ...new Set(
      nodes.map((node) => {
        const rawLvl = Number(node.data?.levelNumber || 1);
        return rawLvl >= 1 ? rawLvl : 1;
      })
    )
  ].sort((a, b) => a - b);

  const levelRowIndexMap = {};
  presentLevels.forEach((lvl, idx) => {
    levelRowIndexMap[lvl] = idx;
  });

  // Build final React Flow layouted nodes
  const layoutedNodes = nodes.map((node) => {
    const rawLvl = Number(node.data?.levelNumber || 1);
    const lvl = rawLvl >= 1 ? rawLvl : 1;
    const rowIndex = levelRowIndexMap[lvl] !== undefined ? levelRowIndexMap[lvl] : 0;
    const rowY = rowIndex * levelRowGap; // Y position determined sequentially by present level rows

    return {
      ...node,
      targetPosition: 'top',
      sourcePosition: 'bottom',
      position: {
        x: xPositions[node.id] || 0,
        y: rowY
      }
    };
  });

  // Generate faint background level tape nodes spanning across each active level row
  const levelCounts = {};
  const levelNames = {};
  const levelMinX = {};
  layoutedNodes.forEach((n) => {
    const rawLvl = Number(n.data?.levelNumber || 1);
    const lvl = rawLvl >= 1 ? rawLvl : 1;
    levelCounts[lvl] = (levelCounts[lvl] || 0) + 1;
    if (n.data?.levelName && !levelNames[lvl]) {
      levelNames[lvl] = n.data.levelName;
    }
  });

  const allX = layoutedNodes.map((n) => n.position.x);
  const globalMinX = allX.length > 0 ? Math.min(...allX) : 0;

  const tapeX = -100000;
  const tapeWidth = 200000;
  const badgePaddingLeft = globalMinX - tapeX - 350; // Aligns ALL level badges cleanly on the left with generous clearance from employee nodes

  const levelTapeNodes = presentLevels.map((lvl) => {
    const rowIndex = levelRowIndexMap[lvl] !== undefined ? levelRowIndexMap[lvl] : 0;
    const rowY = rowIndex * levelRowGap - 30;

    return {
      id: `level-tape-${lvl}`,
      type: 'levelTapeNode',
      position: { x: tapeX, y: rowY },
      data: {
        levelNumber: lvl,
        levelName: levelNames[lvl] || null,
        count: levelCounts[lvl],
        width: tapeWidth,
        badgePaddingLeft
      },
      selectable: false,
      draggable: false,
      zIndex: -1,
      style: { zIndex: -1, pointerEvents: 'none' }
    };
  });

  return { nodes: [...levelTapeNodes, ...layoutedNodes], edges };
};
