import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/axios';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';

const getCleanUserRemarks = (str) => {
  if (!str) return 'N/A';
  let clean = str;
  if (clean.startsWith("Remarks: ")) {
    clean = clean.replace("Remarks: ", "");
  }
  const attachmentIdx = clean.indexOf(" | Attachment:");
  if (attachmentIdx !== -1) {
    clean = clean.substring(0, attachmentIdx);
  }
  return clean.trim();
};

export default function BarcodeDetail() {
  const { barcode } = useParams();
  const navigate = useNavigate();
  const reduxUser = useSelector((state) => state.auth?.user);
  const userData = reduxUser || (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
  })();

  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async (format) => {
    setExportDropdownOpen(false);
    setExporting(true);
    try {
      const response = await api.get(`/barcodes/${barcode}/export/${format}`, {
        responseType: 'blob'
      });
      const fileExtension = format === 'excel' ? 'xlsx' : 'pdf';
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Barcode_${barcode}.${fileExtension}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Error exporting barcode:', err);
    } finally {
      setExporting(false);
    }
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['barcodeDetail', barcode],
    queryFn: async () => {
      const { data } = await api.get(`/barcodes/${barcode}`);
      return data;
    }
  });

  const bc = data?.barcode;
  const exchanges = data?.exchanges || [];

  const filteredHistory = bc?.history?.filter(log => {
    const actionLower = (log.action || '').toLowerCase();
    if (['exchanged', 'barcode exchanged', 'exchange requested'].includes(actionLower)) {
      return false;
    }
    return true;
  }) || [];

  const timelineHistory = [...filteredHistory];

  exchanges.forEach(ex => {
    if (ex.status === 'pending') {
      timelineHistory.push({
        action: 'Barcode Exchange Requested',
        user: ex.requester,
        timestamp: ex.createdAt,
        remarks: getCleanUserRemarks(ex.warrantyReason)
      });
    }
    if (ex.status === 'approved') {
      if (barcode === ex.oldBarcode) {
        timelineHistory.push({
          action: 'Barcode Exchange Completed (Old Barcode Closed)',
          user: ex.approvedBy || { fullName: 'Store Admin' },
          timestamp: ex.approvedAt || ex.updatedAt,
          remarks: `Old barcode ${ex.oldBarcode} exchanged for new barcode ${ex.newBarcode || 'Pending'} under warranty.`
        });
      } else if (barcode === ex.newBarcode) {
        timelineHistory.push({
          action: 'Barcode Exchange Completed (Replacement Active)',
          user: ex.approvedBy || { fullName: 'Store Admin' },
          timestamp: ex.approvedAt || ex.updatedAt,
          remarks: `New replacement barcode ${ex.newBarcode} activated for old barcode ${ex.oldBarcode} under warranty.`
        });
      }
    } else if (ex.status === 'rejected') {
      timelineHistory.push({
        action: 'Barcode Exchange Rejected',
        user: ex.approvedBy || { fullName: 'Store Admin' },
        timestamp: ex.updatedAt,
        remarks: `Exchange request for old barcode ${ex.oldBarcode} was rejected by store.`
      });
    }
  });

  timelineHistory.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-16 relative">
      {/* Page Title & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold mb-1">
            <span>Barcodes Audit</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-indigo-600 font-bold font-mono">{barcode}</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="p-1 -ml-1">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 leading-none m-0 font-mono">
              Barcode Serial: {barcode}
            </h1>
          </div>
        </div>

        {/* Super Admin Control Panel */}
        <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:items-center sm:gap-2 sm:w-auto">
          {bc && (
            <div className="relative w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-auto font-extrabold text-xs"
                onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
              >
                Export <ChevronDown className="w-3.5 h-3.5 ml-1 inline-block" />
              </Button>
              {exportDropdownOpen && (
                <div className="absolute right-0 mt-1.5 w-40 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1.5 text-xs text-left">
                  <button
                    onClick={() => handleExport('excel')}
                    disabled={exporting}
                    className="w-full text-left block px-4 py-2 text-slate-700 hover:bg-slate-50 font-bold"
                  >
                    Export to Excel
                  </button>
                  <button
                    onClick={() => handleExport('pdf')}
                    disabled={exporting}
                    className="w-full text-left block px-4 py-2 text-slate-700 hover:bg-slate-50 font-bold"
                  >
                    Export to PDF
                  </button>
                </div>
              )}
            </div>
          )}
          <Button size="sm" onClick={() => navigate(`/barcodes/${barcode}/view-all`)}>
            View All Assets
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] bg-white border border-slate-200 rounded-3xl p-8 shadow-xs">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-600 mb-3" />
          <p className="text-xs font-semibold text-slate-500 tracking-wider">
            Fetching barcode audit details...
          </p>
        </div>
      ) : error || !bc ? (
        <div className="p-5 bg-rose-50 border border-rose-200 rounded-3xl text-rose-600 text-xs font-bold flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-bold">Error loading barcode details</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Main Info Box */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <span className="text-[10px] text-slate-400 font-extrabold tracking-wider block mb-1">Material Name</span>
              <span className="font-extrabold text-slate-800 text-xs">{bc.materialName}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-extrabold tracking-wider block mb-1">Serial Number</span>
              <span className="font-extrabold text-slate-800 text-xs font-mono">{bc.barcode}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-extrabold tracking-wider block mb-1">Current Owner</span>
              <span className="font-extrabold text-slate-800 text-xs">{bc.owner?.fullName || 'Store Warehouse'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-extrabold tracking-wider block mb-1">Status</span>
              <Badge variant={bc.status === 'Active' ? 'success' : 'primary'}>{bc.status}</Badge>
            </div>
          </div>

          {/* Audit History Timeline */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Lifecycle Audit History</h3>
            <div className="space-y-4">
              {timelineHistory.map((item, idx) => (
                <div key={idx} className="flex gap-4 items-start border-b border-slate-100 pb-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-600 mt-1 shrink-0" />
                  <div className="flex-1 text-xs">
                    <p className="font-bold text-slate-800">{item.action}</p>
                    <p className="text-[10px] text-slate-400">
                      By: {item.user?.fullName || item.user?.name || item.user || 'System'} • {new Date(item.timestamp).toLocaleString()}
                    </p>
                    {item.remarks && <p className="text-slate-500 mt-1">"{item.remarks}"</p>}
                  </div>
                </div>
              ))}
              {timelineHistory.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-6">No historical logs recorded for this barcode.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
