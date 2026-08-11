import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Building,
  Calendar,
  Camera,
  CheckSquare,
  ChevronRight,
  CircleCheck,
  CircleX,
  GitMerge,
  Package,
  QrCode,
  RotateCcw,
  ShieldAlert,
  Square,
  Truck,
  User,
  X
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import materialApi from '../api/materialApi';
import GeoCameraModal from '../components/GeoCameraModal';
import MaterialHeader from '../components/MaterialHeader';
import MaterialModuleFooter from '../components/MaterialModuleFooter';
import StatusBadge from '../components/StatusBadge';

const MaterialDetailScreen = ({ route, navigation }) => {
  const { id, initialTxn } = route.params || {};
  const [currentUser, setCurrentUser] = useState(null);
  const [txn, setTxn] = useState(initialTxn || null);
  const [barcodes, setBarcodes] = useState([]);
  const [loading, setLoading] = useState(!initialTxn);
  const [actionLoading, setActionLoading] = useState(false);
  const [geoModalVisible, setGeoModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('materials');

  // Return Multiple Material Modal States matching ReturnMultiple.jsx
  const [returnMultipleModalVisible, setReturnMultipleModalVisible] = useState(false);
  const [selectedBarcodesToReturn, setSelectedBarcodesToReturn] = useState([]);
  const [returnReason, setReturnReason] = useState('Job Completed');
  const [returnCondition, setReturnCondition] = useState('good');
  const [returnRemarks, setReturnRemarks] = useState('');
  const [returnMethod, setReturnMethod] = useState('direct');
  const [handlersList, setHandlersList] = useState([]);
  const [selectedHandlerId, setSelectedHandlerId] = useState('');
  const [returnGeoPayload, setReturnGeoPayload] = useState(null);
  const [returnGeoCameraVisible, setReturnGeoCameraVisible] = useState(false);
  const [returnSubmitting, setReturnSubmitting] = useState(false);

  useEffect(() => {
    loadUser();
    fetchDetails();
  }, [id]);

  const loadUser = async () => {
    try {
      const userStr = await AsyncStorage.getItem('user');
      if (userStr) {
        setCurrentUser(JSON.parse(userStr));
      }
    } catch (err) {
      console.warn('Error loading stored user profile', err);
    }
  };

  const fetchDetails = async () => {
    try {
      if (!txn) setLoading(true);
      if (id) {
        const res = await materialApi.getTransactionById(id);
        if (res && res.success !== false) {
          const txnData = res.data || res.transaction || res;
          if (txnData && (txnData.transactionId || txnData._id || txnData.materials)) {
            setTxn(txnData);
          }
          if (res.barcodes) {
            setBarcodes(res.barcodes);
          }
        }
      }
    } catch (e) {
      console.warn('Failed loading updated transaction details:', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    try {
      setActionLoading(true);
      const res = await materialApi.approveTransaction(id);
      if (res && res.success) {
        Alert.alert('Success', 'Transaction approved successfully!');
        fetchDetails();
      } else {
        Alert.alert('Error', (res && res.message) || 'Approval failed.');
      }
    } catch (err) {
      Alert.alert('Error', (err.response && err.response.data && err.response.data.message) || err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    try {
      setActionLoading(true);
      const res = await materialApi.rejectTransaction(id, 'Rejected from mobile app');
      if (res && res.success) {
        Alert.alert('Rejected', 'Transaction marked as rejected.');
        fetchDetails();
      }
    } catch (err) {
      Alert.alert('Error', (err.response && err.response.data && err.response.data.message) || err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleGeoReceiptConfirm = async (geoData) => {
    try {
      setActionLoading(true);
      const res = await materialApi.receiveTransaction(id, {
        photoUrl: geoData.photoUrl,
        coordinates: geoData.coordinates,
        gps: geoData.gps,
      });

      if (res && res.success) {
        Alert.alert('Receipt Confirmed', 'Materials received into active inventory!');
        fetchDetails();
      }
    } catch (err) {
      Alert.alert('Receipt Error', (err.response && err.response.data && err.response.data.message) || err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const extractIdStr = (obj) => {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    if (typeof obj === 'object') return (obj._id || obj.id || '').toString();
    return '';
  };

  // Helper to filter active barcodes belonging to current logged-in employee
  const getActiveUserBarcodes = () => {
    if (!barcodes || barcodes.length === 0) return [];
    const currentUserIdStr = extractIdStr(currentUser) || extractIdStr(currentUser?.user) || extractIdStr(currentUser?.data);
    const userRole = (currentUser?.role || currentUser?.user?.role || '').toLowerCase();
    const isSuperAdminOrStore = ['super_admin', 'admin', 'company_admin', 'store'].includes(userRole) ||
      (currentUser?.departmentAdminType === 'store') ||
      (currentUser?.department && String(currentUser.department.name || currentUser.department).toLowerCase().includes('store'));

    return barcodes.filter((bcItem) => {
      if (!bcItem) return false;
      const bStatus = (bcItem.status || 'Active').toString().toLowerCase();
      const isBcActive = ['active', 'issued', 'available', 'assigned'].includes(bStatus);
      if (!isBcActive) return false;

      if (isSuperAdminOrStore) return true;

      const ownerIdStr = extractIdStr(bcItem.owner);
      if (ownerIdStr && currentUserIdStr) {
        return ownerIdStr === currentUserIdStr;
      }
      const reqIdStr = extractIdStr(txn?.requester);
      if (reqIdStr && currentUserIdStr) {
        return reqIdStr === currentUserIdStr;
      }
      return true;
    });
  };

  const activeUserBarcodes = getActiveUserBarcodes();

  const handleOpenReturnMultipleModal = async () => {
    const availList = activeUserBarcodes.map(b => typeof b === 'string' ? b : b.barcode).filter(Boolean);

    if (availList.length === 0) {
      Alert.alert('No Barcodes', 'There are no active barcodes available for your account to return for this transaction.');
      return;
    }

    setSelectedBarcodesToReturn([...availList]);
    setReturnReason('Job Completed');
    setReturnCondition('good');
    setReturnRemarks('');
    setReturnMethod('direct');
    setReturnGeoPayload(null);
    setReturnMultipleModalVisible(true);

    try {
      const uRes = await materialApi.getUsers();
      let uList = (uRes && uRes.data) || uRes || [];
      if (!Array.isArray(uList)) uList = [];
      setHandlersList(uList);
      if (uList.length > 0) setSelectedHandlerId(uList[0]._id || uList[0].id);
    } catch (e) {
      console.warn('Failed loading handlers list:', e);
    }
  };

  const handleToggleBarcodeReturnSelect = (bCode) => {
    if (selectedBarcodesToReturn.includes(bCode)) {
      setSelectedBarcodesToReturn(selectedBarcodesToReturn.filter(b => b !== bCode));
    } else {
      setSelectedBarcodesToReturn([...selectedBarcodesToReturn, bCode]);
    }
  };

  const handleSelectAllReturnBarcodes = () => {
    const availList = activeUserBarcodes.map(b => typeof b === 'string' ? b : b.barcode).filter(Boolean);
    if (selectedBarcodesToReturn.length === availList.length) {
      setSelectedBarcodesToReturn([]);
    } else {
      setSelectedBarcodesToReturn([...availList]);
    }
  };

  const handleSubmitReturnMultiple = async () => {
    if (selectedBarcodesToReturn.length === 0) {
      Alert.alert('Validation Error', 'Please select at least 1 barcode to return.');
      return;
    }
    if (!returnRemarks.trim()) {
      Alert.alert('Validation Error', 'Please provide return remarks / details.');
      return;
    }
    if (returnMethod === 'handler' && !selectedHandlerId) {
      Alert.alert('Validation Error', 'Please select a sourcing handler.');
      return;
    }
    if (!returnGeoPayload) {
      Alert.alert('Validation Error', 'GeoCamera photo verification is mandatory before returning materials.');
      return;
    }

    try {
      setReturnSubmitting(true);
      const payload = {
        transactionId: txn.transactionId,
        barcodesToReturn: selectedBarcodesToReturn,
        reason: returnReason,
        condition: returnCondition,
        remarks: returnRemarks.trim(),
        returnMethod,
        handlerId: returnMethod === 'handler' ? selectedHandlerId : undefined,
        photoUrl: returnGeoPayload.photoUrl,
        coordinates: returnGeoPayload.coordinates,
        gps: returnGeoPayload.gps || returnGeoPayload.coordinates,
        photos: [{ url: returnGeoPayload.photoUrl, capturedAt: new Date().toISOString() }],
      };

      const res = await materialApi.returnMultipleBarcodes(payload);
      if (res && (res.success || res._id || Array.isArray(res.returns) || (res.message && res.message.toLowerCase().includes('success')))) {
        Alert.alert('Success', `Return request submitted for ${selectedBarcodesToReturn.length} barcode(s)!`);
        setReturnMultipleModalVisible(false);
        fetchDetails();
      } else {
        Alert.alert('Error', (res && res.message) || 'Failed to submit return request.');
      }
    } catch (err) {
      Alert.alert('Error', (err.response && err.response.data && err.response.data.message) || err.message);
    } finally {
      setReturnSubmitting(false);
    }
  };

  const isAssignedStoreUser = (user, txnItem) => {
    if (!user || !txnItem) return false;
    const userId = String(user._id || user.id || '');
    if (!userId) return false;

    if (txnItem.store) {
      const storeId = String(typeof txnItem.store === 'object' ? (txnItem.store._id || txnItem.store.id || txnItem.store) : txnItem.store);
      if (storeId) return storeId === userId;
    }

    const r = user.role;
    const at = user.adminType || user.departmentAdminType;
    if (r === 'store' || at === 'store' || (r === 'department_admin' && at === 'store')) return true;
    if (user.department && typeof user.department === 'string' && user.department.toLowerCase().includes('store')) return true;
    if (user.department && typeof user.department === 'object' && user.department.name && user.department.name.toLowerCase().includes('store')) return true;
    return false;
  };

  // Render RBAC-gated detail action buttons matching web TransactionDetailPage.jsx
  const renderDetailActionControls = () => {
    if (!txn || !currentUser) return null;

    const role = currentUser.role || 'employee';
    const adminType = currentUser.adminType;
    const userId = currentUser._id;
    const isSender = (txn.requester && txn.requester._id === userId) || txn.requester === userId;
    const isHandler = (txn.handler && txn.handler._id === userId) || txn.handler === userId;

    // 1. Requester Employee / Sender -> NO APPROVAL OR REJECT BUTTONS
    if (role === 'employee' || isSender) {
      if (['submitted', 'tl_approved', 'mgt_approved'].includes(txn.status)) {
        return (
          <View style={styles.statusBannerBox}>
            <ShieldAlert size={18} color="#2563eb" />
            <Text style={styles.statusBannerText}>
              {txn.status === 'submitted' && 'Tracking: Awaiting Team Lead Approval'}
              {txn.status === 'tl_approved' && 'Tracking: Awaiting Management Approval'}
              {txn.status === 'mgt_approved' && 'Tracking: Awaiting Store Sourcing'}
            </Text>
          </View>
        );
      }
    }

    // 2. Team Lead -> Can approve/reject submitted requests
    if (role === 'team_lead' && !isSender) {
      if (txn.status === 'submitted') {
        return (
          <View style={styles.btnRow}>
            <TouchableOpacity onPress={handleApprove} style={styles.approveBtn}>
              <CircleCheck size={18} color="#ffffff" />
              <Text style={styles.btnText}>Approve & Forward</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleReject} style={styles.rejectBtn}>
              <CircleX size={18} color="#ffffff" />
              <Text style={styles.btnText}>Reject</Text>
            </TouchableOpacity>
          </View>
        );
      }
    }

    // 3. Management -> Can approve/reject tl_approved requests (or super admin)
    if (((role === 'department_admin' && adminType === 'management') || role === 'admin') && !isSender) {
      if (txn.status === 'tl_approved' || (role === 'admin' && txn.status === 'submitted')) {
        return (
          <View style={styles.btnRow}>
            <TouchableOpacity onPress={handleApprove} style={styles.approveBtn}>
              <CircleCheck size={18} color="#ffffff" />
              <Text style={styles.btnText}>Mgt Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleReject} style={styles.rejectBtn}>
              <CircleX size={18} color="#ffffff" />
              <Text style={styles.btnText}>Reject</Text>
            </TouchableOpacity>
          </View>
        );
      }
    }

    // 4. Store Incharge -> Can store accept & dispatch mgt_approved requests (ONLY assigned store user, NOT management)
    if (isAssignedStoreUser(currentUser, txn) && !isSender) {
      if (['mgt_approved', 'store_accepted'].includes(txn.status)) {
        return (
          <TouchableOpacity
            onPress={() => navigation.navigate('StoreDispatchScreen', { id: txn._id || txn.transactionId })}
            style={styles.dispatchBtn}
          >
            <Truck size={18} color="#ffffff" />
            <Text style={styles.btnText}>Assign Handler & Dispatch</Text>
          </TouchableOpacity>
        );
      }
    }

    // 5. Accept Material Request for recipient / handler when dispatched
    if (txn.status === 'dispatched' && (isSender || isHandler)) {
      return (
        <TouchableOpacity
          onPress={() => navigation.navigate('ReceivingFormScreen', { id: txn._id || txn.id || txn.transactionId })}
          style={styles.receiveBtn}
        >
          <CircleCheck size={18} color="#ffffff" />
          <Text style={styles.btnText}>Accept Material Request</Text>
        </TouchableOpacity>
      );
    }

    return null;
  };

  if (!txn) {
    return (
      <SafeAreaView style={styles.container}>
        <MaterialHeader title="Request Details" navigation={navigation} />
        <View style={styles.centerContainer}>
          {loading ? (
            <ActivityIndicator size="large" color="#2563eb" />
          ) : (
            <Text style={{ color: '#64748b', fontSize: 14 }}>Transaction record not found.</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // Helper to strip out ObjectId hex strings or raw IDs
  const getCleanName = (userVal, fallback) => {
    if (!userVal) return fallback;
    const name = typeof userVal === 'object' ? (userVal.name || userVal.fullName) : (typeof userVal === 'string' ? userVal : null);
    if (!name) return fallback;
    if (/^[0-9a-fA-F]{24}$/.test(name.trim())) return fallback;
    return name.trim();
  };

  // Extract participant names with robust fallbacks
  const requesterObj = typeof txn.requester === 'object' ? txn.requester : null;
  const teamLeadObj = typeof txn.teamLead === 'object' ? txn.teamLead : null;
  const managementObj = typeof txn.managementApprover === 'object' ? txn.managementApprover : null;
  const storeObj = typeof txn.store === 'object' ? txn.store : null;
  const handlerObj = typeof txn.handler === 'object' ? txn.handler : null;
  const deptObj = typeof txn.department === 'object' ? txn.department : null;

  // Extract from approvalChain if not populated directly on txn
  const tlApproval = Array.isArray(txn.approvalChain) ? txn.approvalChain.find((a) => a.role === 'team_lead') : null;
  const mgtApproval = Array.isArray(txn.approvalChain) ? txn.approvalChain.find((a) => a.role === 'management') : null;
  const storeApproval = Array.isArray(txn.approvalChain) ? txn.approvalChain.find((a) => a.role === 'store') : null;

  const requesterName = getCleanName(requesterObj, 'Requester Staff');
  const teamLeadName = getCleanName(teamLeadObj, (tlApproval && tlApproval.user && getCleanName(tlApproval.user, null)) || 'Assigned Team Lead');
  const managementName = getCleanName(managementObj, (mgtApproval && mgtApproval.user && getCleanName(mgtApproval.user, null)) || 'Management Authority');
  const storeName = getCleanName(storeObj, (storeApproval && storeApproval.user && getCleanName(storeApproval.user, null)) || 'Store Warehouse Admin');
  const handlerName = getCleanName(handlerObj, 'Sourcing Transporter');
  const getDeptValue = (deptObj) => {
    if (!deptObj) return '';
    if (typeof deptObj === 'string') {
      if (!deptObj.match(/^[0-9a-fA-F]{24}$/)) return deptObj;
      return '';
    }
    if (typeof deptObj === 'object') {
      if (deptObj.name) return deptObj.name;
      if (deptObj.department) return getDeptValue(deptObj.department);
    }
    return '';
  };

  const deptName =
    (requesterObj && getDeptValue(requesterObj.department)) ||
    (deptObj && deptObj.name) ||
    (typeof txn.department === 'string' && !txn.department.match(/^[0-9a-fA-F]{24}$/) ? txn.department : '') ||
    'General';

  // Compute unified lifecycle timeline with pending requests
  const buildUnifiedTimeline = () => {
    if (!txn) return [];
    const list = [];

    // Stage 1: Request Created
    list.push({
      action: 'Request Created',
      by: requesterName,
      status: 'COMPLETED',
      date: txn.createdAt ? new Date(txn.createdAt).toLocaleString() : 'Done',
      remarks: txn.description || txn.remarks || 'Material Request Created',
    });

    // Stage 2: Team Lead Approval
    const isTLDone = ['tl_approved', 'mgt_approved', 'store_accepted', 'handler_assigned', 'dispatched', 'received', 'completed', 'active'].includes(txn.status);
    if (isTLDone) {
      list.push({
        action: 'Team Lead Approved',
        by: teamLeadName,
        status: 'COMPLETED',
        date: tlApproval && tlApproval.timestamp ? new Date(tlApproval.timestamp).toLocaleString() : 'Approved',
        remarks: 'Reviewed and forwarded by Team Lead',
      });
    } else if (txn.status === 'submitted') {
      list.push({
        action: 'Pending Team Lead Approval',
        by: teamLeadName,
        status: 'PENDING',
        date: 'Awaiting Action',
        remarks: `Waiting for ${teamLeadName} to review and approve request`,
      });
    }

    // Stage 3: Management Approval
    const isMgtDone = ['mgt_approved', 'store_accepted', 'handler_assigned', 'dispatched', 'received', 'completed', 'active'].includes(txn.status);
    if (isMgtDone) {
      list.push({
        action: 'Management Approved',
        by: managementName,
        status: 'COMPLETED',
        date: mgtApproval && mgtApproval.timestamp ? new Date(mgtApproval.timestamp).toLocaleString() : 'Approved',
        remarks: 'Approved by Management Authority',
      });
    } else if (txn.status === 'tl_approved') {
      list.push({
        action: 'Pending Management Approval',
        by: managementName,
        status: 'PENDING',
        date: 'Awaiting Action',
        remarks: `Waiting for ${managementName} to grant management approval`,
      });
    }

    // Stage 4: Store Acceptance
    const isStoreDone = ['store_accepted', 'handler_assigned', 'dispatched', 'received', 'completed', 'active'].includes(txn.status);
    if (isStoreDone) {
      list.push({
        action: 'Store Accepted & Dispatched',
        by: storeName,
        status: 'COMPLETED',
        date: storeApproval && storeApproval.timestamp ? new Date(storeApproval.timestamp).toLocaleString() : 'Accepted',
        remarks: 'Barcodes assigned and issued from store warehouse',
      });
    } else if (txn.status === 'mgt_approved') {
      list.push({
        action: 'Pending Store Acceptance & Dispatch',
        by: storeName,
        status: 'PENDING',
        date: 'Awaiting Action',
        remarks: `Waiting for ${storeName} to accept and prepare dispatch`,
      });
    }

    // Stage 5: Transporter Transit
    const isTransitDone = ['dispatched', 'received', 'completed', 'active'].includes(txn.status);
    if (isTransitDone) {
      list.push({
        action: 'Transporter Delivery / In Transit',
        by: handlerName,
        status: 'COMPLETED',
        date: 'In Transit',
        remarks: `Materials in transit with ${handlerName}`,
      });
    } else if (['store_accepted', 'handler_assigned'].includes(txn.status)) {
      list.push({
        action: 'Pending Transporter Pickup',
        by: handlerName,
        status: 'PENDING',
        date: 'Awaiting Action',
        remarks: `Waiting for ${handlerName} to pick up materials from store`,
      });
    }

    // Stage 6: Requester Collection
    const isReceivedDone = ['received', 'completed', 'active'].includes(txn.status);
    if (isReceivedDone) {
      list.push({
        action: 'Received into Active Inventory',
        by: requesterName,
        status: 'COMPLETED',
        date: 'Received',
        remarks: 'GeoPhoto receipt confirmed by requester',
      });
    } else if (txn.status === 'dispatched') {
      list.push({
        action: 'Pending Requester Collection',
        by: requesterName,
        status: 'PENDING',
        date: 'Awaiting Action',
        remarks: `Waiting for ${requesterName} to confirm receipt with GeoPhoto`,
      });
    }

    if (txn.status === 'rejected') {
      list.push({
        action: 'Request Rejected',
        by: 'Approval Authority',
        status: 'REJECTED',
        date: 'Rejected',
        remarks: 'Transaction request was rejected',
      });
    }

    // Merge any raw timeline events logged on txn.timeline
    if (Array.isArray(txn.timeline)) {
      txn.timeline.forEach((tItem) => {
        if (!list.some((l) => l.action === tItem.action)) {
          list.push({
            action: tItem.action,
            by: (tItem.user && getCleanName(tItem.user, 'User')) || 'System',
            status: 'COMPLETED',
            date: tItem.timestamp ? new Date(tItem.timestamp).toLocaleString() : '',
            remarks: tItem.description || '',
          });
        }
      });
    }

    return list;
  };

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title={txn.transactionId || 'Voucher Details'}
        subtitle={txn.documentType ? `${txn.documentType} Voucher Log` : 'Material Movement Log'}
        navigation={navigation}
      />

      {/* Detail Navigation Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'materials' && styles.tabItemActive]}
          onPress={() => setActiveTab('materials')}
        >
          <Text style={[styles.tabText, activeTab === 'materials' && styles.tabTextActive]}>
            Materials ({(txn.materials && txn.materials.length) || 0})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'timeline' && styles.tabItemActive]}
          onPress={() => setActiveTab('timeline')}
        >
          <Text style={[styles.tabText, activeTab === 'timeline' && styles.tabTextActive]}>
            Timeline ({buildUnifiedTimeline().length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Voucher Metadata Header Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.txnIdRow}>
              <Text style={styles.docTypeBadge}>{txn.documentType || 'RDC'}</Text>
              <Text style={styles.txnIdText}>{txn.transactionId}</Text>
            </View>
            <StatusBadge status={txn.status} />
          </View>

          <View style={styles.divider} />

          <View style={styles.infoGrid}>
            <View style={styles.infoRow}>
              <User size={16} color="#64748b" />
              <Text style={styles.infoLabel}>Requester:</Text>
              <Text style={styles.infoVal}>
                {requesterName}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Building size={16} color="#64748b" />
              <Text style={styles.infoLabel}>Department:</Text>
              <Text style={styles.infoVal}>{deptName}</Text>
            </View>

            <View style={styles.infoRow}>
              <User size={16} color="#64748b" />
              <Text style={styles.infoLabel}>Team Lead:</Text>
              <Text style={styles.infoVal}>{teamLeadName}</Text>
            </View>

            <View style={styles.infoRow}>
              <ShieldAlert size={16} color="#64748b" />
              <Text style={styles.infoLabel}>Management:</Text>
              <Text style={styles.infoVal}>{managementName}</Text>
            </View>

            <View style={styles.infoRow}>
              <Building size={16} color="#64748b" />
              <Text style={styles.infoLabel}>Store Incharge:</Text>
              <Text style={styles.infoVal}>{storeName}</Text>
            </View>

            {handlerName !== 'Sourcing Transporter' || ['store_accepted', 'handler_assigned', 'dispatched'].includes(txn.status) ? (
              <View style={styles.infoRow}>
                <Truck size={16} color="#64748b" />
                <Text style={styles.infoLabel}>Transporter/Handler:</Text>
                <Text style={styles.infoVal}>{handlerName}</Text>
              </View>
            ) : null}

            <View style={styles.infoRow}>
              <Calendar size={16} color="#64748b" />
              <Text style={styles.infoLabel}>Created Date:</Text>
              <Text style={styles.infoVal}>
                {txn.createdAt ? new Date(txn.createdAt).toLocaleDateString() : 'N/A'}
              </Text>
            </View>

            {txn.dueDate ? (
              <View style={styles.infoRow}>
                <Calendar size={16} color="#64748b" />
                <Text style={styles.infoLabel}>Exp. Return Date:</Text>
                <Text style={[styles.infoVal, { color: '#2563eb', fontWeight: '700' }]}>
                  {new Date(txn.dueDate).toLocaleDateString()}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {activeTab === 'materials' ? (
          <View>
            {/* Material Items Box with Serialized Barcodes matching TransactionDetailPage */}
            <Text style={styles.sectionTitle}>
              MATERIAL ITEMS ({(txn.materials && txn.materials.length) || 0})
            </Text>

            <View style={styles.materialsList}>
              {(txn.materials || []).map((mat, idx) => {
                const matBarcodes = (barcodes.length > 0
                  ? barcodes.filter(
                    (b) =>
                      (b.materialName || '').toLowerCase() === (mat.name || mat.materialName || '').toLowerCase()
                  )
                  : mat.barcodes || []
                );

                return (
                  <View key={idx} style={styles.matCard}>
                    {/* Material Name & Qty */}
                    <View style={styles.matCardHeader}>
                      <View style={styles.matNameRow}>
                        <Package size={18} color="#2563eb" />
                        <Text style={styles.matTitle}>{mat.name || mat.materialName || `Item #${idx + 1}`}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <View style={styles.qtyBadge}>
                          <Text style={styles.qtyText}>
                            {mat.quantity || mat.qty || 1} {mat.unit || 'pcs'}
                          </Text>
                        </View>
                        {mat.price ? (
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#16a34a', marginTop: 2 }}>
                            ₹{mat.price.toLocaleString('en-IN')} / {mat.unit || 'unit'}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    {mat.description ? (
                      <Text style={styles.matDesc}>{mat.description}</Text>
                    ) : null}

                    {/* Serialized Barcodes Chips matching TransactionDetailPage.jsx */}
                    <View style={styles.barcodesContainer}>
                      <Text style={styles.barcodesLabel}>
                        Serialized Barcode Units ({matBarcodes.length}):
                      </Text>
                      {matBarcodes.length > 0 ? (
                        <View style={styles.barcodeChipsGrid}>
                          {matBarcodes.map((bItem, bIdx) => {
                            const bStr = typeof bItem === 'string' ? bItem : bItem.barcode;
                            return (
                              <TouchableOpacity
                                key={bIdx}
                                style={styles.barcodeChip}
                                onPress={() =>
                                  navigation.navigate('BarcodeDetailScreen', { barcode: bStr })
                                }
                              >
                                <QrCode size={13} color="#2563eb" />
                                <Text style={styles.barcodeChipText}>{bStr}</Text>
                                <ChevronRight size={12} color="#94a3b8" />
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ) : (
                        <Text style={styles.noBarcodesText}>
                          Barcodes will be generated upon Store Dispatch.
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
            {/* Merge Material Lot Button inside Transaction Detail Page matching user requirement */}
            {['active', 'received', 'completed', 'closed'].includes(txn.status) && barcodes.length >= 2 && (
              <TouchableOpacity
                style={styles.mergeBtn}
                onPress={() =>
                  navigation.navigate('MergeMaterialScreen', {
                    transactionId: txn.transactionId,
                    availableBarcodes: barcodes,
                  })
                }
              >
                <GitMerge size={18} color="#ffffff" />
                <Text style={styles.mergeBtnText}>Merge Material Lots</Text>
              </TouchableOpacity>
            )}

            {/* Return Multiple Material Button - ONLY SHOW IF TRANSACTION IS ACTIVE/RECEIVED AND ACTIVE BARCODES EXIST FOR LOGGED IN EMPLOYEE */}
            {['active', 'received', 'completed'].includes(txn.status) && activeUserBarcodes.length > 0 && (
              <TouchableOpacity
                style={styles.returnMultipleBtn}
                onPress={() => navigation.navigate('ReturnMultipleScreen', { id: txn._id || txn.transactionId })}
              >
                <RotateCcw size={18} color="#ffffff" />
                <Text style={styles.returnMultipleBtnText}>Return Multiple Materials</Text>
              </TouchableOpacity>
            )}

            {/* Workflow Action Triggers */}
            {actionLoading ? (
              <ActivityIndicator size="large" color="#2563eb" style={{ marginVertical: 20 }} />
            ) : (
              <View style={styles.actionsContainer}>
                {renderDetailActionControls()}
              </View>
            )}
          </View>
        ) : (
          /* Timeline Tab matching TransactionDetailPage.jsx */
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Transaction Timeline & Lifecycle</Text>
            <View style={styles.timelineList}>
              {buildUnifiedTimeline().map((item, idx) => {
                const isPending = item.status === 'PENDING';
                const isRejected = item.status === 'REJECTED';
                const isDone = item.status === 'COMPLETED';

                return (
                  <View key={idx} style={styles.timelineItem}>
                    <View
                      style={[
                        styles.timelineDot,
                        isPending && { backgroundColor: '#f59e0b' },
                        isRejected && { backgroundColor: '#dc2626' },
                        isDone && { backgroundColor: '#16a34a' },
                      ]}
                    />
                    <View style={styles.timelineContent}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={styles.timelineAction}>{item.action}</Text>
                        <View
                          style={{
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                            borderRadius: 4,
                            backgroundColor: isPending ? '#fef3c7' : isRejected ? '#fee2e2' : '#dcfce7',
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 9,
                              fontWeight: '800',
                              color: isPending ? '#d97706' : isRejected ? '#dc2626' : '#16a34a',
                            }}
                          >
                            {item.status}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.timelineUser}>
                        Participant: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{item.by}</Text>
                      </Text>
                      {item.remarks ? (
                        <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{item.remarks}</Text>
                      ) : null}
                      <Text style={styles.timelineDate}>{item.date}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Geo Camera Modal for Receipt Verification */}
      <GeoCameraModal
        visible={geoModalVisible}
        onClose={() => setGeoModalVisible(false)}
        onConfirm={handleGeoReceiptConfirm}
      />

      {/* Return Multiple Materials Modal matching ReturnMultiple.jsx */}
      <Modal
        visible={returnMultipleModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setReturnMultipleModalVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setReturnMultipleModalVisible(false)}>
              <X size={22} color="#0f172a" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.modalTitle}>Return Multiple Materials</Text>
              <Text style={styles.modalSubtitle}>Txn: {txn.transactionId}</Text>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            {/* Barcode multi-select checklist */}
            <View style={styles.modalSectionCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.modalSectionTitle}>
                  Select Barcodes ({selectedBarcodesToReturn.length}/{activeUserBarcodes.length})
                </Text>
                <TouchableOpacity onPress={handleSelectAllReturnBarcodes}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#2563eb' }}>
                    {selectedBarcodesToReturn.length === activeUserBarcodes.length ? 'Deselect All' : 'Select All'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={{ gap: 8, marginTop: 10 }}>
                {activeUserBarcodes.map((item, bIdx) => {
                  const bStr = typeof item === 'string' ? item : item.barcode;
                  const isSel = selectedBarcodesToReturn.includes(bStr);
                  return (
                    <TouchableOpacity
                      key={bIdx}
                      style={[styles.barcodeReturnItem, isSel && styles.barcodeReturnItemSelected]}
                      onPress={() => handleToggleBarcodeReturnSelect(bStr)}
                    >
                      {isSel ? <CheckSquare size={18} color="#dc2626" /> : <Square size={18} color="#94a3b8" />}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.barcodeReturnText}>{bStr}</Text>
                        {item.materialName && <Text style={styles.barcodeReturnSub}>{item.materialName}</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Return details */}
            <View style={styles.modalSectionCard}>
              <Text style={styles.modalSectionTitle}>Return Details</Text>

              {/* Reason */}
              <Text style={styles.fieldLabel}>Return Reason *</Text>
              <View style={styles.pickerRow}>
                {['Job Completed', 'Defective/Damaged', 'Incorrect Material', 'Excess Stock'].map((rOption) => (
                  <TouchableOpacity
                    key={rOption}
                    style={[styles.pickerChip, returnReason === rOption && styles.pickerChipActive]}
                    onPress={() => setReturnReason(rOption)}
                  >
                    <Text style={[styles.pickerChipText, returnReason === rOption && styles.pickerChipTextActive]}>
                      {rOption}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Physical condition */}
              <Text style={styles.fieldLabel}>Physical Condition</Text>
              <View style={styles.pickerRow}>
                {[
                  { label: 'Good (Usable)', val: 'good' },
                  { label: 'Damaged', val: 'damaged' },
                  { label: 'Defective', val: 'defective' },
                ].map((cOpt) => (
                  <TouchableOpacity
                    key={cOpt.val}
                    style={[styles.pickerChip, returnCondition === cOpt.val && styles.pickerChipActive]}
                    onPress={() => setReturnCondition(cOpt.val)}
                  >
                    <Text style={[styles.pickerChipText, returnCondition === cOpt.val && styles.pickerChipTextActive]}>
                      {cOpt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Remarks */}
              <Text style={styles.fieldLabel}>Remarks / Return Reason Details *</Text>
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={3}
                placeholder="Enter detailed reason for returning these materials..."
                placeholderTextColor="#94a3b8"
                value={returnRemarks}
                onChangeText={setReturnRemarks}
              />
            </View>

            {/* Handover Method */}
            <View style={styles.modalSectionCard}>
              <Text style={styles.modalSectionTitle}>Return Handover Method</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[styles.methodCard, returnMethod === 'direct' && styles.methodCardActive]}
                  onPress={() => setReturnMethod('direct')}
                >
                  <Text style={[styles.methodTitle, returnMethod === 'direct' && styles.methodTitleActive]}>
                    Direct Store Handover
                  </Text>
                  <Text style={styles.methodSub}>Deliver directly to store</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.methodCard, returnMethod === 'handler' && styles.methodCardActive]}
                  onPress={() => setReturnMethod('handler')}
                >
                  <Text style={[styles.methodTitle, returnMethod === 'handler' && styles.methodTitleActive]}>
                    Assign Transporter
                  </Text>
                  <Text style={styles.methodSub}>Assign employee handler</Text>
                </TouchableOpacity>
              </View>

              {returnMethod === 'handler' && (
                <View style={{ marginTop: 10 }}>
                  <Text style={styles.fieldLabel}>Select Sourcing Handler *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginTop: 4 }}>
                    {handlersList.map((h) => {
                      const hId = h._id || h.id;
                      const isSel = selectedHandlerId === hId;
                      return (
                        <TouchableOpacity
                          key={hId}
                          style={[styles.handlerChip, isSel && styles.handlerChipActive]}
                          onPress={() => setSelectedHandlerId(hId)}
                        >
                          <User size={14} color={isSel ? '#ffffff' : '#64748b'} />
                          <Text style={[styles.handlerChipText, isSel && styles.handlerChipTextActive]}>
                            {h.fullName || h.name || h.employeeId}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Photo verification button */}
            <View style={styles.modalSectionCard}>
              <Text style={styles.modalSectionTitle}>Mandatory GeoCamera Proof *</Text>
              <TouchableOpacity
                style={[styles.photoProofBtn, returnGeoPayload && styles.photoProofBtnSuccess]}
                onPress={() => setReturnGeoCameraVisible(true)}
              >
                <Camera size={18} color={returnGeoPayload ? '#ffffff' : '#dc2626'} />
                <Text style={[styles.photoProofBtnText, returnGeoPayload && { color: '#ffffff' }]}>
                  {returnGeoPayload ? 'GeoPhoto Verified ✓' : 'Capture Live GeoPhoto Evidence'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Submit */}
            {returnSubmitting ? (
              <ActivityIndicator size="large" color="#dc2626" style={{ marginVertical: 10 }} />
            ) : (
              <TouchableOpacity style={styles.submitReturnBtn} onPress={handleSubmitReturnMultiple}>
                <RotateCcw size={18} color="#ffffff" />
                <Text style={styles.submitReturnBtnText}>
                  Submit Return Request ({selectedBarcodesToReturn.length} items)
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Return Multiple GeoCamera Modal */}
      <GeoCameraModal
        visible={returnGeoCameraVisible}
        onClose={() => setReturnGeoCameraVisible(false)}
        onConfirm={(gData) => {
          setReturnGeoPayload(gData);
          setReturnGeoCameraVisible(false);
          Alert.alert('Verified', 'Return photo evidence & GPS coordinates captured!');
        }}
      />

      <MaterialModuleFooter navigation={navigation} currentScreen="details" />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: '#2563eb',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#2563eb',
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txnIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  docTypeBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2563eb',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  txnIdText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e40af',
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
  },
  infoGrid: {
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  infoVal: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    marginTop: 4,
  },
  materialsList: {
    gap: 12,
  },
  matCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  matCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  matNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  matTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  qtyBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  qtyText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563eb',
  },
  matDesc: {
    fontSize: 12,
    color: '#64748b',
  },
  barcodesContainer: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    gap: 8,
  },
  barcodesLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  barcodeChipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  barcodeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 4,
  },
  barcodeChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1e40af',
  },
  noBarcodesText: {
    fontSize: 11,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  viewAllLink: {
    marginTop: 4,
  },
  viewAllLinkText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
  },
  mergeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7c3aed',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
    marginTop: 6,
  },
  mergeBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  returnMultipleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dc2626',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
    marginTop: 6,
  },
  returnMultipleBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  actionsContainer: {
    marginTop: 6,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  approveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dc2626',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  dispatchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  receiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#409d24ff',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  btnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  timelineList: {
    gap: 12,
    marginTop: 4,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2563eb',
    marginTop: 4,
  },
  timelineContent: {
    flex: 1,
    gap: 2,
  },
  timelineAction: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  timelineUser: {
    fontSize: 12,
    color: '#475569',
  },
  timelineDate: {
    fontSize: 10,
    color: '#94a3b8',
  },

  // Return Multiple Modal Styles
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalSubtitle: {
    fontSize: 11,
    color: '#64748b',
  },
  modalSectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  modalSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },
  barcodeReturnItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
    backgroundColor: '#ffffff',
  },
  barcodeReturnItemSelected: {
    borderColor: '#dc2626',
    backgroundColor: '#fef2f2',
  },
  barcodeReturnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  barcodeReturnSub: {
    fontSize: 11,
    color: '#64748b',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 6,
  },
  pickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  pickerChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  pickerChipActive: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  pickerChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  pickerChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  textArea: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 10,
    fontSize: 12,
    color: '#0f172a',
    textAlignVertical: 'top',
  },
  methodCard: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  methodCardActive: {
    borderColor: '#dc2626',
    backgroundColor: '#fef2f2',
  },
  methodTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  methodTitleActive: {
    color: '#dc2626',
  },
  methodSub: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
  handlerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    marginRight: 6,
  },
  handlerChipActive: {
    backgroundColor: '#dc2626',
  },
  handlerChipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  handlerChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  statusBannerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 10,
    padding: 12,
    marginVertical: 10,
    gap: 8,
  },
  statusBannerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e40af',
  },
  photoProofBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  photoProofBtnSuccess: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  photoProofBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563eb',
  },
  submitReturnBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#dc2626',
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 4,
    marginBottom: 20,
  },
  submitReturnBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  assignHandlerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  assignHandlerBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
});

export default MaterialDetailScreen;
