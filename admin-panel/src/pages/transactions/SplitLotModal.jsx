import { AlertCircle, Split, X } from 'lucide-react';
import { useState } from 'react';
import Button from '../../components/ui/Button';
import api from '../../api/axios';

const SplitLotModal = ({ isOpen, onClose, barcode, onSuccess }) => {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const targetBarcode = typeof barcode === 'object' ? barcode.barcode : barcode;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please enter a remark or reason for the split.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const res = await api.post('/barcodes/split-request', {
        barcode: targetBarcode,
        reason: reason.trim()
      });
      alert('Split request submitted to store successfully!');
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit split request.');
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
              <Split className="w-5 h-5 text-indigo-600" />
              Request Material Split
            </h3>
            <p className="text-[10px] text-slate-400 font-bold tracking-wider mt-0.5">Parent Barcode: {targetBarcode}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4 text-xs">
          <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
            <div>
              <span className="text-slate-400 font-bold text-[9px] block">Material</span>
              <span className="font-extrabold text-slate-800">{typeof barcode === 'object' ? barcode.materialName : 'Unit Material'}</span>
            </div>
            <div>
              <span className="text-slate-400 font-bold text-[9px] block">Current Owner</span>
              <span className="font-extrabold text-slate-800">{typeof barcode === 'object' ? (barcode.owner?.fullName || 'Active Owner') : 'Active Owner'}</span>
            </div>
          </div>

          <div>
            <label className="block text-slate-600 font-bold mb-1">Remark / Reason for Split *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              placeholder="Provide reason for split request..."
              rows="3"
              className="w-full text-xs bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 px-3 py-2.5 font-semibold"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-rose-600 font-bold text-xs bg-rose-50 p-3 rounded-xl border border-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
            <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={submitting}>
              {submitting ? 'Sending...' : 'Send Request'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SplitLotModal;
