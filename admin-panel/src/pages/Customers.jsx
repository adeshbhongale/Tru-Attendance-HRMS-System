import { AnimatePresence, motion } from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Building2,
  CheckCircle,
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
    creditPeriod: 0,
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
      msmeStatus: 'Micro',
      msmeCategory: 'small'
    },

    documents: [
      { docType: 'GST Certificate', docName: '', fileUrl: '', issueDate: '', expiryDate: '', version: '1.0' },
      { docType: 'PAN Card', docName: '', fileUrl: '', issueDate: '', expiryDate: '', version: '1.0' },
      { docType: 'MSME Document', docName: '', fileUrl: '', issueDate: '', expiryDate: '', version: '1.0' }
    ],

    bankDetails: {
      bankName: '',
      accountNumber: '',
      ifscCode: '',
      accountType: 'Current',
      bankAddress: ''
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

  // Filter & Search Logic (Searching exclusively by Unique Code & Company, Industry, Primary Contact, Company Address)
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      if (filterIndustry !== 'All' && !(c.industry || '').toLowerCase().includes(filterIndustry.toLowerCase())) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();

        // 1. Unique Code & Company
        const matchesCodeCompany = (c.customerCode || '').toLowerCase().includes(q) ||
          (c.customerName || '').toLowerCase().includes(q);

        // 2. Industry
        const matchesIndustry = (c.industry || '').toLowerCase().includes(q);

        // 3. Primary Contact
        const matchesPrimaryContact = (c.primaryContact?.contactPerson || c.contactPerson || '').toLowerCase().includes(q) ||
          (c.primaryContact?.mobileNumber || c.mobile || c.phone || '').toLowerCase().includes(q) ||
          (c.primaryContact?.email || c.email || '').toLowerCase().includes(q);

        // 4. Company Address
        const addrStr = `${c.registeredOffice?.addressLine1 || c.address || ''} ${c.registeredOffice?.addressLine2 || ''} ${c.registeredOffice?.area || ''} ${c.registeredOffice?.city || ''} ${c.registeredOffice?.state || ''} ${c.registeredOffice?.pincode || ''}`.toLowerCase();
        const matchesAddress = addrStr.includes(q);

        return matchesCodeCompany || matchesIndustry || matchesPrimaryContact || matchesAddress;
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
        creditPeriod: cust.creditPeriod || 0,
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
          msmeStatus: cust.financialInfo?.msmeStatus || 'Micro',
          msmeCategory: cust.financialInfo?.msmeCategory || 'small'
        },

        documents: (() => {
          const compulsoryDocTypes = ['GST Certificate', 'PAN Card', 'MSME Document'];
          const existingDocs = cust.documents || [];
          return compulsoryDocTypes.map(type => {
            const found = existingDocs.find(d => d.docType === type || (type === 'MSME Document' && (d.docType === 'MSME Certificate' || d.docType === 'MSME Document')));
            return found ? { ...found, docType: type } : { docType: type, docName: '', fileUrl: '', issueDate: '', expiryDate: '', version: '1.0' };
          });
        })(),

        bankDetails: {
          bankName: cust.bankDetails?.bankName || '',
          accountNumber: cust.bankDetails?.accountNumber || '',
          ifscCode: cust.bankDetails?.ifscCode || '',
          accountType: cust.bankDetails?.accountType || 'Current',
          bankAddress: cust.bankDetails?.bankAddress || ''
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
        creditPeriod: 0,
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
        bankDetails: { bankName: '', accountNumber: '', ifscCode: '', accountType: 'Current', bankAddress: '' },
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
          toast.success(`${formData.documents[docIndex].docType} uploaded successfully!`);
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

  const selectProductFromMaster = (masterProduct, selectedModel = null, selectedSerialNo = null) => {
    const { secIdx, subIdx } = productPickerOpen;
    const model = selectedModel || (masterProduct.models && masterProduct.models[0]) || {};
    const serialNo = selectedSerialNo || (Array.isArray(model.serialNumbers) ? model.serialNumbers[0] : (model.serialNumbers || ''));

    setFormData(prev => {
      const secs = [...prev.productionSections];
      const newProd = {
        productId: masterProduct._id || '',
        productName: masterProduct.name || '',
        productDescription: model.description || masterProduct.description || '',
        productImage: masterProduct.imageUrl || '',
        modelNumber: model.modelName || '',
        productCode: '',
        machineSerialNo: serialNo || '',
        barcode: '',
        qrCode: '',
        brand: '',
        installationDate: model.installationDate || '',
        warrantyExpiry: '',
        amcExpiry: '',
        currentStatus: 'Running',
        engineerAssigned: ''
      };

      if (subIdx !== null && subIdx !== undefined) {
        const subs = [...(secs[secIdx].subSections || [])];
        subs[subIdx] = {
          ...subs[subIdx],
          installedProducts: [...(subs[subIdx].installedProducts || []), newProd]
        };
        secs[secIdx] = { ...secs[secIdx], subSections: subs };
      } else {
        secs[secIdx] = {
          ...secs[secIdx],
          installedProducts: [...(secs[secIdx].installedProducts || []), newProd]
        };
      }
      return { ...prev, productionSections: secs };
    });
    setProductPickerOpen({ open: false, secIdx: null, subIdx: null, search: '' });
    toast.success(`Added "${masterProduct.name}${model.modelName ? ` (${model.modelName})` : ''} - S/N: ${serialNo || 'N/A'}"`);
  };

  // Section Direct Installed Product Helpers
  const removeSectionInstalledProduct = (secIdx, pIdx) => {
    setFormData(prev => {
      const secs = [...prev.productionSections];
      secs[secIdx] = {
        ...secs[secIdx],
        installedProducts: (secs[secIdx].installedProducts || []).filter((_, idx) => idx !== pIdx)
      };
      return { ...prev, productionSections: secs };
    });
  };

  const updateSectionInstalledProduct = (secIdx, pIdx, field, value) => {
    setFormData(prev => {
      const secs = [...prev.productionSections];
      const prods = [...(secs[secIdx].installedProducts || [])];
      prods[pIdx] = { ...prods[pIdx], [field]: value };
      secs[secIdx] = { ...secs[secIdx], installedProducts: prods };
      return { ...prev, productionSections: secs };
    });
  };
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
    toast.success('Customer PDF report downloaded!');
    setShowExportDropdown(false);
  };

  // CSV Export Function
  const exportToCSV = () => {
    if (filteredCustomers.length === 0) {
      toast.error('No data to export');
      return;
    }

    const headers = ['Unique Code,Company Name,Industry,Contact Person,Mobile,Email,GSTIN,City,State'];
    const rows = filteredCustomers.map(c => [
      `"${c.customerCode || ''}"`,
      `"${c.customerName || ''}"`,
      `"${c.industry || ''}"`,
      `"${c.primaryContact?.contactPerson || c.contactPerson || ''}"`,
      `"${c.primaryContact?.mobileNumber || c.mobile || ''}"`,
      `"${c.primaryContact?.email || c.email || ''}"`,
      `"${c.financialInfo?.gstNumber || ''}"`,
      `"${c.registeredOffice?.city || ''}"`,
      `"${c.registeredOffice?.state || ''}"`
    ].join(','));

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Customer_Master_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Customers CSV exported!');
    setShowExportDropdown(false);
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
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Customer Master</h1>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">
                Dynamic Enterprise Customer Directory with Unique Codes, Department Contacts & Document Repository
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
              <div className="absolute right-0 mt-2 w-44 bg-white border border-slate-100 rounded-2xl shadow-xl z-30 py-2 text-xs font-bold text-slate-700">
                <button
                  onClick={() => { setShowExportDropdown(false); exportToPDF(); }}
                  className="w-full text-left px-4 py-2 hover:bg-indigo-50 hover:text-indigo-600 flex items-center gap-2"
                >
                  <FileText className="w-4 h-4 text-red-500" /> Export as PDF
                </button>
                <button
                  onClick={() => { setShowExportDropdown(false); exportToCSV(); }}
                  className="w-full text-left px-4 py-2 hover:bg-indigo-50 hover:text-indigo-600 flex items-center gap-2"
                >
                  <FileText className="w-4 h-4 text-emerald-500" /> Export as CSV
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
            <p className="text-xs font-extrabold text-slate-400 tracking-wider">Total Customers</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{customers.length}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="p-3.5 bg-cyan-50 text-cyan-600 rounded-2xl">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-extrabold text-slate-400 tracking-wider">Production Sections</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">
              {customers.reduce((acc, c) => acc + (c.productionSections?.length || 0), 0)}
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="p-3.5 bg-purple-50 text-purple-600 rounded-2xl">
            <Wrench className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-extrabold text-slate-400 tracking-wider">Installed Machines</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">
              {customers.reduce((acc, c) => {
                let cnt = 0;
                (c.productionSections || []).forEach(sec => {
                  cnt += (sec.installedProducts?.length || 0);
                  (sec.subSections || []).forEach(sub => {
                    cnt += (sub.installedProducts?.length || 0);
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
            placeholder="Search by Unique Code & Company, Industry, Primary Contact, Company Address..."
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
            <table className="w-full text-left border-collapse table-fixed">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-extrabold text-slate-500 tracking-wider">
                  <th className="px-3.5 py-3 w-3/12">Unique Code & Company</th>
                  <th className="px-3 py-3 w-2/12">Industry</th>
                  <th className="px-3.5 py-3 w-2/12">Primary Contact</th>
                  <th className="px-3 py-3 w-2/12">Company Address</th>
                  <th className="px-3 py-3 w-2/12">Sections & Products</th>
                  <th className="px-3 py-3 w-1/12 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                {paginatedCustomers.map((cust) => (
                  <tr
                    key={cust._id}
                    onClick={() => { setViewCustomer(cust); setViewTab('basic'); }}
                    className="hover:bg-indigo-50/40 cursor-pointer transition-all"
                  >
                    {/* Unique Code & Company */}
                    <td className="px-3.5 py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 font-mono text-[10px] font-extrabold rounded-md border border-indigo-100 flex-shrink-0">
                          {cust.customerCode}
                        </span>
                        <div className="min-w-0 truncate">
                          <p className="font-extrabold text-slate-900 text-xs truncate" title={cust.customerName}>
                            {cust.customerName}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Industry */}
                    <td className="px-3 py-3">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-lg text-[10px] font-extrabold inline-block truncate max-w-full">
                        {cust.industry || 'General'}
                      </span>
                    </td>

                    {/* Primary Contact */}
                    <td className="px-3.5 py-3">
                      <div className="min-w-0 truncate">
                        <p className="font-bold text-slate-900 text-xs truncate">{cust.primaryContact?.contactPerson || cust.contactPerson || '—'}</p>
                        <p className="text-[10px] text-slate-400 font-medium truncate" title={`${cust.primaryContact?.mobileNumber || cust.mobile || cust.phone || ''} ${cust.primaryContact?.email ? `• ${cust.primaryContact.email}` : ''}`}>
                          {cust.primaryContact?.mobileNumber || cust.mobile || cust.phone || '—'}
                          {cust.primaryContact?.email ? ` • ${cust.primaryContact.email}` : ''}
                        </p>
                      </div>
                    </td>

                    {/* Company Address */}
                    <td className="px-3 py-3">
                      <p className="text-slate-600 font-medium text-xs truncate" title={`${cust.registeredOffice?.addressLine1 || cust.address || ''}${cust.registeredOffice?.city ? `, ${cust.registeredOffice.city}` : ''}`}>
                        {cust.registeredOffice?.addressLine1 || cust.address || '—'}
                        {cust.registeredOffice?.city ? `, ${cust.registeredOffice.city}` : ''}
                      </p>
                    </td>

                    {/* Sections & Products */}
                    <td className="px-3 py-3">
                      {(() => {
                        let totalProds = 0;
                        (cust.productionSections || []).forEach(sec => {
                          totalProds += (sec.installedProducts?.length || 0);
                          (sec.subSections || []).forEach(sub => {
                            totalProds += (sub.installedProducts?.length || 0);
                          });
                        });
                        return (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 font-extrabold text-[10px] rounded-md border border-indigo-100 flex-shrink-0">
                              {cust.productionSections?.length || 0} Secs
                            </span>
                            <span className="px-2 py-0.5 bg-cyan-50 text-cyan-700 font-extrabold text-[10px] rounded-md border border-cyan-100 flex-shrink-0">
                              {totalProds} Prods
                            </span>
                          </div>
                        );
                      })()}
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          onClick={(e) => handleOpenModal(cust, e)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                          title="Edit Customer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ show: true, id: cust._id }); }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                          title="Delete Customer"
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

      {/* VIEW CUSTOMER DETAILS MODAL (Matching Vendor Modal UI 1:1) */}
      <AnimatePresence>
        {viewCustomer && (
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
              {/* Header (Same UI as Vendor View Modal) */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-600 font-mono text-[10px] font-extrabold rounded-md border border-indigo-100">
                        {viewCustomer.customerCode}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-600">
                        Active
                      </span>
                    </div>
                    <h3 className="font-extrabold text-slate-900 text-base">
                      {viewCustomer.customerName}
                    </h3>
                    <p className="text-xs font-semibold text-slate-500">{viewCustomer.industry || 'General Industry'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const custToEdit = viewCustomer;
                      setViewCustomer(null);
                      handleOpenModal(custToEdit);
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 text-indigo-600 font-extrabold text-xs rounded-xl hover:bg-indigo-100 transition-all mr-2"
                  >
                    <Edit2 className="w-4 h-4" />
                    <span>Edit Customer</span>
                  </button>
                  <button onClick={() => setViewCustomer(null)} className="text-slate-400 hover:text-slate-600 p-2 rounded-xl">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Navigation Tabs (Same UI as Vendor View Modal) */}
              <div className="flex border-b border-slate-200 bg-slate-50/50 px-6 gap-1 overflow-x-auto text-xs font-extrabold scrollbar-none">
                {[
                  { id: 'basic', label: '1. Basic Info', icon: Building2 },
                  { id: 'address', label: '2. Address', icon: MapPin },
                  { id: 'contacts', label: '3. Contacts', icon: Users },
                  { id: 'financial', label: '4. Financial & Bank', icon: CreditCard },
                  { id: 'documents', label: '5. Documents', icon: FileText },
                  { id: 'production', label: '6. Production Hierarchy', icon: Wrench },
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

              {/* Content Section */}
              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                {/* 1. Basic Info Tab */}
                {viewTab === 'basic' && (
                  <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-sm space-y-6">
                    <h3 className="text-sm font-bold text-slate-900 tracking-wider border-b pb-3">Company Overview</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-xs font-semibold">
                      <div><p className="text-slate-400 font-bold mb-1">Unique Customer Code</p><p className="text-indigo-600 font-mono font-extrabold text-sm">{viewCustomer.customerCode}</p></div>
                      <div><p className="text-slate-400 font-bold mb-1">Company Name</p><p className="text-slate-800 font-extrabold text-sm">{viewCustomer.customerName}</p></div>
                      <div><p className="text-slate-400 font-bold mb-1">Industry</p><p className="text-slate-800 text-sm">{viewCustomer.industry || '—'}</p></div>
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
                    <h3 className="text-sm font-bold text-slate-900 tracking-wider border-b pb-3">Company Address</h3>
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
                        <h3 className="text-sm font-bold text-indigo-900 tracking-wider">Primary Contact (Key Liaison)</h3>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs font-semibold">
                        <div><p className="text-indigo-400 font-bold">Contact Person</p><p className="text-indigo-950 font-extrabold text-sm">{viewCustomer.primaryContact?.contactPerson || viewCustomer.contactPerson || '—'}</p></div>
                        <div><p className="text-indigo-400 font-bold">Designation</p><p className="text-indigo-900">{viewCustomer.primaryContact?.designation || '—'}</p></div>
                        <div><p className="text-indigo-400 font-bold">Mobile</p><p className="text-indigo-700 font-extrabold">{viewCustomer.primaryContact?.mobileNumber || viewCustomer.mobile || '—'}</p></div>
                      </div>
                    </div>

                    {/* Department Contacts Cards (Only render if contact present) */}
                    {(() => {
                      const activeDepts = ['purchase', 'accounts', 'production', 'maintenance'].filter(deptKey => {
                        const raw = viewCustomer.departmentContacts?.[deptKey];
                        const list = (Array.isArray(raw) ? raw : [raw]).filter(c => c && (c.name || c.contactPerson));
                        return list.length > 0;
                      });

                      if (activeDepts.length === 0) return null;

                      return (
                        <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                          <h3 className="text-sm font-bold text-slate-900 tracking-wider border-b pb-3">Department Contacts</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {activeDepts.map(deptKey => {
                              const raw = viewCustomer.departmentContacts?.[deptKey];
                              const list = (Array.isArray(raw) ? raw : [raw]).filter(c => c && (c.name || c.contactPerson));
                              return (
                                <div key={deptKey} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                                  <h4 className="text-xs font-extrabold text-indigo-600 tracking-wider">{deptKey} Department</h4>
                                  {list.map((c, i) => (
                                    <div key={i} className="bg-white p-3 rounded-xl border border-slate-100 text-xs space-y-1">
                                      <p className="font-extrabold text-slate-900">{c.name || c.contactPerson} {c.designation ? <span className="text-[10px] font-normal text-slate-500">({c.designation})</span> : null}</p>
                                      <p className="text-[11px] text-slate-600">{c.mobile || c.mobileNumber || '—'} {c.email ? `| ${c.email}` : ''}</p>
                                    </div>
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* 4. Financial & Bank Details */}
                {viewTab === 'financial' && (
                  <div className="space-y-6">
                    <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                      <h3 className="text-sm font-bold text-slate-900 tracking-wider border-b pb-3">Tax & Financial Info</h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-xs font-semibold">
                        <div><p className="text-slate-400 font-bold mb-1">PAN Number</p><p className="font-mono text-slate-900 font-bold text-sm">{viewCustomer.financialInfo?.panNumber || '—'}</p></div>
                        <div><p className="text-slate-400 font-bold mb-1">GST Number</p><p className="font-mono text-indigo-600 font-bold text-sm">{viewCustomer.financialInfo?.gstNumber || '—'}</p></div>
                        <div><p className="text-slate-400 font-bold mb-1">MSME Number</p><p className="font-mono text-slate-800 text-sm">{viewCustomer.financialInfo?.msmeNumber || '—'}</p></div>
                        <div><p className="text-slate-400 font-bold mb-1">MSME Category</p><p className="text-indigo-600 font-extrabold text-sm capitalize">{viewCustomer.financialInfo?.msmeCategory || 'small'}</p></div>
                        <div><p className="text-slate-400 font-bold mb-1">Credit Period</p><p className="text-amber-700 font-extrabold text-sm">{viewCustomer.creditPeriod || 0} Days</p></div>
                      </div>
                    </div>

                    <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                      <h3 className="text-sm font-bold text-slate-900 tracking-wider border-b pb-3">Bank Details</h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-xs font-semibold">
                        <div><p className="text-slate-400 font-bold mb-1">Name of Bank</p><p className="text-slate-900 font-extrabold text-sm">{viewCustomer.bankDetails?.bankName || '—'}</p></div>
                        <div><p className="text-slate-400 font-bold mb-1">Account No.</p><p className="font-mono text-slate-900 font-bold text-sm">{viewCustomer.bankDetails?.accountNumber || '—'}</p></div>
                        <div><p className="text-slate-400 font-bold mb-1">IFSC Code</p><p className="font-mono text-indigo-600 font-bold text-sm">{viewCustomer.bankDetails?.ifscCode || '—'}</p></div>
                        <div><p className="text-slate-400 font-bold mb-1">Type of Account</p><p className="text-slate-700 text-sm">{viewCustomer.bankDetails?.accountType || 'Current'}</p></div>
                        <div className="col-span-2"><p className="text-slate-400 font-bold mb-1">Bank Address</p><p className="text-slate-700 text-sm">{viewCustomer.bankDetails?.bankAddress || '—'}</p></div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. Document Repository (Cloudinary) */}
                {viewTab === 'documents' && (
                  <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                    <h3 className="text-sm font-bold text-slate-900 tracking-wider border-b pb-3">Documents Repository</h3>
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
                              <p className="text-xs font-bold text-slate-900 mt-2">{doc.docName || doc.docType}</p>
                              <p className="text-[10px] text-slate-400 mt-1">Uploaded: {doc.uploadedOn ? new Date(doc.uploadedOn).toLocaleDateString() : '—'}</p>
                            </div>
                            {doc.fileUrl ? (
                              <a
                                href={doc.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="w-full text-center py-2 bg-indigo-600 text-white font-bold text-xs rounded-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-1.5"
                              >
                                <Download className="w-3.5 h-3.5" /> View / Download Document
                              </a>
                            ) : (
                              <span className="text-[10px] text-slate-400">No document file attached</span>
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
                      <h3 className="text-sm font-bold text-slate-900 tracking-wider">Production Hierarchy & Machine Mapping</h3>
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
                                <div className="p-2 bg-indigo-600 text-white rounded-xl text-xs font-bold">
                                  {secIdx + 1}
                                </div>
                                <div>
                                  <h4 className="text-base font-bold text-slate-900">{sec.sectionName}</h4>
                                  <p className="text-xs font-semibold text-slate-500">Location: {sec.location || '—'}</p>
                                </div>
                              </div>
                            </div>

                            {/* Section Direct Installed Products (if any) */}
                            {sec.installedProducts && sec.installedProducts.length > 0 && (
                              <div className="space-y-2 mb-4">
                                <span className="text-[11px] font-extrabold text-indigo-700 tracking-wider block">
                                  Direct Section Installed Products ({sec.installedProducts.length})
                                </span>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {sec.installedProducts.map((prod, pIdx) => (
                                    <div key={pIdx} className="p-4 bg-white rounded-2xl border border-slate-200 space-y-2 text-xs">
                                      <p className="font-extrabold text-slate-900 text-sm truncate">{prod.productName}</p>
                                      <div className="grid grid-cols-2 gap-1.5 text-xs font-semibold text-slate-600 pt-1 border-t border-slate-200/60">
                                        <p><span className="text-slate-400">Model Name:</span> {prod.modelNumber || '—'}</p>
                                        <p><span className="text-slate-400">Serial No:</span> <span className="font-mono text-slate-900 font-bold">{prod.machineSerialNo || '—'}</span></p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Sub Sections Tree */}
                            <div className="space-y-4 pl-4 border-l-2 border-indigo-200">
                              {(sec.subSections || []).map((sub, subIdx) => (
                                <div key={subIdx} className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <h5 className="text-xs font-extrabold text-indigo-700 tracking-wider">
                                      ↳ Sub Section: {sub.subSectionName}
                                    </h5>
                                    <span className="text-[11px] font-bold text-slate-500">
                                      {sub.installedProducts?.length || 0} Installed Products
                                    </span>
                                  </div>

                                  {/* Installed Products Grid - Only Product Name, Model Name, Serial No */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {(sub.installedProducts || []).map((prod, pIdx) => (
                                      <div key={pIdx} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
                                        <p className="font-extrabold text-slate-900 text-sm truncate">{prod.productName}</p>
                                        <div className="grid grid-cols-2 gap-1.5 text-xs font-semibold text-slate-600 pt-1 border-t border-slate-200/60">
                                          <p><span className="text-slate-400">Model Name:</span> {prod.modelNumber || '—'}</p>
                                          <p><span className="text-slate-400">Serial No:</span> <span className="font-mono text-slate-900 font-bold">{prod.machineSerialNo || '—'}</span></p>
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* CREATE / EDIT CUSTOMER MODAL (Matching Vendor Modal UI 1:1) */}
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
              {/* Header (Same UI as Vendor Add/Edit Modal) */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base">
                      {editingCustomer ? `Edit Customer: ${editingCustomer.customerName}` : 'Add New Customer'}
                    </h3>
                    <p className="text-xs font-semibold text-slate-500">Fill in customer master details</p>
                  </div>
                </div>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-2 rounded-xl">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Navigation Tabs (Same UI as Vendor Add/Edit Modal) */}
              <div className="flex border-b border-slate-200 bg-slate-50/50 px-6 gap-1 overflow-x-auto text-xs font-extrabold scrollbar-none">
                {[
                  { id: 'basic', label: '1. Basic Info', icon: Building2 },
                  { id: 'address', label: '2. Address', icon: MapPin },
                  { id: 'contacts', label: '3. Contacts', icon: Users },
                  { id: 'financial', label: '4. Financial & Bank', icon: CreditCard },
                  { id: 'documents', label: '5. Documents', icon: FileText },
                  { id: 'production', label: '6. Production Hierarchy', icon: Wrench },
                ].map(t => {
                  const IconComponent = t.icon;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setFormTab(t.id)}
                      className={`flex items-center gap-2 px-4 py-3.5 border-b-2 transition-all whitespace-nowrap ${formTab === t.id
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

              {/* Form Content */}
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-6">
                {/* 1. Basic Info */}
                {formTab === 'basic' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-semibold">
                      <div className="md:col-span-2">
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
                        <label className="block text-slate-600 font-bold mb-1.5">Industry</label>
                        <input
                          type="text"
                          value={formData.industry}
                          onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                          className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl"
                          placeholder="e.g. Automotive Manufacturing"
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
                    <h4 className="font-extrabold text-slate-900">Company Address Details</h4>
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
                        <h4 className="font-extrabold text-indigo-900">Primary Contact (Key Liaison)</h4>
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

                    {/* Department Contacts (Fixed single contact form per department) */}
                    <div className="space-y-4">
                      <h4 className="font-extrabold text-slate-900">Department Contacts</h4>
                      {['purchase', 'accounts', 'production', 'maintenance'].map(deptKey => {
                        const contactList = formData.departmentContacts[deptKey];
                        const contact = (Array.isArray(contactList) && contactList.length > 0)
                          ? contactList[0]
                          : (contactList && typeof contactList === 'object' && !Array.isArray(contactList))
                            ? contactList
                            : { name: '', designation: '', mobile: '', email: '' };

                        return (
                          <div key={deptKey} className="bg-slate-50/70 p-4 rounded-2xl border border-slate-200 space-y-3">
                            <h5 className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5 capitalize">
                              <Users className="w-4 h-4 text-indigo-600" />
                              {deptKey} Department Contact
                            </h5>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white p-3.5 rounded-xl border border-slate-200">
                              <div>
                                <label className="block font-bold text-slate-600 mb-1">Contact Name</label>
                                <input
                                  type="text"
                                  placeholder={`${deptKey.charAt(0).toUpperCase() + deptKey.slice(1)} Contact Name`}
                                  value={contact.name || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setFormData(prev => ({
                                      ...prev,
                                      departmentContacts: {
                                        ...prev.departmentContacts,
                                        [deptKey]: [{ ...contact, name: val }]
                                      }
                                    }));
                                  }}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="block font-bold text-slate-600 mb-1">Designation</label>
                                <input
                                  type="text"
                                  placeholder="Designation"
                                  value={contact.designation || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setFormData(prev => ({
                                      ...prev,
                                      departmentContacts: {
                                        ...prev.departmentContacts,
                                        [deptKey]: [{ ...contact, designation: val }]
                                      }
                                    }));
                                  }}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="block font-bold text-slate-600 mb-1">Mobile</label>
                                <input
                                  type="text"
                                  placeholder="Mobile Number"
                                  value={contact.mobile || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setFormData(prev => ({
                                      ...prev,
                                      departmentContacts: {
                                        ...prev.departmentContacts,
                                        [deptKey]: [{ ...contact, mobile: val }]
                                      }
                                    }));
                                  }}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="block font-bold text-slate-600 mb-1">Email</label>
                                <input
                                  type="email"
                                  placeholder="Email Address"
                                  value={contact.email || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setFormData(prev => ({
                                      ...prev,
                                      departmentContacts: {
                                        ...prev.departmentContacts,
                                        [deptKey]: [{ ...contact, email: val }]
                                      }
                                    }));
                                  }}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-none"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
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
                    <div className="space-y-4">
                      <h4 className="font-extrabold text-slate-900">Tax & Financial Info</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-slate-600 font-bold mb-1.5">PAN Number</label>
                          <input
                            type="text"
                            value={formData.financialInfo.panNumber}
                            onChange={(e) => setFormData({ ...formData, financialInfo: { ...formData.financialInfo, panNumber: e.target.value } })}
                            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                            placeholder="AAACA1234F"
                          />
                        </div>

                        <div>
                          <label className="block text-slate-600 font-bold mb-1.5">GST Number</label>
                          <input
                            type="text"
                            value={formData.financialInfo.gstNumber}
                            onChange={(e) => setFormData({ ...formData, financialInfo: { ...formData.financialInfo, gstNumber: e.target.value } })}
                            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
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
                          <label className="block text-slate-600 font-bold mb-1.5">MSME Category *</label>
                          <select
                            value={formData.financialInfo.msmeCategory || 'small'}
                            onChange={(e) => setFormData({ ...formData, financialInfo: { ...formData.financialInfo, msmeCategory: e.target.value } })}
                            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 capitalize"
                          >
                            <option value="very large">Very Large</option>
                            <option value="large">Large</option>
                            <option value="big">Big</option>
                            <option value="mid">Mid</option>
                            <option value="small">Small</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-slate-600 font-bold mb-1.5">Credit Period (Days)</label>
                          <input
                            type="number"
                            min="0"
                            value={formData.creditPeriod}
                            onChange={(e) => setFormData({ ...formData, creditPeriod: Math.max(0, parseInt(e.target.value) || 0) })}
                            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                            placeholder="e.g. 30"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-slate-200">
                      <h4 className="font-extrabold text-slate-900">Bank Details</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-slate-600 font-bold mb-1.5">Name of Bank</label>
                          <input
                            type="text"
                            value={formData.bankDetails.bankName}
                            onChange={(e) => setFormData({ ...formData, bankDetails: { ...formData.bankDetails, bankName: e.target.value } })}
                            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                            placeholder="e.g. HDFC Bank"
                          />
                        </div>

                        <div>
                          <label className="block text-slate-600 font-bold mb-1.5">Account No.</label>
                          <input
                            type="text"
                            value={formData.bankDetails.accountNumber}
                            onChange={(e) => setFormData({ ...formData, bankDetails: { ...formData.bankDetails, accountNumber: e.target.value } })}
                            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                            placeholder="e.g. 50100012345678"
                          />
                        </div>

                        <div>
                          <label className="block text-slate-600 font-bold mb-1.5">IFSC Code</label>
                          <input
                            type="text"
                            value={formData.bankDetails.ifscCode}
                            onChange={(e) => setFormData({ ...formData, bankDetails: { ...formData.bankDetails, ifscCode: e.target.value } })}
                            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                            placeholder="e.g. HDFC0001234"
                          />
                        </div>

                        <div>
                          <label className="block text-slate-600 font-bold mb-1.5">Type of Account</label>
                          <select
                            value={formData.bankDetails.accountType}
                            onChange={(e) => setFormData({ ...formData, bankDetails: { ...formData.bankDetails, accountType: e.target.value } })}
                            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                          >
                            <option value="Current">Current Account</option>
                            <option value="Savings">Savings Account</option>
                            <option value="Overdraft">Overdraft Account</option>
                            <option value="Cash Credit">Cash Credit Account</option>
                          </select>
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-slate-600 font-bold mb-1.5">Bank Address</label>
                          <textarea
                            rows={2}
                            value={formData.bankDetails.bankAddress}
                            onChange={(e) => setFormData({ ...formData, bankDetails: { ...formData.bankDetails, bankAddress: e.target.value } })}
                            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl"
                            placeholder="e.g. Branch address, Street, City, State..."
                          />
                        </div>
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
                        Save Financial & Bank Block
                      </button>
                    </div>
                  </div>
                )}

                {/* 5. Document Uploads (Cloudinary Integration) */}
                {formTab === 'documents' && (
                  <div className="space-y-6 text-xs font-semibold">
                    <h4 className="font-extrabold text-slate-900">Compulsory Documents (3 Required)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {formData.documents.map((doc, docIdx) => (
                        <div key={docIdx} className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 flex flex-col justify-between">
                          <div>
                            <span className="px-2.5 py-1 bg-indigo-600 text-white font-extrabold text-[10px] rounded-lg">
                              {doc.docType}
                            </span>
                            <p className="text-xs font-bold text-slate-900 mt-2">{doc.docName || `Select ${doc.docType} File`}</p>
                            {doc.fileUrl && (
                              <p className="text-[10px] text-emerald-600 font-mono font-bold mt-1 break-all">
                                ✓ Document Uploaded
                              </p>
                            )}
                          </div>

                          <div>
                            <label className="flex items-center justify-center gap-2 px-3.5 py-2.5 bg-indigo-50 text-indigo-600 font-bold text-xs rounded-xl cursor-pointer hover:bg-indigo-100 transition-all">
                              <Upload className="w-4 h-4" />
                              {uploadingDoc[docIdx] ? 'Uploading document...' : 'Choose File to Upload'}
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
                      <h4 className="font-extrabold text-slate-900">Production Sections ({formData.productionSections.length})</h4>
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
                          <div className="p-2 bg-indigo-600 text-white rounded-xl text-xs font-bold min-w-[32px] text-center">{sIdx + 1}</div>
                          <h5 className="flex-1 font-extrabold text-slate-900 text-sm">Section {sIdx + 1}</h5>
                          <button type="button" onClick={() => removeProductionSection(sIdx)} className="px-3 py-1.5 bg-rose-50 text-rose-600 rounded-xl font-bold text-xs hover:bg-rose-100 flex items-center gap-1">
                            <Trash2 className="w-3 h-3" /> Remove
                          </button>
                        </div>

                        {/* Section Fields */}
                        {/* Section Fields - Only Section Name and Location */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] text-slate-500 font-bold mb-1 block">Section Name *</label>
                            <input type="text" placeholder="e.g. Machining Section" value={sec.sectionName} onChange={(e) => updateProductionSection(sIdx, 'sectionName', e.target.value)} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm" />
                          </div>
                          <div>
                            <label className="text-[11px] text-slate-500 font-bold mb-1 block">Location</label>
                            <input type="text" placeholder="Bay / Floor / Block" value={sec.location || ''} onChange={(e) => updateProductionSection(sIdx, 'location', e.target.value)} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm" />
                          </div>
                        </div>

                        {/* Section Direct Products */}
                        <div className="space-y-3 pt-2 border-t border-slate-200/80">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-extrabold text-indigo-700">Section Installed Products ({(sec.installedProducts || []).length})</span>
                            <button type="button" onClick={() => openProductPicker(sIdx, null)} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 font-bold rounded-lg text-[10px] hover:bg-indigo-100 flex items-center gap-1">
                              <Package className="w-2.5 h-2.5" /> From Product Master
                            </button>
                          </div>

                          {(sec.installedProducts || []).map((prod, pIdx) => (
                            <div key={pIdx} className="p-3.5 bg-white rounded-2xl border border-slate-200 space-y-2">
                              <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                                <span className="text-xs font-extrabold text-slate-700 truncate">Section Product #{pIdx + 1} — {prod.productName || 'New Product'}</span>
                                <button type="button" onClick={() => removeSectionInstalledProduct(sIdx, pIdx)} className="px-2 py-0.5 bg-rose-50 text-rose-500 rounded-lg font-bold text-[10px] hover:bg-rose-100 flex items-center gap-1">
                                  <Trash2 className="w-3 h-3" /> Remove
                                </button>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                                <div>
                                  <label className="text-[10px] text-slate-400 font-bold mb-0.5 block">Product Name *</label>
                                  <input type="text" placeholder="Product Name" value={prod.productName} onChange={(e) => updateSectionInstalledProduct(sIdx, pIdx, 'productName', e.target.value)} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold" />
                                </div>
                                <div>
                                  <label className="text-[10px] text-slate-400 font-bold mb-0.5 block">Model Name</label>
                                  <input type="text" placeholder="Model Name" value={prod.modelNumber || ''} onChange={(e) => updateSectionInstalledProduct(sIdx, pIdx, 'modelNumber', e.target.value)} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold" />
                                </div>
                                <div>
                                  <label className="text-[10px] text-slate-400 font-bold mb-0.5 block">Serial Number</label>
                                  <input type="text" placeholder="Serial No" value={prod.machineSerialNo || ''} onChange={(e) => updateSectionInstalledProduct(sIdx, pIdx, 'machineSerialNo', e.target.value)} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold" />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Sub Sections */}
                        <div className="pl-4 border-l-2 border-indigo-200 space-y-4 mt-3">
                          <div className="flex items-center justify-between">
                            <h6 className="text-xs font-extrabold text-indigo-700 tracking-wider">Sub Sections ({(sec.subSections || []).length})</h6>
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

                              {/* Sub Section Fields - Only Sub Section Name */}
                              <div>
                                <label className="text-[10px] text-slate-400 font-bold mb-1 block">Sub Section Name *</label>
                                <input type="text" placeholder="e.g. Assembly Sub-Section" value={sub.subSectionName} onChange={(e) => updateSubSection(sIdx, subIdx, 'subSectionName', e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm" />
                              </div>

                              {/* Installed Products */}
                              <div className="space-y-3 mt-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-extrabold text-slate-600">{(sub.installedProducts || []).length} Installed Products</span>
                                  <div className="flex items-center gap-1.5">
                                    <button type="button" onClick={() => openProductPicker(sIdx, subIdx)} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 font-bold rounded-lg text-[10px] hover:bg-indigo-100 flex items-center gap-1">
                                      <Package className="w-2.5 h-2.5" /> From Product Master
                                    </button>
                                  </div>
                                </div>

                                {(sub.installedProducts || []).map((prod, pIdx) => (
                                  <div key={pIdx} className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-3">
                                    {/* Product Header */}
                                    <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                                      <span className="text-xs font-extrabold text-slate-700 truncate">Product #{pIdx + 1} — {prod.productName || 'New Product'}</span>
                                      <button type="button" onClick={() => removeInstalledProduct(sIdx, subIdx, pIdx)} className="px-2 py-1 bg-rose-50 text-rose-500 rounded-lg font-bold text-[10px] hover:bg-rose-100 flex items-center gap-1">
                                        <Trash2 className="w-3 h-3" /> Remove
                                      </button>
                                    </div>

                                    {/* Only Product Name, Model Name, and Serial No */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                      <div>
                                        <label className="text-[10px] text-slate-400 font-bold mb-0.5 block">Product Name *</label>
                                        <input type="text" placeholder="Product Name" value={prod.productName} onChange={(e) => updateInstalledProduct(sIdx, subIdx, pIdx, 'productName', e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold" />
                                      </div>
                                      <div>
                                        <label className="text-[10px] text-slate-400 font-bold mb-0.5 block">Model Name</label>
                                        <input type="text" placeholder="Model Name" value={prod.modelNumber || ''} onChange={(e) => updateInstalledProduct(sIdx, subIdx, pIdx, 'modelNumber', e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold" />
                                      </div>
                                      <div>
                                        <label className="text-[10px] text-slate-400 font-bold mb-0.5 block">Serial Number</label>
                                        <input type="text" placeholder="Serial No" value={prod.machineSerialNo || ''} onChange={(e) => updateInstalledProduct(sIdx, subIdx, pIdx, 'machineSerialNo', e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold" />
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
                      className="px-7 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-xs shadow-xl shadow-indigo-600/30 transition-all flex items-center gap-2 disabled:opacity-50"
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* PRODUCT MASTER PICKER MODAL */}
      {productPickerOpen.open && (
        <div className="fixed inset-0 lg:left-64 bg-slate-900/60 backdrop-blur-sm z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col border border-slate-100 overflow-hidden">
            {/* Picker Header */}
            <div className="p-5 bg-indigo-600 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-bold flex items-center gap-2"><Package className="w-5 h-5" /> Select from Product Master</h3>
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
                  placeholder="Search products by name, description, model, serial number..."
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
                    const matchName = (p.name || '').toLowerCase().includes(q);
                    const matchDesc = (p.description || '').toLowerCase().includes(q);
                    let matchModel = false;
                    (p.models || []).forEach(m => {
                      if ((m.modelName || '').toLowerCase().includes(q)) matchModel = true;
                      (m.serialNumbers || []).forEach(s => {
                        if ((s || '').toLowerCase().includes(q)) matchModel = true;
                      });
                    });
                    return matchName || matchDesc || matchModel;
                  })
                  .map((p) => (
                    <div
                      key={p._id}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2"
                    >
                      <div className="flex items-center gap-3">
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt={p.name} className="w-12 h-12 rounded-xl border border-slate-200 object-cover shrink-0" />
                        ) : (
                          <div className="w-12 h-12 rounded-xl border border-slate-200 bg-white flex items-center justify-center shrink-0">
                            <Package className="w-5 h-5 text-slate-300" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-extrabold text-slate-900 truncate">{p.name}</p>
                          {p.description && <p className="text-[10px] text-slate-400 font-medium truncate">{p.description}</p>}
                        </div>
                      </div>

                      {/* Models & Serial Numbers Picker for this Product */}
                      {p.models && p.models.length > 0 ? (
                        <div className="space-y-2 pt-1 border-t border-slate-200/60">
                          <span className="text-[10px] font-extrabold text-slate-400 tracking-wider block">Select Model & Serial Number:</span>
                          <div className="space-y-2">
                            {p.models.map((m, mIdx) => (
                              <div key={mIdx} className="p-2.5 bg-white border border-slate-200 rounded-xl space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-extrabold text-indigo-700">{m.modelName}</span>
                                  {(!m.serialNumbers || m.serialNumbers.length === 0) && (
                                    <button
                                      type="button"
                                      onClick={() => selectProductFromMaster(p, m, null)}
                                      className="px-2 py-0.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white font-bold text-[10px] rounded-md transition-all"
                                    >
                                      Select Model
                                    </button>
                                  )}
                                </div>

                                {m.serialNumbers && m.serialNumbers.length > 0 && (
                                  <div className="space-y-1 pt-1 border-t border-slate-100">
                                    <span className="text-[9px] text-slate-400 font-bold block">Click a Serial Number to pick:</span>
                                    <div className="flex flex-wrap gap-1.5">
                                      {m.serialNumbers.map((sn, sIdx) => (
                                        <button
                                          key={sIdx}
                                          type="button"
                                          onClick={() => selectProductFromMaster(p, m, sn)}
                                          className="px-2.5 py-1 bg-slate-50 hover:bg-indigo-600 hover:text-white border border-slate-200 hover:border-indigo-600 rounded-lg text-[11px] font-mono font-bold text-slate-800 transition-all flex items-center gap-1 group/sn"
                                        >
                                          <span>{sn}</span>
                                          <span className="text-[9px] text-indigo-600 group-hover/sn:text-white font-sans font-bold">Select</span>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => selectProductFromMaster(p, null, null)}
                          className="w-full text-center py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl transition-all"
                        >
                          Select Product
                        </button>
                      )}
                    </div>
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
            <h3 className="text-base font-bold text-slate-900">Delete Customer Record</h3>
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
