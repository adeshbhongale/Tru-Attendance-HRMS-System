import {
  AnimatePresence,
  motion
} from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Hourglass,
  ListFilter,
  Loader2,
  Receipt,
  RefreshCw,
  Search,
  User,
  X,
  XCircle
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import CalendarPicker from '../components/CalendarPicker';

const StatCard = ({ title, amount, count, icon, iconBg, iconColor, loading }) => (
  <div className="bg-white border border-slate-200 p-4 md:p-5 rounded-2xl flex-1 hover:shadow-xl hover:shadow-slate-200 transition-all duration-300 group flex flex-col items-center justify-center text-center">
    <div
      className="w-12 h-12 rounded-2xl flex items-center justify-center border border-slate-100 shadow-xs group-hover:scale-110 transition-transform mb-3"
      style={{ backgroundColor: iconBg, color: iconColor }}
    >
      {React.cloneElement(icon, { size: 22, strokeWidth: 2.2 })}
    </div>
    <div className="space-y-1 w-full">
      <h3 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
        {loading ? (
          <Loader2 className="animate-spin text-indigo-500 mx-auto" size={22} />
        ) : (
          `₹ ${(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
        )}
      </h3>
      <div className="flex items-center justify-center gap-1.5 mt-0.5">
        <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
          {title}
        </span>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600">
          {count || 0}
        </span>
      </div>
    </div>
  </div>
);

const ExpenseDashboardPage = () => {
  // Helper date functions
  const formatDateYYYYMMDD = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getFirstDayOfMonth = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  };

  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return '';
    const parts = String(dateStr).split('T')[0].split('-');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return String(dateStr);
  };

  // Date States - only From and To dates
  const [startDate, setStartDate] = useState(formatDateYYYYMMDD(getFirstDayOfMonth()));
  const [endDate, setEndDate] = useState(formatDateYYYYMMDD(new Date()));

  // Calendar popovers
  const [showStartCalendar, setShowStartCalendar] = useState(false);
  const [showEndCalendar, setShowEndCalendar] = useState(false);
  const [showExportOptions, setShowExportOptions] = useState(false);

  const startCalendarRef = useRef(null);
  const endCalendarRef = useRef(null);
  const exportRef = useRef(null);

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Table Sorting
  const [sortField, setSortField] = useState('totalSubmitted');
  const [sortDirection, setSortDirection] = useState('desc'); // 'asc' | 'desc'

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Data States
  const [loading, setLoading] = useState(true);
  const [analyticsData, setAnalyticsData] = useState(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (startCalendarRef.current && !startCalendarRef.current.contains(event.target)) {
        setShowStartCalendar(false);
      }
      if (endCalendarRef.current && !endCalendarRef.current.contains(event.target)) {
        setShowEndCalendar(false);
      }
      if (exportRef.current && !exportRef.current.contains(event.target)) {
        setShowExportOptions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch Dashboard Analytics
  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/expense/dashboard-analytics?startDate=${startDate}&endDate=${endDate}`);
      if (res.data?.success) {
        setAnalyticsData(res.data.data);
      } else {
        toast.error('Could not load expense dashboard data');
      }
    } catch (err) {
      console.error('Failed to fetch expense dashboard analytics:', err);
      toast.error('Failed to load expense dashboard analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
    fetchDashboardData();
  }, [startDate, endDate]);

  // Extract Summary KPI
  const summary = analyticsData?.summary || {
    totalSubmitted: { amount: 0, count: 0 },
    waitingForApproval: { amount: 0, count: 0 },
    waitingForDisbursement: { amount: 0, count: 0 },
    rejected: { amount: 0, count: 0 },
    settled: { amount: 0, count: 0 },
  };

  // Employee-wise dataset with computed pending, paid, reject, excess amounts
  const rawList = useMemo(() => {
    return (analyticsData?.employeeWise || []).map(item => ({
      ...item,
      pendingAmount: Math.round(((item.waitingForApproval || 0) + (item.waitingForDisbursement || 0)) * 100) / 100,
      paidAmount: Math.round((item.settled || 0) * 100) / 100,
      rejectAmount: Math.round((item.rejected || 0) * 100) / 100,
      excessAmount: Math.round((item.excessAmount || 0) * 100) / 100,
    }));
  }, [analyticsData]);

  // Search Filtering
  const filteredList = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return rawList;

    return rawList.filter((item) => {
      const name = (item.employeeName || '').toLowerCase();
      const code = (item.employeeCode || '').toLowerCase();
      const dept = (item.department || '').toLowerCase();
      return name.includes(q) || code.includes(q) || dept.includes(q);
    });
  }, [rawList, searchQuery]);

  // Sorting
  const sortedList = useMemo(() => {
    const list = [...filteredList];
    list.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal || '').toLowerCase();
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }

      aVal = Number(aVal) || 0;
      bVal = Number(bVal) || 0;
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return list;
  }, [filteredList, sortField, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(sortedList.length / itemsPerPage) || 1;
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedList.slice(start, start + itemsPerPage);
  }, [sortedList, currentPage, itemsPerPage]);

  // Calculate Table Totals
  const tableTotals = useMemo(() => {
    return filteredList.reduce(
      (acc, item) => {
        acc.expensesSubmitted += item.expensesSubmitted || 0;
        acc.totalSubmitted += item.totalSubmitted || 0;
        acc.pendingAmount += item.pendingAmount || 0;
        acc.paidAmount += item.paidAmount || 0;
        acc.excessAmount += item.excessAmount || 0;
        acc.rejectAmount += item.rejectAmount || 0;
        return acc;
      },
      {
        expensesSubmitted: 0,
        totalSubmitted: 0,
        pendingAmount: 0,
        paidAmount: 0,
        excessAmount: 0,
        rejectAmount: 0,
      }
    );
  }, [filteredList]);

  // Handle Sort Toggle
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Render Sort Indicator
  const renderSortIndicator = (field) => {
    if (sortField !== field) {
      return <ArrowUpDown size={12} className="text-slate-300 group-hover:text-slate-500" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp size={12} className="text-indigo-600 font-bold" />
    ) : (
      <ArrowDown size={12} className="text-indigo-600 font-bold" />
    );
  };

  // Export CSV (Excel compatible)
  const handleExportCSV = () => {
    try {
      if (!filteredList.length) return toast.error('No data to export');

      const headers = [
        'Employee Name',
        'Department',
        'Expenses Submitted',
        'Total Submitted (Rs)',
        'Pending Amount (Rs)',
        'Paid Amount (Rs)',
        'Excess Amount (Rs)',
        'Reject Amount (Rs)'
      ];

      const rows = filteredList.map(item => [
        `"${(item.employeeName || '').replace(/"/g, '""')}"`,
        `"${(item.department || '').replace(/"/g, '""')}"`,
        item.expensesSubmitted || 0,
        item.totalSubmitted || 0,
        item.pendingAmount || 0,
        item.paidAmount || 0,
        item.excessAmount || 0,
        item.rejectAmount || 0
      ]);

      // Add Total Row
      rows.push([
        '"TOTAL"',
        '""',
        tableTotals.expensesSubmitted,
        tableTotals.totalSubmitted,
        tableTotals.pendingAmount,
        tableTotals.paidAmount,
        tableTotals.excessAmount,
        tableTotals.rejectAmount
      ]);

      // Include UTF-8 Byte Order Mark for Excel compatibility
      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Expense_Dashboard_${startDate}_to_${endDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Excel/CSV exported successfully');
    } catch (err) {
      console.error('CSV Export Error:', err);
      toast.error('Failed to export CSV');
    }
  };

  // Export PDF
  const handleExportPDF = () => {
    try {
      if (!filteredList.length) return toast.error('No data to export');

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      doc.setFontSize(15);
      doc.setTextColor(79, 70, 229);
      doc.text('Expense Dashboard Analysis - Employee Wise', 14, 16);
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Period: ${formatDateDisplay(startDate)} to ${formatDateDisplay(endDate)} | Generated: ${analyticsData?.generatedOn || new Date().toLocaleString()}`, 14, 22);

      const headers = [['Employee Name', 'Department', 'Claims', 'Total (Rs)', 'Pending (Rs)', 'Paid (Rs)', 'Excess (Rs)', 'Reject (Rs)']];

      const body = filteredList.map(item => [
        item.employeeName || '-',
        item.department || '-',
        item.expensesSubmitted || 0,
        (item.totalSubmitted || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }),
        (item.pendingAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }),
        (item.paidAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }),
        (item.excessAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }),
        (item.rejectAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }),
      ]);

      // Add Total Row
      body.push([
        `TOTAL (${filteredList.length})`,
        '-',
        tableTotals.expensesSubmitted,
        tableTotals.totalSubmitted.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
        tableTotals.pendingAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
        tableTotals.paidAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
        tableTotals.excessAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
        tableTotals.rejectAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
      ]);

      autoTable(doc, {
        head: headers,
        body: body,
        startY: 28,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
        columnStyles: {
          0: { halign: 'left', fontStyle: 'bold' },
          1: { halign: 'left' },
          2: { halign: 'center' },
          3: { halign: 'right', fontStyle: 'bold' },
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right' },
          7: { halign: 'right' },
        },
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' }
      });

      doc.save(`Expense_Dashboard_${startDate}_to_${endDate}.pdf`);
      toast.success('PDF exported successfully');
    } catch (err) {
      console.error('PDF Export Error:', err);
      toast.error('Failed to export PDF');
    }
  };

  return (
    <div className="space-y-6 animate-fade-up">
      {/* ── HEADER SECTION WITH DATE PICKERS & ACTIONS ── */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Receipt className="text-indigo-600" size={24} />
            Expenses Dashboard Analysis
          </h1>
          <p className="text-xs font-bold text-slate-400 mt-0.5">
            View company expense claims, approvals and settlements from{' '}
            <span className="text-indigo-600 font-extrabold">{formatDateDisplay(startDate)}</span> to{' '}
            <span className="text-indigo-600 font-extrabold">{formatDateDisplay(endDate)}</span>
          </p>
        </div>

        {/* Date Filter & Export Action Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* From Date Button */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">From:</span>
            <div className="relative" ref={startCalendarRef}>
              <button
                type="button"
                onClick={() => {
                  setShowStartCalendar(!showStartCalendar);
                  setShowEndCalendar(false);
                }}
                className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:border-indigo-500 transition-all cursor-pointer"
              >
                <Calendar size={14} className="text-indigo-600" />
                <span>{formatDateDisplay(startDate)}</span>
              </button>
              {showStartCalendar && (
                <div className="absolute right-0 mt-2 z-[100] shadow-2xl rounded-2xl overflow-hidden border border-slate-200 bg-white">
                  <CalendarPicker
                    selectedDate={startDate}
                    allowAll={true}
                    onSelect={(d) => {
                      setStartDate(d);
                      setShowStartCalendar(false);
                    }}
                    onSelectDate={(d) => {
                      setStartDate(d);
                      setShowStartCalendar(false);
                    }}
                    onClose={() => setShowStartCalendar(false)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* To Date Button */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">To:</span>
            <div className="relative" ref={endCalendarRef}>
              <button
                type="button"
                onClick={() => {
                  setShowEndCalendar(!showEndCalendar);
                  setShowStartCalendar(false);
                }}
                className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:border-indigo-500 transition-all cursor-pointer"
              >
                <Calendar size={14} className="text-indigo-600" />
                <span>{formatDateDisplay(endDate)}</span>
              </button>
              {showEndCalendar && (
                <div className="absolute right-0 mt-2 z-[100] shadow-2xl rounded-2xl overflow-hidden border border-slate-200 bg-white">
                  <CalendarPicker
                    selectedDate={endDate}
                    allowAll={true}
                    onSelect={(d) => {
                      setEndDate(d);
                      setShowEndCalendar(false);
                    }}
                    onSelectDate={(d) => {
                      setEndDate(d);
                      setShowEndCalendar(false);
                    }}
                    onClose={() => setShowEndCalendar(false)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Download Statistics Dropdown */}
          <div className="relative" ref={exportRef}>
            <button
              onClick={() => setShowExportOptions(!showExportOptions)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-xs shadow-md shadow-indigo-100 hover:bg-indigo-700 transition-all"
            >
              <Download size={14} />
              <span>Download Statistics</span>
              <ChevronDown size={14} className={`transition-transform ${showExportOptions ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showExportOptions && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-[120] overflow-hidden"
                >
                  <button
                    onClick={() => {
                      handleExportCSV();
                      setShowExportOptions(false);
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors flex items-center gap-2.5"
                  >
                    <FileSpreadsheet size={15} className="text-emerald-600" />
                    Export as CSV
                  </button>
                  <button
                    onClick={() => {
                      handleExportPDF();
                      setShowExportOptions(false);
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-rose-600 transition-colors flex items-center gap-2.5"
                  >
                    <FileText size={15} className="text-rose-600" />
                    Export as PDF
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => fetchDashboardData()}
            disabled={loading}
            className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
            title="Refresh Data"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin text-indigo-600' : ''} />
          </button>
        </div>
      </div>

      {/* ── 4 STATCARDS KPI METRICS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Submitted"
          amount={summary.totalSubmitted?.amount}
          count={summary.totalSubmitted?.count}
          icon={<ListFilter />}
          iconBg="#eff6ff"
          iconColor="#2563eb"
          loading={loading}
        />
        <StatCard
          title="Waiting for Approval"
          amount={summary.waitingForApproval?.amount}
          count={summary.waitingForApproval?.count}
          icon={<Hourglass />}
          iconBg="#fffbeb"
          iconColor="#d97706"
          loading={loading}
        />
        <StatCard
          title="Rejected"
          amount={summary.rejected?.amount}
          count={summary.rejected?.count}
          icon={<XCircle />}
          iconBg="#fef2f2"
          iconColor="#dc2626"
          loading={loading}
        />
        <StatCard
          title="Settled"
          amount={summary.settled?.amount}
          count={summary.settled?.count}
          icon={<CheckSquare />}
          iconBg="#faf5ff"
          iconColor="#7c3aed"
          loading={loading}
        />
      </div>

      {/* ── SEARCH & TABLE HEADER BAR ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <User size={18} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Employee Expense Breakdown
            </h2>
            <p className="text-xs font-bold text-slate-400">
              {filteredList.length} employee record(s) found
            </p>
          </div>
        </div>

        {/* Live Search Input */}
        <div className="relative w-full sm:w-80">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search employee by name, code, department..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-white border border-slate-200 rounded-2xl pl-10 pr-10 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* ── INTERACTIVE SORTABLE DATA TABLE ── */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <th
                  onClick={() => handleSort('employeeName')}
                  className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Employee</span>
                    {renderSortIndicator('employeeName')}
                  </div>
                </th>

                <th
                  onClick={() => handleSort('expensesSubmitted')}
                  className="px-4 py-4 text-center cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Expenses Submitted</span>
                    {renderSortIndicator('expensesSubmitted')}
                  </div>
                </th>

                <th
                  onClick={() => handleSort('totalSubmitted')}
                  className="px-4 py-4 text-right cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Total Submitted</span>
                    {renderSortIndicator('totalSubmitted')}
                  </div>
                </th>

                <th
                  onClick={() => handleSort('pendingAmount')}
                  className="px-4 py-4 text-right cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Pending Amount</span>
                    {renderSortIndicator('pendingAmount')}
                  </div>
                </th>

                <th
                  onClick={() => handleSort('paidAmount')}
                  className="px-4 py-4 text-right cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Paid Amount</span>
                    {renderSortIndicator('paidAmount')}
                  </div>
                </th>

                <th
                  onClick={() => handleSort('excessAmount')}
                  className="px-4 py-4 text-right cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Excess Amount</span>
                    {renderSortIndicator('excessAmount')}
                  </div>
                </th>

                <th
                  onClick={() => handleSort('rejectAmount')}
                  className="px-6 py-4 text-right cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Reject Amount</span>
                    {renderSortIndicator('rejectAmount')}
                  </div>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-400">
                    <Loader2 className="animate-spin mx-auto text-indigo-600 mb-2" size={28} />
                    <p className="text-xs font-bold">Loading dashboard analytics...</p>
                  </td>
                </tr>
              ) : paginatedList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-400">
                    <Receipt size={36} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-sm font-bold text-slate-700">No Expense Data Found</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      No expense records found for the selected date range or search query.
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedList.map((item, idx) => (
                  <tr key={item.id || item.employeeId || idx} className="hover:bg-slate-50/80 transition-colors">
                    {/* Name Column */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs">
                          {item.employeeName?.charAt(0)?.toUpperCase() || 'E'}
                        </div>
                        <div>
                          <div className="font-extrabold text-slate-900">{item.employeeName}</div>
                          {item.department && (
                            <div className="text-[11px] font-semibold text-slate-400 mt-0.5">
                              {item.department}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Expenses Submitted (Count) */}
                    <td className="px-4 py-4 text-center">
                      <span className="inline-block px-2.5 py-1 rounded-xl bg-slate-100 font-extrabold text-slate-800 text-[11px]">
                        {item.expensesSubmitted || 0}
                      </span>
                    </td>

                    {/* Total Submitted */}
                    <td className="px-4 py-4 text-right font-bold text-slate-900">
                      ₹ {(item.totalSubmitted || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>

                    {/* Pending Amount */}
                    <td className="px-4 py-4 text-right font-bold text-amber-600">
                      ₹ {(item.pendingAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>

                    {/* Paid Amount */}
                    <td className="px-4 py-4 text-right font-bold text-purple-700">
                      ₹ {(item.paidAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>

                    {/* Excess Amount */}
                    <td className="px-4 py-4 text-right font-bold text-orange-600">
                      ₹ {(item.excessAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>

                    {/* Reject Amount */}
                    <td className="px-6 py-4 text-right font-bold text-rose-600">
                      ₹ {(item.rejectAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>

            {/* ── STICKY BOTTOM TOTAL ROW ── */}
            {filteredList.length > 0 && !loading && (
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-200 text-xs font-bold text-slate-900">
                  <td className="px-6 py-4 font-bold uppercase tracking-wider text-slate-900">
                    TOTAL ({filteredList.length} Employees)
                  </td>

                  <td className="px-4 py-4 text-center">
                    <span className="inline-block px-2.5 py-1 rounded-xl bg-slate-900 text-white font-extrabold text-[11px]">
                      {tableTotals.expensesSubmitted}
                    </span>
                  </td>

                  <td className="px-4 py-4 text-right font-bold text-slate-900">
                    ₹ {tableTotals.totalSubmitted.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </td>

                  <td className="px-4 py-4 text-right font-bold text-amber-700">
                    ₹ {tableTotals.pendingAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </td>

                  <td className="px-4 py-4 text-right font-bold text-purple-800">
                    ₹ {tableTotals.paidAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </td>

                  <td className="px-4 py-4 text-right font-bold text-orange-700">
                    ₹ {tableTotals.excessAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </td>

                  <td className="px-6 py-4 text-right font-bold text-rose-700">
                    ₹ {tableTotals.rejectAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* ── PAGINATION CONTROLS ── */}
        {sortedList.length > 0 && (
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs font-bold text-slate-500">
              Showing{' '}
              <span className="font-extrabold text-slate-900">
                {(currentPage - 1) * itemsPerPage + 1}
              </span>{' '}
              to{' '}
              <span className="font-extrabold text-slate-900">
                {Math.min(currentPage * itemsPerPage, sortedList.length)}
              </span>{' '}
              of <span className="font-extrabold text-slate-900">{sortedList.length}</span> entries
            </div>

            <div className="flex items-center gap-3">
              {/* Rows per page selector */}
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                <span>Rows:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-700 focus:outline-none"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              {/* Prev / Next Page Buttons */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft size={16} />
                </button>

                <span className="px-3 py-1 text-xs font-extrabold text-slate-800">
                  {currentPage} / {totalPages}
                </span>

                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExpenseDashboardPage;
