import {
  ArrowLeft,
  Building2,
  Check,
  ChevronDown,
  Compass,
  Mail,
  Maximize2,
  Network,
  Phone,
  RefreshCcw,
  Search,
  ShieldCheck,
  User,
  Users,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { PinchGestureHandler, State } from 'react-native-gesture-handler';
import Svg, { G, Path } from 'react-native-svg';
import api from '../api/axios';
import HRModuleFooter from '../components/HRModuleFooter';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// 18+ Distinct High-Contrast Department Color Palette System
const DEPARTMENT_PALETTES = [
  // 0: Purple - Executive / Management
  { key: 'purple', name: 'Executive Purple', primary: '#7c3aed', border: '#7c3aed', bgLight: '#f5f3ff', text: '#6d28d9', badgeText: '#ffffff' },
  // 1: Royal Cobalt Blue - Software & Systems
  { key: 'blue', name: 'Cobalt Royal Blue', primary: '#2563eb', border: '#2563eb', bgLight: '#eff6ff', text: '#1d4ed8', badgeText: '#ffffff' },
  // 2: Crimson Rose / Red - Sales & Marketing
  { key: 'rose', name: 'Crimson Rose', primary: '#e11d48', border: '#e11d48', bgLight: '#fff1f2', text: '#be123c', badgeText: '#ffffff' },
  // 3: Sunset Orange - Customer Support
  { key: 'orange', name: 'Sunset Orange', primary: '#ea580c', border: '#ea580c', bgLight: '#fff7ed', text: '#c2410c', badgeText: '#ffffff' },
  // 4: Golden Amber - Accounts & Purchase / Finance
  { key: 'amber', name: 'Golden Amber', primary: '#d97706', border: '#d97706', bgLight: '#fffbeb', text: '#b45309', badgeText: '#ffffff' },
  // 5: Vivid Fuchsia Pink - HR & Admin
  { key: 'pink', name: 'Vivid Fuchsia Pink', primary: '#db2777', border: '#db2777', bgLight: '#fdf2f8', text: '#be185d', badgeText: '#ffffff' },
  // 6: Neon Cyan - Electronics & Hardware
  { key: 'cyan', name: 'Neon Cyan', primary: '#0891b2', border: '#0891b2', bgLight: '#ecfeff', text: '#0e7490', badgeText: '#ffffff' },
  // 7: Electric Indigo - Projects & Engineering
  { key: 'indigo', name: 'Electric Indigo', primary: '#4f46e5', border: '#4f46e5', bgLight: '#eef2ff', text: '#4338ca', badgeText: '#ffffff' },
  // 8: Emerald Green - Operations & Logistics
  { key: 'emerald', name: 'Emerald Green', primary: '#059669', border: '#059669', bgLight: '#ecfdf5', text: '#047857', badgeText: '#ffffff' },
  // 9: Warm Bronze - Store & Inventory
  { key: 'bronze', name: 'Warm Bronze', primary: '#854d0e', border: '#854d0e', bgLight: '#fefce8', text: '#713f12', badgeText: '#ffffff' },
  // 10: Deep Violet - Quality Assurance (QA)
  { key: 'violet', name: 'Deep Violet', primary: '#6d28d9', border: '#6d28d9', bgLight: '#ede9fe', text: '#5b21b6', badgeText: '#ffffff' },
  // 11: Slate Steel - Administration & Facilities
  { key: 'slate', name: 'Slate Steel', primary: '#475569', border: '#475569', bgLight: '#f8fafc', text: '#334155', badgeText: '#ffffff' },
  // 12: Bright Lime - Maintenance
  { key: 'lime', name: 'Bright Lime', primary: '#65a30d', border: '#65a30d', bgLight: '#f7fee7', text: '#4d7c0f', badgeText: '#ffffff' },
  // 13: Ruby Scarlet - Marketing
  { key: 'ruby', name: 'Ruby Scarlet', primary: '#dc2626', border: '#dc2626', bgLight: '#fef2f2', text: '#b91c1c', badgeText: '#ffffff' },
  // 14: Deep Teal - Legal & Compliance
  { key: 'teal', name: 'Deep Teal', primary: '#0d9488', border: '#0d9488', bgLight: '#f0fdfa', text: '#0f766e', badgeText: '#ffffff' },
  // 15: Ocean Sky Blue - Consulting & Services
  { key: 'sky', name: 'Ocean Blue', primary: '#0284c7', border: '#0284c7', bgLight: '#f0f9ff', text: '#0369a1', badgeText: '#ffffff' },
  // 16: Vibrant Orchid - Training & Security
  { key: 'fuchsia', name: 'Vibrant Orchid', primary: '#c026d3', border: '#c026d3', bgLight: '#fdf4ff', text: '#a21caf', badgeText: '#ffffff' },
  // 17: Golden Honey - Research & Development
  { key: 'yellow', name: 'Golden Honey', primary: '#ca8a04', border: '#ca8a04', bgLight: '#fefce8', text: '#a16207', badgeText: '#ffffff' }
];

const DIRECT_MAPPINGS = {
  // 🟣 0: Executive / Management (Purple)
  'executive': 0,
  'management': 0,
  'director': 0,
  'board': 0,

  // 🔵 1: Software & Systems / IT (Royal Cobalt Blue)
  'software and systems': 1,
  'software & systems': 1,
  'software': 1,
  'software engineering': 1,
  'it': 1,
  'tech': 1,
  'technology': 1,

  // 🔴 2: Sales & Marketing (Crimson Rose / Red)
  'sales and marketing': 2,
  'sales & marketing': 2,
  'sales': 2,
  'business development': 2,
  'bd': 2,

  // 🟠 3: Customer Support (Sunset Orange)
  'customer support': 3,
  'customer support & service': 3,
  'customer service': 3,
  'customer relations': 3,
  'support': 3,
  'helpdesk': 3,

  // 🟡 4: Accounts & Purchase / Finance (Golden Amber)
  'accounts and purchase': 4,
  'accounts & purchase': 4,
  'accounts': 4,
  'purchase': 4,
  'finance': 4,
  'accounting': 4,
  'billing': 4,

  // 🩷 5: HR & Admin (Vivid Fuchsia Pink)
  'hr and admin': 5,
  'hr & admin': 5,
  'human resource': 5,
  'human resources': 5,
  'hr': 5,
  'people': 5,

  // 🩵 6: Electronics & Hardware (Neon Cyan)
  'electronics': 6,
  'electronics and hardware': 6,
  'electronics & hardware': 6,
  'hardware': 6,
  'embedded': 6,
  'iot': 6,

  // 🫐 7: Projects & Engineering (Electric Indigo)
  'projects and engineering': 7,
  'projects & engineering': 7,
  'engineering': 7,
  'projects': 7,
  'project management': 7,

  // 🟢 8: Operations & Logistics (Emerald Green)
  'operations': 8,
  'operations and logistics': 8,
  'operations & logistics': 8,
  'logistics': 8,
  'supply chain': 8,

  // 🟤 9: Store & Inventory (Warm Bronze)
  'store': 9,
  'stores': 9,
  'inventory': 9,
  'warehouse': 9,

  // 🟣 10: Quality Assurance (Deep Violet)
  'quality assurance': 10,
  'qa': 10,
  'testing': 10,
  'qc': 10,

  // 🔘 11: Administration & Facilities (Slate Steel)
  'admin': 11,
  'administration': 11,
  'facilities': 11,

  // 🟩 12: Maintenance (Bright Lime)
  'maintenance': 12,

  // 🔴 13: Marketing (Ruby Scarlet)
  'marketing': 13,
  'digital marketing': 13,

  // 🩵 14: Legal & Compliance (Deep Teal)
  'legal': 14,
  'compliance': 14,

  // 🔵 15: Consulting & Services (Ocean Blue)
  'consulting': 15,
  'services': 15,

  // 🟪 16: Training & Security (Vibrant Orchid)
  'training': 16,
  'security': 16,

  // 💛 17: Research & Development (Golden Honey)
  'research': 17,
  'r&d': 17
};

const getDepartmentTheme = (department) => {
  if (!department) return DEPARTMENT_PALETTES[0];
  const cleaned = department.toLowerCase().trim();

  if (DIRECT_MAPPINGS[cleaned] !== undefined) {
    return DEPARTMENT_PALETTES[DIRECT_MAPPINGS[cleaned] % DEPARTMENT_PALETTES.length];
  }

  let hash = 0;
  for (let i = 0; i < cleaned.length; i++) {
    hash = (hash << 5) - hash + cleaned.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % DEPARTMENT_PALETTES.length;
  return DEPARTMENT_PALETTES[idx];
};

const LEVEL_TAPE_THEMES = {
  1: { bg: '#f5f3ff', border: '#ddd6fe', badgeBg: '#7c3aed', badgeText: '#ffffff', text: '#5b21b6' },
  2: { bg: '#eef2ff', border: '#c7d2fe', badgeBg: '#4f46e5', badgeText: '#ffffff', text: '#3730a3' },
  3: { bg: '#f0f9ff', border: '#bae6fd', badgeBg: '#0284c7', badgeText: '#ffffff', text: '#0369a1' },
  4: { bg: '#f0fdfa', border: '#99f6e4', badgeBg: '#0d9488', badgeText: '#ffffff', text: '#0f766e' },
  5: { bg: '#ecfdf5', border: '#a7f3d0', badgeBg: '#059669', badgeText: '#ffffff', text: '#047857' },
  6: { bg: '#fefce8', border: '#fef08a', badgeBg: '#ca8a04', badgeText: '#ffffff', text: '#a16207' },
  7: { bg: '#fff7ed', border: '#fed7aa', badgeBg: '#ea580c', badgeText: '#ffffff', text: '#c2410c' },
  default: { bg: '#f8fafc', border: '#cbd5e1', badgeBg: '#475569', badgeText: '#ffffff', text: '#1e293b' },
};

const getLevelTapeTheme = (lvl) => LEVEL_TAPE_THEMES[lvl] || LEVEL_TAPE_THEMES.default;

// Node & Card dimensions
const CARD_WIDTH = 185;
const CARD_HEIGHT = 160;
const SIBLING_GAP = 35;
const LEVEL_ROW_GAP = 210;

/**
 * Top-down level-wise layout generator with same-department child clustering
 */
const calculateOrgChartLayout = (nodes, edges) => {
  if (!nodes || nodes.length === 0) {
    return { layoutedNodes: [], levelTapes: [], edges: [], totalWidth: SCREEN_WIDTH, totalHeight: 400 };
  }

  const nodesMap = {};
  nodes.forEach((n) => {
    nodesMap[n.id] = n;
  });

  const parentToChildren = {};
  const childToParent = {};

  edges.forEach((edge) => {
    const { source, target } = edge;
    if (!parentToChildren[source]) parentToChildren[source] = [];
    parentToChildren[source].push(target);
    childToParent[target] = source;
  });

  // Sort children by department first (so same department subordinates stay near each other), then by level number and name
  Object.keys(parentToChildren).forEach((parentId) => {
    parentToChildren[parentId].sort((aId, bId) => {
      const nodeA = nodesMap[aId];
      const nodeB = nodesMap[bId];
      const deptA = nodeA?.department || '';
      const deptB = nodeB?.department || '';
      if (deptA !== deptB) return deptA.localeCompare(deptB);
      const lvlA = Number(nodeA?.levelNumber || 99);
      const lvlB = Number(nodeB?.levelNumber || 99);
      if (lvlA !== lvlB) return lvlA - lvlB;
      return (nodeA?.name || '').localeCompare(nodeB?.name || '');
    });
  });

  const rootIds = nodes.filter((n) => !childToParent[n.id]).map((n) => n.id);

  if (rootIds.length === 0 && nodes.length > 0) {
    const minLvl = Math.min(...nodes.map((n) => Number(n.levelNumber || 1)));
    nodes.filter((n) => Number(n.levelNumber || 1) === minLvl).forEach((n) => rootIds.push(n.id));
  }

  const xPositions = {};

  const layoutSubtree = (nodeId, visited = new Set()) => {
    if (visited.has(nodeId)) {
      return { width: CARD_WIDTH, centerOffset: CARD_WIDTH / 2, positions: { [nodeId]: 0 } };
    }
    visited.add(nodeId);

    const children = parentToChildren[nodeId] || [];

    if (children.length === 0) {
      return {
        width: CARD_WIDTH,
        centerOffset: CARD_WIDTH / 2,
        positions: { [nodeId]: 0 },
      };
    }

    let currentX = 0;
    const childLayouts = [];
    const subtreePositions = {};

    children.forEach((childId) => {
      const childLayout = layoutSubtree(childId, new Set(visited));
      childLayouts.push({ childId, ...childLayout });
    });

    const childCenters = [];

    childLayouts.forEach(({ childId, width, centerOffset, positions }) => {
      const childSubtreeStartX = currentX;
      const childNodeX = childSubtreeStartX + centerOffset;
      childCenters.push(childNodeX);

      Object.keys(positions).forEach((id) => {
        subtreePositions[id] = childSubtreeStartX + positions[id];
      });

      currentX += width + SIBLING_GAP;
    });

    const totalChildrenWidth = currentX - SIBLING_GAP;

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

    let minX = Math.min(0, parentX - CARD_WIDTH / 2);
    let maxX = Math.max(totalChildrenWidth, parentX + CARD_WIDTH / 2);

    const shift = -minX;
    parentX += shift;
    subtreePositions[nodeId] = parentX - CARD_WIDTH / 2;

    Object.keys(subtreePositions).forEach((id) => {
      if (id !== nodeId) {
        subtreePositions[id] += shift;
      }
    });

    const totalWidth = maxX - minX;

    return {
      width: totalWidth,
      centerOffset: parentX,
      positions: subtreePositions,
    };
  };

  let globalX = 0;
  rootIds.forEach((rootId) => {
    const rootLayout = layoutSubtree(rootId);
    Object.keys(rootLayout.positions).forEach((id) => {
      xPositions[id] = globalX + rootLayout.positions[id];
    });
    globalX += rootLayout.width + SIBLING_GAP * 2;
  });

  nodes.forEach((n) => {
    if (xPositions[n.id] === undefined) {
      xPositions[n.id] = globalX;
      globalX += CARD_WIDTH + SIBLING_GAP;
    }
  });

  // Level-row spacing
  const minCardSpacing = CARD_WIDTH + 30;
  const nodesByLevel = {};

  nodes.forEach((n) => {
    const rawLvl = Number(n.levelNumber || 1);
    const lvl = rawLvl >= 1 ? rawLvl : 1;
    if (!nodesByLevel[lvl]) nodesByLevel[lvl] = [];
    nodesByLevel[lvl].push(n);
  });

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
        for (let j = i; j < rowNodes.length; j++) {
          xPositions[rowNodes[j].id] += delta;
        }
      }
    }
  });

  // Re-center parents bottom-up
  const sortedLevelsDesc = Object.keys(nodesByLevel)
    .map(Number)
    .sort((a, b) => b - a);

  sortedLevelsDesc.forEach((lvl) => {
    const rowNodes = nodesByLevel[lvl];
    rowNodes.forEach((node) => {
      const parentId = node.id;
      const children = parentToChildren[parentId];
      if (children && children.length > 0) {
        const nChildren = children.length;
        if (nChildren % 2 === 1) {
          const midChildId = children[Math.floor(nChildren / 2)];
          if (xPositions[midChildId] !== undefined) {
            xPositions[parentId] = xPositions[midChildId];
          }
        } else {
          const firstChildX = xPositions[children[0]];
          const lastChildX = xPositions[children[nChildren - 1]];
          if (firstChildX !== undefined && lastChildX !== undefined) {
            xPositions[parentId] = (firstChildX + lastChildX) / 2;
          }
        }
      }
    });
  });

  // Map levels
  const presentLevels = [
    ...new Set(
      nodes.map((node) => {
        const rawLvl = Number(node.levelNumber || 1);
        return rawLvl >= 1 ? rawLvl : 1;
      })
    ),
  ].sort((a, b) => a - b);

  const levelRowIndexMap = {};
  presentLevels.forEach((lvl, idx) => {
    levelRowIndexMap[lvl] = idx;
  });

  const layoutedNodesMap = {};
  let maxComputedX = 0;

  const layoutedNodes = nodes.map((node) => {
    const rawLvl = Number(node.levelNumber || 1);
    const lvl = rawLvl >= 1 ? rawLvl : 1;
    const rowIndex = levelRowIndexMap[lvl] !== undefined ? levelRowIndexMap[lvl] : 0;
    const rowY = rowIndex * LEVEL_ROW_GAP + 55;
    const nodeX = (xPositions[node.id] || 0) + 165;

    if (nodeX + CARD_WIDTH > maxComputedX) {
      maxComputedX = nodeX + CARD_WIDTH;
    }

    const nObj = {
      ...node,
      x: nodeX,
      y: rowY,
    };
    layoutedNodesMap[node.id] = nObj;
    return nObj;
  });

  // Level Tapes
  const levelCounts = {};
  const levelNames = {};
  layoutedNodes.forEach((n) => {
    const rawLvl = Number(n.levelNumber || 1);
    const lvl = rawLvl >= 1 ? rawLvl : 1;
    levelCounts[lvl] = (levelCounts[lvl] || 0) + 1;
    if (n.levelName && !levelNames[lvl]) {
      levelNames[lvl] = n.levelName;
    }
  });

  const totalWidth = Math.max(SCREEN_WIDTH * 1.6, maxComputedX + 120);
  const totalHeight = presentLevels.length * LEVEL_ROW_GAP + 180;

  const levelTapes = presentLevels.map((lvl) => {
    const rowIndex = levelRowIndexMap[lvl] !== undefined ? levelRowIndexMap[lvl] : 0;
    const rowY = rowIndex * LEVEL_ROW_GAP + 15;

    return {
      levelNumber: lvl,
      levelName: levelNames[lvl] || `Level ${lvl}`,
      count: levelCounts[lvl],
      y: rowY,
      height: 185,
    };
  });

  // Connection Edges
  const computedEdges = [];
  edges.forEach((edge) => {
    const sourceNode = layoutedNodesMap[edge.source];
    const targetNode = layoutedNodesMap[edge.target];

    if (sourceNode && targetNode) {
      const sourceX = sourceNode.x + CARD_WIDTH / 2;
      const sourceY = sourceNode.y + 130;
      const targetX = targetNode.x + CARD_WIDTH / 2;
      const targetY = targetNode.y;

      const gap = targetY - sourceY;
      const busY = sourceY + Math.min(24, Math.max(12, gap / 2));
      const r = 6;
      let pathStr = '';

      if (Math.abs(sourceX - targetX) < 3) {
        pathStr = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
      } else if (targetX > sourceX) {
        pathStr = `M ${sourceX} ${sourceY} L ${sourceX} ${busY - r} Q ${sourceX} ${busY} ${sourceX + r} ${busY} L ${targetX - r} ${busY} Q ${targetX} ${busY} ${targetX} ${busY + r} L ${targetX} ${targetY}`;
      } else {
        pathStr = `M ${sourceX} ${sourceY} L ${sourceX} ${busY - r} Q ${sourceX} ${busY} ${sourceX - r} ${busY} L ${targetX + r} ${busY} Q ${targetX} ${busY} ${targetX} ${busY + r} L ${targetX} ${targetY}`;
      }

      computedEdges.push({
        id: `e-${sourceNode.id}-${targetNode.id}`,
        path: pathStr,
      });
    }
  });

  return {
    layoutedNodes,
    levelTapes,
    edges: computedEdges,
    totalWidth,
    totalHeight,
  };
};

const OrgChartScreen = ({ navigation }) => {
  const [rawNodes, setRawNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDept, setSelectedDept] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);

  // 2D Pan and Zoom Animation State
  const [viewportSize, setViewportSize] = useState({ width: SCREEN_WIDTH, height: SCREEN_HEIGHT - 220 });
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const currentPan = useRef({ x: 0, y: 0 });
  const scale = useRef(new Animated.Value(0.85)).current;
  const currentScale = useRef(0.85);

  const fetchOrgChart = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/console/org-chart-tree?department=all');
      if (res?.data?.success) {
        const flatNodes = res.data.flatNodes || [];
        setRawNodes(flatNodes);
      }
    } catch (err) {
      console.warn('[OrgChartScreen] Load error:', err?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOrgChart();
  }, [fetchOrgChart]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchOrgChart();
  }, [fetchOrgChart]);

  // Extract all distinct departments
  const departments = useMemo(() => {
    const hiddenAdminRoles = ['superadmin', 'super_admin', 'company_admin', 'hr_admin', 'store_admin', 'account_admin'];
    const hiddenAdminRoleCodes = ['TCSA1', 'TCCA1', 'SUPERADMIN', 'COMPANY_ADMIN', 'HR_ADMIN', 'STORE_ADMIN', 'ACCOUNT_ADMIN', 'TCSTR1', 'TCACC1', 'TCSF2A'];

    const set = new Set();
    rawNodes.forEach((node) => {
      if (
        !hiddenAdminRoles.includes((node.role || '').toLowerCase()) &&
        !hiddenAdminRoleCodes.includes((node.roleCode || '').toUpperCase()) &&
        node.levelName !== 'Super Admin' &&
        !node.name?.toLowerCase().includes('super admin') &&
        node.department
      ) {
        set.add(node.department);
      }
    });
    return ['all', ...Array.from(set).sort()];
  }, [rawNodes]);

  // Filter nodes by Department & Search
  const filteredNodes = useMemo(() => {
    const hiddenAdminRoles = ['superadmin', 'super_admin', 'company_admin', 'hr_admin', 'store_admin', 'account_admin'];
    const hiddenAdminRoleCodes = ['TCSA1', 'TCCA1', 'SUPERADMIN', 'COMPANY_ADMIN', 'HR_ADMIN', 'STORE_ADMIN', 'ACCOUNT_ADMIN', 'TCSTR1', 'TCACC1', 'TCSF2A'];

    let list = rawNodes.filter(
      (node) =>
        !hiddenAdminRoles.includes((node.role || '').toLowerCase()) &&
        !hiddenAdminRoleCodes.includes((node.roleCode || '').toUpperCase()) &&
        node.levelName !== 'Super Admin' &&
        !node.name?.toLowerCase().includes('super admin')
    );

    // Department Filter: ONLY show selected department's employees
    if (selectedDept && selectedDept !== 'all') {
      list = list.filter(
        (node) => (node.department || '').toLowerCase().trim() === selectedDept.toLowerCase().trim()
      );
    }

    // Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (node) =>
          (node.name || '').toLowerCase().includes(q) ||
          (node.roleCode || '').toLowerCase().includes(q) ||
          (node.designation || '').toLowerCase().includes(q) ||
          (node.department || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [rawNodes, selectedDept, searchQuery]);

  // Compute Layout
  const layoutResult = useMemo(() => {
    const filteredIds = new Set(filteredNodes.map((n) => n.id));
    const edges = [];

    filteredNodes.forEach((emp) => {
      if (emp.reportsToId && filteredIds.has(emp.reportsToId)) {
        edges.push({
          source: emp.reportsToId,
          target: emp.id,
        });
      }
    });

    return calculateOrgChartLayout(filteredNodes, edges);
  }, [filteredNodes]);

  // Initial fit scale
  const initialFitScale = useMemo(() => {
    if (!layoutResult || !layoutResult.totalWidth || layoutResult.totalWidth === 0) return 0.85;
    const padding = 20;
    const availableWidth = SCREEN_WIDTH - padding;
    const fitScale = availableWidth / layoutResult.totalWidth;
    const clamped = Math.min(1.0, Math.max(0.25, fitScale));
    return Number(clamped.toFixed(2));
  }, [layoutResult]);

  // Exact centering math to center the top root/executive employee card in the mobile viewport
  const getCenterPan = useCallback((targetScale = initialFitScale) => {
    if (!layoutResult || !layoutResult.layoutedNodes || layoutResult.layoutedNodes.length === 0) {
      return { x: 0, y: 0 };
    }

    const rootNode = layoutResult.layoutedNodes.find((n) => Number(n.levelNumber || 1) === 1) || layoutResult.layoutedNodes[0];
    const targetX = rootNode ? (rootNode.x + CARD_WIDTH / 2) : (layoutResult.totalWidth / 2);
    const targetY = rootNode ? (rootNode.y + CARD_HEIGHT / 2) : 100;

    const canvasCenterX = layoutResult.totalWidth / 2;
    const canvasCenterY = layoutResult.totalHeight / 2;

    const vpW = viewportSize.width || SCREEN_WIDTH;
    const vpH = viewportSize.height || (SCREEN_HEIGHT - 220);

    const calculatedX = (vpW / 2) - canvasCenterX - (targetX - canvasCenterX) * targetScale;
    const calculatedY = (vpH * 0.26) - canvasCenterY - (targetY - canvasCenterY) * targetScale;

    return {
      x: Math.round(calculatedX),
      y: Math.round(calculatedY),
    };
  }, [layoutResult, initialFitScale, viewportSize]);

  useEffect(() => {
    if (initialFitScale && layoutResult?.layoutedNodes?.length > 0) {
      const centerPan = getCenterPan(initialFitScale);
      currentScale.current = initialFitScale;
      scale.setValue(initialFitScale);
      currentPan.current = { x: centerPan.x, y: centerPan.y };
      pan.setValue({ x: centerPan.x, y: centerPan.y });
    }
  }, [initialFitScale, layoutResult, getCenterPan]);

  // Multi-directional 2D PanResponder (drag freely horizontally, vertically, diagonally)
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (evt, gestureState) => {
          return Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3;
        },
        onPanResponderGrant: () => {
          pan.setOffset({
            x: currentPan.current.x,
            y: currentPan.current.y,
          });
          pan.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: (evt, gestureState) => {
          pan.flattenOffset();
          currentPan.current.x += gestureState.dx;
          currentPan.current.y += gestureState.dy;
        },
      }),
    [pan]
  );

  // Smooth Pinch-to-Zoom Handler
  const onPinchGestureEvent = (event) => {
    if (event?.nativeEvent?.scale) {
      const s = currentScale.current * event.nativeEvent.scale;
      const clamped = Math.min(Math.max(s, 0.2), 2.5);
      scale.setValue(clamped);
    }
  };

  const onPinchHandlerStateChange = (event) => {
    if (event?.nativeEvent?.oldState === State.ACTIVE) {
      const last = currentScale.current * (event.nativeEvent.scale || 1.0);
      const clamped = Math.min(Math.max(last, 0.2), 2.5);
      currentScale.current = clamped;
      scale.setValue(clamped);
    }
  };

  // Zoom and Center Controls
  const handleZoomIn = () => {
    const next = Math.min(2.5, currentScale.current + 0.15);
    currentScale.current = next;
    Animated.spring(scale, { toValue: next, useNativeDriver: false }).start();
  };

  const handleZoomOut = () => {
    const next = Math.max(0.2, currentScale.current - 0.15);
    currentScale.current = next;
    Animated.spring(scale, { toValue: next, useNativeDriver: false }).start();
  };

  const handleResetZoom = () => {
    const centerPan = getCenterPan(initialFitScale);
    currentScale.current = initialFitScale;
    currentPan.current = { x: centerPan.x, y: centerPan.y };
    Animated.parallel([
      Animated.spring(scale, { toValue: initialFitScale, useNativeDriver: false, friction: 6 }),
      Animated.spring(pan, { toValue: { x: centerPan.x, y: centerPan.y }, useNativeDriver: false, friction: 6 }),
    ]).start();
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <StatusBar barStyle="light-content" backgroundColor="#1e1b4b" />

      {/* Top Header */}
      <View style={{ backgroundColor: '#1e1b4b', paddingTop: 48, paddingBottom: 14, paddingHorizontal: 16, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 20 }}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.goBack()}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' }}
        >
          <ArrowLeft size={18} color="white" />
        </TouchableOpacity>

        <View style={{ alignItems: 'center', flex: 1, marginHorizontal: 8 }}>
          <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '900', letterSpacing: 0.3 }}>
            Organization Chart
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700', marginTop: 2 }}>
            {filteredNodes.length} Employees • 2D Interactive Map
          </Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onRefresh}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' }}
        >
          <RefreshCcw size={15} color="white" />
        </TouchableOpacity>
      </View>

      {/* Controls Bar: Search & Department Pills */}
      <View style={{ backgroundColor: '#ffffff', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', zIndex: 10 }}>
        {/* Search Input */}
        <View style={{ backgroundColor: '#f1f5f9', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' }}>
          <Search size={14} color="#64748b" style={{ marginRight: 6 }} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search employee, designation, role..."
            placeholderTextColor="#94a3b8"
            style={{ flex: 1, color: '#0f172a', fontWeight: '700', fontSize: 12, padding: 0 }}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={14} color="#94a3b8" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Department Horizontal Filter Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
        >
          {departments.map((dept) => {
            const isSelected = selectedDept.toLowerCase() === dept.toLowerCase();
            const theme = getDepartmentTheme(dept === 'all' ? '' : dept);

            return (
              <TouchableOpacity
                key={dept}
                activeOpacity={0.8}
                onPress={() => setSelectedDept(dept)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: isSelected ? theme.border : '#e2e8f0',
                  backgroundColor: isSelected ? theme.primary : '#ffffff',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  shadowColor: isSelected ? theme.primary : '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: isSelected ? 0.2 : 0.05,
                  shadowRadius: 2,
                  elevation: isSelected ? 2 : 1,
                }}
              >
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: isSelected ? '#ffffff' : theme.primary,
                  }}
                />
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '800',
                    color: isSelected ? '#ffffff' : '#334155',
                    textTransform: 'capitalize',
                  }}
                >
                  {dept === 'all' ? '🏢 All Departments' : dept}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Main Touch-Interactive 2D Canvas Viewport (Pan in Any Direction + Pinch Zoom) */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
          <ActivityIndicator size="large" color="#4f46e5" />
          <Text style={{ color: '#334155', fontWeight: '800', fontSize: 13, marginTop: 12 }}>
            Building Hierarchy Chart...
          </Text>
          <Text style={{ color: '#94a3b8', fontWeight: '600', fontSize: 11, marginTop: 4 }}>
            Organizing level rows and department structures
          </Text>
        </View>
      ) : layoutResult.layoutedNodes.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#f8fafc' }}>
          <Network size={44} color="#cbd5e1" />
          <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 16, marginTop: 12 }}>
            No Employees Found
          </Text>
          <Text style={{ color: '#64748b', fontWeight: '600', fontSize: 12, textAlign: 'center', marginTop: 4 }}>
            No employee matches department &ldquo;{selectedDept}&rdquo; or your search term.
          </Text>
          <TouchableOpacity
            onPress={() => { setSelectedDept('all'); setSearchQuery(''); }}
            style={{ marginTop: 16, backgroundColor: '#4f46e5', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 }}
          >
            <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 12 }}>Show All Departments</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View
          style={{ flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: '#f8fafc' }}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            if (width > 0 && height > 0) {
              setViewportSize({ width, height });
            }
          }}
          {...panResponder.panHandlers}
        >
          <PinchGestureHandler
            onGestureEvent={onPinchGestureEvent}
            onHandlerStateChange={onPinchHandlerStateChange}
          >
            <Animated.View
              style={{
                width: layoutResult.totalWidth,
                height: layoutResult.totalHeight,
                transform: [
                  { translateX: pan.x },
                  { translateY: pan.y },
                  { scale: scale },
                ],
                position: 'absolute',
                top: 0,
                left: 0,
              }}
            >
              {/* 1. Level-Wise Horizontal Color Tapes */}
              {layoutResult.levelTapes.map((tape) => {
                const theme = getLevelTapeTheme(tape.levelNumber);

                return (
                  <React.Fragment key={`tape-${tape.levelNumber}`}>
                    {/* Horizontal Tape Band */}
                    <View
                      style={{
                        position: 'absolute',
                        top: tape.y,
                        left: 0,
                        width: layoutResult.totalWidth,
                        height: tape.height,
                        backgroundColor: theme.bg,
                        borderTopWidth: 1.5,
                        borderBottomWidth: 1.5,
                        borderColor: theme.border,
                        opacity: 0.9,
                      }}
                    />

                    {/* Left Column Level Info Pill */}
                    <View
                      style={{
                        position: 'absolute',
                        top: tape.y + 12,
                        left: 14,
                        width: 135,
                        height: tape.height - 24,
                        backgroundColor: '#ffffff',
                        borderWidth: 1.5,
                        borderLeftWidth: 4,
                        borderColor: theme.border,
                        borderRadius: 14,
                        padding: 10,
                        justifyContent: 'space-between',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.08,
                        shadowRadius: 2,
                        elevation: 2,
                      }}
                    >
                      <View>
                        <View
                          style={{ backgroundColor: theme.badgeBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, alignSelf: 'flex-start' }}
                        >
                          <Text style={{ color: theme.badgeText, fontWeight: '900', fontSize: 8, letterSpacing: 0.5 }}>
                            LEVEL {tape.levelNumber}
                          </Text>
                        </View>
                        <Text
                          style={{ color: theme.text, fontWeight: '900', fontSize: 10, marginTop: 4 }}
                          numberOfLines={2}
                        >
                          {tape.levelName}
                        </Text>
                      </View>

                      <View style={{ backgroundColor: '#f1f5f9', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start' }}>
                        <Text style={{ color: '#334155', fontWeight: '800', fontSize: 9 }}>
                          👥 {tape.count} {tape.count === 1 ? 'Employee' : 'Employees'}
                        </Text>
                      </View>
                    </View>
                  </React.Fragment>
                );
              })}

              {/* 2. SVG Orthogonal Connection Lines */}
              <Svg
                width={layoutResult.totalWidth}
                height={layoutResult.totalHeight}
                style={{ position: 'absolute', top: 0, left: 0 }}
              >
                <G>
                  {layoutResult.edges.map((edge) => (
                    <Path
                      key={edge.id}
                      d={edge.path}
                      stroke="#475569"
                      strokeWidth={2}
                      fill="none"
                    />
                  ))}
                </G>
              </Svg>

              {/* 3. Employee Node Cards (Avatar + Name Box + Role Banner) */}
              {layoutResult.layoutedNodes.map((emp) => {
                const theme = getDepartmentTheme(emp.department);
                const displayTitle = emp.designation || emp.levelName || emp.roleCode || 'Staff';

                return (
                  <TouchableOpacity
                    key={emp.id}
                    activeOpacity={0.85}
                    onPress={() => setSelectedNode(emp)}
                    style={{
                      position: 'absolute',
                      left: emp.x,
                      top: emp.y,
                      width: CARD_WIDTH,
                      alignItems: 'center',
                    }}
                  >
                    {/* Top Circular Badge with Department Ring */}
                    <View
                      style={{
                        width: 68,
                        height: 68,
                        borderRadius: 34,
                        backgroundColor: theme.primary,
                        padding: 3,
                        marginBottom: -8,
                        zIndex: 10,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.15,
                        shadowRadius: 3,
                        elevation: 4,
                      }}
                    >
                      <View style={{ width: '100%', height: '100%', borderRadius: 31, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        {emp.profileImage ? (
                          <Image
                            source={{ uri: emp.profileImage }}
                            style={{ width: '100%', height: '100%' }}
                            resizeMode="cover"
                          />
                        ) : (
                          <View
                            style={{
                              width: '100%',
                              height: '100%',
                              backgroundColor: theme.bgLight,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Text style={{ color: theme.text, fontWeight: '900', fontSize: 18 }}>
                              {(emp.name || 'U').charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Active Green Indicator */}
                      <View
                        style={{
                          position: 'absolute',
                          bottom: 1,
                          right: 1,
                          width: 12,
                          height: 12,
                          borderRadius: 6,
                          backgroundColor: '#10b981',
                          borderWidth: 2,
                          borderColor: '#ffffff',
                        }}
                      />
                    </View>

                    {/* Employee Name Box */}
                    <View
                      style={{
                        width: 130,
                        borderColor: theme.border,
                        borderWidth: 2,
                        paddingTop: 8,
                        paddingBottom: 3,
                        backgroundColor: '#ffffff',
                        borderRadius: 10,
                        alignItems: 'center',
                        justifyContent: 'center',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.08,
                        shadowRadius: 2,
                        elevation: 2,
                      }}
                    >
                      <Text
                        style={{ fontSize: 13, fontWeight: '900', color: '#0f172a', textAlign: 'center', paddingHorizontal: 4 }}
                        numberOfLines={1}
                      >
                        {emp.name || 'Employee'}
                      </Text>
                    </View>

                    {/* Designation / Role Banner */}
                    <View
                      style={{
                        width: 112,
                        backgroundColor: theme.primary,
                        borderRadius: 8,
                        paddingVertical: 2.5,
                        paddingHorizontal: 4,
                        marginTop: 1,
                        alignItems: 'center',
                        justifyContent: 'center',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.1,
                        shadowRadius: 2,
                        elevation: 2,
                      }}
                    >
                      <Text
                        style={{ color: '#ffffff', fontWeight: '900', fontSize: 10, textAlign: 'center', textTransform: 'uppercase' }}
                        numberOfLines={1}
                      >
                        {displayTitle}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </Animated.View>
          </PinchGestureHandler>

          {/* Floating Action HUD Controls (Bottom Right) */}
          <View
            style={{
              position: 'absolute',
              bottom: 20,
              right: 16,
              backgroundColor: 'rgba(255,255,255,0.95)',
              borderRadius: 16,
              padding: 4,
              borderWidth: 1,
              borderColor: '#e2e8f0',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 6,
              elevation: 5,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              zIndex: 30,
            }}
          >
            <TouchableOpacity
              onPress={handleZoomIn}
              style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' }}
            >
              <ZoomIn size={16} color="#4f46e5" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleZoomOut}
              style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' }}
            >
              <ZoomOut size={16} color="#4f46e5" />
            </TouchableOpacity>

            <View style={{ width: 1, height: 16, backgroundColor: '#cbd5e1', marginHorizontal: 2 }} />

            <TouchableOpacity
              onPress={handleResetZoom}
              style={{ paddingHorizontal: 8, height: 34, borderRadius: 10, backgroundColor: '#eef2ff', flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Compass size={14} color="#4f46e5" />
              <Text style={{ color: '#4f46e5', fontWeight: '800', fontSize: 10 }}>Center</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Employee Detail Bottom Sheet Modal */}
      {selectedNode && (
        <Modal
          visible={!!selectedNode}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setSelectedNode(null)}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'flex-end' }}>
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={1}
              onPress={() => setSelectedNode(null)}
            />
            <View
              style={{
                backgroundColor: '#ffffff',
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
                padding: 20,
                paddingBottom: 32,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: -4 },
                shadowOpacity: 0.15,
                shadowRadius: 8,
                elevation: 10,
              }}
            >
              {/* Top Accent Strip */}
              <View
                style={{
                  height: 4,
                  width: 44,
                  borderRadius: 2,
                  backgroundColor: '#cbd5e1',
                  alignSelf: 'center',
                  marginBottom: 16,
                }}
              />

              {/* Profile Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                  <View
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 26,
                      backgroundColor: getDepartmentTheme(selectedNode.department).primary,
                      padding: 2,
                    }}
                  >
                    <View style={{ width: '100%', height: '100%', borderRadius: 24, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {selectedNode.profileImage ? (
                        <Image source={{ uri: selectedNode.profileImage }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      ) : (
                        <Text style={{ color: getDepartmentTheme(selectedNode.department).primary, fontWeight: '900', fontSize: 18 }}>
                          {(selectedNode.name || 'U').charAt(0).toUpperCase()}
                        </Text>
                      )}
                    </View>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '900', color: '#0f172a' }} numberOfLines={1}>
                      {selectedNode.name || 'Employee'}
                    </Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748b' }} numberOfLines={1}>
                      {selectedNode.designation || 'Staff'}
                    </Text>
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '800',
                        color: getDepartmentTheme(selectedNode.department).text,
                        marginTop: 2,
                        textTransform: 'uppercase',
                      }}
                    >
                      {selectedNode.department || 'General'}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => setSelectedNode(null)}
                  style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' }}
                >
                  <X size={16} color="#64748b" />
                </TouchableOpacity>
              </View>

              {/* Details Grid */}
              <View style={{ backgroundColor: '#f8fafc', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#e2e8f0', gap: 10, marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' }}>Employee ID</Text>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#0f172a', marginTop: 1 }}>{selectedNode.roleCode || 'N/A'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' }}>Corporate Level</Text>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#4f46e5', marginTop: 1 }}>Level {selectedNode.levelNumber || 1}</Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' }}>Direct Reports</Text>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#059669', marginTop: 1 }}>👥 {selectedNode.directReportCount || 0} Members</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' }}>Reports To</Text>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#0f172a', marginTop: 1 }} numberOfLines={1}>
                      {selectedNode.reportsToName || 'Direct Executive'}
                    </Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setSelectedNode(null)}
                style={{ backgroundColor: '#0f172a', paddingVertical: 14, borderRadius: 16, alignItems: 'center' }}
              >
                <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 13 }}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* HR Module Footer */}
      <HRModuleFooter navigation={navigation} currentScreen="orgChart" />
    </View>
  );
};

export default OrgChartScreen;
