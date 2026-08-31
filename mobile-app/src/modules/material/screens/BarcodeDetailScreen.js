import {
  ArrowRightLeft,
  CheckCircle,
  ChevronRight,
  FileText,
  Layers,
  QrCode,
  RefreshCw,
  RotateCcw,
  Scissors,
  User
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import materialApi from '../api/materialApi';
import MaterialHeader from '../components/MaterialHeader';
import MaterialModuleFooter from '../components/MaterialModuleFooter';
import StatusBadge from '../components/StatusBadge';

const getCleanUserRemarks = (str) => {
  if (!str) return 'N/A';
  let clean = str;
  if (clean.startsWith('Remarks: ')) {
    clean = clean.replace('Remarks: ', '');
  }
  const attachmentIdx = clean.indexOf(' | Attachment:');
  if (attachmentIdx !== -1) {
    clean = clean.substring(0, attachmentIdx);
  }
  return clean.trim();
};

const BarcodeDetailScreen = ({ route, navigation }) => {
  const barcode = (route && route.params && (route.params.barcode || route.params.barcodeId || route.params.id)) || '';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [actionLoading, setActionLoading] = useState(false);

  const [currentUser, setCurrentUser] = useState(null);
  const [storedUserId, setStoredUserId] = useState('');

  const fetchBarcodeDetails = async () => {
    if (!barcode) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await materialApi.getBarcodeDetails(barcode);
      if (res) {
        setData(res.data || res);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to load barcode details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBarcodeDetails();
    AsyncStorage.getItem('user').then(userStr => {
      if (userStr) {
        setCurrentUser(JSON.parse(userStr));
      }
    }).catch(() => {});
    AsyncStorage.getItem('userId').then(uId => {
      if (uId) setStoredUserId(String(uId).trim());
    }).catch(() => {});

    const unsubscribeFocus = navigation?.addListener ? navigation.addListener('focus', () => {
      fetchBarcodeDetails();
    }) : null;

    return () => {
      if (unsubscribeFocus) unsubscribeFocus();
    };
  }, [barcode, navigation]);

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.container}>
        <MaterialHeader title="Barcode Audit" navigation={navigation} />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      </SafeAreaView>
    );
  }

  // Extract nested properties matching BarcodeDetail.jsx
  const bc = data.barcode || (data.data && data.data.barcode) || data;
  const transfers = data.transfers || [];
  const returns = data.returns || [];
  const splits = data.splits || [];
  const exchanges = data.exchanges || [];
  const merges = data.merges || [];

  // Extract raw status strings
  const rawStatus = (bc.status || '').toString().toLowerCase();
  const rawTxnStatus = (bc.transaction && bc.transaction.status) ? bc.transaction.status.toString().toLowerCase() : '';

  // Barcode is active if its own status is Active/issued/exchanged, or if merge was approved
  const isBarcodeActive = (rawStatus === 'active' || rawStatus === 'issued' || rawStatus === 'exchanged' || (rawStatus === 'merge pending' && !merges.some(m => m.status === 'pending'))) &&
    !['in_transit', 'dispatched', 'locked', 'damaged', 'lost', 'merged', 'pending'].includes(rawStatus) &&
    !(rawStatus === 'merge pending' && merges.some(m => m.status === 'pending'));

  // Detect if this barcode is specifically the NEW replacement unit generated from an Exchange
  const currentBarcodeStr = String(bc.barcode || barcode || '').toUpperCase().trim();
  const isFromExchange = Boolean(
    bc.isExchangeChild ||
    bc.exchangeFrom ||
    (bc.history || []).some(h => (h.action || '').toLowerCase() === 'exchange child created') ||
    exchanges.some(e => e.status === 'approved' && String(e.newBarcode || '').toUpperCase().trim() === currentBarcodeStr && String(e.oldBarcode || '').toUpperCase().trim() !== currentBarcodeStr)
  );

  // Helper to extract clean user name and avoid ObjectIds or raw ID strings
  const getCleanName = (userObj, fallbackTxn) => {
    let name = '';
    if (userObj) {
      if (typeof userObj === 'object') {
        const uName = userObj.name || userObj.fullName || '';
        if (uName && uName.toLowerCase() !== 'store' && uName.toLowerCase() !== 'store warehouse' && !uName.match(/^[0-9a-fA-F]{24}$/)) {
          name = uName;
        }
      } else if (typeof userObj === 'string' && userObj.toLowerCase() !== 'store' && userObj.toLowerCase() !== 'store warehouse' && !userObj.match(/^[0-9a-fA-F]{24}$/)) {
        name = userObj;
      }
    }

    // If name is still empty, or is Store/Store Warehouse, or is ObjectId, AND fallbackTxn requester exists:
    if ((!name || name.toLowerCase() === 'store' || name.toLowerCase() === 'store warehouse' || name.match(/^[0-9a-fA-F]{24}$/)) && fallbackTxn && fallbackTxn.requester) {
      const req = fallbackTxn.requester;
      if (typeof req === 'object') {
        const reqName = req.name || req.fullName || '';
        if (reqName && !reqName.match(/^[0-9a-fA-F]{24}$/)) {
          name = reqName;
        }
      } else if (typeof req === 'string' && !req.match(/^[0-9a-fA-F]{24}$/)) {
        name = req;
      }
    }

    if (!name || name.match(/^[0-9a-fA-F]{24}$/)) {
      name = 'Store Warehouse';
    }

    return name;
  };

  // Extract Requester Name from transaction if available
  let requesterName = '';
  if (bc.transaction && bc.transaction.requester) {
    const req = bc.transaction.requester;
    if (typeof req === 'object') {
      requesterName = req.name || req.fullName || '';
    } else if (typeof req === 'string' && !req.match(/^[0-9a-fA-F]{24}$/)) {
      requesterName = req;
    }
  }

  const extractId = (obj) => {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    if (typeof obj === 'object') return (obj._id || obj.id || '').toString();
    return '';
  };

  const extractName = (userObj) => {
    if (!userObj) return '';
    if (typeof userObj === 'object') {
      const n = userObj.fullName || userObj.name || userObj.employeeName;
      if (n && !n.match(/^[0-9a-fA-F]{24}$/) && n.toLowerCase() !== 'store' && n.toLowerCase() !== 'store warehouse') {
        return n;
      }
    } else if (typeof userObj === 'string' && !userObj.match(/^[0-9a-fA-F]{24}$/) && userObj.toLowerCase() !== 'store' && userObj.toLowerCase() !== 'store warehouse') {
      return userObj;
    }
    return '';
  };

  // Detect latest completed transfer
  const completedTransfers = transfers.filter((t) => t && t.status === 'completed');
  const latestCompletedTransfer = completedTransfers.length > 0 ? completedTransfers[0] : null;
  const latestTransfer = transfers && transfers.length > 0 ? transfers[0] : null;

  // Extract clean owner/requester name preferring new recipient after transfer over old requester
  const getOwnerName = () => {
    if (latestCompletedTransfer && latestCompletedTransfer.toUser) {
      const transferToName = extractName(latestCompletedTransfer.toUser);
      if (transferToName) return transferToName;
    }

    const directOwnerName = extractName(bc.owner);
    if (directOwnerName) return directOwnerName;

    const cleanCust = getCleanName(bc.currentCustodian || bc.assignedTo, bc.transaction);
    if (cleanCust && cleanCust !== 'Store Warehouse' && cleanCust !== 'NA') {
      return cleanCust;
    }

    if (requesterName && requesterName.toLowerCase() !== 'store' && requesterName.toLowerCase() !== 'store warehouse' && !requesterName.match(/^[0-9a-fA-F]{24}$/)) {
      return requesterName;
    }
    return requesterName || 'Active Custodian';
  };

  const ownerName = getOwnerName();

  // Helper to safely extract department string from any user or department object
  const getDeptValue = (deptObj) => {
    if (!deptObj) return '';
    if (typeof deptObj === 'object') {
      const name = deptObj.name || deptObj.departmentName || deptObj.title || '';
      if (name && !name.match(/^[0-9a-fA-F]{24}$/)) return name;
    } else if (typeof deptObj === 'string') {
      if (!deptObj.match(/^[0-9a-fA-F]{24}$/)) return deptObj;
    }
    return '';
  };

  // Extract owner department: Prioritize actual new owner / recipient department
  let ownerDept =
    (latestCompletedTransfer && latestCompletedTransfer.toDepartment && getDeptValue(latestCompletedTransfer.toDepartment)) ||
    (bc.owner && typeof bc.owner === 'object' && getDeptValue(bc.owner.department)) ||
    (bc.ownerDepartment && getDeptValue(bc.ownerDepartment)) ||
    (bc.currentDepartment && getDeptValue(bc.currentDepartment)) ||
    (bc.transaction && bc.transaction.requester && typeof bc.transaction.requester === 'object' && getDeptValue(bc.transaction.requester.department)) ||
    (bc.transaction && bc.transaction.department && getDeptValue(bc.transaction.department)) ||
    'Operations & Store';

  // Detect any pending action on this barcode (Transfer, Return, Exchange, Split, Merge)
  const pendingTransfer = transfers.find(t => ['pending', 'approved'].includes(t.status));
  const pendingReturn = returns.find(r => ['pending', 'initiated', 'handler_assigned', 'collected', 'store_received'].includes(r.status));
  const pendingExchange = exchanges.find(e => e.status === 'pending');
  const pendingSplit = splits.find(s => s.status === 'pending');
  const pendingMerge = merges.find(m => m.status === 'pending');

  const isStatusPending = ['split pending', 'exchange pending', 'transfer pending', 'return pending', 'pending'].includes(rawStatus) || (rawStatus === 'merge pending' && Boolean(pendingMerge));
  const activePendingAction = pendingTransfer || pendingReturn || pendingExchange || pendingSplit || pendingMerge;
  const hasPendingAction = Boolean(activePendingAction) || isStatusPending;
  const pendingActionType = pendingTransfer
    ? 'Transfer'
    : pendingReturn
    ? 'Return'
    : pendingExchange
    ? 'Exchange'
    : pendingSplit
    ? 'Split'
    : (pendingMerge || (rawStatus.includes('merge') && Boolean(pendingMerge)))
    ? 'Merge'
    : isStatusPending
    ? 'Action'
    : null;

  const displayStatus = hasPendingAction
    ? 'Pending'
    : isBarcodeActive
    ? 'Active'
    : (['dispatched', 'in_transit'].includes(rawStatus) || ['dispatched', 'in_transit'].includes(rawTxnStatus))
    ? 'In-Transit'
    : (bc.status || 'Active');

  const currentUserIdStr = (
    extractId(currentUser) ||
    extractId(currentUser?.user) ||
    extractId(currentUser?.data) ||
    storedUserId
  ).trim();

  const currentUserEmail = (currentUser?.email || currentUser?.user?.email || '').toLowerCase().trim();
  const currentUserEmpId = (currentUser?.employeeId || currentUser?.employeeIdCode || currentUser?.user?.employeeId || '').toUpperCase().trim();
  const currentUserName = (currentUser?.name || currentUser?.fullName || currentUser?.user?.name || '').toLowerCase().trim();

  const checkUserMatch = (targetObj) => {
    if (!targetObj) return false;
    const tId = extractId(targetObj);
    if (currentUserIdStr && tId && currentUserIdStr === tId) return true;
    if (typeof targetObj === 'object') {
      const tEmail = (targetObj.email || '').toLowerCase().trim();
      if (currentUserEmail && tEmail && currentUserEmail === tEmail) return true;
      const tEmpId = (targetObj.employeeId || targetObj.employeeIdCode || '').toUpperCase().trim();
      if (currentUserEmpId && tEmpId && currentUserEmpId === tEmpId) return true;
      const tName = (targetObj.name || targetObj.fullName || '').toLowerCase().trim();
      if (currentUserName && tName && currentUserName === tName && tName !== 'store' && tName !== 'store warehouse') return true;
    }
    return false;
  };

  const userRole = (currentUser?.role || currentUser?.user?.role || '').toLowerCase();
  const isSuperAdmin = ['super_admin', 'admin', 'company_admin'].includes(userRole);

  // If a completed transfer exists, ONLY the new recipient / current owner is the active owner (NOT the old sender/requester)
  let isCurrentOwner = false;
  if (latestCompletedTransfer && latestCompletedTransfer.toUser) {
    isCurrentOwner = checkUserMatch(latestCompletedTransfer.toUser) || checkUserMatch(bc.owner) || checkUserMatch(bc.currentCustodian);
  } else if (bc.owner) {
    isCurrentOwner = checkUserMatch(bc.owner) || checkUserMatch(bc.currentCustodian);
  } else if (bc.currentCustodian || bc.assignedTo) {
    isCurrentOwner = checkUserMatch(bc.currentCustodian) || checkUserMatch(bc.assignedTo);
  } else if (bc.transaction?.requester) {
    // Only fall back to transaction requester if barcode has NEVER been transferred
    isCurrentOwner = checkUserMatch(bc.transaction.requester);
  }

  const isOwner = isSuperAdmin || isCurrentOwner;

  // Detect any pending action on this barcode (Transfer, Return, Exchange, Split)
  // (Note: logic moved above)

  // History timeline extraction matching BarcodeDetail.jsx
  const filteredHistory = (bc.history || []).filter((log) => {
    const actionLower = (log.action || '').toLowerCase();
    if (['exchanged', 'barcode exchanged', 'exchange requested'].includes(actionLower)) {
      return false;
    }
    return true;
  });

  const timelineHistory = [...filteredHistory];

  transfers.forEach((tr) => {
    const isPending = ['pending', 'approved'].includes(tr.status);
    timelineHistory.push({
      action: tr.status === 'completed' ? 'Transfer Completed & Accepted' : tr.status === 'rejected' ? 'Transfer Rejected' : 'Transfer Requested (Pending Acceptance)',
      user: tr.fromUser,
      timestamp: tr.createdAt,
      status: isPending ? 'PENDING' : tr.status === 'rejected' ? 'REJECTED' : 'COMPLETED',
      remarks: tr.remarks || `Transfer from ${getCleanName(tr.fromUser, null)} to ${getCleanName(tr.toUser, null)}`,
    });
  });

  returns.forEach((rt) => {
    const isPending = ['pending', 'initiated', 'handler_assigned', 'collected', 'store_received'].includes(rt.status);
    timelineHistory.push({
      action: isPending ? 'Return Initiated (Pending Store Acceptance)' : 'Return Completed & Store Received',
      user: rt.fromUser,
      timestamp: rt.createdAt,
      status: isPending ? 'PENDING' : 'COMPLETED',
      remarks: rt.remarks || rt.reason || 'Store return request',
    });
  });

  exchanges.forEach((ex) => {
    if (ex.status === 'pending') {
      timelineHistory.push({
        action: 'Barcode Exchange Requested',
        user: ex.requester,
        timestamp: ex.createdAt,
        status: 'PENDING',
        remarks: getCleanUserRemarks(ex.warrantyReason),
      });
    }
    if (ex.status === 'approved') {
      timelineHistory.push({
        action: 'Barcode Exchange Completed',
        user: ex.approvedBy || { fullName: 'Store Admin' },
        timestamp: ex.approvedAt || ex.updatedAt,
        status: 'COMPLETED',
        remarks: `Exchanged old ${ex.oldBarcode} for new ${ex.newBarcode || 'Replacement'} under warranty.`,
      });
    }
  });

  splits.forEach((s) => {
    const isPending = s.status === 'pending';
    timelineHistory.push({
      action: isPending ? 'Reel Split Requested (Pending Store Acceptance)' : 'Reel Split Completed',
      user: s.requestedBy || s.user,
      timestamp: s.createdAt,
      status: isPending ? 'PENDING' : 'COMPLETED',
      remarks: `Split ${s.splitQuantity || ''} meters from parent reel ${bc.barcode}`,
    });
  });

  timelineHistory.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

  // Button Handlers
  // (Split action navigates to the dedicated SplitMaterialScreen per spec — see action grid below)

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title={bc.barcode || barcode}
        subtitle={bc.materialName || 'Serialized Inventory Unit'}
        navigation={navigation}
      />

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'overview' && styles.tabItemActive]}
          onPress={() => setActiveTab('overview')}
        >
          <Text style={[styles.tabText, activeTab === 'overview' && styles.tabTextActive]}>
            Overview
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'history' && styles.tabItemActive]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>
            Audit History ({timelineHistory.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {activeTab === 'overview' ? (
          <View>
            {/* Main Barcode Info Card */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.barcodeRow}>
                  <QrCode size={24} color="#2563eb" />
                  <Text style={styles.barcodeTitle}>{bc.barcode}</Text>
                </View>
                <StatusBadge status={displayStatus} />
              </View>

              <Text style={styles.materialName}>{bc.materialName || 'Material Unit'}</Text>
              {bc.description ? <Text style={styles.descriptionText}>{bc.description}</Text> : null}

              <View style={styles.divider} />

              <View style={styles.infoGrid}>
                <View style={styles.infoRow}>
                  <User size={16} color="#64748b" />
                  <Text style={styles.infoLabel}>Current Owner:</Text>
                  <Text style={styles.infoValue}>
                    {ownerName}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Layers size={16} color="#64748b" />
                  <Text style={styles.infoLabel}>Department:</Text>
                  <Text style={styles.infoValue}>{ownerDept}</Text>
                </View>

                {bc.transactionId ? (
                  <TouchableOpacity
                    style={styles.infoRow}
                    onPress={() => navigation.navigate('MaterialDetailScreen', { id: bc.transactionId })}
                  >
                    <FileText size={16} color="#2563eb" />
                    <Text style={styles.infoLabel}>Transaction Voucher:</Text>
                    <Text style={[styles.infoValue, { color: '#2563eb', fontWeight: '700' }]}>
                      {bc.transactionId}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {bc.parentBarcode ? (
                  <View style={styles.infoRow}>
                    <Scissors size={16} color="#0284c7" />
                    <Text style={styles.infoLabel}>Parent Reel:</Text>
                    <Text style={[styles.infoValue, { color: '#0284c7', fontWeight: '700' }]}>
                      {bc.parentBarcode}
                    </Text>
                  </View>
                ) : null}

                {bc.quantity ? (
                  <View style={styles.infoRow}>
                    <Layers size={16} color="#64748b" />
                    <Text style={styles.infoLabel}>Reel Quantity / Length:</Text>
                    <Text style={styles.infoValue}>{bc.quantity} m</Text>
                  </View>
                ) : null}

                {/* View All Barcode Photos, Remarks & Attachments Button */}
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#2563eb',
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    borderRadius: 10,
                    marginTop: 14,
                    gap: 8,
                  }}
                  onPress={() => navigation.navigate('BarcodeViewAllScreen', { barcode: bc.barcode || barcode })}
                >
                  <FileText size={18} color="#ffffff" />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#ffffff' }}>
                    View All Photos, Remarks & Attachments ➔
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Actions Panel connected to dedicated screens */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Available Barcode Actions</Text>

              {hasPendingAction ? (
                <View style={{ backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa', padding: 14, borderRadius: 10, marginBottom: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#c2410c' }}>
                    Action Pending: {pendingActionType} Request Pending
                  </Text>
                  <Text style={{ fontSize: 12, color: '#9a3412', marginTop: 4, lineHeight: 16 }}>
                    A {pendingActionType} action is currently pending for barcode {bc.barcode}. Only one action can be performed at a time. All other barcode actions remain locked until this request is accepted or resolved.
                  </Text>
                </View>
              ) : rawStatus === 'merged' ? (
                <View style={{ backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', padding: 14, borderRadius: 10, marginBottom: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#475569' }}>
                    Barcode Merged (Retired)
                  </Text>
                  <Text style={{ fontSize: 12, color: '#64748b', marginTop: 4, lineHeight: 16 }}>
                    This barcode was merged into a master lot and is retired. Barcode actions cannot be performed on merged barcodes.
                  </Text>
                </View>
              ) : !isOwner ? (
                <View style={{ backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1', padding: 12, borderRadius: 8, marginBottom: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#475569' }}>
                    Not Active Custodian
                  </Text>
                  <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    You are not the active owner of this material. Actions can only be performed by the current owner ({ownerName}).
                  </Text>
                </View>
              ) : null}

              {!hasPendingAction && isOwner && isBarcodeActive && (
                <View style={styles.actionGrid}>
                  {/* 1. Transfer Material Screen */}
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}
                    onPress={() => navigation.navigate('TransferMaterialScreen', { barcode: bc.barcode })}
                  >
                    <ArrowRightLeft size={20} color="#2563eb" />
                    <View style={styles.actionTextCol}>
                      <Text style={[styles.actionTitle, { color: '#1e40af' }]}>Transfer Material</Text>
                      <Text style={styles.actionSubText}>Transfer peer custody to staff member</Text>
                    </View>
                    <ChevronRight size={18} color="#2563eb" />
                  </TouchableOpacity>

                  {/* 2. Return Material Screen */}
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#fef2f2', borderColor: '#fca5a5' }]}
                    onPress={() => navigation.navigate('ReturnMaterialScreen', { barcode: bc.barcode })}
                  >
                    <RotateCcw size={20} color="#dc2626" />
                    <View style={styles.actionTextCol}>
                      <Text style={[styles.actionTitle, { color: '#991b1b' }]}>Return to Store</Text>
                      <Text style={styles.actionSubText}>Return barcode item to central store</Text>
                    </View>
                    <ChevronRight size={18} color="#dc2626" />
                  </TouchableOpacity>

                  {/* 3. Exchange Barcode Screen */}
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}
                    onPress={() => navigation.navigate('ExchangeBarcodeScreen', { barcode: bc.barcode })}
                  >
                    <RefreshCw size={20} color="#d97706" />
                    <View style={styles.actionTextCol}>
                      <Text style={[styles.actionTitle, { color: '#92400e' }]}>Exchange Barcode</Text>
                      <Text style={styles.actionSubText}>Replace defective item under warranty</Text>
                    </View>
                    <ChevronRight size={18} color="#d97706" />
                  </TouchableOpacity>

                  {/* 4. Split Material Screen */}
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#f3e8ff', borderColor: '#d8b4fe' }]}
                    onPress={() => navigation.navigate('SplitMaterialScreen', { barcode: bc.barcode })}
                  >
                    <Scissors size={20} color="#7c3aed" />
                    <View style={styles.actionTextCol}>
                      <Text style={[styles.actionTitle, { color: '#6b21a8' }]}>Split Material</Text>
                      <Text style={styles.actionSubText}>Divide parent barcode into child unit</Text>
                    </View>
                    <ChevronRight size={18} color="#7c3aed" />
                  </TouchableOpacity>

                  {/* 5. Convert Material Screen */}
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#f0fdf4', borderColor: '#86efac' }]}
                    onPress={() => navigation.navigate('ConvertMaterialScreen', { barcode: bc.barcode })}
                  >
                    <FileText size={20} color="#16a34a" />
                    <View style={styles.actionTextCol}>
                      <Text style={[styles.actionTitle, { color: '#166534' }]}>Convert to DC / Invoice</Text>
                      <Text style={styles.actionSubText}>RDC closure & voucher conversion</Text>
                    </View>
                    <ChevronRight size={18} color="#16a34a" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        ) : (
          /* Audit History Tab matching BarcodeDetail.jsx */
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Lifecycle Audit Trail</Text>
            {timelineHistory.length === 0 ? (
              <Text style={styles.emptyText}>No historical logs recorded for this barcode.</Text>
            ) : (
              <View style={styles.timelineList}>
                {timelineHistory.map((item, index) => {
                  const dateStr = item.timestamp ? new Date(item.timestamp).toLocaleString() : '';
                  const uObj = item.user || {};
                  const userName = uObj.fullName || uObj.name || 'System';

                  return (
                    <View key={index} style={styles.timelineItem}>
                      <View style={styles.timelineIconDot}>
                        <CheckCircle size={14} color="#2563eb" />
                      </View>
                      <View style={styles.timelineContent}>
                        <Text style={styles.timelineAction}>{item.action}</Text>
                        <Text style={styles.timelineUser}>
                          By: {userName} • {dateStr}
                        </Text>
                        {item.remarks ? (
                          <Text style={styles.timelineRemarks}>"{item.remarks}"</Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>

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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  barcodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barcodeTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1e40af',
  },
  materialName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  descriptionText: {
    fontSize: 12,
    color: '#64748b',
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 4,
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
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  infoValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e293b',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  actionGrid: {
    gap: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
  },
  actionTextCol: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  actionSubText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
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
  timelineIconDot: {
    marginTop: 2,
  },
  timelineContent: {
    flex: 1,
    gap: 2,
  },
  timelineAction: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },
  timelineUser: {
    fontSize: 11,
    color: '#64748b',
  },
  timelineRemarks: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#475569',
    marginTop: 2,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalSubText: {
    fontSize: 13,
    color: '#475569',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 4,
  },
  modalInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0f172a',
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  confirmBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#2563eb',
  },
  confirmBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
});

export default BarcodeDetailScreen;
