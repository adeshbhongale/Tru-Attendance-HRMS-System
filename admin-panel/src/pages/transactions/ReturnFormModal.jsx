import { AlertCircle, Camera, Reply, X } from 'lucide-react';
import { useState } from 'react';
import Button from '../../components/ui/Button';
import api from '../../api/axios';
import { fetchDynamicLocation } from '../../utils/location';

const ReturnFormModal = ({ isOpen, onClose, barcode, onSuccess }) => {
  const [qty, setQty] = useState(1);
  const [remarks, setRemarks] = useState('');
  const [photo, setPhoto] = useState('');
  const [coords, setCoords] = useState({ lat: 18.5204, lng: 73.8567, address: 'MIDC kolhapur, India' });
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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

      setPhoto(data.url);

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const loc = await fetchDynamicLocation(lat, lng);
          setCoords({
            lat: loc.lat,
            lng: loc.lng,
            address: loc.address
          });
        }, async () => {
          const lat = 18.5204;
          const lng = 73.8567;
          const loc = await fetchDynamicLocation(lat, lng);
          setCoords({
            lat: loc.lat,
            lng: loc.lng,
            address: loc.address
          });
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
    if (!photo) {
      setError('Please capture a geo-tagged physical photo of the material.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const targetBarcode = typeof barcode === 'object' ? barcode.barcode : barcode;
      const res = await api.post(`/barcodes/${targetBarcode}/return`, {
        remarks,
        quantity: qty,
        gps: coords,
        photo
      });
      alert(res.data.message || 'Return request logged. Handover to Store for physical check.');
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.message || 'Return request failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 p-6 rounded-2xl w-full max-w-md shadow-xl animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Reply className="w-5 h-5 text-indigo-600" />
              Return to Store
            </h3>
            <p className="text-[10px] text-slate-400 font-bold tracking-wider mt-0.5">Barcode: {typeof barcode === 'object' ? barcode.barcode : barcode}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4 text-xs">
          <div>
            <label className="block text-slate-600 font-bold mb-1">Return Quantity</label>
            <input
              type="number"
              min="1"
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
              required
              className="w-full text-xs bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 px-3 py-2.5 font-semibold"
            />
          </div>

          <div>
            <label className="block text-slate-600 font-bold mb-1">Reason for Return *</label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              required
              placeholder="Provide reason (e.g. Project surplus, maintenance completed)..."
              rows="2.5"
              className="w-full text-xs bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 px-3 py-2.5 font-semibold"
            />
          </div>

          {/* Geo-tagged photo capture */}
          <div>
            <label className="block text-slate-600 font-bold mb-1.5">Capture Physical Material Photo *</label>
            {photo ? (
              <div className="relative border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                <img src={photo} alt="Material capture" className="w-full h-36 object-cover" />
                <div className="absolute bottom-0 left-0 right-0 bg-slate-900/80 text-[10px] text-white p-2 flex flex-col gap-0.5">
                  <span className="font-bold">GPS: {coords.lat}, {coords.lng}</span>
                  <span className="truncate">{coords.address}</span>
                </div>
                <label
                  className="absolute top-2 right-2 p-1.5 bg-slate-900/80 text-white rounded-lg hover:bg-slate-900 text-[10px] font-bold cursor-pointer"
                >
                  Retake
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
              </div>
            ) : (
              <label
                className="w-full h-32 border-2 border-dashed border-slate-200 hover:border-indigo-500 rounded-xl flex flex-col items-center justify-center gap-2 hover:bg-slate-50 transition-colors cursor-pointer text-slate-500"
              >
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
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  disabled={capturing}
                  className="hidden"
                />
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
              {submitting ? 'Submitting...' : 'Submit Return request'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ReturnFormModal;
