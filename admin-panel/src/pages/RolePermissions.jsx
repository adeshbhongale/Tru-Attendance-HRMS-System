import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Boxes,
  Check,
  CheckCheck,
  ChevronDown,
  Filter,
  HelpCircle,
  Loader2,
  Lock,
  MapPin,
  Plus,
  RotateCcw,
  Save,
  Search,
  Shield,
  ShieldCheck,
  UserPlus,
  Users,
  X
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';

const COLOR_PALETTE = [
  'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200',
  'bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-200',
  'bg-orange-100 text-orange-800 border-orange-300 hover:bg-orange-200',
  'bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200',
  'bg-teal-100 text-teal-800 border-teal-300 hover:bg-teal-200',
  'bg-cyan-100 text-cyan-800 border-cyan-300 hover:bg-cyan-200',
  'bg-indigo-100 text-indigo-800 border-indigo-300 hover:bg-indigo-200',
  'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200',
];

// Comprehensive Permission Metadata Mapping
const PERMISSION_METADATA_MAP = {
  'dashboard:view': {
    usedIn: 'Web Admin Panel /dashboard & Mobile App Main Screen',
    usagePurpose: 'Enables standard employees to view personal attendance stats, punch status, and personal notification cards.'
  },
  'dashboard:view_all': {
    usedIn: 'Executive Analytics /dashboard & Organization Overview',
    usagePurpose: 'Gives Company Admin full enterprise overview of total headcount, live company attendance rates, and material dispatch summaries.'
  },
  'dashboard:view_department': {
    usedIn: 'Department Dashboard /dashboard',
    usagePurpose: 'Enables Level 1 Dept Heads & Managers to monitor department attendance rates, absent counts, and active team dispatches.'
  },
  'dashboard:view_team': {
    usedIn: 'Team Lead Workspace & Mobile App Manager Feed',
    usagePurpose: 'Allows Level 2 Team Leads to view real-time status of direct report team members and active field tasks.'
  },
  'attendance:punch': {
    usedIn: 'Mobile App Geo-Punch Screen & POST /api/attendance/punch',
    usagePurpose: 'Allows employees and staff to record daily clock-in/out with GPS location geofencing and selfie photo verification.'
  },
  'attendance:view_own': {
    usedIn: 'Mobile App History & Web Employee Portal /attendance/my',
    usagePurpose: 'Permits individual users to view their personal work hours, punch timestamps, late arrivals, and monthly timesheets.'
  },
  'attendance:view_department': {
    usedIn: 'Attendance Register Page /attendance',
    usagePurpose: 'Allows HR Dept Head & Managers to inspect daily punch logs and shift registers for employees.'
  },
  'attendance:view_all': {
    usedIn: 'Central Attendance Audit /attendance/all',
    usagePurpose: 'Grants Company Admin organization-wide visibility across all company branches, departments, and shift locations.'
  },
  'attendance:approve': {
    usedIn: 'Attendance & Leave Regularization Queue /attendance/approvals',
    usagePurpose: 'Enables HR Dept Head to approve or reject leave requests, late punch regularization, overtime claims, and manual attendance adjustments.'
  },
  'transaction:create': {
    usedIn: 'Material Movement Module /material-movement & POST /api/materials/transactions',
    usagePurpose: 'Allows storekeepers, site engineers, and employees to initiate outward material dispatches, site transfers, and inventory movements.'
  },
  'transaction:view_own': {
    usedIn: 'Material Movement My Transactions /material-movement?tab=my',
    usagePurpose: 'Permits users to track the real-time status and delivery progress of material dispatch orders they personally created.'
  },
  'transaction:view_department': {
    usedIn: 'Department Material Log /material-movement?tab=dept',
    usagePurpose: 'Enables Store & Ops Department Heads to monitor all material inflows and outflows originating from or sent to their department.'
  },
  'transaction:view_all': {
    usedIn: 'Material Movement Central Hub /material-movement',
    usagePurpose: 'Gives Company Admin and Store Admin complete oversight over all inventory movements, godown dispatches, and inter-site material transfers across the company.'
  },
  'transaction:edit': {
    usedIn: 'Transaction Editor Drawer & PUT /api/materials/transactions/:id',
    usagePurpose: 'Allows Store Managers to update item quantities, driver details, vehicle numbers, or destination addresses before dispatch finalization.'
  },
  'transaction:cancel': {
    usedIn: 'Transaction Actions /api/materials/transactions/:id/cancel',
    usagePurpose: 'Enables Store Managers to void or abort incorrect or redundant material dispatch orders before store acceptance.'
  },
  'approval:view': {
    usedIn: 'Approvals Queue /material-movement/approvals',
    usagePurpose: 'Displays a dedicated inbox of material dispatches and high-value stock transfers awaiting store sign-off.'
  },
  'approval:approve': {
    usedIn: 'Approval Workflow POST /api/materials/approvals/:id/approve',
    usagePurpose: 'Grants Store Admin authority to sign off on material releases and authorize inventory dispatch execution.'
  },
  'approval:reject': {
    usedIn: 'Approval Workflow POST /api/materials/approvals/:id/reject',
    usagePurpose: 'Allows Store Admin to deny unauthorized or budget-exceeding material requests with mandatory rejection remarks.'
  },
  'approval:bulk': {
    usedIn: 'Store Operations Batch Bar POST /api/materials/approvals/bulk',
    usagePurpose: 'Enables Store Admin to approve or reject multiple material movement orders simultaneously.'
  },
  'store:accept': {
    usedIn: 'Store Receiving Portal POST /api/materials/store/accept',
    usagePurpose: 'Allows storekeepers to physically inspect, count, and sign off on incoming material shipments into the godown/store.'
  },
  'store:assign_handler': {
    usedIn: 'Store Allocation POST /api/materials/store/assign-handler',
    usagePurpose: 'Enables Level 1 Store Managers to assign loading/unloading handlers and store personnel to incoming dispatch orders.'
  },
  'store:inventory': {
    usedIn: 'Store Inventory Ledger /materials/inventory',
    usagePurpose: 'Allows store admins to audit current stock levels, perform stock reconciliation, and adjust physical vs system counts.'
  },
  'store:receive_return': {
    usedIn: 'Store Return Counter POST /api/materials/returns/receive',
    usagePurpose: 'Grants storekeepers authority to check returned materials for damage/usability and restock them into active store inventory.'
  },
  'material:view': {
    usedIn: 'Material Catalog /materials/catalog',
    usagePurpose: 'Enables users to browse the organization\'s standardized catalog of items, SKUs, unit measures, and material categories.'
  },
  'barcode:view': {
    usedIn: 'Barcode Management /materials/barcodes',
    usagePurpose: 'Allows users to view unique barcode serial numbers, QR code assets, and current physical storage rack/bin locations.'
  },
  'barcode:scan': {
    usedIn: 'Mobile Barcode Scanner & Handheld Reader POST /api/materials/scan',
    usagePurpose: 'Enables storekeepers and field staff to scan item barcodes for instant dispatch verification, stock audits, and receiving.'
  },
  'transfer:create': {
    usedIn: 'Inter-Godown Transfer Form /materials/transfers/new',
    usagePurpose: 'Allows users to initiate transfer requests of barcoded items between different godowns, sites, or departments.'
  },
  'transfer:approve': {
    usedIn: 'Transfer Approval POST /api/materials/transfers/:id/approve',
    usagePurpose: 'Gives Store Manager authority to validate and authorize relocation of barcoded inventory across facilities.'
  },
  'transfer:view': {
    usedIn: 'Material Transfer Tracker /materials/transfers',
    usagePurpose: 'Displays live status of in-transit material transfers, origin/destination godowns, and estimated arrival times.'
  },
  'return:create': {
    usedIn: 'Site Return Form /materials/returns/new',
    usagePurpose: 'Enables site staff to initiate return requests for unused, excess, or defective materials back to central store.'
  },
  'return:accept': {
    usedIn: 'Store Return Verification POST /api/materials/returns/:id/accept',
    usagePurpose: 'Allows store managers to inspect returned goods, categorize item condition, and credit inventory back to stock.'
  },
  'return:view': {
    usedIn: 'Return History Register /materials/returns',
    usagePurpose: 'Provides access to historic records of material returns, return reasons, and approval audit logs.'
  },
  'receiving:receive': {
    usedIn: 'Goods Received Note (GRN) Verification /materials/receiving',
    usagePurpose: 'Enables destination site supervisors to confirm physical receipt of dispatched materials and acknowledge quantity received.'
  },
  'chat:send': {
    usedIn: 'Material Movement Chat Drawer POST /api/materials/chat/send',
    usagePurpose: 'Allows dispatchers, drivers, storekeepers, and managers to communicate in real-time regarding specific dispatch orders.'
  },
  'chat:view': {
    usedIn: 'Material Movement Chat Drawer GET /api/materials/chat/history',
    usagePurpose: 'Gives authorized participants access to view discussion logs, notes, and audit messages attached to material transactions.'
  },
  'document:upload': {
    usedIn: 'Dispatch Attachment Uploader POST /api/materials/documents/upload',
    usagePurpose: 'Enables users to attach delivery challans, invoices, photos of loaded goods, or weighbridge slips to transactions.'
  },
  'document:view': {
    usedIn: 'Document Viewer Modal GET /api/materials/documents/view',
    usagePurpose: 'Allows users to view and download attached documents, challan PDFs, and photo evidence for material movements.'
  },
  'report:view': {
    usedIn: 'Reports Hub /reports',
    usagePurpose: 'Grants access to standard operational reports like daily attendance summary, material dispatch counts, and department totals.'
  },
  'report:export': {
    usedIn: 'Reports Export POST /reports/export',
    usagePurpose: 'Enables Accounts Admin and HR Admin to download generated reports in CSV, XLSX Excel spreadsheet, or PDF document formats.'
  },
  'report:view_all': {
    usedIn: 'Executive Analytics /reports/executive',
    usagePurpose: 'Gives Accounts Admin and Company Admin access to company-wide financial metrics, cross-department cost centers, and executive dashboards.'
  },
  'audit:view': {
    usedIn: 'Activity Audit Trail /audit-logs',
    usagePurpose: 'Enables Accounts Admin and Company Admin to inspect change histories, billing edits, and transaction audit logs.'
  },
  'audit:view_all': {
    usedIn: 'System Compliance Audit /audit-logs/system',
    usagePurpose: 'Gives Accounts Admin and Company Admin full access to system-wide security logs, financial adjustments, and data changes.'
  },
  'user:view': {
    usedIn: 'Employee Directory /employees',
    usagePurpose: 'Allows users to search and view employee profile details, designations, contact details, and department listings.'
  },
  'user:create': {
    usedIn: 'Employee Onboarding /employees/new & POST /api/employees',
    usagePurpose: 'Grants HR Admin authority to create new employee profiles, assign system credentials, and set initial role levels.'
  },
  'user:edit': {
    usedIn: 'Employee Profile Editor /employees/:id/edit',
    usagePurpose: 'Enables HR Admin to update employee personal info, designation, contact numbers, and shift assignments.'
  },
  'user:delete': {
    usedIn: 'Employee Directory Actions DELETE /api/employees/:id',
    usagePurpose: 'Restricts permanent user deletion or deactivation capabilities exclusively to HR Admin and top-level administration.'
  },
  'user:manage_department': {
    usedIn: 'Department Mapping /departments/assign',
    usagePurpose: 'Enables HR Admin to reassign employees across departments, project sites, or reporting managers.'
  },
  'master:view': {
    usedIn: 'Master Setup Pages /departments, /designations, /shifts',
    usagePurpose: 'Allows users to view organization configuration lists including shifts, department structures, and designation titles.'
  },
  'master:create': {
    usedIn: 'Master Setup Modals POST /api/departments, POST /api/shifts',
    usagePurpose: 'Enables HR Admin to configure new departments, designation hierarchies, shift timings, and holiday master records.'
  },
  'master:edit': {
    usedIn: 'Master Setup Modals PUT /api/departments/:id, PUT /api/shifts/:id',
    usagePurpose: 'Enables HR Admin to modify department names, shift rules, overtime policies, and designation grade mappings.'
  },
  'master:delete': {
    usedIn: 'Master Setup Actions DELETE /api/departments/:id',
    usagePurpose: 'Restricts removal of core organization structures, shifts, or department codes to HR Admin and top-level administration.'
  },
  'settings:view': {
    usedIn: 'System Settings /settings',
    usagePurpose: 'Grants access to view global company settings, geofencing parameters, attendance policies, and working hours.'
  },
  'settings:edit': {
    usedIn: 'System Settings POST /settings/save',
    usagePurpose: 'Grants authority to alter enterprise-wide system rules, geofence radius, default attendance rules, and organization profile.'
  },
  'notification:view': {
    usedIn: 'Header Notification Bell & Mobile Alerts /notifications',
    usagePurpose: 'Enables all system users to receive real-time push notifications, attendance alerts, dispatch updates, and system notices.'
  }
};

const MODULE_TABS = [
  {
    id: 'hrms',
    label: 'HRMS / HR Module',
    icon: <Users size={16} />,
    description: 'Attendance, Employee Directory, Master Setup, Notifications & HR Dashboard',
    categories: ['Dashboard', 'Attendance', 'User & Master Management', 'Settings', 'Notifications', 'Reports & Audit']
  },
  {
    id: 'material',
    label: 'Material Movement Module',
    icon: <Boxes size={16} />,
    description: 'Dispatches, Store Operations, Barcodes, Transfers, Returns & Transaction Chat',
    categories: ['Transactions & Material Movement', 'Approvals & Store Operations', 'Materials & Barcodes', 'Transfers & Returns', 'Chat & Documents']
  },
  {
    id: 'all',
    label: 'All Permissions',
    icon: <Shield size={16} />,
    description: 'View & Manage Complete Enterprise Permission Matrix',
    categories: []
  }
];

const RolePermissions = () => {
  const [permissions, setPermissions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [groupedPermissions, setGroupedPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeModule, setActiveModule] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [modifiedKeys, setModifiedKeys] = useState(new Set());
  const [resetConfirm, setResetConfirm] = useState(false);
  
  // Track open role select dropdown key
  const [openDropdownKey, setOpenDropdownKey] = useState(null);

  useEffect(() => {
    fetchPermissionsAndDepartments();

    // Close dropdown on outside click
    const handleClickOutside = () => setOpenDropdownKey(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const fetchPermissionsAndDepartments = async () => {
    try {
      setLoading(true);
      const [permRes, deptRes] = await Promise.all([
        api.get('/permissions'),
        api.get('/departments').catch(() => ({ data: { success: false, data: [] } }))
      ]);

      if (permRes.data.success) {
        setPermissions(permRes.data.data || []);
        setGroupedPermissions(permRes.data.grouped || {});
        setModifiedKeys(new Set());
      }

      if (deptRes.data && deptRes.data.success) {
        setDepartments(deptRes.data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch permissions or departments:', err);
      toast.error(err.response?.data?.message || 'Failed to load permissions matrix');
    } finally {
      setLoading(false);
    }
  };

  // DYNAMIC CONFIGURABLE ROLES GENERATED FROM DEPARTMENT MASTER
  const configurableRoles = useMemo(() => {
    // 1) Dynamic Department Head roles built directly from fetched Department Master records
    const deptRoles = departments.map((dept, idx) => {
      const cleanName = (dept.name || '').trim();
      const prefix = (dept.prefix || cleanName.substring(0, 2)).toUpperCase();
      const roleId = `dept:${cleanName.toLowerCase().replace(/\s+/g, '_')}_admin`;
      const color = COLOR_PALETTE[idx % COLOR_PALETTE.length];

      return {
        id: roleId,
        label: `${cleanName} Dept Head`,
        code: `TC${prefix}1`,
        levelLabel: `${cleanName} Manager`,
        color,
        isDeptRole: true
      };
    });

    // 2) Standard System Roles
    const systemRoles = [
      { id: 'admin', label: 'General Admin', code: 'TCAD1', levelLabel: 'Level 1 Systems Admin', color: 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200' },
      { id: 'team_lead', label: 'Team Lead', code: 'L2', levelLabel: 'Level 2 Supervisor', color: 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200' },
      { id: 'employee', label: 'Employee', code: 'L4/L5', levelLabel: 'Level 4/5 Operational Staff', color: 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200' },
    ];

    // Fallback if department master is empty or still loading
    if (deptRoles.length === 0) {
      const defaultDeptRoles = [
        { id: 'dept:store_admin', label: 'Store Dept Head', code: 'TCST1', levelLabel: 'Store Manager', color: COLOR_PALETTE[0] },
        { id: 'dept:hr_admin', label: 'HR Dept Head', code: 'TCHR1', levelLabel: 'HR Manager', color: COLOR_PALETTE[1] },
        { id: 'dept:ops_admin', label: 'Ops Dept Head', code: 'TCOP1', levelLabel: 'Site Operations Lead', color: COLOR_PALETTE[2] },
        { id: 'dept:software_admin', label: 'Software Dept Head', code: 'TCSF1', levelLabel: 'Software Lead', color: COLOR_PALETTE[3] },
        { id: 'dept:finance_admin', label: 'Finance Dept Head', code: 'TCFN1', levelLabel: 'Accounts Manager', color: COLOR_PALETTE[4] },
        { id: 'dept:sales_admin', label: 'Sales Dept Head', code: 'TCSL1', levelLabel: 'Sales Manager', color: COLOR_PALETTE[5] },
      ];
      return [...defaultDeptRoles, ...systemRoles];
    }

    return [...deptRoles, ...systemRoles];
  }, [departments]);

  const availableCategories = useMemo(() => {
    const currentModule = MODULE_TABS.find((m) => m.id === activeModule);
    if (!currentModule || currentModule.id === 'all') {
      return ['All', ...Object.keys(groupedPermissions)];
    }
    const filteredCats = Object.keys(groupedPermissions).filter((cat) =>
      currentModule.categories.includes(cat)
    );
    return ['All', ...filteredCats];
  }, [groupedPermissions, activeModule]);

  const filteredPermissions = useMemo(() => {
    const currentModule = MODULE_TABS.find((m) => m.id === activeModule);

    return permissions.filter((p) => {
      const matchesModule =
        !currentModule ||
        currentModule.id === 'all' ||
        currentModule.categories.includes(p.category);

      const matchesCategory =
        selectedCategory === 'All' || p.category === selectedCategory;

      const meta = PERMISSION_METADATA_MAP[p.permissionKey] || {};
      const usedInStr = p.usedIn || meta.usedIn || '';
      const usagePurposeStr = p.usagePurpose || meta.usagePurpose || '';

      const queryLower = searchQuery.toLowerCase();
      const matchesSearch =
        p.permissionKey.toLowerCase().includes(queryLower) ||
        (p.description && p.description.toLowerCase().includes(queryLower)) ||
        p.category.toLowerCase().includes(queryLower) ||
        usedInStr.toLowerCase().includes(queryLower) ||
        usagePurposeStr.toLowerCase().includes(queryLower);

      return matchesModule && matchesCategory && matchesSearch;
    });
  }, [permissions, activeModule, selectedCategory, searchQuery]);

  // Toggle single role in permission's allowedRoles array
  const toggleRolePermission = (permissionKey, roleId) => {
    setPermissions((prev) =>
      prev.map((p) => {
        if (p.permissionKey === permissionKey) {
          const currentRoles = p.allowedRoles || [];
          const exists = currentRoles.includes(roleId);
          const updatedRoles = exists
            ? currentRoles.filter((r) => r !== roleId)
            : [...currentRoles, roleId];

          return { ...p, allowedRoles: updatedRoles };
        }
        return p;
      })
    );

    setModifiedKeys((prev) => new Set(prev).add(permissionKey));
  };

  // Set explicit allowedRoles array for a permission
  const setPermissionRoles = (permissionKey, newRoles) => {
    setPermissions((prev) =>
      prev.map((p) => {
        if (p.permissionKey === permissionKey) {
          return { ...p, allowedRoles: newRoles };
        }
        return p;
      })
    );
    setModifiedKeys((prev) => new Set(prev).add(permissionKey));
  };

  const handleBulkSave = async () => {
    try {
      setSaving(true);
      const payload = permissions.map((p) => {
        const customRoles = p.allowedRoles || [];
        const allAllowed = Array.from(new Set(['super_admin', 'company_admin', ...customRoles]));
        return {
          permissionKey: p.permissionKey,
          allowedRoles: allAllowed,
          allowedRoleCodes: p.allowedRoleCodes || [],
          description: p.description,
          usedIn: p.usedIn,
          usagePurpose: p.usagePurpose,
          status: p.status || 'active',
        };
      });

      const res = await api.post('/permissions/bulk', { permissions: payload });
      if (res.data.success) {
        toast.success('Role permissions matrix updated successfully!');
        setModifiedKeys(new Set());
        fetchPermissionsAndDepartments();
      }
    } catch (err) {
      console.error('Failed to save permissions:', err);
      toast.error(err.response?.data?.message || 'Failed to save permission changes');
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefault = async () => {
    try {
      setResetting(true);
      const res = await api.post('/permissions/reset');
      if (res.data.success) {
        toast.success('Permissions reset to system defaults!');
        setResetConfirm(false);
        fetchPermissionsAndDepartments();
      }
    } catch (err) {
      console.error('Failed to reset permissions:', err);
      toast.error(err.response?.data?.message || 'Failed to reset permissions');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="p-3 sm:p-5 w-full max-w-full space-y-5 overflow-x-hidden">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-5 sm:p-7 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-xs font-bold tracking-wide uppercase text-indigo-300 backdrop-blur-md">
              <Lock size={14} />
              Dynamic Department Master Integrated Role Access
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight flex items-center gap-2">
              Role & Permission Matrix
            </h1>
            <p className="text-slate-300 text-xs max-w-2xl font-medium leading-relaxed">
              Fully dynamic role selector: Department Head roles are populated automatically from Department Master records.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setResetConfirm(true)}
              className="px-3.5 py-2 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all flex items-center gap-1.5 backdrop-blur-md border border-white/10 active:scale-95 cursor-pointer"
            >
              <RotateCcw size={15} />
              Reset Defaults
            </button>
            <button
              type="button"
              onClick={handleBulkSave}
              disabled={saving}
              className={`px-4 py-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white text-xs font-extrabold shadow-lg shadow-indigo-500/30 transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer ${
                saving ? 'opacity-70 cursor-not-allowed' : ''
              }`}
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              Save Changes {modifiedKeys.size > 0 && `(${modifiedKeys.size})`}
            </button>
          </div>
        </div>
      </div>

      {/* Executive Access Policy Notice */}
      <div className="bg-indigo-50/90 border border-indigo-200/90 rounded-3xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600 text-white rounded-2xl flex-shrink-0 shadow-sm">
            <ShieldCheck size={18} />
          </div>
          <div className="space-y-0.5">
            <h3 className="text-xs font-extrabold text-indigo-950 flex items-center gap-2">
              Super Admin & Company Admin Full Access Policy
            </h3>
            <p className="text-[11px] text-indigo-800 font-medium leading-relaxed">
              Super Admin (<span className="font-mono font-bold text-indigo-900 bg-indigo-100/80 px-1.5 py-0.5 rounded">TCSA1</span>) and Company Admin (<span className="font-mono font-bold text-indigo-900 bg-indigo-100/80 px-1.5 py-0.5 rounded">TCCA1</span>) inherently possess 100% full system privileges across all modules and actions by default.
            </p>
          </div>
        </div>
      </div>

      {/* Module Tabs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {MODULE_TABS.map((tab) => {
          const isActive = activeModule === tab.id;
          return (
            <button
              type="button"
              key={tab.id}
              onClick={() => {
                setActiveModule(tab.id);
                setSelectedCategory('All');
              }}
              className={`p-4 rounded-3xl border text-left transition-all relative overflow-hidden flex flex-col justify-between cursor-pointer ${
                isActive
                  ? 'bg-white border-indigo-600 shadow-lg shadow-indigo-100 ring-2 ring-indigo-500/20'
                  : 'bg-white/80 border-slate-200 hover:border-slate-300 hover:bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`p-2.5 rounded-2xl transition-colors ${
                      isActive ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {tab.icon}
                  </div>
                  <span className={`font-extrabold text-xs sm:text-sm ${isActive ? 'text-indigo-950' : 'text-slate-700'}`}>
                    {tab.label}
                  </span>
                </div>
                {isActive && (
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse" />
                )}
              </div>
              <p className="text-[11px] text-slate-500 font-medium leading-tight">
                {tab.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Search & Category Filter */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search permission key, description, or route..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <ShieldCheck size={16} className="text-indigo-600" />
            Showing {filteredPermissions.length} Permissions
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 flex-wrap border-t border-slate-100 pt-3">
          <Filter size={14} className="text-slate-400 mr-1 flex-shrink-0" />
          <span className="text-[11px] font-extrabold text-slate-500 mr-1">Category:</span>
          {availableCategories.map((cat) => (
            <button
              type="button"
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Permissions List Cards with Dropdown Role Selectors */}
      {loading ? (
        <div className="bg-white rounded-3xl p-10 border border-slate-200 shadow-sm text-center">
          <Loader2 size={32} className="animate-spin text-indigo-600 mx-auto mb-2" />
          <p className="text-xs font-bold text-slate-600">Loading Permission Matrix & Department Master...</p>
        </div>
      ) : filteredPermissions.length === 0 ? (
        <div className="bg-white rounded-3xl p-10 border border-slate-200 shadow-sm text-center space-y-3">
          <Shield size={40} className="text-slate-300 mx-auto" />
          <h3 className="text-sm font-bold text-slate-800">No Permissions Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            No permissions are currently seeded in the database or match your filter. Click below to seed standard default permissions.
          </p>
          <button
            type="button"
            onClick={handleResetToDefault}
            disabled={resetting}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-2xl transition-all inline-flex items-center gap-2 shadow-md cursor-pointer"
          >
            {resetting ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
            Seed System Permissions
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPermissions.map((item) => {
            const isModified = modifiedKeys.has(item.permissionKey);
            const metadata = PERMISSION_METADATA_MAP[item.permissionKey] || {};
            const usedIn = item.usedIn || metadata.usedIn || 'Web Admin Panel & Mobile App API';
            const usagePurpose = item.usagePurpose || metadata.usagePurpose || item.description || 'System access permission.';
            const currentAllowedRoles = item.allowedRoles || [];
            const isDropdownOpen = openDropdownKey === item.permissionKey;

            return (
              <div
                key={item.permissionKey}
                className={`bg-white rounded-3xl p-5 border transition-all shadow-sm space-y-4 ${
                  isModified ? 'border-amber-400 bg-amber-50/20 ring-1 ring-amber-400/30' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Top Permission Key Header & Badges */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-extrabold text-slate-900 bg-slate-100 px-3 py-1 rounded-xl text-xs border border-slate-200 shadow-xs">
                      {item.permissionKey}
                    </span>
                    <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 font-bold rounded-lg text-[10px] border border-indigo-200">
                      {item.category}
                    </span>
                    {isModified && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-extrabold text-amber-700 bg-amber-50 border border-amber-300 px-2.5 py-0.5 rounded-full">
                        Modified
                      </span>
                    )}
                  </div>

                  {/* Quick Action Preset Buttons */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        const allDeptHeadIds = configurableRoles.filter(r => r.id.startsWith('dept:') || r.id === 'admin').map(r => r.id);
                        setPermissionRoles(item.permissionKey, Array.from(new Set([...currentAllowedRoles, ...allDeptHeadIds])));
                      }}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <CheckCheck size={12} className="text-indigo-600" />
                      Add Dept Heads
                    </button>
                    <button
                      type="button"
                      onClick={() => setPermissionRoles(item.permissionKey, [])}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-rose-100 hover:text-rose-700 text-slate-500 text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      Clear Roles
                    </button>
                  </div>
                </div>

                {/* Description & Location/Purpose Metadata */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-1 space-y-1">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Description</span>
                    <p className="text-xs font-semibold text-slate-800 leading-snug">
                      {item.description || 'No description provided.'}
                    </p>
                  </div>

                  <div className="md:col-span-2 bg-slate-50 border border-slate-200/80 rounded-2xl p-3 space-y-1.5">
                    <div className="flex items-start gap-1.5 text-[11px]">
                      <MapPin size={14} className="text-indigo-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-extrabold text-indigo-950 mr-1.5">Used In:</span>
                        <span className="font-medium text-slate-700">{usedIn}</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-1.5 text-[11px]">
                      <HelpCircle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-extrabold text-amber-950 mr-1.5">Purpose:</span>
                        <span className="font-medium text-slate-600 leading-relaxed">{usagePurpose}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Assigned Roles Tags & Dropdown Selector */}
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <UserPlus size={13} className="text-indigo-600" />
                      Granted Role Codes / User Roles ({currentAllowedRoles.filter(r => !['super_admin', 'company_admin'].includes(r)).length})
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap min-h-[40px] bg-slate-50/70 p-2.5 rounded-2xl border border-slate-200">
                    {/* Active Granted Role Badges */}
                    {configurableRoles.filter((role) => currentAllowedRoles.includes(role.id)).map((role) => (
                      <span
                        key={role.id}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-extrabold border shadow-2xs transition-all ${role.color}`}
                      >
                        <span>{role.label}</span>
                        <span className="opacity-75 font-mono text-[10px]">({role.code})</span>
                        <button
                          type="button"
                          onClick={() => toggleRolePermission(item.permissionKey, role.id)}
                          className="hover:bg-black/10 rounded-full p-0.5 cursor-pointer text-slate-700 hover:text-red-700 transition-colors ml-0.5"
                          title={`Remove ${role.label}`}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}

                    {currentAllowedRoles.filter(r => !['super_admin', 'company_admin'].includes(r)).length === 0 && (
                      <span className="text-xs font-semibold text-slate-400 italic px-1">
                        No configurable roles assigned yet. Choose from dropdown below.
                      </span>
                    )}

                    {/* Role Dropdown Selector Button */}
                    <div className="relative inline-block ml-auto">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenDropdownKey(isDropdownOpen ? null : item.permissionKey);
                        }}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                      >
                        <Plus size={14} />
                        <span>Choose Role Code</span>
                        <ChevronDown size={14} className={`transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {/* Dropdown Menu */}
                      <AnimatePresence>
                        {isDropdownOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: 5, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 5, scale: 0.98 }}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl border border-slate-200 shadow-2xl z-40 p-2 space-y-1"
                          >
                            <div className="px-3 py-1.5 border-b border-slate-100 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                              Select Role Codes to Grant Access
                            </div>

                            <div className="max-h-60 overflow-y-auto space-y-1 p-1">
                              {configurableRoles.map((role) => {
                                const isSelected = currentAllowedRoles.includes(role.id);
                                return (
                                  <button
                                    type="button"
                                    key={role.id}
                                    onClick={() => toggleRolePermission(item.permissionKey, role.id)}
                                    className={`w-full px-3 py-2 rounded-xl text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                                      isSelected
                                        ? 'bg-indigo-50 text-indigo-950 font-extrabold border border-indigo-200'
                                        : 'hover:bg-slate-50 text-slate-700'
                                    }`}
                                  >
                                    <div className="flex flex-col">
                                      <span>{role.label}</span>
                                      <span className="text-[10px] text-slate-500 font-normal">{role.levelLabel}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <span className={`px-1.5 py-0.2 rounded-md text-[9px] font-mono border ${role.color}`}>
                                        {role.code}
                                      </span>
                                      {isSelected && <Check size={14} className="text-indigo-600" />}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reset Confirmation Modal */}
      <AnimatePresence>
        {resetConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200 shadow-2xl space-y-4"
            >
              <div className="flex items-center gap-3 text-amber-600 bg-amber-50 p-3 rounded-2xl border border-amber-200">
                <AlertTriangle size={24} className="flex-shrink-0" />
                <h3 className="font-extrabold text-sm text-amber-900">Reset Permissions Matrix?</h3>
              </div>

              <p className="text-xs font-medium text-slate-600 leading-relaxed">
                This action will reset all custom permission rules back to system default settings. Any custom role access changes will be overwritten.
              </p>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setResetConfirm(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleResetToDefault}
                  disabled={resetting}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-2 cursor-pointer"
                >
                  {resetting && <Loader2 size={14} className="animate-spin" />}
                  Confirm Reset
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RolePermissions;
