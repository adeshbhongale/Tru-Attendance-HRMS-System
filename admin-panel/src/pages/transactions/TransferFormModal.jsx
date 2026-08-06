import { AlertCircle, Camera, Send, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import Button from '../../components/ui/Button';
import api from '../../api/axios';
import { fetchDynamicLocation } from '../../utils/location';

const TransferFormModal = ({ isOpen, onClose, barcode, onSuccess }) => {
  const [employees, setEmployees] = useState([]);
  const [targetUserId, setTargetUserId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [requiresMgmtApproval, setRequiresMgmtApproval] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [barcodeDetail, setBarcodeDetail] = useState(null);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [photoMeta, setPhotoMeta] = useState(null);
  const [capturing, setCapturing] = useState(false);

  const targetBarcode = typeof barcode === 'object' ? barcode.barcode : barcode;

  useEffect(() => {
    if (isOpen) {
      api.get('/employees?limit=1000&allDepartments=true').then(res => {
        setEmployees(res.data.employees || res.data.data || []);
      }).catch(err => console.error(err));

      if (targetBarcode) {
        api.get(`/barcodes/${targetBarcode}`).then(res => {
          setBarcodeDetail(res.data);
        }).catch(err => console.error(err));
      }
    }
  }, [isOpen, targetBarcode]);

  if (!isOpen) return null;

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setCapturing(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);

      const { data } = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setCapturedPhoto(data.url);

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const loc = await fetchDynamicLocation(lat, lng);
          setPhotoMeta({ lat: loc.lat, lng: loc.lng, address: loc.address });
        }, async () => {
          const lat = 18.5204;
          const lng = 73.8567;
          const loc = await fetchDynamicLocation(lat, lng);
          setPhotoMeta({ lat: loc.lat, lng: loc.lng, address: loc.address });
        });
      }
    } catch (err) {
      setError('Photo upload failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setCapturing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!targetUserId) {
      setError('Please select a target recipient employee.');
      return;
    }
    if (!remarks.trim()) {
      setError('Remarks / Reason is required.');
      return;
    }
    if (!capturedPhoto) {
      setError('Please capture/upload a photo before sending the transfer request.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const res = await api.post(`/barcodes/${targetBarcode}/transfer`, {
        targetUserId,
        remarks: remarks.trim() + (requiresMgmtApproval ? ' [Requires Mgmt Approval]' : ''),
        requiresMgmtApproval,
        gps: photoMeta ? { lat: photoMeta.lat, lng: photoMeta.lng, address: photoMeta.address } : { lat: 18.5204, lng: 73.8567, address: 'MIDC kolhapur, India' },
        photos: [{ url: capturedPhoto, capturedAt: new Date().toISOString() }]
      });
      alert(res.data.message || 'Transfer request submitted successfully.');
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.message || 'Transfer request failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const bc = barcodeDetail?.barcode;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 p-6 rounded-2xl w-full max-w-md shadow-xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Send className="w-5 h-5 text-indigo-600" />
              Transfer Material
            </h3>
            <p className="text-[10px] text-slate-400 font-bold tracking-wider mt-0.5">Barcode: {targetBarcode}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Fetched Material Info Card */}
        <div className="mt-4 bg-slate-50 border border-slate-200/80 p-3.5 rounded-xl text-xs space-y-2 font-semibold text-slate-600">
          <div>
            <span className="text-[10px] text-slate-400 font-extrabold block">Material Name</span>
            <span className="font-extrabold text-slate-900">{bc?.materialName || 'Fetching...'}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] text-slate-400 font-extrabold block">Current Status</span>
              <span className="font-extrabold text-slate-700">{bc?.status || 'Fetching...'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-extrabold block">Current Owner</span>
              <span className="font-extrabold text-slate-700">{bc?.owner?.fullName || 'Fetching...'}</span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4 text-xs font-semibold text-slate-700">
          <div>
            <label className="block text-slate-600 font-bold mb-1">Target Employee *</label>
            <select
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              required
              className="w-full text-xs bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 px-3 py-2.5 font-semibold"
            >
              <option value="">Select Target Employee</option>
              {employees.filter(emp => emp._id !== bc?.owner?._id && emp._id !== bc?.owner && emp.role !== 'super_admin').map(emp => (
                <option key={emp._id} value={emp._id}>{emp.fullName} ({emp.department?.name || 'No Dept'})</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2.5 bg-indigo-50/50 p-3.5 rounded-xl border border-indigo-100">
            <input
              type="checkbox"
              id="requiresMgmtApproval"
              checked={requiresMgmtApproval}
              onChange={(e) => setRequiresMgmtApproval(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
            />
            <label htmlFor="requiresMgmtApproval" className="text-slate-700 font-bold cursor-pointer select-none">
              Requires Management Approval
            </label>
          </div>

          <div>
            <label className="block text-slate-600 font-bold mb-1">Remarks / Reason *</label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              required
              placeholder="e.g., Transferring encoder for calibration testing."
              rows="3"
              className="w-full text-xs bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 px-3 py-2.5 font-semibold"
            />
          </div>

          {/* Photo Attachment */}
          <div>
            <label className="block text-slate-600 font-bold mb-1.5">Capture Physical Material Photo *</label>
            {capturedPhoto ? (
              <div className="relative border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                <img src={capturedPhoto} alt="Material capture" className="w-full h-36 object-cover" />
                <label className="absolute top-2 right-2 p-1.5 bg-slate-900/80 text-white rounded-lg hover:bg-slate-900 text-[10px] font-bold cursor-pointer">
                  Retake
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                </label>
              </div>
            ) : (
              <label className="w-full h-32 border-2 border-dashed border-slate-200 hover:border-indigo-500 rounded-xl flex flex-col items-center justify-center gap-2 hover:bg-slate-50 transition-colors cursor-pointer text-slate-500">
                {capturing ? (
                  <>
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
                    <span className="font-bold text-[10px] tracking-wider text-slate-600">Uploading Photo...</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-6 h-6 text-slate-400" />
                    <span className="font-bold text-[10px] tracking-wider text-slate-600">Upload/Capture Geo-Tagged Photo</span>
                  </>
                )}
                <input type="file" accept="image/*" onChange={handlePhotoUpload} disabled={capturing} className="hidden" />
              </label>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-rose-600 font-bold text-xs bg-rose-50 p-3 rounded-xl border border-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
            <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={submitting || capturing}>
              {submitting ? 'Submitting...' : 'Send Transfer Request'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TransferFormModal;
