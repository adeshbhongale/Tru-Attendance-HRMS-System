import { AnimatePresence, motion } from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AlertTriangle,
  Building2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  Edit2,
  FileText,
  Layers,
  Loader2,
  MapPin,
  Package,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
  Users,
  X
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';

const Vendors = () => {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const exportDropdownRef = useRef(null);

  // Search and Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterIndustry, setFilterIndustry] = useState('All');

  // Enterprise View Vendor Details Modal State
  const [viewVendor, setViewVendor] = useState(null);
  const [viewTab, setViewTab] = useState('basic'); // basic, address, contacts, financialBank, documents, products

  // Form Modal (Create / Edit)
  const [showModal, setShowModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [formTab, setFormTab] = useState('basic'); // basic, address, contacts, financialBank, documents, products
  const [saving, setSaving] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState({ show: false, id: null });

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Form State
  const [formData, setFormData] = useState({
    vendorName: '',
    vendorCode: '',
    industry: '',
    deliveryPeriod: 0,
    description: '',
    dateOfIncorporation: '',

    registeredOffice: {
      addressLine1: '',
      addressLine2: '',
      area: '',
      city: '',
      district: '',
      state: '',
      country: 'India',
      pincode: ''
    },

    primaryContact: {
      contactPerson: '',
      designation: '',
      mobileNumber: '',
      email: ''
    },

    departmentContacts: {
      purchase: { name: '', designation: '', mobile: '', email: '' },
      accounts: { name: '', designation: '', mobile: '', email: '' }
    },

    financialInfo: {
      panNumber: '',
      gstNumber: '',
      dateOfIncorporation: '',
      msmeNumber: '',
      msmeCategory: 'small'
    },

    bankDetails: {
      bankName: '',
      accountNumber: '',
      ifscCode: '',
      branchName: '',
      accountType: 'Current',
      bankAddress: ''
    },

    documents: [
      { docType: 'GST Certificate', docName: '', fileUrl: '', issueDate: '', expiryDate: '', version: '1.0' },
      { docType: 'PAN Card', docName: '', fileUrl: '', issueDate: '', expiryDate: '', version: '1.0' },
      { docType: 'MSME Document', docName: '', fileUrl: '', issueDate: '', expiryDate: '', version: '1.0' }
    ],

    materialsSupplied: [],
    products: [],
    isActive: true
  });

  useEffect(() => {
    fetchVendors();
    fetchMaterials();
  }, []);

  const fetchMaterials = async () => {
    try {
      const res = await api.get('/materials?limit=1000');
      setAllMaterials(res.data.data || []);
    } catch (err) {
      console.error('Failed to load materials for vendor selection');
    }
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target)) {
        setShowExportDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchVendors = async () => {
    try {
      setLoading(true);
      const res = await api.get('/vendors?limit=1000');
      setVendors(res.data.data || []);
    } catch (err) {
      toast.error('Failed to load vendors list');
    } finally {
      setLoading(false);
    }
  };

  const extractSingleContact = (deptData) => {
    if (Array.isArray(deptData) && deptData.length > 0) {
      return {
        name: deptData[0].name || '',
        designation: deptData[0].designation || '',
        mobile: deptData[0].mobile || '',
        email: deptData[0].email || ''
      };
    } else if (deptData && typeof deptData === 'object' && !Array.isArray(deptData)) {
      return {
        name: deptData.name || '',
        designation: deptData.designation || '',
        mobile: deptData.mobile || '',
        email: deptData.email || ''
      };
    }
    return { name: '', designation: '', mobile: '', email: '' };
  };

  // Filter & Search (Searching exclusively by Vendor & Code, Industry, Primary Contact, Address)
  const filteredVendors = useMemo(() => {
    return vendors.filter(v => {
      if (filterIndustry !== 'All' && !(v.industry || '').toLowerCase().includes(filterIndustry.toLowerCase())) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();

        // 1. Vendor & Code
        const matchesVendorCode = (v.vendorName || v.companyName || '').toLowerCase().includes(q) ||
          (v.vendorCode || '').toLowerCase().includes(q);

        // 2. Industry
        const matchesIndustry = (v.industry || '').toLowerCase().includes(q);

        // 3. Primary Contact
        const matchesPrimaryContact = (v.primaryContact?.contactPerson || v.contactPerson || '').toLowerCase().includes(q) ||
          (v.primaryContact?.mobileNumber || v.mobile || v.phone || '').toLowerCase().includes(q) ||
          (v.primaryContact?.email || v.email || '').toLowerCase().includes(q);

        // 4. Address
        const addrStr = `${v.registeredOffice?.addressLine1 || v.address || ''} ${v.registeredOffice?.addressLine2 || ''} ${v.registeredOffice?.city || ''} ${v.registeredOffice?.state || ''} ${v.registeredOffice?.pincode || ''}`.toLowerCase();
        const matchesAddress = addrStr.includes(q);

        return matchesVendorCode || matchesIndustry || matchesPrimaryContact || matchesAddress;
      }

      return true;
    });
  }, [vendors, searchQuery, filterIndustry]);

  // Extract unique industries dynamically from backend vendors list
  const availableIndustries = useMemo(() => {
    const set = new Set();
    vendors.forEach(v => {
      if (v.industry && v.industry.trim()) {
        set.add(v.industry.trim());
      }
    });
    return Array.from(set).sort();
  }, [vendors]);

  const totalPages = Math.ceil(filteredVendors.length / itemsPerPage) || 1;
  const paginatedVendors = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredVendors.slice(start, start + itemsPerPage);
  }, [filteredVendors, currentPage]);

  // Open Add/Edit Modal
  const handleOpenModal = (vendor = null, e = null) => {
    if (e) e.stopPropagation();
    setFormTab('basic');
    if (vendor) {
      setEditingVendor(vendor);
      setFormData({
        vendorName: vendor.vendorName || vendor.companyName || '',
        vendorCode: vendor.vendorCode || '',
        industry: vendor.industry || '',
        deliveryPeriod: vendor.deliveryPeriod || vendor.creditPeriod || 0,
        description: vendor.description || vendor.remarks || vendor.notes || '',
        dateOfIncorporation: vendor.dateOfIncorporation ? vendor.dateOfIncorporation.split('T')[0] : (vendor.financialInfo?.dateOfIncorporation ? vendor.financialInfo.dateOfIncorporation.split('T')[0] : ''),

        registeredOffice: {
          addressLine1: vendor.registeredOffice?.addressLine1 || (typeof vendor.address === 'string' ? vendor.address : ''),
          addressLine2: vendor.registeredOffice?.addressLine2 || '',
          area: vendor.registeredOffice?.area || '',
          city: vendor.registeredOffice?.city || '',
          district: vendor.registeredOffice?.district || '',
          state: vendor.registeredOffice?.state || '',
          country: vendor.registeredOffice?.country || 'India',
          pincode: vendor.registeredOffice?.pincode || ''
        },

        primaryContact: {
          contactPerson: vendor.primaryContact?.contactPerson || vendor.contactPerson || '',
          designation: vendor.primaryContact?.designation || '',
          mobileNumber: vendor.primaryContact?.mobileNumber || vendor.mobile || '',
          email: vendor.primaryContact?.email || vendor.email || ''
        },

        departmentContacts: {
          purchase: extractSingleContact(vendor.departmentContacts?.purchase),
          accounts: extractSingleContact(vendor.departmentContacts?.accounts)
        },

        financialInfo: {
          panNumber: vendor.financialInfo?.panNumber || '',
          gstNumber: vendor.financialInfo?.gstNumber || vendor.gstin || '',
          dateOfIncorporation: vendor.financialInfo?.dateOfIncorporation ? vendor.financialInfo.dateOfIncorporation.split('T')[0] : '',
          msmeNumber: vendor.financialInfo?.msmeNumber || '',
          msmeCategory: vendor.financialInfo?.msmeCategory || 'small'
        },

        bankDetails: {
          bankName: vendor.bankDetails?.bankName || '',
          accountNumber: vendor.bankDetails?.accountNumber || '',
          ifscCode: vendor.bankDetails?.ifscCode || '',
          branchName: vendor.bankDetails?.branchName || '',
          accountType: vendor.bankDetails?.accountType || 'Current',
          bankAddress: vendor.bankDetails?.bankAddress || ''
        },

        documents: (() => {
          const compulsoryDocTypes = ['GST Certificate', 'PAN Card', 'MSME Document'];
          const existingDocs = vendor.documents || [];
          return compulsoryDocTypes.map(type => {
            const found = existingDocs.find(d => d.docType === type || (type === 'MSME Document' && (d.docType === 'MSME Certificate' || d.docType === 'MSME Document')));
            return found ? { ...found, docType: type } : { docType: type, docName: '', fileUrl: '', issueDate: '', expiryDate: '', version: '1.0' };
          });
        })(),

        materialsSupplied: Array.isArray(vendor.materialsSupplied)
          ? vendor.materialsSupplied.map(m => ({
              material: typeof m.material === 'object' ? m.material?._id : (m.material || m._id || m),
              materialName: m.materialName || m.material?.name || '',
              fastestDeliveryPeriod: m.fastestDeliveryPeriod || vendor.deliveryPeriod || 0,
              maxStockSupply: m.maxStockSupply || 0
            }))
          : [],
        isActive: vendor.isActive ?? true
      });
    } else {
      setEditingVendor(null);
      setFormData({
        vendorName: '',
        vendorCode: '',
        industry: '',
        deliveryPeriod: 0,
        description: '',
        dateOfIncorporation: '',

        registeredOffice: { addressLine1: '', addressLine2: '', area: '', city: '', district: '', state: '', country: 'India', pincode: '' },
        primaryContact: { contactPerson: '', designation: '', mobileNumber: '', email: '' },
        departmentContacts: {
          purchase: { name: '', designation: '', mobile: '', email: '' },
          accounts: { name: '', designation: '', mobile: '', email: '' }
        },
        financialInfo: { panNumber: '', gstNumber: '', dateOfIncorporation: '', msmeNumber: '', msmeCategory: 'small' },
        bankDetails: { bankName: '', accountNumber: '', ifscCode: '', branchName: '', accountType: 'Current', bankAddress: '' },
        documents: [
          { docType: 'GST Certificate', docName: '', fileUrl: '', issueDate: '', expiryDate: '', version: '1.0' },
          { docType: 'PAN Card', docName: '', fileUrl: '', issueDate: '', expiryDate: '', version: '1.0' },
          { docType: 'MSME Document', docName: '', fileUrl: '', issueDate: '', expiryDate: '', version: '1.0' }
        ],
        materialsSupplied: [],
        isActive: true
      });
    }
    setShowModal(true);
  };

  // Section draft save
  const handleSaveSection = (tabName) => {
    if (tabName === 'basic' && !formData.vendorName.trim()) {
      toast.error('Please enter Vendor Name before saving');
      return;
    }
    const labelMap = {
      basic: 'Basic Info',
      address: 'Company Address',
      contacts: 'Contacts (Purchase & Accounts)',
      financialBank: 'Financial & Bank Details',
      documents: 'Document Uploads',
      products: 'Products Offered'
    };
    toast.success(`✓ ${labelMap[tabName] || 'Section'} saved to draft!`);
  };

  // Cloudinary Upload Handler
  const handleDocumentFileUpload = async (docIndex, file) => {
    if (!file) return;

    try {
      setUploadingDoc(prev => ({ ...prev, [docIndex]: true }));
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = async () => {
        const base64Data = reader.result;
        const res = await api.post('/vendors/upload-document', {
          file: base64Data,
          docType: formData.documents[docIndex].docType
        });

        if (res.data.success && res.data.url) {
          toast.success(`${formData.documents[docIndex].docType} uploaded!`);
          setFormData(prev => {
            const updatedDocs = [...prev.documents];
            updatedDocs[docIndex] = {
              ...updatedDocs[docIndex],
              docName: file.name,
              fileUrl: res.data.url,
              uploadedOn: new Date().toISOString()
            };
            return { ...prev, documents: updatedDocs };
          });
        }
        setUploadingDoc(prev => ({ ...prev, [docIndex]: false }));
      };
    } catch (err) {
      toast.error('Document upload failed');
      setUploadingDoc(prev => ({ ...prev, [docIndex]: false }));
    }
  };

  // Form Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.vendorName.trim()) {
      toast.error('Vendor Name is required');
      return;
    }

    // COMPULSORY DOCUMENT UPLOAD VALIDATION
    const missingDocs = formData.documents.filter(d => !d.fileUrl);
    if (missingDocs.length > 0) {
      toast.error(`Document upload is compulsory! Please upload ${missingDocs.map(d => d.docType).join(', ')}.`);
      setFormTab('documents');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        ...formData,
        financialInfo: {
          ...formData.financialInfo,
          dateOfIncorporation: formData.dateOfIncorporation || formData.financialInfo.dateOfIncorporation
        }
      };

      if (editingVendor) {
        await api.put(`/vendors/${editingVendor._id}`, payload);
        toast.success('Vendor updated successfully');
      } else {
        await api.post('/vendors', payload);
        toast.success('Vendor created successfully');
      }
      setShowModal(false);
      fetchVendors();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save vendor');
    } finally {
      setSaving(false);
    }
  };

  // Delete Handler
  const handleDelete = async (e = null) => {
    if (e) e.stopPropagation();
    if (!deleteConfirm.id) return;
    try {
      await api.delete(`/vendors/${deleteConfirm.id}`);
      toast.success('Vendor deleted successfully');
      setDeleteConfirm({ show: false, id: null });
      fetchVendors();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete vendor');
    }
  };

  // Export PDF
  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Vendors Directory Master Report', 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 22);

    const tableData = filteredVendors.map(v => [
      v.vendorCode || '-',
      v.vendorName || v.companyName || '-',
      v.industry || '-',
      v.primaryContact?.contactPerson || v.contactPerson || '-',
      v.phone || v.mobile || '-',
      v.financialInfo?.gstNumber || v.gstin || '-',
      v.products?.length || 0,
      v.status || (v.isActive ? 'Active' : 'Inactive')
    ]);

    autoTable(doc, {
      startY: 28,
      head: [['Code', 'Vendor Name', 'Industry', 'Contact Person', 'Phone', 'GSTIN', 'Products', 'Status']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] }
    });

    doc.save(`Vendors_Master_${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success('Vendors PDF report downloaded!');
    setShowExportDropdown(false);
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['Vendor Code,Vendor Name,Industry,Delivery Period,Contact Person,Mobile,Email,GSTIN,City,Products Count,Status'];
    const rows = filteredVendors.map(v => [
      `"${v.vendorCode || ''}"`,
      `"${v.vendorName || v.companyName || ''}"`,
      `"${v.industry || ''}"`,
      `"${v.deliveryPeriod || v.creditPeriod || 0}"`,
      `"${v.primaryContact?.contactPerson || v.contactPerson || ''}"`,
      `"${v.phone || v.mobile || ''}"`,
      `"${v.email || ''}"`,
      `"${v.financialInfo?.gstNumber || v.gstin || ''}"`,
      `"${v.registeredOffice?.city || ''}"`,
      `"${v.products?.length || 0}"`,
      `"${v.status || (v.isActive ? 'Active' : 'Inactive')}"`
    ].join(','));

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Vendors_Export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Vendors CSV exported!');
    setShowExportDropdown(false);
  };

  // Products offered handlers (Product Name & Price only)
  const addProductOffer = () => {
    setFormData(prev => ({
      ...prev,
      products: [...prev.products, { productName: '', price: 0 }]
    }));
  };

  const removeProductOffer = (idx) => {
    setFormData(prev => ({
      ...prev,
      products: prev.products.filter((_, i) => i !== idx)
    }));
  };

  // Summary Metrics calculations
  const totalMaterialsCount = useMemo(() => {
    return vendors.reduce((acc, v) => acc + (v.materialsSupplied?.length || 0), 0);
  }, [vendors]);

  const uniqueCitiesCount = useMemo(() => {
    const set = new Set(vendors.map(v => v.registeredOffice?.city).filter(Boolean));
    return set.size;
  }, [vendors]);

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      {/* Top Banner Header (Same styling as Customers page) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100">
              <Building2 className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Vendor Master</h1>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">
                Dynamic Enterprise Vendor Directory with Auto-Generated Codes, Department Contacts & Document Repository
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-nowrap">
          {/* Export Dropdown */}
          <div className="relative" ref={exportDropdownRef}>
            <button
              onClick={() => setShowExportDropdown(!showExportDropdown)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 font-bold text-xs rounded-2xl transition-all shadow-sm whitespace-nowrap"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>Export Report</span>
            </button>
            {showExportDropdown && (
              <div className="absolute right-0 mt-2 w-44 bg-white border border-slate-100 rounded-2xl shadow-xl z-30 py-2 text-xs font-bold text-slate-700">
                <button
                  onClick={() => { setShowExportDropdown(false); handleExportPDF(); }}
                  className="w-full text-left px-4 py-2 hover:bg-indigo-50 hover:text-indigo-600 flex items-center gap-2"
                >
                  <FileText className="w-4 h-4 text-red-500" /> Export as PDF
                </button>
                <button
                  onClick={() => { setShowExportDropdown(false); handleExportCSV(); }}
                  className="w-full text-left px-4 py-2 hover:bg-indigo-50 hover:text-indigo-600 flex items-center gap-2"
                >
                  <FileText className="w-4 h-4 text-emerald-500" /> Export as CSV
                </button>
              </div>
            )}
          </div>

          {/* Add Vendor Button (Always on right side of Export) */}
          <button
            onClick={() => handleOpenModal(null)}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-2xl transition-all shadow-lg shadow-indigo-600/20 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Add New Vendor
          </button>
        </div>
      </div>

      {/* Dynamic Summary Metrics Cards (Same as Customers page) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-2xl">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-extrabold text-slate-400 tracking-wider">Total Vendors</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{vendors.length}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-2xl">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-extrabold text-slate-400 tracking-wider">Materials Supplied</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{totalMaterialsCount}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="p-3.5 bg-purple-50 text-purple-600 rounded-2xl">
            <MapPin className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-extrabold text-slate-400 tracking-wider">Vendor Cities</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{uniqueCitiesCount}</p>
          </div>
        </div>
      </div>

      {/* Search Bar Toolbar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Vendor & Code, Industry, Primary Contact, Address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <label className="text-xs font-bold text-slate-500 whitespace-nowrap">Filter Industry:</label>
          <select
            value={filterIndustry}
            onChange={(e) => setFilterIndustry(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none"
          >
            <option value="All">All Industries</option>
            {availableIndustries.map((ind, idx) => (
              <option key={idx} value={ind}>{ind}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Vendors Directory Table (Fits perfectly on screen without horizontal scrolling) */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />
            <p className="text-xs font-bold text-slate-400 mt-2">Loading Vendor Directory...</p>
          </div>
        ) : filteredVendors.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <Building2 className="w-12 h-12 text-slate-300 mx-auto" />
            <p className="text-base font-extrabold text-slate-700">No Vendors Found</p>
            <p className="text-xs font-medium text-slate-400">Try adjusting your search query or add a new vendor.</p>
          </div>
        ) : (
          <div className="w-full overflow-x-auto lg:overflow-x-visible">
            <table className="w-full text-left border-collapse table-auto md:table-fixed">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-extrabold text-slate-500 tracking-wider">
                  <th className="px-3.5 py-3.5 w-[24%]">Vendor & Code</th>
                  <th className="px-3 py-3.5 w-[11%]">Industry</th>
                  <th className="px-3.5 py-3.5 w-[22%]">Primary Contact</th>
                  <th className="px-3 py-3.5 w-[18%]">Address</th>
                  <th className="px-3 py-3.5 w-[10%] text-center">Delivery</th>
                  <th className="px-3 py-3.5 w-[10%] text-center">Materials</th>
                  <th className="px-3 py-3.5 w-[5%] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                {paginatedVendors.map((vendor) => (
                  <tr
                    key={vendor._id}
                    onClick={() => { setViewVendor(vendor); setViewTab('basic'); }}
                    className="hover:bg-indigo-50/40 transition-all cursor-pointer"
                  >
                    <td className="px-3.5 py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 font-mono text-[10px] font-extrabold rounded-md border border-indigo-100 flex-shrink-0">
                          {vendor.vendorCode}
                        </span>
                        <div className="min-w-0 truncate">
                          <p className="font-extrabold text-slate-900 text-xs truncate" title={vendor.vendorName || vendor.companyName}>
                            {vendor.vendorName || vendor.companyName}
                          </p>
                          <p className="text-[10px] font-medium text-slate-400 truncate">{vendor.registeredOffice?.city || 'India'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-lg text-[10px] font-extrabold inline-block truncate max-w-full">
                        {vendor.industry || 'General'}
                      </span>
                    </td>
                    <td className="px-3.5 py-3">
                      <div className="min-w-0 truncate">
                        <p className="font-bold text-slate-900 text-xs truncate">{vendor.primaryContact?.contactPerson || vendor.contactPerson || '—'}</p>
                        <p className="text-[10px] text-slate-400 font-medium truncate" title={`${vendor.primaryContact?.mobileNumber || vendor.phone || vendor.mobile || ''} ${vendor.primaryContact?.email ? `• ${vendor.primaryContact.email}` : ''}`}>
                          {vendor.primaryContact?.mobileNumber || vendor.phone || vendor.mobile || '—'}
                          {vendor.primaryContact?.email ? ` • ${vendor.primaryContact.email}` : ''}
                        </p>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-slate-600 font-medium text-xs truncate" title={`${vendor.registeredOffice?.addressLine1 || vendor.address || ''}${vendor.registeredOffice?.city ? `, ${vendor.registeredOffice.city}` : ''}`}>
                        {vendor.registeredOffice?.addressLine1 || vendor.address || '—'}
                        {vendor.registeredOffice?.city ? `, ${vendor.registeredOffice.city}` : ''}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200/60 rounded-lg font-extrabold text-[10px] inline-block">
                        {vendor.deliveryPeriod || vendor.creditPeriod || 0} Days
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-lg text-[10px] font-extrabold border border-indigo-100 inline-block">
                        {vendor.materialsSupplied?.length || 0} Materials
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          onClick={(e) => handleOpenModal(vendor, e)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                          title="Edit Vendor"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ show: true, id: vendor._id }); }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                          title="Delete Vendor"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Toolbar */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 bg-slate-50/50">
            <span>Showing Page {currentPage} of {totalPages}</span>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-2 rounded-xl border border-slate-200 hover:bg-white disabled:opacity-40 transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-2 rounded-xl border border-slate-200 hover:bg-white disabled:opacity-40 transition-all"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CREATE / EDIT VENDOR MODAL */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-5xl w-full my-8 overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base">
                      {editingVendor ? `Edit Vendor: ${editingVendor.vendorName || editingVendor.companyName}` : 'Add New Vendor'}
                    </h3>
                    <p className="text-xs font-medium text-slate-500">Fill in vendor master details</p>
                  </div>
                </div>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-2 rounded-xl">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Navigation Tabs */}
              <div className="flex border-b border-slate-200 bg-slate-50/50 px-6 gap-1 overflow-x-auto text-xs font-extrabold scrollbar-none">
                {[
                  { id: 'basic', label: '1. Basic Info', icon: Building2 },
                  { id: 'address', label: '2. Address', icon: MapPin },
                  { id: 'contacts', label: '3. Contacts', icon: Users },
                  { id: 'financialBank', label: '4. Financial & Bank', icon: CreditCard },
                  { id: 'documents', label: '5. Documents *', icon: FileText },
                  { id: 'materials', label: '6. Materials Supplied', icon: Layers },
                ].map(t => {
                  const IconComponent = t.icon;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setFormTab(t.id)}
                      className={`flex items-center gap-2 px-4 py-3.5 border-b-2 transition-all whitespace-nowrap ${formTab === t.id
                        ? 'border-indigo-600 text-indigo-600 bg-white'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                      <IconComponent className="w-4 h-4" />
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {/* Form Content */}
              <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1 text-xs font-semibold">
                {/* TAB 1: BASIC INFO */}
                {formTab === 'basic' && (
                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2">1. Basic Information</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Vendor Name *</label>
                        <input
                          type="text"
                          required
                          value={formData.vendorName}
                          onChange={(e) => setFormData({ ...formData, vendorName: e.target.value })}
                          placeholder="e.g. Acme Supplies Pvt Ltd"
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Industry Sector</label>
                        <input
                          type="text"
                          value={formData.industry}
                          onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                          placeholder="e.g. Textiles, Electronics"
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Delivery Period (Days)</label>
                        <input
                          type="number"
                          min="0"
                          value={formData.deliveryPeriod}
                          onChange={(e) => setFormData({ ...formData, deliveryPeriod: Number(e.target.value) })}
                          placeholder="e.g. 15"
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Date of Incorporation</label>
                        <input
                          type="date"
                          value={formData.dateOfIncorporation}
                          onChange={(e) => setFormData({ ...formData, dateOfIncorporation: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Description</label>
                      <textarea
                        rows={3}
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Add vendor overview or description details..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                  </div>
                )}

                {/* TAB 2: ADDRESS */}
                {formTab === 'address' && (
                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2">Registered Address</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Address Line 1</label>
                        <input
                          type="text"
                          value={formData.registeredOffice.addressLine1}
                          onChange={(e) => setFormData({ ...formData, registeredOffice: { ...formData.registeredOffice, addressLine1: e.target.value } })}
                          placeholder="Building name, street..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Address Line 2</label>
                        <input
                          type="text"
                          value={formData.registeredOffice.addressLine2}
                          onChange={(e) => setFormData({ ...formData, registeredOffice: { ...formData.registeredOffice, addressLine2: e.target.value } })}
                          placeholder="Plot / Industrial Estate..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">City</label>
                        <input
                          type="text"
                          value={formData.registeredOffice.city}
                          onChange={(e) => setFormData({ ...formData, registeredOffice: { ...formData.registeredOffice, city: e.target.value } })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">State</label>
                        <input
                          type="text"
                          value={formData.registeredOffice.state}
                          onChange={(e) => setFormData({ ...formData, registeredOffice: { ...formData.registeredOffice, state: e.target.value } })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Country</label>
                        <input
                          type="text"
                          value={formData.registeredOffice.country}
                          onChange={(e) => setFormData({ ...formData, registeredOffice: { ...formData.registeredOffice, country: e.target.value } })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Pincode</label>
                        <input
                          type="text"
                          value={formData.registeredOffice.pincode}
                          onChange={(e) => setFormData({ ...formData, registeredOffice: { ...formData.registeredOffice, pincode: e.target.value } })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: CONTACTS */}
                {formTab === 'contacts' && (
                  <div className="space-y-6">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2 mb-3">Primary Contact Person</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Contact Person Name</label>
                          <input
                            type="text"
                            value={formData.primaryContact.contactPerson}
                            onChange={(e) => setFormData({ ...formData, primaryContact: { ...formData.primaryContact, contactPerson: e.target.value } })}
                            placeholder="John Doe"
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Designation</label>
                          <input
                            type="text"
                            value={formData.primaryContact.designation}
                            onChange={(e) => setFormData({ ...formData, primaryContact: { ...formData.primaryContact, designation: e.target.value } })}
                            placeholder="Sales Head / Director"
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Mobile Number</label>
                          <input
                            type="text"
                            value={formData.primaryContact.mobileNumber}
                            onChange={(e) => setFormData({ ...formData, primaryContact: { ...formData.primaryContact, mobileNumber: e.target.value } })}
                            placeholder="+91 9876543210"
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Email</label>
                          <input
                            type="email"
                            value={formData.primaryContact.email}
                            onChange={(e) => setFormData({ ...formData, primaryContact: { ...formData.primaryContact, email: e.target.value } })}
                            placeholder="john@vendor.com"
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Department Contacts */}
                    <div className="space-y-4 pt-2">
                      <h4 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2">Department Contacts</h4>

                      {/* Purchase Department */}
                      <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-200 space-y-3">
                        <h5 className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-indigo-600" />
                          Purchase Department Contact
                        </h5>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white p-3.5 rounded-xl border border-slate-200">
                          <div>
                            <label className="block font-bold text-slate-600 mb-1">Contact Name</label>
                            <input
                              type="text"
                              placeholder="Purchase Contact Name"
                              value={formData.departmentContacts.purchase?.name || ''}
                              onChange={(e) => setFormData({
                                ...formData,
                                departmentContacts: {
                                  ...formData.departmentContacts,
                                  purchase: { ...formData.departmentContacts.purchase, name: e.target.value }
                                }
                              })}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block font-bold text-slate-600 mb-1">Designation</label>
                            <input
                              type="text"
                              placeholder="e.g. Purchase Executive"
                              value={formData.departmentContacts.purchase?.designation || ''}
                              onChange={(e) => setFormData({
                                ...formData,
                                departmentContacts: {
                                  ...formData.departmentContacts,
                                  purchase: { ...formData.departmentContacts.purchase, designation: e.target.value }
                                }
                              })}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block font-bold text-slate-600 mb-1">Mobile</label>
                            <input
                              type="text"
                              placeholder="Mobile Number"
                              value={formData.departmentContacts.purchase?.mobile || ''}
                              onChange={(e) => setFormData({
                                ...formData,
                                departmentContacts: {
                                  ...formData.departmentContacts,
                                  purchase: { ...formData.departmentContacts.purchase, mobile: e.target.value }
                                }
                              })}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block font-bold text-slate-600 mb-1">Email</label>
                            <input
                              type="email"
                              placeholder="Email Address"
                              value={formData.departmentContacts.purchase?.email || ''}
                              onChange={(e) => setFormData({
                                ...formData,
                                departmentContacts: {
                                  ...formData.departmentContacts,
                                  purchase: { ...formData.departmentContacts.purchase, email: e.target.value }
                                }
                              })}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Accounts Department */}
                      <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-200 space-y-3">
                        <h5 className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-indigo-600" />
                          Accounts Department Contact
                        </h5>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white p-3.5 rounded-xl border border-slate-200">
                          <div>
                            <label className="block font-bold text-slate-600 mb-1">Contact Name</label>
                            <input
                              type="text"
                              placeholder="Accounts Contact Name"
                              value={formData.departmentContacts.accounts?.name || ''}
                              onChange={(e) => setFormData({
                                ...formData,
                                departmentContacts: {
                                  ...formData.departmentContacts,
                                  accounts: { ...formData.departmentContacts.accounts, name: e.target.value }
                                }
                              })}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block font-bold text-slate-600 mb-1">Designation</label>
                            <input
                              type="text"
                              placeholder="e.g. Accounts Manager"
                              value={formData.departmentContacts.accounts?.designation || ''}
                              onChange={(e) => setFormData({
                                ...formData,
                                departmentContacts: {
                                  ...formData.departmentContacts,
                                  accounts: { ...formData.departmentContacts.accounts, designation: e.target.value }
                                }
                              })}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block font-bold text-slate-600 mb-1">Mobile</label>
                            <input
                              type="text"
                              placeholder="Mobile Number"
                              value={formData.departmentContacts.accounts?.mobile || ''}
                              onChange={(e) => setFormData({
                                ...formData,
                                departmentContacts: {
                                  ...formData.departmentContacts,
                                  accounts: { ...formData.departmentContacts.accounts, mobile: e.target.value }
                                }
                              })}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block font-bold text-slate-600 mb-1">Email</label>
                            <input
                              type="email"
                              placeholder="Email Address"
                              value={formData.departmentContacts.accounts?.email || ''}
                              onChange={(e) => setFormData({
                                ...formData,
                                departmentContacts: {
                                  ...formData.departmentContacts,
                                  accounts: { ...formData.departmentContacts.accounts, email: e.target.value }
                                }
                              })}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 4: FINANCIAL & BANK */}
                {formTab === 'financialBank' && (
                  <div className="space-y-6">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2 mb-4">Financial & Tax Details</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">PAN Number</label>
                          <input
                            type="text"
                            value={formData.financialInfo.panNumber}
                            onChange={(e) => setFormData({ ...formData, financialInfo: { ...formData.financialInfo, panNumber: e.target.value } })}
                            placeholder="ABCDE1234F"
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">GSTIN Number</label>
                          <input
                            type="text"
                            value={formData.financialInfo.gstNumber}
                            onChange={(e) => setFormData({ ...formData, financialInfo: { ...formData.financialInfo, gstNumber: e.target.value } })}
                            placeholder="27ABCDE1234F1Z5"
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">MSME Reg Number</label>
                          <input
                            type="text"
                            value={formData.financialInfo.msmeNumber}
                            onChange={(e) => setFormData({ ...formData, financialInfo: { ...formData.financialInfo, msmeNumber: e.target.value } })}
                            placeholder="UDYAM-MH-00-1234567"
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">MSME Category</label>
                          <select
                            value={formData.financialInfo.msmeCategory}
                            onChange={(e) => setFormData({ ...formData, financialInfo: { ...formData.financialInfo, msmeCategory: e.target.value } })}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold"
                          >
                            <option value="small">Small</option>
                            <option value="mid">Mid</option>
                            <option value="big">Big</option>
                            <option value="large">Large</option>
                            <option value="very large">Very Large</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2 mb-4">Bank Account Details</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Bank Name</label>
                          <input
                            type="text"
                            value={formData.bankDetails.bankName}
                            onChange={(e) => setFormData({ ...formData, bankDetails: { ...formData.bankDetails, bankName: e.target.value } })}
                            placeholder="HDFC Bank / SBI"
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Account Number</label>
                          <input
                            type="text"
                            value={formData.bankDetails.accountNumber}
                            onChange={(e) => setFormData({ ...formData, bankDetails: { ...formData.bankDetails, accountNumber: e.target.value } })}
                            placeholder="50200012345678"
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">IFSC Code</label>
                          <input
                            type="text"
                            value={formData.bankDetails.ifscCode}
                            onChange={(e) => setFormData({ ...formData, bankDetails: { ...formData.bankDetails, ifscCode: e.target.value } })}
                            placeholder="HDFC0001234"
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Branch Name</label>
                          <input
                            type="text"
                            value={formData.bankDetails.branchName}
                            onChange={(e) => setFormData({ ...formData, bankDetails: { ...formData.bankDetails, branchName: e.target.value } })}
                            placeholder="Kothrud Branch"
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Account Type</label>
                          <select
                            value={formData.bankDetails.accountType}
                            onChange={(e) => setFormData({ ...formData, bankDetails: { ...formData.bankDetails, accountType: e.target.value } })}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold"
                          >
                            <option value="Current">Current Account</option>
                            <option value="Savings">Savings Account</option>
                          </select>
                        </div>
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Bank Address</label>
                          <input
                            type="text"
                            value={formData.bankDetails.bankAddress}
                            onChange={(e) => setFormData({ ...formData, bankDetails: { ...formData.bankDetails, bankAddress: e.target.value } })}
                            placeholder="City, Pin..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 5: DOCUMENTS */}
                {formTab === 'documents' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <h4 className="font-bold text-slate-900 text-sm">Document Uploads</h4>
                      <span className="text-[11px] font-extrabold text-rose-600 bg-rose-50 px-3 py-1 rounded-full">
                        * All Documents are Compulsory
                      </span>
                    </div>
                    <div className="space-y-3">
                      {formData.documents.map((doc, idx) => (
                        <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl font-bold">
                              <FileText className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                                {doc.docType} <span className="text-rose-500 font-extrabold">*</span>
                              </div>
                              {doc.fileUrl ? (
                                <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1 font-mono mt-0.5 font-bold">
                                  ✓ View File URL ({doc.docName || 'Document'})
                                </a>
                              ) : (
                                <span className="text-[11px] text-rose-500 font-bold">Upload required (Compulsory)</span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 w-full md:w-auto">
                            <label className="cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-4 py-2.5 rounded-xl flex items-center gap-2 text-xs transition-all shadow-md shadow-indigo-600/20">
                              {uploadingDoc[idx] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                              {doc.fileUrl ? 'Replace File' : 'Upload File *'}
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                className="hidden"
                                onChange={(e) => handleDocumentFileUpload(idx, e.target.files[0])}
                              />
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* TAB 6: MATERIALS SUPPLIED */}
                {formTab === 'materials' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">6. Materials Supplied Section</h4>
                        <p className="text-[11px] font-semibold text-slate-500">Select raw materials & components supplied by this vendor from Material Master</p>
                      </div>
                      <span className="px-3 py-1 bg-indigo-50 text-indigo-700 font-extrabold text-xs rounded-full border border-indigo-100">
                        {formData.materialsSupplied?.length || 0} Selected
                      </span>
                    </div>

                    {allMaterials.length === 0 ? (
                      <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-2">
                        <Layers className="w-8 h-8 mx-auto text-slate-400" />
                        <p className="text-slate-500 font-bold">No materials registered in Material Master yet.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Dropdown Material Selector from Material Master List */}
                        <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                          <select
                            onChange={(e) => {
                              const selectedId = e.target.value;
                              if (!selectedId) return;
                              const mat = allMaterials.find(m => m._id === selectedId);
                              if (mat) {
                                const current = formData.materialsSupplied || [];
                                const exists = current.some(item => (typeof item.material === 'object' ? item.material?._id : item.material) === mat._id || item === mat._id);
                                if (!exists) {
                                  setFormData({
                                    ...formData,
                                    materialsSupplied: [
                                      ...current,
                                      { material: mat._id, materialName: mat.name, fastestDeliveryPeriod: formData.deliveryPeriod || 3, maxStockSupply: 1000 }
                                    ]
                                  });
                                }
                              }
                              e.target.value = '';
                            }}
                            className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          >
                            <option value="">+ Click to Select & Add Material from Material Master List...</option>
                            {allMaterials.map(m => (
                              <option key={m._id} value={m._id}>
                                {m.name} ({m.code}) — {m.category ? m.category.replace('_', ' ') : 'Raw Material'}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-52 overflow-y-auto pr-1">
                          {allMaterials.map((mat) => {
                            const selectedItem = (formData.materialsSupplied || []).find(
                              item => (typeof item.material === 'object' ? item.material?._id : item.material) === mat._id || item === mat._id
                            );
                            const isSelected = !!selectedItem;
                            return (
                              <div
                                key={mat._id}
                                onClick={() => {
                                  const current = formData.materialsSupplied || [];
                                  let updated;
                                  if (isSelected) {
                                    updated = current.filter(item => (typeof item.material === 'object' ? item.material?._id : item.material) !== mat._id && item !== mat._id);
                                  } else {
                                    updated = [...current, { material: mat._id, materialName: mat.name, fastestDeliveryPeriod: formData.deliveryPeriod || 3, maxStockSupply: 1000 }];
                                  }
                                  setFormData({ ...formData, materialsSupplied: updated });
                                }}
                                className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
                                  isSelected
                                    ? 'bg-indigo-50/80 border-indigo-500 shadow-xs'
                                    : 'bg-slate-50/60 border-slate-200 hover:border-indigo-300'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold transition-all ${
                                    isSelected ? 'bg-indigo-600 text-white' : 'border border-slate-300 bg-white'
                                  }`}>
                                    {isSelected && '✓'}
                                  </div>
                                  <div>
                                    <p className="font-extrabold text-slate-900 text-xs">{mat.name}</p>
                                    <span className="text-[10px] font-mono text-indigo-600 font-bold">{mat.code}</span>
                                  </div>
                                </div>
                                <span className="px-2 py-0.5 bg-white text-slate-600 rounded text-[10px] font-bold border border-slate-200 uppercase">
                                  {mat.category ? mat.category.replace('_', ' ') : 'Raw Material'}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Configure Delivery & Supply per Selected Material */}
                        {(formData.materialsSupplied && formData.materialsSupplied.length > 0) && (
                          <div className="space-y-3 pt-3 border-t border-slate-200">
                            <h5 className="font-extrabold text-slate-800 text-xs flex items-center gap-2">
                              <Clock className="w-4 h-4 text-indigo-600" /> Material Delivery Period & Supply Capacities
                            </h5>
                            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                              {formData.materialsSupplied.map((item, idx) => {
                                const matId = typeof item.material === 'object' ? item.material?._id : item.material;
                                const matObj = allMaterials.find(m => m._id === matId) || {};
                                const matName = item.materialName || matObj.name || 'Material';

                                return (
                                  <div key={idx} className="p-3 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-1 md:grid-cols-7 gap-3 items-center">
                                    <div className="md:col-span-2">
                                      <p className="font-extrabold text-slate-900 text-xs">{matName}</p>
                                      <span className="text-[10px] font-mono text-indigo-600 font-bold">{matObj.code || 'MAT'}</span>
                                    </div>
                                    <div className="md:col-span-2">
                                      <label className="block text-[10px] font-bold text-slate-600 mb-1">Fastest Delivery (Days)</label>
                                      <input
                                        type="number"
                                        min="0"
                                        value={item.fastestDeliveryPeriod ?? 0}
                                        onChange={(e) => {
                                          const updated = [...formData.materialsSupplied];
                                          updated[idx] = { ...updated[idx], fastestDeliveryPeriod: Number(e.target.value) };
                                          setFormData({ ...formData, materialsSupplied: updated });
                                        }}
                                        className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-indigo-600"
                                      />
                                    </div>
                                    <div className="md:col-span-2">
                                      <label className="block text-[10px] font-bold text-slate-600 mb-1">Max Supply Capacity</label>
                                      <input
                                        type="number"
                                        min="0"
                                        value={item.maxStockSupply ?? 0}
                                        onChange={(e) => {
                                          const updated = [...formData.materialsSupplied];
                                          updated[idx] = { ...updated[idx], maxStockSupply: Number(e.target.value) };
                                          setFormData({ ...formData, materialsSupplied: updated });
                                        }}
                                        className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-emerald-600"
                                      />
                                    </div>
                                    <div className="md:col-span-1 flex justify-end pt-3 md:pt-0">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updated = formData.materialsSupplied.filter((_, i) => i !== idx);
                                          setFormData({ ...formData, materialsSupplied: updated });
                                        }}
                                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                                        title="Remove Material"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Footer Buttons */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => handleSaveSection(formTab)}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 font-extrabold text-slate-700 rounded-2xl transition-all"
                  >
                    Save Draft Section
                  </button>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="px-4 py-2.5 border border-slate-200 font-bold text-slate-600 rounded-2xl hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-5 py-2.5 rounded-2xl transition-all shadow-lg shadow-indigo-600/20"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Save Vendor Master
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* VIEW DETAILS MODAL */}
      <AnimatePresence>
        {viewVendor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-5xl w-full my-8 overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header (Same UI as Add/Edit Vendor Modal) */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-600 font-mono text-[10px] font-extrabold rounded-md border border-indigo-100">
                        {viewVendor.vendorCode}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${viewVendor.status === 'Active' || viewVendor.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                        }`}>
                        {viewVendor.status || 'Active'}
                      </span>
                    </div>
                    <h3 className="font-extrabold text-slate-900 text-base">
                      {viewVendor.vendorName || viewVendor.companyName}
                    </h3>
                    <p className="text-xs font-semibold text-slate-500">{viewVendor.industry || 'General Industry'}</p>
                  </div>
                </div>
                <button onClick={() => setViewVendor(null)} className="text-slate-400 hover:text-slate-600 p-2 rounded-xl">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Navigation Tabs (Same UI as Add/Edit Vendor Modal) */}
              <div className="flex border-b border-slate-200 bg-slate-50/50 px-6 gap-1 overflow-x-auto text-xs font-extrabold scrollbar-none">
                {[
                  { id: 'basic', label: '1. Basic Info', icon: Building2 },
                  { id: 'address', label: '2. Address', icon: MapPin },
                  { id: 'contacts', label: '3. Contacts', icon: Users },
                  { id: 'financialBank', label: '4. Financial & Bank', icon: CreditCard },
                  { id: 'documents', label: '5. Documents', icon: FileText },
                  { id: 'materials', label: '6. Materials Supplied', icon: Layers },
                ].map(t => {
                  const IconComponent = t.icon;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setViewTab(t.id)}
                      className={`flex items-center gap-2 px-4 py-3.5 border-b-2 transition-all whitespace-nowrap ${viewTab === t.id
                        ? 'border-indigo-600 text-indigo-600 bg-white font-extrabold'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                      <IconComponent className="w-4 h-4" />
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {/* View Tab Body */}
              <div className="p-6 overflow-y-auto flex-1 text-xs font-semibold space-y-4 text-slate-700">
                {viewTab === 'basic' && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div><span className="text-slate-400 font-bold block">Vendor Name:</span> {viewVendor.vendorName || viewVendor.companyName || '—'}</div>
                    <div><span className="text-slate-400 font-bold block">Vendor Code:</span> <span className="font-mono text-indigo-600 font-extrabold">{viewVendor.vendorCode}</span></div>
                    <div><span className="text-slate-400 font-bold block">Industry:</span> {viewVendor.industry || '—'}</div>
                    <div><span className="text-slate-400 font-bold block">Delivery Period:</span> {viewVendor.deliveryPeriod || viewVendor.creditPeriod || 0} Days</div>
                    <div><span className="text-slate-400 font-bold block">Date of Incorporation:</span> {viewVendor.dateOfIncorporation ? viewVendor.dateOfIncorporation.split('T')[0] : (viewVendor.financialInfo?.dateOfIncorporation ? viewVendor.financialInfo.dateOfIncorporation.split('T')[0] : '—')}</div>
                    <div className="col-span-2"><span className="text-slate-400 font-bold block">Description:</span> {viewVendor.description || viewVendor.remarks || viewVendor.notes || '—'}</div>
                  </div>
                )}

                {viewTab === 'address' && (
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-extrabold text-slate-800 text-xs mb-1">Registered Address:</h4>
                      <p className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                        {viewVendor.registeredOffice?.addressLine1 || viewVendor.address || 'N/A'}<br />
                        {viewVendor.registeredOffice?.addressLine2 ? `${viewVendor.registeredOffice.addressLine2}\n` : ''}
                        {viewVendor.registeredOffice?.city} {viewVendor.registeredOffice?.state} {viewVendor.registeredOffice?.pincode}
                      </p>
                    </div>
                  </div>
                )}

                {viewTab === 'contacts' && (
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-extrabold text-slate-800 text-xs mb-1">Primary Contact:</h4>
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 grid grid-cols-2 gap-3">
                        <div>Name: {viewVendor.primaryContact?.contactPerson || viewVendor.contactPerson || '—'}</div>
                        <div>Designation: {viewVendor.primaryContact?.designation || '—'}</div>
                        <div>Mobile: {viewVendor.primaryContact?.mobileNumber || viewVendor.mobile || '—'}</div>
                        <div>Email: {viewVendor.primaryContact?.email || viewVendor.email || '—'}</div>
                      </div>
                    </div>

                    {(() => {
                      const pur = extractSingleContact(viewVendor.departmentContacts?.purchase);
                      const acc = extractSingleContact(viewVendor.departmentContacts?.accounts);
                      if (!pur.name && !acc.name) return null;

                      return (
                        <div>
                          <h4 className="font-extrabold text-slate-800 text-xs mb-1">Department Contacts:</h4>
                          <div className="grid grid-cols-2 gap-3">
                            {pur.name && (
                              <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
                                <div className="font-bold text-indigo-900 mb-1">Purchase Department</div>
                                <div className="text-[11px] space-y-0.5">
                                  <div className="font-bold text-slate-800">{pur.name} ({pur.designation || 'Executive'})</div>
                                  <div className="text-slate-500">Mobile: {pur.mobile || '—'} | Email: {pur.email || '—'}</div>
                                </div>
                              </div>
                            )}
                            {acc.name && (
                              <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
                                <div className="font-bold text-indigo-900 mb-1">Accounts Department</div>
                                <div className="text-[11px] space-y-0.5">
                                  <div className="font-bold text-slate-800">{acc.name} ({acc.designation || 'Executive'})</div>
                                  <div className="text-slate-500">Mobile: {acc.mobile || '—'} | Email: {acc.email || '—'}</div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {viewTab === 'financialBank' && (
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-extrabold text-slate-800 text-xs mb-2">Financial Details</h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                        <div><span className="text-slate-400 font-bold block">GSTIN / Tax ID:</span> <span className="font-mono font-extrabold text-slate-900">{viewVendor.financialInfo?.gstNumber || viewVendor.gstin || '—'}</span></div>
                        <div><span className="text-slate-400 font-bold block">PAN Number:</span> <span className="font-mono font-extrabold text-slate-900">{viewVendor.financialInfo?.panNumber || '—'}</span></div>
                        <div><span className="text-slate-400 font-bold block">MSME Number:</span> {viewVendor.financialInfo?.msmeNumber || '—'}</div>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-extrabold text-slate-800 text-xs mb-2">Bank Details</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                        <div><span className="text-slate-400 font-bold block">Bank Name:</span> {viewVendor.bankDetails?.bankName || '—'}</div>
                        <div><span className="text-slate-400 font-bold block">Account Number:</span> <span className="font-mono font-extrabold text-slate-900">{viewVendor.bankDetails?.accountNumber || '—'}</span></div>
                        <div><span className="text-slate-400 font-bold block">IFSC Code:</span> <span className="font-mono font-extrabold text-slate-900">{viewVendor.bankDetails?.ifscCode || '—'}</span></div>
                        <div><span className="text-slate-400 font-bold block">Account Type:</span> {viewVendor.bankDetails?.accountType || 'Current'}</div>
                      </div>
                    </div>
                  </div>
                )}

                {viewTab === 'documents' && (
                  <div className="space-y-2">
                    {viewVendor.documents?.length ? viewVendor.documents.map((d, i) => (
                      <div key={i} className="flex justify-between items-center bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                        <div>
                          <div className="font-bold text-slate-800">{d.docType}</div>
                          <div className="text-[10px] text-slate-400">{d.docName || 'Uploaded Document'}</div>
                        </div>
                        {d.fileUrl && (
                          <a href={d.fileUrl} target="_blank" rel="noreferrer" className="text-indigo-600 font-extrabold hover:underline">
                            View File
                          </a>
                        )}
                      </div>
                    )) : <p className="text-slate-400">No documents uploaded.</p>}
                  </div>
                )}

                {viewTab === 'materials' && (
                  <div className="space-y-3">
                    <h4 className="font-extrabold text-slate-800 text-xs flex items-center gap-2">
                      <Layers className="w-4 h-4 text-indigo-600" /> Raw Materials & Components Supplied by Vendor
                    </h4>
                    {viewVendor.materialsSupplied?.length ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {viewVendor.materialsSupplied.map((mItem, idx) => {
                          let matId = null;
                          let matObj = {};
                          let matName = 'Material';
                          let matCode = 'MAT';
                          let matCategory = 'Raw Material';
                          let fastestDelivery = mItem?.fastestDeliveryPeriod || viewVendor.deliveryPeriod || 0;
                          let maxSupply = mItem?.maxStockSupply || 0;

                          if (typeof mItem === 'object' && mItem !== null) {
                            if (mItem.material) {
                              matId = typeof mItem.material === 'object' ? mItem.material._id : mItem.material;
                              matObj = typeof mItem.material === 'object' ? mItem.material : (allMaterials.find(m => m._id === matId) || {});
                              matName = mItem.materialName || matObj.name || 'Material';
                            } else {
                              matId = mItem._id;
                              matObj = mItem;
                              matName = mItem.name || 'Material';
                            }
                          } else if (typeof mItem === 'string') {
                            matId = mItem;
                            matObj = allMaterials.find(m => m._id === matId) || {};
                            matName = matObj.name || 'Material';
                          }

                          matCode = matObj.code || 'MAT';
                          matCategory = matObj.category || 'Raw Material';
                          const uom = matObj.uom || 'Units';

                          return (
                            <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-extrabold text-slate-900 text-xs">{matName}</p>
                                  <span className="text-[10px] font-mono text-indigo-600 font-bold">{matCode}</span>
                                </div>
                                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px] font-bold border border-indigo-100 uppercase">
                                  {matCategory.replace('_', ' ')}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 text-[11px] font-semibold text-slate-600">
                                <div className="bg-white p-2 rounded-xl border border-slate-100">
                                  <span className="text-[9px] text-slate-400 font-bold block">Fastest Delivery</span>
                                  <span className="text-indigo-600 font-extrabold">{fastestDelivery} Days</span>
                                </div>
                                <div className="bg-white p-2 rounded-xl border border-slate-100">
                                  <span className="text-[9px] text-slate-400 font-bold block">Max Supply Capacity</span>
                                  <span className="text-emerald-600 font-extrabold">{maxSupply ? `${maxSupply} ${uom}` : '—'}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-slate-400 text-xs">No raw materials linked for this vendor.</p>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Small Box Modal */}
      <AnimatePresence>
        {deleteConfirm.show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99999] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full border border-slate-100 shadow-2xl space-y-4 text-center"
            >
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 mx-auto flex items-center justify-center border border-rose-100">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Delete Vendor?</h3>
                <p className="text-xs font-semibold text-slate-500 mt-1">
                  Are you sure you want to delete this vendor? This action cannot be undone.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirm({ show: false, id: null })}
                  className="px-4 py-2.5 border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all flex-1"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-extrabold shadow-lg shadow-rose-600/20 transition-all flex-1"
                >
                  Confirm Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Vendors;
