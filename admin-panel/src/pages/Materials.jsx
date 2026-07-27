import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ChevronLeft, ChevronRight,
  Edit2,
  Image as ImageIcon,
  Layers,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
  X
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';

const Materials = () => {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [deleteConfirm, setDeleteConfirm] = useState({ show: false, id: null });
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    category: 'raw_material',
    uom: 'Units',
    safetyStock: 0,
    imageUrl: '',
    isActive: true,
  });

  const [imagePreview, setImagePreview] = useState('');

  useEffect(() => {
    fetchMaterials();
  }, []);

  const fetchMaterials = async () => {
    try {
      setLoading(true);
      const res = await api.get('/materials');
      setMaterials(res.data.data || []);
    } catch (err) {
      toast.error('Failed to load materials');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (material = null) => {
    if (material) {
      setEditingMaterial(material);
      setFormData({
        name: material.name || '',
        code: material.code || '',
        category: material.category || 'raw_material',
        uom: material.uom || 'Units',
        safetyStock: material.safetyStock || 0,
        imageUrl: material.imageUrl || '',
        isActive: material.isActive !== undefined ? material.isActive : true,
      });
      setImagePreview(material.imageUrl || '');
    } else {
      setEditingMaterial(null);
      setFormData({
        name: '',
        code: '',
        category: 'raw_material',
        uom: 'Units',
        safetyStock: 0,
        imageUrl: '',
        isActive: true,
      });
      setImagePreview('');
    }
    setShowModal(true);
  };

  const handleImageFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData((prev) => ({ ...prev, imageUrl: reader.result }));
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Material name is required');
      return;
    }

    try {
      setSaving(true);
      if (editingMaterial) {
        await api.put(`/materials/${editingMaterial._id}`, formData);
        toast.success('Material updated successfully');
      } else {
        await api.post('/materials', formData);
        toast.success('Material created successfully');
      }
      setShowModal(false);
      fetchMaterials();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save material');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm.id) return;
    try {
      await api.delete(`/materials/${deleteConfirm.id}`);
      toast.success('Material deleted successfully');
      setDeleteConfirm({ show: false, id: null });
      fetchMaterials();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete material');
    }
  };

  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      const query = searchQuery.toLowerCase();
      return (
        (m.name && m.name.toLowerCase().includes(query)) ||
        (m.code && m.code.toLowerCase().includes(query)) ||
        (m.category && m.category.toLowerCase().includes(query))
      );
    });
  }, [materials, searchQuery]);

  const totalPages = Math.ceil(filteredMaterials.length / itemsPerPage) || 1;
  const paginatedMaterials = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredMaterials.slice(start, start + itemsPerPage);
  }, [filteredMaterials, currentPage]);

  const getCategoryBadgeClass = (cat) => {
    switch (cat) {
      case 'raw_material':
        return 'bg-amber-50 text-amber-700';
      case 'wip':
        return 'bg-blue-50 text-blue-700';
      case 'finished_goods':
        return 'bg-emerald-50 text-emerald-700';
      case 'consumable':
        return 'bg-purple-50 text-purple-700';
      default:
        return 'bg-slate-50 text-slate-700';
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Layers size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Materials Master</h1>
            <p className="text-xs text-slate-500 font-medium">Manage raw materials, WIP, finished goods, barcode prefixes, and safety stock</p>
          </div>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-all shadow-sm"
        >
          <Plus size={16} />
          Add Material
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by material name, code, category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex items-center justify-center gap-2">
            <Loader2 size={20} className="animate-spin text-indigo-600" />
            <span className="text-xs font-semibold">Loading materials inventory...</span>
          </div>
        ) : paginatedMaterials.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs font-semibold">
            No materials registered in inventory catalog.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="py-3.5 px-4">Image</th>
                  <th className="py-3.5 px-4">Barcode Code</th>
                  <th className="py-3.5 px-4">Material Name</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">UOM</th>
                  <th className="py-3.5 px-4">Safety Stock</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {paginatedMaterials.map((mat) => (
                  <tr key={mat._id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="w-10 h-10 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center overflow-hidden">
                        {mat.imageUrl ? (
                          <img src={mat.imageUrl} alt={mat.name} className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon size={18} className="text-slate-400" />
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-indigo-600 font-bold">{mat.code}</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">{mat.name}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getCategoryBadgeClass(mat.category)}`}>
                        {mat.category ? mat.category.replace('_', ' ') : 'raw material'}
                      </span>
                    </td>
                    <td className="py-3 px-4">{mat.uom || 'Units'}</td>
                    <td className="py-3 px-4 font-semibold text-slate-800">{mat.safetyStock || 0}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${mat.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                        {mat.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-1">
                      <button
                        onClick={() => handleOpenModal(mat)}
                        className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm({ show: true, id: mat._id })}
                        className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Showing Page {currentPage} of {totalPages}</span>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden"
            >
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="font-bold text-slate-800 text-sm">{editingMaterial ? 'Edit Material' : 'Add New Material'}</h3>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Material Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Material Code</label>
                    <input
                      type="text"
                      placeholder="Auto-generated if empty"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono uppercase"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Classification Category</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium"
                    >
                      <option value="raw_material">Raw Material</option>
                      <option value="wip">Work-in-Progress (WIP)</option>
                      <option value="finished_goods">Finished Goods</option>
                      <option value="consumable">Consumable</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Unit of Measure (UOM)</label>
                    <input
                      type="text"
                      placeholder="e.g. Kg, Meters, Boxes, Units"
                      value={formData.uom}
                      onChange={(e) => setFormData({ ...formData, uom: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Safety Stock Threshold</label>
                  <input
                    type="number"
                    value={formData.safetyStock}
                    onChange={(e) => setFormData({ ...formData, safetyStock: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                {/* Material Image Upload & URL Inputs */}
                <div className="space-y-2 border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                  <label className="block font-semibold text-slate-700">Material Image Thumbnail</label>
                  <div className="flex items-center gap-4">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageFileChange}
                      className="text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-600"
                    />
                    {imagePreview && (
                      <div className="w-12 h-12 rounded-lg border border-slate-200 overflow-hidden bg-white shrink-0">
                        <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                      </div>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Or enter Image Direct URL (https://...)"
                    value={formData.imageUrl}
                    onChange={(e) => {
                      setFormData({ ...formData, imageUrl: e.target.value });
                      setImagePreview(e.target.value);
                    }}
                    className="w-full bg-white border border-slate-200 rounded-xl p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="matActive"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <label htmlFor="matActive" className="font-semibold text-slate-700 select-none">Active Material</label>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 border border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-xl"
                  >
                    {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                    Save Material
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm.show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 text-center">
              <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 mx-auto flex items-center justify-center">
                <AlertTriangle size={24} />
              </div>
              <h3 className="font-bold text-slate-800 text-base">Delete Material</h3>
              <p className="text-xs text-slate-500">Are you sure you want to delete this material from inventory catalog?</p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => setDeleteConfirm({ show: false, id: null })}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Materials;
