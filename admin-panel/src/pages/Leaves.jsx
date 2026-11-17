import { AnimatePresence, motion } from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Download, FileText, Filter, Loader2, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api, { IMAGE_BASE_URL } from '../api/axios';

const getFullImageUrl = (path) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `${IMAGE_BASE_URL}/${path.replace(/\\/g, '/')}`;
};

const getApproverName = (req) => {
    if (!req) return '—';
    if (req.status === 'Approved' || req.status === 'Rejected') {
        return req.actionedByName || req.actionedBy?.fullName || req.actionedBy?.name || req.approverId?.fullName || req.approverId?.name || '—';
    }
    if (req.status === 'Pending') {
        return req.approverId?.fullName || req.approverId?.name || req.user?.reportsTo?.fullName || req.user?.reportsTo?.name || '—';
    }
    return '—';
};

const getDecisionReason = (req) => {
    if (!req) return '';
    return String(req.rejectionReason || req.adminNote || '').trim();
};

const Leaves = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { user } = useSelector((state) => state.auth);

    const userRole = String(user?.role || '').trim().toLowerCase().replace(/[-\s]/g, '_');
    const userRoleCode = String(user?.roleCode || '').trim().toUpperCase().replace(/[-\s]/g, '_');
    const deptAdminType = String(user?.departmentAdminType || user?.adminType || '').trim().toLowerCase();
    const isRestrictedDeptAdmin =
        ['store', 'accounts', 'account', 'finance'].includes(deptAdminType) ||
        ['store', 'store_admin', 'store_manager', 'accounts', 'account_admin', 'accounts_admin', 'finance'].includes(userRole) ||
        ['STORE_ADMIN', 'ACCOUNT_ADMIN', 'ACCOUNTS_ADMIN'].includes(userRoleCode);
    const canApproveLeave = !isRestrictedDeptAdmin && (
        userRole === 'superadmin' || userRole === 'super_admin' || userRoleCode === 'TCSA1' || user?.scope === 'GLOBAL' ||
        userRole === 'company_admin' || userRole === 'companyadmin' || userRole === 'admin' || userRoleCode === 'TCCA1' ||
        userRole === 'hr_admin' || userRole === 'hr' || userRoleCode === 'HR_ADMIN' || userRoleCode === 'TCSF2A' || userRoleCode === 'TCSFA' || deptAdminType === 'hr'
    );

    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || 'All');
    const [filterType, setFilterType] = useState('All');
    const [filterDuration, setFilterDuration] = useState('All');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const [showStatusDropdown, setShowStatusDropdown] = useState(false);
    const [showTypeDropdown, setShowTypeDropdown] = useState(false);
    const [showDurationDropdown, setShowDurationDropdown] = useState(false);
    const [showExportOptions, setShowExportOptions] = useState(false);

    const [actionModal, setActionModal] = useState({ open: false, item: null, status: 'Approved', reason: '' });
    const [submittingAction, setSubmittingAction] = useState(false);

    const statusDropdownRef = useRef(null);
    const typeDropdownRef = useRef(null);
    const durationDropdownRef = useRef(null);
    const exportDropdownRef = useRef(null);

    const [leaveTypes, setLeaveTypes] = useState([]);

    useEffect(() => {
        fetchRequests();
        fetchLeaveTypes();
    }, []);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target)) {
                setShowStatusDropdown(false);
            }
            if (typeDropdownRef.current && !typeDropdownRef.current.contains(event.target)) {
                setShowTypeDropdown(false);
            }
            if (durationDropdownRef.current && !durationDropdownRef.current.contains(event.target)) {
                setShowDurationDropdown(false);
            }
            if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target)) {
                setShowExportOptions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchLeaveTypes = async () => {
        try {
            const res = await api.get('/leave-types');
            setLeaveTypes(res.data.data.filter(lt => lt.status === 'active'));
        } catch (err) {
            console.error('Failed to load leave types');
        }
    };

    const fetchRequests = async () => {
        try {
            setLoading(true);
            const res = await api.get('/leaves');
            setRequests(res.data.data || []);
        } catch (err) {
            toast.error('Failed to load leave requests');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitAction = async (e) => {
        e.preventDefault();
        if (!actionModal.item) return;
        const trimmed = actionModal.reason.trim();
        if (actionModal.status === 'Rejected' && !trimmed) {
            toast.error('Please enter a reason for rejection');
            return;
        }
        try {
            setSubmittingAction(true);
            await api.patch(`/leaves/${actionModal.item._id}`, {
                status: actionModal.status,
                reason: trimmed,
                adminNote: trimmed,
                ...(actionModal.status === 'Rejected' ? { rejectionReason: trimmed } : {}),
            });
            toast.success(`Leave ${actionModal.status.toLowerCase()} successfully`);
            setActionModal({ open: false, item: null, status: 'Approved', reason: '' });
            await fetchRequests();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update leave status');
        } finally {
            setSubmittingAction(false);
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '--/--/----';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '--/--/----';
        const d = String(date.getDate()).padStart(2, '0');
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const y = date.getFullYear();
        return `${d}-${m}-${y}`;
    };

    const formatAppliedDateTime = (req) => {
        const dateStr = req.appliedOn || req.createdAt;
        if (!dateStr) return '--/--/----';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '--/--/----';
        const d = String(date.getDate()).padStart(2, '0');
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const y = date.getFullYear();
        let hrs = date.getHours();
        const mins = String(date.getMinutes()).padStart(2, '0');
        const ampm = hrs >= 12 ? 'PM' : 'AM';
        hrs = hrs % 12 || 12;
        return `${d}-${m}-${y} ${hrs}:${mins} ${ampm}`;
    };

    const formatTime12h = (timeStr) => {
        if (!timeStr || timeStr === 'NA') return '';
        const parts = timeStr.split(':');
        if (parts.length < 2) return timeStr;
        const hours = parseInt(parts[0], 10);
        const minutes = parts[1];
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const hours12 = hours % 12 || 12;
        return `${hours12}:${minutes} ${ampm}`;
    };

    useEffect(() => {
        setCurrentPage(1);
    }, [filterStatus, filterType, filterDuration, searchQuery]);

    const filteredRequests = requests.filter(req => {
        const q = searchQuery.toLowerCase();
        const matchesSearch =
            (req.user?.name || '').toLowerCase().includes(q) ||
            (req.reason || '').toLowerCase().includes(q) ||
            getApproverName(req).toLowerCase().includes(q) ||
            getDecisionReason(req).toLowerCase().includes(q);

        const matchesStatus = filterStatus === 'All' || req.status === filterStatus;
        const matchesType = filterType === 'All' || req.leaveType === filterType;
        const matchesDuration = filterDuration === 'All' || req.duration === filterDuration;

        return matchesSearch && matchesStatus && matchesType && matchesDuration;
    });

    const stats = {
        pending: requests.filter(r => r.status === 'Pending').length,
        approved: requests.filter(r => r.status === 'Approved').length,
        rejected: requests.filter(r => r.status === 'Rejected').length,
        cancelled: requests.filter(r => r.status === 'Cancelled').length,
        halfDays: requests.filter(r => r.status === 'Approved' && r.duration === 'Half Day').length,
        fullDays: requests.filter(r => r.status === 'Approved' && (r.duration === 'Full Day' || r.duration === 'Multiple Days')).length,
    };

    const currentData = filteredRequests.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const totalPages = Math.ceil(filteredRequests.length / itemsPerPage);

    const getLeaveCode = (typeName) => {
        const lt = leaveTypes.find(l => l.name === typeName);
        return lt ? lt.code : typeName;
    };

    const getLeaveDaysText = (req) =>
        req.duration === 'Half Day'
            ? '0.5'
            : String(req.durationDays || (Math.ceil((new Date(req.endDate) - new Date(req.startDate)) / (1000 * 60 * 60 * 24)) + 1));

    const handleExportCSV = () => {
        if (!filteredRequests.length) return toast.error('No leave records to export');
        const escapeCell = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
        const headers = ['Employee', 'Applied On', 'Type', 'Dates', 'Days', 'Leave Reason', 'Status', 'Approval / Actioned By', 'Rejection Reason'];
        const rows = filteredRequests.map(r => {
            const dates = (r.duration === 'Multiple Days' || (formatDate(r.startDate) !== formatDate(r.endDate) && r.duration !== 'Half Day'))
                ? `${formatDate(r.startDate)} to ${formatDate(r.endDate)}`
                : formatDate(r.startDate);
            return [
                r.user?.name || 'N/A',
                formatAppliedDateTime(r),
                r.leaveType || 'N/A',
                dates,
                getLeaveDaysText(r),
                r.reason || '',
                r.status || 'Pending',
                getApproverName(r),
                r.status === 'Rejected' ? (getDecisionReason(r) || '—') : '—',
            ].map(escapeCell).join(',');
        });
        const csvContent = '\ufeff' + [headers.map(escapeCell).join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `Leave_Report_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleExportPDF = () => {
        if (!filteredRequests.length) return toast.error('No leave records to export');
        const doc = new jsPDF('l', 'mm', 'a4');
        doc.setFontSize(18);
        doc.setTextColor(79, 70, 229);
        doc.text('Leave Report', 14, 18);
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text(`Generated On: ${new Date().toLocaleString()}`, 14, 25);

        const body = filteredRequests.map(r => {
            const dates = (r.duration === 'Multiple Days' || (formatDate(r.startDate) !== formatDate(r.endDate) && r.duration !== 'Half Day'))
                ? `${formatDate(r.startDate)} - ${formatDate(r.endDate)}`
                : formatDate(r.startDate);
            return [
                r.user?.name || 'N/A',
                formatAppliedDateTime(r),
                getLeaveCode(r.leaveType),
                `${dates} (${getLeaveDaysText(r)}d)`,
                r.reason || '—',
                r.status || 'Pending',
                getApproverName(r),
                r.status === 'Rejected' ? (getDecisionReason(r) || '—') : '—',
            ];
        });

        autoTable(doc, {
            head: [['Employee', 'Applied On', 'Type', 'Duration', 'Leave Reason', 'Status', 'Approval Name', 'Rejection Reason']],
            body,
            startY: 31,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229], textColor: 255, fontSize: 8, fontStyle: 'bold' },
            bodyStyles: { fontSize: 7.5, textColor: [51, 65, 85] },
            alternateRowStyles: { fillColor: [248, 250, 252] },
        });

        doc.save(`Leave_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
                <Loader2 className="animate-spin text-indigo-600" size={40} />
                <p className="text-slate-500 font-bold text-sm animate-pulse tracking-widest ">Loading Requests...</p>
            </div>
        );
    }

    const totalColCount = canApproveLeave ? 8 : 7;

    return (
        <div className="space-y-8 animate-fade-up">
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-3 bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 rounded-2xl hover:shadow-lg transition-all"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div>
                        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight m-0">Leave Requests & Report</h2>
                        <p className="text-slate-600 font-bold text-[13px] mt-2">Manage staff leaves, approvals, and rejection reasons</p>
                    </div>
                </div>

                <div className="relative" ref={exportDropdownRef}>
                    <button
                        onClick={() => setShowExportOptions(!showExportOptions)}
                        className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-xs hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                    >
                        <Download size={16} />
                        Export Leave Report
                        <ChevronDown size={14} className={`transition-transform duration-200 ${showExportOptions ? 'rotate-180' : ''}`} />
                    </button>
                    <AnimatePresence>
                        {showExportOptions && (
                            <motion.div
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-50 overflow-hidden"
                            >
                                <button
                                    onClick={() => { handleExportCSV(); setShowExportOptions(false); }}
                                    className="w-full px-4 py-3 text-left text-[11px] font-bold text-slate-600 hover:bg-slate-50 hover:text-indigo-600 flex items-center gap-2 transition-colors"
                                >
                                    <Download size={14} className="text-slate-400" /> Export Excel (CSV)
                                </button>
                                <button
                                    onClick={() => { handleExportPDF(); setShowExportOptions(false); }}
                                    className="w-full px-4 py-3 text-left text-[11px] font-bold text-slate-600 hover:bg-slate-50 hover:text-rose-600 flex items-center gap-2 transition-colors"
                                >
                                    <FileText size={14} className="text-slate-400" /> Export PDF Report
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row justify-between items-center gap-6">
                <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
                    <div className="relative" ref={statusDropdownRef}>
                        <button
                            onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                            className="flex items-center gap-3 bg-white border border-slate-200 px-5 py-3 rounded-2xl shadow-sm hover:bg-slate-50 transition-all min-w-[150px] justify-between"
                        >
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${filterStatus === 'Approved' ? 'bg-emerald-500' :
                                    filterStatus === 'Pending' ? 'bg-amber-500' :
                                        filterStatus === 'Rejected' ? 'bg-rose-500' :
                                            filterStatus === 'Cancelled' ? 'bg-slate-500' : 'bg-slate-300'
                                    }`} />
                                <span className="text-sm font-bold text-slate-700">{filterStatus}</span>
                            </div>
                            <ChevronDown size={16} className={`text-slate-400 transition-transform ${showStatusDropdown ? 'rotate-180' : ''}`} />
                        </button>

                        <AnimatePresence>
                            {showStatusDropdown && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 10, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    className="absolute top-full left-0 mt-2 z-[110] bg-white border border-slate-200 rounded-2xl shadow-2xl p-2 w-full min-w-[180px]"
                                >
                                    {['All', 'Pending', 'Approved', 'Rejected', 'Cancelled'].map((status) => (
                                        <button
                                            key={status}
                                            onClick={() => {
                                                setFilterStatus(status);
                                                setShowStatusDropdown(false);
                                            }}
                                            className={`w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${filterStatus === status ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-50'
                                                }`}
                                        >
                                            {status}
                                            {filterStatus === status && <Check size={14} />}
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className="relative" ref={typeDropdownRef}>
                        <button
                            onClick={() => setShowTypeDropdown(!showTypeDropdown)}
                            className="flex items-center gap-3 bg-white border border-slate-200 px-5 py-3 rounded-2xl shadow-sm hover:bg-slate-50 transition-all min-w-[150px] justify-between"
                        >
                            <div className="flex items-center gap-2">
                                <FileText size={16} className="text-slate-400" />
                                <span className="text-sm font-bold text-slate-700">{filterType}</span>
                            </div>
                            <ChevronDown size={16} className={`text-slate-400 transition-transform ${showTypeDropdown ? 'rotate-180' : ''}`} />
                        </button>

                        <AnimatePresence>
                            {showTypeDropdown && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 10, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    className="absolute top-full left-0 mt-2 z-[110] bg-white border border-slate-200 rounded-2xl shadow-2xl p-2 w-full min-w-[180px]"
                                >
                                    {['All', ...leaveTypes.map(lt => lt.name)].map((type) => (
                                        <button
                                            key={type}
                                            onClick={() => {
                                                setFilterType(type);
                                                setShowTypeDropdown(false);
                                            }}
                                            className={`w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${filterType === type ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-50'
                                                }`}
                                        >
                                            {type}
                                            {filterType === type && <Check size={14} />}
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className="relative" ref={durationDropdownRef}>
                        <button
                            onClick={() => setShowDurationDropdown(!showDurationDropdown)}
                            className="flex items-center gap-3 bg-white border border-slate-200 px-5 py-3 rounded-2xl shadow-sm hover:bg-slate-50 transition-all min-w-[150px] justify-between"
                        >
                            <div className="flex items-center gap-2">
                                <Clock size={16} className="text-slate-400" />
                                <span className="text-sm font-bold text-slate-700">{filterDuration}</span>
                            </div>
                            <ChevronDown size={16} className={`text-slate-400 transition-transform ${showDurationDropdown ? 'rotate-180' : ''}`} />
                        </button>

                        <AnimatePresence>
                            {showDurationDropdown && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 10, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    className="absolute top-full left-0 mt-2 z-[110] bg-white border border-slate-200 rounded-2xl shadow-2xl p-2 w-full min-w-[180px]"
                                >
                                    {['All', 'Full Day', 'Half Day', 'Multiple Days'].map((dur) => (
                                        <button
                                            key={dur}
                                            onClick={() => { setFilterDuration(dur); setShowDurationDropdown(false); }}
                                            className={`w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${filterDuration === dur ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-50'
                                                }`}
                                        >
                                            {dur}
                                            {filterDuration === dur && <Check size={14} />}
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                <div className="relative w-full sm:w-80">
                    <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search employee, approver or reason..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-white border border-slate-200 pl-12 pr-4 py-3.5 rounded-2xl outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50 transition-all w-full text-sm font-bold text-slate-800 placeholder:text-slate-400 shadow-sm"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6">
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm border-l-4 border-l-indigo-500">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-slate-500 text-xs font-bold tracking-tight ">Pending Approval</p>
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                            <Clock size={16} />
                        </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-3xl font-bold text-slate-900 tracking-tight">{stats.pending}</h3>
                        <span className="text-indigo-400 text-[10px] font-bold tracking-widest">Waiting</span>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm border-l-4 border-l-emerald-500">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-slate-500 text-xs font-bold tracking-tight ">Approved</p>
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <Check size={16} />
                        </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-3xl font-bold text-slate-900 tracking-tight">{stats.approved}</h3>
                        <span className="text-emerald-500 text-[10px] font-bold  tracking-widest">Done</span>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm border-l-4 border-l-rose-500">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-slate-500 text-xs font-bold tracking-tight ">Rejected</p>
                        <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                            <X size={16} />
                        </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-3xl font-bold text-slate-900 tracking-tight">{stats.rejected}</h3>
                        <span className="text-rose-500 text-[10px] font-bold  tracking-widest">Rejected</span>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm border-l-4 border-l-slate-400">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-slate-500 text-xs font-bold tracking-tight ">Cancelled</p>
                        <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center">
                            <Filter size={16} />
                        </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-3xl font-bold text-slate-900 tracking-tight">{stats.cancelled}</h3>
                        <span className="text-slate-400 text-[10px] font-bold  tracking-widest">Cancelled</span>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm border-l-4 border-l-amber-400">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-slate-500 text-xs font-bold tracking-tight ">Half Days</p>
                        <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                            <Clock size={16} />
                        </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-3xl font-bold text-slate-900 tracking-tight">{stats.halfDays}</h3>
                        <span className="text-amber-500 text-[10px] font-bold  tracking-widest">Half</span>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm border-l-4 border-l-indigo-400">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-slate-500 text-xs font-bold tracking-tight ">Full Days</p>
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                            <Check size={16} />
                        </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-3xl font-bold text-slate-900 tracking-tight">{stats.fullDays}</h3>
                        <span className="text-indigo-500 text-[10px] font-bold  tracking-widest">Full</span>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-800 tracking-widest flex items-center gap-3">
                        <FileText size={18} className="text-indigo-600" />
                        {filterStatus === 'All' ? 'LEAVE REQUESTS & REPORT' : `${filterStatus.toUpperCase()} REQUESTS`}
                    </h3>
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                        <span className="text-[10px] font-extrabold text-slate-400 tracking-[0.2em] ">Live Overview</span>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-slate-200">
                        <thead>
                            <tr className="bg-slate-50/50">
                                <th className="px-6 py-5 text-center text-[11px] font-bold text-slate-800 tracking-[0.12em] border border-slate-200">Employee</th>
                                <th className="px-4 py-5 text-center text-[11px] font-bold text-slate-800 tracking-[0.12em] border border-slate-200">Applied On</th>
                                <th className="px-4 py-5 text-center text-[11px] font-bold text-slate-800 tracking-[0.12em] border border-slate-200">Type</th>
                                <th className="px-5 py-5 text-center text-[11px] font-bold text-slate-800 tracking-[0.12em] border border-slate-200">Duration</th>
                                <th className="px-5 py-5 text-center text-[11px] font-bold text-slate-800 tracking-[0.12em] border border-slate-200">Leave Reason</th>
                                <th className="px-5 py-5 text-center text-[11px] font-bold text-slate-800 tracking-[0.12em] border border-slate-200">Approval Name</th>
                                <th className="px-4 py-5 text-center text-[11px] font-bold text-slate-800 tracking-[0.12em] border border-slate-200">Status</th>
                                {canApproveLeave && (
                                    <th className="px-5 py-5 text-center text-[11px] font-bold text-slate-800 tracking-[0.12em] border border-slate-200">Actions</th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {currentData.length === 0 ? (
                                <tr>
                                    <td colSpan={totalColCount} className="px-8 py-12 text-center text-slate-400 font-bold text-sm">
                                        No leave requests found
                                    </td>
                                </tr>
                            ) : (
                                currentData.map((req) => {
                                    const approverName = getApproverName(req);
                                    const decisionReason = getDecisionReason(req);
                                    return (
                                        <tr key={req._id} className="hover:bg-slate-50/50 transition-colors group">
                                            <td className="px-6 py-5 border border-slate-200 text-center">
                                                <div className="flex items-center justify-center gap-3">
                                                    <img
                                                        src={getFullImageUrl(req.user?.profileImage) || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(req.user?.name || 'Staff')}
                                                        alt=""
                                                        className="w-10 h-10 rounded-2xl object-cover ring-2 ring-white shadow-md shrink-0"
                                                    />
                                                    <div className="text-left">
                                                        <p className="text-sm font-bold text-slate-800">{req.user?.name}</p>
                                                        <p className="text-[10px] font-bold text-slate-400 tracking-widest mt-0.5">{(typeof req.user?.designation === 'object' ? req.user?.designation?.name : req.user?.designation) || 'Staff Member'}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-5 text-center border border-slate-200">
                                                <span className="text-[10px] font-bold text-slate-500 whitespace-nowrap">
                                                    {formatAppliedDateTime(req)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-5 border border-slate-200 text-center">
                                                <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-bold tracking-widest">
                                                    {getLeaveCode(req.leaveType)}
                                                </span>
                                            </td>
                                            <td className="px-5 py-5 border border-slate-200 text-center">
                                                <div className="space-y-1 flex flex-col items-center justify-center text-center">
                                                    <p className="text-xs font-bold text-slate-800 whitespace-nowrap">
                                                        {formatDate(req.startDate)}
                                                        {(req.duration === 'Multiple Days' || (formatDate(req.startDate) !== formatDate(req.endDate) && req.duration !== 'Half Day')) && ` - ${formatDate(req.endDate)}`}
                                                    </p>
                                                    <div className="flex flex-col gap-1 items-center">
                                                        <p className="text-[10px] text-indigo-600 font-bold tracking-widest bg-indigo-50 px-2 py-0.5 rounded-md inline-block">
                                                            {getLeaveDaysText(req)} DAYS
                                                            {req.duration === 'Multiple Days' ? ' (MULTIPLE)' : ''}
                                                        </p>
                                                        {req.duration === 'Half Day' && req.startTime && req.endTime && (
                                                            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md">
                                                                {formatTime12h(req.startTime)} - {formatTime12h(req.endTime)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-5 border border-slate-200 text-center">
                                                <p className="text-xs text-slate-600 max-w-[200px] leading-relaxed mx-auto">
                                                    {req.reason}
                                                </p>
                                            </td>
                                            <td className="px-5 py-5 border border-slate-200 text-center">
                                                {approverName !== '—' ? (
                                                    <div className="flex flex-col items-center gap-0.5">
                                                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${req.status === 'Approved'
                                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                                            : req.status === 'Rejected'
                                                                ? 'bg-rose-50 text-rose-700 border border-rose-100'
                                                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                                                            }`}>
                                                            {approverName}
                                                        </span>
                                                        {req.status === 'Pending' && (
                                                            <span className="text-[9px] font-bold text-slate-400">Assigned Approver</span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs font-bold text-slate-300">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-5 border border-slate-200 text-center">
                                                <div className="flex flex-col items-center justify-center gap-1.5">
                                                    <span className={`px-3 py-1.5 rounded-xl text-[10px] font-bold tracking-widest ${req.status === 'Approved' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                                                        req.status === 'Pending' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                                                            req.status === 'Rejected' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                                                                'bg-slate-50 text-slate-500 border border-slate-100'
                                                        }`}>
                                                        {req.status}
                                                    </span>
                                                    {req.status === 'Rejected' && decisionReason && (
                                                        <p className="text-[11px] font-semibold text-rose-700 bg-rose-50/80 border border-rose-100 px-2.5 py-1 rounded-lg max-w-[200px] leading-snug">
                                                            {decisionReason}
                                                        </p>
                                                    )}
                                                </div>
                                            </td>
                                            {canApproveLeave && (
                                                <td className="px-5 py-5 border border-slate-200 text-center">
                                                    {req.status === 'Pending' ? (
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button
                                                                onClick={() => setActionModal({ open: true, item: req, status: 'Approved', reason: '' })}
                                                                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-all shadow-sm flex items-center gap-1"
                                                            >
                                                                <Check size={13} />
                                                                Approve
                                                            </button>
                                                            <button
                                                                onClick={() => setActionModal({ open: true, item: req, status: 'Rejected', reason: '' })}
                                                                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold transition-all shadow-sm flex items-center gap-1"
                                                            >
                                                                <X size={13} />
                                                                Reject
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <span className="text-[11px] font-bold text-slate-400">Actioned</span>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {totalPages > 1 && (
                    <div className="p-8 bg-slate-50/30 flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-500">
                            Showing <span className="text-slate-900">{currentData.length}</span> of <span className="text-slate-900">{filteredRequests.length}</span> requests
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className="p-2.5 bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 rounded-xl disabled:opacity-50 transition-all hover:shadow-md"
                            >
                                <ChevronLeft size={18} />
                            </button>
                            {[...Array(totalPages)].map((_, i) => (
                                <button
                                    key={i}
                                    onClick={() => setCurrentPage(i + 1)}
                                    className={`w-10 h-10 rounded-xl text-xs font-bold transition-all ${currentPage === i + 1
                                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                                        : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300'
                                        }`}
                                >
                                    {i + 1}
                                </button>
                            ))}
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                                className="p-2.5 bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 rounded-xl disabled:opacity-50 transition-all hover:shadow-md"
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Approve / Reject with Reason Modal */}
            <AnimatePresence>
                {actionModal.open && actionModal.item && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-[2rem] p-7 max-w-md w-full shadow-2xl border border-slate-100"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900 m-0">
                                        {actionModal.status === 'Approved' ? 'Approve Leave Request' : 'Reject Leave Request'}
                                    </h3>
                                    <p className="text-xs font-bold text-slate-500 mt-1">
                                        {actionModal.item.user?.name} • {actionModal.item.leaveType} ({getLeaveDaysText(actionModal.item)} day(s))
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setActionModal({ open: false, item: null, status: 'Approved', reason: '' })}
                                    className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-all"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 mb-4 space-y-1">
                                <p className="text-[11px] font-bold text-slate-500">
                                    Dates: <span className="text-slate-800">{formatDate(actionModal.item.startDate)}{(actionModal.item.duration === 'Multiple Days' || (formatDate(actionModal.item.startDate) !== formatDate(actionModal.item.endDate) && actionModal.item.duration !== 'Half Day')) ? ` - ${formatDate(actionModal.item.endDate)}` : ''}</span>
                                </p>
                                <p className="text-[11px] font-bold text-slate-500">
                                    Employee Reason: <span className="text-slate-700">{actionModal.item.reason || '—'}</span>
                                </p>
                            </div>

                            <form onSubmit={handleSubmitAction} className="space-y-4">
                                {actionModal.status === 'Rejected' && (
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-500 tracking-wider block mb-1.5">
                                            Reason for Rejection *
                                        </label>
                                        <textarea
                                            rows={3}
                                            required
                                            placeholder="Enter reason for rejecting this leave..."
                                            value={actionModal.reason}
                                            onChange={(e) => setActionModal(prev => ({ ...prev, reason: e.target.value }))}
                                            className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-rose-400 transition-all"
                                        />
                                    </div>
                                )}

                                <div className="flex gap-3 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => setActionModal({ open: false, item: null, status: 'Approved', reason: '' })}
                                        className="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-2xl text-xs font-bold hover:bg-slate-200 transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={submittingAction}
                                        className={`flex-[2] py-3.5 text-white rounded-2xl text-xs font-bold transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 ${actionModal.status === 'Approved'
                                            ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100'
                                            : 'bg-rose-600 hover:bg-rose-700 shadow-rose-100'
                                            }`}
                                    >
                                        {submittingAction ? <Loader2 size={16} className="animate-spin" /> : (actionModal.status === 'Approved' ? <Check size={16} /> : <X size={16} />)}
                                        <span>{actionModal.status === 'Approved' ? 'Confirm Approval' : 'Confirm Rejection'}</span>
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

        </div>
    );
};

export default Leaves;
