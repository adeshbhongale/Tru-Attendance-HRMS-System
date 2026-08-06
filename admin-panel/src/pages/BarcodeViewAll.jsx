import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  MapPin,
  MessageSquare,
  Paperclip,
  User
} from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Button from '../components/ui/Button';
import api from '../api/axios';

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

export default function BarcodeViewAll() {
  const { barcode } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') || 'photos';
  const activeTab = ['photos', 'remarks', 'attachments'].includes(requestedTab) ? requestedTab : 'photos';

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
      timelineHistory.push({
        action: 'Barcode Exchange Completed',
        user: ex.approvedBy || { fullName: 'Store Admin' },
        timestamp: ex.approvedAt || ex.updatedAt,
        remarks: `Exchanged old ${ex.oldBarcode} for new ${ex.newBarcode || 'Replacement'} under warranty.`
      });
    }
  });

  timelineHistory.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

  const remarksList = timelineHistory.filter(log => log.remarks && log.remarks.trim());

  // Aggregate all photos
  const allPhotos = [];
  const seenPhotoUrls = new Set();
  const addPhoto = (url, lat, lng, address, date, source) => {
    if (!url || typeof url !== 'string' || seenPhotoUrls.has(url)) return;
    seenPhotoUrls.add(url);
    allPhotos.push({
      url,
      lat: parseFloat(lat) || (bc?.gps?.lat ? parseFloat(bc.gps.lat) : NaN),
      lng: parseFloat(lng) || (bc?.gps?.lng ? parseFloat(bc.gps.lng) : NaN),
      address: address || bc?.gps?.address || '',
      date: date || bc?.createdAt || new Date().toISOString(),
      source
    });
  };

  if (bc?.photos) {
    bc.photos.forEach(p => {
      const url = typeof p === 'string' ? p : p.url;
      addPhoto(url, p.lat, p.lng, p.address, p.capturedAt || p.uploadedAt, 'Barcode Asset');
    });
  }

  // Aggregate attachments
  const allAttachments = [];
  const seenDocUrls = new Set();
  const addAttachment = (name, url, type, size, date, source) => {
    if (!url || typeof url !== 'string' || seenDocUrls.has(url)) return;
    seenDocUrls.add(url);
    allAttachments.push({
      name: name || 'Unnamed Document',
      url,
      type: type || 'document',
      size: size || 0,
      date: date || bc?.createdAt || new Date().toISOString(),
      source
    });
  };

  if (bc?.documents) {
    bc.documents.forEach(doc => {
      addAttachment(doc.name, doc.url, doc.type, doc.size, doc.uploadedAt, 'Barcode Asset');
    });
  }

  const handleTabChange = (tabName) => {
    setSearchParams({ tab: tabName });
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-16 relative">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold mb-1">
            <span>Barcodes</span>
            <ChevronRight className="w-3 h-3" />
            <span
              onClick={() => navigate(`/barcodes/${barcode}`)}
              className="text-indigo-600 hover:underline cursor-pointer font-bold font-mono"
            >
              {barcode}
            </span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-slate-400 font-medium">View All Asset Data</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/barcodes/${barcode}`)} className="p-1 -ml-1">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 leading-none m-0 font-mono">
              Barcode Assets: {barcode}
            </h1>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] bg-white border border-slate-200 rounded-3xl p-8 shadow-xs">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-600 mb-3" />
          <p className="text-xs font-semibold text-slate-500 tracking-wider">
            Fetching asset list...
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
        <div className="w-full space-y-6">
          {/* Tabs */}
          <div className="flex border-b border-slate-200 gap-1.5 p-1 bg-slate-50 rounded-2xl w-fit">
            <button
              onClick={() => handleTabChange('photos')}
              className={`flex items-center gap-2 px-4.5 py-2.5 rounded-xl text-xs font-bold transition ${
                activeTab === 'photos'
                  ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/50'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              Photos ({allPhotos.length})
            </button>
            <button
              onClick={() => handleTabChange('remarks')}
              className={`flex items-center gap-2 px-4.5 py-2.5 rounded-xl text-xs font-bold transition ${
                activeTab === 'remarks'
                  ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/50'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              Remarks ({remarksList.length})
            </button>
            <button
              onClick={() => handleTabChange('attachments')}
              className={`flex items-center gap-2 px-4.5 py-2.5 rounded-xl text-xs font-bold transition ${
                activeTab === 'attachments'
                  ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/50'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Paperclip className="w-4 h-4" />
              Attachments ({allAttachments.length})
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs min-h-[300px]">
            {activeTab === 'photos' && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">
                  Uploaded Photos
                </h3>
                {allPhotos.length === 0 ? (
                  <p className="text-xs text-slate-400 py-10 text-center">No photos uploaded for this barcode.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {allPhotos.map((p, idx) => (
                      <div key={idx} className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <div className="w-24 h-24 bg-slate-100 rounded-xl overflow-hidden shrink-0">
                          <img src={p.url} alt={`Scan ${idx + 1}`} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex flex-col gap-1 text-xs">
                          <span className="font-bold text-slate-800">{p.source}</span>
                          <span className="text-[10px] text-slate-400">{new Date(p.date).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'remarks' && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">
                  History Remarks
                </h3>
                {remarksList.length === 0 ? (
                  <p className="text-xs text-slate-400 py-10 text-center">No remarks recorded for this barcode.</p>
                ) : (
                  <div className="space-y-3">
                    {remarksList.map((log, idx) => (
                      <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs">
                        <p className="font-bold text-indigo-600">{log.action}</p>
                        <p className="text-slate-700 mt-1">"{log.remarks}"</p>
                        <p className="text-[10px] text-slate-400 mt-2">
                          By: {log.user?.fullName || log.user?.name || 'System'} • {new Date(log.timestamp).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'attachments' && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">
                  Attachments
                </h3>
                {allAttachments.length === 0 ? (
                  <p className="text-xs text-slate-400 py-10 text-center">No attachments uploaded for this barcode.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {allAttachments.map((doc, idx) => (
                      <div key={idx} className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs">
                        <FileText className="w-6 h-6 text-indigo-600 shrink-0" />
                        <div className="truncate">
                          <a href={doc.url} target="_blank" rel="noreferrer" className="font-bold text-indigo-600 hover:underline block truncate">
                            {doc.name}
                          </a>
                          <span className="text-[10px] text-slate-400 block">{doc.source}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
