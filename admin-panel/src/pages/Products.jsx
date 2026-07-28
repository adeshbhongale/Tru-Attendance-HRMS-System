import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Hash,
  Image as ImageIcon,
  Layers,
  Loader2,
  Package,
  Plus,
  Save,
  Search,
  Trash2,
  X
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';

const Products = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [deleteConfirm, setDeleteConfirm] = useState({ show: false, id: null });
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedProduct, setExpandedProduct] = useState(null);
  const [previewImageModal, setPreviewImageModal] = useState({ show: false, url: '', title: '' });

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    imageUrl: '',
    models: [
      {
        modelName: '',
        description: '',
        installationDate: '',
        serialNumbers: ['']
      }
    ]
  });

  const [imagePreview, setImagePreview] = useState('');

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const res = await api.get('/products');
      setProducts(res.data.data || []);
    } catch (err) {
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (product = null) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name || '',
        description: product.description || '',
        imageUrl: product.imageUrl || '',
        models: product.models?.length
          ? product.models.map(m => ({
            modelName: m.modelName || '',
            description: m.description || '',
            installationDate: m.installationDate ? m.installationDate.split('T')[0] : '',
            serialNumbers: m.serialNumbers?.length ? m.serialNumbers : ['']
          }))
          : [{ modelName: '', description: '', installationDate: '', serialNumbers: [''] }]
      });
      setImagePreview(product.imageUrl || '');
    } else {
      setEditingProduct(null);
      setFormData({
        name: '',
        description: '',
        imageUrl: '',
        models: [
          {
            modelName: '',
            description: '',
            installationDate: '',
            serialNumbers: ['']
          }
        ]
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

  // Model Handlers
  const addModel = () => {
    setFormData(prev => ({
      ...prev,
      models: [
        ...prev.models,
        { modelName: '', description: '', installationDate: '', serialNumbers: [''] }
      ]
    }));
  };

  const removeModel = (index) => {
    setFormData(prev => ({
      ...prev,
      models: prev.models.filter((_, idx) => idx !== index)
    }));
  };

  const updateModelField = (modelIndex, field, value) => {
    setFormData(prev => {
      const updated = [...prev.models];
      updated[modelIndex] = { ...updated[modelIndex], [field]: value };
      return { ...prev, models: updated };
    });
  };

  // Serial Numbers Handlers per model
  const addSerialNumber = (modelIndex) => {
    setFormData(prev => {
      const updated = [...prev.models];
      updated[modelIndex].serialNumbers = [...updated[modelIndex].serialNumbers, ''];
      return { ...prev, models: updated };
    });
  };

  const removeSerialNumber = (modelIndex, serialIndex) => {
    setFormData(prev => {
      const updated = [...prev.models];
      updated[modelIndex].serialNumbers = updated[modelIndex].serialNumbers.filter((_, idx) => idx !== serialIndex);
      return { ...prev, models: updated };
    });
  };

  const updateSerialNumber = (modelIndex, serialIndex, value) => {
    setFormData(prev => {
      const updated = [...prev.models];
      const sns = [...updated[modelIndex].serialNumbers];
      sns[serialIndex] = value;
      updated[modelIndex].serialNumbers = sns;
      return { ...prev, models: updated };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Product name is required');
      return;
    }

    // Clean up empty serial numbers
    const payload = {
      ...formData,
      models: formData.models.map(m => ({
        ...m,
        serialNumbers: (m.serialNumbers || []).map(s => s.trim()).filter(Boolean)
      }))
    };

    try {
      setSaving(true);
      if (editingProduct) {
        await api.put(`/products/${editingProduct._id}`, payload);
        toast.success('Product updated successfully');
      } else {
        await api.post('/products', payload);
        toast.success('Product created successfully');
      }
      setShowModal(false);
      fetchProducts();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm.id) return;
    try {
      await api.delete(`/products/${deleteConfirm.id}`);
      toast.success('Product deleted successfully');
      setDeleteConfirm({ show: false, id: null });
      fetchProducts();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete product');
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const query = searchQuery.toLowerCase();
      if (!query) return true;
      const matchName = (p.name && p.name.toLowerCase().includes(query));
      const matchDesc = (p.description && p.description.toLowerCase().includes(query));
      let matchModel = false;
      (p.models || []).forEach(m => {
        if ((m.modelName || '').toLowerCase().includes(query)) matchModel = true;
        if ((m.description || '').toLowerCase().includes(query)) matchModel = true;
        (m.serialNumbers || []).forEach(s => {
          if ((s || '').toLowerCase().includes(query)) matchModel = true;
        });
      });
      return matchName || matchDesc || matchModel;
    });
  }, [products, searchQuery]);

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage) || 1;
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(start, start + itemsPerPage);
  }, [filteredProducts, currentPage]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Package size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Products Master</h1>
            <p className="text-xs text-slate-500">Manage products catalog — product name, description, image, with separate models & multiple serial numbers</p>
          </div>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-all shadow-sm"
        >
          <Plus size={16} />
          Add Product
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by product name, description, model name, serial number..."
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
            <span className="text-xs font-semibold">Loading products catalog...</span>
          </div>
        ) : paginatedProducts.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs font-semibold">
            No products registered in master catalog.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                <tr>
                  <th className="py-3.5 px-4 w-10"></th>
                  <th className="py-3.5 px-4">Image</th>
                  <th className="py-3.5 px-4">Product Name</th>
                  <th className="py-3.5 px-4">Description</th>
                  <th className="py-3.5 px-4">Models & Serial Numbers</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {paginatedProducts.map((prod) => {
                  const isExpanded = expandedProduct === prod._id;
                  const totalModels = prod.models?.length || 0;
                  const totalSerials = (prod.models || []).reduce((acc, m) => acc + (m.serialNumbers?.length || 0), 0);

                  return (
                    <>
                      <tr key={prod._id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-4">
                          <button
                            onClick={() => setExpandedProduct(isExpanded ? null : prod._id)}
                            className="p-1 text-slate-400 hover:text-indigo-600 rounded-md"
                          >
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        </td>
                        <td className="py-3 px-4">
                          <div
                            onClick={() => prod.imageUrl && setPreviewImageModal({ show: true, url: prod.imageUrl, title: prod.name })}
                            className={`w-10 h-10 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center overflow-hidden ${prod.imageUrl ? 'cursor-pointer hover:ring-2 hover:ring-indigo-500/50 hover:scale-105 transition-all' : ''}`}
                            title={prod.imageUrl ? "Click to preview image" : "No image"}
                          >
                            {prod.imageUrl ? (
                              <img src={prod.imageUrl} alt={prod.name} className="w-full h-full object-cover" />
                            ) : (
                              <ImageIcon size={18} className="text-slate-400" />
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-extrabold text-slate-900">{prod.name}</td>
                        <td className="py-3 px-4 max-w-[220px] truncate text-slate-500">{prod.description || '—'}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-[10px] font-bold border border-indigo-100">
                              {totalModels} Model{totalModels !== 1 ? 's' : ''}
                            </span>
                            <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-[10px] font-bold">
                              {totalSerials} Serial No{totalSerials !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right space-x-1">
                          <button
                            onClick={() => handleOpenModal(prod)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm({ show: true, id: prod._id })}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>

                      {/* Expandable Models Sub-Table */}
                      {isExpanded && (
                        <tr className="bg-slate-50/70 border-b border-slate-200">
                          <td colSpan={6} className="p-4 pl-12">
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                              <h4 className="text-xs font-bold text-slate-800 tracking-wider flex items-center gap-2">
                                <Layers size={14} className="text-indigo-600" />
                                Models Catalog for {prod.name}
                              </h4>

                              {(!prod.models || prod.models.length === 0) ? (
                                <p className="text-xs text-slate-400">No models registered under this product.</p>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {prod.models.map((m, mIdx) => (
                                    <div key={mIdx} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                                      <div className="flex items-center justify-between border-b pb-2 border-slate-200">
                                        <span className="font-extrabold text-indigo-700 text-xs flex items-center gap-1.5">
                                          <Package size={13} /> {m.modelName || `Model ${mIdx + 1}`}
                                        </span>
                                        {m.installationDate && (
                                          <span className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                                            <Calendar size={11} /> {new Date(m.installationDate).toLocaleDateString()}
                                          </span>
                                        )}
                                      </div>

                                      {m.description && (
                                        <p className="text-[11px] text-slate-600 font-medium">{m.description}</p>
                                      )}

                                      <div>
                                        <span className="text-[10px] text-slate-400 font-bold block mb-1">Serial Numbers ({m.serialNumbers?.length || 0}):</span>
                                        {(!m.serialNumbers || m.serialNumbers.length === 0) ? (
                                          <span className="text-[10px] text-slate-400">No serial numbers attached</span>
                                        ) : (
                                          <div className="flex flex-wrap gap-1.5">
                                            {m.serialNumbers.map((sn, sIdx) => (
                                              <span key={sIdx} className="px-2 py-0.5 bg-white text-slate-800 rounded font-mono font-bold text-[10px] border border-slate-200 shadow-2xs">
                                                {sn}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
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
              className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden"
            >
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
                <h3 className="font-bold text-slate-800 text-sm">{editingProduct ? 'Edit Product' : 'Add New Product'}</h3>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 text-xs flex-1">
                {/* Basic Product Info */}
                <div className="space-y-4">
                  <h4 className="font-extrabold text-slate-900 text-xs tracking-wider border-b pb-2">1. Product Information</h4>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Product Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold text-sm"
                      placeholder="e.g. Fiber Laser Printer LM500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Product Description</label>
                    <textarea
                      rows={2}
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="Detailed product overview..."
                    />
                  </div>

                  {/* Product Image File Upload Input */}
                  <div className="space-y-2 border border-slate-200 rounded-xl p-3.5 bg-slate-50/50">
                    <label className="block font-semibold text-slate-700 text-xs">Product Image (File Upload Only)</label>
                    <div className="flex items-center gap-4">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageFileChange}
                        className="text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-extrabold file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 transition-all cursor-pointer"
                      />
                      {imagePreview && (
                        <div
                          onClick={() => setPreviewImageModal({ show: true, url: imagePreview, title: formData.name || 'Product Image' })}
                          className="w-14 h-14 rounded-xl border border-slate-200 overflow-hidden bg-white shrink-0 shadow-xs cursor-pointer hover:ring-2 hover:ring-indigo-500/50 hover:scale-105 transition-all"
                          title="Click to preview image"
                        >
                          <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Models & Serial Numbers Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h4 className="font-extrabold text-slate-900 text-xs tracking-wider">2. Product Models ({formData.models.length})</h4>
                    <button
                      type="button"
                      onClick={addModel}
                      className="px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-extrabold rounded-lg text-xs flex items-center gap-1 transition-all"
                    >
                      <Plus size={14} /> Add Model
                    </button>
                  </div>

                  {formData.models.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 space-y-1">
                      <Layers size={28} className="mx-auto text-slate-300" />
                      <p className="text-xs font-semibold">No models added yet. Click "+ Add Model".</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {formData.models.map((model, mIdx) => (
                        <div key={mIdx} className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-3">
                          {/* Model Card Header */}
                          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                            <span className="font-extrabold text-indigo-700 text-xs flex items-center gap-1.5">
                              <Package size={14} /> Model #{mIdx + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeModel(mIdx)}
                              className="px-2.5 py-1 bg-rose-50 text-rose-600 hover:bg-rose-100 font-bold rounded-lg text-[11px] flex items-center gap-1"
                            >
                              <Trash2 size={12} /> Remove Model
                            </button>
                          </div>

                          {/* Model Fields */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-1">Model Name *</label>
                              <input
                                type="text"
                                required
                                value={model.modelName}
                                onChange={(e) => updateModelField(mIdx, 'modelName', e.target.value)}
                                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs"
                                placeholder="e.g. LM500-Pro"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-1">Installation Date</label>
                              <input
                                type="date"
                                value={model.installationDate}
                                onChange={(e) => updateModelField(mIdx, 'installationDate', e.target.value)}
                                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium"
                              />
                            </div>

                            <div className="md:col-span-2">
                              <label className="block text-[11px] font-bold text-slate-600 mb-1">Model Description</label>
                              <input
                                type="text"
                                value={model.description}
                                onChange={(e) => updateModelField(mIdx, 'description', e.target.value)}
                                className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs"
                                placeholder="Specific model details..."
                              />
                            </div>
                          </div>

                          {/* Serial Numbers Sub-Section */}
                          <div className="space-y-2 pt-1 border-t border-slate-200">
                            <div className="flex items-center justify-between">
                              <label className="block text-[11px] font-extrabold text-slate-700">
                                Serial Numbers ({model.serialNumbers.length})
                              </label>
                              <button
                                type="button"
                                onClick={() => addSerialNumber(mIdx)}
                                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                              >
                                <Plus size={12} /> Add Serial No
                              </button>
                            </div>

                            <div className="space-y-2">
                              {model.serialNumbers.map((sn, sIdx) => (
                                <div key={sIdx} className="flex items-center gap-2">
                                  <div className="relative flex-1">
                                    <Hash size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                      type="text"
                                      value={sn}
                                      onChange={(e) => updateSerialNumber(mIdx, sIdx, e.target.value)}
                                      className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold"
                                      placeholder={`Serial Number #${sIdx + 1}`}
                                    />
                                  </div>
                                  {model.serialNumbers.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => removeSerialNumber(mIdx, sIdx)}
                                      className="p-2 bg-rose-50 text-rose-500 hover:bg-rose-100 rounded-lg text-xs"
                                    >
                                      <X size={14} />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 border border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-md shadow-indigo-600/20"
                  >
                    {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                    Save Product & Models
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
              <h3 className="font-bold text-slate-800 text-base">Delete Product</h3>
              <p className="text-xs text-slate-500">Are you sure you want to delete this product and all its models from catalog?</p>
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
      {/* Image Preview Modal */}
      <AnimatePresence>
        {previewImageModal.show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPreviewImageModal({ show: false, url: '', title: '' })}
            className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl p-4 max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl relative flex flex-col items-center border border-slate-200"
            >
              <button
                onClick={() => setPreviewImageModal({ show: false, url: '', title: '' })}
                className="absolute top-4 right-4 p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full transition-all z-10"
              >
                <X size={20} />
              </button>
              {previewImageModal.title && (
                <h3 className="text-sm font-extrabold text-slate-900 mb-3 px-8 text-center">{previewImageModal.title}</h3>
              )}
              <div className="w-full h-full max-h-[75vh] flex items-center justify-center overflow-hidden rounded-2xl bg-slate-50 border border-slate-100 p-2">
                <img
                  src={previewImageModal.url}
                  alt={previewImageModal.title || 'Preview'}
                  className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-md"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Products;
