import React, { useState, useEffect } from 'react';
import { 
  Shield, Layers, Save, Trash2, Plus, AlertCircle, Loader2, CheckCircle2, UserCheck, Settings2 
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';

const HierarchyRuleConfig = () => {
  const [loading, setLoading] = useState(false);
  const [levels, setLevels] = useState([]);
  const [rules, setRules] = useState([]);
  
  // Rule Edit state
  const [selectedParentLevel, setSelectedParentLevel] = useState('');
  const [allowedChildLevelIds, setAllowedChildLevelIds] = useState([]);
  const [maxDirectReports, setMaxDirectReports] = useState(15);
  const [minDirectReports, setMinDirectReports] = useState(1);
  const [canManageMultipleDepartments, setCanManageMultipleDepartments] = useState(true);
  const [canManageCrossDepartment, setCanManageCrossDepartment] = useState(true);
  const [approvalLevel, setApprovalLevel] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchLevelsAndRules();
  }, []);

  const fetchLevelsAndRules = async () => {
    setLoading(true);
    try {
      const [levelsRes, rulesRes] = await Promise.all([
        api.get('/admin/console/levels'),
        api.get('/admin/console/parent-child-rules'),
      ]);

      if (levelsRes.data.success) {
        setLevels(levelsRes.data.data);
      }
      if (rulesRes.data.success) {
        setRules(rulesRes.data.data);
      }
    } catch (err) {
      toast.error('Failed to load levels and parent-child rules');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectParentLevel = (parentLevelId) => {
    setSelectedParentLevel(parentLevelId);
    
    // Find existing rule if present
    const existingRule = rules.find(r => r.parentLevel && (r.parentLevel._id === parentLevelId || r.parentLevel === parentLevelId));
    if (existingRule) {
      setAllowedChildLevelIds(existingRule.allowedChildLevels.map(c => typeof c === 'object' ? c._id : c));
      setMaxDirectReports(existingRule.maxDirectReports || 15);
      setMinDirectReports(existingRule.minDirectReports || 1);
      setCanManageMultipleDepartments(existingRule.canManageMultipleDepartments !== undefined ? existingRule.canManageMultipleDepartments : true);
      setCanManageCrossDepartment(existingRule.canManageCrossDepartment !== undefined ? existingRule.canManageCrossDepartment : true);
      setApprovalLevel(existingRule.approvalLevel || 1);
    } else {
      // Default: child levels with levelNumber > selected levelNumber
      const parentLvl = levels.find(l => l._id === parentLevelId);
      if (parentLvl) {
        const defaultChildren = levels
          .filter(l => l.levelNumber > parentLvl.levelNumber)
          .map(l => l._id);
        setAllowedChildLevelIds(defaultChildren);
      } else {
        setAllowedChildLevelIds([]);
      }
      setMaxDirectReports(15);
      setMinDirectReports(1);
      setCanManageMultipleDepartments(true);
      setCanManageCrossDepartment(true);
      setApprovalLevel(1);
    }
  };

  const toggleChildLevelSelect = (levelId) => {
    setAllowedChildLevelIds(prev => 
      prev.includes(levelId) ? prev.filter(id => id !== levelId) : [...prev, levelId]
    );
  };

  const handleSaveRule = async (e) => {
    e.preventDefault();
    if (!selectedParentLevel) {
      toast.error('Please select a Parent Role / Level');
      return;
    }

    setSaving(true);
    try {
      const res = await api.post('/admin/console/parent-child-rules', {
        parentLevelId: selectedParentLevel,
        allowedChildLevelIds,
        maxDirectReports: Number(maxDirectReports),
        minDirectReports: Number(minDirectReports),
        canManageMultipleDepartments,
        canManageCrossDepartment,
        approvalLevel: Number(approvalLevel),
      });

      if (res.data.success) {
        toast.success('Parent-Child Hierarchy Rule saved successfully!');
        fetchLevelsAndRules();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save hierarchy rule');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (ruleId) => {
    if (!window.confirm('Are you sure you want to delete this parent-child rule?')) return;

    try {
      await api.delete(`/admin/console/parent-child-rules/${ruleId}`);
      toast.success('Rule deleted');
      fetchLevelsAndRules();
    } catch (err) {
      toast.error('Failed to delete rule');
    }
  };

  const selectedParentLvlDoc = levels.find(l => l._id === selectedParentLevel);

  return (
    <div className="space-y-6">
      
      {/* Header Info */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-6 rounded-2xl text-white shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
            <Layers size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold">Parent-Child Hierarchy Rule Master</h2>
            <p className="text-xs text-slate-300">
              Configure allowed subordinate roles, report limits, and department authority per level without hardcoding.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <Loader2 className="animate-spin mb-2 text-indigo-600" size={32} />
          <p className="text-sm font-medium">Loading Hierarchy Master & Rules...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left Column: Form Editor */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Settings2 className="text-indigo-600" size={20} />
              Configure Role Management Rule
            </h3>

            <form onSubmit={handleSaveRule} className="space-y-6">
              
              {/* Select Parent Level */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Select Parent Role / Level:
                </label>
                <select 
                  value={selectedParentLevel}
                  onChange={e => handleSelectParentLevel(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- Choose Parent Role (e.g. Manager, VP, CEO) --</option>
                  {levels.map(l => (
                    <option key={l._id} value={l._id}>
                      Level {l.levelNumber}: {l.name} [{l.category}]
                    </option>
                  ))}
                </select>
              </div>

              {selectedParentLevel && (
                <>
                  {/* Allowed Child Roles Checkbox Grid */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Allowed Subordinate Child Roles:
                      </label>
                      <span className="text-xs text-indigo-600 font-semibold">
                        {allowedChildLevelIds.length} Roles Allowed
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto p-3 bg-slate-50 rounded-xl border border-slate-200">
                      {levels.map(lvl => {
                        if (lvl._id === selectedParentLevel) return null; // Cannot manage self

                        const isChecked = allowedChildLevelIds.includes(lvl._id);
                        const isLowerNumber = selectedParentLvlDoc && lvl.levelNumber > selectedParentLvlDoc.levelNumber;

                        return (
                          <div 
                            key={lvl._id}
                            onClick={() => toggleChildLevelSelect(lvl._id)}
                            className={`p-3 rounded-lg border flex items-center justify-between cursor-pointer transition-all ${
                              isChecked 
                                ? 'bg-indigo-50 border-indigo-300 text-indigo-950 font-semibold shadow-2xs' 
                                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-md bg-slate-200 text-slate-700 font-mono text-xs font-bold flex items-center justify-center">
                                {lvl.levelNumber}
                              </span>
                              <span className="text-sm font-medium">{lvl.name}</span>
                            </div>
                            <input 
                              type="checkbox" 
                              checked={isChecked}
                              onChange={() => {}} // Handled by parent div
                              className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Rule Constraints & Limits */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Max Direct Reports Limit:</label>
                      <input 
                        type="number"
                        min="1"
                        max="200"
                        value={maxDirectReports}
                        onChange={e => setMaxDirectReports(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Approval Step Level:</label>
                      <input 
                        type="number"
                        min="1"
                        max="10"
                        value={approvalLevel}
                        onChange={e => setApprovalLevel(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-800"
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <input 
                        type="checkbox"
                        id="canManageCrossDept"
                        checked={canManageCrossDepartment}
                        onChange={e => setCanManageCrossDepartment(e.target.checked)}
                        className="w-4 h-4 text-indigo-600 rounded"
                      />
                      <label htmlFor="canManageCrossDept" className="text-xs font-semibold text-slate-700 cursor-pointer">
                        Can Manage Cross-Department Staff
                      </label>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <input 
                        type="checkbox"
                        id="canManageMultiDept"
                        checked={canManageMultipleDepartments}
                        onChange={e => setCanManageMultipleDepartments(e.target.checked)}
                        className="w-4 h-4 text-indigo-600 rounded"
                      />
                      <label htmlFor="canManageMultiDept" className="text-xs font-semibold text-slate-700 cursor-pointer">
                        Can Manage Multiple Departments
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button 
                      type="submit"
                      disabled={saving}
                      className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-md transition-all disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                      Save Parent-Child Rule
                    </button>
                  </div>
                </>
              )}

            </form>
          </div>

          {/* Right Column: Existing Rules Summary List */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-800 flex items-center justify-between">
              <span>Active Hierarchy Rules</span>
              <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-full">
                {rules.length} Rules
              </span>
            </h3>

            {rules.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                No custom parent-child rules saved yet.
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {rules.map(rule => (
                  <div 
                    key={rule._id}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-200 hover:border-indigo-300 transition-all space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-slate-800 text-white font-bold font-mono text-xs rounded">
                          L{rule.parentLevel?.levelNumber}
                        </span>
                        <span className="font-bold text-slate-800 text-sm">
                          {rule.parentLevel?.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => handleSelectParentLevel(rule.parentLevel?._id)}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg text-xs font-semibold"
                        >
                          Edit
                        </button>
                        <button 
                          onClick={() => handleDeleteRule(rule._id)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="text-xs text-slate-600">
                      <span className="font-semibold text-slate-700">Allowed Subordinates: </span>
                      {rule.allowedChildLevels && rule.allowedChildLevels.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {rule.allowedChildLevels.map(c => (
                            <span key={c._id} className="px-1.5 py-0.5 bg-white border border-slate-200 text-slate-700 font-medium rounded text-[10px]">
                              {c.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="italic text-slate-400">All lower levels</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
};

export default HierarchyRuleConfig;
