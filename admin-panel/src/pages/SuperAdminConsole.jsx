import {
  ArrowRight,
  Award,
  ChevronDown,
  ChevronUp,
  Edit,
  GitMerge,
  Layers,
  Plus,
  Shield,
  Trash2,
  UserCheck,
  Building2,
  Building,
  KeyRound,
  Users,
  CheckCircle2,
  X,
  Mail,
  Phone
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';

const SuperAdminConsole = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('companies');
  const [loading, setLoading] = useState(false);

  const handleEnterCompanyWorkspace = (comp) => {
    localStorage.setItem('selectedCompanyId', comp._id);
    localStorage.setItem('selectedCompanyName', comp.name);
    localStorage.setItem('selectedCompanyCode', comp.code);
    toast.success(`Active workspace switched to "${comp.name}"`);
    navigate('/');
    window.location.reload();
  };

  // State data
  const [companies, setCompanies] = useState([]);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [companyForm, setCompanyForm] = useState({
    name: '',
    code: '',
    description: '',
    adminName: '',
    adminEmail: '',
    adminMobile: '',
    adminPassword: '',
    adminEmployeeIdCode: ''
  });
  const [levels, setLevels] = useState([]);
  const [grades, setGrades] = useState([]);
  const [roleTemplates, setRoleTemplates] = useState([]);
  const [responsibilities, setResponsibilities] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [employees, setEmployees] = useState([]);

  // Modal / Form states
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [editingLevel, setEditingLevel] = useState(null);
  const [levelForm, setLevelForm] = useState({ name: '', levelNumber: 13, category: 'STAFF', canApprove: true, canAssign: false, canViewAll: false, status: 'active' });

  const [showGradeModal, setShowGradeModal] = useState(false);
  const [editingGrade, setEditingGrade] = useState(null);
  const [gradeForm, setGradeForm] = useState({ name: '', code: '', order: 1, salaryMultiplier: 1.0 });

  const [showRespModal, setShowRespModal] = useState(false);
  const [editingResp, setEditingResp] = useState(null);
  const [respForm, setRespForm] = useState({ code: '', name: '', module: 'Material', description: '' });

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigningResp, setAssigningResp] = useState(null);
  const [selectedEmpIds, setSelectedEmpIds] = useState([]);
  const [empSearch, setEmpSearch] = useState('');

  const [showWorkflowModal, setShowWorkflowModal] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState(null);
  const [workflowForm, setWorkflowForm] = useState({
    name: '', module: 'Material', documentType: '', materialType: '', status: 'active',
    conditions: [],
    steps: [{ stepIndex: 1, stepName: 'Approval', stepType: 'APPROVAL', approverRule: 'IMMEDIATE_MANAGER', approverType: 'REPORTS_TO', dispatchMethod: 'HANDLER', featureFlags: { assignHandler: true, directDispatch: true } }]
  });

  const handleOpenCompanyModal = () => {
    setCompanyForm({
      name: '',
      code: '',
      description: '',
      adminName: '',
      adminEmail: '',
      adminMobile: '',
      adminPassword: '',
      adminEmployeeIdCode: ''
    });
    setShowCompanyModal(true);
  };

  const handleSaveCompany = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/admin/console/companies', companyForm);
      toast.success(res.data.message || 'Company and Company Admin created successfully!');
      setShowCompanyModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create company & company admin');
    }
  };

  const handleDeleteCompany = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete tenant company "${name}" and its company admin account?`)) return;
    try {
      await api.delete(`/admin/console/companies/${id}`);
      toast.success(`Tenant Company "${name}" deleted successfully`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete company');
    }
  };

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
        const [respRes, empRes] = await Promise.all([
          api.get('/admin/console/responsibilities'),
          api.get('/employees').catch(() => ({ data: { data: [] } }))
        ]);
        setResponsibilities(respRes.data.data || []);
        const empList = empRes.data?.data || empRes.data?.employees || empRes.data || [];
        setEmployees(Array.isArray(empList) ? empList : []);
      } else if (activeTab === 'workflows') {
        const [wfRes, lvlRes, empRes] = await Promise.all([
          api.get('/admin/console/workflows'),
          api.get('/admin/console/levels'),
          api.get('/employees').catch(() => ({ data: { data: [] } }))
        ]);
        setWorkflows(wfRes.data.data || []);
        setLevels(lvlRes.data.data || []);
        const empList = empRes.data?.data || empRes.data?.employees || empRes.data || [];
        setEmployees(Array.isArray(empList) ? empList : []);
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

  // --- Responsibility Handlers ---
  const handleOpenRespModal = (resp = null) => {
    if (resp) {
      setEditingResp(resp);
      setRespForm({
        code: resp.code || '',
        name: resp.name || '',
        module: resp.module || 'Material',
        description: resp.description || ''
      });
    } else {
      setEditingResp(null);
      setRespForm({ code: '', name: '', module: 'Material', description: '' });
    }
    setShowRespModal(true);
  };

  const handleSaveResp = async (e) => {
    e.preventDefault();
    try {
      if (editingResp) {
        await api.put(`/admin/console/responsibilities/${editingResp._id}`, respForm);
        toast.success('Business Responsibility updated');
      } else {
        await api.post('/admin/console/responsibilities', respForm);
        toast.success('Business Responsibility created');
      }
      setShowRespModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save responsibility');
    }
  };

  const handleDeleteResp = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete responsibility "${name}"?`)) return;
    try {
      await api.delete(`/admin/console/responsibilities/${id}`);
      toast.success('Responsibility deleted');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete responsibility');
    }
  };

  const handleOpenAssignModal = (resp) => {
    setAssigningResp(resp);
    const assignedIds = (resp.assignedEmployees || []).map(e => typeof e === 'object' ? e._id || e.id : e);
    setSelectedEmpIds(assignedIds);
    setEmpSearch('');
    setShowAssignModal(true);
  };

  const handleToggleEmpAssignment = (empId) => {
    if (selectedEmpIds.includes(empId)) {
      setSelectedEmpIds(selectedEmpIds.filter(id => id !== empId));
    } else {
      setSelectedEmpIds([...selectedEmpIds, empId]);
    }
  };

  const handleSaveAssignment = async (e) => {
    e.preventDefault();
    if (!assigningResp) return;
    try {
      await api.post('/admin/console/responsibilities/assign', {
        responsibilityId: assigningResp._id,
        employeeIds: selectedEmpIds
      });
      toast.success(`Assigned staff updated for ${assigningResp.name}`);
      setShowAssignModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update assignment');
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

  const handleOpenWorkflowModal = (wf = null) => {
    if (wf) {
      setEditingWorkflow(wf);
      setWorkflowForm({
        name: wf.name || '',
        module: wf.module || 'Material',
        status: wf.status || 'active',
        documentType: wf.documentType || '',
        materialType: wf.materialType || '',
        conditions: wf.conditions && wf.conditions.length > 0 ? wf.conditions : [],
        steps: (wf.steps && wf.steps.length > 0)
          ? wf.steps.map(s => {
            const uId = s.targetUser ? (typeof s.targetUser === 'object' ? (s.targetUser._id || s.targetUser.id) : s.targetUser) : '';
            return {
              ...s,
              targetUser: uId,
              store: s.store ? (typeof s.store === 'object' ? (s.store._id || s.store.id) : s.store) : uId
            };
          })
          : [
            {
              stepIndex: 1,
              stepName: 'Approval',
              stepType: 'APPROVAL',
              approverRule: 'MANAGEMENT_CATEGORY',
              targetCategory: 'MANAGEMENT',
              dispatchMethod: 'HANDLER',
              featureFlags: { assignHandler: true, directDispatch: true }
            }
          ]
      });
    } else {
      setEditingWorkflow(null);
      setWorkflowForm({
        name: '',
        module: 'Material',
        status: 'active',
        documentType: '',
        materialType: '',
        conditions: [],
        steps: [
          {
            stepIndex: 1,
            stepName: 'Team Lead Approval',
            stepType: 'APPROVAL',
            approverRule: 'ROLE',
            targetLevelNumber: 8,
            targetRole: 'Level 8: Team Lead (TL)'
          },
          {
            stepIndex: 2,
            stepName: 'Management Approval',
            stepType: 'APPROVAL',
            approverRule: 'MANAGEMENT_CATEGORY',
            targetCategory: 'MANAGEMENT'
          },
          {
            stepIndex: 3,
            stepName: 'Store Dispatch',
            stepType: 'STORE',
            approverRule: 'EMPLOYEE',
            dispatchMethod: 'DIRECT',
            featureFlags: { assignHandler: false, directDispatch: true }
          },
          {
            stepIndex: 4,
            stepName: 'Requester Acceptance',
            stepType: 'RECEIVE',
            approverRule: 'REQUESTER'
          },
          {
            stepIndex: 5,
            stepName: 'Transfer',
            stepType: 'TRANSFER',
            approverRule: 'ANY_EMPLOYEE'
          }
        ]
      });
    }
    setShowWorkflowModal(true);
  };

  const handleSaveWorkflow = async (e) => {
    e.preventDefault();
    try {
      const sanitizedPayload = {
        ...workflowForm,
        steps: (workflowForm.steps || []).map(s => {
          const uId = s.targetUser ? (typeof s.targetUser === 'object' ? (s.targetUser._id || s.targetUser.id) : s.targetUser) : null;
          return {
            ...s,
            targetUser: uId || null,
            store: uId || (s.store ? (typeof s.store === 'object' ? (s.store._id || s.store.id) : s.store) : null)
          };
        })
      };

      if (editingWorkflow) {
        await api.put(`/admin/console/workflows/${editingWorkflow._id}`, sanitizedPayload);
        toast.success('Approval Workflow Policy updated successfully');
      } else {
        await api.post('/admin/console/workflows', sanitizedPayload);
        toast.success('Approval Workflow Policy created successfully');
      }
      setShowWorkflowModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save workflow policy');
    }
  };

  const handleDeleteWorkflow = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete workflow policy "${name}"?`)) return;
    try {
      await api.delete(`/admin/console/workflows/${id}`);
      toast.success(`Workflow policy "${name}" deleted`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete workflow policy');
    }
  };

  const renderDynamicCategoryOptions = () => {
    const categories = ['DIRECTOR', 'MANAGEMENT', 'LEADERSHIP', 'STAFF', 'TRAINEE'];
    const defaultNames = {
      DIRECTOR: 'Board of Directors, Founder, CEO',
      MANAGEMENT: 'VP, AVP',
      LEADERSHIP: 'Manager, Group Lead, Team Lead',
      STAFF: 'Senior Executive, Executive',
      TRAINEE: 'Intern, Trainee',
    };

    return categories.map((cat) => {
      const catLevels = (levels || []).filter((l) => (l.category || '').toUpperCase() === cat);
      const combinedRolesText = catLevels.length > 0
        ? catLevels.map((l) => l.name).join(', ')
        : defaultNames[cat] || '';

      return (
        <optgroup key={cat} label={`── ${cat} CATEGORY ROLES ──`}>
          <option value={cat}>
            {cat} ({combinedRolesText})
          </option>
          {catLevels.map((lvl) => (
            <option key={lvl._id || lvl.id} value={`${cat}:${lvl.name}`}>
              ↳ {lvl.name} (Level {lvl.levelNumber})
            </option>
          ))}
        </optgroup>
      );
    });
  };

  const handleToggleWorkflowStatus = async (wf) => {
    const newStatus = wf.status === 'active' ? 'inactive' : 'active';
    try {
      await api.put(`/admin/console/workflows/${wf._id}`, { ...wf, status: newStatus });
      toast.success(`Workflow policy "${wf.name}" is now ${newStatus === 'active' ? 'Active' : 'Hidden / Inactive'}`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update workflow status');
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
          { id: 'companies', label: 'Tenant Companies & Admins', icon: Building2 },
          { id: 'workflows', label: 'Approval Workflows', icon: GitMerge },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${isActive
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
          {/* TENANT COMPANIES & ADMINS TAB */}
          {activeTab === 'companies' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Tenant Companies & Dedicated Admins</h2>
                  <p className="text-sm text-slate-500">Create & manage independent corporate tenant companies with their custom Company Codes & dedicated Company Admin credentials</p>
                </div>
                <button
                  onClick={handleOpenCompanyModal}
                  className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100"
                >
                  <Plus className="w-4 h-4" /> Create Company & Admin
                </button>
              </div>

              {companies.length === 0 ? (
                <div className="p-12 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <Building className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p className="font-bold text-sm text-slate-600">No tenant companies created yet</p>
                  <p className="text-xs text-slate-400 mt-1">Click "Create Company & Admin" above to onboard a new company.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {companies.map((comp) => (
                    <div key={comp._id} className="p-5 border border-slate-200 rounded-2xl bg-slate-50/50 hover:bg-white hover:shadow-lg transition-all flex flex-col justify-between space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="px-3 py-1 bg-indigo-600 text-white text-xs font-extrabold rounded-lg tracking-wider uppercase shadow-xs">
                            CODE: {comp.code}
                          </span>
                          <span className="text-[10px] font-extrabold px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">
                            {comp.status || 'Active'}
                          </span>
                        </div>

                        <h3 className="font-extrabold text-slate-900 text-lg mb-1">{comp.name}</h3>
                        <p className="text-xs text-slate-500 font-medium line-clamp-2">{comp.description || 'Corporate Tenant Workspace'}</p>

                        {/* Dedicated Company Admin Login Credentials Card */}
                        <div className="mt-4 p-3.5 bg-white border border-slate-200/80 rounded-xl space-y-2">
                          <div className="flex items-center justify-between text-[11px] font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1.5">
                            <span>Company Admin Credentials</span>
                            <span className="text-indigo-600 font-bold">TCCA1</span>
                          </div>

                          {comp.companyAdmin ? (
                            <div className="space-y-1 text-xs">
                              <div className="flex items-center gap-2 text-slate-800 font-bold">
                                <Users size={14} className="text-indigo-600" />
                                <span>{comp.companyAdmin.name}</span>
                              </div>
                              <div className="flex items-center gap-2 text-slate-600 font-medium">
                                <Mail size={14} className="text-slate-400" />
                                <span>{comp.companyAdmin.email}</span>
                              </div>
                              <div className="flex items-center gap-2 text-slate-600 font-medium">
                                <Phone size={14} className="text-slate-400" />
                                <span>{comp.companyAdmin.mobile}</span>
                              </div>
                              <div className="flex items-center gap-2 text-slate-600 font-mono text-[11px] font-bold pt-1">
                                <KeyRound size={13} className="text-amber-500" />
                                <span>ID: {comp.companyAdmin.employeeIdCode || 'ADM_' + comp.code}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-amber-600 font-semibold italic p-1">
                              No company admin login attached
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-200/60 flex items-center justify-between gap-2">
                        <button
                          onClick={() => handleEnterCompanyWorkspace(comp)}
                          className="flex-1 flex items-center justify-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold transition-all shadow-md shadow-indigo-100 active:scale-95"
                        >
                          <span>Enter Company Workspace</span>
                          <ArrowRight size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteCompany(comp._id, comp.name)}
                          className="p-2 text-slate-400 hover:text-rose-600 bg-white border border-slate-200 hover:bg-rose-50 rounded-xl transition-all shadow-xs shrink-0"
                          title="Delete Company"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                  onClick={() => handleOpenWorkflowModal(null)}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 shadow-sm"
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

                      <div className="flex items-center gap-2">
                        {/* Hide / Active Status Toggle */}
                        <button
                          onClick={() => handleToggleWorkflowStatus(wf)}
                          title="Click to toggle Active / Hide (Inactive)"
                          className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-colors ${wf.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                            }`}
                        >
                          {wf.status === 'active' ? '● Active' : '○ Hidden (Inactive)'}
                        </button>

                        {/* Edit Button */}
                        <button
                          onClick={() => handleOpenWorkflowModal(wf)}
                          title="Edit Workflow Policy"
                          className="p-1.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors shadow-2xs"
                        >
                          <Edit className="w-4 h-4 text-indigo-600" />
                        </button>

                        {/* Delete Button */}
                        <button
                          onClick={() => handleDeleteWorkflow(wf._id, wf.name)}
                          title="Delete Workflow Policy"
                          className="p-1.5 bg-white border border-slate-200 text-slate-600 hover:bg-red-50 hover:border-red-200 rounded-lg transition-colors shadow-2xs"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
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
                          <div className="px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs shadow-xs shrink-0 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-slate-800">{step.stepName}</span>
                              <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-mono font-bold">
                                {step.stepType || 'APPROVAL'}
                              </span>
                            </div>
                            <div className="text-indigo-600 text-[11px] font-medium">
                              Approver: <span className="font-bold">
                                {step.approverRule === 'MANAGEMENT_CATEGORY' ? `Category (${step.targetCategory || 'MANAGEMENT'})` :
                                  step.approverRule === 'ROLE' ? `Role (${step.targetRole || `Level ${step.targetLevelNumber || 1}`})` :
                                    step.approverRule === 'REQUESTER' ? `Requester (Self Acceptance)` :
                                      step.approverRule === 'ANY_EMPLOYEE' ? `Any Employee (Transfer)` :
                                        (step.approverRule === 'EMPLOYEE' || step.approverRule === 'SPECIFIC_USER') ? `Specific Employee` :
                                          (step.approverRule || step.approverType)}
                              </span>
                            </div>
                            {step.stepType === 'DISPATCH' && (
                              <div className="flex items-center gap-1.5 text-[10px]">
                                <span className={`px-1.5 py-0.5 rounded font-bold ${step.dispatchMethod === 'DIRECT' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                                  Method: {step.dispatchMethod || 'HANDLER'}
                                </span>
                                {step.featureFlags?.assignHandler === false && (
                                  <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-bold">
                                    Assign Handler OFF
                                  </span>
                                )}
                              </div>
                            )}
                            {step.stepType === 'TRANSFER' && (
                              <div className="flex items-center gap-1.5 text-[10px]">
                                <span className={`px-1.5 py-0.5 rounded font-bold ${step.transferScope === 'SAME_DEPT' ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'}`}>
                                  Scope: {step.transferScope === 'SAME_DEPT' ? 'Same Dept (Direct)' : `Cross Dept (${step.targetCategory || 'MANAGEMENT'})`}
                                </span>
                              </div>
                            )}
                          </div>
                        </React.Fragment>
                      ))}
                      <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                      <span className="text-xs font-bold text-emerald-600">Completed</span>
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

      {/* CREATE / EDIT WORKFLOW MODAL */}
      {showWorkflowModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 my-8 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-slate-800 mb-1">
              {editingWorkflow ? 'Edit Workflow Policy (Enterprise Engine)' : 'Create Workflow Policy (Enterprise Engine)'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">Define sequential steps, approver rules, dispatch options, and feature flags.</p>

            <form onSubmit={handleSaveWorkflow} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Workflow Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Standard Material Request Policy"
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
                    <option value="Material">Material Movement</option>
                    <option value="Leave">Leave Request</option>
                    <option value="Expense">Expense Claim</option>
                    <option value="Purchase">Purchase Request</option>
                    <option value="Asset">Asset Transfer</option>
                    <option value="CRM">CRM Lead Approval</option>
                  </select>
                </div>
              </div>

              {/* Workflow Steps Builder */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Workflow Steps & Configuration</label>
                  <button
                    type="button"
                    onClick={() => {
                      const nextIdx = (workflowForm.steps || []).length + 1;
                      setWorkflowForm({
                        ...workflowForm,
                        steps: [
                          ...(workflowForm.steps || []),
                          {
                            stepIndex: nextIdx,
                            stepName: `Step ${nextIdx}: Dispatch`,
                            stepType: 'DISPATCH',
                            approverRule: 'RESPONSIBILITY',
                            approverType: 'RESPONSIBILITY',
                            dispatchMethod: 'HANDLER',
                            featureFlags: { assignHandler: true, directDispatch: true }
                          }
                        ]
                      });
                    }}
                    className="text-xs px-3 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold rounded-lg flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Step
                  </button>
                </div>

                <div className="space-y-3">
                  {(workflowForm.steps || []).map((step, idx) => (
                    <div key={idx} className="p-4 border border-slate-200 rounded-xl bg-slate-50 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">
                          Step #{idx + 1}
                        </span>
                        {(workflowForm.steps || []).length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = workflowForm.steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, stepIndex: i + 1 }));
                              setWorkflowForm({ ...workflowForm, steps: updated });
                            }}
                            className="text-red-500 hover:text-red-700 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Step Name</label>
                          <input
                            type="text"
                            required
                            value={step.stepName || ''}
                            onChange={(e) => {
                              const updated = [...workflowForm.steps];
                              updated[idx].stepName = e.target.value;
                              setWorkflowForm({ ...workflowForm, steps: updated });
                            }}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Step Type</label>
                          <select
                            value={step.stepType || 'APPROVAL'}
                            onChange={(e) => {
                              const updated = [...workflowForm.steps];
                              updated[idx].stepType = e.target.value;
                              setWorkflowForm({ ...workflowForm, steps: updated });
                            }}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-medium"
                          >
                            <option value="APPROVAL">APPROVAL</option>
                            <option value="STORE">STORE</option>
                            <option value="DISPATCH">DISPATCH</option>
                            <option value="RECEIVE">RECEIVE</option>
                            <option value="TRANSFER">TRANSFER</option>
                            <option value="RETURN">RETURN</option>
                            <option value="END">END</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Approver Rule *</label>
                          <select
                            value={step.approverRule || 'MANAGEMENT_CATEGORY'}
                            onChange={(e) => {
                              const updated = [...workflowForm.steps];
                              const rule = e.target.value;
                              updated[idx].approverRule = rule;
                              if (rule === 'MANAGEMENT_CATEGORY' && !updated[idx].targetCategory) {
                                updated[idx].targetCategory = 'MANAGEMENT';
                              }
                              if (rule === 'ROLE' && !updated[idx].targetLevelNumber) {
                                updated[idx].targetLevelNumber = 1;
                                updated[idx].targetRole = 'Level 1: Managing Director / CEO';
                              }
                              setWorkflowForm({ ...workflowForm, steps: updated });
                            }}
                            className="w-full px-2.5 py-1.5 border border-indigo-300 rounded-lg text-xs bg-indigo-50/40 font-bold text-indigo-900 focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="MANAGEMENT_CATEGORY">1. Management Category (Director/Management/Leadership)</option>
                            <option value="ROLE">2. Select Role (Levels 1 to 13)</option>
                            <option value="EMPLOYEE">3. Select Specific Employee</option>
                            <option value="IMMEDIATE_MANAGER">4. Immediate Manager</option>
                            <option value="RESPONSIBILITY">5. Business Responsibility Code</option>
                            <option value="REQUESTER">6. Requester (Self Acceptance)</option>
                            <option value="ANY_EMPLOYEE">7. Any Employee (Transfer / Handover)</option>
                          </select>
                        </div>
                      </div>

                      {/* Dynamic Configuration for TRANSFER Step & MANAGEMENT_CATEGORY */}
                      {step.stepType === 'TRANSFER' ? (
                        <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-lg space-y-3">
                          <div>
                            <label className="block text-[11px] font-bold text-indigo-900 mb-1">
                              Transfer Scope & Approval Mode *
                            </label>
                            <select
                              value={step.transferScope || 'CROSS_DEPT'}
                              onChange={(e) => {
                                const updated = [...workflowForm.steps];
                                const val = e.target.value;
                                updated[idx].transferScope = val;
                                if (val === 'SAME_DEPT') {
                                  updated[idx].targetCategory = '';
                                } else if (!updated[idx].targetCategory) {
                                  updated[idx].targetCategory = 'MANAGEMENT';
                                }
                                setWorkflowForm({ ...workflowForm, steps: updated });
                              }}
                              className="w-full px-2.5 py-1.5 border border-indigo-300 rounded-lg text-xs bg-white font-bold text-indigo-900"
                            >
                              <option value="SAME_DEPT">1. Same Department Transfer (Self / Direct Handover)</option>
                              <option value="CROSS_DEPT">2. Cross-Department Transfer (Requires Management Approval)</option>
                            </select>
                          </div>

                          {step.transferScope !== 'SAME_DEPT' && (
                            <div>
                              <label className="block text-[11px] font-bold text-indigo-900 mb-1">
                                Select Management Category for Transfer / Cross-Dept Approvals *
                              </label>
                              <select
                                value={step.targetCategory || 'MANAGEMENT'}
                                onChange={(e) => {
                                  const updated = [...workflowForm.steps];
                                  updated[idx].targetCategory = e.target.value;
                                  setWorkflowForm({ ...workflowForm, steps: updated });
                                }}
                                className="w-full px-2.5 py-1.5 border border-indigo-300 rounded-lg text-xs bg-white font-bold text-indigo-900"
                              >
                                <option value="DIRECTOR">DIRECTOR (Board of Directors, Founder, CEO, COE)</option>
                                <option value="MANAGEMENT">MANAGEMENT (VP, AVP, General Manager, Department Head)</option>
                                <option value="LEADERSHIP">LEADERSHIP (Manager, Group Lead, Team Lead)</option>
                                <option value="STAFF">STAFF (Senior Executive, Executive)</option>
                                <option value="TRAINEE">TRAINEE (Intern, Trainee)</option>
                              </select>
                            </div>
                          )}
                        </div>
                      ) : step.approverRule === 'MANAGEMENT_CATEGORY' ? (
                        <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-lg">
                          <label className="block text-[11px] font-bold text-indigo-900 mb-1">
                            Select Management Category for Approvals *
                          </label>
                          <select
                            value={step.targetCategory || 'MANAGEMENT'}
                            onChange={(e) => {
                              const updated = [...workflowForm.steps];
                              updated[idx].targetCategory = e.target.value;
                              setWorkflowForm({ ...workflowForm, steps: updated });
                            }}
                            className="w-full px-2.5 py-1.5 border border-indigo-300 rounded-lg text-xs bg-white font-bold text-indigo-900"
                          >
                            <option value="DIRECTOR">DIRECTOR (Board of Directors, Founder, CEO, COE)</option>
                            <option value="MANAGEMENT">MANAGEMENT (VP, AVP, General Manager, Department Head)</option>
                            <option value="LEADERSHIP">LEADERSHIP (Manager, Group Lead, Team Lead)</option>
                            <option value="STAFF">STAFF (Senior Executive, Executive)</option>
                            <option value="TRAINEE">TRAINEE (Intern, Trainee)</option>
                          </select>
                        </div>
                      ) : null}

                      {step.approverRule === 'ROLE' && (
                        <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-lg">
                          <label className="block text-[11px] font-bold text-indigo-900 mb-1">Select Super Admin Role / Hierarchy Level (Levels 1 to 13) *</label>
                          <select
                            value={step.targetLevelNumber || 1}
                            onChange={(e) => {
                              const updated = [...workflowForm.steps];
                              const lvlNum = parseInt(e.target.value) || 1;
                              updated[idx].targetLevelNumber = lvlNum;
                              const selLvl = levels.find(l => l.levelNumber === lvlNum);
                              updated[idx].targetRole = selLvl ? `Level ${lvlNum}: ${selLvl.name}` : `Level ${lvlNum}`;
                              setWorkflowForm({ ...workflowForm, steps: updated });
                            }}
                            className="w-full px-2.5 py-1.5 border border-indigo-300 rounded-lg text-xs bg-white font-bold text-indigo-900"
                          >
                            {levels.length > 0 ? (
                              levels.map(l => (
                                <option key={l._id} value={l.levelNumber}>
                                  Level {l.levelNumber}: {l.name} ({l.category})
                                </option>
                              ))
                            ) : (
                              [
                                { num: 1, name: 'Managing Director / CEO (Level 1)' },
                                { num: 2, name: 'Vice President / VP (Level 2)' },
                                { num: 3, name: 'General Manager (Level 3)' },
                                { num: 4, name: 'Assistant Vice President / AVP (Level 4)' },
                                { num: 5, name: 'Senior Manager (Level 5)' },
                                { num: 6, name: 'Department Manager (Level 6)' },
                                { num: 7, name: 'Assistant Manager (Level 7)' },
                                { num: 8, name: 'Team Lead / TL (Level 8)' },
                                { num: 9, name: 'Senior Executive (Level 9)' },
                                { num: 10, name: 'Executive (Level 10)' },
                                { num: 11, name: 'Junior Executive (Level 11)' },
                                { num: 12, name: 'Assistant (Level 12)' },
                                { num: 13, name: 'Intern / Trainee (Level 13)' },
                              ].map(lvl => (
                                <option key={lvl.num} value={lvl.num}>
                                  {lvl.name}
                                </option>
                              ))
                            )}
                          </select>
                        </div>
                      )}

                      {(step.approverRule === 'EMPLOYEE' || step.approverRule === 'SPECIFIC_USER') && (
                        <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-lg">
                          <label className="block text-[11px] font-bold text-indigo-900 mb-1">Select Specific Employee Approver *</label>
                          <select
                            value={step.targetUser || step.store || ''}
                            onChange={(e) => {
                              const updated = [...workflowForm.steps];
                              const selectedVal = e.target.value;
                              updated[idx].targetUser = selectedVal;
                              updated[idx].store = selectedVal;
                              setWorkflowForm({ ...workflowForm, steps: updated });
                            }}
                            className="w-full px-2.5 py-1.5 border border-indigo-300 rounded-lg text-xs bg-white font-bold text-indigo-900"
                          >
                            <option value="">-- Choose Employee --</option>
                            {employees.map(emp => (
                              <option key={emp._id || emp.id} value={emp._id || emp.id}>
                                {emp.name || emp.fullName} ({emp.role || 'Staff'})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Dispatch Options & Feature Flags (for DISPATCH or STORE steps) */}
                      {(step.stepType === 'DISPATCH' || step.stepType === 'STORE') && (
                        <div className="pt-2 border-t border-slate-200 grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">Dispatch Method</label>
                            <select
                              value={step.dispatchMethod || 'HANDLER'}
                              onChange={(e) => {
                                const updated = [...workflowForm.steps];
                                updated[idx].dispatchMethod = e.target.value;
                                if (e.target.value === 'DIRECT') {
                                  updated[idx].featureFlags = { ...(updated[idx].featureFlags || {}), assignHandler: false };
                                }
                                setWorkflowForm({ ...workflowForm, steps: updated });
                              }}
                              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-bold text-indigo-700"
                            >
                              <option value="HANDLER">HANDLER (Assign Transporter/Handler)</option>
                              <option value="DIRECT">DIRECT (Direct to Requester)</option>
                              <option value="COURIER">COURIER</option>
                              <option value="VENDOR">VENDOR</option>
                            </select>
                          </div>

                          <div className="flex items-center gap-4 pt-4">
                            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                              <input
                                type="checkbox"
                                checked={step.featureFlags?.assignHandler !== false && step.dispatchMethod !== 'DIRECT'}
                                disabled={step.dispatchMethod === 'DIRECT'}
                                onChange={(e) => {
                                  const updated = [...workflowForm.steps];
                                  updated[idx].featureFlags = {
                                    ...(updated[idx].featureFlags || {}),
                                    assignHandler: e.target.checked
                                  };
                                  setWorkflowForm({ ...workflowForm, steps: updated });
                                }}
                                className="w-4 h-4 rounded text-indigo-600"
                              />
                              Enable "Assign Handler" Feature
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button type="button" onClick={() => setShowWorkflowModal(false)} className="px-4 py-2 text-slate-600 text-sm font-medium">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 shadow-md">
                  {editingWorkflow ? 'Update Workflow Policy' : 'Save Workflow Policy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* --- STAFF ASSIGNMENT MODAL --- */}
      {showAssignModal && assigningResp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-lg text-slate-900">Assign Staff to Responsibility</h3>
                <p className="text-xs text-slate-500">
                  Duty: <strong className="text-indigo-600 font-mono">{assigningResp.code}</strong> ({assigningResp.name})
                </p>
              </div>
              <button onClick={() => setShowAssignModal(false)} className="text-slate-400 hover:text-slate-700 text-xl font-bold">×</button>
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="Search employee by name, email, department..."
                value={empSearch}
                onChange={(e) => setEmpSearch(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex justify-between items-center text-xs font-bold text-slate-500 px-1">
              <span>{selectedEmpIds.length} Staff Selected</span>
              <div className="space-x-3">
                <button
                  type="button"
                  onClick={() => setSelectedEmpIds(employees.map(e => e._id))}
                  className="text-indigo-600 hover:underline"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedEmpIds([])}
                  className="text-rose-600 hover:underline"
                >
                  Deselect All
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 border border-slate-100 p-2 rounded-2xl bg-slate-50/50">
              {employees
                .filter(e => {
                  if (!empSearch.trim()) return true;
                  const q = empSearch.toLowerCase();
                  return (e.name || '').toLowerCase().includes(q) || (e.email || '').toLowerCase().includes(q) || (e.department || '').toLowerCase().includes(q);
                })
                .map((emp) => {
                  const isChecked = selectedEmpIds.includes(emp._id);
                  return (
                    <div
                      key={emp._id}
                      onClick={() => handleToggleEmpAssignment(emp._id)}
                      className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-all ${
                        isChecked ? 'bg-indigo-50/70 border-indigo-200 text-indigo-900' : 'bg-white border-slate-200 hover:bg-slate-100/60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                          isChecked ? 'bg-indigo-600 border-indigo-600 text-white font-bold text-xs' : 'border-slate-300 bg-white'
                        }`}>
                          {isChecked && '✓'}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900">{emp.name || emp.fullName}</p>
                          <p className="text-[11px] font-medium text-slate-500">
                            {emp.email} • <span className="font-bold text-indigo-600">{emp.department || emp.role || 'Staff'}</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="pt-3 flex justify-end gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
                className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-2xl font-bold text-xs hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAssignment}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-2xl font-bold text-xs hover:bg-indigo-700 shadow-lg shadow-indigo-100"
              >
                Save Assigned Staff
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- RESPONSIBILITY CREATE/EDIT MODAL --- */}
      {showRespModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-lg text-slate-900">{editingResp ? 'Edit Responsibility' : 'Add Responsibility'}</h3>
              <button onClick={() => setShowRespModal(false)} className="text-slate-400 hover:text-slate-700 text-xl font-bold">×</button>
            </div>

            <form onSubmit={handleSaveResp} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Responsibility Code (Uppercase) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. STORE_APPROVER"
                  value={respForm.code}
                  onChange={(e) => setRespForm({ ...respForm, code: e.target.value.toUpperCase() })}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Responsibility Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Store Dispatch Approver"
                  value={respForm.name}
                  onChange={(e) => setRespForm({ ...respForm, name: e.target.value })}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Module *</label>
                <select
                  value={respForm.module}
                  onChange={(e) => setRespForm({ ...respForm, module: e.target.value })}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500 font-bold"
                >
                  <option value="Material">Material</option>
                  <option value="Finance">Finance</option>
                  <option value="Leave">Leave</option>
                  <option value="Expenses">Expenses</option>
                  <option value="Purchase">Purchase</option>
                  <option value="Sales">Sales</option>
                  <option value="Attendance">Attendance</option>
                  <option value="HRMS">HRMS</option>
                  <option value="General">General</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows="3"
                  placeholder="Describe operational duty or approval authority..."
                  value={respForm.description}
                  onChange={(e) => setRespForm({ ...respForm, description: e.target.value })}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 flex justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRespModal(false)}
                  className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-2xl font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 text-white rounded-2xl font-bold text-xs hover:bg-indigo-700 shadow-lg shadow-indigo-100"
                >
                  Save Responsibility
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* --- CREATE COMPANY & COMPANY ADMIN MODAL --- */}
      {showCompanyModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto border border-slate-100">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
                  <Building2 size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Create Tenant Company & Admin</h3>
                  <p className="text-xs text-slate-500 font-medium">Onboard a new corporate company with its dedicated admin login</p>
                </div>
              </div>
              <button
                onClick={() => setShowCompanyModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCompany} className="space-y-5">
              {/* Company Info Section */}
              <div className="space-y-4">
                <h4 className="text-xs font-extrabold text-indigo-600 uppercase tracking-wider">1. Company Workspace Details</h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Company Code *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. INFY / WIPRO / TCSL"
                      value={companyForm.code}
                      onChange={(e) => setCompanyForm({ ...companyForm, code: e.target.value.toUpperCase() })}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold uppercase tracking-wider text-slate-900 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Company Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Infosys Technologies Ltd"
                      value={companyForm.name}
                      onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Description / Notes</label>
                  <input
                    type="text"
                    placeholder="e.g. Technology & Software Services Workspace"
                    value={companyForm.description}
                    onChange={(e) => setCompanyForm({ ...companyForm, description: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Company Admin Credentials Section */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <h4 className="text-xs font-extrabold text-indigo-600 uppercase tracking-wider">2. Dedicated Company Admin Credentials</h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Company Admin Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Nandan Nilekani"
                      value={companyForm.adminName}
                      onChange={(e) => setCompanyForm({ ...companyForm, adminName: e.target.value })}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Company Admin Email *</label>
                    <input
                      type="email"
                      required
                      placeholder="admin@infosys.com"
                      value={companyForm.adminEmail}
                      onChange={(e) => setCompanyForm({ ...companyForm, adminEmail: e.target.value })}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Admin Mobile Number</label>
                    <input
                      type="text"
                      placeholder="9876543210"
                      value={companyForm.adminMobile}
                      onChange={(e) => setCompanyForm({ ...companyForm, adminMobile: e.target.value })}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Admin Password *</label>
                    <input
                      type="password"
                      required
                      placeholder="Admin@123"
                      value={companyForm.adminPassword}
                      onChange={(e) => setCompanyForm({ ...companyForm, adminPassword: e.target.value })}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCompanyModal(false)}
                  className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-2xl font-bold text-xs hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-indigo-600 text-white rounded-2xl font-bold text-xs hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95"
                >
                  Create Company & Admin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminConsole;
