import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Modal,
  Image,
  Dimensions,
  Animated,
} from 'react-native';
import { PinchGestureHandler, State } from 'react-native-gesture-handler';
import Svg, { Path, G } from 'react-native-svg';
import {
  ArrowLeft,
  Network,
  Search,
  Users,
  Layers,
  RefreshCcw,
  X,
  Building2,
  Shield,
  Mail,
  Phone,
  UserCheck,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronRight,
  ChevronDown,
} from 'lucide-react-native';
import api from '../api/axios';
import HRModuleFooter from '../components/HRModuleFooter';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Department-based theme color mapping matching website
const DEPARTMENT_COLORS = {
  'executive': 'purple',
  'management': 'purple',
  'customer support': 'amber',
  'customer service': 'amber',
  'customer relations': 'amber',
  'sales': 'rose',
  'sales & marketing': 'rose',
  'marketing': 'rose',
  'finance': 'blue',
  'accounting': 'blue',
  'human resource': 'teal',
  'human resources': 'teal',
  'hr': 'teal',
  'projects and engineering': 'indigo',
  'engineering': 'indigo',
  'software engineering': 'indigo',
  'it': 'indigo',
  'tech': 'indigo',
  'operations': 'emerald',
  'logistics': 'emerald',
};

const COLOR_PALETTE = ['purple', 'amber', 'blue', 'teal', 'indigo', 'emerald', 'rose'];

const getDepartmentThemeKey = (department, deptMap = {}) => {
  const deptKey = (department || '').toLowerCase().trim();
  if (DEPARTMENT_COLORS[deptKey]) {
    return DEPARTMENT_COLORS[deptKey];
  }
  if (deptMap[deptKey] !== undefined) {
    return COLOR_PALETTE[deptMap[deptKey] % COLOR_PALETTE.length];
  }
  return 'indigo';
};

const THEME_STYLES = {
  purple: {
    border: '#9333ea',
    bannerBg: '#7c3aed',
    bannerText: '#ffffff',
    text: '#9333ea',
    circleBg: '#9333ea',
    lightBg: '#f3e8ff',
  },
  amber: {
    border: '#f59e0b',
    bannerBg: '#d97706',
    bannerText: '#ffffff',
    text: '#d97706',
    circleBg: '#f59e0b',
    lightBg: '#fef3c7',
  },
  blue: {
    border: '#2563eb',
    bannerBg: '#0284c7',
    bannerText: '#ffffff',
    text: '#2563eb',
    circleBg: '#2563eb',
    lightBg: '#dbeafe',
  },
  teal: {
    border: '#0d9488',
    bannerBg: '#0f766e',
    bannerText: '#ffffff',
    text: '#0d9488',
    circleBg: '#0d9488',
    lightBg: '#ccfbf1',
  },
  rose: {
    border: '#e11d48',
    bannerBg: '#f43f5e',
    bannerText: '#ffffff',
    text: '#e11d48',
    circleBg: '#e11d48',
    lightBg: '#ffe4e6',
  },
  indigo: {
    border: '#4f46e5',
    bannerBg: '#6366f1',
    bannerText: '#ffffff',
    text: '#4f46e5',
    circleBg: '#4f46e5',
    lightBg: '#e0e7ff',
  },
  emerald: {
    border: '#059669',
    bannerBg: '#047857',
    bannerText: '#ffffff',
    text: '#059669',
    circleBg: '#059669',
    lightBg: '#dcfce7',
  },
};

const LEVEL_TAPE_THEMES = {
  1: { bg: '#f3e8ff', border: '#d8b4fe', badgeBg: '#7c3aed', badgeText: '#ffffff', text: '#581c87' },
  2: { bg: '#e0e7ff', border: '#c7d2fe', badgeBg: '#4f46e5', badgeText: '#ffffff', text: '#1e1b4b' },
  3: { bg: '#e0f2fe', border: '#bae6fd', badgeBg: '#0284c7', badgeText: '#ffffff', text: '#075985' },
  4: { bg: '#ccfbf1', border: '#99f6e4', badgeBg: '#0d9488', badgeText: '#ffffff', text: '#134e4a' },
  5: { bg: '#dcfce7', border: '#bbf7d0', badgeBg: '#16a34a', badgeText: '#ffffff', text: '#14532d' },
  6: { bg: '#fef9c3', border: '#fef08a', badgeBg: '#ca8a04', badgeText: '#ffffff', text: '#713f12' },
  7: { bg: '#ffedd5', border: '#fed7aa', badgeBg: '#ea580c', badgeText: '#ffffff', text: '#7c2d12' },
  default: { bg: '#f1f5f9', border: '#cbd5e1', badgeBg: '#475569', badgeText: '#ffffff', text: '#0f172a' },
};

const getLevelTapeTheme = (lvl) => LEVEL_TAPE_THEMES[lvl] || LEVEL_TAPE_THEMES.default;

// Card dimensions & spacing for layout calculation engine
const CARD_WIDTH = 165;
const CARD_HEIGHT = 125;
const SIBLING_GAP = 25;
const LEVEL_ROW_GAP = 180;

/**
 * Centered Tree Layout Engine (exact logic matching web app's layoutUtils.js)
 */
const calculateOrgChartLayout = (nodes, edges) => {
  if (!nodes || nodes.length === 0) {
    return { layoutedNodes: [], levelTapes: [], edges: [], totalWidth: 800, totalHeight: 600 };
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

  // Sort children deterministically by level or name
  Object.keys(parentToChildren).forEach((parentId) => {
    parentToChildren[parentId].sort((aId, bId) => {
      const nodeA = nodesMap[aId];
      const nodeB = nodesMap[bId];
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

  // Level-row overlap resolution
  const minCardSpacing = CARD_WIDTH + 25;
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

  // Map levels to sequential indices
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
    const rowY = rowIndex * LEVEL_ROW_GAP + 50;
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

  // Build Level Tapes
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

  const totalWidth = Math.max(SCREEN_WIDTH, maxComputedX + 60);
  const totalHeight = presentLevels.length * LEVEL_ROW_GAP + 150;

  const levelTapes = presentLevels.map((lvl) => {
    const rowIndex = levelRowIndexMap[lvl] !== undefined ? levelRowIndexMap[lvl] : 0;
    const rowY = rowIndex * LEVEL_ROW_GAP + 15;
    const rowNodes = layoutedNodes.filter((n) => {
      const rawLvl = Number(n.levelNumber || 1);
      return (rawLvl >= 1 ? rawLvl : 1) === lvl;
    });

    const minX = rowNodes.length > 0 ? Math.min(...rowNodes.map((n) => n.x)) : 40;
    const maxX = rowNodes.length > 0 ? Math.max(...rowNodes.map((n) => n.x + CARD_WIDTH)) : 205;

    return {
      levelNumber: lvl,
      levelName: levelNames[lvl] || null,
      count: levelCounts[lvl],
      y: rowY,
      height: 155,
      minX,
      maxX,
    };
  });

  // Calculate OrgEdge paths
  const computedEdges = [];
  edges.forEach((edge) => {
    const sourceNode = layoutedNodesMap[edge.source];
    const targetNode = layoutedNodesMap[edge.target];

    if (sourceNode && targetNode) {
      const sourceX = sourceNode.x + CARD_WIDTH / 2;
      const sourceY = sourceNode.y + CARD_HEIGHT;
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rawNodes, setRawNodes] = useState([]);
  const [metrics, setMetrics] = useState({ totalCount: 0, maxLevel: 1, departmentCount: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [scale, setScale] = useState(1.0);

  const baseScaleRef = useRef(1.0);
  const horizontalScrollViewRef = useRef(null);

  const fetchOrgChart = useCallback(async () => {
    try {
      const res = await api.get(`/admin/console/org-chart-tree?department=${selectedDept}`);
      if (res.data && res.data.success) {
        const flat = res.data.flatNodes || [];
        setRawNodes(flat);
        setMetrics(
          res.data.metrics || {
            totalEmployees: flat.length,
            maxLevel: 4,
            totalDepartments: 0,
          }
        );
      } else {
        // Fallback
        const empRes = await api.get('/employees');
        const empList = empRes.data?.data || empRes.data?.employees || empRes.data || [];
        const formatted = empList.map((e) => ({
          id: e._id || e.id,
          name: e.name || e.fullName || 'Employee',
          roleCode: e.roleCode || e.role || '',
          department: e.department?.name || e.department || 'General',
          designation: e.designation?.name || e.designation || 'Staff',
          levelNumber: e.levelRef?.levelNumber || e.level || 3,
          levelName: e.levelRef?.name || `Level ${e.level || 3}`,
          reportsToId: e.reportsTo?._id || e.reportsTo || null,
          reportsToName: e.reportsTo?.name || null,
          profileImage: e.profileImage || null,
          email: e.email || '',
          mobile: e.mobile || e.phone || '',
          status: e.status || 'Active',
        }));
        setRawNodes(formatted);
        setMetrics({ totalEmployees: formatted.length, maxLevel: 3, totalDepartments: 1 });
      }
    } catch (err) {
      console.warn('[OrgChartScreen] Load error:', err?.message);
      try {
        const empRes = await api.get('/employees');
        const empList = Array.isArray(empRes.data?.data)
          ? empRes.data.data
          : Array.isArray(empRes.data)
          ? empRes.data
          : [];
        const formatted = empList.map((e) => ({
          id: e._id || e.id,
          name: e.name || e.fullName || 'Employee',
          roleCode: e.roleCode || e.role || '',
          department: typeof e.department === 'object' ? e.department?.name : e.department || 'General',
          designation:
            typeof e.designation === 'object'
              ? e.designation?.title || e.designation?.name
              : e.designation || 'Staff',
          levelNumber: e.levelRef?.levelNumber || e.roleLevel || 3,
          levelName: e.levelRef?.name || `Level ${e.roleLevel || 3}`,
          reportsToId: e.reportsTo?._id || e.reportsTo || null,
          reportsToName: e.reportsTo?.name || null,
          profileImage: e.profileImage || null,
          email: e.email || '',
          mobile: e.mobile || e.phone || '',
          status: e.status || 'Active',
        }));
        setRawNodes(formatted);
        setMetrics({ totalEmployees: formatted.length, maxLevel: 3, totalDepartments: 1 });
      } catch (fallbackErr) {
        console.warn('[OrgChartScreen] Fallback load error:', fallbackErr?.message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDept]);

  useEffect(() => {
    fetchOrgChart();
  }, [fetchOrgChart]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrgChart();
  };

  // Filter nodes & build graph
  const filteredNodes = useMemo(() => {
    const hiddenAdminRoles = [
      'superadmin',
      'super_admin',
      'company_admin',
      'hr_admin',
      'store_admin',
      'account_admin',
    ];
    const hiddenAdminRoleCodes = [
      'TCSA1',
      'TCCA1',
      'SUPERADMIN',
      'COMPANY_ADMIN',
      'HR_ADMIN',
      'STORE_ADMIN',
      'ACCOUNT_ADMIN',
      'TCSTR1',
      'TCACC1',
      'TCSF2A',
    ];

    let list = rawNodes.filter(
      (emp) =>
        !hiddenAdminRoles.includes((emp.role || '').toLowerCase()) &&
        !hiddenAdminRoleCodes.includes((emp.roleCode || '').toUpperCase()) &&
        emp.levelName !== 'Super Admin' &&
        !emp.name?.toLowerCase().includes('super admin')
    );

    if (selectedDept !== 'all') {
      list = list.filter((n) => (n.department || '').toLowerCase() === selectedDept.toLowerCase());
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (n) =>
          n.name?.toLowerCase().includes(q) ||
          n.designation?.toLowerCase().includes(q) ||
          n.department?.toLowerCase().includes(q) ||
          n.roleCode?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [rawNodes, selectedDept, searchQuery]);

  const departments = useMemo(() => {
    const set = new Set(rawNodes.map((n) => n.department).filter(Boolean));
    return ['all', ...Array.from(set)];
  }, [rawNodes]);

  const deptMap = useMemo(() => {
    const map = {};
    departments.forEach((d, idx) => {
      if (d !== 'all') map[d.toLowerCase().trim()] = idx;
    });
    return map;
  }, [departments]);

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

  // Compute scale so the ENTIRE chart fits within screen width initially
  const initialFitScale = useMemo(() => {
    if (!layoutResult || !layoutResult.totalWidth || layoutResult.totalWidth === 0) return 0.95;
    const padding = 24;
    const availableWidth = SCREEN_WIDTH - padding;
    const fitScale = availableWidth / layoutResult.totalWidth;
    const clamped = Math.min(1.0, Math.max(0.15, fitScale));
    return Number(clamped.toFixed(2));
  }, [layoutResult]);

  // Auto-fit whole org chart box on load or layout change
  useEffect(() => {
    if (initialFitScale) {
      setScale(initialFitScale);
      baseScaleRef.current = initialFitScale;
    }
  }, [initialFitScale]);

  // Hand Pinch-to-Zoom Gesture Event Handlers
  const onPinchGestureEvent = (event) => {
    if (event && event.nativeEvent && event.nativeEvent.scale) {
      const s = baseScaleRef.current * event.nativeEvent.scale;
      const clamped = Math.min(Math.max(s, 0.15), 3.0);
      setScale(Number(clamped.toFixed(3)));
    }
  };

  const onPinchHandlerStateChange = (event) => {
    if (event && event.nativeEvent) {
      if (event.nativeEvent.oldState === State.ACTIVE) {
        const lastScale = baseScaleRef.current * (event.nativeEvent.scale || 1.0);
        const clamped = Math.min(Math.max(lastScale, 0.15), 3.0);
        baseScaleRef.current = clamped;
        setScale(Number(clamped.toFixed(3)));
      }
    }
  };

  const handleZoomIn = () => {
    setScale((prev) => {
      const next = Math.min(3.0, Number((prev + 0.2).toFixed(2)));
      baseScaleRef.current = next;
      return next;
    });
  };

  const handleZoomOut = () => {
    setScale((prev) => {
      const next = Math.max(0.15, Number((prev - 0.2).toFixed(2)));
      baseScaleRef.current = next;
      return next;
    });
  };

  const handleResetZoom = () => {
    setScale(initialFitScale);
    baseScaleRef.current = initialFitScale;
  };

  return (
    <View className="flex-1 bg-[#f0ebfa]">
      <StatusBar barStyle="light-content" backgroundColor="#1972e9" />

      {/* Top App Header */}
      <View className="bg-[#1972e9] pt-12 pb-4 px-5 rounded-b-[28px] shadow-sm flex-row items-center justify-between z-20">
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.goBack()}
          className="w-9 h-9 rounded-full bg-white/15 justify-center items-center"
        >
          <ArrowLeft size={18} color="white" />
        </TouchableOpacity>

        <View className="items-center flex-1 mx-2">
          <Text className="text-white text-[17px] font-extrabold tracking-wide">
            Organization Flowchart
          </Text>
          <Text className="text-white/80 text-[10px] font-bold mt-0.5">
            Ingoude Company • Hierarchy & Reporting
          </Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onRefresh}
          className="w-9 h-9 rounded-full bg-white/15 justify-center items-center"
        >
          <RefreshCcw size={16} color="white" />
        </TouchableOpacity>
      </View>

      {/* Controls Bar: Search & Dept Filters */}
      <View className="bg-white px-4 py-2.5 border-b border-purple-100 shadow-2xs z-10">
        <View className="flex-row items-center gap-2 mb-2">
          {/* Search Box */}
          <View className="flex-1 bg-slate-100 rounded-xl px-3 py-1.5 flex-row items-center gap-2 border border-slate-200">
            <Search size={14} color="#64748b" />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search employee, designation..."
              placeholderTextColor="#94a3b8"
              className="flex-1 text-slate-800 font-semibold text-[12px] p-0"
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <X size={14} color="#94a3b8" />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Scale Indicator Badge */}
          <View className="bg-purple-100 px-2.5 py-1.5 rounded-xl border border-purple-200">
            <Text className="text-purple-800 font-extrabold text-[10px]">
              {Math.round(scale * 100)}%
            </Text>
          </View>
        </View>

        {/* Department Filter Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6 }}
        >
          {departments.map((dept) => {
            const isSelected = selectedDept.toLowerCase() === dept.toLowerCase();
            return (
              <TouchableOpacity
                key={dept}
                activeOpacity={0.8}
                onPress={() => setSelectedDept(dept)}
                className={`px-3 py-1 rounded-lg border text-xs font-bold ${
                  isSelected ? 'bg-purple-700 border-purple-700' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <Text
                  className={`text-[11px] font-bold capitalize ${
                    isSelected ? 'text-white' : 'text-slate-700'
                  }`}
                >
                  {dept === 'all' ? '🏢 All Depts' : dept}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Main Flowchart 2D Scroll Viewport */}
      {loading ? (
        <View className="flex-1 justify-center items-center bg-[#f0ebfa]">
          <ActivityIndicator size="large" color="#7c3aed" />
          <Text className="text-slate-700 font-extrabold text-xs mt-3">
            Building Organization Flowchart...
          </Text>
        </View>
      ) : layoutResult.layoutedNodes.length === 0 ? (
        <View className="flex-1 justify-center items-center p-6 bg-[#f0ebfa]">
          <Network size={44} color="#94a3b8" />
          <Text className="text-slate-800 font-extrabold text-base mt-3">
            No Flowchart Nodes Found
          </Text>
          <Text className="text-slate-500 font-semibold text-xs text-center mt-1">
            Try adjusting your search query or department filter.
          </Text>
        </View>
      ) : (
        <View className="flex-1 relative overflow-hidden bg-[#f0ebfa]">
          <PinchGestureHandler
            onGestureEvent={onPinchGestureEvent}
            onHandlerStateChange={onPinchHandlerStateChange}
          >
            <Animated.View style={{ flex: 1 }}>
              <ScrollView
                ref={horizontalScrollViewRef}
                horizontal
                showsHorizontalScrollIndicator={true}
                contentContainerStyle={{
                  minWidth: layoutResult.totalWidth * scale,
                  paddingRight: 40,
                }}
              >
                <ScrollView
                  showsVerticalScrollIndicator={true}
                  refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#7c3aed']} />
                  }
                  contentContainerStyle={{
                    minWidth: layoutResult.totalWidth * scale,
                    minHeight: layoutResult.totalHeight * scale,
                    paddingBottom: 80,
                  }}
                >
                  {/* Scaled Flowchart Container */}
                  <View
                    style={{
                      width: layoutResult.totalWidth,
                      height: layoutResult.totalHeight,
                      transform: [{ scale: scale }],
                      transformOrigin: 'top left',
                    }}
                    className="relative"
                  >
                    {/* 1. Level-Wise Full Horizontal Color Tapes (Matching Website View) */}
                    {layoutResult.levelTapes.map((tape) => {
                      const theme = getLevelTapeTheme(tape.levelNumber);

                      return (
                        <React.Fragment key={`tape-wrap-${tape.levelNumber}`}>
                          {/* Full-width Horizontal Level Color Tape Band (Website Style) */}
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
                              opacity: 0.85,
                            }}
                          />

                          {/* Left Column Level Info Card */}
                          <View
                            style={{
                              position: 'absolute',
                              top: tape.y + 12,
                              left: 12,
                              width: 140,
                              height: tape.height - 24,
                              backgroundColor: '#ffffff',
                              borderWidth: 1.5,
                              borderLeftWidth: 4,
                              borderColor: theme.border,
                              borderRadius: 16,
                              padding: 10,
                              shadowColor: '#000',
                              shadowOffset: { width: 0, height: 1 },
                              shadowOpacity: 0.08,
                              shadowRadius: 2,
                              elevation: 2,
                            }}
                            className="justify-between"
                          >
                            <View className="gap-1.5">
                              <View
                                style={{ backgroundColor: theme.badgeBg }}
                                className="px-2 py-1 rounded-md self-start"
                              >
                                <Text
                                  style={{ color: theme.badgeText }}
                                  className="font-black text-[9px] uppercase tracking-wider"
                                >
                                  LEVEL {tape.levelNumber}
                                </Text>
                              </View>
                              {tape.levelName && (
                                <Text
                                  style={{ color: theme.text }}
                                  className="font-extrabold text-[10px] uppercase leading-tight"
                                  numberOfLines={2}
                                >
                                  {tape.levelName}
                                </Text>
                              )}
                            </View>
                            <View className="bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 self-start">
                              <Text className="text-slate-800 font-extrabold text-[10px]">
                                👥 {tape.count} {tape.count === 1 ? 'Employee' : 'Employees'}
                              </Text>
                            </View>
                          </View>
                        </React.Fragment>
                      );
                    })}

                    {/* 2. SVG Connection Lines (OrgEdge Paths) */}
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
                            stroke="#334155"
                            strokeWidth={2}
                            fill="none"
                          />
                        ))}
                      </G>
                    </Svg>

                    {/* 3. Read-Only Employee Node Cards */}
                    {layoutResult.layoutedNodes.map((emp) => {
                      const themeKey = getDepartmentThemeKey(emp.department, deptMap);
                      const theme = THEME_STYLES[themeKey] || THEME_STYLES.indigo;
                      const displayTitle = emp.levelName || emp.role || emp.designation || emp.roleCode || 'Staff';

                      return (
                        <View
                          key={emp.id}
                          style={{
                            position: 'absolute',
                            left: emp.x,
                            top: emp.y,
                            width: CARD_WIDTH,
                            height: CARD_HEIGHT,
                          }}
                          className="items-center select-none"
                        >
                          {/* Top Circular Badge with Ring */}
                          <View
                            style={{
                              width: 66,
                              height: 66,
                              borderRadius: 33,
                              backgroundColor: theme.circleBg,
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
                            <View className="w-full h-full rounded-full bg-white p-[2px] items-center justify-center overflow-hidden">
                              {emp.profileImage ? (
                                <Image
                                  source={{ uri: emp.profileImage }}
                                  className="w-full h-full rounded-full"
                                  resizeMode="cover"
                                />
                              ) : (
                                <View
                                  style={{ backgroundColor: theme.lightBg }}
                                  className="w-full h-full rounded-full items-center justify-center"
                                >
                                  <Text
                                    style={{ color: theme.text }}
                                    className="font-black text-xl"
                                  >
                                    {(emp.name || 'U').charAt(0)}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>

                          {/* Employee Name Box */}
                          <View
                            style={{
                              width: 135,
                              borderColor: theme.border,
                              borderWidth: 2,
                              paddingTop: 8,
                              paddingBottom: 3,
                              backgroundColor: '#ffffff',
                              borderRadius: 10,
                              alignItems: 'center',
                              justify: 'center',
                              shadowColor: '#000',
                              shadowOffset: { width: 0, height: 1 },
                              shadowOpacity: 0.08,
                              shadowRadius: 2,
                              elevation: 2,
                            }}
                          >
                            <Text
                              className="text-[13px] font-extrabold text-slate-900 text-center px-1"
                              numberOfLines={1}
                            >
                              {emp.name || 'Employee'}
                            </Text>
                          </View>

                          {/* Designation / Role Banner */}
                          <View
                            style={{
                              width: 115,
                              backgroundColor: theme.bannerBg,
                              borderRadius: 8,
                              paddingVertical: 2,
                              paddingHorizontal: 4,
                              marginTop: 1,
                              alignItems: 'center',
                              justify: 'center',
                              shadowColor: '#000',
                              shadowOffset: { width: 0, height: 1 },
                              shadowOpacity: 0.1,
                              shadowRadius: 2,
                              elevation: 2,
                            }}
                          >
                            <Text
                              style={{ color: theme.bannerText }}
                              className="font-extrabold text-[10px] text-center uppercase tracking-tight"
                              numberOfLines={1}
                            >
                              {displayTitle}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>
              </ScrollView>
            </Animated.View>
          </PinchGestureHandler>

          {/* Floating Canvas Controls (Bottom Left) */}
          <View className="absolute bottom-4 left-4 bg-white/95 rounded-2xl p-1.5 border border-purple-200 shadow-lg flex-row items-center gap-1 z-30">
            <TouchableOpacity
              onPress={handleZoomIn}
              className="w-8 h-8 rounded-xl bg-purple-50 justify-center items-center"
              title="Zoom In"
            >
              <ZoomIn size={16} color="#7c3aed" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleZoomOut}
              className="w-8 h-8 rounded-xl bg-purple-50 justify-center items-center"
              title="Zoom Out"
            >
              <ZoomOut size={16} color="#7c3aed" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleResetZoom}
              className="w-8 h-8 rounded-xl bg-purple-50 justify-center items-center"
              title="Reset View"
            >
              <Maximize2 size={15} color="#7c3aed" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* HR Footer */}
      <HRModuleFooter navigation={navigation} currentScreen="orgChart" />
    </View>
  );
};

export default OrgChartScreen;
