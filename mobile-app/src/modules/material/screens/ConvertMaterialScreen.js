import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Camera,
  FileText,
  Paperclip,
  AlertTriangle,
  Trash2,
  Building2,
  Check,
  Search,
  X,
  ChevronDown,
  RefreshCw,
  ShieldCheck,
  MapPin,
  Info,
  UserCheck,
  User,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialHeader from '../components/MaterialHeader';
import MaterialModuleFooter from '../components/MaterialModuleFooter';
import GeoCameraModal from '../components/GeoCameraModal';
import materialApi from '../api/materialApi';

const ConvertMaterialScreen = ({ route, navigation }) => {
  const initialBarcode = route.params?.barcode || '';
  const defaultType = route.params?.defaultType || 'DC FOC';

  const [barcode, setBarcode] = useState(initialBarcode);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Lists from backend
  const [tallyCustomers, setTallyCustomers] = useState([]);
  const [isRefreshingTally, setIsRefreshingTally] = useState(false);

  // Form states for conversion (DC Internal, DC FOC, Invoice)
  const [docType, setDocType] = useState(
    ['DC Internal', 'DC FOC', 'Invoice'].includes(defaultType) ? defaultType : 'DC FOC'
  );
  const [remarks, setRemarks] = useState('');
  const [selectedCustomerName, setSelectedCustomerName] = useState('');
  const [closePhotos, setClosePhotos] = useState([]); // array of { url, capturedAt, gps, coordinates }
  const [closeAttachments, setCloseAttachments] = useState([]); // array of { name, url, type, size, uploadedAt }

  // Modal Picker States
  const [customerPickerVisible, setCustomerPickerVisible] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');

  // Team Lead / Reports-To for DC Internal
  const [teamLeadName, setTeamLeadName] = useState('');
  const [teamLeadId, setTeamLeadId] = useState('');

  // Management Approver for DC FOC and Invoice
  const [managementApproverId, setManagementApproverId] = useState('');
  const [managementUsers, setManagementUsers] = useState([]);
  const [managementPickerVisible, setManagementPickerVisible] = useState(false);
  const [managementSearchQuery, setManagementSearchQuery] = useState('');

  // Camera & Submission States
  const [cameraModalVisible, setCameraModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, [barcode]);

  const loadInitialData = async () => {
    try {
      if (barcode) {
        loadBarcodeDetail();
      } else {
        setLoading(false);
      }
      loadTallyCustomers();

      // Load logged-in user profile & employees list
      const empRes = await materialApi.getUsers().catch(() => ({ data: [] }));
      const allUsers = (empRes && (empRes.data || empRes)) || [];
      const usersList = Array.isArray(allUsers) ? allUsers : [];

      // Filter management approver candidates
      const mgmtList = usersList.filter((emp) => {
        if (!emp) return false;
        const roleLower = String(emp.role || '').toLowerCase();
        const adminTypeLower = String(emp.departmentAdminType || emp.adminType || '').toLowerCase();
        const catLower = String(emp.category || emp.levelCategory || emp.effectiveCategory || '').toLowerCase();
        const dName = String(emp.department?.name || emp.department || '').toLowerCase();
        return (
          adminTypeLower === 'management' ||
          roleLower === 'management' ||
          dName.includes('management') ||
          catLower === 'management'
        );
      });
      setManagementUsers(
        mgmtList.length > 0
          ? mgmtList
          : usersList.filter(
              (u) =>
                String(u.role || '').toLowerCase().includes('admin') ||
                String(u.departmentAdminType || '').toLowerCase() === 'management'
            )
      );

      // Resolve current user profile for reportsTo / Team Lead
      const userStr = await AsyncStorage.getItem('user');
      let me = userStr ? JSON.parse(userStr) : null;
      if (!me?.reportsTo && !me?.reportingTo && !me?.teamLead) {
        try {
          const profileRes = await materialApi.getCurrentUser().catch(() => null);
          if (profileRes) me = profileRes.user || profileRes.data || profileRes;
        } catch (_) {}
      }

      if (me) {
        let tlName = '';
        let tlId = '';
        if (me.reportsTo) {
          if (typeof me.reportsTo === 'object') {
            tlName = me.reportsTo.fullName || me.reportsTo.name || '';
            tlId = me.reportsTo._id || me.reportsTo.id || '';
          } else if (typeof me.reportsTo === 'string') {
            tlId = me.reportsTo;
            const found = usersList.find((u) => String(u._id || u.id) === String(me.reportsTo));
            if (found) tlName = found.fullName || found.name || '';
          }
        }
        if (!tlName && me.reportingTo) {
          if (typeof me.reportingTo === 'object') {
            tlName = me.reportingTo.fullName || me.reportingTo.name || '';
            tlId = me.reportingTo._id || me.reportingTo.id || '';
          } else if (typeof me.reportingTo === 'string') {
            tlId = me.reportingTo;
            const found = usersList.find((u) => String(u._id || u.id) === String(me.reportingTo));
            if (found) tlName = found.fullName || found.name || '';
          }
        }
        if (!tlName && me.teamLead) {
          if (typeof me.teamLead === 'object') {
            tlName = me.teamLead.fullName || me.teamLead.name || '';
            tlId = me.teamLead._id || me.teamLead.id || '';
          } else if (typeof me.teamLead === 'string') {
            tlId = me.teamLead;
            const found = usersList.find((u) => String(u._id || u.id) === String(me.teamLead));
            if (found) tlName = found.fullName || found.name || '';
          }
        }
        if (!tlName && (me.department || me.departmentId)) {
          const myDeptId = String(
            typeof me.department === 'object' ? me.department._id || me.department.id : me.department
          );
          const deptTL = usersList.find((u) => {
            const uDeptId = String(
              typeof u.department === 'object' ? u.department._id || u.department.id : u.department
            );
            const uRole = String(u.role || '').toLowerCase();
            return uDeptId === myDeptId && (uRole.includes('lead') || uRole.includes('tl') || u.isTeamLead);
          });
          if (deptTL) {
            tlName = deptTL.fullName || deptTL.name || '';
            tlId = deptTL._id || deptTL.id || '';
          }
        }

        setTeamLeadName(tlName || 'Department Team Leader');
        setTeamLeadId(tlId);
      }
    } catch (e) {
      console.warn('Error loading initial data in ConvertMaterialScreen:', e);
    }
  };

  const loadBarcodeDetail = async () => {
    try {
      setLoading(true);
      const res = await materialApi.getBarcodeDetails(barcode);
      if (res) {
        setData(res.data || res);
      }
    } catch (err) {
      console.warn('Failed to fetch barcode convert detail', err);
    } finally {
      setLoading(false);
    }
  };

  const loadTallyCustomers = async () => {
    try {
      setIsRefreshingTally(true);
      const res = await materialApi.getTallyCustomers();
      if (res && (res.customers || res.data?.customers || Array.isArray(res.data) || Array.isArray(res))) {
        setTallyCustomers(res.customers || res.data?.customers || res.data || (Array.isArray(res) ? res : []));
      }
    } catch (err) {
      console.warn('Could not load Tally customers', err);
    } finally {
      setIsRefreshingTally(false);
    }
  };


  // Pending Actions Check
  const bc = data?.barcode || data?.data?.barcode || data;
  const splits = data?.splits || [];
  const exchanges = data?.exchanges || [];
  const transfers = data?.transfers || [];
  const returns = data?.returns || [];
  const closeRequests = data?.closeRequests || [];

  const isSplitPending = Array.isArray(splits) && splits.some((s) => s.status === 'pending');
  const isExchangePending = Array.isArray(exchanges) && exchanges.some((e) => e.status === 'pending');
  const isTransferPending = Array.isArray(transfers) && transfers.some((t) => ['pending', 'approved'].includes(t.status) && t.status !== 'rejected' && t.status !== 'completed' && t.status !== 'accepted');
  const isReturnPending = Array.isArray(returns) && returns.some((r) =>
    ['pending', 'handler_assigned', 'collected', 'store_received'].includes(r.status) &&
    r.status !== 'completed' && r.status !== 'rejected' && r.status !== 'approved'
  );
  const isClosePending = Array.isArray(closeRequests) && closeRequests.some((c) =>
    ['pending', 'pending_accounts_approval', 'pending_store_acceptance'].includes(c.status)
  );

  const hasPendingAction =
    isSplitPending || isExchangePending || isTransferPending || isReturnPending || isClosePending;

  // Extract Material Details
  const material = bc?.transaction?.materials?.find((m) =>
    m.barcodes?.some((b) => (typeof b === 'string' ? b : b.barcode) === barcode)
  );
  const matName = material?.name || bc?.materialName || 'N/A';
  const matDesc = material?.description || bc?.description || '';
  const matQty = material?.quantity || bc?.quantity || 1;
  const matUnit = material?.unit || bc?.unit || 'pcs';
  const matPrice = material?.price || bc?.price || 0;
  const totalValuation = matQty * matPrice;

  // Photo capture callback with GPS metadata
  const handlePhotoCaptured = (geoData) => {
    if (!geoData || !geoData.photoUrl) return;
    const newPhoto = {
      url: geoData.photoUrl,
      capturedAt: geoData.capturedAt || new Date().toISOString(),
      coordinates: geoData.coordinates || [],
      gps: geoData.gps || (geoData.coordinates ? { lat: geoData.coordinates[1], lng: geoData.coordinates[0], address: 'MIDC Kolhapur, India' } : { lat: 18.5204, lng: 73.8567, address: 'MIDC Kolhapur, India' }),
    };
    setClosePhotos((prev) => [...prev, newPhoto]);
    setCameraModalVisible(false);
  };

  const handleRemovePhoto = (index) => {
    setClosePhotos((prev) => prev.filter((_, i) => i !== index));
  };

  // Document Attachment Picker
  const handlePickAttachment = () => {
    Alert.alert(
      'Attach Document / Proof',
      'Select document type to attach:',
      [
        {
          text: docType === 'Invoice' ? 'Tax Invoice / PO Copy (.pdf)' : 'Challan / Gate Pass (.pdf)',
          onPress: () => {
            const fileName = `${docType === 'Invoice' ? 'InvoiceCopy' : 'GatePass'}_${Date.now()}.pdf`;
            setCloseAttachments((prev) => [
              ...prev,
              {
                name: fileName,
                url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
                type: 'application/pdf',
                size: 245000,
                uploadedAt: new Date().toISOString(),
              },
            ]);
          },
        },
        {
          text: 'Signed Customer Acceptance (.docx)',
          onPress: () => {
            const fileName = `CustomerAcceptance_${Date.now()}.docx`;
            setCloseAttachments((prev) => [
              ...prev,
              {
                name: fileName,
                url: 'https://example.com/note.docx',
                type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                size: 154000,
                uploadedAt: new Date().toISOString(),
              },
            ]);
          },
        },
        {
          text: 'Challan / Physical Receipt Photo (.jpg)',
          onPress: () => {
            const fileName = `ScanDoc_${Date.now()}.jpg`;
            setCloseAttachments((prev) => [
              ...prev,
              {
                name: fileName,
                url: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=600&q=80',
                type: 'image/jpeg',
                size: 320000,
                uploadedAt: new Date().toISOString(),
              },
            ]);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleRemoveAttachment = (index) => {
    setCloseAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // Submit Handler
  const handleSubmit = async () => {
    if (submitting || isSubmitted) return;
    if (hasPendingAction) {
      const activeType = isSplitPending ? 'Split' : isExchangePending ? 'Exchange' : isTransferPending ? 'Transfer' : isReturnPending ? 'Return' : 'Conversion';
      Alert.alert(
        'Action Pending',
        `This barcode has an active ${activeType} request in progress. Please wait until it is resolved before creating a new conversion.`
      );
      return;
    }
    if (!barcode.trim()) {
      Alert.alert('Validation Error', 'Please enter or scan a barcode.');
      return;
    }

    if (['DC FOC', 'Invoice'].includes(docType) && !selectedCustomerName) {
      Alert.alert('Validation Error', `Please select a customer from Tally Prime for ${docType}.`);
      return;
    }
    if (['DC FOC', 'Invoice'].includes(docType) && !managementApproverId) {
      Alert.alert('Validation Error', `Please choose a Management Approver for ${docType}.`);
      return;
    }
    if (!remarks.trim()) {
      Alert.alert('Validation Error', 'Please enter remarks / business justification.');
      return;
    }
    if (closePhotos.length === 0) {
      Alert.alert('Validation Error', 'Please capture at least one live verification photo with GPS coordinates.');
      return;
    }

    try {
      setSubmitting(true);
      const firstGps = closePhotos[0]?.gps || {};
      const latestGps = {
        lat: firstGps.latitude || firstGps.lat || closePhotos[0]?.coordinates?.[1] || 18.5204,
        lng: firstGps.longitude || firstGps.lng || closePhotos[0]?.coordinates?.[0] || 73.8567,
        address: firstGps.address || 'MIDC Kolhapur, Maharashtra, India',
      };

      const payload = {
        barcode: barcode.trim().toUpperCase(),
        documentType: docType,
        documentNumber: 'N/A',
        remarks: remarks.trim(),
        customerName: ['DC FOC', 'Invoice'].includes(docType) ? selectedCustomerName : undefined,
        managementApprover: ['DC FOC', 'Invoice'].includes(docType) ? managementApproverId : undefined,
        teamLead: docType === 'DC Internal' ? (teamLeadId || undefined) : undefined,
        photos: closePhotos.map((p) => ({
          url: p.url,
          capturedAt: p.capturedAt,
          coordinates: p.coordinates,
          gps: p.gps || latestGps,
        })),
        gps: latestGps,
        documents: closeAttachments,
      };

      const res = await materialApi.convertBarcode(payload);
      if (res && (res.success !== false && (res._id || res.data || res.message))) {
        setIsSubmitted(true);
        // Reset form state
        setRemarks('');
        setSelectedCustomerName('');
        setManagementApproverId('');
        setClosePhotos([]);
        setCloseAttachments([]);

        Alert.alert(
          'Conversion Request Submitted',
          docType === 'DC Internal'
            ? `Barcode conversion request to DC Internal submitted! It will route to your Team Leader (${teamLeadName || 'Immediate Manager'}) ➔ Store Admin.`
            : `Barcode conversion request to ${docType} submitted! It will route to Management Approver (${selectedMgmtObj ? (selectedMgmtObj.fullName || selectedMgmtObj.name) : 'Selected Approver'}) ➔ Accounts Admin ➔ Store Admin.`,
          [
            {
              text: 'OK',
              onPress: () => {
                navigation.replace('BarcodeDetailScreen', { barcode: barcode.trim().toUpperCase() });
              },
            },
          ]
        );
      } else {
        Alert.alert('Error', res?.message || 'Conversion request failed.');
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <MaterialHeader title="Convert Barcode" navigation={navigation} />
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading Barcode Details...</Text>
        </View>
      </SafeAreaView>
    );
  }
  const selectedMgmtObj = managementUsers.find(
    (u) => String(u._id || u.id) === String(managementApproverId)
  );

  const filteredCustomers = tallyCustomers.filter((cust) => {
    if (!customerSearchQuery.trim()) return true;
    const cName = (typeof cust === 'string' ? cust : cust.name || '').toLowerCase();
    return cName.includes(customerSearchQuery.toLowerCase());
  });

  const filteredManagementUsers = managementUsers.filter((u) => {
    if (!managementSearchQuery.trim()) return true;
    const q = managementSearchQuery.toLowerCase().trim();
    const name = (u.fullName || u.name || '').toLowerCase();
    const empId = (u.employeeId || u.employeeIdCode || '').toLowerCase();
    const dept = (typeof u.department === 'object' ? u.department?.name : u.department || '').toLowerCase();
    return name.includes(q) || empId.includes(q) || dept.includes(q);
  });

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title={docType === 'Invoice' ? 'Convert to Invoice' : 'Convert to Delivery Challan'}
        subtitle={`Conversion Lifecycle • Serial: ${barcode || 'Selected'}`}
        navigation={navigation}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {hasPendingAction && (
          <View style={styles.pendingBannerBox}>
            <AlertTriangle size={18} color="#d97706" />
            <Text style={styles.pendingBannerText}>
              Note: This barcode currently has an active {isSplitPending ? 'Split' : isExchangePending ? 'Exchange' : isTransferPending ? 'Transfer' : isReturnPending ? 'Return' : 'Conversion'} request in progress.
            </Text>
          </View>
        )}

        {/* Material Specs Summary Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <FileText size={18} color="#2563eb" />
            <Text style={styles.cardHeaderTitle}>Material & Asset Details</Text>
          </View>

          <View style={styles.detailBox}>
            <Text style={styles.detailLabel}>MATERIAL NAME</Text>
            <Text style={styles.detailValBold}>{matName}</Text>
          </View>

          {matDesc ? (
            <View style={styles.detailBox}>
              <Text style={styles.detailLabel}>DESCRIPTION</Text>
              <Text style={styles.detailValSub}>{matDesc}</Text>
            </View>
          ) : null}

          <View style={styles.grid2Row}>
            <View style={[styles.detailBox, { flex: 1 }]}>
              <Text style={styles.detailLabel}>QUANTITY</Text>
              <Text style={styles.detailValBold}>
                {matQty} {matUnit}
              </Text>
            </View>
            <View style={[styles.detailBox, { flex: 1 }]}>
              <Text style={styles.detailLabel}>UNIT PRICE</Text>
              <Text style={styles.detailValBold}>₹{matPrice}</Text>
            </View>
          </View>

          <View style={[styles.detailBox, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}>
            <Text style={[styles.detailLabel, { color: '#1d4ed8' }]}>TOTAL VALUATION</Text>
            <Text style={[styles.detailValBold, { color: '#1e40af', fontSize: 16 }]}>
              ₹{totalValuation.toLocaleString('en-IN')}
            </Text>
          </View>

          <View style={styles.grid2Row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailLabel}>CURRENT OWNER</Text>
              <Text style={styles.detailValSub}>{bc?.owner?.fullName || 'Store Warehouse'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailLabel}>STATUS</Text>
              <Text style={[styles.detailValSub, { color: '#16a34a', fontWeight: 'bold' }]}>
                {bc?.status || 'Active'}
              </Text>
            </View>
          </View>
        </View>

        {/* Conversion Form Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Conversion Form</Text>

          {/* 1. Document Type Toggle */}
          <Text style={styles.fieldLabel}>CHOOSE TARGET DOCUMENT TYPE *</Text>
          <View style={styles.docTypeRow}>
            {[
              {
                key: 'DC Internal',
                label: 'DC Internal',
                sub: 'Internal delivery',
                color: '#0284c7',
              },
              {
                key: 'DC FOC',
                label: 'DC FOC',
                sub: 'Free-of-cost note',
                color: '#4f46e5',
              },
              {
                key: 'Invoice',
                label: 'Tax Invoice',
                sub: 'Commercial sale',
                color: '#16a34a',
              },
            ].map((item) => {
              const isSelected = docType === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[
                    styles.docChip,
                    isSelected && { backgroundColor: item.color, borderColor: item.color },
                  ]}
                  onPress={() => {
                    setDocType(item.key);
                    setSelectedCustomerName('');
                  }}
                >
                  <Text style={[styles.docChipText, isSelected && { color: '#ffffff' }]}>
                    {item.label}
                  </Text>
                  <Text
                    style={[
                      styles.docChipSub,
                      isSelected ? { color: 'rgba(255,255,255,0.85)' } : { color: '#64748b' },
                    ]}
                  >
                    {item.sub}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Workflow Route Preview Badge */}
          <View style={styles.workflowCard}>
            <ShieldCheck size={16} color={docType === 'DC Internal' ? '#0284c7' : docType === 'DC FOC' ? '#4f46e5' : '#16a34a'} />
            <Text style={styles.workflowText}>
              {docType === 'DC Internal'
                ? `Routing: Requester ➔ Team Leader (${teamLeadName || 'Immediate Manager'}) ➔ Store Admin ➔ Closed (Godown Transfer)`
                : docType === 'DC FOC'
                ? `Routing: Requester ➔ Management (${selectedMgmtObj ? (selectedMgmtObj.fullName || selectedMgmtObj.name) : 'Selected Approver'}) ➔ Accounts Admin ➔ Store Admin ➔ Closed (Delivery Note)`
                : `Routing: Requester ➔ Management (${selectedMgmtObj ? (selectedMgmtObj.fullName || selectedMgmtObj.name) : 'Selected Approver'}) ➔ Accounts Admin ➔ Store Admin ➔ Closed (Tax Invoice)`}
            </Text>
          </View>

          {/* DC Internal: Assigned Team Lead Display */}
          {docType === 'DC Internal' && (
            <View style={{ backgroundColor: '#f0f9ff', borderColor: '#bae6fd', borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 12 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#0369a1', letterSpacing: 0.5, marginBottom: 4 }}>
                ASSIGNED TEAM LEADER / IMMEDIATE REPORTS TO
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#e0f2fe', alignItems: 'center', justifyContent: 'center' }}>
                  <UserCheck size={20} color="#0284c7" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#0c4a6e' }}>
                    {teamLeadName || 'Department Team Leader'}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#0284c7', marginTop: 1 }}>
                    Direct supervisor & initial approval reviewer for internal delivery
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Customer & Management Fields (for DC FOC and Invoice) */}
          {['DC FOC', 'Invoice'].includes(docType) && (
            <>
              {/* Choose Customer from Tally */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.fieldLabel}>CHOOSE CUSTOMER (TALLY SUNDRY DEBTORS) *</Text>
                <TouchableOpacity
                  onPress={loadTallyCustomers}
                  disabled={isRefreshingTally}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                >
                  {isRefreshingTally ? (
                    <ActivityIndicator size="small" color="#2563eb" />
                  ) : (
                    <>
                      <RefreshCw size={12} color="#2563eb" />
                      <Text style={{ fontSize: 11, color: '#2563eb', fontWeight: 'bold' }}>Sync Tally</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => {
                  setCustomerSearchQuery('');
                  setCustomerPickerVisible(true);
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <Building2 size={16} color="#64748b" />
                  <Text
                    style={[styles.pickerButtonText, !selectedCustomerName && { color: '#94a3b8' }]}
                    numberOfLines={1}
                  >
                    {selectedCustomerName || 'Select Customer Ledger from Tally...'}
                  </Text>
                </View>
                <ChevronDown size={18} color="#64748b" />
              </TouchableOpacity>

              {/* Choose Management Approver for DC FOC & Invoice */}
              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>CHOOSE MANAGEMENT APPROVER *</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => {
                  setManagementSearchQuery('');
                  setManagementPickerVisible(true);
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <UserCheck size={16} color={selectedMgmtObj ? '#4f46e5' : '#64748b'} />
                  <Text
                    style={[styles.pickerButtonText, !selectedMgmtObj && { color: '#94a3b8' }]}
                    numberOfLines={1}
                  >
                    {selectedMgmtObj
                      ? `${selectedMgmtObj.fullName || selectedMgmtObj.name}${selectedMgmtObj.department ? ` (${typeof selectedMgmtObj.department === 'object' ? selectedMgmtObj.department.name : selectedMgmtObj.department})` : ''}`
                      : 'Select Management Approver...'}
                  </Text>
                </View>
                <ChevronDown size={18} color="#64748b" />
              </TouchableOpacity>
            </>
          )}

          {/* Remarks / Business Justification */}
          <Text style={styles.fieldLabel}>REMARKS / BUSINESS JUSTIFICATION *</Text>
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={3}
            placeholder={
              docType === 'DC Internal'
                ? 'Provide reason for internal delivery or site consumption...'
                : docType === 'DC FOC'
                ? 'Provide business justification for Free-of-Cost customer handover...'
                : 'Provide tax billing, order reference, or commercial project context...'
            }
            placeholderTextColor="#94a3b8"
            value={remarks}
            onChangeText={setRemarks}
          />

          {/* Verification Photos with GeoCamera */}
          <View style={styles.subSection}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.fieldLabel}>LIVE GEOTAGGED VERIFICATION PHOTOS *</Text>
              <Text style={styles.counterText}>({closePhotos.length} photo(s))</Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <TouchableOpacity
                style={styles.actionOutlineBtn}
                onPress={() => setCameraModalVisible(true)}
              >
                <Camera size={16} color="#2563eb" />
                <Text style={styles.actionOutlineBtnText}>Open GeoCamera</Text>
              </TouchableOpacity>
            </View>

            {closePhotos.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                {closePhotos.map((p, idx) => (
                  <View key={idx} style={styles.photoThumbCard}>
                    <Image source={{ uri: p.url }} style={styles.photoThumbImg} />
                    <View style={styles.photoGpsOverlay}>
                      <MapPin size={10} color="#60a5fa" />
                      <Text style={styles.photoGpsText} numberOfLines={1}>
                        {p.gps?.lat ? `${p.gps.lat.toFixed(2)}, ${p.gps.lng.toFixed(2)}` : 'GPS Tagged'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.photoDeleteBtn}
                      onPress={() => handleRemovePhoto(idx)}
                    >
                      <Trash2 size={12} color="#ffffff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>

          {/* Document Attachments */}
          <View style={styles.subSection}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.fieldLabel}>SUPPORTING DOCUMENT ATTACHMENTS</Text>
              <Text style={styles.counterText}>({closeAttachments.length} file(s))</Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <TouchableOpacity style={styles.actionOutlineBtn} onPress={handlePickAttachment}>
                <Paperclip size={16} color="#2563eb" />
                <Text style={styles.actionOutlineBtnText}>Attach Document / Note</Text>
              </TouchableOpacity>
            </View>

            {closeAttachments.length > 0 && (
              <View style={{ gap: 6, marginTop: 10 }}>
                {closeAttachments.map((f, idx) => (
                  <View key={idx} style={styles.attachmentItem}>
                    <Paperclip size={14} color="#2563eb" />
                    <Text style={styles.attachmentName} numberOfLines={1}>
                      {f.name}
                    </Text>
                    <TouchableOpacity onPress={() => handleRemoveAttachment(idx)}>
                      <Text style={styles.removeText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Super Admin & Accounts Admin Governance Notice */}
          <View style={styles.superAdminNotice}>
            <Info size={14} color="#64748b" />
            <Text style={styles.superAdminNoticeText}>
              Accounts Admin and Super Admin govern approvals at every stage of the material movement lifecycle.
            </Text>
          </View>

          {/* Form Action Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => navigation.goBack()}
              disabled={submitting}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.submitBtn,
                {
                  backgroundColor:
                    docType === 'DC Internal' ? '#0284c7' : docType === 'DC FOC' ? '#4f46e5' : '#16a34a',
                },
                (submitting || isSubmitted) && { opacity: 0.7 },
              ]}
              onPress={handleSubmit}
              disabled={submitting || isSubmitted}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.submitBtnText}>Submit {docType} Request</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>


      {/* Customer Picker Modal */}
      <Modal
        visible={customerPickerVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setCustomerPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Tally Customer</Text>
              <TouchableOpacity onPress={() => setCustomerPickerVisible(false)}>
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchBox}>
              <Search size={16} color="#94a3b8" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search Tally customer ledger..."
                placeholderTextColor="#94a3b8"
                value={customerSearchQuery}
                onChangeText={setCustomerSearchQuery}
              />
            </View>

            <FlatList
              data={filteredCustomers}
              keyExtractor={(item, index) => (typeof item === 'string' ? item : item.name || `cust-${index}`)}
              renderItem={({ item }) => {
                const cName = typeof item === 'string' ? item : item.name || item;
                const isSelected = selectedCustomerName === cName;
                return (
                  <TouchableOpacity
                    style={[styles.listItem, isSelected && styles.listItemActive]}
                    onPress={() => {
                      setSelectedCustomerName(cName);
                      setCustomerPickerVisible(false);
                    }}
                  >
                    <Building2 size={18} color={isSelected ? '#2563eb' : '#64748b'} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.listItemName, isSelected && styles.listItemNameActive]}>
                        {cName}
                      </Text>
                      <Text style={styles.listItemSub}>Sundry Debtors Ledger</Text>
                    </View>
                    {isSelected && <Check size={16} color="#2563eb" />}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: '#94a3b8' }}>No customer ledgers found in Tally Prime.</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Management Approver Picker Modal */}
      <Modal
        visible={managementPickerVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setManagementPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose Management Approver</Text>
              <TouchableOpacity onPress={() => setManagementPickerVisible(false)}>
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchBox}>
              <Search size={16} color="#94a3b8" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search management approver..."
                placeholderTextColor="#94a3b8"
                value={managementSearchQuery}
                onChangeText={setManagementSearchQuery}
              />
            </View>

            <FlatList
              data={filteredManagementUsers}
              keyExtractor={(item, index) => String(item._id || item.id || `mgmt-${index}`)}
              renderItem={({ item }) => {
                const isSelected = String(managementApproverId) === String(item._id || item.id);
                const deptName = typeof item.department === 'object' ? item.department?.name : item.department || '';
                return (
                  <TouchableOpacity
                    style={[styles.listItem, isSelected && styles.listItemActive]}
                    onPress={() => {
                      setManagementApproverId(item._id || item.id);
                      setManagementPickerVisible(false);
                    }}
                  >
                    <UserCheck size={18} color={isSelected ? '#4f46e5' : '#64748b'} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.listItemName, isSelected && styles.listItemNameActive]}>
                        {item.fullName || item.name}
                      </Text>
                      <Text style={styles.listItemSub}>
                        {item.role || 'Management'}{deptName ? ` • ${deptName}` : ''}{item.employeeId ? ` • ID: ${item.employeeId}` : ''}
                      </Text>
                    </View>
                    {isSelected && <Check size={16} color="#4f46e5" />}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: '#94a3b8' }}>No management approvers found.</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Live GeoCamera Modal */}
      <GeoCameraModal
        visible={cameraModalVisible}
        onClose={() => setCameraModalVisible(false)}
        onCaptureSuccess={handlePhotoCaptured}
        title="Live Physical Verification Camera"
      />

      <MaterialModuleFooter navigation={navigation} currentScreen="barcodes" />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    gap: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 10,
  },
  cardHeaderTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  docTypeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  docChip: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  docChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1e293b',
  },
  docChipSub: {
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
  },
  workflowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
    borderRadius: 12,
    padding: 10,
  },
  workflowText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3730a3',
    flex: 1,
  },
  detailBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  detailLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  detailValBold: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  detailValSub: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  grid2Row: {
    flexDirection: 'row',
    gap: 10,
  },
  pickerButton: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
    flex: 1,
  },
  textArea: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0f172a',
    textAlignVertical: 'top',
    minHeight: 75,
  },
  subSection: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 12,
    gap: 6,
  },
  actionOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionOutlineBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563eb',
  },
  counterText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
  },
  photoThumbCard: {
    position: 'relative',
    width: 85,
    height: 85,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  photoThumbImg: {
    width: '100%',
    height: '100%',
  },
  photoGpsOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingVertical: 2,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  photoGpsText: {
    fontSize: 8,
    color: '#ffffff',
    fontWeight: '700',
    flex: 1,
  },
  photoDeleteBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(220, 38, 38, 0.85)',
    borderRadius: 8,
    padding: 3,
  },
  attachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  attachmentName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
    marginHorizontal: 8,
  },
  removeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#dc2626',
  },
  superAdminNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 6,
  },
  superAdminNoticeText: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
    flex: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 14,
    marginTop: 4,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  submitBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
  },
  pendingBannerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  pendingBannerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#b45309',
    flex: 1,
    lineHeight: 16,
  },
  blockedCard: {
    margin: 20,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    gap: 12,
  },
  blockedIconBox: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockedTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  blockedText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
  },
  backBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 6,
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
    padding: 16,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 6,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0f172a',
    marginLeft: 8,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  listItemActive: {
    backgroundColor: '#eff6ff',
    borderRadius: 10,
  },
  listItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },
  listItemNameActive: {
    color: '#2563eb',
  },
  listItemSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
});

export default ConvertMaterialScreen;
