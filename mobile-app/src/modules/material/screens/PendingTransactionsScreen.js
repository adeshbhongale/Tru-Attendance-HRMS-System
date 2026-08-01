import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Clock,
  Search,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Filter,
  ArrowRightLeft,
  Scissors,
  RotateCcw,
  RefreshCw,
  FileSpreadsheet,
  GitMerge,
  Package,
  User,
  X,
  Send,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialHeader from '../components/MaterialHeader';
import MaterialModuleFooter from '../components/MaterialModuleFooter';
import StatusBadge from '../components/StatusBadge';
import materialApi from '../api/materialApi';

const PendingTransactionsScreen = ({ navigation }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Raw data lists
  const [txns, setTxns] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [splits, setSplits] = useState([]);
  const [returns, setReturns] = useState([]);
  const [closeRequests, setCloseRequests] = useState([]);
  const [exchanges, setExchanges] = useState([]);
  const [merges, setMerges] = useState([]);

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState('pending'); // 'pending' | 'history'
  const [requestType, setRequestType] = useState('all');

  // Action Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [modalActionType, setModalActionType] = useState('approve');
  const [modalTitle, setModalTitle] = useState('');
  const [modalItem, setModalItem] = useState(null);
  const [actionRemarks, setActionRemarks] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);

  useEffect(() => {
    loadUser();
    fetchApprovals();
  }, []);

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

  const fetchApprovals = async () => {
    try {
      setLoading(true);
      const [
        txnRes,
        transferRes,
        splitRes,
        returnRes,
        closeRes,
        exchangeRes,
        mergeRes,
      ] = await Promise.all([
        materialApi.getTransactions(),
        materialApi.getAllTransfers().catch(() => ({ data: [] })),
        materialApi.getAllSplits().catch(() => ({ data: [] })),
        materialApi.getAllReturns().catch(() => ({ data: [] })),
        materialApi.getAllCloseRequests().catch(() => ({ data: [] })),
        materialApi.getAllExchanges().catch(() => ({ data: [] })),
        materialApi.getAllMerges().catch(() => ({ data: [] })),
      ]);

      const extractArray = (res) => {
        if (!res) return [];
        if (Array.isArray(res)) return res;
        if (Array.isArray(res.data)) return res.data;
        if (res.data && Array.isArray(res.data.data)) return res.data.data;
        if (res.data && Array.isArray(res.data.transfers)) return res.data.transfers;
        if (Array.isArray(res.transfers)) return res.transfers;
        return [];
      };

      const allTxns = extractArray(txnRes);
      const allTransfers = extractArray(transferRes);
      const allSplits = extractArray(splitRes);
      const allReturns = extractArray(returnRes);
      const allCloses = extractArray(closeRes);
      const allExchanges = extractArray(exchangeRes);
      const allMerges = extractArray(mergeRes);

      setTxns(allTxns);
      setTransfers(allTransfers);
      setSplits(allSplits);
      setReturns(allReturns);
      setCloseRequests(allCloses);
      setExchanges(allExchanges);
      setMerges(allMerges);
    } catch (err) {
      console.warn('Error fetching pending approvals', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Helper filters
  const filterBySearch = (item, idKey = 'transactionId') => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const idMatch = (item[idKey] || item.barcode || item.oldBarcode || '').toLowerCase().includes(q);
    const userMatch = (
      (item.requester && item.requester.fullName) ||
      (item.fromUser && item.fromUser.fullName) ||
      (item.requester && item.requester.name) ||
      ''
    ).toLowerCase().includes(q);
    const matMatch = (
      item.materialName ||
      item.requestedMaterialName ||
      item.description ||
      ''
    ).toLowerCase().includes(q);
    return idMatch || userMatch || matMatch;
  };

  const isStoreUser = (user) => {
    if (!user) return false;
    const r = user.role;
    const at = user.adminType || user.departmentAdminType;
    if (r === 'store' || at === 'store' || (r === 'department_admin' && at === 'store')) return true;
    if (user.department && typeof user.department === 'string' && user.department.toLowerCase().includes('store')) return true;
    if (user.department && typeof user.department === 'object' && user.department.name && user.department.name.toLowerCase().includes('store')) return true;
    return false;
  };

  const isManagementUser = (user, item) => {
    if (!user) return false;
    const r = user.role;
    const at = user.adminType || user.departmentAdminType;
    const userId = user._id || user.id;

    // Check explicit management approver assignment on item
    if (item && item.managementApprover) {
      const mgtId = typeof item.managementApprover === 'object' ? item.managementApprover._id : item.managementApprover;
      if (mgtId && userId && mgtId.toString() === userId.toString()) {
        return true;
      }
    }

    // Check role or departmentAdminType
    if (r === 'management' || at === 'management' || (r === 'department_admin' && (at === 'management' || !at))) {
      return true;
    }

    if (['admin', 'super_admin', 'company_admin'].includes(r)) {
      return true;
    }

    return false;
  };

  // Grouped Item List Building
  const getFilteredItems = () => {
    let list = [];

    const role = (currentUser && currentUser.role) || 'employee';

    // 1. Transaction Requests
    if (['all', 'material'].includes(requestType)) {
      const filteredTxns = txns.filter((t) => {
        let isPending = false;

        if (['mgt_approved', 'ready_for_dispatch', 'store_accepted'].includes(t.status)) {
          // Store dispatch stage - pending for store accept & dispatch
          isPending = true;
        } else if (role === 'team_lead') {
          isPending = t.status === 'submitted';
        } else if (isManagementUser(currentUser, t)) {
          // Management Admin sees requests that are tl_approved (or submitted for super admin)
          isPending = t.status === 'tl_approved' || (['admin', 'super_admin'].includes(role) && t.status === 'submitted');
        } else {
          isPending = ['submitted', 'tl_approved', 'mgt_approved', 'store_accepted', 'dispatched'].includes(t.status);
        }

        if (statusTab === 'pending' ? !isPending : isPending) return false;
        return filterBySearch(t, 'transactionId');
      });
      list.push(...filteredTxns.map((t) => ({ ...t, _cardType: 'material' })));
    }

    // 2. Barcode Transfers
    if (['all', 'transfer'].includes(requestType)) {
      const currentUserId = currentUser ? (currentUser._id || currentUser.id) : null;
      const filteredTransfers = transfers.filter((tr) => {
        const toUserId = tr.toUser ? (tr.toUser._id || tr.toUser) : null;
        const mgmtId = tr.managementApprover ? (tr.managementApprover._id || tr.managementApprover) : null;
        const fromUserId = tr.fromUser ? (tr.fromUser._id || tr.fromUser) : null;

        const isRecipient = currentUserId && toUserId && String(toUserId) === String(currentUserId);
        const isMgmtApprover = currentUserId && mgmtId && String(mgmtId) === String(currentUserId);
        const isSender = currentUserId && fromUserId && String(fromUserId) === String(currentUserId);
        const isMgt = isManagementUser(currentUser, tr);

        // Include pending items relevant to user (or all if admin)
        const isPending = (tr.status === 'pending' && (isMgmtApprover || isMgt || isSender || isRecipient)) ||
                          (tr.status === 'approved' && (isRecipient || isSender || isMgt)) ||
                          ['pending', 'approved'].includes(tr.status);

        if (statusTab === 'pending' ? !isPending : isPending) return false;
        return filterBySearch(tr, 'barcode');
      });
      list.push(...filteredTransfers.map((tr) => ({ ...tr, _cardType: 'transfer' })));
    }

    // 3. Split Requests
    if (['all', 'split'].includes(requestType)) {
      const filteredSplits = splits.filter((s) => {
        const isPending = s.status === 'pending';
        if (statusTab === 'pending' ? !isPending : isPending) return false;
        return filterBySearch(s, 'barcode');
      });
      list.push(...filteredSplits.map((s) => ({ ...s, _cardType: 'split' })));
    }

    // 4. Return Requests
    if (['all', 'return'].includes(requestType)) {
      const filteredReturns = returns.filter((r) => {
        const isPending = ['pending', 'initiated', 'handler_assigned', 'collected', 'store_received'].includes(r.status);
        if (statusTab === 'pending' ? !isPending : isPending) return false;
        return filterBySearch(r, 'barcode');
      });
      list.push(...filteredReturns.map((r) => ({ ...r, _cardType: 'return' })));
    }

    // 5. Conversion / Close Requests
    if (['all', 'conversion'].includes(requestType)) {
      const filteredCloses = closeRequests.filter((c) => {
        const isPending = ['pending', 'pending_store_acceptance', 'pending_accounts_approval'].includes(c.status);
        if (statusTab === 'pending' ? !isPending : isPending) return false;
        return filterBySearch(c, 'barcode');
      });
      list.push(...filteredCloses.map((c) => ({ ...c, _cardType: 'conversion' })));
    }

    // 6. Exchange Requests
    if (['all', 'exchange'].includes(requestType)) {
      const filteredExchanges = exchanges.filter((e) => {
        const isPending = e.status === 'pending';
        if (statusTab === 'pending' ? !isPending : isPending) return false;
        return filterBySearch(e, 'oldBarcode');
      });
      list.push(...filteredExchanges.map((e) => ({ ...e, _cardType: 'exchange' })));
    }

    // 7. Merge Requests
    if (['all', 'merge'].includes(requestType)) {
      const filteredMerges = merges.filter((m) => {
        const isPending = m.status === 'pending';
        if (statusTab === 'pending' ? !isPending : isPending) return false;
        return filterBySearch(m, 'transactionId');
      });
      list.push(...filteredMerges.map((m) => ({ ...m, _cardType: 'merge' })));
    }

    return list;
  };

  const displayedItems = getFilteredItems();

  // Action Handlers
  const handleOpenActionModal = (item, actionType, title) => {
    setModalItem(item);
    setModalActionType(actionType);
    setModalTitle(title);
    setActionRemarks('');
    setModalVisible(true);
  };

  const handleExecuteModalAction = async () => {
    if (!modalItem) return;
    try {
      setActionSubmitting(true);
      const cardType = modalItem._cardType;
      const itemId = modalItem._id || modalItem.id;

      if (cardType === 'material') {
        if (modalActionType === 'approve') {
          await materialApi.approveTransaction(itemId, actionRemarks);
          Alert.alert('Approved', 'Transaction approved successfully!');
        } else if (modalActionType === 'reject') {
          await materialApi.rejectTransaction(itemId, actionRemarks);
          Alert.alert('Rejected', 'Transaction request rejected.');
        } else if (modalActionType === 'store-accept') {
          await materialApi.storeAcceptTransaction(itemId);
          Alert.alert('Accepted', 'Store accepted transaction!');
        }
      } else if (cardType === 'transfer') {
        const isAccept = ['approve', 'accept_transfer'].includes(modalActionType);
        await materialApi.handleTransfer({
          transferId: itemId,
          action: isAccept ? 'accept' : 'reject',
          reason: actionRemarks,
          gps: { lat: 18.5204, lng: 73.8567, address: 'MIDC Kolhapur, India' },
        });
        Alert.alert('Success', `Transfer ${isAccept ? 'accepted' : 'rejected'} successfully!`);
      } else if (cardType === 'split') {
        await materialApi.approveSplit({
          requestId: itemId,
          action: modalActionType === 'approve' ? 'approve' : 'reject',
          rejectionReason: actionRemarks,
        });
        Alert.alert('Success', `Split request ${modalActionType === 'approve' ? 'approved' : 'rejected'}!`);
      } else if (cardType === 'return') {
        await materialApi.acceptReturn(itemId, { remarks: actionRemarks });
        Alert.alert('Success', 'Return voucher receipt confirmed!');
      } else if (cardType === 'conversion') {
        await materialApi.respondCloseRequest(itemId, {
          action: modalActionType === 'approve' ? 'approve' : 'reject',
          rejectionReason: actionRemarks,
        });
        Alert.alert('Success', `Conversion request ${modalActionType === 'approve' ? 'approved' : 'rejected'}!`);
      } else if (cardType === 'exchange') {
        await materialApi.respondExchange(itemId, {
          action: modalActionType === 'approve' ? 'approve' : 'reject',
          rejectionReason: actionRemarks,
        });
        Alert.alert('Success', `Exchange request ${modalActionType === 'approve' ? 'approved' : 'rejected'}!`);
      } else if (cardType === 'merge') {
        await materialApi.approveMerge({
          requestId: itemId,
          action: modalActionType === 'approve' ? 'approve' : 'reject',
          rejectionReason: actionRemarks,
        });
        Alert.alert('Success', `Merge request ${modalActionType === 'approve' ? 'approved' : 'rejected'}!`);
      }

      setModalVisible(false);
      fetchApprovals();
    } catch (err) {
      Alert.alert('Action Error', (err.response && err.response.data && err.response.data.message) || err.message);
    } finally {
      setActionSubmitting(false);
    }
  };

  // Get dynamic status explanation text matching web client
  const getCardStatusLine = (item) => {
    const role = (currentUser && currentUser.role) || 'employee';
    const adminType = currentUser && currentUser.adminType;
    const userId = currentUser && currentUser._id;
    const isHandler = (item.handler && (item.handler._id || item.handler) === userId);
    const isRequester = (item.requester && (item.requester._id || item.requester) === userId);

    if (isHandler) {
      if (item.status === 'store_accepted') return 'Action Required: Collect from Store';
      if (item.status === 'handler_assigned') return 'Action Required: Dispatch / Handover';
    }

    if (role === 'team_lead') {
      if (item.status === 'submitted') return 'Action Required: Review & Approve Request';
      return `Tracking: Awaiting ${item.status === 'tl_approved' ? 'Management Approval' : 'Sourcing'}`;
    }

    if (role === 'department_admin' && adminType === 'management') {
      if (item.status === 'tl_approved') return 'Action Required: Management Approval';
      return `Tracking: Awaiting ${item.status === 'submitted' ? 'TL Approval' : 'Store Processing'}`;
    }

    if (role === 'department_admin' && adminType === 'store') {
      if (['mgt_approved', 'ready_for_dispatch'].includes(item.status)) return 'Action Required: Store Accept';
      if (item.status === 'store_accepted') return 'Action Required: Assign Handler';
      return 'Tracking: Dispatched / In Transit';
    }

    if (role === 'admin') {
      if (item.status === 'submitted') return 'Action Required: TL Review Stage';
      if (item.status === 'tl_approved') return 'Action Required: Management Review Stage';
    }

    if (role === 'employee' || isRequester) {
      if (item.status === 'submitted') return 'Tracking: Awaiting Team Lead Approval';
      if (item.status === 'tl_approved') return 'Tracking: Awaiting Management Approval';
      if (item.status === 'mgt_approved') return 'Tracking: Awaiting Store Sourcing';
      if (item.status === 'store_accepted') return 'Tracking: Sourcing Handler Assigned';
      return `Tracking: ${item.status.replace('_', ' ').toUpperCase()}`;
    }

    return item.status.replace('_', ' ').toUpperCase();
  };

  // Render role-scoped approval action buttons matching web client RBAC
  const renderActionButtons = (item) => {
    const role = (currentUser && currentUser.role) || 'employee';
    const userId = currentUser && currentUser._id;
    const cardType = item._cardType;
    const isHandler = (item.handler && (item.handler._id || item.handler) === userId);

    // 1. DISPATCHED RECEIVER STAGE: Requests dispatched by store (dispatched, in_transit, handler_assigned)
    // SHOW ACCEPT MATERIAL & REJECT BUTTONS FOR REQUESTER / RECEIVER
    if (['dispatched', 'in_transit', 'handler_assigned'].includes(item.status) && cardType === 'material') {
      return (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity
            style={[styles.miniBtn, { backgroundColor: '#16a34a' }]}
            onPress={() => navigation.navigate('ReceivingFormScreen', { id: item._id || item.transactionId })}
          >
            <CheckCircle2 size={14} color="#ffffff" />
            <Text style={styles.miniBtnText}>Accept Material</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.miniBtn, { backgroundColor: '#dc2626' }]}
            onPress={() => handleOpenActionModal(item, 'reject', 'Reject Dispatched Material')}
          >
            <XCircle size={14} color="#ffffff" />
            <Text style={styles.miniBtnText}>Reject</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // 2. STORE DISPATCH STAGE: Requests approved by management (mgt_approved, ready_for_dispatch, store_accepted)
    // SHOW ONLY ACCEPT & DISPATCH BUTTON (NO REJECT BUTTON)
    if (['mgt_approved', 'ready_for_dispatch', 'store_accepted'].includes(item.status) && cardType === 'material') {
      if (isStoreUser(currentUser) || ['department_admin', 'store', 'admin', 'super_admin', 'company_admin', 'management'].includes(role)) {
        return (
          <TouchableOpacity
            style={[styles.miniBtn, { backgroundColor: '#16a34a' }]}
            onPress={() => navigation.navigate('StoreDispatchScreen', { id: item._id || item.transactionId })}
          >
            <CheckCircle2 size={14} color="#ffffff" />
            <Text style={styles.miniBtnText}>Accept & Dispatch</Text>
          </TouchableOpacity>
        );
      }
      return null;
    }

    // 3. BARCODE TRANSFER ACTIONS (Target Employee Accept/Reject & Management Approver Mgt Approve/Reject)
    if (cardType === 'transfer') {
      const currentUserId = currentUser ? (currentUser._id || currentUser.id) : null;
      const toUserId = item.toUser ? (item.toUser._id || item.toUser) : null;
      const mgmtId = item.managementApprover ? (item.managementApprover._id || item.managementApprover) : null;

      const isRecipient = currentUserId && toUserId && String(toUserId) === String(currentUserId);
      const isMgmtApprover = currentUserId && mgmtId && String(mgmtId) === String(currentUserId);
      const isMgt = isManagementUser(currentUser, item);

      // Pending Management Approval Stage
      if (item.status === 'pending' && (isMgmtApprover || isMgt)) {
        return (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              style={[styles.miniBtn, { backgroundColor: '#16a34a' }]}
              onPress={() => handleOpenActionModal(item, 'approve', 'Management Approve Transfer')}
            >
              <CheckCircle2 size={14} color="#ffffff" />
              <Text style={styles.miniBtnText}>Mgt Approve</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.miniBtn, { backgroundColor: '#dc2626' }]}
              onPress={() => handleOpenActionModal(item, 'reject', 'Reject Transfer Request')}
            >
              <XCircle size={14} color="#ffffff" />
              <Text style={styles.miniBtnText}>Reject</Text>
            </TouchableOpacity>
          </View>
        );
      }

      // Pending Recipient Acceptance Stage (status is approved OR pending with no mgmt requirement)
      if ((item.status === 'approved' || (item.status === 'pending' && !item.requiresApproval)) && (isRecipient || ['admin', 'super_admin'].includes(role))) {
        return (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              style={[styles.miniBtn, { backgroundColor: '#16a34a' }]}
              onPress={() => handleOpenActionModal(item, 'accept_transfer', 'Accept Transfer Request')}
            >
              <CheckCircle2 size={14} color="#ffffff" />
              <Text style={styles.miniBtnText}>Accept Transfer</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.miniBtn, { backgroundColor: '#dc2626' }]}
              onPress={() => handleOpenActionModal(item, 'reject_transfer', 'Reject Transfer Request')}
            >
              <XCircle size={14} color="#ffffff" />
              <Text style={styles.miniBtnText}>Reject</Text>
            </TouchableOpacity>
          </View>
        );
      }

      return null;
    }

    // 4. Regular Requester Employee -> NO APPROVAL OR REJECTION BUTTONS FOR MATERIAL REQUESTS
    if (role === 'employee' && !isHandler) {
      return null;
    }

    // 3. Team Lead -> Can approve/reject submitted requests
    if (role === 'team_lead') {
      if (item.status === 'submitted') {
        return (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              style={[styles.miniBtn, { backgroundColor: '#16a34a' }]}
              onPress={() => handleOpenActionModal(item, 'approve', 'Approve & Forward')}
            >
              <CheckCircle2 size={14} color="#ffffff" />
              <Text style={styles.miniBtnText}>Approve & Forward</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.miniBtn, { backgroundColor: '#dc2626' }]}
              onPress={() => handleOpenActionModal(item, 'reject', 'Reject Request')}
            >
              <XCircle size={14} color="#ffffff" />
              <Text style={styles.miniBtnText}>Reject</Text>
            </TouchableOpacity>
          </View>
        );
      }
      return null;
    }

    // 4. Management -> Can approve/reject tl_approved requests (or admin)
    if (isManagementUser(currentUser, item)) {
      if (item.status === 'tl_approved' || (['admin', 'super_admin'].includes(role) && item.status === 'submitted')) {
        return (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              style={[styles.miniBtn, { backgroundColor: '#16a34a' }]}
              onPress={() => handleOpenActionModal(item, 'approve', 'Management Approve')}
            >
              <CheckCircle2 size={14} color="#ffffff" />
              <Text style={styles.miniBtnText}>Mgt Approve</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.miniBtn, { backgroundColor: '#dc2626' }]}
              onPress={() => handleOpenActionModal(item, 'reject', 'Reject Request')}
            >
              <XCircle size={14} color="#ffffff" />
              <Text style={styles.miniBtnText}>Reject</Text>
            </TouchableOpacity>
          </View>
        );
      }
      return null;
    }

    // 5. Fallback for non-material workflow items for admins / lead
    if (['admin', 'department_admin', 'team_lead'].includes(role) && cardType !== 'material') {
      return (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity
            style={[styles.miniBtn, { backgroundColor: '#16a34a' }]}
            onPress={() => handleOpenActionModal(item, 'approve', `Approve ${cardType}`)}
          >
            <CheckCircle2 size={14} color="#ffffff" />
            <Text style={styles.miniBtnText}>Approve</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.miniBtn, { backgroundColor: '#dc2626' }]}
            onPress={() => handleOpenActionModal(item, 'reject', `Reject ${cardType}`)}
          >
            <XCircle size={14} color="#ffffff" />
            <Text style={styles.miniBtnText}>Reject</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return null;
  };

  // Render Card Item
  const renderCardItem = ({ item }) => {
    const cardType = item._cardType;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.typeBadgeRow}>
            {cardType === 'material' && <Package size={16} color="#2563eb" />}
            {cardType === 'transfer' && <ArrowRightLeft size={16} color="#2563eb" />}
            {cardType === 'split' && <Scissors size={16} color="#7c3aed" />}
            {cardType === 'return' && <RotateCcw size={16} color="#dc2626" />}
            {cardType === 'conversion' && <FileSpreadsheet size={16} color="#16a34a" />}
            {cardType === 'exchange' && <RefreshCw size={16} color="#d97706" />}
            {cardType === 'merge' && <GitMerge size={16} color="#0284c7" />}

            <Text style={styles.cardTypeTitle}>
              {cardType.toUpperCase()} • {item.transactionId || item.barcode || item.oldBarcode || 'REQUEST'}
            </Text>
          </View>

          <StatusBadge status={item.status || 'pending'} />
        </View>

        <View style={styles.divider} />

        {/* Card Body Details */}
        {cardType === 'material' && (
          <View style={styles.cardBody}>
            <Text style={styles.bodyTextMain}>
              Requester: {(item.requester && (item.requester.fullName || item.requester.name)) || 'Staff User'}
            </Text>
            <Text style={styles.bodyTextSub}>{(item.materials && item.materials.length) || 0} Material Items</Text>
          </View>
        )}

        {cardType === 'transfer' && (
          <View style={styles.cardBody}>
            <Text style={styles.bodyTextMain}>
              Transfer: {(item.fromUser && item.fromUser.fullName) || 'Sender'} ➔ {(item.toUser && item.toUser.fullName) || 'Recipient'}
            </Text>
            <Text style={styles.bodyTextSub}>Barcode: {item.barcode}</Text>
          </View>
        )}

        {cardType === 'split' && (
          <View style={styles.cardBody}>
            <Text style={styles.bodyTextMain}>
              Split Material: {item.requestedMaterialName || item.materialName || 'Material'}
            </Text>
            <Text style={styles.bodyTextSub}>Parent Barcode: {item.barcode}</Text>
          </View>
        )}

        {cardType === 'return' && (
          <View style={styles.cardBody}>
            <Text style={styles.bodyTextMain}>
              Returned By: {(item.fromUser && item.fromUser.fullName) || 'Staff User'}
            </Text>
            <Text style={styles.bodyTextSub}>
              Barcode: {item.barcode} ({item.condition || 'good'})
            </Text>
          </View>
        )}

        {cardType === 'conversion' && (
          <View style={styles.cardBody}>
            <Text style={styles.bodyTextMain}>
              Target Doc: {item.documentType} {item.customerName ? `(${item.customerName})` : ''}
            </Text>
            <Text style={styles.bodyTextSub}>Barcode: {item.barcode}</Text>
          </View>
        )}

        {cardType === 'exchange' && (
          <View style={styles.cardBody}>
            <Text style={styles.bodyTextMain}>
              Exchange Old: {item.oldBarcode} ➔ New: {item.newBarcode || 'Pending Issue'}
            </Text>
            <Text style={styles.bodyTextSub}>Reason: {item.warrantyReason || 'Warranty Replacement'}</Text>
          </View>
        )}

        {cardType === 'merge' && (
          <View style={styles.cardBody}>
            <Text style={styles.bodyTextMain}>
              Merge Lot: {item.requestedMaterialName || 'Lot Merge'}
            </Text>
            <Text style={styles.bodyTextSub}>
              Barcodes: {Array.isArray(item.mergeBarcodes) ? item.mergeBarcodes.join(', ') : item.barcode}
            </Text>
          </View>
        )}

        {item.remarks ? (
          <Text style={styles.remarksText}>"{item.remarks}"</Text>
        ) : null}

        {/* Dynamic Status Line */}
        <Text style={styles.statusLineText}>{getCardStatusLine(item)}</Text>

        {/* Action Button Row */}
        {statusTab === 'pending' && (
          <View style={styles.actionBtnRow}>
            {renderActionButtons(item)}

            <TouchableOpacity
              style={[styles.miniBtn, { backgroundColor: '#f1f5f9' }]}
              onPress={() => {
                if (item.transactionId || cardType === 'material') {
                  navigation.navigate('MaterialDetailScreen', {
                    id: item._id || item.transactionId,
                  });
                } else if (item.barcode) {
                  navigation.navigate('BarcodeDetailScreen', { barcode: item.barcode });
                }
              }}
            >
              <Text style={[styles.miniBtnText, { color: '#475569' }]}>Details ➔</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title="Pending Workflow Approvals"
        subtitle="Approve transactions, transfers, splits & returns"
        navigation={navigation}
      />

      {/* Search & Pending/History Tab Header */}
      <View style={styles.topFilterContainer}>
        {/* Search Bar */}
        <View style={styles.searchRow}>
          <Search size={18} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by ID, Barcode, Requester or Material..."
            placeholderTextColor="#94a3b8"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* Pending vs History Tabs */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, statusTab === 'pending' && styles.tabBtnActive]}
            onPress={() => setStatusTab('pending')}
          >
            <Text style={[styles.tabBtnText, statusTab === 'pending' && styles.tabBtnTextActive]}>
              Pending Action
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, statusTab === 'history' && styles.tabBtnActive]}
            onPress={() => setStatusTab('history')}
          >
            <Text style={[styles.tabBtnText, statusTab === 'history' && styles.tabBtnTextActive]}>
              Audit History
            </Text>
          </TouchableOpacity>
        </View>

        {/* Filter Request Types */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
          {[
            { key: 'all', label: 'All Requests' },
            { key: 'material', label: 'Materials' },
            { key: 'transfer', label: 'Transfers' },
            { key: 'split', label: 'Splits' },
            { key: 'return', label: 'Returns' },
            { key: 'conversion', label: 'Conversions' },
            { key: 'exchange', label: 'Exchanges' },
            { key: 'merge', label: 'Merges' },
          ].map((chip) => {
            const isSelected = requestType === chip.key;
            return (
              <TouchableOpacity
                key={chip.key}
                style={[styles.typeChip, isSelected && styles.typeChipActive]}
                onPress={() => setRequestType(chip.key)}
              >
                <Text style={[styles.typeChipText, isSelected && styles.typeChipTextActive]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Main List */}
      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : (
        <FlatList
          data={displayedItems}
          keyExtractor={(item, index) => item._id || item.id || `item-${index}`}
          renderItem={renderCardItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchApprovals(); }} colors={['#2563eb']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Clock size={40} color="#94a3b8" />
              <Text style={styles.emptyText}>No pending requests found matching criteria.</Text>
            </View>
          }
        />
      )}

      {/* Action Approval / Rejection Modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{modalTitle}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>
              {modalActionType === 'reject' ? 'REJECTION REASON *' : 'APPROVAL REMARKS / INSTRUCTIONS'}
            </Text>
            <TextInput
              style={styles.modalTextArea}
              multiline
              numberOfLines={3}
              placeholder={
                modalActionType === 'reject'
                  ? 'Please specify a rejection reason...'
                  : 'Enter approval notes or delivery remarks...'
              }
              placeholderTextColor="#94a3b8"
              value={actionRemarks}
              onChangeText={setActionRemarks}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelModalBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.confirmModalBtn,
                  modalActionType === 'reject' ? { backgroundColor: '#dc2626' } : { backgroundColor: '#16a34a' },
                ]}
                onPress={handleExecuteModalAction}
                disabled={actionSubmitting}
              >
                {actionSubmitting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.confirmModalBtnText}>
                    Confirm {modalActionType === 'reject' ? 'Rejection' : 'Approval'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Material Module Footer */}
      <MaterialModuleFooter navigation={navigation} currentScreen="pending" />
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
  topFilterContainer: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    gap: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 10,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 13,
    color: '#0f172a',
    marginLeft: 6,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 3,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  tabBtnTextActive: {
    color: '#2563eb',
    fontWeight: '700',
  },
  chipsScroll: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  typeChip: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  typeChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  typeChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  typeChipTextActive: {
    color: '#ffffff',
  },
  listContent: {
    padding: 14,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardTypeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1e293b',
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 2,
  },
  cardBody: {
    gap: 2,
  },
  bodyTextMain: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  bodyTextSub: {
    fontSize: 12,
    color: '#64748b',
  },
  remarksText: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#475569',
    marginTop: 2,
  },
  statusLineText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
    marginTop: 2,
    marginBottom: 4,
  },
  actionBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  miniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 6,
  },
  miniBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  emptyBox: {
    padding: 40,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 14,
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
    borderRadius: 14,
    padding: 18,
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
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  modalTextArea: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: '#0f172a',
    textAlignVertical: 'top',
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  cancelModalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  cancelModalBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  confirmModalBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  confirmModalBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
});

export default PendingTransactionsScreen;
