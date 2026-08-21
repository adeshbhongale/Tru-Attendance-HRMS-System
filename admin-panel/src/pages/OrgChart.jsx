import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Building2,
  ChevronDown,
  Compass,
  Maximize2,
  Minimize2,
  Network,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';

import EmployeeNode from '../components/EmployeeNode';
import LevelTapeNode from '../components/LevelTapeNode';
import SubordinateAssignModal from '../components/SubordinateAssignModal';
import { DEPARTMENT_PALETTES, getDepartmentTheme } from '../utils/departmentColors';
import { getLayoutedElements } from '../utils/layoutUtils';

// Custom Orthogonal Tree Edge Component (branches in open gap immediately below parent)
const OrgEdge = ({ id, sourceX, sourceY, targetX, targetY, style = {} }) => {
  const gap = targetY - sourceY;
  const busY = sourceY + Math.min(24, Math.max(12, gap / 2));
  const r = 6;
  let path = '';

  if (Math.abs(sourceX - targetX) < 3) {
    path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
  } else if (targetX > sourceX) {
    path = `M ${sourceX} ${sourceY} L ${sourceX} ${busY - r} Q ${sourceX} ${busY} ${sourceX + r} ${busY} L ${targetX - r} ${busY} Q ${targetX} ${busY} ${targetX} ${busY + r} L ${targetX} ${targetY}`;
  } else {
    path = `M ${sourceX} ${sourceY} L ${sourceX} ${busY - r} Q ${sourceX} ${busY} ${sourceX - r} ${busY} L ${targetX + r} ${busY} Q ${targetX} ${busY} ${targetX} ${busY + r} L ${targetX} ${targetY}`;
  }

  return (
    <path
      id={id}
      style={{ stroke: '#475569', strokeWidth: 1.8, fill: 'none', ...style }}
      className="react-flow__edge-path"
      d={path}
    />
  );
};

// Register custom node & edge types
const nodeTypes = {
  employeeNode: EmployeeNode,
  levelTapeNode: LevelTapeNode
};

const edgeTypes = {
  orgEdge: OrgEdge
};

const OrgChartContent = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState(null);
  const [rawFlatNodes, setRawFlatNodes] = useState([]);
  const [allDepartments, setAllDepartments] = useState([]);
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Filters & State
  const [selectedDept, setSelectedDept] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);

  // Modal State for Subordinate Assignment
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedManagerForAssign, setSelectedManagerForAssign] = useState(null);

  // Reports To Manager Dropdown Search State
  const [reportsToDropdownOpen, setReportsToDropdownOpen] = useState(false);
  const [reportsToSearchQuery, setReportsToSearchQuery] = useState('');

  const { fitView, zoomIn, zoomOut, setViewport } = useReactFlow();

  const fetchOrgTree = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/console/org-chart-tree?department=all');

      if (res.data.success) {
        const flatNodes = res.data.flatNodes || [];
        setMetrics(res.data.metrics);
        setRawFlatNodes(flatNodes);

        // Collect all distinct departments for the filter pills/selector
        const depts = [...new Set(flatNodes.map(n => n.department).filter(Boolean))].sort();
        setAllDepartments(depts);

        buildReactFlowGraph(flatNodes, selectedDept, searchQuery);
      }
    } catch (err) {
      toast.error('Failed to load Organization Chart tree');
    } finally {
      setLoading(false);
    }
  }, [selectedDept, searchQuery]);

  useEffect(() => {
    fetchOrgTree();
  }, []);

  useEffect(() => {
    if (rawFlatNodes.length > 0) {
      buildReactFlowGraph(rawFlatNodes, selectedDept, searchQuery);
    }
  }, [selectedDept, searchQuery, rawFlatNodes]);

  const buildReactFlowGraph = (flatNodes, deptFilter, query) => {
    const hiddenAdminRoles = ['superadmin', 'super_admin', 'company_admin', 'hr_admin', 'store_admin', 'account_admin'];
    const hiddenAdminRoleCodes = ['TCSA1', 'TCCA1', 'SUPERADMIN', 'COMPANY_ADMIN', 'HR_ADMIN', 'STORE_ADMIN', 'ACCOUNT_ADMIN', 'TCSTR1', 'TCACC1', 'TCSF2A'];

    // 1. Exclude platform super/company admins
    let filteredNodes = flatNodes.filter(emp =>
      !hiddenAdminRoles.includes((emp.role || '').toLowerCase()) &&
      !hiddenAdminRoleCodes.includes((emp.roleCode || '').toUpperCase()) &&
      emp.levelName !== 'Super Admin' &&
      !emp.name?.toLowerCase().includes('super admin')
    );

    // 2. Department Filtering: When department is selected, show ONLY that department's employees
    if (deptFilter && deptFilter !== 'all') {
      filteredNodes = filteredNodes.filter(emp =>
        (emp.department || '').toLowerCase().trim() === deptFilter.toLowerCase().trim()
      );
    }

    // 3. Search query filtering
    if (query) {
      const q = query.toLowerCase();
      filteredNodes = filteredNodes.filter(emp =>
        emp.name?.toLowerCase().includes(q) ||
        emp.roleCode?.toLowerCase().includes(q) ||
        emp.department?.toLowerCase().includes(q) ||
        emp.designation?.toLowerCase().includes(q)
      );
    }

    const filteredIds = new Set(filteredNodes.map(n => n.id));

    // 4. Transform data into React Flow Employee Single-Box Nodes
    const flowNodes = filteredNodes.map(emp => {
      let lvl = Number(emp.levelNumber);
      if (!lvl || isNaN(lvl)) {
        if (emp.roleCode) {
          const match = emp.roleCode.match(/(\d+)/);
          if (match) lvl = Number(match[1]);
        }
      }
      if (!lvl || isNaN(lvl)) {
        if (emp.levelName) {
          const match = emp.levelName.match(/(\d+)/);
          if (match) lvl = Number(match[1]);
        }
      }
      if (!lvl || isNaN(lvl)) lvl = 10;

      return {
        id: emp.id,
        type: 'employeeNode',
        data: {
          ...emp,
          levelNumber: lvl,
          onAssignSubordinates: (managerData) => {
            setSelectedManagerForAssign(managerData);
            setAssignModalOpen(true);
          }
        },
        position: { x: 0, y: 0 }
      };
    });

    // 5. Transform reporting lines into OrgEdge edges
    const flowEdges = [];
    filteredNodes.forEach(emp => {
      if (emp.reportsToId && filteredIds.has(emp.reportsToId)) {
        flowEdges.push({
          id: `e-${emp.reportsToId}-${emp.id}`,
          source: emp.reportsToId,
          target: emp.id,
          type: 'orgEdge',
          style: { stroke: '#475569', strokeWidth: 1.8 }
        });
      }
    });

    // 6. Compute Auto-Layout placing each employee on their exact corporate Level row
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(flowNodes, flowEdges, 'TB');

    setNodes(layoutedNodes);
    setEdges(layoutedEdges);

    setTimeout(() => {
      fitView({ padding: 0.18, duration: 400 });
    }, 50);
  };

  const handleNodeClick = (event, node) => {
    setSelectedNode(node.data);
  };

  const handleResetCenter = () => {
    fitView({ padding: 0.18, duration: 500 });
  };

  return (
    <div className="space-y-4 font-sans min-h-[88vh] bg-slate-50 p-3 md:p-6 rounded-3xl border border-slate-200/80 shadow-xs">

      {/* Top Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-100">
              <Network size={20} />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                Organization Hierarchy Chart
              </h1>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">
                Multi-Department Reporting Tree &amp; Level Hierarchy Map
              </p>
            </div>
          </div>
        </div>

        {/* Stats & Department Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="bg-white px-3.5 py-1.5 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-2">
            <Users size={14} className="text-indigo-600" />
            <span className="text-xs font-bold text-slate-700">
              {nodes.filter(n => n.type === 'employeeNode').length} Employees Visible
            </span>
          </div>

          <div className="bg-white px-3.5 py-1.5 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-2">
            <Building2 size={14} className="text-violet-600" />
            <span className="text-xs font-bold text-slate-700">
              {allDepartments.length} Departments
            </span>
          </div>
        </div>
      </div>

      {/* Control Bar (Filters & Search) */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[300px]">
          {/* Search Bar */}
          <div className="relative flex-1 min-w-[180px] max-w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Search name, designation, role..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={13} />
              </button>
            )}
          </div>

          {/* Department Filter Selector */}
          <div className="flex items-center gap-2">
            <select
              value={selectedDept}
              onChange={e => setSelectedDept(e.target.value)}
              className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-extrabold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
            >
              <option value="all">🏢 All Departments ({rawFlatNodes.length})</option>
              {allDepartments.map(dept => {
                const count = rawFlatNodes.filter(n => (n.department || '').toLowerCase().trim() === dept.toLowerCase().trim()).length;
                return (
                  <option key={dept} value={dept}>
                    {dept} ({count})
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsFullScreen(prev => !prev)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all text-xs font-bold shadow-md shadow-indigo-100 active:scale-95"
            title={isFullScreen ? "Exit Fullscreen" : "Fullscreen View"}
          >
            {isFullScreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            <span>{isFullScreen ? "Exit" : "Fullscreen"}</span>
          </button>

          <button
            onClick={fetchOrgTree}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors text-xs font-bold border border-slate-200 shadow-2xs active:scale-95"
            title="Reload Chart"
          >
            <RefreshCw size={13} />
            <span>Reload</span>
          </button>
        </div>
      </div>

      {/* Main React Flow Canvas Viewport */}
      <div
        className={
          isFullScreen
            ? "fixed inset-0 z-[3000] bg-white w-screen h-screen p-4 flex flex-col overflow-hidden"
            : "w-full h-[720px] bg-slate-50 rounded-2xl border border-slate-300/80 overflow-hidden relative z-10 shadow-inner"
        }
      >
        {isFullScreen && (
          <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
            <button
              onClick={() => setIsFullScreen(false)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold shadow-xl transition-all cursor-pointer"
            >
              <Minimize2 size={15} />
              <span>Exit Fullscreen</span>
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <RefreshCw className="animate-spin mb-3 text-indigo-600" size={38} />
            <p className="text-sm font-black text-slate-700">Building Organization Tree...</p>
            <p className="text-xs text-slate-400 mt-1">Applying level-wise layout &amp; department color mapping</p>
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center">
            <Network className="mb-3 text-slate-300" size={44} />
            <p className="text-base font-extrabold text-slate-700">No Employees Found</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              No employee matches department &ldquo;{selectedDept}&rdquo; or your search criteria.
            </p>
            <button
              onClick={() => { setSelectedDept('all'); setSearchQuery(''); }}
              className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-100"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={true}
            panOnDrag={true}
            zoomOnScroll={true}
            zoomOnPinch={true}
            panOnScroll={false}
            minZoom={0.15}
            maxZoom={2.5}
            fitView
            fitViewOptions={{ padding: 0.18, minZoom: 0.15, maxZoom: 1.5 }}
            defaultEdgeOptions={{ type: 'orgEdge' }}
            className="cursor-grab active:cursor-grabbing bg-slate-50"
          >
            <Controls
              className="!bg-white !border-slate-200 !shadow-lg !rounded-2xl !p-1"
              showInteractive={false}
            />
            <Background color="#94a3b8" gap={28} size={1} />
          </ReactFlow>
        )}

        {/* Floating Quick Navigation HUD */}
        {!loading && nodes.length > 0 && (
          <div className="absolute bottom-5 right-5 z-40 flex items-center gap-1.5 bg-white/95 backdrop-blur-md px-3 py-2 rounded-2xl border border-slate-200 shadow-xl">
            <button
              onClick={() => zoomIn({ duration: 300 })}
              className="p-2 text-slate-700 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
              title="Zoom In"
            >
              <ZoomIn size={16} />
            </button>
            <button
              onClick={() => zoomOut({ duration: 300 })}
              className="p-2 text-slate-700 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
              title="Zoom Out"
            >
              <ZoomOut size={16} />
            </button>
            <div className="w-[1px] h-4 bg-slate-200 mx-1" />
            <button
              onClick={handleResetCenter}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 rounded-xl text-xs font-bold transition-all"
              title="Fit & Center Whole View"
            >
              <Compass size={14} />
              <span>Center</span>
            </button>
          </div>
        )}
      </div>

      {/* Centered Small Employee Detail Popup Modal Card */}
      {selectedNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-200 relative overflow-hidden space-y-4">

            {/* Top Header & Close Button */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-purple-600 text-white font-black text-lg flex items-center justify-center shadow-xs">
                  {selectedNode.profileImage ? (
                    <img src={selectedNode.profileImage} alt={selectedNode.name || 'User'} className="w-12 h-12 rounded-xl object-cover" />
                  ) : (
                    (selectedNode.name || 'User').charAt(0)
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-snug">{selectedNode.name || 'Employee Profile'}</h3>
                  <p className="text-xs text-slate-500 font-medium">{selectedNode.designation || 'Staff'}</p>
                </div>
              </div>

              <button onClick={() => setSelectedNode(null)} className="p-1.5 text-slate-400 hover:text-slate-700 bg-slate-100 rounded-lg transition-colors cursor-pointer">
                <X size={18} />
              </button>
            </div>

            {/* Badges Grid */}
            <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-400 font-semibold block text-[10px]">Role Code</span>
                <span className="font-mono font-bold text-purple-700">{selectedNode.roleCode || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block text-[10px]">Level</span>
                <span className="font-bold text-slate-800">L{selectedNode.levelNumber || 1}</span>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block text-[10px]">Department</span>
                <span className="font-bold text-slate-800">{selectedNode.department || 'General'}</span>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block text-[10px]">Status</span>
                <span className="font-bold text-emerald-600">🟢 Active</span>
              </div>
            </div>

            {/* Interactive Reports To Manager Dropdown with Search Box */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Reports To Manager</h4>
              <div className="relative">
                <div
                  onClick={() => {
                    setReportsToDropdownOpen(!reportsToDropdownOpen);
                    setReportsToSearchQuery('');
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 hover:border-purple-300 rounded-xl text-xs font-bold text-slate-800 flex justify-between items-center cursor-pointer transition-all"
                >
                  <span className="truncate">
                    {selectedNode.reportsToId
                      ? rawFlatNodes.find(n => n.id === selectedNode.reportsToId)
                        ? `${rawFlatNodes.find(n => n.id === selectedNode.reportsToId).name} (${rawFlatNodes.find(n => n.id === selectedNode.reportsToId).roleCode || 'Manager'} • L${rawFlatNodes.find(n => n.id === selectedNode.reportsToId).levelNumber || 1})`
                        : selectedNode.reportsToName || 'Select Manager'
                      : 'Direct Top Level (No Manager)'}
                  </span>
                  <ChevronDown size={16} className={`text-slate-400 transition-transform shrink-0 ${reportsToDropdownOpen ? 'rotate-180' : ''}`} />
                </div>

                <AnimatePresence>
                  {reportsToDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      className="absolute z-[2500] top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl p-2 max-h-56 overflow-y-auto no-scrollbar"
                    >
                      {/* Search Box */}
                      <div className="p-1 sticky top-0 bg-white z-10 border-b border-slate-100 mb-1">
                        <div className="relative">
                          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Search manager by name, code..."
                            value={reportsToSearchQuery}
                            onChange={(e) => setReportsToSearchQuery(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full pl-7 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                        </div>
                      </div>

                      <div
                        onClick={async () => {
                          try {
                            await api.put(`/employees/${selectedNode.id}`, { reportsTo: null });
                            toast.success(`Updated reporting manager for ${selectedNode.name}`);
                            fetchOrgTree();
                            setSelectedNode(prev => ({ ...prev, reportsToId: null, reportsToName: null }));
                          } catch (err) {
                            toast.error('Failed to update manager');
                          }
                          setReportsToDropdownOpen(false);
                        }}
                        className="p-2 rounded-lg hover:bg-purple-50 text-xs font-bold text-slate-400 hover:text-purple-600 cursor-pointer transition-all flex items-center justify-between"
                      >
                        <span>Direct Top Level (No Manager)</span>
                        {!selectedNode.reportsToId && <div className="w-1.5 h-1.5 rounded-full bg-purple-600" />}
                      </div>

                      {rawFlatNodes
                        .filter(emp => emp.id !== selectedNode.id && emp.role !== 'super_admin' && emp.levelNumber !== 1)
                        .filter(emp => {
                          if (!reportsToSearchQuery.trim()) return true;
                          const q = reportsToSearchQuery.toLowerCase();
                          return (
                            emp.name?.toLowerCase().includes(q) ||
                            emp.roleCode?.toLowerCase().includes(q) ||
                            emp.department?.toLowerCase().includes(q) ||
                            emp.designation?.toLowerCase().includes(q)
                          );
                        })
                        .map(emp => {
                          const currentEmpLevel = Number(selectedNode.levelNumber || selectedNode.roleLevel);
                          const mgrLevel = Number(emp.levelNumber || emp.roleLevel);
                          const isSameLevel = currentEmpLevel && mgrLevel && mgrLevel === currentEmpLevel;
                          const isLowerLevel = currentEmpLevel && mgrLevel && mgrLevel > currentEmpLevel;

                          return (
                            <div
                              key={emp.id}
                              onClick={async () => {
                                if (isSameLevel) {
                                  toast.error(`Cannot select ${emp.name} (Level ${mgrLevel}). Reporting Manager cannot be at the SAME level.`);
                                  return;
                                }
                                if (isLowerLevel) {
                                  toast.error(`Cannot select ${emp.name} (Level ${mgrLevel}). Reporting Manager must be from an above/higher level than Level ${currentEmpLevel}.`);
                                  return;
                                }
                                try {
                                  await api.put(`/employees/${selectedNode.id}`, { reportsTo: emp.id });
                                  toast.success(`Updated reporting manager to ${emp.name}`);
                                  fetchOrgTree();
                                  setSelectedNode(prev => ({
                                    ...prev,
                                    reportsToId: emp.id,
                                    reportsToName: emp.name
                                  }));
                                } catch (err) {
                                  toast.error(err.response?.data?.message || 'Failed to update manager');
                                }
                                setReportsToDropdownOpen(false);
                              }}
                              className={`p-2 rounded-lg text-xs font-bold transition-all flex items-center justify-between ${isSameLevel || isLowerLevel
                                ? 'bg-slate-50/70 opacity-65 hover:bg-rose-50/50 cursor-not-allowed'
                                : 'hover:bg-purple-50 text-slate-700 hover:text-purple-600 cursor-pointer'
                                }`}
                            >
                              <div>
                                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                                  <span>{emp.name} ({emp.roleCode || emp.designation || 'Manager'} • L{emp.levelNumber})</span>
                                  {isSameLevel && (
                                    <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-800 rounded">Same Level</span>
                                  )}
                                  {isLowerLevel && (
                                    <span className="px-1.5 py-0.5 text-[9px] font-bold bg-rose-100 text-rose-800 rounded">Lower Level</span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400">{emp.department || 'General'}</div>
                              </div>
                              {selectedNode.reportsToId === emp.id && <div className="w-1.5 h-1.5 rounded-full bg-purple-600" />}
                            </div>
                          );
                        })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Direct Subordinates List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Direct Subordinates ({selectedNode.children?.length || 0})
                </h4>
                <button
                  onClick={() => {
                    const mgr = selectedNode;
                    setSelectedManagerForAssign(mgr);
                    setAssignModalOpen(true);
                  }}
                  className="text-xs text-purple-600 font-bold hover:underline flex items-center gap-1 bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-100 cursor-pointer"
                >
                  <UserPlus size={14} />
                  Manage List
                </button>
              </div>

              {selectedNode.children && selectedNode.children.length > 0 ? (
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {selectedNode.children.map(child => (
                    <div
                      key={child.id}
                      className="p-2 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between transition-colors text-xs"
                    >
                      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setSelectedNode(child)}>
                        <span className="w-6 h-6 rounded-full bg-slate-200 font-bold text-slate-700 text-[10px] flex items-center justify-center">
                          {(child.name || 'U').charAt(0)}
                        </span>
                        <div>
                          <p className="text-xs font-bold text-slate-800 leading-tight">{child.name || 'Staff'}</p>
                          <p className="text-[10px] text-slate-500">{child.designation || 'Team Member'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[9px] font-bold text-purple-700 px-1.5 py-0.5 bg-purple-50 rounded">
                          {child.roleCode || 'STAFF'}
                        </span>
                        <button
                          title="Remove from reporting team"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              await api.put(`/employees/${child.id}`, { reportsTo: null });
                              toast.success(`Removed ${child.name} from team`);
                              fetchOrgTree();
                              setSelectedNode(prev => ({
                                ...prev,
                                children: prev.children.filter(c => c.id !== child.id),
                                directReportCount: Math.max(0, (prev.directReportCount || 1) - 1)
                              }));
                            } catch (err) {
                              toast.error('Failed to remove subordinate');
                            }
                          }}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 text-center bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-400">
                  No direct reporting subordinates assigned.
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Subordinate Assignment Modal */}
      {selectedManagerForAssign && (
        <SubordinateAssignModal
          isOpen={assignModalOpen}
          onClose={() => {
            setAssignModalOpen(false);
            setSelectedManagerForAssign(null);
          }}
          parentUserId={selectedManagerForAssign.id || selectedManagerForAssign._id}
          parentName={selectedManagerForAssign.name}
          parentRoleCode={selectedManagerForAssign.roleCode}
          onSuccess={fetchOrgTree}
        />
      )}
    </div>
  );
};

const OrgChart = () => {
  return (
    <ReactFlowProvider>
      <OrgChartContent />
    </ReactFlowProvider>
  );
};

export default OrgChart;
