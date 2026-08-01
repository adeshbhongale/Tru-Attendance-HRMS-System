import React, { useState, useEffect } from 'react';
import {
  Shield, Building2, Layers, Award, Users, GitMerge, FileText, CheckCircle2,
  Plus, Edit, Save, Trash2, ArrowRight, UserCheck, Settings, CheckSquare
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
  const [hierarchy, setHierarchy] = useState([]);

  // Modal / Form states
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [levelForm, setLevelForm] = useState({ name: '', priority: 50, canApprove: true, canAssign: false, canViewAll: false });

  const [showGradeModal, setShowGradeModal] = useState(false);
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
        setGrades(res.data.data || []);
      } else if (activeTab === 'roles') {
        const res = await api.get('/admin/console/role-templates');
        setRoleTemplates(res.data.data || []);
      } else if (activeTab === 'responsibilities') {
        const res = await api.get('/admin/console/responsibilities');
        setResponsibilities(res.data.data || []);
      } else if (activeTab === 'workflows') {
        const res = await api.get('/admin/console/workflows');
        setWorkflows(res.data.data || []);
      } else if (activeTab === 'hierarchy') {
        const res = await api.get('/admin/console/reporting-hierarchy');
        setHierarchy(res.data.data || []);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load console data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLevel = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/console/levels', levelForm);
      toast.success('Level Master created successfully');
      setShowLevelModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create level');
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
      <div className="mb-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
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
          { id: 'hierarchy', label: 'Reporting Hierarchy', icon: Users },
          { id: 'roles', label: 'Dynamic Role Generator', icon: Settings },
          { id: 'companies', label: 'Company Setup', icon: Building2 },
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
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Hierarchy Level Master</h2>
                  <p className="text-sm text-slate-500">Configurable levels (Higher priority = higher organizational authority)</p>
                </div>
                <button
                  onClick={() => setShowLevelModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700"
                >
                  <Plus className="w-4 h-4" /> Add Level
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase bg-slate-50">
                      <th className="p-3">Level Name</th>
                      <th className="p-3">Priority</th>
                      <th className="p-3">Can Approve</th>
                      <th className="p-3">Can View All</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {levels.map((lvl) => (
                      <tr key={lvl._id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-semibold text-slate-800">{lvl.name}</td>
                        <td className="p-3">
                          <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 font-bold rounded-lg text-xs border border-indigo-200">
                            P-{lvl.priority}
                          </span>
                        </td>
                        <td className="p-3">{lvl.canApprove ? '✓ Yes' : '✗ No'}</td>
                        <td className="p-3">{lvl.canViewAll ? '✓ Yes' : '✗ No'}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-md border border-emerald-200">
                            {lvl.status}
                          </span>
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
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Grade System Master</h2>
                  <p className="text-sm text-slate-500">Configurable employee grades, salary multipliers, and promotion rules</p>
                </div>
                <button
                  onClick={() => setShowGradeModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700"
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {grades.map((grd) => (
                      <tr key={grd._id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-semibold text-slate-800">{grd.name}</td>
                        <td className="p-3 uppercase font-mono">{grd.code}</td>
                        <td className="p-3">{grd.order}</td>
                        <td className="p-3 font-semibold text-emerald-600">{grd.salaryMultiplier}x</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* BUSINESS RESPONSIBILITIES TAB */}
          {activeTab === 'responsibilities' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
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
                  <div key={resp._id} className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 hover:bg-white hover:shadow-sm transition-all">
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
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
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

          {/* REPORTING HIERARCHY TAB */}
          {activeTab === 'hierarchy' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="mb-6">
                <h2 className="text-lg font-bold text-slate-800">Employee Reporting Structure & Data Scopes</h2>
                <p className="text-sm text-slate-500">Multi-tier reporting tree (`reportsTo`), Level, and Data Scope (`SELF`, `TEAM`, `DEPARTMENT`, `ALL`)</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase bg-slate-50">
                      <th className="p-3">Employee</th>
                      <th className="p-3">Department</th>
                      <th className="p-3">Role Code</th>
                      <th className="p-3">Reports To</th>
                      <th className="p-3">Data Scope</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {hierarchy.map((emp) => (
                      <tr key={emp._id} className="hover:bg-slate-50/50">
                        <td className="p-3">
                          <div className="font-bold text-slate-800">{emp.name}</div>
                          <div className="text-xs text-slate-400">{emp.email}</div>
                        </td>
                        <td className="p-3 font-medium text-slate-600">{emp.department || '—'}</td>
                        <td className="p-3 font-mono text-xs font-bold text-indigo-700">{emp.roleCode || '—'}</td>
                        <td className="p-3 font-semibold text-slate-700">
                          {emp.reportsTo ? emp.reportsTo.name : 'Top Level / None'}
                        </td>
                        <td className="p-3">
                          <span className="px-2.5 py-1 bg-purple-50 text-purple-700 font-bold rounded-lg text-xs border border-purple-200">
                            {emp.dataScope || 'SELF'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CREATE LEVEL MODAL */}
      {showLevelModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Create New Level Master</h3>
            <form onSubmit={handleCreateLevel} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Level Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Regional Manager, Lead"
                  value={levelForm.name}
                  onChange={(e) => setLevelForm({ ...levelForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Priority (10-100, Higher = More Authority)</label>
                <input
                  type="number"
                  required
                  value={levelForm.priority}
                  onChange={(e) => setLevelForm({ ...levelForm, priority: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowLevelModal(false)} className="px-4 py-2 text-slate-600 text-sm font-medium">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700">Save Level</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminConsole;
