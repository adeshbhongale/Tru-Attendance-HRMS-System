import React, { useState, useEffect } from 'react';
import {
  Shield, Building2, Layers, Award, Users, GitMerge, FileText, CheckCircle2,
  Plus, Edit, Save, Trash2, ArrowRight, UserCheck, Settings, CheckSquare,
  ChevronUp, ChevronDown
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';

const SuperAdminConsole = () => {
  const [activeTab, setActiveTab] = useState('levels');
  const [loading, setLoading] = useState(false);

  // State data
  const [companies, setCompanies] = useState([]);
  const [levels, setLevels] = useState([]);
  const [grades, setGrades] = useState([]);
  const [roleTemplates, setRoleTemplates] = useState([]);
  const [responsibilities, setResponsibilities] = useState([]);
  const [workflows, setWorkflows] = useState([]);

  // Modal / Form states
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [editingLevel, setEditingLevel] = useState(null);
  const [levelForm, setLevelForm] = useState({ name: '', levelNumber: 13, category: 'STAFF', canApprove: true, canAssign: false, canViewAll: false, status: 'active' });

  const [showGradeModal, setShowGradeModal] = useState(false);
  const [editingGrade, setEditingGrade] = useState(null);
  const [gradeForm, setGradeForm] = useState({ name: '', code: '', order: 1, salaryMultiplier: 1.0 });

  const [showRespModal, setShowRespModal] = useState(false);
  const [respForm, setRespForm] = useState({ code: '', name: '', module: 'Material', description: '' });

  const [showWorkflowModal, setShowWorkflowModal] = useState(false);
  const [workflowForm, setWorkflowForm] = useState({
    name: '', module: 'Material', documentType: '', materialType: '',
    conditions: [{ field: 'value', operator: 'gt', value: 50000 }],
    steps: [{ stepIndex: 1, stepName: 'Step 1: Manager Approval', approverType: 'REPORTS_TO' }]
  });

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'companies') {
        const res = await api.get('/admin/console/companies');
        setCompanies(res.data.data || []);
      } else if (activeTab === 'levels') {
        const res = await api.get('/admin/console/levels');
        setLevels(res.data.data || []);
      } else if (activeTab === 'grades') {
        const res = await api.get('/admin/console/grades');
        const rawGrades = res.data.data || [];
        rawGrades.sort((a, b) => {
          const ordA = Number(a.order ?? a.gradeOrder ?? 1);
          const ordB = Number(b.order ?? b.gradeOrder ?? 1);
          if (ordA !== ordB) return ordA - ordB;
          return (a.code || '').localeCompare(b.code || '');
        });
        setGrades(rawGrades);
      } else if (activeTab === 'roles') {
        const res = await api.get('/admin/console/role-templates');
        setRoleTemplates(res.data.data || []);
      } else if (activeTab === 'responsibilities') {
        const res = await api.get('/admin/console/responsibilities');
        setResponsibilities(res.data.data || []);
      } else if (activeTab === 'workflows') {
        const res = await api.get('/admin/console/workflows');
        setWorkflows(res.data.data || []);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load console data');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenGradeModal = (grd = null) => {
    if (grd) {
      setEditingGrade(grd);
      setGradeForm({
        name: grd.name || '',
        code: grd.code || '',
        order: grd.order || grd.gradeOrder || 1,
        salaryMultiplier: grd.salaryMultiplier || 1.0
      });
    } else {
      setEditingGrade(null);
      setGradeForm({
        name: '',
        code: '',
        order: grades.length > 0 ? Math.max(...grades.map(g => Number(g.order || g.gradeOrder) || 0)) + 1 : 1,
        salaryMultiplier: 1.0
      });
    }
    setShowGradeModal(true);
  };

  const handleSaveGrade = async (e) => {
    e.preventDefault();
    try {
      if (editingGrade) {
        await api.put(`/admin/console/grades/${editingGrade._id}`, gradeForm);
        toast.success('Grade Master updated successfully');
      } else {
        await api.post('/admin/console/grades', gradeForm);
        toast.success('Grade Master created successfully');
      }
      setShowGradeModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save grade');
    }
  };

  const handleDeleteGrade = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete Grade "${name}"?`)) return;
    try {
      await api.delete(`/admin/console/grades/${id}`);
      toast.success(`Grade "${name}" deleted`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete grade');
    }
  };

  const handleOpenLevelModal = (lvl = null) => {
    if (lvl) {
      setEditingLevel(lvl);
      setLevelForm({
        name: lvl.name || '',
        levelNumber: lvl.levelNumber || 1,
        category: lvl.category || 'STAFF',
        canApprove: lvl.canApprove ?? true,
        canAssign: lvl.canAssign ?? false,
        canViewAll: lvl.canViewAll ?? false,
        status: lvl.status || 'active'
      });
    } else {
      setEditingLevel(null);
      setLevelForm({
        name: '',
        levelNumber: levels.length > 0 ? Math.max(...levels.map(l => Number(l.levelNumber) || 0)) + 1 : 1,
        category: 'STAFF',
        canApprove: true,
        canAssign: false,
        canViewAll: false,
        status: 'active'
      });
    }
    setShowLevelModal(true);
  };

  const handleSaveLevel = async (e) => {
    e.preventDefault();
    try {
      if (editingLevel) {
        await api.put(`/admin/console/levels/${editingLevel._id}`, levelForm);
        toast.success('Level Master updated successfully');
      } else {
        await api.post('/admin/console/levels', levelForm);
        toast.success('Level Master created successfully');
      }
      setShowLevelModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save level');
    }
  };

  const handleDeleteLevel = async (id, levelName) => {
    if (!window.confirm(`Are you sure you want to delete level "${levelName}"?`)) return;
    try {
      await api.delete(`/admin/console/levels/${id}`);
      toast.success('Level deleted successfully');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete level');
    }
  };

  const handleMoveLevel = async (index, direction) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= levels.length) return;

    const newLevels = [...levels];
    const temp = newLevels[index];
    newLevels[index] = newLevels[targetIndex];
    newLevels[targetIndex] = temp;

    const updatedLevels = newLevels.map((l, i) => ({
      ...l,
      levelNumber: i + 1
    }));
    setLevels(updatedLevels);

    try {
      const orderedLevelIds = updatedLevels.map((l) => l._id);
      await api.put('/admin/console/levels/reorder', { orderedLevelIds });
      toast.success('Level order updated');
      fetchData();
    } catch (err) {
      toast.error('Failed to reorder levels');
      fetchData();
    }
  };

  const handleCreateGrade = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/console/grades', gradeForm);
      toast.success('Grade Master created successfully');
      setShowGradeModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create grade');
    }
  };

  const handleCreateResp = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/console/responsibilities', respForm);
      toast.success('Business Responsibility created successfully');
      setShowRespModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create responsibility');
    }
  };

  const handleCreateWorkflow = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/console/workflows', workflowForm);
      toast.success('Approval Workflow Policy created');
      setShowWorkflowModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create workflow policy');
    }
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="mb-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-600 text-white rounded-xl shadow-md">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Dynamic Organization & Permission Engine</h1>
              <p className="text-slate-500 text-sm">Enterprise RBAC, Dynamic Hierarchy, Scopes & Approval Workflow Engine</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200 mb-6">
        {[
          { id: 'levels', label: 'Level Master', icon: Layers },
          { id: 'grades', label: 'Grade Master', icon: Award },
          { id: 'responsibilities', label: 'Business Responsibilities', icon: UserCheck },
          { id: 'workflows', label: 'Approval Workflows', icon: GitMerge },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="p-12 text-center text-slate-400">Loading console data...</div>
      ) : (
        <div>
          {/* LEVEL MASTER TAB */}
          {activeTab === 'levels' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Hierarchy Level Master</h2>
                  <p className="text-sm text-slate-500">Configurable levels (Higher level number = child level for all levels above)</p>
                </div>
                <button
                  onClick={() => handleOpenLevelModal(null)}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-all shadow-xs"
                >
                  <Plus className="w-4 h-4" /> Add Level
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase bg-slate-50">
                      <th className="p-3">Level Name</th>
                      <th className="p-3">Level #</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">Can Approve</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {levels.map((lvl, idx) => (
                      <tr key={lvl._id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-semibold text-slate-800">{lvl.name}</td>
                        <td className="p-3">
                          <span className="px-2.5 py-1 bg-slate-800 text-white font-bold font-mono rounded-lg text-xs">
                            L-{lvl.levelNumber}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 font-bold rounded text-xs border border-indigo-200">
                            {lvl.category}
                          </span>
                        </td>
                        <td className="p-3">{lvl.canApprove ? '✓ Yes' : '✗ No'}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-md border border-emerald-200">
                            {lvl.status || 'active'}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              disabled={idx === 0}
                              onClick={() => handleMoveLevel(idx, 'up')}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                              title="Move Up (Increase Priority)"
                            >
                              <ChevronUp size={16} />
                            </button>
                            <button
                              disabled={idx === levels.length - 1}
                              onClick={() => handleMoveLevel(idx, 'down')}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                              title="Move Down (Lower Priority)"
                            >
                              <ChevronDown size={16} />
                            </button>
                            <button
                              onClick={() => handleOpenLevelModal(lvl)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 rounded-lg transition-all"
                              title="Edit Level"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteLevel(lvl._id, lvl.name)}
                              className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 rounded-lg transition-all"
                              title="Delete Level"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* GRADE MASTER TAB */}
          {activeTab === 'grades' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Grade System Master</h2>
                  <p className="text-sm text-slate-500">Configurable employee grades, salary multipliers, and promotion rules</p>
                </div>
                <button
                  onClick={() => handleOpenGradeModal(null)}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-all shadow-xs"
                >
                  <Plus className="w-4 h-4" /> Add Grade
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase bg-slate-50">
                      <th className="p-3">Grade Name</th>
                      <th className="p-3">Code</th>
                      <th className="p-3">Order</th>
                      <th className="p-3">Salary Multiplier</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {grades.map((grd) => (
                      <tr key={grd._id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-semibold text-slate-800">{grd.name}</td>
                        <td className="p-3 uppercase font-mono font-bold text-indigo-700">{grd.code}</td>
                        <td className="p-3">{grd.order || grd.gradeOrder || 1}</td>
                        <td className="p-3 font-semibold text-emerald-600">{grd.salaryMultiplier || 1}x</td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenGradeModal(grd)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 rounded-lg transition-all"
                              title="Edit Grade"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteGrade(grd._id, grd.name)}
                              className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 rounded-lg transition-all"
                              title="Delete Grade"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* BUSINESS RESPONSIBILITIES TAB */}
          {activeTab === 'responsibilities' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Business Responsibilities Engine</h2>
                  <p className="text-sm text-slate-500">Decoupled approval and operational duties assigned to employees</p>
                </div>
                <button
                  onClick={() => setShowRespModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700"
                >
                  <Plus className="w-4 h-4" /> Add Responsibility
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {responsibilities.map((resp) => (
                  <div key={resp._id} className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 hover:bg-white hover:shadow-xs transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-md font-mono">
                        {resp.code}
                      </span>
                      <span className="text-xs text-slate-400 font-medium">{resp.module}</span>
                    </div>
                    <h3 className="font-bold text-slate-800 text-sm mb-1">{resp.name}</h3>
                    <p className="text-xs text-slate-500 mb-3">{resp.description || 'No description provided'}</p>
                    <div className="text-xs font-semibold text-indigo-600">
                      Assigned: {resp.assignedEmployees?.length || 0} Staff
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* APPROVAL WORKFLOWS TAB */}
          {activeTab === 'workflows' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Dynamic Approval Workflows</h2>
                  <p className="text-sm text-slate-500">Module-based multi-step approval chains driven by rules and amounts</p>
                </div>
                <button
                  onClick={() => setShowWorkflowModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700"
                >
                  <Plus className="w-4 h-4" /> Create Workflow Policy
                </button>
              </div>

              <div className="space-y-4">
                {workflows.map((wf) => (
                  <div key={wf._id} className="p-5 border border-slate-200 rounded-xl bg-slate-50/30">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <span className="px-2.5 py-1 bg-indigo-100 text-indigo-800 font-bold text-xs rounded-md mr-2">
                          {wf.module}
                        </span>
                        <span className="font-bold text-slate-800 text-base">{wf.name}</span>
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-md">
                        Active
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
                      <span>Conditions:</span>
                      {wf.conditions?.map((c, idx) => (
                        <span key={idx} className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded font-mono">
                          {c.field} {c.operator} {c.value}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-3 overflow-x-auto pb-2">
                      <span className="text-xs font-bold text-slate-400">Requester</span>
                      {wf.steps?.map((step) => (
                        <React.Fragment key={step.stepIndex}>
                          <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                          <div className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs shadow-2xs shrink-0">
                            <div className="font-bold text-slate-700">{step.stepName}</div>
                            <div className="text-indigo-600 text-[11px] font-medium">Type: {step.approverType}</div>
                          </div>
                        </React.Fragment>
                      ))}
                      <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                      <span className="text-xs font-bold text-emerald-600">Approved</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* CREATE / EDIT LEVEL MODAL */}
      {showLevelModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4">
              {editingLevel ? 'Edit Level Master' : 'Create New Level Master'}
            </h3>
            <form onSubmit={handleSaveLevel} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Level Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Managing Director, Manager, Lead"
                  value={levelForm.name}
                  onChange={(e) => setLevelForm({ ...levelForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Hierarchy Category</label>
                <select
                  value={levelForm.category || 'STAFF'}
                  onChange={(e) => setLevelForm({ ...levelForm, category: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold bg-white"
                >
                  <option value="DIRECTOR">DIRECTOR (Board, COE, Founder)</option>
                  <option value="MANAGEMENT">MANAGEMENT (VP, AVP)</option>
                  <option value="LEADERSHIP">LEADERSHIP (Manager, Group Lead, TL)</option>
                  <option value="STAFF">STAFF (Senior/Junior Executive, Member)</option>
                  <option value="TRAINEE">TRAINEE (Trainee, Intern)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Status</label>
                <select
                  value={levelForm.status || 'active'}
                  onChange={(e) => setLevelForm({ ...levelForm, status: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold bg-white"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowLevelModal(false)} className="px-4 py-2 text-slate-600 text-sm font-medium">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700">
                  {editingLevel ? 'Update Level' : 'Save Level'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE / EDIT GRADE MODAL */}
      {showGradeModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4">
              {editingGrade ? 'Edit Grade Master' : 'Create New Grade Master'}
            </h3>
            <form onSubmit={handleSaveGrade} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Grade Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Grade A, Executive Grade"
                  value={gradeForm.name}
                  onChange={(e) => setGradeForm({ ...gradeForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Grade Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. a, b, c"
                  value={gradeForm.code}
                  onChange={(e) => setGradeForm({ ...gradeForm, code: e.target.value.toLowerCase() })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm uppercase font-mono focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Grade Order</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={gradeForm.order}
                  onChange={(e) => setGradeForm({ ...gradeForm, order: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Salary Multiplier</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={gradeForm.salaryMultiplier}
                  onChange={(e) => setGradeForm({ ...gradeForm, salaryMultiplier: parseFloat(e.target.value) || 1.0 })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowGradeModal(false)} className="px-4 py-2 text-slate-600 text-sm font-medium">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700">
                  {editingGrade ? 'Update Grade' : 'Save Grade'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE RESPONSIBILITY MODAL */}
      {showRespModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Create Business Responsibility</h3>
            <form onSubmit={handleCreateResp} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Responsibility Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. MAT_APPROVER_L1"
                  value={respForm.code}
                  onChange={(e) => setRespForm({ ...respForm, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm uppercase font-mono focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Material Approval Officer"
                  value={respForm.name}
                  onChange={(e) => setRespForm({ ...respForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Target Module</label>
                <select
                  value={respForm.module}
                  onChange={(e) => setRespForm({ ...respForm, module: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold bg-white"
                >
                  <option value="Material">Material</option>
                  <option value="Finance">Finance</option>
                  <option value="HR">HR</option>
                  <option value="Travel">Travel</option>
                </select>
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowRespModal(false)} className="px-4 py-2 text-slate-600 text-sm font-medium">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700">Save Responsibility</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE WORKFLOW MODAL */}
      {showWorkflowModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Create Approval Workflow Policy</h3>
            <form onSubmit={handleCreateWorkflow} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Policy Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. High Value Purchase Order Policy"
                  value={workflowForm.name}
                  onChange={(e) => setWorkflowForm({ ...workflowForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Module</label>
                <select
                  value={workflowForm.module}
                  onChange={(e) => setWorkflowForm({ ...workflowForm, module: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold bg-white"
                >
                  <option value="Material">Material</option>
                  <option value="Finance">Finance</option>
                  <option value="HR">HR</option>
                </select>
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowWorkflowModal(false)} className="px-4 py-2 text-slate-600 text-sm font-medium">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700">Save Workflow Policy</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminConsole;
