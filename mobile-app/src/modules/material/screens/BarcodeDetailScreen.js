import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowRightLeft,
  CheckCircle,
  ChevronRight,
  Clock,
  FileText,
  Layers,
  QrCode,
  RefreshCw,
  RotateCcw,
  Scissors,
  User,
  UserCheck,
  XCircle
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
    }).catch(() => { });
    AsyncStorage.getItem('userId').then(uId => {
      if (uId) setStoredUserId(String(uId).trim());
    }).catch(() => { });

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
  const closeRequests = data.closeRequests || [];

  // Extract current barcode string
  const currentBarcodeStr = String(bc.barcode || barcode || '').toUpperCase().trim();

  // Extract raw status strings
  const rawStatus = (bc.status || '').toString().toLowerCase();
  const rawTxnStatus = (bc.transaction && bc.transaction.status) ? bc.transaction.status.toString().toLowerCase() : '';

  // Check if material is currently under delivery (in-transit with handler / awaiting receiving)
  const isBarcodeInTransit = ['in_transit', 'dispatched', 'pending_acceptance', 'pending_dispatch'].includes(rawStatus);
  const pendingReturnInTransit = returns.some(r => (String(r.barcode || '').toUpperCase().trim() === currentBarcodeStr || (r.barcodes || []).map(rb => String(typeof rb === 'string' ? rb : rb.barcode || '').toUpperCase().trim()).includes(currentBarcodeStr)) && ['handler_assigned', 'collected', 'store_received'].includes((r.status || '').toLowerCase()));
  const isUnderDelivery = isBarcodeInTransit || pendingReturnInTransit;
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

  // Detect any pending action on this specific barcode (Transfer, Return, Exchange, Split, Merge, Close/Conversion)
  const pendingTransfer = transfers.find(t => String(t.barcode || '').toUpperCase().trim() === currentBarcodeStr && ['pending', 'approved'].includes(t.status));
  const pendingReturn = returns.find(r => (String(r.barcode || '').toUpperCase().trim() === currentBarcodeStr || (r.barcodes || []).map(rb => String(typeof rb === 'string' ? rb : rb.barcode || '').toUpperCase().trim()).includes(currentBarcodeStr)) && ['pending', 'initiated', 'handler_assigned', 'collected', 'store_received'].includes(r.status));
  const pendingExchange = exchanges.find(e => (String(e.oldBarcode || '').toUpperCase().trim() === currentBarcodeStr || String(e.newBarcode || '').toUpperCase().trim() === currentBarcodeStr) && e.status === 'pending');
  const pendingSplit = splits.find(s => String(s.barcode || '').toUpperCase().trim() === currentBarcodeStr && ['pending', 'store_accepted'].includes(s.status));
  const pendingMerge = merges.find(m => (m.mergeBarcodes || []).map(mb => String(typeof mb === 'string' ? mb : mb.barcode || '').toUpperCase().trim()).includes(currentBarcodeStr) && m.status === 'pending');
  const pendingClose = (closeRequests || []).find(c => String(c.barcode || '').toUpperCase().trim() === currentBarcodeStr && ['pending', 'pending_accounts_approval', 'pending_store_acceptance'].includes(c.status));

  const activePendingAction = pendingTransfer || pendingReturn || pendingExchange || pendingSplit || pendingMerge || pendingClose;
  const hasPendingAction = Boolean(activePendingAction);
  const pendingActionType = pendingTransfer
    ? 'Transfer'
    : pendingReturn
      ? 'Return'
      : pendingExchange
        ? 'Exchange'
        : pendingSplit
          ? 'Split'
          : pendingMerge
            ? 'Merge'
            : pendingClose
              ? (pendingClose.documentType === 'Invoice' ? 'Invoice Conversion' : `${pendingClose.documentType || 'DC'} Conversion`)
              : null;

  // Resolve completed or approved invoice conversion details (Show Invoice Number only, never document)
  const invoiceCloseRecord = (closeRequests || []).find(
    c => String(c.barcode || '').toUpperCase().trim() === currentBarcodeStr &&
      c.documentType === 'Invoice' &&
      (c.invoiceNumber || ['approved', 'closed', 'pending_store_acceptance'].includes(c.status))
  ) || (bc.closeRequest?.documentType === 'Invoice' ? bc.closeRequest : null);

  const resolvedInvoiceNumber =
    invoiceCloseRecord?.invoiceNumber ||
    (bc.closeRequest?.documentType === 'Invoice' ? bc.closeRequest?.invoiceNumber : '') ||
    bc.invoiceNumber ||
    '';

  // Resolve detailed pending approval stage and actual approver names
  let pendingApprovalStage = '';
  let pendingApproverName = '';
  let pendingApproverRole = '';
  let pendingApprovalDescription = '';
  let pendingStepsList = [];

  if (pendingClose) {
    const doc = pendingClose.documentType || 'DC';
    const cStatus = pendingClose.status;
    const tlName = getCleanName(pendingClose.teamLead, null) !== 'Store Warehouse'
      ? getCleanName(pendingClose.teamLead, null)
      : (getCleanName(bc.closeRequest?.teamLead, null) !== 'Store Warehouse'
        ? getCleanName(bc.closeRequest?.teamLead, null)
        : (getCleanName(bc.transaction?.teamLead, null) !== 'Store Warehouse'
          ? getCleanName(bc.transaction?.teamLead, null)
          : 'Assigned Department Team Lead'));

    const mgtName = getCleanName(pendingClose.managementApprover, null) !== 'Store Warehouse'
      ? getCleanName(pendingClose.managementApprover, null)
      : (getCleanName(bc.closeRequest?.managementApprover, null) !== 'Store Warehouse'
        ? getCleanName(bc.closeRequest?.managementApprover, null)
        : 'Selected Management Approver');

    if (doc === 'DC Internal') {
      pendingStepsList = [
        {
          step: 1,
          name: 'Department Team Lead Review',
          approver: tlName,
          status: cStatus === 'pending' ? 'PENDING' : 'COMPLETED',
        },
        {
          step: 2,
          name: 'Central Store Physical Acceptance',
          approver: 'Store Incharge / Warehouse Admin',
          status: cStatus === 'pending_store_acceptance' ? 'PENDING' : (cStatus === 'pending' ? 'QUEUED' : 'COMPLETED'),
        },
      ];

      if (cStatus === 'pending') {
        pendingApprovalStage = 'Team Lead Review Pending';
        pendingApproverName = tlName;
        pendingApproverRole = 'Department Team Lead';
        pendingApprovalDescription = `DC Internal conversion request is awaiting approval from Team Lead ${tlName}. Upon approval, it will route to Store for physical acceptance.`;
      } else if (cStatus === 'pending_store_acceptance') {
        pendingApprovalStage = 'Store Physical Acceptance Pending';
        pendingApproverName = 'Central Store Incharge / Warehouse Admin';
        pendingApproverRole = 'Store Admin';
        pendingApprovalDescription = `Approved by Team Lead ${tlName}. Material is awaiting physical verification & stock-in acceptance at Central Store.`;
      }
    } else {
      pendingStepsList = [
        {
          step: 1,
          name: 'Management Authorization',
          approver: mgtName,
          status: cStatus === 'pending' ? 'PENDING' : 'COMPLETED',
        },
        {
          step: 2,
          name: 'Accounts Admin Audit & Verification',
          approver: 'Accounts Admin (Finance & Accounts Team)',
          status: cStatus === 'pending_accounts_approval' ? 'PENDING' : (cStatus === 'pending' ? 'QUEUED' : 'COMPLETED'),
        },
        {
          step: 3,
          name: 'Central Store Physical Acceptance',
          approver: 'Store Incharge / Warehouse Admin',
          status: cStatus === 'pending_store_acceptance' ? 'PENDING' : (['pending', 'pending_accounts_approval'].includes(cStatus) ? 'QUEUED' : 'COMPLETED'),
        },
      ];

      if (cStatus === 'pending') {
        pendingApprovalStage = 'Management Authorization Pending';
        pendingApproverName = mgtName;
        pendingApproverRole = 'Management Approver';
        pendingApprovalDescription = `${doc} conversion request is awaiting authorization from ${mgtName}. Upon approval, it will route to Accounts Admin.`;
      } else if (cStatus === 'pending_accounts_approval') {
        pendingApprovalStage = 'Accounts Admin Review Pending';
        pendingApproverName = 'Accounts Admin (Finance & Accounts Team)';
        pendingApproverRole = 'Accounts / Finance Admin';
        pendingApprovalDescription = `Authorized by ${mgtName}. Conversion is awaiting tax & ledger verification from Accounts Admin.`;
      } else if (cStatus === 'pending_store_acceptance') {
        pendingApprovalStage = 'Store Physical Acceptance Pending';
        pendingApproverName = 'Central Store Incharge / Warehouse Admin';
        pendingApproverRole = 'Store Admin';
        pendingApprovalDescription = `Approved by Management (${mgtName}) & Accounts Admin. Material is awaiting physical verification & stock-in at Central Store.`;
      }
    }
  } else if (pendingTransfer) {
    const toName = getCleanName(pendingTransfer.toUser, 'Colleague');
    pendingApprovalStage = 'Peer Transfer Acceptance Pending';
    pendingApproverName = toName;
    pendingApproverRole = 'Recipient Staff Member';
    pendingApprovalDescription = `Transfer requested to ${toName}. Material is awaiting recipient acceptance.`;
  } else if (pendingReturn) {
    const handlerName = pendingReturn.returnHandler ? getCleanName(pendingReturn.returnHandler, 'Handler') : null;
    pendingApprovalStage = handlerName ? 'Return Handler Pickup Pending' : 'Store Return Acceptance Pending';
    pendingApproverName = handlerName ? `Handler: ${handlerName}` : 'Central Store Warehouse';
    pendingApproverRole = handlerName ? 'Return Handler' : 'Store Admin';
    pendingApprovalDescription = handlerName ? `Material assigned to ${handlerName} for pickup & store handover.` : 'Material return submitted. Awaiting receipt & acceptance by Store.';
  } else if (pendingSplit) {
    if (pendingSplit.status === 'store_accepted') {
      pendingApprovalStage = 'Store Accepted — Awaiting Barcode Assignment';
      pendingApproverName = 'Central Store / Warehouse Admin';
      pendingApproverRole = 'Store Admin';
      pendingApprovalDescription = 'Store accepted split request & generated Tally Stock Journal. Physical barcode assignment and labeling is in progress.';
    } else {
      pendingApprovalStage = 'Reel Split Approval Pending';
      pendingApproverName = 'Central Store / Warehouse Admin';
      pendingApproverRole = 'Store Admin';
      pendingApprovalDescription = `Reel split requested for ${pendingSplit.splitQuantity || ''}m. Awaiting Store approval to generate child barcode.`;
    }
  } else if (pendingExchange) {
    pendingApprovalStage = 'Warranty Exchange Approval Pending';
    pendingApproverName = 'Central Store / Warehouse Admin';
    pendingApproverRole = 'Store Admin';
    pendingApprovalDescription = `Warranty replacement requested: "${getCleanUserRemarks(pendingExchange.warrantyReason)}". Awaiting Store verification.`;
  } else if (pendingMerge) {
    pendingApprovalStage = 'Barcode Merge Approval Pending';
    pendingApproverName = 'Central Store / Warehouse Admin';
    pendingApproverRole = 'Store Admin';
    pendingApprovalDescription = 'Merge requested for barcodes into parent lot. Awaiting Store verification & consolidation.';
  }

  // Returned to Central Store detection
  const isReturnedToStore =
    rawStatus === 'returned' ||
    (rawStatus === 'closed' && (bc.returnedToStore || (bc.status || '').toLowerCase().includes('return'))) ||
    (bc.status || '').toLowerCase() === 'returned' ||
    returns.some((r) => ['completed', 'closed'].includes(r.status));

  // Transfer pending detection
  const isTransferPending =
    rawStatus === 'transfer pending' ||
    Boolean(pendingTransfer);

  // Barcode is active if it has NO active pending action on this specific barcode and is not in transit, closed, returned, or transfer pending
  const isBarcodeActive = !hasPendingAction && !isUnderDelivery && !isReturnedToStore && !isTransferPending &&
    !['closed', 'locked', 'damaged', 'lost', 'merged', 'returned', 'transfer pending'].includes(rawStatus);

  const displayStatus = isUnderDelivery
    ? 'In-Transit'
    : isReturnedToStore
      ? 'Returned'
      : (hasPendingAction || isTransferPending)
        ? 'Pending'
        : isBarcodeActive
          ? 'Active'
          : (rawStatus === 'dispatched' || rawStatus === 'in_transit')
            ? 'In-Transit'
            : (rawStatus === 'closed' ? 'Closed' : 'Active');

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

  // History timeline extraction matching BarcodeDetail.jsx, filtering raw entries handled by structured workflows
  const filteredHistory = (bc.history || []).filter((log) => {
    const actionLower = (log.action || '').toLowerCase();
    if (
      actionLower.includes('exchange') ||
      actionLower.includes('transfer') ||
      actionLower.includes('return') ||
      actionLower.includes('conversion') ||
      actionLower.includes('close') ||
      actionLower.includes('split')
    ) {
      return false;
    }
    return true;
  });

  const timelineHistory = [...filteredHistory];

  transfers.forEach((tr) => {
    const isPending = ['pending', 'approved'].includes(tr.status);
    const isRejected = tr.status === 'rejected';
    const isCompleted = tr.status === 'completed';

    if (isCompleted) {
      timelineHistory.push({
        action: 'Transfer Initiated',
        user: tr.fromUser,
        timestamp: tr.createdAt,
        status: 'COMPLETED',
        stepOrder: 1,
        remarks: tr.remarks || `Transfer from ${getCleanName(tr.fromUser, null)} to ${getCleanName(tr.toUser, null)}`,
      });
      timelineHistory.push({
        action: 'Transfer Completed & Accepted',
        user: tr.toUser,
        timestamp: tr.updatedAt || tr.createdAt,
        status: 'COMPLETED',
        stepOrder: 2,
        remarks: `Received & accepted by ${getCleanName(tr.toUser, null)}.`,
      });
    } else if (isRejected) {
      timelineHistory.push({
        action: 'Transfer Initiated',
        user: tr.fromUser,
        timestamp: tr.createdAt,
        status: 'COMPLETED',
        stepOrder: 1,
        remarks: tr.remarks || `Transfer initiated to ${getCleanName(tr.toUser, null)}`,
      });
      timelineHistory.push({
        action: 'Transfer Rejected',
        user: tr.rejectedBy || tr.toUser || tr.managementApprover,
        timestamp: tr.updatedAt || tr.createdAt,
        status: 'REJECTED',
        stepOrder: 2,
        remarks: tr.rejectionReason || tr.remarks || 'Transfer request declined.',
      });
    } else if (isPending) {
      if (tr.requiresApproval && tr.status === 'pending') {
        timelineHistory.push({
          action: 'Transfer Requested (Pending Management Approval)',
          user: tr.fromUser,
          timestamp: tr.createdAt,
          status: 'PENDING',
          stepOrder: 1,
          remarks: tr.remarks || `Cross-department transfer pending Management approval (${getCleanName(tr.managementApprover, null)}).`,
        });
      } else if (tr.requiresApproval && tr.status === 'approved') {
        timelineHistory.push({
          action: 'Transfer Authorized by Management',
          user: tr.managementApprover || tr.approvedBy || { fullName: 'Management Approver' },
          timestamp: tr.updatedAt || tr.createdAt,
          status: 'COMPLETED',
          stepOrder: 1,
          remarks: `Cross-department transfer approved by Management. Forwarded to ${getCleanName(tr.toUser, null)} for acceptance.`,
        });
        timelineHistory.push({
          action: 'Transfer Pending Recipient Acceptance',
          user: tr.toUser,
          timestamp: tr.updatedAt || tr.createdAt,
          status: 'PENDING',
          stepOrder: 2,
          remarks: `Awaiting acceptance and physical receiving confirmation by ${getCleanName(tr.toUser, null)}.`,
        });
      } else {
        timelineHistory.push({
          action: 'Transfer Pending Recipient Acceptance',
          user: tr.fromUser,
          timestamp: tr.createdAt,
          status: 'PENDING',
          stepOrder: 1,
          remarks: `Awaiting acceptance and receipt confirmation by ${getCleanName(tr.toUser, null)}.`,
        });
      }
    }
  });

  returns.forEach((rt) => {
    const isPending = ['pending', 'initiated', 'handler_assigned', 'collected', 'store_received'].includes(rt.status);
    const isRejected = rt.status === 'rejected';
    const isCompleted = rt.status === 'completed' || rt.status === 'closed';

    if (isCompleted) {
      timelineHistory.push({
        action: 'Return Initiated to Store',
        user: rt.fromUser,
        timestamp: rt.createdAt,
        status: 'COMPLETED',
        stepOrder: 1,
        remarks: rt.remarks || rt.reason || 'Store return request',
      });
      timelineHistory.push({
        action: 'Return Accepted & Stocked in Central Store',
        user: rt.acceptedBy || { fullName: 'Central Store Incharge' },
        timestamp: rt.updatedAt || rt.createdAt,
        status: 'COMPLETED',
        stepOrder: 2,
        remarks: 'Physical material inspected and accepted back into central inventory.',
      });
    } else if (isRejected) {
      timelineHistory.push({
        action: 'Return Initiated to Store',
        user: rt.fromUser,
        timestamp: rt.createdAt,
        status: 'COMPLETED',
        stepOrder: 1,
        remarks: rt.remarks || rt.reason || 'Store return request',
      });
      timelineHistory.push({
        action: 'Return Request Rejected',
        user: rt.rejectedBy || { fullName: 'Store Approver' },
        timestamp: rt.updatedAt || rt.createdAt,
        status: 'REJECTED',
        stepOrder: 2,
        remarks: rt.rejectionReason || rt.remarks || 'Return request rejected.',
      });
    } else {
      timelineHistory.push({
        action: 'Return Initiated (Pending Store Acceptance)',
        user: rt.fromUser,
        timestamp: rt.createdAt,
        status: 'PENDING',
        stepOrder: 1,
        remarks: rt.remarks || rt.reason || 'Store return pending physical verification.',
      });
    }
  });

  exchanges.forEach((ex) => {
    if (ex.status === 'pending') {
      timelineHistory.push({
        action: 'Barcode Exchange Requested',
        user: ex.requester,
        timestamp: ex.createdAt,
        status: 'PENDING',
        stepOrder: 1,
        remarks: getCleanUserRemarks(ex.warrantyReason),
      });
    } else if (ex.status === 'approved') {
      timelineHistory.push({
        action: 'Barcode Exchange Requested',
        user: ex.requester,
        timestamp: ex.createdAt,
        status: 'COMPLETED',
        stepOrder: 1,
        remarks: getCleanUserRemarks(ex.warrantyReason),
      });
      timelineHistory.push({
        action: `Barcode Exchange Completed (Replacement: ${ex.newBarcode || 'Issued'})`,
        user: ex.approvedBy || { fullName: 'Store Admin' },
        timestamp: ex.approvedAt || ex.updatedAt,
        status: 'COMPLETED',
        stepOrder: 2,
        remarks: `Exchanged old ${ex.oldBarcode} for replacement ${ex.newBarcode || 'serial'} under warranty.`,
      });
    } else if (ex.status === 'rejected') {
      timelineHistory.push({
        action: 'Barcode Exchange Requested',
        user: ex.requester,
        timestamp: ex.createdAt,
        status: 'COMPLETED',
        stepOrder: 1,
        remarks: getCleanUserRemarks(ex.warrantyReason),
      });
      timelineHistory.push({
        action: 'Barcode Exchange Rejected',
        user: ex.approvedBy || { fullName: 'Store Admin' },
        timestamp: ex.updatedAt || ex.createdAt,
        status: 'REJECTED',
        stepOrder: 2,
        remarks: ex.rejectionReason || 'Defective barcode exchange rejected upon inspection.',
      });
    }
  });

  splits.forEach((s) => {
    const isPending = s.status === 'pending';
    const isStoreAccepted = s.status === 'store_accepted';
    const isRejected = s.status === 'rejected';
    if (isPending) {
      timelineHistory.push({
        action: 'Reel Split Requested (Pending Store Acceptance)',
        user: s.requestedBy || s.user,
        timestamp: s.createdAt,
        status: 'PENDING',
        stepOrder: 1,
        remarks: `Split ${s.splitQuantity || ''} meters from parent reel ${bc.barcode}`,
      });
    } else if (isStoreAccepted) {
      timelineHistory.push({
        action: 'Reel Split Requested',
        user: s.requestedBy || s.user,
        timestamp: s.createdAt,
        status: 'COMPLETED',
        stepOrder: 1,
        remarks: `Split ${s.splitQuantity || ''} meters requested.`,
      });
      timelineHistory.push({
        action: 'Store Accepted (Tally Stock Journal Generated)',
        user: s.approvedBy || { fullName: 'Store Admin' },
        timestamp: s.updatedAt || s.createdAt,
        status: 'PENDING',
        stepOrder: 2,
        remarks: `Phase 1 accepted. Tally Stock Journal ${s.tallyVoucherNumber || ''} generated. Awaiting physical barcode labeling (Phase 2).`,
      });
    } else if (isRejected) {
      timelineHistory.push({
        action: 'Reel Split Requested',
        user: s.requestedBy || s.user,
        timestamp: s.createdAt,
        status: 'COMPLETED',
        stepOrder: 1,
        remarks: `Split ${s.splitQuantity || ''} meters requested.`,
      });
      timelineHistory.push({
        action: 'Reel Split Rejected',
        user: s.approvedBy || { fullName: 'Store Admin' },
        timestamp: s.updatedAt || s.createdAt,
        status: 'REJECTED',
        stepOrder: 2,
        remarks: s.rejectionReason || 'Split request declined by Store.',
      });
    } else {
      timelineHistory.push({
        action: 'Reel Split Requested',
        user: s.requestedBy || s.user,
        timestamp: s.createdAt,
        status: 'COMPLETED',
        stepOrder: 1,
        remarks: `Split ${s.splitQuantity || ''} meters from parent reel.`,
      });
      timelineHistory.push({
        action: 'Reel Split Completed',
        user: s.approvedBy || { fullName: 'Store Admin' },
        timestamp: s.updatedAt || s.createdAt,
        status: 'COMPLETED',
        stepOrder: 2,
        remarks: s.newBarcode ? `Split approved. New child barcode ${s.newBarcode} active.` : `Split completed. Child units created.`,
      });
    }
  });

  // DC Internal, DC FOC, and Invoice Conversion Request Approval Steps
  (closeRequests || []).forEach((cr) => {
    const doc = cr.documentType || 'DC';
    const reqUser = cr.requester || { fullName: requesterName || 'Requester' };
    const tlName = getCleanName(cr.teamLead, null) !== 'Store Warehouse'
      ? getCleanName(cr.teamLead, null)
      : (getCleanName(bc.closeRequest?.teamLead, null) !== 'Store Warehouse'
        ? getCleanName(bc.closeRequest?.teamLead, null)
        : (getCleanName(bc.transaction?.teamLead, null) !== 'Store Warehouse'
          ? getCleanName(bc.transaction?.teamLead, null)
          : 'Department Team Lead'));

    const mgtName = getCleanName(cr.managementApprover, null) !== 'Store Warehouse'
      ? getCleanName(cr.managementApprover, null)
      : (getCleanName(bc.closeRequest?.managementApprover, null) !== 'Store Warehouse'
        ? getCleanName(bc.closeRequest?.managementApprover, null)
        : 'Management Approver');

    const apprvName = getCleanName(cr.approvedBy, null) !== 'Store Warehouse'
      ? getCleanName(cr.approvedBy, null)
      : 'Store Admin';

    // 1. Initial Request Submission
    timelineHistory.push({
      action: `Conversion Requested (${doc})`,
      user: reqUser,
      timestamp: cr.createdAt,
      stepOrder: 1,
      status: 'COMPLETED',
      remarks: cr.remarks ? `${cr.remarks}${cr.customerName ? ` • Customer: ${cr.customerName}` : ''}` : `Requested conversion to ${doc}.${cr.customerName ? ` Customer: ${cr.customerName}` : ''}`,
    });

    if (doc === 'DC Internal') {
      // Step 1: Team Lead Review
      if (cr.status === 'pending') {
        timelineHistory.push({
          action: 'Step 1: Awaiting Team Lead Review',
          user: cr.teamLead || { fullName: tlName },
          timestamp: cr.createdAt,
          stepOrder: 2,
          status: 'PENDING',
          remarks: `Pending review by Department Team Lead (${tlName}).`,
        });
      } else {
        timelineHistory.push({
          action: 'Step 1: Team Lead Approved',
          user: cr.teamLead || { fullName: tlName },
          timestamp: cr.createdAt,
          stepOrder: 2,
          status: 'COMPLETED',
          remarks: `Approved by Department Team Lead (${tlName}). Forwarded to Store for physical acceptance.`,
        });

        // Step 2: Store Physical Acceptance
        if (cr.status === 'pending_store_acceptance') {
          timelineHistory.push({
            action: 'Step 2: Awaiting Store Physical Acceptance',
            user: { fullName: 'Central Store Incharge' },
            timestamp: cr.updatedAt || cr.createdAt,
            stepOrder: 3,
            status: 'PENDING',
            remarks: 'Awaiting physical material verification and stock-in acceptance at Central Store.',
          });
        } else if (cr.status === 'approved' || cr.status === 'closed') {
          timelineHistory.push({
            action: 'Step 2: Store Physical Acceptance Completed',
            user: cr.approvedBy || { fullName: apprvName },
            timestamp: cr.updatedAt || cr.createdAt,
            stepOrder: 3,
            status: 'COMPLETED',
            remarks: `Physical verification completed by Store (${apprvName}). Barcode closed & converted to DC Internal.`,
          });
        }
      }
    } else {
      // DC FOC & Invoice
      // Step 1: Management Authorization
      if (cr.status === 'pending') {
        timelineHistory.push({
          action: 'Step 1: Awaiting Management Authorization',
          user: cr.managementApprover || { fullName: mgtName },
          timestamp: cr.createdAt,
          stepOrder: 2,
          status: 'PENDING',
          remarks: `Pending authorization by Management Approver (${mgtName}).`,
        });
      } else {
        timelineHistory.push({
          action: 'Step 1: Management Authorized',
          user: cr.managementApprover || { fullName: mgtName },
          timestamp: cr.createdAt,
          stepOrder: 2,
          status: 'COMPLETED',
          remarks: `Authorized by Management Approver (${mgtName}). Forwarded to Accounts.`,
        });

        // Step 2: Accounts Admin Audit
        if (cr.status === 'pending_accounts_approval') {
          timelineHistory.push({
            action: 'Step 2: Awaiting Accounts Admin Review',
            user: { fullName: 'Accounts Admin (Finance & Accounts Team)' },
            timestamp: cr.updatedAt || cr.createdAt,
            stepOrder: 3,
            status: 'PENDING',
            remarks: `Tax & ledger verification pending with Accounts Admin for ${doc}.`,
          });
        } else {
          timelineHistory.push({
            action: 'Step 2: Accounts Admin Approved',
            user: { fullName: 'Accounts Admin' },
            timestamp: cr.updatedAt || cr.createdAt,
            stepOrder: 3,
            status: 'COMPLETED',
            remarks: 'Verified & approved by Accounts Admin. Forwarded to Store for physical acceptance.',
          });

          // Step 3: Store Physical Acceptance
          if (cr.status === 'pending_store_acceptance') {
            timelineHistory.push({
              action: 'Step 3: Awaiting Store Physical Acceptance',
              user: { fullName: 'Central Store Incharge' },
              timestamp: cr.updatedAt || cr.createdAt,
              stepOrder: 4,
              status: 'PENDING',
              remarks: 'Physical material verification and stock-in pending at Central Store.',
            });
          } else if (cr.status === 'approved' || cr.status === 'closed') {
            timelineHistory.push({
              action: `Step 3: Conversion Completed (${doc})`,
              user: cr.approvedBy || { fullName: apprvName },
              timestamp: cr.updatedAt || cr.createdAt,
              stepOrder: 4,
              status: 'COMPLETED',
              remarks: `Store physical verification complete by ${apprvName}. Converted to ${doc}.${cr.invoiceNumber ? ` Invoice No: ${cr.invoiceNumber}` : ''}`,
            });
          }
        }
      }
    }

    if (cr.status === 'rejected') {
      timelineHistory.push({
        action: `Conversion Request Rejected (${doc})`,
        user: cr.approvedBy || { fullName: 'Approver' },
        timestamp: cr.updatedAt || cr.createdAt,
        stepOrder: 5,
        status: 'REJECTED',
        remarks: `Rejected. Reason: ${cr.rejectionReason || 'No rejection reason specified'}`,
      });
    }
  });

  timelineHistory.sort((a, b) => {
    const timeA = new Date(a.timestamp || 0).getTime();
    const timeB = new Date(b.timestamp || 0).getTime();
    if (timeB !== timeA) return timeB - timeA;
    return (b.stepOrder || 0) - (a.stepOrder || 0);
  });

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

                {resolvedInvoiceNumber ? (
                  <View style={styles.infoRow}>
                    <FileText size={16} color="#4338ca" />
                    <Text style={styles.infoLabel}>Invoice Number:</Text>
                    <Text style={[styles.infoValue, { color: '#4338ca', fontWeight: '800' }]}>
                      {resolvedInvoiceNumber}
                    </Text>
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

              {isUnderDelivery ? (
                <View style={{ backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', padding: 14, borderRadius: 10, marginBottom: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#1d4ed8' }}>
                    Material Under Delivery (In-Transit)
                  </Text>
                  <Text style={{ fontSize: 12, color: '#1e40af', marginTop: 4, lineHeight: 16 }}>
                    This material is currently in transit / under delivery. Barcode actions (Transfer, Return, Split, Exchange, Merge, DC) are disabled until delivery and receiving confirmation are completed.
                  </Text>
                </View>
              ) : hasPendingAction ? (
                <View style={styles.pendingActionCard}>
                  <View style={styles.pendingHeaderRow}>
                    <View style={styles.pendingBadge}>
                      <Clock size={14} color="#c2410c" />
                      <Text style={styles.pendingBadgeText}>APPROVAL PENDING</Text>
                    </View>
                    <Text style={styles.pendingStageTitle}>{pendingApprovalStage}</Text>
                  </View>

                  <View style={styles.approverDetailBox}>
                    <UserCheck size={18} color="#ea580c" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.approverLabel}>Currently Pending With:</Text>
                      <Text style={styles.approverNameText}>{pendingApproverName}</Text>
                      {pendingApproverRole ? <Text style={styles.approverRoleText}>{pendingApproverRole}</Text> : null}
                    </View>
                  </View>

                  <Text style={styles.pendingDescriptionText}>{pendingApprovalDescription}</Text>

                  {pendingStepsList.length > 0 && (
                    <View style={styles.workflowStepsContainer}>
                      <Text style={styles.workflowStepsTitle}>Approval Workflow Steps:</Text>
                      {pendingStepsList.map((st) => {
                        const isDone = st.status === 'COMPLETED';
                        const isCurrent = st.status === 'PENDING';
                        return (
                          <View key={st.step} style={styles.workflowStepRow}>
                            <View style={[styles.stepDot, isDone && styles.stepDotDone, isCurrent && styles.stepDotPending]}>
                              {isDone ? (
                                <CheckCircle size={14} color="#16a34a" />
                              ) : isCurrent ? (
                                <Clock size={14} color="#ea580c" />
                              ) : (
                                <View style={styles.stepDotQueued} />
                              )}
                            </View>
                            <View style={styles.stepInfoCol}>
                              <Text style={[styles.stepNameText, isCurrent && styles.stepNameTextCurrent]}>
                                Step {st.step}: {st.name}
                              </Text>
                              <Text style={styles.stepApproverText}>
                                Approver: <Text style={{ fontWeight: '700', color: '#1e293b' }}>{st.approver}</Text>
                                {' • '}
                                <Text style={{ fontWeight: '600', color: isDone ? '#16a34a' : isCurrent ? '#ea580c' : '#94a3b8' }}>
                                  {isDone ? 'Approved' : isCurrent ? 'Pending Action' : 'Queued'}
                                </Text>
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              ) : isReturnedToStore ? (
                <View style={{ backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', padding: 14, borderRadius: 10, marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <CheckCircle size={18} color="#16a34a" />
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#15803d' }}>
                      Material Returned to Central Store
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: '#166534', lineHeight: 18 }}>
                    This material has been physically returned and accepted into Central Store inventory. Barcode operations are closed.
                  </Text>
                </View>
              ) : isTransferPending ? (
                <View style={{ backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa', padding: 14, borderRadius: 10, marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Clock size={18} color="#ea580c" />
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#c2410c' }}>
                      Transfer Request Pending
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: '#9a3412', lineHeight: 18 }}>
                    {pendingTransfer?.requiresApproval
                      ? `Cross-department transfer is awaiting Management approval (${getCleanName(pendingTransfer.managementApprover, 'Management Approver')}). Barcode actions are locked until approved.`
                      : `Transfer request is awaiting recipient acceptance by ${getCleanName(pendingTransfer?.toUser, 'recipient')}. Barcode actions are locked until accepted.`}
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
                    Not Active Owner
                  </Text>
                  <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    You are not the active owner of this material. Actions can only be performed by the current owner ({ownerName}).
                  </Text>
                </View>
              ) : null}

              {!isUnderDelivery && !hasPendingAction && !isReturnedToStore && !isTransferPending && isOwner && isBarcodeActive && (
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
                    style={[styles.actionBtn, { backgroundColor: '#e0e7ff', borderColor: '#a5b4fc' }]}
                    onPress={() => navigation.navigate('ConvertMaterialScreen', { barcode: bc.barcode })}
                  >
                    <FileText size={20} color="#4338ca" />
                    <View style={styles.actionTextCol}>
                      <Text style={[styles.actionTitle, { color: '#3730a3' }]}>Convert to DC/Invoice</Text>
                      <Text style={styles.actionSubText}>Convert to DC Internal or DC FOC or Invoice</Text>
                    </View>
                    <ChevronRight size={18} color="#4338ca" />
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
                  const isPending = item.status === 'PENDING';
                  const isRejected = item.status === 'REJECTED';

                  return (
                    <View key={index} style={[styles.timelineItem, isRejected && styles.timelineItemRejected]}>
                      <View style={styles.timelineIconDot}>
                        {isPending ? (
                          <Clock size={16} color="#ea580c" />
                        ) : isRejected ? (
                          <XCircle size={16} color="#dc2626" />
                        ) : (
                          <CheckCircle size={16} color="#16a34a" />
                        )}
                      </View>
                      <View style={styles.timelineContent}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={[styles.timelineAction, { flex: 1, minWidth: 140 }, isPending && { color: '#c2410c' }, isRejected && { color: '#b91c1c' }]}>
                            {item.action}
                          </Text>
                          {isPending && (
                            <View style={styles.timelinePendingBadge}>
                              <Text style={styles.timelinePendingBadgeText}>Pending</Text>
                            </View>
                          )}
                          {isRejected && (
                            <View style={styles.timelineRejectedBadge}>
                              <Text style={styles.timelineRejectedBadgeText}>Rejected</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.timelineUser, isRejected && { color: '#991b1b' }]}>
                          By: <Text style={{ fontWeight: '600', color: isRejected ? '#991b1b' : '#334155' }}>{userName}</Text> • {dateStr}
                        </Text>
                        {item.remarks ? (
                          <Text style={[styles.timelineRemarks, isRejected && styles.timelineRemarksRejected]}>
                            {isRejected ? `Reason: "${item.remarks}"` : `"${item.remarks}"`}
                          </Text>
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
  timelineItemRejected: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginVertical: 2,
  },
  timelineIconDot: {
    marginTop: 2,
  },
  timelineContent: {
    flex: 1,
    minWidth: 0,
    gap: 3,
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
  timelineRemarksRejected: {
    color: '#b91c1c',
    fontWeight: '600',
    fontStyle: 'normal',
  },
  timelinePendingBadge: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  timelinePendingBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ea580c',
  },
  timelineRejectedBadge: {
    backgroundColor: '#fee2e2',
    borderColor: '#f87171',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  timelineRejectedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#b91c1c',
  },
  pendingActionCard: {
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    gap: 10,
  },
  pendingHeaderRow: {
    gap: 6,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ffedd5',
    borderColor: '#fdba74',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  pendingBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#c2410c',
    letterSpacing: 0.5,
  },
  pendingStageTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#9a3412',
    marginTop: 2,
  },
  approverDetailBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderColor: '#fed7aa',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  approverLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9a3412',
  },
  approverNameText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1e293b',
    marginTop: 1,
  },
  approverRoleText: {
    fontSize: 11,
    color: '#ea580c',
    fontWeight: '600',
    marginTop: 1,
  },
  pendingDescriptionText: {
    fontSize: 12,
    color: '#9a3412',
    lineHeight: 17,
  },
  workflowStepsContainer: {
    backgroundColor: '#ffffff',
    borderColor: '#fed7aa',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
    marginTop: 2,
  },
  workflowStepsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7c2d12',
    marginBottom: 2,
  },
  workflowStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  stepDotDone: {
    backgroundColor: '#dcfce7',
  },
  stepDotPending: {
    backgroundColor: '#ffedd5',
  },
  stepDotQueued: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#cbd5e1',
  },
  stepInfoCol: {
    flex: 1,
  },
  stepNameText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  stepNameTextCurrent: {
    fontWeight: '800',
    color: '#c2410c',
  },
  stepApproverText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
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
