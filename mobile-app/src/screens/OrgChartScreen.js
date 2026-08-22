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
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import api from '../api/axios';
import HRModuleFooter from '../components/HRModuleFooter';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// 18+ Distinct High-Contrast Department Color Palette System
const DEPARTMENT_PALETTES = [
  { key: 'purple', name: 'Executive Purple', primary: '#7c3aed', border: '#7c3aed', bgLight: '#f5f3ff', text: '#6d28d9', badgeText: '#ffffff' },
  { key: 'blue', name: 'Cobalt Royal Blue', primary: '#2563eb', border: '#2563eb', bgLight: '#eff6ff', text: '#1d4ed8', badgeText: '#ffffff' },
  { key: 'rose', name: 'Crimson Rose', primary: '#e11d48', border: '#e11d48', bgLight: '#fff1f2', text: '#be123c', badgeText: '#ffffff' },
  { key: 'orange', name: 'Sunset Orange', primary: '#ea580c', border: '#ea580c', bgLight: '#fff7ed', text: '#c2410c', badgeText: '#ffffff' },
  { key: 'amber', name: 'Golden Amber', primary: '#d97706', border: '#d97706', bgLight: '#fffbeb', text: '#b45309', badgeText: '#ffffff' },
  { key: 'pink', name: 'Vivid Fuchsia Pink', primary: '#db2777', border: '#db2777', bgLight: '#fdf2f8', text: '#be185d', badgeText: '#ffffff' },
  { key: 'cyan', name: 'Neon Cyan', primary: '#0891b2', border: '#0891b2', bgLight: '#ecfeff', text: '#0e7490', badgeText: '#ffffff' },
  { key: 'indigo', name: 'Electric Indigo', primary: '#4f46e5', border: '#4f46e5', bgLight: '#eef2ff', text: '#4338ca', badgeText: '#ffffff' },
  { key: 'emerald', name: 'Emerald Green', primary: '#059669', border: '#059669', bgLight: '#ecfdf5', text: '#047857', badgeText: '#ffffff' },
  { key: 'bronze', name: 'Warm Bronze', primary: '#854d0e', border: '#854d0e', bgLight: '#fefce8', text: '#713f12', badgeText: '#ffffff' },
  { key: 'violet', name: 'Deep Violet', primary: '#6d28d9', border: '#6d28d9', bgLight: '#ede9fe', text: '#5b21b6', badgeText: '#ffffff' },
  { key: 'slate', name: 'Slate Steel', primary: '#475569', border: '#475569', bgLight: '#f8fafc', text: '#334155', badgeText: '#ffffff' },
  { key: 'lime', name: 'Bright Lime', primary: '#65a30d', border: '#65a30d', bgLight: '#f7fee7', text: '#4d7c0f', badgeText: '#ffffff' },
  { key: 'ruby', name: 'Ruby Scarlet', primary: '#dc2626', border: '#dc2626', bgLight: '#fef2f2', text: '#b91c1c', badgeText: '#ffffff' },
  { key: 'teal', name: 'Deep Teal', primary: '#0d9488', border: '#0d9488', bgLight: '#f0fdfa', text: '#0f766e', badgeText: '#ffffff' },
  { key: 'sky', name: 'Ocean Blue', primary: '#0284c7', border: '#0284c7', bgLight: '#f0f9ff', text: '#0369a1', badgeText: '#ffffff' },
  { key: 'fuchsia', name: 'Vibrant Orchid', primary: '#c026d3', border: '#c026d3', bgLight: '#fdf4ff', text: '#a21caf', badgeText: '#ffffff' },
  { key: 'yellow', name: 'Golden Honey', primary: '#ca8a04', border: '#ca8a04', bgLight: '#fefce8', text: '#a16207', badgeText: '#ffffff' }
];

const DIRECT_MAPPINGS = {
  'executive': 0, 'management': 0, 'director': 0, 'board': 0,
  'software and systems': 1, 'software & systems': 1, 'software': 1, 'software engineering': 1, 'it': 1, 'tech': 1, 'technology': 1,
  'sales and marketing': 2, 'sales & marketing': 2, 'sales': 2, 'business development': 2, 'bd': 2,
  'customer support': 3, 'customer support & service': 3, 'customer service': 3, 'customer relations': 3, 'support': 3, 'helpdesk': 3,
  'accounts and purchase': 4, 'accounts & purchase': 4, 'accounts': 4, 'purchase': 4, 'finance': 4, 'accounting': 4, 'billing': 4,
  'hr and admin': 5, 'hr & admin': 5, 'human resource': 5, 'human resources': 5, 'hr': 5, 'people': 5,
  'electronics': 6, 'electronics and hardware': 6, 'electronics & hardware': 6, 'hardware': 6, 'embedded': 6, 'iot': 6,
  'projects and engineering': 7, 'projects & engineering': 7, 'engineering': 7, 'projects': 7, 'project management': 7,
  'operations': 8, 'operations and logistics': 8, 'operations & logistics': 8, 'logistics': 8, 'supply chain': 8,
  'store': 9, 'stores': 9, 'inventory': 9, 'warehouse': 9,
  'quality assurance': 10, 'qa': 10, 'testing': 10, 'qc': 10,
  'admin': 11, 'administration': 11, 'facilities': 11,
  'maintenance': 12,
  'marketing': 13, 'digital marketing': 13,
  'legal': 14, 'compliance': 14,
  'consulting': 15, 'services': 15,
  'training': 16, 'security': 16,
  'research': 17, 'r&d': 17
};

const getDepartmentTheme = (department) => {
  if (!department || typeof department !== 'string') return DEPARTMENT_PALETTES[0];
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
 * Top-down level-wise layout generator with pure View-based orthogonal line math
 */
const calculateOrgChartLayout = (nodes, edges) => {
  if (!nodes || nodes.length === 0) {
    return { layoutedNodes: [], levelTapes: [], edgeSegments: [], totalWidth: SCREEN_WIDTH, totalHeight: 400 };
  }

  const nodesMap = {};
  nodes.forEach((n) => {
    if (n && n.id) {
      nodesMap[n.id] = n;
    }
  });

  const parentToChildren = {};
  const childToParent = {};

  if (Array.isArray(edges)) {
    edges.forEach((edge) => {
      if (edge && edge.source && edge.target) {
        const { source, target } = edge;
        if (!parentToChildren[source]) parentToChildren[source] = [];
        parentToChildren[source].push(target);
        childToParent[target] = source;
      }
    });
  }

  // Sort children by department, level number, and name
  Object.keys(parentToChildren).forEach((parentId) => {
    parentToChildren[parentId].sort((aId, bId) => {
      const nodeA = nodesMap[aId];
      const nodeB = nodesMap[bId];
      const deptA = String(nodeA?.department || '');
      const deptB = String(nodeB?.department || '');
      if (deptA !== deptB) return deptA.localeCompare(deptB);
      const lvlA = Number(nodeA?.levelNumber) || 99;
      const lvlB = Number(nodeB?.levelNumber) || 99;
      if (lvlA !== lvlB) return lvlA - lvlB;
      return String(nodeA?.name || '').localeCompare(String(nodeB?.name || ''));
    });
  });

  const rootIds = nodes.filter((n) => !childToParent[n.id]).map((n) => n.id);

  if (rootIds.length === 0 && nodes.length > 0) {
    const validLevels = nodes
      .map((n) => Number(n.levelNumber))
      .filter((lvl) => Number.isFinite(lvl));
    const minLvl = validLevels.length > 0 ? Math.min(...validLevels) : 1;
    nodes.filter((n) => (Number(n.levelNumber) || 1) === minLvl).forEach((n) => rootIds.push(n.id));
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
      const childNodeX = childSubtreeStartX + (Number.isFinite(centerOffset) ? centerOffset : CARD_WIDTH / 2);
      childCenters.push(childNodeX);

      Object.keys(positions || {}).forEach((id) => {
        const pVal = Number(positions[id]) || 0;
        subtreePositions[id] = childSubtreeStartX + pVal;
      });

      const wVal = Number(width) || CARD_WIDTH;
      currentX += wVal + SIBLING_GAP;
    });

    const totalChildrenWidth = Math.max(CARD_WIDTH, currentX - SIBLING_GAP);

    let parentX = CARD_WIDTH / 2;
    const nChildren = children.length;
    if (nChildren > 0) {
      if (nChildren % 2 === 1) {
        const midIdx = Math.floor(nChildren / 2);
        parentX = Number.isFinite(childCenters[midIdx]) ? childCenters[midIdx] : CARD_WIDTH / 2;
      } else {
        const firstChildCenter = Number.isFinite(childCenters[0]) ? childCenters[0] : 0;
        const lastChildCenter = Number.isFinite(childCenters[nChildren - 1]) ? childCenters[nChildren - 1] : CARD_WIDTH;
        parentX = (firstChildCenter + lastChildCenter) / 2;
      }
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

    const totalWidth = Math.max(CARD_WIDTH, maxX - minX);

    return {
      width: totalWidth,
      centerOffset: parentX,
      positions: subtreePositions,
    };
  };

  let globalX = 0;
  rootIds.forEach((rootId) => {
    const rootLayout = layoutSubtree(rootId);
    Object.keys(rootLayout.positions || {}).forEach((id) => {
      const posVal = Number(rootLayout.positions[id]) || 0;
      xPositions[id] = globalX + posVal;
    });
    const rWidth = Number(rootLayout.width) || CARD_WIDTH;
    globalX += rWidth + SIBLING_GAP * 2;
  });

  nodes.forEach((n) => {
    if (xPositions[n.id] === undefined || !Number.isFinite(xPositions[n.id])) {
      xPositions[n.id] = globalX;
      globalX += CARD_WIDTH + SIBLING_GAP;
    }
  });

  // Level-row spacing
  const minCardSpacing = CARD_WIDTH + 30;
  const nodesByLevel = {};

  nodes.forEach((n) => {
    const rawLvl = Number(n.levelNumber);
    const lvl = Number.isFinite(rawLvl) && rawLvl >= 1 ? rawLvl : 1;
    if (!nodesByLevel[lvl]) nodesByLevel[lvl] = [];
    nodesByLevel[lvl].push(n);
  });

  Object.keys(nodesByLevel).forEach((lvl) => {
    const rowNodes = nodesByLevel[lvl];
    rowNodes.sort((a, b) => (Number(xPositions[a.id]) || 0) - (Number(xPositions[b.id]) || 0));

    for (let i = 1; i < rowNodes.length; i++) {
      const prevId = rowNodes[i - 1].id;
      const currId = rowNodes[i].id;
      const prevX = Number(xPositions[prevId]) || 0;
      const currX = Number(xPositions[currId]) || 0;

      if (currX < prevX + minCardSpacing) {
        const delta = prevX + minCardSpacing - currX;
        for (let j = i; j < rowNodes.length; j++) {
          xPositions[rowNodes[j].id] = (Number(xPositions[rowNodes[j].id]) || 0) + delta;
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
          if (xPositions[midChildId] !== undefined && Number.isFinite(xPositions[midChildId])) {
            xPositions[parentId] = xPositions[midChildId];
          }
        } else {
          const firstChildX = Number(xPositions[children[0]]);
          const lastChildX = Number(xPositions[children[nChildren - 1]]);
          if (Number.isFinite(firstChildX) && Number.isFinite(lastChildX)) {
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
        const rawLvl = Number(node.levelNumber);
        return Number.isFinite(rawLvl) && rawLvl >= 1 ? rawLvl : 1;
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
    const rawLvl = Number(node.levelNumber);
    const lvl = Number.isFinite(rawLvl) && rawLvl >= 1 ? rawLvl : 1;
    const rowIndex = levelRowIndexMap[lvl] !== undefined ? levelRowIndexMap[lvl] : 0;
    const rowY = rowIndex * LEVEL_ROW_GAP + 55;
    const rawX = Number(xPositions[node.id]) || 0;
    const nodeX = rawX + 165;

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
    const rawLvl = Number(n.levelNumber);
    const lvl = Number.isFinite(rawLvl) && rawLvl >= 1 ? rawLvl : 1;
    levelCounts[lvl] = (levelCounts[lvl] || 0) + 1;
    if (n.levelName && !levelNames[lvl]) {
      levelNames[lvl] = String(n.levelName);
    }
  });

  const totalWidth = Math.max(SCREEN_WIDTH * 1.6, maxComputedX + 120);
  const totalHeight = Math.max(400, presentLevels.length * LEVEL_ROW_GAP + 180);

  const levelTapes = presentLevels.map((lvl) => {
    const rowIndex = levelRowIndexMap[lvl] !== undefined ? levelRowIndexMap[lvl] : 0;
    const rowY = rowIndex * LEVEL_ROW_GAP + 15;

    return {
      levelNumber: lvl,
      levelName: levelNames[lvl] || `Level ${lvl}`,
      count: levelCounts[lvl] || 0,
      y: rowY,
      height: 185,
    };
  });

  // Hardware-Safe React Native View-Based Connection Line Segments (Zero GPU/Texture crash risk)
  const edgeSegments = [];
  if (Array.isArray(edges)) {
    edges.forEach((edge, eIdx) => {
      const sourceNode = layoutedNodesMap[edge.source];
      const targetNode = layoutedNodesMap[edge.target];

      if (
        sourceNode &&
        targetNode &&
        Number.isFinite(sourceNode.x) &&
        Number.isFinite(sourceNode.y) &&
        Number.isFinite(targetNode.x) &&
        Number.isFinite(targetNode.y)
      ) {
        const sourceX = sourceNode.x + CARD_WIDTH / 2;
        const sourceY = sourceNode.y + 130;
        const targetX = targetNode.x + CARD_WIDTH / 2;
        const targetY = targetNode.y;

        const gap = targetY - sourceY;
        const busY = sourceY + Math.min(24, Math.max(12, gap / 2));

        // 1. Vertical stem down from parent
        edgeSegments.push({
          id: `stem-parent-${eIdx}`,
          left: sourceX - 1,
          top: sourceY,
          width: 2,
          height: Math.max(1, busY - sourceY),
        });

        // 2. Horizontal bus bar
        const minX = Math.min(sourceX, targetX);
        const maxX = Math.max(sourceX, targetX);
        if (maxX - minX > 2) {
          edgeSegments.push({
            id: `bus-${eIdx}`,
            left: minX,
            top: busY - 1,
            width: Math.max(2, maxX - minX),
            height: 2,
          });
        }

        // 3. Vertical drop to child
        edgeSegments.push({
          id: `stem-child-${eIdx}`,
          left: targetX - 1,
          top: busY,
          width: 2,
          height: Math.max(1, targetY - busY),
        });
      }
    });
  }

  return {
    layoutedNodes,
    levelTapes,
    edgeSegments,
    totalWidth: Number.isFinite(totalWidth) ? totalWidth : SCREEN_WIDTH,
    totalHeight: Number.isFinite(totalHeight) ? totalHeight : 600,
  };
};

const OrgChartMain = ({ navigation }) => {
  const [rawNodes, setRawNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDept, setSelectedDept] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [hasError, setHasError] = useState(false);

  // 2D Pan and Zoom Animation State
  const [viewportSize, setViewportSize] = useState({ width: SCREEN_WIDTH, height: SCREEN_HEIGHT - 220 });
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const currentPan = useRef({ x: 0, y: 0 });
  const scale = useRef(new Animated.Value(0.85)).current;
  const currentScale = useRef(0.85);

  // Multi-touch pinch tracking refs
  const pinchStartDistance = useRef(0);
  const pinchStartScale = useRef(0.85);

  const fetchOrgChart = useCallback(async () => {
    try {
      console.log('[OrgChart 📊] 1. Starting fetchOrgChart()...');
      setLoading(true);
      setHasError(false);
      const res = await api.get('/admin/console/org-chart-tree?department=all');
      if (res?.data?.success) {
        const flatNodes = Array.isArray(res.data.flatNodes) ? res.data.flatNodes : [];
        console.log('[OrgChart 📊] 2. Received API payload with', flatNodes.length, 'flat nodes.');
        // Normalize nodes defensively
        const normalized = flatNodes.map((item, idx) => ({
          ...item,
          id: String(item.id || item._id || `node-${idx}`),
          name: String(item.name || 'Employee'),
          department: String(item.department || 'General'),
          designation: String(item.designation || 'Staff'),
          roleCode: String(item.roleCode || 'N/A'),
          levelNumber: Number(item.levelNumber) || 1,
          reportsToId: item.reportsToId ? String(item.reportsToId) : null,
          profileImage: item.profileImage || null,
        }));
        console.log('[OrgChart 📊] 3. Successfully normalized', normalized.length, 'nodes.');
        setRawNodes(normalized);
      } else {
        console.warn('[OrgChart ⚠️] API returned success: false or empty response');
        setRawNodes([]);
      }
    } catch (err) {
      console.error('[OrgChart ❌] Load error:', err?.message);
      setHasError(true);
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

  // Extract distinct departments
  const departments = useMemo(() => {
    const hiddenAdminRoles = ['superadmin', 'super_admin', 'company_admin', 'hr_admin', 'store_admin', 'account_admin'];
    const hiddenAdminRoleCodes = ['TCSA1', 'TCCA1', 'SUPERADMIN', 'COMPANY_ADMIN', 'HR_ADMIN', 'STORE_ADMIN', 'ACCOUNT_ADMIN', 'TCSTR1', 'TCACC1', 'TCSF2A'];

    const set = new Set();
    rawNodes.forEach((node) => {
      const r = String(node.role || '').toLowerCase();
      const rc = String(node.roleCode || '').toUpperCase();
      const n = String(node.name || '').toLowerCase();
      const lvlName = String(node.levelName || '');

      if (
        !hiddenAdminRoles.includes(r) &&
        !hiddenAdminRoleCodes.includes(rc) &&
        lvlName !== 'Super Admin' &&
        !n.includes('super admin') &&
        node.department
      ) {
        set.add(String(node.department));
      }
    });
    return ['all', ...Array.from(set).sort()];
  }, [rawNodes]);

  // Filter nodes by Department & Search
  const filteredNodes = useMemo(() => {
    const hiddenAdminRoles = ['superadmin', 'super_admin', 'company_admin', 'hr_admin', 'store_admin', 'account_admin'];
    const hiddenAdminRoleCodes = ['TCSA1', 'TCCA1', 'SUPERADMIN', 'COMPANY_ADMIN', 'HR_ADMIN', 'STORE_ADMIN', 'ACCOUNT_ADMIN', 'TCSTR1', 'TCACC1', 'TCSF2A'];

    let list = rawNodes.filter((node) => {
      const r = String(node.role || '').toLowerCase();
      const rc = String(node.roleCode || '').toUpperCase();
      const n = String(node.name || '').toLowerCase();
      const lvlName = String(node.levelName || '');

      return (
        !hiddenAdminRoles.includes(r) &&
        !hiddenAdminRoleCodes.includes(rc) &&
        lvlName !== 'Super Admin' &&
        !n.includes('super admin')
      );
    });

    // Department Filter
    if (selectedDept && selectedDept !== 'all') {
      const targetDept = String(selectedDept).toLowerCase().trim();
      list = list.filter(
        (node) => String(node.department || '').toLowerCase().trim() === targetDept
      );
    }

    // Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((node) => {
        const name = String(node.name || '').toLowerCase();
        const roleCode = String(node.roleCode || '').toLowerCase();
        const designation = String(node.designation || '').toLowerCase();
        const department = String(node.department || '').toLowerCase();
        return name.includes(q) || roleCode.includes(q) || designation.includes(q) || department.includes(q);
      });
    }

    console.log('[OrgChart 📊] 4. Filtered nodes count:', list.length, '(dept:', selectedDept, ', query:', searchQuery || 'none)');
    return list;
  }, [rawNodes, selectedDept, searchQuery]);

  // Compute Layout
  const layoutResult = useMemo(() => {
    try {
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

      const res = calculateOrgChartLayout(filteredNodes, edges);
      console.log('[OrgChart 📊] 5. Computed layout successfully:', res.layoutedNodes.length, 'nodes,', res.edgeSegments.length, 'line segments, dimensions:', Math.round(res.totalWidth), 'x', Math.round(res.totalHeight));
      return res;
    } catch (e) {
      console.error('[OrgChart ❌] Layout calculation error:', e?.message);
      return { layoutedNodes: [], levelTapes: [], edgeSegments: [], totalWidth: SCREEN_WIDTH, totalHeight: 400 };
    }
  }, [filteredNodes]);

  // Initial fit scale
  const initialFitScale = useMemo(() => {
    if (!layoutResult || !layoutResult.totalWidth || layoutResult.totalWidth === 0) return 0.85;
    const padding = 20;
    const availableWidth = SCREEN_WIDTH - padding;
    const fitScale = availableWidth / layoutResult.totalWidth;
    const clamped = Math.min(1.0, Math.max(0.25, fitScale));
    return Number.isFinite(clamped) ? Number(clamped.toFixed(2)) : 0.85;
  }, [layoutResult]);

  // Centering math to position the top leadership node in the viewport
  const getCenterPan = useCallback((targetScale = initialFitScale) => {
    if (!layoutResult || !layoutResult.layoutedNodes || layoutResult.layoutedNodes.length === 0) {
      return { x: 0, y: 0 };
    }

    const rootNode = layoutResult.layoutedNodes.find((n) => (Number(n.levelNumber) || 1) === 1) || layoutResult.layoutedNodes[0];
    const targetX = rootNode && Number.isFinite(rootNode.x) ? (rootNode.x + CARD_WIDTH / 2) : (layoutResult.totalWidth / 2);
    const targetY = rootNode && Number.isFinite(rootNode.y) ? (rootNode.y + CARD_HEIGHT / 2) : 100;

    const canvasCenterX = (layoutResult.totalWidth || SCREEN_WIDTH) / 2;
    const canvasCenterY = (layoutResult.totalHeight || 400) / 2;

    const vpW = viewportSize.width || SCREEN_WIDTH;
    const vpH = viewportSize.height || (SCREEN_HEIGHT - 220);

    const safeScale = Number.isFinite(targetScale) && targetScale > 0 ? targetScale : 0.85;
    const calculatedX = (vpW / 2) - canvasCenterX - (targetX - canvasCenterX) * safeScale;
    const calculatedY = (vpH * 0.26) - canvasCenterY - (targetY - canvasCenterY) * safeScale;

    return {
      x: Number.isFinite(calculatedX) ? Math.round(calculatedX) : 0,
      y: Number.isFinite(calculatedY) ? Math.round(calculatedY) : 0,
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

  const calcDistance = (touch1, touch2) => {
    const dx = touch1.pageX - touch2.pageX;
    const dy = touch1.pageY - touch2.pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Pure React Native Multi-directional 2D PanResponder with built-in pinch zoom math
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (evt, gestureState) => {
          const touches = evt.nativeEvent.touches || [];
          return touches.length >= 2 || Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3;
        },
        onMoveShouldSetPanResponderCapture: (evt, gestureState) => {
          const touches = evt.nativeEvent.touches || [];
          return touches.length >= 2 || Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3;
        },
        onPanResponderGrant: (evt) => {
          const touches = evt.nativeEvent.touches || [];
          if (touches.length >= 2) {
            pinchStartDistance.current = calcDistance(touches[0], touches[1]);
            pinchStartScale.current = currentScale.current;
          }

          pan.setOffset({
            x: currentPan.current.x,
            y: currentPan.current.y,
          });
          pan.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: (evt, gestureState) => {
          const touches = evt.nativeEvent.touches || [];
          // Multi-touch Pinch to Zoom
          if (touches.length >= 2 && pinchStartDistance.current > 0) {
            const currentDist = calcDistance(touches[0], touches[1]);
            if (currentDist > 0) {
              const ratio = currentDist / pinchStartDistance.current;
              const newScale = Math.min(2.5, Math.max(0.2, pinchStartScale.current * ratio));
              if (Number.isFinite(newScale)) {
                scale.setValue(newScale);
                currentScale.current = newScale;
              }
            }
          } else {
            // 1-Finger Pan Drag
            pan.setValue({
              x: Number.isFinite(gestureState.dx) ? gestureState.dx : 0,
              y: Number.isFinite(gestureState.dy) ? gestureState.dy : 0,
            });
          }
        },
        onPanResponderRelease: (evt, gestureState) => {
          pan.flattenOffset();
          const finalX = currentPan.current.x + (Number.isFinite(gestureState.dx) ? gestureState.dx : 0);
          const finalY = currentPan.current.y + (Number.isFinite(gestureState.dy) ? gestureState.dy : 0);
          currentPan.current.x = Number.isFinite(finalX) ? finalX : 0;
          currentPan.current.y = Number.isFinite(finalY) ? finalY : 0;
          pinchStartDistance.current = 0;
        },
        onPanResponderTerminate: () => {
          pan.flattenOffset();
          pinchStartDistance.current = 0;
        },
      }),
    [pan, scale]
  );

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
            const isSelected = String(selectedDept).toLowerCase() === String(dept).toLowerCase();
            const theme = getDepartmentTheme(dept === 'all' ? '' : dept);

            return (
              <TouchableOpacity
                key={String(dept)}
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

      {/* Main Touch-Interactive 2D Canvas Viewport */}
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
      ) : hasError ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#f8fafc' }}>
          <Network size={44} color="#f43f5e" />
          <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 16, marginTop: 12 }}>
            Unable to Load Org Chart
          </Text>
          <Text style={{ color: '#64748b', fontWeight: '600', fontSize: 12, textAlign: 'center', marginTop: 4 }}>
            An issue occurred while loading hierarchy data.
          </Text>
          <TouchableOpacity
            onPress={fetchOrgChart}
            style={{ marginTop: 16, backgroundColor: '#4f46e5', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 }}
          >
            <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 12 }}>Retry Loading</Text>
          </TouchableOpacity>
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

            {/* 2. Hardware-Safe Pure View-Based Orthogonal Connection Lines (0MB GPU Texture Overhead) */}
            {layoutResult.edgeSegments.map((seg) => (
              <View
                key={seg.id}
                style={{
                  position: 'absolute',
                  left: seg.left,
                  top: seg.top,
                  width: seg.width,
                  height: seg.height,
                  backgroundColor: '#64748b',
                  borderRadius: 1,
                }}
              />
            ))}

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
                            {String(emp.name || 'U').charAt(0).toUpperCase()}
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
                          {String(selectedNode.name || 'U').charAt(0).toUpperCase()}
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

// React Error Boundary to safely prevent any unexpected runtime crash from closing the APK
class OrgChartErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorInfo: error?.message || 'Unknown error' };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[OrgChart ErrorBoundary ❌] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
          <Network size={48} color="#f43f5e" />
          <Text style={{ color: '#ffffff', fontWeight: '900', fontSize: 18, marginTop: 16 }}>
            Organization Chart Error
          </Text>
          <Text style={{ color: '#94a3b8', fontWeight: '600', fontSize: 12, textAlign: 'center', marginTop: 8 }}>
            An unexpected error occurred while rendering the hierarchy map.
          </Text>
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false })}
            style={{ marginTop: 24, backgroundColor: '#4f46e5', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14 }}
          >
            <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 13 }}>Reload Screen</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => this.props.navigation?.goBack()}
            style={{ marginTop: 12, paddingVertical: 8 }}
          >
            <Text style={{ color: '#64748b', fontWeight: '700', fontSize: 12 }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const OrgChartScreen = (props) => {
  return (
    <OrgChartErrorBoundary navigation={props.navigation}>
      <OrgChartMain {...props} />
    </OrgChartErrorBoundary>
  );
};

export default OrgChartScreen;
