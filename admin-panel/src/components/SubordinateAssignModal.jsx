import React, { useState, useEffect } from 'react';
import { 
  X, Search, CheckSquare, Square, ChevronDown, ChevronRight, 
  Users, UserCheck, Shield, Building, AlertCircle, Loader2, Save 
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';

const SubordinateAssignModal = ({ isOpen, onClose, parentUserId, parentName, parentRoleCode, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState(null);
  const [selectedMap, setSelectedMap] = useState({}); // { empId: boolean }
  const [expandedGroups, setExpandedGroups] = useState({}); // { levelId: boolean }
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isOpen && parentUserId) {
      fetchSelectableSubordinates();
    } else {
      setData(null);
      setSelectedMap({});
      setExpandedGroups({});
      setSearchQuery('');
    }
  }, [isOpen, parentUserId]);

  const fetchSelectableSubordinates = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/console/selectable-subordinates?parentUserId=${parentUserId}`);

      if (res.data.success) {
        setData(res.data);
        
        // Initialize selected map with employees currently reporting to this parent
        const initialSelected = {};
        const initialExpanded = {};

        res.data.groupedByLevel.forEach(group => {
          initialExpanded[group.levelId] = true; // Expand all groups by default
          group.employees.forEach(emp => {
            if (emp.isAssignedToParent) {
              initialSelected[emp._id] = true;
            }
          });
        });

        setSelectedMap(initialSelected);
        setExpandedGroups(initialExpanded);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load selectable employees');
    } finally {
      setLoading(false);
    }
  };

  const toggleEmployeeSelect = (empId) => {
    setSelectedMap(prev => ({
      ...prev,
      [empId]: !prev[empId]
    }));
  };

  const toggleGroupSelectAll = (groupEmployees) => {
    const allSelectedInGroup = groupEmployees.every(emp => selectedMap[emp._id]);
    
    setSelectedMap(prev => {
      const updated = { ...prev };
      groupEmployees.forEach(emp => {
        updated[emp._id] = !allSelectedInGroup;
      });
      return updated;
    });
  };

  const toggleGroupExpand = (levelId) => {
    setExpandedGroups(prev => ({
      ...prev,
      [levelId]: !prev[levelId]
    }));
  };

  const handleSave = async () => {
    if (!parentUserId) return;
    setSaving(true);

    try {
      const selectedIds = Object.keys(selectedMap).filter(id => selectedMap[id]);
      
      // Determine unassigned IDs (employees previously assigned to parent but now unchecked)
      const unassignedIds = [];
      data.groupedByLevel.forEach(group => {
        group.employees.forEach(emp => {
          if (emp.isAssignedToParent && !selectedMap[emp._id]) {
            unassignedIds.push(emp._id);
          }
        });
      });

      const res = await api.post('/admin/console/assign-subordinates', {
        parentUserId,
        subordinateUserIds: selectedIds,
        unassignUserIds: unassignedIds,
      });

      if (res.data.success) {
        toast.success(res.data.message || 'Subordinates updated successfully!');
        if (onSuccess) onSuccess();
        onClose();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update subordinate assignments');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const totalSelectedCount = Object.values(selectedMap).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-100">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <Users size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold">Assign Direct Subordinates</h2>
              <p className="text-xs text-slate-300">
                Reporting Manager: <span className="font-semibold text-white">{parentName || data?.parentUser?.name || 'Manager'}</span> 
                {parentRoleCode || data?.parentUser?.roleCode ? ` (${parentRoleCode || data?.parentUser?.roleCode})` : ''}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Manager Info & Quick Search */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text"
                placeholder="Search employee name, role code, or department..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
              <span className="text-xs text-slate-500 font-medium">Selected:</span>
              <span className="px-3 py-1 bg-indigo-100 text-indigo-700 font-bold rounded-full text-xs">
                {totalSelectedCount} Employees
              </span>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Loader2 className="animate-spin mb-3 text-indigo-600" size={36} />
              <p className="text-sm font-medium">Reading Parent-Child rules & loading available employees...</p>
            </div>
          ) : !data || data.groupedByLevel.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300">
              <AlertCircle className="mx-auto mb-2 text-slate-400" size={32} />
              <p className="text-sm font-medium text-slate-600">No selectable child role employees found for this position.</p>
              <p className="text-xs text-slate-400 mt-1">Make sure Parent-Child Hierarchy Rules are configured in Super Admin Console.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {data.groupedByLevel.map(group => {
                // Filter employees by search query
                const filteredEmployees = group.employees.filter(emp => 
                  emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  emp.roleCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  emp.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  (emp.designation && emp.designation.toLowerCase().includes(searchQuery.toLowerCase()))
                );

                if (searchQuery && filteredEmployees.length === 0) return null;

                const isExpanded = expandedGroups[group.levelId];
                const allSelected = filteredEmployees.length > 0 && filteredEmployees.every(e => selectedMap[e._id]);
                const selectedInGroupCount = filteredEmployees.filter(e => selectedMap[e._id]).length;

                return (
                  <div key={group.levelId} className="border border-slate-200 rounded-xl overflow-hidden shadow-xs bg-white">
                    
                    {/* Accordion Group Header */}
                    <div 
                      className="px-4 py-3 bg-slate-100/80 hover:bg-slate-100 flex items-center justify-between cursor-pointer border-b border-slate-200 transition-colors"
                      onClick={() => toggleGroupExpand(group.levelId)}
                    >
                      <div className="flex items-center gap-3">
                        <button className="text-slate-500 hover:text-slate-700">
                          {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        </button>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 text-sm">{group.levelName}</span>
                          <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-xs font-semibold rounded-md">
                            {group.category}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4" onClick={e => e.stopPropagation()}>
                        <span className="text-xs text-slate-500 font-medium">
                          {selectedInGroupCount} of {filteredEmployees.length} Selected
                        </span>

                        <button 
                          type="button"
                          onClick={() => toggleGroupSelectAll(filteredEmployees)}
                          className="flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 shadow-2xs transition-colors"
                        >
                          {allSelected ? (
                            <>
                              <CheckSquare size={14} className="text-indigo-600" />
                              Deselect All
                            </>
                          ) : (
                            <>
                              <Square size={14} className="text-slate-400" />
                              Select All
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Accordion Group Content */}
                    {isExpanded && (
                      <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2.5 bg-slate-50/50">
                        {filteredEmployees.map(emp => {
                          const isSelected = !!selectedMap[emp._id];

                          return (
                            <div 
                              key={emp._id}
                              onClick={() => toggleEmployeeSelect(emp._id)}
                              className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                                isSelected 
                                  ? 'bg-indigo-50/80 border-indigo-300 ring-1 ring-indigo-400 shadow-xs' 
                                  : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-center gap-3 overflow-hidden">
                                <div className="relative">
                                  {emp.profileImage ? (
                                    <img src={emp.profileImage} alt={emp.name} className="w-10 h-10 rounded-full object-cover border border-slate-200" />
                                  ) : (
                                    <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-600 font-bold flex items-center justify-center text-sm border border-slate-300">
                                      {emp.name.charAt(0)}
                                    </div>
                                  )}
                                  <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${emp.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                </div>

                                <div className="truncate">
                                  <h4 className="text-sm font-bold text-slate-800 truncate">{emp.name}</h4>
                                  <p className="text-xs text-slate-500 truncate">{emp.designation || 'Staff'} • {emp.department}</p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 font-mono text-[10px] font-bold rounded border border-slate-200">
                                      {emp.roleCode}
                                    </span>
                                    {emp.reportsTo && (
                                      <span className="text-[10px] text-slate-400 truncate">
                                        Reports: {emp.reportsTo.name}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="ml-2">
                                {isSelected ? (
                                  <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-2xs">
                                    <CheckSquare size={16} />
                                  </div>
                                ) : (
                                  <div className="w-6 h-6 rounded-lg border-2 border-slate-300 text-transparent flex items-center justify-center hover:border-slate-400">
                                    <Square size={16} />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between">
          <button 
            type="button" 
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
          >
            Cancel
          </button>

          <button 
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-md transition-all disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                Saving Subordinates...
              </>
            ) : (
              <>
                <Save size={18} />
                Save & Update Reporting Chain ({totalSelectedCount})
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};

export default SubordinateAssignModal;
