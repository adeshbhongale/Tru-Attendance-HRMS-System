import {
  Award,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Edit,
  GripVertical,
  Key,
  Layers,
  Mail,
  Phone,
  Plus,
  Search,
  Shield,
  Trash2,
  UserCheck,
  Users
} from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';

const AdminConsole = () => {
  const [activeTab, setActiveTab] = useState('levels');
  const [loading, setLoading] = useState(false);

  // Master Data States
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState(() => {
    try {
      const userStr = localStorage.getItem('user') || localStorage.getItem('userInfo');
      if (userStr) {
        const parsed = JSON.parse(userStr);
        return parsed.companyId || parsed.company?._id || parsed.company || '';
      }
    } catch (_) { }
    return '';
  });

  const isSuperAdmin = (() => {
    try {
      const userStr = localStorage.getItem('user') || localStorage.getItem('userInfo');
      if (userStr) {
        const u = JSON.parse(userStr);
        return u.role === 'superadmin' || u.role === 'super_admin' || u.roleCode === 'TCSA1' || u.scope === 'GLOBAL';
      }
    } catch (_) { }
    return false;
  })();

  const canManageConsole = (() => {
    try {
      const userStr = localStorage.getItem('user') || localStorage.getItem('userInfo');
      if (userStr) {
        const u = JSON.parse(userStr);
        const role = (u.role || '').toLowerCase();
        const code = (u.roleCode || '').toUpperCase();
        return (
          role === 'superadmin' ||
          role === 'super_admin' ||
          code === 'TCSA1' ||
          u.scope === 'GLOBAL' ||
          role === 'company_admin' ||
          role === 'admin' ||
          code === 'TCCA1' ||
          role === 'hr_admin'
        );
      }
    } catch (_) { }
    return true;
  })();

  const [levels, setLevels] = useState([]);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [grades, setGrades] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [responsibilities, setResponsibilities] = useState([]);
  const [allEmployees, setAllEmployees] = useState([]);

  // Modal / Form States for Levels
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [editingLevel, setEditingLevel] = useState(null);
  const [levelForm, setLevelForm] = useState({
    name: '',
    levelNumber: 13,
    category: 'STAFF',
    canApprove: true,
    canAssign: false,
    canViewAll: false,
    status: 'active'
  });

  // Modal / Form States for Grades
  const [showGradeModal, setShowGradeModal] = useState(false);
  const [editingGrade, setEditingGrade] = useState(null);
  const [gradeForm, setGradeForm] = useState({
    name: '',
    code: '',
    order: 1,
    salaryMultiplier: 1.0
  });

  // Modal / Form States for Creating Admin Account
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminForm, setAdminForm] = useState({
    name: '',
    email: '',
    mobile: '',
    password: 'Admin@123',
    role: 'hr_admin',
    employeeIdCode: '',
    department: 'Human Resources',
    designation: 'HR Admin'
  });

  // Modal / Form States for Responsibilities
  const [showRespModal, setShowRespModal] = useState(false);
  const [editingResp, setEditingResp] = useState(null);
  const [respForm, setRespForm] = useState({
    code: '',
    name: '',
    module: 'Material',
    description: ''
  });

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigningResp, setAssigningResp] = useState(null);
  const [selectedEmpIds, setSelectedEmpIds] = useState([]);
  const [empSearch, setEmpSearch] = useState('');

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      const res = await api.get('/admin/console/companies');
      const list = res.data.data || [];
      setCompanies(list);
      if (list.length > 0 && !selectedCompanyId) {
        setSelectedCompanyId(list[0]._id);
      }
    } catch (_) { }
  };

  const getReqConfig = () => {
    if (!selectedCompanyId) return {};
    return {
      params: { companyId: selectedCompanyId },
      headers: { 'x-company-id': selectedCompanyId }
    };
  };

  useEffect(() => {
    fetchData();
  }, [activeTab, selectedCompanyId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const config = getReqConfig();
      if (activeTab === 'levels') {
        const res = await api.get('/admin/console/levels', config);
        setLevels(res.data.data || []);
      } else if (activeTab === 'grades') {
        const res = await api.get('/admin/console/grades', config);
        const rawGrades = res.data.data || [];
        rawGrades.sort((a, b) => (a.order ?? a.gradeOrder ?? 1) - (b.order ?? b.gradeOrder ?? 1));
        setGrades(rawGrades);
      } else if (activeTab === 'admins') {
        const [empRes, deptRes] = await Promise.all([
          api.get('/employees', config),
          api.get('/departments', config).catch(() => ({ data: { data: [] } }))
        ]);
        const allEmps = empRes.data.data || empRes.data.employees || [];
        const admins = allEmps.filter(e => {
          const r = (e.role || '').toLowerCase();
          return ['hr_admin', 'store_admin', 'account_admin', 'hr', 'store', 'accounts', 'finance'].includes(r);
        });
        setAdminUsers(admins);
        setDepartments(deptRes.data.data || []);
      } else if (activeTab === 'responsibilities') {
        const [respRes, empRes] = await Promise.all([
          api.get('/admin/console/responsibilities', config),
          api.get('/employees', config).catch(() => ({ data: { data: [] } }))
        ]);
        setResponsibilities(respRes.data.data || []);
        const empList = empRes.data?.data || empRes.data?.employees || [];
        setAllEmployees(empList);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load console data');
    } finally {
      setLoading(false);
    }
  };

  // --- Level Actions ---
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDrop = async (e, dropIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const updatedLevels = [...levels];
    const [movedItem] = updatedLevels.splice(draggedIndex, 1);
    updatedLevels.splice(dropIndex, 0, movedItem);

    const reordered = updatedLevels.map((item, idx) => ({
      ...item,
      levelNumber: idx + 1
    }));

    setLevels(reordered);
    setDraggedIndex(null);
    setDragOverIndex(null);

    try {
      const orderedLevelIds = reordered.map(l => l._id || l.id);
      await api.put('/admin/console/levels/reorder', { orderedLevelIds });
      toast.success('Level hierarchy reordered successfully');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reorder levels');
      fetchData();
    }
  };

  const handleMoveLevel = async (index, direction) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= levels.length) return;

    const updatedLevels = [...levels];
    const [movedItem] = updatedLevels.splice(index, 1);
    updatedLevels.splice(targetIndex, 0, movedItem);

    const reordered = updatedLevels.map((item, idx) => ({
      ...item,
      levelNumber: idx + 1
    }));

    setLevels(reordered);

    try {
      const orderedLevelIds = reordered.map(l => l._id || l.id);
      await api.put('/admin/console/levels/reorder', { orderedLevelIds });
      toast.success(`Level moved ${direction} successfully`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to move level');
      fetchData();
    }
  };

  const handleOpenLevelModal = (lvl = null) => {
    if (lvl) {
      setEditingLevel(lvl);
      setLevelForm({
        name: lvl.name || '',
        levelNumber: lvl.levelNumber || 13,
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
        levelNumber: (levels.length > 0 ? Math.max(...levels.map(l => l.levelNumber || 0)) + 1 : 1),
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
      const payload = { ...levelForm, companyId: selectedCompanyId || undefined };
      const config = getReqConfig();
      if (editingLevel) {
        await api.put(`/admin/console/levels/${editingLevel._id}`, payload, config);
        toast.success('Level updated successfully');
      } else {
        await api.post('/admin/console/levels', payload, config);
        toast.success('Level created successfully');
      }
      setShowLevelModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save level');
    }
  };

  const handleDeleteLevel = async (id) => {
    if (!window.confirm('Are you sure you want to delete this level?')) return;
    try {
      await api.delete(`/admin/console/levels/${id}`);
      toast.success('Level deleted');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete level');
    }
  };

  // --- Grade Actions ---
  const handleOpenGradeModal = (grd = null) => {
    if (grd) {
      setEditingGrade(grd);
      setGradeForm({
        name: grd.name || '',
        code: grd.code || '',
        order: grd.order ?? grd.gradeOrder ?? 1,
        salaryMultiplier: grd.salaryMultiplier ?? 1.0
      });
    } else {
      setEditingGrade(null);
      setGradeForm({
        name: '',
        code: '',
        order: grades.length + 1,
        salaryMultiplier: 1.0
      });
    }
    setShowGradeModal(true);
  };

  const handleSaveGrade = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...gradeForm, companyId: selectedCompanyId || undefined };
      const config = getReqConfig();
      if (editingGrade) {
        await api.put(`/admin/console/grades/${editingGrade._id}`, payload, config);
        toast.success('Grade updated successfully');
      } else {
        await api.post('/admin/console/grades', payload, config);
        toast.success('Grade created successfully');
      }
      setShowGradeModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save grade');
    }
  };

  const handleDeleteGrade = async (id) => {
    if (!window.confirm('Are you sure you want to delete this grade?')) return;
    try {
      await api.delete(`/admin/console/grades/${id}`);
      toast.success('Grade deleted');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete grade');
    }
  };

  // --- Admin Account Actions ---
  const handleRoleSelectChange = (e) => {
    const selectedRole = e.target.value;
    let dept = 'Human Resources';
    let desig = 'HR Admin';

    if (selectedRole === 'store_admin') {
      dept = 'Stores and Dispatch';
      desig = 'Store Admin';
    } else if (selectedRole === 'account_admin') {
      dept = 'Accounts and Purchase';
      desig = 'Account Admin';
    }

    setAdminForm({
      ...adminForm,
      role: selectedRole,
      department: dept,
      designation: desig
    });
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    if (!adminForm.name || !adminForm.email || !adminForm.mobile || !adminForm.password) {
      toast.error('Please fill in Name, Email, Mobile and Password');
      return;
    }

    try {
      const payload = {
        name: adminForm.name,
        email: adminForm.email.toLowerCase(),
        mobile: adminForm.mobile,
        password: adminForm.password,
        role: adminForm.role,
        roleCode: adminForm.role.toUpperCase(),
        department: adminForm.department,
        designation: adminForm.designation,
        employeeIdCode: adminForm.employeeIdCode || undefined,
        companyId: selectedCompanyId || undefined,
        company: selectedCompanyId || undefined,
        status: 'ACTIVE'
      };

      await api.post('/employees', payload, getReqConfig());
      toast.success(`New ${adminForm.role.replace('_', ' ').toUpperCase()} credential created!`);
      setShowAdminModal(false);
      setAdminForm({
        name: '',
        email: '',
        mobile: '',
        password: 'Admin@123',
        role: 'hr_admin',
        employeeIdCode: '',
        department: 'Human Resources',
        designation: 'HR Admin'
      });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create admin credential');
    }
  };

  const handleDeleteAdminCred = async (id, name, role) => {
    if (!window.confirm(`Are you sure you want to PERMANENTLY DELETE the admin credential for "${name}" (${role})?`)) return;
    try {
      await api.delete(`/employees/${id}?hard=true`);
      toast.success(`Admin credential for "${name}" deleted.`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete admin credential');
    }
  };

  // --- Responsibility Actions ---
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
      const payload = { ...respForm, companyId: selectedCompanyId || undefined };
      const config = getReqConfig();
      if (editingResp) {
        await api.put(`/admin/console/responsibilities/${editingResp._id}`, payload, config);
        toast.success('Business Responsibility updated');
      } else {
        await api.post('/admin/console/responsibilities', payload, config);
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

  const getRoleBadge = (roleStr) => {
    const r = (roleStr || '').toLowerCase();
    if (r === 'company_admin' || r === 'admin') {
      return <span className="px-3 py-1 bg-indigo-100 text-indigo-700 font-extrabold text-xs rounded-full border border-indigo-200">Company Admin</span>;
    }
    if (r === 'hr_admin' || r === 'hr') {
      return <span className="px-3 py-1 bg-purple-100 text-purple-700 font-extrabold text-xs rounded-full border border-purple-200">HR Admin</span>;
    }
    if (r === 'store_admin' || r === 'store') {
      return <span className="px-3 py-1 bg-amber-100 text-amber-800 font-extrabold text-xs rounded-full border border-amber-200">Store Admin</span>;
    }
    if (r === 'account_admin' || r === 'accounts' || r === 'finance') {
      return <span className="px-3 py-1 bg-emerald-100 text-emerald-800 font-extrabold text-xs rounded-full border border-emerald-200">Account Admin</span>;
    }
    return <span className="px-3 py-1 bg-slate-100 text-slate-700 font-extrabold text-xs rounded-full">{roleStr}</span>;
  };

  return (
    <div className="p-4 md:p-6 w-full max-w-full overflow-x-hidden space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
                <Shield size={24} />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Admin Console</h1>
            </div>
            <p className="text-sm font-medium text-slate-500">
              Company Governance, Level & Grade Masters, Business Responsibilities & Admin Logins
            </p>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-1.5 p-1.5 bg-slate-100/80 rounded-2xl border border-slate-200/60 w-full md:w-auto overflow-x-auto">
          <button
            onClick={() => setActiveTab('levels')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${activeTab === 'levels' ? 'bg-white text-indigo-600 shadow-md shadow-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
          >
            <Layers size={16} />
            Level Master
          </button>
          <button
            onClick={() => setActiveTab('grades')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${activeTab === 'grades' ? 'bg-white text-indigo-600 shadow-md shadow-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
          >
            <Award size={16} />
            Grade Masters
          </button>
          <button
            onClick={() => setActiveTab('responsibilities')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${activeTab === 'responsibilities' ? 'bg-white text-indigo-600 shadow-md shadow-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
          >
            <UserCheck size={16} />
            Business Responsibilities
          </button>
          <button
            onClick={() => setActiveTab('admins')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${activeTab === 'admins' ? 'bg-white text-indigo-600 shadow-md shadow-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
          >
            <Users size={16} />
            Manage Admin Logins
          </button>
        </div>
      </div>

      {/* --- TAB 1: LEVEL MASTER --- */}
      {activeTab === 'levels' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Corporate Level Masters</h2>
              <p className="text-xs font-medium text-slate-500">Hierarchy level definitions and authority limits</p>
            </div>
            <button
              onClick={() => handleOpenLevelModal()}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100"
            >
              <Plus size={16} /> Add Level
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 tracking-wider">
                  <th className="p-3.5 w-12 text-center">Drag</th>
                  <th className="p-3.5">Level No</th>
                  <th className="p-3.5">Level Name</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5">Can Approve</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-700">
                {levels.map((lvl, index) => {
                  const isDragging = draggedIndex === index;
                  const isOver = dragOverIndex === index;
                  return (
                    <tr
                      key={lvl._id || lvl.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragLeave={() => setDragOverIndex(null)}
                      onDragEnd={handleDragEnd}
                      onDrop={(e) => handleDrop(e, index)}
                      className={`transition-all ${isDragging
                        ? 'opacity-40 bg-indigo-50/80 border-2 border-dashed border-indigo-400'
                        : isOver
                          ? 'bg-indigo-50/60 border-t-2 border-indigo-500'
                          : 'hover:bg-slate-50/80'
                        }`}
                    >
                      <td className="p-3.5 text-center cursor-grab active:cursor-grabbing text-slate-400 hover:text-indigo-600">
                        <div className="flex items-center justify-center p-1 rounded hover:bg-slate-200/50" title="Drag to reorder level number">
                          <GripVertical size={16} />
                        </div>
                      </td>
                      <td className="p-3.5">
                        <span className="w-8 h-8 inline-flex items-center justify-center bg-indigo-600 text-white rounded-lg font-extrabold text-xs shadow-xs">
                          L-{lvl.levelNumber}
                        </span>
                      </td>
                      <td className="p-3.5 font-extrabold text-slate-900">{lvl.name}</td>
                      <td className="p-3.5">
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md text-[11px] font-bold">
                          {lvl.category}
                        </span>
                      </td>
                      <td className="p-3.5">
                        {lvl.canApprove ? (
                          <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 size={14} /> Yes</span>
                        ) : (
                          <span className="text-slate-400">No</span>
                        )}
                      </td>
                      <td className="p-3.5">
                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px]">
                          {lvl.status || 'Active'}
                        </span>
                      </td>
                      <td className="p-3.5 text-right space-x-1.5">
                        {canManageConsole && (
                          <>
                            <button
                              disabled={index === 0}
                              onClick={() => handleMoveLevel(index, 'up')}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 rounded-lg disabled:opacity-30 disabled:hover:bg-slate-100"
                              title="Move Up (Increase Priority)"
                            >
                              <ChevronUp size={15} />
                            </button>
                            <button
                              disabled={index === levels.length - 1}
                              onClick={() => handleMoveLevel(index, 'down')}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 rounded-lg disabled:opacity-30 disabled:hover:bg-slate-100"
                              title="Move Down (Lower Priority)"
                            >
                              <ChevronDown size={15} />
                            </button>
                            <button onClick={() => handleOpenLevelModal(lvl)} className="p-1.5 text-slate-500 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 rounded-lg" title="Edit Level">
                              <Edit size={15} />
                            </button>
                            <button onClick={() => handleDeleteLevel(lvl._id)} className="p-1.5 text-slate-500 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 rounded-lg" title="Delete Level">
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {levels.length === 0 && !loading && (
            <div className="text-center py-12 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
              <Layers size={40} className="mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-700">No Corporate Level Masters Configured</p>
              <p className="text-xs text-slate-400 mt-1">Click "Add Level" to create custom hierarchy levels for your company.</p>
            </div>
          )}
        </div>
      )}

      {/* --- TAB 2: GRADE MASTERS --- */}
      {activeTab === 'grades' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Grade Masters</h2>
              <p className="text-xs font-medium text-slate-500">Corporate grades and order hierarchy</p>
            </div>
            <button
              onClick={() => handleOpenGradeModal()}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100"
            >
              <Plus size={16} /> Add Grade
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 tracking-wider">
                  <th className="p-3.5">Grade Order</th>
                  <th className="p-3.5">Grade Name</th>
                  <th className="p-3.5">Code</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-700">
                {grades.map((grd) => (
                  <tr key={grd._id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-3.5">
                      <span className="w-7 h-7 inline-flex items-center justify-center bg-amber-50 text-amber-700 rounded-lg font-extrabold text-xs">
                        {grd.order ?? grd.gradeOrder ?? 1}
                      </span>
                    </td>
                    <td className="p-3.5 font-bold text-slate-900">{grd.name}</td>
                    <td className="p-3.5 text-indigo-600 font-extrabold">{grd.code}</td>
                    <td className="p-3.5 text-right space-x-2">
                      {canManageConsole && (
                        <>
                          <button onClick={() => handleOpenGradeModal(grd)} className="p-1.5 text-slate-500 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 rounded-lg">
                            <Edit size={15} />
                          </button>
                          <button onClick={() => handleDeleteGrade(grd._id)} className="p-1.5 text-slate-500 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 rounded-lg">
                            <Trash2 size={15} />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {grades.length === 0 && !loading && (
            <div className="text-center py-12 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
              <Award size={40} className="mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-700">No Grade Masters Configured</p>
              <p className="text-xs text-slate-400 mt-1">Click "Add Grade" to create custom corporate grades for your company.</p>
            </div>
          )}
        </div>
      )}

      {/* --- TAB 3: BUSINESS RESPONSIBILITIES --- */}
      {activeTab === 'responsibilities' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Business Responsibilities Engine</h2>
              <p className="text-xs font-medium text-slate-500">
                Decoupled operational & approval duties assigned to staff (e.g. STORE_APPROVER, FINANCE_APPROVER)
              </p>
            </div>
            <button
              onClick={() => handleOpenRespModal()}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-2xl font-bold text-xs hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95"
            >
              <Plus size={16} /> Add Responsibility
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {responsibilities.map((resp) => (
              <div key={resp._id} className="p-5 rounded-3xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-indigo-200 transition-all shadow-sm flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-xs font-extrabold rounded-md font-mono">
                      {resp.code}
                    </span>
                    <span className="text-xs font-bold px-2.5 py-0.5 bg-slate-200 text-slate-700 rounded-md">{resp.module}</span>
                  </div>

                  <h3 className="font-extrabold text-slate-900 text-base tracking-tight mb-1">{resp.name}</h3>
                  <p className="text-xs font-medium text-slate-500 mb-3 leading-relaxed">{resp.description || 'No description provided'}</p>

                  <div className="space-y-2 border-t border-slate-200/60 pt-3">
                    <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                      <span>Assigned Staff:</span>
                      <span className="text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full text-[11px]">
                        {resp.assignedEmployees?.length || 0} Staff
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
                      {resp.assignedEmployees && resp.assignedEmployees.length > 0 ? (
                        resp.assignedEmployees.map((emp) => {
                          const empObj = typeof emp === 'object' ? emp : allEmployees.find(e => e._id === emp);
                          return (
                            <span key={empObj?._id || emp} className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 text-slate-800 text-[11px] font-bold rounded-lg shadow-2xs">
                              {empObj?.name || empObj?.fullName || 'Staff'}
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-[11px] font-medium text-slate-400">No staff assigned yet</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200/60 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleOpenAssignModal(resp)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-xl font-bold text-xs transition-all"
                  >
                    <UserCheck size={14} /> Assign Staff
                  </button>

                  {canManageConsole && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenRespModal(resp)}
                        className="p-1.5 text-slate-500 hover:text-indigo-600 bg-white border border-slate-200 hover:bg-indigo-50 rounded-lg transition-all"
                        title="Edit Responsibility"
                      >
                        <Edit size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteResp(resp._id, resp.name)}
                        className="p-1.5 text-slate-500 hover:text-rose-600 bg-white border border-slate-200 hover:bg-rose-50 rounded-lg transition-all"
                        title="Delete Responsibility"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {responsibilities.length === 0 && !loading && (
            <div className="text-center py-12 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
              <UserCheck size={40} className="mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-700">No Business Responsibilities Configured</p>
              <p className="text-xs text-slate-400 mt-1">Click "Add Responsibility" to create duty codes like STORE_APPROVER or FINANCE_APPROVER.</p>
            </div>
          )}
        </div>
      )}

      {/* --- TAB 4: MANAGE ADMIN LOGINS --- */}
      {activeTab === 'admins' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Company Dedicated Admin Logins</h2>
              <p className="text-xs font-medium text-slate-500">
                Create & manage separate credentials for HR Admin, Store Admin, and Account Admin
              </p>
            </div>
            <button
              onClick={() => setShowAdminModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-2xl font-bold text-xs hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95"
            >
              <Plus size={16} /> Create Dedicated Admin
            </button>
          </div>

          {/* Admin Credentials Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {adminUsers.map((admin) => (
              <div key={admin._id} className="p-5 rounded-3xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-indigo-200 transition-all shadow-sm flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex justify-between items-start mb-3">
                    {getRoleBadge(admin.role)}
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${admin.status === 'DISABLED' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {admin.status || 'ACTIVE'}
                    </span>
                  </div>

                  <h3 className="font-extrabold text-slate-900 text-base tracking-tight">{admin.name}</h3>
                  <p className="text-xs font-bold text-indigo-600 tracking-tight mt-0.5">{admin.designation || admin.department || 'Administrator'}</p>

                  <div className="mt-4 space-y-2 text-xs text-slate-600 font-semibold">
                    <div className="flex items-center gap-2">
                      <Mail size={14} className="text-slate-400 shrink-0" />
                      <span className="truncate">{admin.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone size={14} className="text-slate-400 shrink-0" />
                      <span>{admin.mobile}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Key size={14} className="text-slate-400 shrink-0" />
                      <span>ID Code: <strong className="text-slate-900">{admin.employeeIdCode || admin.employeeId || 'N/A'}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200/60 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-400">Actions</span>
                  {(canManageConsole && (admin.role !== 'company_admin' || isSuperAdmin)) ? (
                    <button
                      onClick={() => handleDeleteAdminCred(admin._id, admin.name, admin.role)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 rounded-xl font-bold text-xs transition-all"
                    >
                      <Trash2 size={14} /> Delete Credential
                    </button>
                  ) : (
                    <span className="text-[11px] font-bold text-slate-400">Protected</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {adminUsers.length === 0 && !loading && (
            <div className="text-center py-12 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
              <UserCheck size={40} className="mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-700">No Admin Accounts Created Yet</p>
              <p className="text-xs text-slate-400 mt-1">Click "Create Dedicated Admin" to add HR, Store, or Account Admin logins.</p>
            </div>
          )}
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

            {/* Search Input */}
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search employee by name, email, department..."
                value={empSearch}
                onChange={(e) => setEmpSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Selection Options */}
            <div className="flex justify-between items-center text-xs font-bold text-slate-500 px-1">
              <span>{selectedEmpIds.length} Staff Selected</span>
              <div className="space-x-3">
                <button
                  type="button"
                  onClick={() => setSelectedEmpIds(allEmployees.map(e => e._id))}
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

            {/* Employee Checkboxes List */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 border border-slate-100 p-2 rounded-2xl bg-slate-50/50">
              {allEmployees
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
                      className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-all ${isChecked ? 'bg-indigo-50/70 border-indigo-200 text-indigo-900' : 'bg-white border-slate-200 hover:bg-slate-100/60'
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${isChecked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'
                          }`}>
                          {isChecked && <Check size={12} strokeWidth={3} />}
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
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
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

      {/* --- CREATE ADMIN MODAL --- */}
      {showAdminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Shield size={20} className="text-indigo-600" />
                <h3 className="font-bold text-lg text-slate-900">Create Dedicated Admin Credentials</h3>
              </div>
              <button onClick={() => setShowAdminModal(false)} className="text-slate-400 hover:text-slate-700 text-xl font-bold">×</button>
            </div>

            <form onSubmit={handleCreateAdmin} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Portal System Admin Role *</label>
                <select
                  value={adminForm.role}
                  onChange={handleRoleSelectChange}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                >
                  <option value="hr_admin">👥 HR Admin (HR & Staff Management)</option>
                  <option value="store_admin">📦 Store Admin (Materials & Dispatch)</option>
                  <option value="account_admin">💰 Account Admin (Finance & Customer Visits)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Sharma"
                  value={adminForm.name}
                  onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="hr.admin@company.com"
                    value={adminForm.email}
                    onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Contact Mobile *</label>
                  <input
                    type="text"
                    required
                    placeholder="9876543210"
                    value={adminForm.mobile}
                    onChange={(e) => setAdminForm({ ...adminForm, mobile: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Password *</label>
                  <input
                    type="password"
                    required
                    placeholder="Admin@123"
                    value={adminForm.password}
                    onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Employee ID Code (Optional)</label>
                  <input
                    type="text"
                    placeholder="Auto or e.g. HR002"
                    value={adminForm.employeeIdCode}
                    onChange={(e) => setAdminForm({ ...adminForm, employeeIdCode: e.target.value.toUpperCase() })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAdminModal(false)}
                  className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-2xl font-bold text-xs hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 text-white rounded-2xl font-bold text-xs hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                >
                  Create Admin Credential
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- LEVEL MODAL --- */}
      {showLevelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-lg text-slate-900">{editingLevel ? 'Edit Level' : 'Add Level'}</h3>
              <button onClick={() => setShowLevelModal(false)} className="text-slate-400 hover:text-slate-700 text-xl font-bold">×</button>
            </div>
            <form onSubmit={handleSaveLevel} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Level Name *</label>
                <input
                  type="text"
                  required
                  value={levelForm.name}
                  onChange={(e) => setLevelForm({ ...levelForm, name: e.target.value })}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Level Number *</label>
                  <input
                    type="number"
                    required
                    value={levelForm.levelNumber}
                    onChange={(e) => setLevelForm({ ...levelForm, levelNumber: Number(e.target.value) })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                  <select
                    value={levelForm.category}
                    onChange={(e) => setLevelForm({ ...levelForm, category: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="DIRECTOR">DIRECTOR</option>
                    <option value="MANAGEMENT">MANAGEMENT</option>
                    <option value="LEADERSHIP">LEADERSHIP</option>
                    <option value="STAFF">STAFF</option>
                    <option value="TRAINEE">TRAINEE</option>
                  </select>
                </div>
              </div>
              <div className="pt-3 flex justify-end gap-3 border-t border-slate-100">
                <button type="button" onClick={() => setShowLevelModal(false)} className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-2xl font-bold text-xs">Cancel</button>
                <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white rounded-2xl font-bold text-xs hover:bg-indigo-700 shadow-lg shadow-indigo-100">Save Level</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- GRADE MODAL --- */}
      {showGradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-lg text-slate-900">{editingGrade ? 'Edit Grade' : 'Add Grade'}</h3>
              <button onClick={() => setShowGradeModal(false)} className="text-slate-400 hover:text-slate-700 text-xl font-bold">×</button>
            </div>
            <form onSubmit={handleSaveGrade} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Grade Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Grade A"
                  value={gradeForm.name}
                  onChange={(e) => setGradeForm({ ...gradeForm, name: e.target.value })}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="a"
                    value={gradeForm.code}
                    onChange={(e) => setGradeForm({ ...gradeForm, code: e.target.value.toLowerCase() })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Order *</label>
                  <input
                    type="number"
                    required
                    value={gradeForm.order}
                    onChange={(e) => setGradeForm({ ...gradeForm, order: Number(e.target.value) })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div className="pt-3 flex justify-end gap-3 border-t border-slate-100">
                <button type="button" onClick={() => setShowGradeModal(false)} className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-2xl font-bold text-xs">Cancel</button>
                <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white rounded-2xl font-bold text-xs hover:bg-indigo-700 shadow-lg shadow-indigo-100">Save Grade</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminConsole;
