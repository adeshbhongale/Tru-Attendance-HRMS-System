import { AnimatePresence, motion } from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Building2,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit2,
  FileText,
  Image as ImageIcon,
  Layers,
  Loader2,
  Mail,
  MapPin,
  Package,
  Phone,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
  UserCheck,
  Users,
  Wrench,
  X
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const exportDropdownRef = useRef(null);

  // Search and Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterIndustry, setFilterIndustry] = useState('All');

  // Enterprise View Customer Details Modal State (Centered & Extra Large)
  const [viewCustomer, setViewCustomer] = useState(null);
  const [viewTab, setViewTab] = useState('basic'); // basic, address, contacts, financial, documents, bank, production

  // Form Modal (Create / Edit) (Centered & Extra Large)
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formTab, setFormTab] = useState('basic'); // basic, address, contacts, financial, documents, bank, production
  const [saving, setSaving] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState({ show: false, id: null });

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Product Master catalog for picker
  const [productMasterList, setProductMasterList] = useState([]);
  const [productPickerOpen, setProductPickerOpen] = useState({ open: false, secIdx: null, subIdx: null, search: '' });

  // Clean Initial Dynamic Form State (No hardcoded values)
  const [formData, setFormData] = useState({
    customerName: '',
    customerCode: '',
    industry: '',
    email: '',
    phone: '',
    remarks: '',

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
      email: '',
      landline: '',
      extension: '',
      whatsApp: ''
    },

    departmentContacts: {
      purchase: [],
      accounts: [],
      production: [],
      maintenance: []
    },

    financialInfo: {
      panNumber: '',
      gstNumber: '',
      dateOfIncorporation: '',
      msmeNumber: '',
      msmeStatus: 'Micro'
    },

    documents: [
      { docType: 'GST Certificate', docName: '', fileUrl: '', issueDate: '', expiryDate: '', version: '1.0' },
      { docType: 'MSME Certificate', docName: '', fileUrl: '', issueDate: '', expiryDate: '', version: '1.0' },
      { docType: 'PAN Card', docName: '', fileUrl: '', issueDate: '', expiryDate: '', version: '1.0' }
    ],

    bankDetails: {
      bankName: '',
      accountNumber: '',
      ifscCode: '',
      branchName: '',
      accountType: 'Current'
    },

    productionSections: [],
    isActive: true
  });

  useEffect(() => {
    fetchCustomers();
    fetchProductMaster();
  }, []);

  // Fetch Product Master catalog for picker
  const fetchProductMaster = async () => {
    try {
      const res = await api.get('/products?limit=1000');
      setProductMasterList(res.data.data || []);
    } catch (err) {
      // Silent fail - product picker will just be empty
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

  // 100% Dynamic Data Retrieval from MongoDB Backend
  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/customers?limit=1000');
      const data = res.data.data || [];
      setCustomers(data);
    } catch (err) {
      toast.error('Failed to load customer directory');
    } finally {
      setLoading(false);
    }
  };

  // Filter & Search Logic
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      if (filterIndustry !== 'All' && !(c.industry || '').toLowerCase().includes(filterIndustry.toLowerCase())) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = (c.customerName || '').toLowerCase().includes(q);
        const matchesCode = (c.customerCode || '').toLowerCase().includes(q);
        const matchesContact = (c.contactPerson || c.primaryContact?.contactPerson || '').toLowerCase().includes(q);
        const matchesPhone = (c.mobile || c.phone || c.primaryContact?.mobileNumber || '').toLowerCase().includes(q);
        const matchesGst = (c.financialInfo?.gstNumber || '').toLowerCase().includes(q);
        const matchesPan = (c.financialInfo?.panNumber || '').toLowerCase().includes(q);
        const matchesCity = (c.registeredOffice?.city || '').toLowerCase().includes(q);

        let matchesProduct = false;
        if (c.productionSections) {
          c.productionSections.forEach(sec => {
            if ((sec.sectionName || '').toLowerCase().includes(q)) matchesProduct = true;
            (sec.subSections || []).forEach(sub => {
              if ((sub.subSectionName || '').toLowerCase().includes(q)) matchesProduct = true;
              (sub.installedProducts || []).forEach(prod => {
                if (
                  (prod.productName || '').toLowerCase().includes(q) ||
                  (prod.machineSerialNo || '').toLowerCase().includes(q) ||
                  (prod.barcode || '').toLowerCase().includes(q) ||
                  (prod.modelNumber || '').toLowerCase().includes(q)
                ) {
                  matchesProduct = true;
                }
              });
            });
          });
        }

        return matchesName || matchesCode || matchesContact || matchesPhone || matchesGst || matchesPan || matchesCity || matchesProduct;
      }

      return true;
    });
  }, [customers, searchQuery, filterIndustry]);

  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage) || 1;
  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredCustomers.slice(start, start + itemsPerPage);
  }, [filteredCustomers, currentPage]);

  // Open Add/Edit Modal
  const handleOpenModal = (cust = null, e = null) => {
    if (e) e.stopPropagation();
    setFormTab('basic');
    if (cust) {
      setEditingCustomer(cust);
      setFormData({
        customerName: cust.customerName || '',
        customerCode: cust.customerCode || `CUST-${Math.floor(10000 + Math.random() * 90000)}`,
        industry: cust.industry || '',
        email: cust.email || '',
        phone: cust.phone || '',
        remarks: cust.remarks || '',

        registeredOffice: {
          addressLine1: cust.registeredOffice?.addressLine1 || '',
          addressLine2: cust.registeredOffice?.addressLine2 || '',
          area: cust.registeredOffice?.area || '',
          city: cust.registeredOffice?.city || '',
          district: cust.registeredOffice?.district || '',
          state: cust.registeredOffice?.state || '',
          country: cust.registeredOffice?.country || 'India',
          pincode: cust.registeredOffice?.pincode || ''
        },

        primaryContact: {
          contactPerson: cust.primaryContact?.contactPerson || cust.contactPerson || '',
          designation: cust.primaryContact?.designation || '',
          mobileNumber: cust.primaryContact?.mobileNumber || cust.mobile || '',
          email: cust.primaryContact?.email || cust.email || '',
          landline: cust.primaryContact?.landline || '',
          extension: cust.primaryContact?.extension || '',
          whatsApp: cust.primaryContact?.whatsApp || ''
        },

        departmentContacts: {
          purchase: cust.departmentContacts?.purchase?.length ? cust.departmentContacts.purchase : [{ name: '', designation: '', mobile: '', email: '' }],
          accounts: cust.departmentContacts?.accounts?.length ? cust.departmentContacts.accounts : [{ name: '', designation: '', mobile: '', email: '' }],
          production: cust.departmentContacts?.production?.length ? cust.departmentContacts.production : [{ name: '', designation: '', mobile: '', email: '' }],
          maintenance: cust.departmentContacts?.maintenance?.length ? cust.departmentContacts.maintenance : [{ name: '', designation: '', mobile: '', email: '' }]
        },

        financialInfo: {
          panNumber: cust.financialInfo?.panNumber || '',
          gstNumber: cust.financialInfo?.gstNumber || '',
          dateOfIncorporation: cust.financialInfo?.dateOfIncorporation ? cust.financialInfo.dateOfIncorporation.split('T')[0] : '',
          msmeNumber: cust.financialInfo?.msmeNumber || '',
          msmeStatus: cust.financialInfo?.msmeStatus || 'Micro'
        },

        documents: cust.documents?.length ? cust.documents : [
          { docType: 'GST Certificate', docName: '', fileUrl: '', issueDate: '', expiryDate: '', version: '1.0' },
          { docType: 'MSME Certificate', docName: '', fileUrl: '', issueDate: '', expiryDate: '', version: '1.0' },
          { docType: 'PAN Card', docName: '', fileUrl: '', issueDate: '', expiryDate: '', version: '1.0' }
        ],

        bankDetails: {
          bankName: cust.bankDetails?.bankName || '',
          accountNumber: cust.bankDetails?.accountNumber || '',
          ifscCode: cust.bankDetails?.ifscCode || '',
          branchName: cust.bankDetails?.branchName || '',
          accountType: cust.bankDetails?.accountType || 'Current'
        },

        productionSections: cust.productionSections || [],
        isActive: cust.isActive ?? true
      });
    } else {
      setEditingCustomer(null);
      setFormData({
        customerName: '',
        customerCode: 'CUST-' + Math.floor(10000 + Math.random() * 90000),
        industry: '',
        email: '',
        phone: '',
        remarks: '',

        registeredOffice: { addressLine1: '', addressLine2: '', area: '', city: '', district: '', state: '', country: 'India', pincode: '' },
        primaryContact: { contactPerson: '', designation: '', mobileNumber: '', email: '', landline: '', extension: '', whatsApp: '' },
        departmentContacts: {
          purchase: [{ name: '', designation: '', mobile: '', email: '' }],
          accounts: [{ name: '', designation: '', mobile: '', email: '' }],
          production: [{ name: '', designation: '', mobile: '', email: '' }],
          maintenance: [{ name: '', designation: '', mobile: '', email: '' }]
        },
        financialInfo: { panNumber: '', gstNumber: '', dateOfIncorporation: '', msmeNumber: '', msmeStatus: 'Micro' },
        documents: [
          { docType: 'GST Certificate', docName: '', fileUrl: '', issueDate: '', expiryDate: '', version: '1.0' },
          { docType: 'MSME Certificate', docName: '', fileUrl: '', issueDate: '', expiryDate: '', version: '1.0' },
          { docType: 'PAN Card', docName: '', fileUrl: '', issueDate: '', expiryDate: '', version: '1.0' }
        ],
        bankDetails: { bankName: '', accountNumber: '', ifscCode: '', branchName: '', accountType: 'Current' },
        productionSections: [],
        isActive: true
      });
    }
    setShowModal(true);
  };

  // Save Section Progress Handler
  const handleSaveSection = (tabName) => {
    if (tabName === 'basic' && !formData.customerName.trim()) {
      toast.error('Please enter Company Name before saving');
      return;
    }
    const labelMap = {
      basic: 'Basic Info',
      address: 'Company Address',
      contacts: 'All Contacts & Departments',
      financial: 'Financial & Bank Details',
      documents: 'Document Uploads',
      production: 'Production Sections & Equipment'
    };
    toast.success(`✓ ${labelMap[tabName] || 'Section'} saved to draft!`);
  };

  // Cloudinary File Upload Handler for Documents
  const handleDocumentFileUpload = async (docIndex, file) => {
    if (!file) return;

    try {
      setUploadingDoc(prev => ({ ...prev, [docIndex]: true }));
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = async () => {
        const base64Data = reader.result;
        const res = await api.post('/customers/upload-document', {
          file: base64Data,
          docType: formData.documents[docIndex].docType
        });

        if (res.data.success && res.data.url) {
          toast.success(`${formData.documents[docIndex].docType} uploaded to Cloudinary!`);
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
      toast.error('Cloudinary document upload failed');
      setUploadingDoc(prev => ({ ...prev, [docIndex]: false }));
    }
  };

  // Submit Save Whole Customer Info
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.customerName.trim()) {
      toast.error('Company Name is required');
      return;
    }

    try {
      setSaving(true);
      if (editingCustomer) {
        await api.put(`/customers/${editingCustomer._id}`, formData);
        toast.success('Customer updated successfully');
      } else {
        await api.post('/customers', formData);
        toast.success('Customer created successfully');
      }
      setShowModal(false);
      fetchCustomers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save customer');
    } finally {
      setSaving(false);
    }
  };

  // Delete Handler
  const handleDelete = async (e = null) => {
    if (e) e.stopPropagation();
    try {
      setSaving(true);
      await api.delete(`/customers/${deleteConfirm.id}`);
      toast.success('Customer deleted successfully');
      setDeleteConfirm({ show: false, id: null });
      fetchCustomers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete customer');
    } finally {
      setSaving(false);
    }
  };

  // Department Contact Helper Methods
  const addDeptContact = (deptKey) => {
    setFormData(prev => ({
      ...prev,
      departmentContacts: {
        ...prev.departmentContacts,
        [deptKey]: [...(prev.departmentContacts[deptKey] || []), { name: '', designation: '', mobile: '', email: '' }]
      }
    }));
  };

  const removeDeptContact = (deptKey, index) => {
    setFormData(prev => ({
      ...prev,
      departmentContacts: {
        ...prev.departmentContacts,
        [deptKey]: prev.departmentContacts[deptKey].filter((_, idx) => idx !== index)
      }
    }));
  };

  const updateDeptContact = (deptKey, index, field, value) => {
    setFormData(prev => {
      const updatedList = [...(prev.departmentContacts[deptKey] || [])];
      updatedList[index] = { ...updatedList[index], [field]: value };
      return {
        ...prev,
        departmentContacts: {
          ...prev.departmentContacts,
          [deptKey]: updatedList
        }
      };
    });
  };

  // Production Section Helper Methods
  const addProductionSection = () => {
    setFormData(prev => ({
      ...prev,
      productionSections: [
        ...prev.productionSections,
        { sectionName: '', description: '', manager: '', location: '', subSections: [] }
      ]
    }));
  };

  const removeProductionSection = (secIdx) => {
    setFormData(prev => ({
      ...prev,
      productionSections: prev.productionSections.filter((_, idx) => idx !== secIdx)
    }));
  };

  const updateProductionSection = (secIdx, field, value) => {
    setFormData(prev => {
      const updatedSecs = [...prev.productionSections];
      updatedSecs[secIdx] = { ...updatedSecs[secIdx], [field]: value };
      return { ...prev, productionSections: updatedSecs };
    });
  };

  // Sub-Section Helpers
  const addSubSection = (secIdx) => {
    setFormData(prev => {
      const secs = [...prev.productionSections];
      secs[secIdx] = {
        ...secs[secIdx],
        subSections: [...(secs[secIdx].subSections || []), { subSectionName: '', description: '', installedProducts: [] }]
      };
      return { ...prev, productionSections: secs };
    });
  };

  const removeSubSection = (secIdx, subIdx) => {
    setFormData(prev => {
      const secs = [...prev.productionSections];
      secs[secIdx] = {
        ...secs[secIdx],
        subSections: secs[secIdx].subSections.filter((_, i) => i !== subIdx)
      };
      return { ...prev, productionSections: secs };
    });
  };

  const updateSubSection = (secIdx, subIdx, field, value) => {
    setFormData(prev => {
      const secs = [...prev.productionSections];
      const subs = [...(secs[secIdx].subSections || [])];
      subs[subIdx] = { ...subs[subIdx], [field]: value };
      secs[secIdx] = { ...secs[secIdx], subSections: subs };
      return { ...prev, productionSections: secs };
    });
  };

  // Installed Product Helpers — open picker instead of blank row
  const openProductPicker = (secIdx, subIdx) => {
    setProductPickerOpen({ open: true, secIdx, subIdx, search: '' });
  };

  const selectProductFromMaster = (masterProduct) => {
    const { secIdx, subIdx } = productPickerOpen;
    setFormData(prev => {
      const secs = [...prev.productionSections];
      const subs = [...(secs[secIdx].subSections || [])];
      subs[subIdx] = {
        ...subs[subIdx],
        installedProducts: [
          ...(subs[subIdx].installedProducts || []),
          {
            productId: masterProduct.sku || masterProduct._id || '',
            productName: masterProduct.name || '',
            productDescription: masterProduct.description || '',
            productImage: masterProduct.imageUrl || '',
            modelNumber: '',
            productCode: masterProduct.sku || '',
            machineSerialNo: '',
            barcode: '',
            qrCode: '',
            brand: masterProduct.category || '',
            installationDate: '',
            warrantyExpiry: '',
            amcExpiry: '',
            currentStatus: 'Running',
            engineerAssigned: ''
          }
        ]
      };
      secs[secIdx] = { ...secs[secIdx], subSections: subs };
      return { ...prev, productionSections: secs };
    });
    setProductPickerOpen({ open: false, secIdx: null, subIdx: null, search: '' });
    toast.success(`Added "${masterProduct.name}" from Product Master`);
  };

  // Manual add (fallback)
  const addInstalledProduct = (secIdx, subIdx) => {
    setFormData(prev => {
      const secs = [...prev.productionSections];
      const subs = [...(secs[secIdx].subSections || [])];
      subs[subIdx] = {
        ...subs[subIdx],
        installedProducts: [
          ...(subs[subIdx].installedProducts || []),
          { productId: '', productName: '', productDescription: '', productImage: '', modelNumber: '', productCode: '', machineSerialNo: '', barcode: '', qrCode: '', brand: '', installationDate: '', warrantyExpiry: '', amcExpiry: '', currentStatus: 'Running', engineerAssigned: '' }
        ]
      };
      secs[secIdx] = { ...secs[secIdx], subSections: subs };
      return { ...prev, productionSections: secs };
    });
  };

  const removeInstalledProduct = (secIdx, subIdx, prodIdx) => {
    setFormData(prev => {
      const secs = [...prev.productionSections];
      const subs = [...(secs[secIdx].subSections || [])];
      subs[subIdx] = {
        ...subs[subIdx],
        installedProducts: subs[subIdx].installedProducts.filter((_, i) => i !== prodIdx)
      };
      secs[secIdx] = { ...secs[secIdx], subSections: subs };
      return { ...prev, productionSections: secs };
    });
  };

  const updateInstalledProduct = (secIdx, subIdx, prodIdx, field, value) => {
    setFormData(prev => {
      const secs = [...prev.productionSections];
      const subs = [...(secs[secIdx].subSections || [])];
      const prods = [...(subs[subIdx].installedProducts || [])];
      prods[prodIdx] = { ...prods[prodIdx], [field]: value };
      subs[subIdx] = { ...subs[subIdx], installedProducts: prods };
      secs[secIdx] = { ...secs[secIdx], subSections: subs };
      return { ...prev, productionSections: secs };
    });
  };

  // PDF Export Function
  const exportToPDF = () => {
    if (filteredCustomers.length === 0) {
      toast.error('No data to export');
      return;
    }

    const doc = new jsPDF('l', 'mm', 'a4');
    doc.setFontSize(18);
    doc.setTextColor(25, 114, 233);
    doc.text('Customer Directory Master', 14, 18);

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated on: ${new Date().toLocaleString()} • Total Records: ${filteredCustomers.length}`, 14, 25);

    const headers = [["Unique Code", "Company Name", "Industry", "Primary Contact", "Phone / Email", "GST Number", "City / State"]];
    const data = filteredCustomers.map(c => [
      c.customerCode || '—',
      c.customerName || '—',
      c.industry || '—',
      c.primaryContact?.contactPerson || c.contactPerson || '—',
      `${c.primaryContact?.mobileNumber || c.mobile || '—'} / ${c.primaryContact?.email || c.email || '—'}`,
      c.financialInfo?.gstNumber || '—',
      `${c.registeredOffice?.city || '—'}, ${c.registeredOffice?.state || '—'}`
    ]);

    autoTable(doc, {
      head: headers,
      body: data,
      startY: 30,
      theme: 'grid',
      headStyles: { fillColor: [25, 114, 233], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7, textColor: [51, 65, 85] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    doc.save(`customer_master_${Date.now()}.pdf`);
  };

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100">
              <Building2 className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Customer Master</h1>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">
                Dynamic Enterprise Customer Directory with Unique Codes, Department Contacts & Cloudinary Document Repository
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Export Dropdown */}
          <div className="relative" ref={exportDropdownRef}>
            <button
              onClick={() => setShowExportDropdown(!showExportDropdown)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 font-bold text-xs rounded-2xl transition-all shadow-sm"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>Export Report</span>
            </button>
            {showExportDropdown && (
              <div className="absolute right-0 mt-2 w-44 bg-white border border-slate-100 rounded-2xl shadow-xl z-30 py-2">
                <button
                  onClick={() => { setShowExportDropdown(false); exportToPDF(); }}
                  className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 flex items-center gap-2"
                >
                  <FileText className="w-4 h-4 text-red-500" /> Export as PDF
                </button>
              </div>
            )}
          </div>

          {/* Add Customer Button */}
          <button
            onClick={() => handleOpenModal(null)}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-2xl transition-all shadow-lg shadow-indigo-600/20"
          >
            <Plus className="w-4 h-4" />
            Add New Customer
          </button>
        </div>
      </div>

      {/* Dynamic Summary Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-2xl">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Total Customers</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">{customers.length}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="p-3.5 bg-cyan-50 text-cyan-600 rounded-2xl">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Production Sections</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">
              {customers.reduce((acc, c) => acc + (c.productionSections?.length || 0), 0)}
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="p-3.5 bg-purple-50 text-purple-600 rounded-2xl">
            <Wrench className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Installed Machines</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">
              {customers.reduce((acc, c) => {
                let cnt = 0;
                (c.productionSections || []).forEach(sec => {
                  (sec.subSections || []).forEach(sub => {
                    cnt += sub.installedProducts?.length || 0;
                  });
                });
                return acc + cnt;
              }, 0)}
            </p>
          </div>
        </div>
      </div>

      {/* Search Bar Toolbar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm flex items-center justify-between gap-4">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Unique Customer Code, Company Name, Contact Person, Phone, GST, PAN, City, Machine Serial..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>
      </div>

      {/* Main Customers Directory Table (100% Dynamic) */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />
            <p className="text-xs font-bold text-slate-400 mt-2">Loading Customer Directory...</p>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <Building2 className="w-12 h-12 text-slate-300 mx-auto" />
            <p className="text-base font-extrabold text-slate-700">No Customers Found</p>
            <p className="text-xs font-medium text-slate-400">Try adjusting your search query or add a new customer.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-4">Unique Code & Company</th>
                  <th className="px-6 py-4">Industry</th>
                  <th className="px-6 py-4">Primary Contact</th>
                  <th className="px-6 py-4">Tax / GSTIN</th>
                  <th className="px-6 py-4">Company Address</th>
                  <th className="px-6 py-4">Production Equipment</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                {paginatedCustomers.map((cust) => {
                  let totalProds = 0;
                  (cust.productionSections || []).forEach(sec => {
                    (sec.subSections || []).forEach(sub => {
                      totalProds += sub.installedProducts?.length || 0;
                    });
                  });

                  return (
                    <tr
                      key={cust._id}
                      onClick={() => { setViewCustomer(cust); setViewTab('basic'); }}
                      className="hover:bg-indigo-50/40 cursor-pointer transition-all"
                    >
                      {/* Customer Code & Name */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 font-extrabold flex items-center justify-center text-sm shrink-0">
                            {cust.customerName ? cust.customerName.charAt(0).toUpperCase() : 'C'}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono font-extrabold text-indigo-700 bg-indigo-100/70 px-2 py-0.5 rounded-md border border-indigo-200/50">
                                {cust.customerCode}
                              </span>
                            </div>
                            <p className="font-extrabold text-slate-900 text-sm mt-0.5 hover:text-indigo-600 transition-colors">{cust.customerName}</p>
                          </div>
                        </div>
                      </td>

                      {/* Industry */}
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-800">{cust.industry || 'General Industry'}</p>
                      </td>

                      {/* Primary Contact */}
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900">{cust.primaryContact?.contactPerson || cust.contactPerson || '—'}</p>
                        <p className="text-[11px] font-semibold text-slate-500">{cust.primaryContact?.mobileNumber || cust.mobile || '—'}</p>
                      </td>

                      {/* GST / PAN */}
                      <td className="px-6 py-4">
                        <p className="font-mono text-slate-800 font-bold">{cust.financialInfo?.gstNumber || '—'}</p>
                        <p className="text-[10px] font-mono text-slate-400">{cust.financialInfo?.panNumber || ''}</p>
                      </td>

                      {/* Address */}
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-800">{cust.registeredOffice?.city || '—'}</p>
                        <p className="text-[11px] font-semibold text-slate-400">{cust.registeredOffice?.state || '—'}</p>
                      </td>

                      {/* Production & Equipment Summary */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 bg-cyan-50 text-cyan-700 font-bold text-[10px] rounded-lg border border-cyan-100">
                            {cust.productionSections?.length || 0} Secs
                          </span>
                          <span className="px-2.5 py-1 bg-purple-50 text-purple-700 font-bold text-[10px] rounded-lg border border-purple-100">
                            {totalProds} Machines
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Edit */}
                          <button
                            onClick={(e) => handleOpenModal(cust, e)}
                            title="Edit Customer"
                            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ show: true, id: cust._id }); }}
                            title="Delete Customer"
                            className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {filteredCustomers.length > 0 && (
          <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-200/80 flex items-center justify-between text-xs font-semibold text-slate-500">
            <p>Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredCustomers.length)} of {filteredCustomers.length} records</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-2 bg-white border border-slate-200 rounded-xl disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span>Page {currentPage} of {totalPages}</span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="p-2 bg-white border border-slate-200 rounded-xl disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* VIEW CUSTOMER DETAILS CENTERED EXTRA-LARGE MODAL (Positioned to right of sidebar) */}
      <AnimatePresence>
        {viewCustomer && (
          <div className="fixed inset-0 lg:left-64 bg-slate-900/60 backdrop-blur-sm z-30 flex items-center justify-center p-4 lg:p-6">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-[96%] max-w-6xl bg-slate-50 max-h-[94vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200"
            >
              {/* Modal Top Header */}
              <div className="p-6 bg-indigo-600 text-white flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-2xl font-extrabold border border-white/20">
                    {viewCustomer.customerName ? viewCustomer.customerName.charAt(0).toUpperCase() : 'C'}
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-2xl font-black">{viewCustomer.customerName}</h2>
                      <span className="px-3 py-1 rounded-full text-xs font-mono font-extrabold bg-white/20 uppercase tracking-wider">
                        {viewCustomer.customerCode}
                      </span>
                    </div>
                    <p className="text-xs text-indigo-100 font-semibold mt-1">
                      {viewCustomer.industry || 'General Industry'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* EDIT BUTTON INSIDE VIEW BOX */}
                  <button
                    onClick={() => {
                      const custToEdit = viewCustomer;
                      setViewCustomer(null);
                      handleOpenModal(custToEdit);
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white/20 hover:bg-white/30 text-white font-bold text-xs rounded-xl transition-all mr-2 shadow-sm"
                  >
                    <Edit2 className="w-4 h-4" />
                    <span>Edit Customer</span>
                  </button>

                  <button onClick={() => setViewCustomer(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                    <X className="w-6 h-6 text-white" />
                  </button>
                </div>
              </div>

              {/* Navigation Tabs Bar */}
              <div className="bg-white border-b border-slate-200 px-6 flex items-center gap-2 overflow-x-auto">
                {[
                  { id: 'basic', label: '1. Basic Info' },
                  { id: 'address', label: '2. Company Address' },
                  { id: 'contacts', label: '3. Contacts (Primary & Depts)' },
                  { id: 'financial', label: '4. Financial & Bank' },
                  { id: 'documents', label: '5. Documents (Cloudinary)' },
                  { id: 'production', label: '6. Production Hierarchy' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setViewTab(tab.id)}
                    className={`px-5 py-4 text-xs font-extrabold tracking-wide border-b-2 transition-all whitespace-nowrap ${
                      viewTab === tab.id ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50' : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Content Section */}
              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                {/* 1. Basic Info Tab */}
                {viewTab === 'basic' && (
                  <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-sm space-y-6">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider border-b pb-3">Company Overview</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-xs font-semibold">
                      <div><p className="text-slate-400 font-bold mb-1">Unique Customer Code</p><p className="text-indigo-600 font-mono font-extrabold text-sm">{viewCustomer.customerCode}</p></div>
                      <div><p className="text-slate-400 font-bold mb-1">Company Name</p><p className="text-slate-800 font-extrabold text-sm">{viewCustomer.customerName}</p></div>
                      <div><p className="text-slate-400 font-bold mb-1">Industry</p><p className="text-slate-800 text-sm">{viewCustomer.industry || '—'}</p></div>
                      <div><p className="text-slate-400 font-bold mb-1">Company Email</p><p className="text-slate-800 text-sm">{viewCustomer.email || '—'}</p></div>
                      <div><p className="text-slate-400 font-bold mb-1">Company Phone</p><p className="text-slate-800 text-sm">{viewCustomer.phone || '—'}</p></div>
                    </div>
                    {viewCustomer.remarks && (
                      <div className="pt-2 border-t">
                        <p className="text-slate-400 font-bold text-xs">Remarks / Notes</p>
                        <p className="text-xs text-slate-700 mt-2 bg-slate-50 p-4 rounded-2xl leading-relaxed">{viewCustomer.remarks}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. Company Address Tab */}
                {viewTab === 'address' && (
                  <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider border-b pb-3">Company Address</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-semibold">
                      <div><p className="text-slate-400 font-bold mb-1">Address Line 1</p><p className="text-slate-800 text-sm">{viewCustomer.registeredOffice?.addressLine1 || '—'}</p></div>
                      <div><p className="text-slate-400 font-bold mb-1">Address Line 2</p><p className="text-slate-800 text-sm">{viewCustomer.registeredOffice?.addressLine2 || '—'}</p></div>
                      <div><p className="text-slate-400 font-bold mb-1">Area</p><p className="text-slate-800 text-sm">{viewCustomer.registeredOffice?.area || '—'}</p></div>
                      <div><p className="text-slate-400 font-bold mb-1">City</p><p className="text-slate-800 text-sm">{viewCustomer.registeredOffice?.city || '—'}</p></div>
                      <div><p className="text-slate-400 font-bold mb-1">District</p><p className="text-slate-800 text-sm">{viewCustomer.registeredOffice?.district || '—'}</p></div>
                      <div><p className="text-slate-400 font-bold mb-1">State</p><p className="text-slate-800 text-sm">{viewCustomer.registeredOffice?.state || '—'}</p></div>
                      <div><p className="text-slate-400 font-bold mb-1">Country</p><p className="text-slate-800 text-sm">{viewCustomer.registeredOffice?.country || 'India'}</p></div>
                      <div><p className="text-slate-400 font-bold mb-1">Pincode</p><p className="text-slate-800 text-sm">{viewCustomer.registeredOffice?.pincode || '—'}</p></div>
                    </div>
                  </div>
                )}

                {/* 3. Primary & Department Contacts Tab */}
                {viewTab === 'contacts' && (
                  <div className="space-y-6">
                    {/* Primary Contact Card at Top */}
                    <div className="bg-indigo-50/70 p-6 rounded-3xl border border-indigo-100 space-y-3 shadow-sm">
                      <div className="flex items-center gap-2 border-b border-indigo-200/60 pb-3">
                        <UserCheck className="w-5 h-5 text-indigo-600" />
                        <h3 className="text-sm font-black text-indigo-900 uppercase tracking-wider">Primary Contact (Key Liaison)</h3>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-semibold">
                        <div><p className="text-indigo-400 font-bold">Contact Person</p><p className="text-indigo-950 font-extrabold text-sm">{viewCustomer.primaryContact?.contactPerson || viewCustomer.contactPerson || '—'}</p></div>
                        <div><p className="text-indigo-400 font-bold">Designation</p><p className="text-indigo-900">{viewCustomer.primaryContact?.designation || '—'}</p></div>
                        <div><p className="text-indigo-400 font-bold">Mobile</p><p className="text-indigo-700 font-extrabold">{viewCustomer.primaryContact?.mobileNumber || viewCustomer.mobile || '—'}</p></div>
                        <div><p className="text-indigo-400 font-bold">Email</p><p className="text-indigo-900">{viewCustomer.primaryContact?.email || viewCustomer.email || '—'}</p></div>
                      </div>
                    </div>

                    {/* Department Contacts Cards */}
                    <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider border-b pb-3">Department Contact Lists</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {['purchase', 'accounts', 'production', 'maintenance'].map(deptKey => {
                          const list = viewCustomer.departmentContacts?.[deptKey] || [];
                          return (
                            <div key={deptKey} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                              <h4 className="text-xs font-extrabold text-indigo-600 uppercase tracking-wider">{deptKey} Department ({list.length})</h4>
                              {list.length === 0 ? (
                                <p className="text-[11px] text-slate-400 italic">No contacts listed.</p>
                              ) : (
                                list.map((c, i) => (
                                  <div key={i} className="bg-white p-3 rounded-xl border border-slate-100 text-xs space-y-1">
                                    <p className="font-extrabold text-slate-900">{c.name} <span className="text-[10px] font-normal text-slate-500">({c.designation})</span></p>
                                    <p className="text-[11px] text-slate-600">{c.mobile} | {c.email}</p>
                                  </div>
                                ))
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. Financial & Bank Details */}
                {viewTab === 'financial' && (
                  <div className="space-y-6">
                    <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider border-b pb-3">Tax & Financial Info</h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-xs font-semibold">
                        <div><p className="text-slate-400 font-bold mb-1">PAN Number</p><p className="font-mono text-slate-900 font-bold text-sm">{viewCustomer.financialInfo?.panNumber || '—'}</p></div>
                        <div><p className="text-slate-400 font-bold mb-1">GST Number</p><p className="font-mono text-indigo-600 font-bold text-sm">{viewCustomer.financialInfo?.gstNumber || '—'}</p></div>
                        <div><p className="text-slate-400 font-bold mb-1">MSME Number</p><p className="font-mono text-slate-800 text-sm">{viewCustomer.financialInfo?.msmeNumber || '—'}</p></div>
                        <div><p className="text-slate-400 font-bold mb-1">MSME Category</p><p className="text-slate-800 text-sm">{viewCustomer.financialInfo?.msmeStatus || 'Micro'}</p></div>
                      </div>
                    </div>

                    <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider border-b pb-3">Bank Details</h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-xs font-semibold">
                        <div><p className="text-slate-400 font-bold mb-1">Bank Name</p><p className="text-slate-900 font-extrabold text-sm">{viewCustomer.bankDetails?.bankName || '—'}</p></div>
                        <div><p className="text-slate-400 font-bold mb-1">Account Number</p><p className="font-mono text-slate-900 font-bold text-sm">{viewCustomer.bankDetails?.accountNumber || '—'}</p></div>
                        <div><p className="text-slate-400 font-bold mb-1">IFSC Code</p><p className="font-mono text-indigo-600 font-bold text-sm">{viewCustomer.bankDetails?.ifscCode || '—'}</p></div>
                        <div><p className="text-slate-400 font-bold mb-1">Branch</p><p className="text-slate-700 text-sm">{viewCustomer.bankDetails?.branchName || '—'}</p></div>
                        <div><p className="text-slate-400 font-bold mb-1">Account Type</p><p className="text-slate-700 text-sm">{viewCustomer.bankDetails?.accountType || 'Current'}</p></div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. Document Repository (Cloudinary) */}
                {viewTab === 'documents' && (
                  <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider border-b pb-3">Documents Repository (Cloudinary Storage)</h3>
                    {viewCustomer.documents?.length === 0 ? (
                      <p className="text-xs text-slate-400">No documents uploaded.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {viewCustomer.documents.map((doc, idx) => (
                          <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col justify-between space-y-3">
                            <div>
                              <span className="px-2.5 py-1 bg-indigo-600 text-white font-extrabold text-[10px] rounded-lg">
                                {doc.docType}
                              </span>
                              <p className="text-xs font-black text-slate-900 mt-2">{doc.docName || doc.docType}</p>
                              <p className="text-[10px] text-slate-400 mt-1">Uploaded: {doc.uploadedOn ? new Date(doc.uploadedOn).toLocaleDateString() : '—'}</p>
                            </div>
                            {doc.fileUrl ? (
                              <a
                                href={doc.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="w-full text-center py-2 bg-indigo-600 text-white font-bold text-xs rounded-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-1.5"
                              >
                                <Download className="w-3.5 h-3.5" /> View / Download Cloudinary URL
                              </a>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">No document file attached</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 6. Production & Equipment Hierarchy */}
                {viewTab === 'production' && (
                  <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-sm space-y-6">
                    <div className="flex items-center justify-between border-b pb-3">
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Production Hierarchy & Machine Mapping</h3>
                      <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3.5 py-1.5 rounded-full">
                        {viewCustomer.productionSections?.length || 0} Production Sections
                      </span>
                    </div>

                    {viewCustomer.productionSections?.length === 0 ? (
                      <div className="text-center py-10 text-slate-400 space-y-2">
                        <Wrench className="w-10 h-10 mx-auto text-slate-300" />
                        <p className="text-xs font-bold">No production sections mapped for this customer.</p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {viewCustomer.productionSections.map((sec, secIdx) => (
                          <div key={secIdx} className="border border-slate-200 rounded-3xl p-6 bg-slate-50/50 space-y-4">
                            {/* Section Header */}
                            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                              <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-600 text-white rounded-xl text-xs font-black">
                                  {secIdx + 1}
                                </div>
                                <div>
                                  <h4 className="text-base font-black text-slate-900">{sec.sectionName}</h4>
                                  <p className="text-xs font-semibold text-slate-500">Manager: {sec.manager || '—'} | Location: {sec.location || '—'}</p>
                                </div>
                              </div>
                            </div>

                            {/* Sub Sections Tree */}
                            <div className="space-y-4 pl-4 border-l-2 border-indigo-200">
                              {(sec.subSections || []).map((sub, subIdx) => (
                                <div key={subIdx} className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <h5 className="text-xs font-extrabold text-indigo-700 uppercase tracking-wider">
                                      ↳ Sub Section: {sub.subSectionName}
                                    </h5>
                                    <span className="text-[11px] font-bold text-slate-500">
                                      {sub.installedProducts?.length || 0} Installed Products
                                    </span>
                                  </div>

                                  {/* Installed Products Grid */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {(sub.installedProducts || []).map((prod, pIdx) => (
                                      <div key={pIdx} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
                                        <div className="flex items-start gap-3">
                                          {prod.productImage ? (
                                            <img src={prod.productImage} alt={prod.productName} className="w-14 h-14 rounded-xl border border-slate-200 object-cover shrink-0" />
                                          ) : (
                                            <div className="w-14 h-14 rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center shrink-0">
                                              <Package className="w-6 h-6 text-slate-300" />
                                            </div>
                                          )}
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between">
                                              <p className="font-extrabold text-slate-900 text-sm truncate">{prod.productName}</p>
                                              <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-md text-[10px] font-extrabold shrink-0 ml-2">
                                                {prod.currentStatus || 'Running'}
                                              </span>
                                            </div>
                                            {prod.productDescription && (
                                              <p className="text-[11px] text-slate-500 font-medium mt-0.5 line-clamp-2">{prod.productDescription}</p>
                                            )}
                                          </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-1.5 text-xs font-semibold text-slate-600">
                                          <p><span className="text-slate-400">Model:</span> {prod.modelNumber || '—'}</p>
                                          <p><span className="text-slate-400">Serial:</span> <span className="font-mono text-slate-900 font-bold">{prod.machineSerialNo || '—'}</span></p>
                                          <p><span className="text-slate-400">Barcode:</span> {prod.barcode || '—'}</p>
                                          <p><span className="text-slate-400">Engineer:</span> {prod.engineerAssigned || '—'}</p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CREATE / EDIT CUSTOMER CENTERED EXTRA-LARGE MODAL (Positioned to right of sidebar) */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 lg:left-64 bg-slate-900/60 backdrop-blur-sm z-30 flex items-center justify-center p-4 lg:p-6">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl w-[96%] max-w-6xl max-h-[94vh] flex flex-col overflow-hidden border border-slate-100"
            >
              {/* Modal Header */}
              <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black">{editingCustomer ? 'Edit Customer Info' : 'Add New Customer'}</h3>
                  <p className="text-xs text-slate-400 font-semibold mt-0.5">Fill in Company, Address, Contacts, Financials, Documents & Production Hierarchy</p>
                </div>
                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/10 rounded-full">
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>

              {/* Navigation Tabs */}
              <div className="bg-slate-100 border-b border-slate-200 px-6 flex items-center gap-2 overflow-x-auto">
                {[
                  { id: 'basic', label: '1. Basic Info' },
                  { id: 'address', label: '2. Company Address' },
                  { id: 'contacts', label: '3. Contacts (Primary & Depts)' },
                  { id: 'financial', label: '4. Financial & Bank' },
                  { id: 'documents', label: '5. Document Uploads (Cloudinary)' },
                  { id: 'production', label: '6. Production Hierarchy' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setFormTab(tab.id)}
                    className={`px-5 py-3.5 text-xs font-extrabold border-b-2 transition-all whitespace-nowrap ${
                      formTab === tab.id ? 'border-indigo-600 text-indigo-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Form Content */}
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-6">
                {/* 1. Basic Info */}
                {formTab === 'basic' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-semibold">
                      <div>
                        <label className="block text-slate-600 font-bold mb-1.5">Company Name *</label>
                        <input
                          type="text"
                          required
                          value={formData.customerName}
                          onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                          className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                          placeholder="e.g. ABC Industries India Pvt Ltd"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-600 font-bold mb-1.5">Unique Customer Code *</label>
                        <input
                          type="text"
                          required
                          value={formData.customerCode}
                          onChange={(e) => setFormData({ ...formData, customerCode: e.target.value })}
                          className="w-full p-3.5 bg-slate-100 border border-slate-200 rounded-xl font-mono text-indigo-700 font-extrabold"
                          placeholder="CUST-10001"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-600 font-bold mb-1.5">Industry</label>
                        <input
                          type="text"
                          value={formData.industry}
                          onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                          className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl"
                          placeholder="e.g. Automotive Manufacturing"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-600 font-bold mb-1.5">Company Email</label>
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl"
                          placeholder="info@company.com"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-600 font-bold mb-1.5">Company Phone</label>
                        <input
                          type="text"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl"
                          placeholder="+91 20 67123000"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-slate-600 font-bold mb-1.5">Remarks / Notes</label>
                        <textarea
                          rows={3}
                          value={formData.remarks}
                          onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                          className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl"
                          placeholder="Additional company details..."
                        />
                      </div>
                    </div>

                    {/* BLOCK SAVE BUTTON */}
                    <div className="pt-3 border-t flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleSaveSection('basic')}
                        className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white font-extrabold text-xs rounded-xl hover:bg-slate-900 transition-all shadow-sm"
                      >
                        <Save className="w-4 h-4" />
                        Save Basic Info Block
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. Company Address */}
                {formTab === 'address' && (
                  <div className="space-y-6 text-xs font-semibold">
                    <h4 className="font-extrabold text-slate-900 uppercase">Company Address Details</h4>
                    <input
                      type="text"
                      placeholder="Address Line 1"
                      value={formData.registeredOffice.addressLine1}
                      onChange={(e) => setFormData({ ...formData, registeredOffice: { ...formData.registeredOffice, addressLine1: e.target.value } })}
                      className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                    <input
                      type="text"
                      placeholder="Address Line 2 (Optional)"
                      value={formData.registeredOffice.addressLine2}
                      onChange={(e) => setFormData({ ...formData, registeredOffice: { ...formData.registeredOffice, addressLine2: e.target.value } })}
                      className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <input
                        type="text"
                        placeholder="Area / Industrial Zone"
                        value={formData.registeredOffice.area}
                        onChange={(e) => setFormData({ ...formData, registeredOffice: { ...formData.registeredOffice, area: e.target.value } })}
                        className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl"
                      />
                      <input
                        type="text"
                        placeholder="City"
                        value={formData.registeredOffice.city}
                        onChange={(e) => setFormData({ ...formData, registeredOffice: { ...formData.registeredOffice, city: e.target.value } })}
                        className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl"
                      />
                      <input
                        type="text"
                        placeholder="State"
                        value={formData.registeredOffice.state}
                        onChange={(e) => setFormData({ ...formData, registeredOffice: { ...formData.registeredOffice, state: e.target.value } })}
                        className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl"
                      />
                      <input
                        type="text"
                        placeholder="Pincode"
                        value={formData.registeredOffice.pincode}
                        onChange={(e) => setFormData({ ...formData, registeredOffice: { ...formData.registeredOffice, pincode: e.target.value } })}
                        className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl"
                      />
                    </div>

                    {/* BLOCK SAVE BUTTON */}
                    <div className="pt-3 border-t flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleSaveSection('address')}
                        className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white font-extrabold text-xs rounded-xl hover:bg-slate-900 transition-all shadow-sm"
                      >
                        <Save className="w-4 h-4" />
                        Save Address Block
                      </button>
                    </div>
                  </div>
                )}

                {/* 3. Primary & Dept Contacts */}
                {formTab === 'contacts' && (
                  <div className="space-y-6 text-xs font-semibold">
                    {/* Primary Contact Card at Top */}
                    <div className="bg-indigo-50/60 p-5 rounded-2xl border border-indigo-100 space-y-3">
                      <div className="flex items-center gap-2 border-b border-indigo-200/60 pb-2">
                        <UserCheck className="w-4 h-4 text-indigo-600" />
                        <h4 className="font-extrabold text-indigo-900 uppercase">Primary Contact (Key Liaison)</h4>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="text"
                          placeholder="Primary Contact Name *"
                          value={formData.primaryContact.contactPerson}
                          onChange={(e) => setFormData({ ...formData, primaryContact: { ...formData.primaryContact, contactPerson: e.target.value } })}
                          className="p-3 bg-white border rounded-xl font-bold"
                        />
                        <input
                          type="text"
                          placeholder="Designation"
                          value={formData.primaryContact.designation}
                          onChange={(e) => setFormData({ ...formData, primaryContact: { ...formData.primaryContact, designation: e.target.value } })}
                          className="p-3 bg-white border rounded-xl"
                        />
                        <input
                          type="text"
                          placeholder="Mobile Number"
                          value={formData.primaryContact.mobileNumber}
                          onChange={(e) => setFormData({ ...formData, primaryContact: { ...formData.primaryContact, mobileNumber: e.target.value } })}
                          className="p-3 bg-white border rounded-xl"
                        />
                        <input
                          type="email"
                          placeholder="Email Address"
                          value={formData.primaryContact.email}
                          onChange={(e) => setFormData({ ...formData, primaryContact: { ...formData.primaryContact, email: e.target.value } })}
                          className="p-3 bg-white border rounded-xl"
                        />
                      </div>
                    </div>

                    {/* Department Contacts */}
                    <div className="space-y-4">
                      <h4 className="font-extrabold text-slate-900 uppercase">Department Contact Lists</h4>
                      {['purchase', 'accounts', 'production', 'maintenance'].map(deptKey => (
                        <div key={deptKey} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                          <div className="flex items-center justify-between">
                            <h5 className="font-extrabold text-indigo-600 uppercase">{deptKey} Department Contacts</h5>
                            <button
                              type="button"
                              onClick={() => addDeptContact(deptKey)}
                              className="px-3 py-1 bg-indigo-50 text-indigo-600 font-bold rounded-lg hover:bg-indigo-100 text-[11px]"
                            >
                              + Add {deptKey} Contact
                            </button>
                          </div>
                          {(formData.departmentContacts[deptKey] || []).map((c, i) => (
                            <div key={i} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
                              <input
                                type="text"
                                placeholder="Contact Name"
                                value={c.name}
                                onChange={(e) => updateDeptContact(deptKey, i, 'name', e.target.value)}
                                className="p-2.5 bg-white border rounded-lg"
                              />
                              <input
                                type="text"
                                placeholder="Designation"
                                value={c.designation}
                                onChange={(e) => updateDeptContact(deptKey, i, 'designation', e.target.value)}
                                className="p-2.5 bg-white border rounded-lg"
                              />
                              <input
                                type="text"
                                placeholder="Mobile"
                                value={c.mobile}
                                onChange={(e) => updateDeptContact(deptKey, i, 'mobile', e.target.value)}
                                className="p-2.5 bg-white border rounded-lg"
                              />
                              <div className="flex items-center gap-2">
                                <input
                                  type="email"
                                  placeholder="Email"
                                  value={c.email}
                                  onChange={(e) => updateDeptContact(deptKey, i, 'email', e.target.value)}
                                  className="p-2.5 bg-white border rounded-lg flex-1"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeDeptContact(deptKey, i)}
                                  className="p-2 bg-rose-50 text-rose-600 rounded-lg font-bold"
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>

                    {/* BLOCK SAVE BUTTON */}
                    <div className="pt-3 border-t flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleSaveSection('contacts')}
                        className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white font-extrabold text-xs rounded-xl hover:bg-slate-900 transition-all shadow-sm"
                      >
                        <Save className="w-4 h-4" />
                        Save Contacts Block
                      </button>
                    </div>
                  </div>
                )}

                {/* 4. Financial & Bank */}
                {formTab === 'financial' && (
                  <div className="space-y-6 text-xs font-semibold">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-slate-600 font-bold mb-1.5">PAN Number</label>
                        <input
                          type="text"
                          value={formData.financialInfo.panNumber}
                          onChange={(e) => setFormData({ ...formData, financialInfo: { ...formData.financialInfo, panNumber: e.target.value } })}
                          className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-mono uppercase"
                          placeholder="AAACA1234F"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-600 font-bold mb-1.5">GST Number</label>
                        <input
                          type="text"
                          value={formData.financialInfo.gstNumber}
                          onChange={(e) => setFormData({ ...formData, financialInfo: { ...formData.financialInfo, gstNumber: e.target.value } })}
                          className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-mono uppercase"
                          placeholder="27AAACA1234F1Z1"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-600 font-bold mb-1.5">MSME Number</label>
                        <input
                          type="text"
                          value={formData.financialInfo.msmeNumber}
                          onChange={(e) => setFormData({ ...formData, financialInfo: { ...formData.financialInfo, msmeNumber: e.target.value } })}
                          className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                          placeholder="UDYAM-MH-26-000000"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-600 font-bold mb-1.5">Bank Name</label>
                        <input
                          type="text"
                          value={formData.bankDetails.bankName}
                          onChange={(e) => setFormData({ ...formData, bankDetails: { ...formData.bankDetails, bankName: e.target.value } })}
                          className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl"
                          placeholder="HDFC Bank"
                        />
                      </div>
                    </div>

                    {/* BLOCK SAVE BUTTON */}
                    <div className="pt-3 border-t flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleSaveSection('financial')}
                        className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white font-extrabold text-xs rounded-xl hover:bg-slate-900 transition-all shadow-sm"
                      >
                        <Save className="w-4 h-4" />
                        Save Financial Block
                      </button>
                    </div>
                  </div>
                )}

                {/* 5. Document Uploads (Cloudinary Integration) */}
                {formTab === 'documents' && (
                  <div className="space-y-6 text-xs font-semibold">
                    <h4 className="font-extrabold text-slate-900 uppercase">3 Document Uploads (Cloudinary Storage)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {formData.documents.map((doc, docIdx) => (
                        <div key={docIdx} className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 flex flex-col justify-between">
                          <div>
                            <span className="px-2.5 py-1 bg-indigo-600 text-white font-extrabold text-[10px] rounded-lg">
                              {doc.docType}
                            </span>
                            <p className="text-xs font-black text-slate-900 mt-2">{doc.docName || `Select ${doc.docType} File`}</p>
                            {doc.fileUrl && (
                              <p className="text-[10px] text-emerald-600 font-mono font-bold mt-1 break-all">
                                ✓ Uploaded to Cloudinary
                              </p>
                            )}
                          </div>

                          <div>
                            <label className="flex items-center justify-center gap-2 px-3.5 py-2.5 bg-indigo-50 text-indigo-600 font-bold text-xs rounded-xl cursor-pointer hover:bg-indigo-100 transition-all">
                              <Upload className="w-4 h-4" />
                              {uploadingDoc[docIdx] ? 'Uploading to Cloudinary...' : 'Choose File to Upload'}
                              <input
                                type="file"
                                accept="image/*,.pdf"
                                className="hidden"
                                onChange={(e) => handleDocumentFileUpload(docIdx, e.target.files[0])}
                              />
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* BLOCK SAVE BUTTON */}
                    <div className="pt-3 border-t flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleSaveSection('documents')}
                        className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white font-extrabold text-xs rounded-xl hover:bg-slate-900 transition-all shadow-sm"
                      >
                        <Save className="w-4 h-4" />
                        Save Documents Block
                      </button>
                    </div>
                  </div>
                )}

                {/* 6. Production Hierarchy - Full Editable */}
                {formTab === 'production' && (
                  <div className="space-y-6 text-xs font-semibold">
                    <div className="flex items-center justify-between">
                      <h4 className="font-extrabold text-slate-900 uppercase">Production Sections ({formData.productionSections.length})</h4>
                      <button
                        type="button"
                        onClick={addProductionSection}
                        className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Section
                      </button>
                    </div>

                    {formData.productionSections.length === 0 && (
                      <div className="text-center py-10 text-slate-400 space-y-2">
                        <Wrench className="w-10 h-10 mx-auto text-slate-300" />
                        <p className="text-xs font-bold">No production sections yet. Click "Add Section" above.</p>
                      </div>
                    )}

                    {formData.productionSections.map((sec, sIdx) => (
                      <div key={sIdx} className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                        {/* Section Header */}
                        <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
                          <div className="p-2 bg-indigo-600 text-white rounded-xl text-xs font-black min-w-[32px] text-center">{sIdx + 1}</div>
                          <h5 className="flex-1 font-extrabold text-slate-900 text-sm">Section {sIdx + 1}</h5>
                          <button type="button" onClick={() => removeProductionSection(sIdx)} className="px-3 py-1.5 bg-rose-50 text-rose-600 rounded-xl font-bold text-xs hover:bg-rose-100 flex items-center gap-1">
                            <Trash2 className="w-3 h-3" /> Remove
                          </button>
                        </div>

                        {/* Section Fields */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] text-slate-500 font-bold uppercase mb-1 block">Section Name *</label>
                            <input type="text" placeholder="e.g. sec-1 : milk" value={sec.sectionName} onChange={(e) => updateProductionSection(sIdx, 'sectionName', e.target.value)} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm" />
                          </div>
                          <div>
                            <label className="text-[11px] text-slate-500 font-bold uppercase mb-1 block">Manager</label>
                            <input type="text" placeholder="Manager name" value={sec.manager || ''} onChange={(e) => updateProductionSection(sIdx, 'manager', e.target.value)} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm" />
                          </div>
                          <div>
                            <label className="text-[11px] text-slate-500 font-bold uppercase mb-1 block">Location</label>
                            <input type="text" placeholder="Bay / Floor / Block" value={sec.location || ''} onChange={(e) => updateProductionSection(sIdx, 'location', e.target.value)} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm" />
                          </div>
                          <div>
                            <label className="text-[11px] text-slate-500 font-bold uppercase mb-1 block">Description</label>
                            <input type="text" placeholder="Section description" value={sec.description || ''} onChange={(e) => updateProductionSection(sIdx, 'description', e.target.value)} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm" />
                          </div>
                        </div>

                        {/* Sub Sections */}
                        <div className="pl-4 border-l-2 border-indigo-200 space-y-4 mt-3">
                          <div className="flex items-center justify-between">
                            <h6 className="text-xs font-extrabold text-indigo-700 uppercase tracking-wider">Sub Sections ({(sec.subSections || []).length})</h6>
                            <button type="button" onClick={() => addSubSection(sIdx)} className="px-3 py-1.5 bg-indigo-100 text-indigo-700 font-bold rounded-lg text-xs hover:bg-indigo-200 flex items-center gap-1">
                              <Plus className="w-3 h-3" /> Add Sub Section
                            </button>
                          </div>

                          {(sec.subSections || []).map((sub, subIdx) => (
                            <div key={subIdx} className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
                              {/* Sub Section Header */}
                              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                                <span className="text-xs font-extrabold text-indigo-600">↳ Sub Section {subIdx + 1}</span>
                                <button type="button" onClick={() => removeSubSection(sIdx, subIdx)} className="px-2.5 py-1 bg-rose-50 text-rose-500 rounded-lg font-bold text-[10px] hover:bg-rose-100 flex items-center gap-1">
                                  <Trash2 className="w-2.5 h-2.5" /> Remove
                                </button>
                              </div>

                              {/* Sub Section Fields */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                  <label className="text-[10px] text-slate-400 font-bold uppercase mb-1 block">Sub Section Name *</label>
                                  <input type="text" placeholder="e.g. subsec-1 : milk" value={sub.subSectionName} onChange={(e) => updateSubSection(sIdx, subIdx, 'subSectionName', e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm" />
                                </div>
                                <div>
                                  <label className="text-[10px] text-slate-400 font-bold uppercase mb-1 block">Description</label>
                                  <input type="text" placeholder="Sub section description" value={sub.description || ''} onChange={(e) => updateSubSection(sIdx, subIdx, 'description', e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm" />
                                </div>
                              </div>

                              {/* Installed Products */}
                              <div className="space-y-3 mt-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-extrabold text-slate-600 uppercase">{(sub.installedProducts || []).length} Installed Products</span>
                                  <div className="flex items-center gap-1.5">
                                    <button type="button" onClick={() => openProductPicker(sIdx, subIdx)} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 font-bold rounded-lg text-[10px] hover:bg-indigo-100 flex items-center gap-1">
                                      <Package className="w-2.5 h-2.5" /> From Master
                                    </button>
                                    <button type="button" onClick={() => addInstalledProduct(sIdx, subIdx)} className="px-2.5 py-1 bg-emerald-50 text-emerald-700 font-bold rounded-lg text-[10px] hover:bg-emerald-100 flex items-center gap-1">
                                      <Plus className="w-2.5 h-2.5" /> Manual
                                    </button>
                                  </div>
                                </div>

                                {(sub.installedProducts || []).map((prod, pIdx) => (
                                  <div key={pIdx} className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-3">
                                    {/* Product Header with Image */}
                                    <div className="flex items-start gap-3 pb-2 border-b border-slate-100">
                                      {prod.productImage ? (
                                        <img src={prod.productImage} alt={prod.productName} className="w-12 h-12 rounded-xl border border-slate-200 object-cover shrink-0" />
                                      ) : (
                                        <div className="w-12 h-12 rounded-xl border border-slate-200 bg-white flex items-center justify-center shrink-0">
                                          <Package className="w-5 h-5 text-slate-300" />
                                        </div>
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <span className="text-xs font-extrabold text-slate-700 truncate block">Product {pIdx + 1}{prod.productName ? ` — ${prod.productName}` : ''}</span>
                                        {prod.productDescription && <p className="text-[10px] text-slate-400 font-medium mt-0.5 line-clamp-1">{prod.productDescription}</p>}
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <select value={prod.currentStatus || 'Running'} onChange={(e) => updateInstalledProduct(sIdx, subIdx, pIdx, 'currentStatus', e.target.value)} className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md text-[10px] font-extrabold border-0">
                                          <option value="Running">Running</option>
                                          <option value="Stopped">Stopped</option>
                                          <option value="Under Maintenance">Under Maintenance</option>
                                          <option value="Decommissioned">Decommissioned</option>
                                        </select>
                                        <button type="button" onClick={() => removeInstalledProduct(sIdx, subIdx, pIdx)} className="px-2 py-1 bg-rose-50 text-rose-500 rounded-lg font-bold text-[10px] hover:bg-rose-100">
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>

                                    {/* Product Image URL + Description */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                      <div>
                                        <label className="text-[10px] text-slate-400 font-bold mb-0.5 block">Product Image URL</label>
                                        <input type="text" placeholder="Image URL (from Product Master)" value={prod.productImage || ''} onChange={(e) => updateInstalledProduct(sIdx, subIdx, pIdx, 'productImage', e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold" />
                                      </div>
                                      <div>
                                        <label className="text-[10px] text-slate-400 font-bold mb-0.5 block">Product Description</label>
                                        <input type="text" placeholder="Description" value={prod.productDescription || ''} onChange={(e) => updateInstalledProduct(sIdx, subIdx, pIdx, 'productDescription', e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold" />
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                      <div>
                                        <label className="text-[10px] text-slate-400 font-bold mb-0.5 block">Product Name *</label>
                                        <input type="text" placeholder="e.g. Fiber Laser Printer LM500" value={prod.productName} onChange={(e) => updateInstalledProduct(sIdx, subIdx, pIdx, 'productName', e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold" />
                                      </div>
                                      <div>
                                        <label className="text-[10px] text-slate-400 font-bold mb-0.5 block">Model Number</label>
                                        <input type="text" placeholder="Model" value={prod.modelNumber || ''} onChange={(e) => updateInstalledProduct(sIdx, subIdx, pIdx, 'modelNumber', e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold" />
                                      </div>
                                      <div>
                                        <label className="text-[10px] text-slate-400 font-bold mb-0.5 block">Product Code</label>
                                        <input type="text" placeholder="Code" value={prod.productCode || ''} onChange={(e) => updateInstalledProduct(sIdx, subIdx, pIdx, 'productCode', e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold" />
                                      </div>
                                      <div>
                                        <label className="text-[10px] text-slate-400 font-bold mb-0.5 block">Serial Number</label>
                                        <input type="text" placeholder="Serial No" value={prod.machineSerialNo || ''} onChange={(e) => updateInstalledProduct(sIdx, subIdx, pIdx, 'machineSerialNo', e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold" />
                                      </div>
                                      <div>
                                        <label className="text-[10px] text-slate-400 font-bold mb-0.5 block">Barcode</label>
                                        <input type="text" placeholder="Barcode" value={prod.barcode || ''} onChange={(e) => updateInstalledProduct(sIdx, subIdx, pIdx, 'barcode', e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold" />
                                      </div>
                                      <div>
                                        <label className="text-[10px] text-slate-400 font-bold mb-0.5 block">QR Code</label>
                                        <input type="text" placeholder="QR Code" value={prod.qrCode || ''} onChange={(e) => updateInstalledProduct(sIdx, subIdx, pIdx, 'qrCode', e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold" />
                                      </div>
                                      <div>
                                        <label className="text-[10px] text-slate-400 font-bold mb-0.5 block">Brand</label>
                                        <input type="text" placeholder="Brand" value={prod.brand || ''} onChange={(e) => updateInstalledProduct(sIdx, subIdx, pIdx, 'brand', e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold" />
                                      </div>
                                      <div>
                                        <label className="text-[10px] text-slate-400 font-bold mb-0.5 block">Engineer Assigned</label>
                                        <input type="text" placeholder="Engineer name" value={prod.engineerAssigned || ''} onChange={(e) => updateInstalledProduct(sIdx, subIdx, pIdx, 'engineerAssigned', e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold" />
                                      </div>
                                      <div>
                                        <label className="text-[10px] text-slate-400 font-bold mb-0.5 block">Product ID</label>
                                        <input type="text" placeholder="Product ID" value={prod.productId || ''} onChange={(e) => updateInstalledProduct(sIdx, subIdx, pIdx, 'productId', e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold" />
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
                                      <div>
                                        <label className="text-[10px] text-slate-400 font-bold mb-0.5 block">Installation Date</label>
                                        <input type="date" value={prod.installationDate ? (typeof prod.installationDate === 'string' ? prod.installationDate.split('T')[0] : '') : ''} onChange={(e) => updateInstalledProduct(sIdx, subIdx, pIdx, 'installationDate', e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold" />
                                      </div>
                                      <div>
                                        <label className="text-[10px] text-slate-400 font-bold mb-0.5 block">Warranty Expiry</label>
                                        <input type="date" value={prod.warrantyExpiry ? (typeof prod.warrantyExpiry === 'string' ? prod.warrantyExpiry.split('T')[0] : '') : ''} onChange={(e) => updateInstalledProduct(sIdx, subIdx, pIdx, 'warrantyExpiry', e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold" />
                                      </div>
                                      <div>
                                        <label className="text-[10px] text-slate-400 font-bold mb-0.5 block">AMC Expiry</label>
                                        <input type="date" value={prod.amcExpiry ? (typeof prod.amcExpiry === 'string' ? prod.amcExpiry.split('T')[0] : '') : ''} onChange={(e) => updateInstalledProduct(sIdx, subIdx, pIdx, 'amcExpiry', e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold" />
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* BLOCK SAVE BUTTON */}
                    <div className="pt-3 border-t flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleSaveSection('production')}
                        className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white font-extrabold text-xs rounded-xl hover:bg-slate-900 transition-all shadow-sm"
                      >
                        <Save className="w-4 h-4" />
                        Save Production Block
                      </button>
                    </div>
                  </div>
                )}

                {/* Modal Footer Actions - FINAL SUBMIT WHOLE CUSTOMER */}
                <div className="pt-5 border-t border-slate-200 flex items-center justify-between bg-slate-50/50 -mx-8 -mb-8 p-6 px-8">
                  <div className="flex items-center gap-2 text-slate-500 font-bold text-xs">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>Review all tabs or save sections individually before final submit</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-7 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl text-xs shadow-xl shadow-indigo-600/30 transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Saving Whole Customer...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          <span>Submit & Save Whole Customer Info</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PRODUCT MASTER PICKER MODAL */}
      {productPickerOpen.open && (
        <div className="fixed inset-0 lg:left-64 bg-slate-900/60 backdrop-blur-sm z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col border border-slate-100 overflow-hidden">
            {/* Picker Header */}
            <div className="p-5 bg-indigo-600 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-black flex items-center gap-2"><Package className="w-5 h-5" /> Select from Product Master</h3>
                <p className="text-xs text-indigo-200 font-semibold mt-0.5">Choose a product to auto-fill details</p>
              </div>
              <button onClick={() => setProductPickerOpen({ open: false, secIdx: null, subIdx: null, search: '' })} className="p-2 hover:bg-white/10 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search */}
            <div className="p-4 border-b border-slate-100 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search products by name, SKU, category..."
                  value={productPickerOpen.search}
                  onChange={(e) => setProductPickerOpen(prev => ({ ...prev, search: e.target.value }))}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  autoFocus
                />
              </div>
            </div>

            {/* Product List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {productMasterList.length === 0 ? (
                <div className="text-center py-10 text-slate-400 space-y-2">
                  <Package className="w-10 h-10 mx-auto text-slate-300" />
                  <p className="text-xs font-bold">No products in Product Master. Add products first.</p>
                </div>
              ) : (
                productMasterList
                  .filter(p => {
                    const q = productPickerOpen.search.toLowerCase();
                    if (!q) return true;
                    return (
                      (p.name || '').toLowerCase().includes(q) ||
                      (p.sku || '').toLowerCase().includes(q) ||
                      (p.category || '').toLowerCase().includes(q) ||
                      (p.description || '').toLowerCase().includes(q)
                    );
                  })
                  .map((p) => (
                    <button
                      key={p._id}
                      type="button"
                      onClick={() => selectProductFromMaster(p)}
                      className="w-full flex items-center gap-3 p-3 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-2xl transition-all text-left group"
                    >
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="w-12 h-12 rounded-xl border border-slate-200 object-cover shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-xl border border-slate-200 bg-white flex items-center justify-center shrink-0">
                          <Package className="w-5 h-5 text-slate-300" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-extrabold text-slate-900 group-hover:text-indigo-700 truncate">{p.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-mono font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{p.sku}</span>
                          <span className="text-[10px] font-semibold text-slate-500">{p.category || 'General'}</span>
                        </div>
                        {p.description && <p className="text-[10px] text-slate-400 font-medium mt-0.5 truncate">{p.description}</p>}
                      </div>
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">Select</span>
                    </button>
                  ))
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-between shrink-0">
              <p className="text-[10px] text-slate-400 font-semibold">{productMasterList.length} products available</p>
              <button
                type="button"
                onClick={() => setProductPickerOpen({ open: false, secIdx: null, subIdx: null, search: '' })}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL (Positioned to right of sidebar) */}
      {deleteConfirm.show && (
        <div className="fixed inset-0 lg:left-64 bg-slate-900/60 backdrop-blur-sm z-30 flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-3xl max-w-sm w-full space-y-4 border border-slate-100 shadow-2xl">
            <h3 className="text-base font-black text-slate-900">Delete Customer Record</h3>
            <p className="text-xs text-slate-500 font-semibold">Are you sure you want to delete this customer record?</p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeleteConfirm({ show: false, id: null })}
                className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={saving}
                className="px-4 py-2 bg-rose-600 text-white font-extrabold rounded-xl text-xs hover:bg-rose-700"
              >
                {saving ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
