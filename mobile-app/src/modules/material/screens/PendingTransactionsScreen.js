import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowRightLeft,
  Camera,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  FileText,
  GitMerge,
  Package,
  RefreshCw,
  RotateCcw,
  Scissors,
  Search,
  Truck,
  User,
  X,
  XCircle,
  ChevronDown,
  Check
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import materialApi from '../api/materialApi';
import MaterialHeader from '../components/MaterialHeader';
import MaterialModuleFooter from '../components/MaterialModuleFooter';
import StatusBadge from '../components/StatusBadge';

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
  const [usersList, setUsersList] = useState([]);

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

  // Store approval fields matching Screen 2 spec
  const [actionNewBarcode, setActionNewBarcode] = useState('');
  const [actionQuantity, setActionQuantity] = useState('1');
  const [actionUnit, setActionUnit] = useState('Nos');
  const [actionRate, setActionRate] = useState('');
  const [actionGodown, setActionGodown] = useState('Main Store');
  const [actionSelectedHandlerId, setActionSelectedHandlerId] = useState('');
  const [handlerPickerDropdownOpen, setHandlerPickerDropdownOpen] = useState(false);

  // Return Detail Modal State
  const [returnDetailModalVisible, setReturnDetailModalVisible] = useState(false);
  const [selectedReturnItem, setSelectedReturnItem] = useState(null);

  useEffect(() => {
    const init = async () => {
      await loadUser();
      await fetchApprovals();
    };
    init();
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchApprovals();
    }
  }, [currentUser?._id, currentUser?.id]);

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
        usersRes,
      ] = await Promise.all([
        materialApi.getTransactions(),
        materialApi.getAllTransfers().catch(() => ({ data: [] })),
        materialApi.getAllSplits().catch(() => ({ data: [] })),
        materialApi.getAllReturns().catch(() => ({ data: [] })),
        materialApi.getAllCloseRequests().catch(() => ({ data: [] })),
        materialApi.getAllExchanges().catch(() => ({ data: [] })),
        materialApi.getAllMerges().catch(() => ({ data: [] })),
        materialApi.getUsers().catch(() => []),
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
      let uArr = (usersRes && usersRes.data) || usersRes || [];
      if (!Array.isArray(uArr)) uArr = [];
      setUsersList(uArr);

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

  const getReturnUserDisplay = (userProp) => {
    if (!userProp) return currentUser ? (currentUser.fullName || currentUser.name || 'Staff Employee') : 'Staff Employee';
    if (typeof userProp === 'object') {
      const name = userProp.fullName || userProp.name;
      if (name && !/^[0-9a-fA-F]{24}$/.test(String(name))) {
        return name;
      }
    }
    const strId = String(userProp._id || userProp.id || userProp).trim();
    const foundUser = (usersList || []).find((u) => {
      const uId = String(u._id || u.id || '');
      const empId = String(u.employeeId || '');
      return (uId && uId === strId) || (empId && empId === strId);
    });
    if (foundUser && (foundUser.fullName || foundUser.name)) {
      return foundUser.fullName || foundUser.name;
    }
    if (currentUser) {
      const cId = String(currentUser._id || currentUser.id || '');
      const cEmpId = String(currentUser.employeeId || '');
      if ((cId && cId === strId) || (cEmpId && cEmpId === strId)) {
        return currentUser.fullName || currentUser.name || 'Staff Employee';
      }
    }
    return strId;
  };

  const getReturnCardStatus = (item) => {
    if (!item) return 'pending';
    if (item.status === 'completed' || item.status === 'closed' || item.status === 'store_received') {
      return 'completed';
    }
    return item.status || 'pending';
  };

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
      (item.materials && item.materials[0]?.name) ||
      ''
    ).toLowerCase().includes(q);
    return idMatch || userMatch || matMatch;
  };

  const isAssignedStoreUser = (user, item) => {
    if (!user) return false;
    const adminType = String(user.adminType || user.departmentAdminType || user.user?.adminType || user.user?.departmentAdminType || '').toLowerCase();
    const userRole = String(user.role || user.user?.role || '').toLowerCase();

    // If user is explicitly management or accounts, they are NOT store approver
    if (adminType === 'management' || adminType === 'accounts' || userRole === 'management') {
      return false;
    }

    const userId = String(user._id || user.id || user.user?._id || user.user?.id || '');

    // If a specific store user/approver is assigned on this item, check direct match
    if (item && userId) {
      const storeField = item.store || item.storeAdmin || item.approvedBy || item.assignedApprover;
      if (storeField) {
        const storeId = String(typeof storeField === 'object' ? (storeField._id || storeField.id || '') : storeField);
        if (storeId && storeId === userId) {
          return true;
        }
      }
    }

    const userName = String(user.name || user.fullName || user.user?.name || user.user?.fullName || '').toLowerCase();
    const userEmail = String(user.email || user.user?.email || '').toLowerCase();
    if (userName.includes('gokul') || userEmail.includes('gokul')) return true;

    // Store admin or store role
    if (['store', 'store_admin', 'tcstr1', 'store_manager'].includes(userRole)) return true;
    if (userRole === 'department_admin' && (adminType === 'store' || adminType === 'warehouse')) return true;

    const roleCode = String(user.roleCode || user.user?.roleCode || '').toUpperCase();
    if (['STORE_ADMIN', 'TCSTR1', 'TCST8A', 'STORE'].includes(roleCode)) return true;

    // Store department
    const dept = user.department || user.user?.department;
    const deptName = String((typeof dept === 'object' ? (dept.name || dept.departmentName) : dept) || '').toLowerCase();
    if (deptName.includes('store') || deptName.includes('warehouse')) return true;

    if (['super_admin', 'company_admin'].includes(userRole)) return true;

    return false;
  };

  const isManagementUser = (user, item) => {
    if (!user) return false;
    const userRole = String(user.role || user.user?.role || '').toLowerCase();
    const adminType = String(user.adminType || user.departmentAdminType || user.user?.adminType || user.user?.departmentAdminType || '').toLowerCase();
    if (userRole === 'management' || adminType === 'management') return true;
    if (['super_admin', 'admin', 'company_admin'].includes(userRole)) return true;
    return false;
  };

  const getFilteredItems = () => {
    const list = [];
    const role = String(currentUser?.role || currentUser?.user?.role || '').toLowerCase();
    const userId = String(currentUser?._id || currentUser?.id || currentUser?.user?._id || currentUser?.user?.id || '');
    const userEmpId = String(currentUser?.employeeId || currentUser?.user?.employeeId || '');
    const isTL = role === 'team_lead';
    const isMgt = isManagementUser(currentUser);

    // 1. Material Requests
    if (['all', 'material'].includes(requestType)) {
      const filteredTxns = txns.filter((t) => {
        const status = t.status;
        const senderId = String(typeof t.requester === 'object' ? (t.requester?._id || t.requester?.id || '') : (t.requester || ''));
        const senderEmpId = String(typeof t.requester === 'object' ? (t.requester?.employeeId || '') : '');
        const handlerId = String(typeof t.handler === 'object' ? (t.handler?._id || t.handler?.id || '') : (t.handler || ''));
        const handlerEmpId = String(typeof t.handler === 'object' ? (t.handler?.employeeId || '') : '');
        const tlId = String(typeof t.teamLead === 'object' ? (t.teamLead?._id || t.teamLead?.id || '') : (t.teamLead || ''));
        const mgtId = String(typeof t.managementApprover === 'object' ? (t.managementApprover?._id || t.managementApprover?.id || '') : (t.managementApprover || ''));

        const isSender = (userId && senderId && userId === senderId) || (userEmpId && senderId && userEmpId === senderId) || (userEmpId && senderEmpId && userEmpId === senderEmpId);
        const isHandler = (userId && handlerId && userId === handlerId) || (userEmpId && handlerId && userEmpId === handlerId) || (userEmpId && handlerEmpId && userEmpId === handlerEmpId);
        const isAssignedTL = userId && tlId && (userId === tlId);
        const isAssignedMgt = userId && mgtId && (userId === mgtId);
        const isAssignedStore = isAssignedStoreUser(currentUser, t);

        if (statusTab === 'pending') {
          // 1. If status is 'submitted', ONLY the Team Lead (assigned TL or TL role) can see it for approval action!
          // Management / Store / Others MUST NOT see it for action until Team Lead has approved!
          if (status === 'submitted') {
            if (isSender) return filterBySearch(t, 'transactionId');
            if (isTL || isAssignedTL) return filterBySearch(t, 'transactionId');
            return false; // Do not show to Management or Store until TL approves
          }

          // 2. If status is 'tl_approved', ONLY Management can see it for management approval
          if (status === 'tl_approved') {
            if (isSender) return filterBySearch(t, 'transactionId');
            if (isMgt || isAssignedMgt) return filterBySearch(t, 'transactionId');
            return false; // Store does not see until Mgt approves
          }

          // 3. If status is 'mgt_approved' or 'store_accepted' or 'ready_for_dispatch':
          // Management has ALREADY approved. ONLY the assigned Store user sees it for dispatch!
          if (['mgt_approved', 'ready_for_dispatch'].includes(status)) {
            if (isSender) return filterBySearch(t, 'transactionId');
            if (isAssignedStore) return filterBySearch(t, 'transactionId');
            return false; // Management and others MUST NOT see it in pending
          }

          // 4. If status is 'dispatched' or 'handler_assigned' or 'in_transit' or 'store_accepted'
          if (['dispatched', 'handler_assigned', 'in_transit', 'store_accepted'].includes(status)) {
            const toHandlerId = String(typeof t.pendingHandlerTransfer?.toHandler === 'object' ? (t.pendingHandlerTransfer?.toHandler?._id || t.pendingHandlerTransfer?.toHandler?.id || '') : (t.pendingHandlerTransfer?.toHandler || ''));
            const toHandlerEmpId = String(typeof t.pendingHandlerTransfer?.toHandler === 'object' ? (t.pendingHandlerTransfer?.toHandler?.employeeId || '') : '');
            const fromHandlerId = String(typeof t.pendingHandlerTransfer?.fromHandler === 'object' ? (t.pendingHandlerTransfer?.fromHandler?._id || t.pendingHandlerTransfer?.fromHandler?.id || '') : (t.pendingHandlerTransfer?.fromHandler || ''));
            const fromHandlerEmpId = String(typeof t.pendingHandlerTransfer?.fromHandler === 'object' ? (t.pendingHandlerTransfer?.fromHandler?.employeeId || '') : '');

            const isPendingToHandler = t.pendingHandlerTransfer?.status === 'pending' && ((userId && toHandlerId && userId === toHandlerId) || (userEmpId && toHandlerId && userEmpId === toHandlerId) || (userEmpId && toHandlerEmpId && userEmpId === toHandlerEmpId));
            const isPendingFromHandler = t.pendingHandlerTransfer?.status === 'pending' && ((userId && fromHandlerId && userId === fromHandlerId) || (userEmpId && fromHandlerId && userEmpId === fromHandlerId) || (userEmpId && fromHandlerEmpId && userEmpId === fromHandlerEmpId));

            if (isPendingToHandler || isPendingFromHandler) return filterBySearch(t, 'transactionId');
            if (isHandler) return filterBySearch(t, 'transactionId');
            if (isSender && ['dispatched', 'in_transit'].includes(status)) return filterBySearch(t, 'transactionId');
            if (isAssignedStore && status === 'store_accepted' && !isHandler) return filterBySearch(t, 'transactionId');
            return false;
          }

          const isPending = ['submitted', 'tl_approved', 'mgt_approved', 'store_accepted', 'handler_assigned', 'dispatched'].includes(status);
          if (!isPending) return false;
        } else {
          // History tab
          const isHistory = ['received', 'completed', 'rejected', 'closed'].includes(status);
          if (!isHistory) return false;
        }

        return filterBySearch(t, 'transactionId');
      });
      list.push(...filteredTxns.map((t) => ({ ...t, _cardType: 'material' })));
    }

    // 2. Barcode Transfers
    if (['all', 'transfer'].includes(requestType)) {
      const filteredTransfers = transfers.filter((tr) => {
        const isPending = ['pending', 'approved'].includes(tr.status);
        if (statusTab === 'pending' ? !isPending : isPending) return false;

        const fromId = String(typeof tr.fromUser === 'object' ? (tr.fromUser?._id || tr.fromUser?.id || '') : (tr.fromUser || ''));
        const toId = String(typeof tr.toUser === 'object' ? (tr.toUser?._id || tr.toUser?.id || '') : (tr.toUser || ''));
        const mgmtId = String(typeof tr.managementApprover === 'object' ? (tr.managementApprover?._id || tr.managementApprover?.id || '') : (tr.managementApprover || ''));
        const isSender = userId && fromId && (userId === fromId);
        const isRecipient = userId && toId && (userId === toId);
        const isMgmtApprover = userId && mgmtId && (userId === mgmtId);

        if (statusTab === 'pending') {
          // If cross-department / requires management approval and currently pending management approval (status === 'pending')
          if (tr.requiresApproval && tr.status === 'pending') {
            // ONLY the designated Management Approver sees it in Pending
            if (isMgmtApprover || role === 'super_admin') {
              return filterBySearch(tr, 'barcode');
            }
            return false;
          }

          // Once approved by management (status === 'approved') or if same-department / direct (status === 'pending'/'approved' where !requiresApproval)
          // ONLY the target recipient employee sees it in Pending to accept or reject!
          if (isRecipient) {
            return filterBySearch(tr, 'barcode');
          }

          // Must NOT show to sender, other employees, store, etc. in pending actions
          return false;
        }

        // History tab: visible to recipient, sender, management approver, or super admin
        if (isSender || isRecipient || isMgmtApprover || role === 'super_admin') {
          return filterBySearch(tr, 'barcode');
        }
        return false;
      });
      list.push(...filteredTransfers.map((tr) => ({ ...tr, _cardType: 'transfer' })));
    }

    // 3. Split Requests
    if (['all', 'split'].includes(requestType)) {
      const filteredSplits = splits.filter((s) => {
        const isPending = s.status === 'pending';
        if (statusTab === 'pending' ? !isPending : isPending) return false;

        const isStoreApprover = isAssignedStoreUser(currentUser, s);

        if (statusTab === 'pending') {
          // Strictly only the assigned store approver can see pending splits
          if (isStoreApprover) {
            return filterBySearch(s, 'barcode');
          }
          return false;
        }

        // History tab
        const reqId = String(typeof (s.requester || s.requestedBy) === 'object' ? ((s.requester || s.requestedBy)?._id || (s.requester || s.requestedBy)?.id || '') : (s.requester || s.requestedBy || s.user?._id || s.user?.id || s.user || ''));
        const isRequester = userId && reqId && (userId === reqId);
        if (isRequester || isStoreApprover) {
          return filterBySearch(s, 'barcode');
        }
        return false;
      });
      list.push(...filteredSplits.map((s) => ({ ...s, _cardType: 'split' })));
    }

    // 4. Returns
    if (['all', 'return'].includes(requestType)) {
      const filteredReturns = returns.filter((r) => {
        const isPending = ['pending', 'initiated', 'handler_assigned', 'collected', 'store_received'].includes(r.status);
        if (statusTab === 'pending' ? !isPending : isPending) return false;

        const reqId = String(typeof (r.fromUser || r.requester) === 'object' ? ((r.fromUser || r.requester)?._id || (r.fromUser || r.requester)?.id || '') : (r.fromUser || r.requester || r.user?._id || r.user?.id || r.user || ''));
        const returnHandlerId = String(typeof r.returnHandler === 'object' ? (r.returnHandler?._id || r.returnHandler?.id || '') : (r.returnHandler || ''));
        const toHandlerId = String(typeof r.pendingHandlerTransfer?.toHandler === 'object' ? (r.pendingHandlerTransfer?.toHandler?._id || r.pendingHandlerTransfer?.toHandler?.id || '') : (r.pendingHandlerTransfer?.toHandler || ''));
        const fromHandlerId = String(typeof r.pendingHandlerTransfer?.fromHandler === 'object' ? (r.pendingHandlerTransfer?.fromHandler?._id || r.pendingHandlerTransfer?.fromHandler?.id || '') : (r.pendingHandlerTransfer?.fromHandler || ''));

        const isRequester = userId && reqId && (userId === reqId);
        const isReturnHandler = userId && returnHandlerId && (userId === returnHandlerId);
        const isPendingReturnToHandler = r.pendingHandlerTransfer?.status === 'pending' && toHandlerId && (userId === toHandlerId);
        const isPendingReturnFromHandler = r.pendingHandlerTransfer?.status === 'pending' && fromHandlerId && (userId === fromHandlerId);
        const isStoreApprover = isAssignedStoreUser(currentUser, r);

        if (statusTab === 'pending') {
          if (isPendingReturnToHandler || isPendingReturnFromHandler) {
            return filterBySearch(r, 'barcode');
          }
          if (isReturnHandler || isRequester || isStoreApprover) {
            return filterBySearch(r, 'barcode');
          }
          return false;
        }

        return filterBySearch(r, 'barcode');
      });
      list.push(...filteredReturns.map((r) => ({ ...r, _cardType: 'return' })));
    }

    // 5. Conversions / Close Requests
    if (['all', 'conversion'].includes(requestType)) {
      const filteredCloses = closeRequests.filter((c) => {
        const isPending = ['pending', 'pending_accounts_approval', 'pending_store_acceptance'].includes(c.status);
        if (statusTab === 'pending' ? !isPending : isPending) return false;

        const reqId = String(typeof (c.requester || c.requestedBy) === 'object' ? ((c.requester || c.requestedBy)?._id || (c.requester || c.requestedBy)?.id || '') : (c.requester || c.requestedBy || c.user?._id || c.user?.id || c.user || ''));
        const isRequester = userId && reqId && (userId === reqId);
        const isStoreApprover = isAssignedStoreUser(currentUser, c);

        if (statusTab === 'pending') {
          if (isRequester || isStoreApprover) {
            return filterBySearch(c, 'barcode');
          }
          return false;
        }

        return filterBySearch(c, 'barcode');
      });
      list.push(...filteredCloses.map((c) => ({ ...c, _cardType: 'conversion' })));
    }

    // 6. Exchange Requests
    if (['all', 'exchange'].includes(requestType)) {
      const filteredExchanges = exchanges.filter((e) => {
        const isPending = e.status === 'pending';
        if (statusTab === 'pending' ? !isPending : isPending) return false;

        const isStoreApprover = isAssignedStoreUser(currentUser, e);

        if (statusTab === 'pending') {
          // Strictly only the assigned store approver can see pending exchanges
          if (isStoreApprover) {
            return filterBySearch(e, 'oldBarcode');
          }
          return false;
        }

        // History tab
        const reqId = String(typeof (e.requester || e.requestedBy) === 'object' ? ((e.requester || e.requestedBy)?._id || (e.requester || e.requestedBy)?.id || '') : (e.requester || e.requestedBy || e.user?._id || e.user?.id || e.user || ''));
        const isRequester = userId && reqId && (userId === reqId);
        if (isRequester || isStoreApprover) {
          return filterBySearch(e, 'oldBarcode');
        }
        return false;
      });
      list.push(...filteredExchanges.map((e) => ({ ...e, _cardType: 'exchange' })));
    }

    // 7. Merge Requests
    if (['all', 'merge'].includes(requestType)) {
      const filteredMerges = merges.filter((m) => {
        const isPending = m.status === 'pending';
        if (statusTab === 'pending' ? !isPending : isPending) return false;

        const isStoreApprover = isAssignedStoreUser(currentUser, m);

        if (statusTab === 'pending') {
          // Strictly only the assigned store approver can see pending merges
          if (isStoreApprover) {
            return filterBySearch(m, 'transactionId');
          }
          return false;
        }

        // History tab
        const reqId = String(typeof (m.requester || m.requestedBy) === 'object' ? ((m.requester || m.requestedBy)?._id || (m.requester || m.requestedBy)?.id || '') : (m.requester || m.requestedBy || m.user?._id || m.user?.id || m.user || ''));
        const isRequester = userId && reqId && (userId === reqId);
        if (isRequester || isStoreApprover) {
          return filterBySearch(m, 'transactionId');
        }
        return false;
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
    setActionNewBarcode(item.newBarcode ? String(item.newBarcode) : '');
    setActionQuantity(item.newQuantity ? String(item.newQuantity) : '1');
    setActionUnit(item.unit || 'Nos');
    setActionRate(item.price || item.rate ? String(item.price || item.rate) : '');
    setActionGodown('Main Store');

    const curUserId = String(currentUser?._id || currentUser?.id || '');
    const reqId = String(item.requester?._id || item.requester?.id || item.requester || item.fromUser?._id || item.fromUser?.id || item.fromUser || '');
    const hId = String(item.handler?._id || item.handler?.id || item.handler || item.returnHandler?._id || item.returnHandler?.id || item.returnHandler || '');

    const eligibleHandlers = (usersList || []).filter((u) => {
      if (!u) return false;
      const uId = String(u._id || u.id || '');
      if (!uId) return false;
      if (uId === curUserId) return false;
      if (hId && uId === hId) return false;
      if (reqId && uId === reqId) return false;
      if (u.role === 'super_admin') return false;
      return true;
    });

    if (eligibleHandlers.length > 0) {
      setActionSelectedHandlerId(eligibleHandlers[0]._id || eligibleHandlers[0].id);
    } else {
      setActionSelectedHandlerId('');
    }
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
        } else if (modalActionType === 'handler-deliver') {
          await materialApi.handlerAction(itemId, { actionType: 'dispatch', remarks: actionRemarks });
          Alert.alert('Success', 'Material dispatched and sent to requester for physical receipt.');
        } else if (modalActionType === 'accept_handler_transfer') {
          await materialApi.handlerAction(itemId, { actionType: 'accept_transfer', remarks: actionRemarks });
          Alert.alert('Accepted', 'You have accepted the handler assignment!');
        } else if (modalActionType === 'reject_handler_transfer') {
          await materialApi.handlerAction(itemId, { actionType: 'reject_transfer', remarks: actionRemarks });
          Alert.alert('Rejected', 'Handler assignment request rejected.');
        } else if (modalActionType === 'handler-transfer') {
          if (!actionSelectedHandlerId) {
            Alert.alert('Validation Error', 'Please select target handler.');
            return;
          }
          await materialApi.assignHandler(itemId, { handlerId: actionSelectedHandlerId, remarks: actionRemarks });
          Alert.alert('Success', 'Handler reassignment request sent to selected employee.');
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
        if (modalActionType === 'approve') {
          if (!actionNewBarcode.trim()) {
            Alert.alert('Validation Error', 'New barcode serial ID is required.');
            return;
          }
          if (!/^\d+$/.test(actionNewBarcode.trim())) {
            Alert.alert('Validation Error', 'New barcode serial must be numeric only.');
            return;
          }
          const res = await materialApi.approveSplit({
            requestId: itemId,
            action: 'approve',
            newBarcode: actionNewBarcode.trim(),
            quantity: Number(actionQuantity) || 1,
            unit: actionUnit || 'Nos',
            price: Number(actionRate) || 0,
            rate: Number(actionRate) || 0,
            godown: actionGodown || 'Main Store',
            storeRemark: actionRemarks.trim(),
          });
          if (res && res.success !== false) {
            Alert.alert('Success', `Split request approved with new serial ${actionNewBarcode}!`);
            setActionModalVisible(false);
            fetchApprovals();
            const targetTxnId = res.transactionId || modalItem?.transactionId || (modalItem?.transaction?._id || modalItem?.transaction?.transactionId || modalItem?.transaction);
            if (targetTxnId) {
              navigation.navigate('MaterialDetailScreen', { id: targetTxnId });
            }
          } else {
            Alert.alert('Split Approval Error', res?.message || 'Split approval failed.');
          }
        } else {
          const res = await materialApi.approveSplit({
            requestId: itemId,
            action: 'reject',
            reason: actionRemarks.trim(),
            storeRemark: actionRemarks.trim(),
          });
          if (res && res.success !== false) {
            Alert.alert('Success', 'Split request rejected.');
            setActionModalVisible(false);
            fetchApprovals();
          } else {
            Alert.alert('Split Rejection Error', res?.message || 'Split rejection failed.');
          }
        }
      } else if (cardType === 'return') {
        if (modalActionType === 'assign-return-handler') {
          if (!actionSelectedHandlerId) {
            Alert.alert('Validation Error', 'Please select return handler.');
            return;
          }
          await materialApi.assignReturnHandler(itemId, {
            handlerId: actionSelectedHandlerId,
            remarks: actionRemarks.trim(),
          });
          Alert.alert('Success', 'Return handler reassignment request sent to selected employee.');
        } else if (modalActionType === 'accept_return_handler_transfer') {
          await materialApi.returnHandlerAction(itemId, {
            actionType: 'accept_transfer',
            remarks: actionRemarks.trim(),
          });
          Alert.alert('Success', 'You have accepted the return handler assignment!');
        } else if (modalActionType === 'reject_return_handler_transfer') {
          await materialApi.returnHandlerAction(itemId, {
            actionType: 'reject_transfer',
            remarks: actionRemarks.trim(),
          });
          Alert.alert('Success', 'Return handler assignment request rejected.');
        } else if (modalActionType === 'return-deliver') {
          await materialApi.returnHandlerAction(itemId, {
            actionType: 'deliver',
            remarks: actionRemarks.trim(),
          });
          Alert.alert('Success', 'Return items delivered and handed over to Store.');
        } else {
          const returnIdsToAccept = modalItem.returnIds || [itemId];
          for (const rId of returnIdsToAccept) {
            await materialApi.acceptReturn(rId, { remarks: actionRemarks });
          }
          Alert.alert('Success', `Return voucher receipt confirmed for ${returnIdsToAccept.length} barcode(s)!`);
        }
      } else if (cardType === 'conversion') {
        await materialApi.respondCloseRequest(itemId, {
          action: modalActionType === 'approve' ? 'approve' : 'reject',
          rejectionReason: actionRemarks,
          storeRemark: actionRemarks,
        });
        Alert.alert('Success', `Conversion request ${modalActionType === 'approve' ? 'approved' : 'rejected'}!`);
      } else if (cardType === 'exchange') {
        if (modalActionType === 'approve') {
          if (!actionNewBarcode.trim()) {
            Alert.alert('Validation Error', 'Replacement barcode serial is required.');
            return;
          }
          if (!/^\d+$/.test(actionNewBarcode.trim())) {
            Alert.alert('Validation Error', 'Replacement barcode serial must be numeric only.');
            return;
          }
          await materialApi.respondExchange(itemId, {
            action: 'accept',
            newBarcode: actionNewBarcode.trim(),
            storeRemark: actionRemarks.trim(),
          });
          Alert.alert('Success', `Exchange request approved with replacement serial ${actionNewBarcode}!`);
        } else {
          await materialApi.respondExchange(itemId, {
            action: 'reject',
            reason: actionRemarks.trim(),
            storeRemark: actionRemarks.trim(),
          });
          Alert.alert('Success', 'Exchange request rejected.');
        }
      } else if (cardType === 'merge') {
        if (modalActionType === 'approve') {
          if (modalItem.parentBarcodeMode === 'new' && !actionNewBarcode.trim()) {
            Alert.alert('Validation Error', 'Master parent barcode serial is required for new mode.');
            return;
          }
          if (modalItem.parentBarcodeMode === 'new' && !/^\d+$/.test(actionNewBarcode.trim())) {
            Alert.alert('Validation Error', 'Master parent barcode serial must be numeric only.');
            return;
          }
          await materialApi.approveMerge({
            requestId: itemId,
            action: 'approve',
            newBarcode: actionNewBarcode.trim() || undefined,
            storeRemark: actionRemarks.trim(),
          });
          Alert.alert('Success', `Merge request approved${actionNewBarcode.trim() ? ` with master barcode ${actionNewBarcode.trim()}` : ''}!`);
        } else {
          await materialApi.approveMerge({
            requestId: itemId,
            action: 'reject',
            reason: actionRemarks.trim(),
            storeRemark: actionRemarks.trim(),
          });
          Alert.alert('Success', 'Merge request rejected.');
        }
      }

      setModalVisible(false);
      fetchApprovals();
    } catch (err) {
      Alert.alert('Action Error', (err.response && err.response.data && err.response.data.message) || err.message);
    } finally {
      setActionSubmitting(false);
    }
  };

  const getCardStatusLine = (item) => {
    const role = (currentUser && currentUser.role) || 'employee';
    const adminType = currentUser && currentUser.adminType;
    const userId = currentUser && (currentUser._id || currentUser.id);
    const isHandler = (item.handler && (item.handler._id || item.handler) === userId);
    const isRequester = (item.requester && (item.requester._id || item.requester) === userId);

    if (isHandler) {
      if (item.status === 'store_accepted') return 'Action Required: Collect from Store';
      if (item.status === 'handler_assigned') return 'Action Required: Deliver Material to Requester';
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
      if (['mgt_approved', 'ready_for_dispatch'].includes(item.status)) return 'Action Required: Store Dispatch';
      if (item.status === 'store_accepted') return 'Action Required: Assign Sourcing Handler';
      return 'Tracking: Dispatched / In Transit';
    }

    if (item._cardType === 'return') {
      const hObj = item.returnHandler;
      const hName = hObj ? (typeof hObj === 'object' ? (hObj.fullName || hObj.name) : 'Handler') : null;
      if (item.status === 'completed' || item.status === 'closed') {
        return 'Tracking: Received & Accepted by Store';
      }
      if (hName) {
        return `Tracking: Return Handler Assigned (${hName})`;
      }
      return 'Tracking: Direct Store Return (Pending Receipt)';
    }

    if (role === 'employee' || isRequester) {
      if (item.status === 'submitted') return 'Tracking: Awaiting Team Lead Approval';
      if (item.status === 'tl_approved') return 'Tracking: Awaiting Management Approval';
      if (item.status === 'mgt_approved') return 'Tracking: Awaiting Store Sourcing';
      if (item.status === 'store_accepted') return 'Tracking: Sourcing Handler Assigned';
      if (item.status === 'dispatched') return 'Action Required: Receive or Reject Materials';
      return `Tracking: ${(item.status || '').replace('_', ' ').toUpperCase()}`;
    }

    return (item.status || '').replace('_', ' ').toUpperCase();
  };

  // Render role-scoped approval action buttons matching web client RBAC
  const renderActionButtons = (item) => {
    const role = String(currentUser?.role || currentUser?.user?.role || 'employee').toLowerCase();
    const userId = String(currentUser?._id || currentUser?.id || currentUser?.user?._id || currentUser?.user?.id || '');
    const userEmpId = String(currentUser?.employeeId || currentUser?.user?.employeeId || '');
    const cardType = item._cardType;

    const handlerId = item.handler ? String(item.handler._id || item.handler.id || item.handler) : '';
    const handlerEmpId = item.handler?.employeeId ? String(item.handler.employeeId) : '';
    const isHandler = (userId && handlerId && userId === handlerId) || (userEmpId && handlerId && userEmpId === handlerId) || (userEmpId && handlerEmpId && userEmpId === handlerEmpId);

    const requesterId = item.requester ? String(item.requester._id || item.requester.id || item.requester) : '';
    const requesterEmpId = item.requester?.employeeId ? String(item.requester.employeeId) : '';
    const isRequester = (userId && requesterId && userId === requesterId) || (userEmpId && requesterId && userEmpId === requesterId) || (userEmpId && requesterEmpId && userEmpId === requesterEmpId);

    const isStore = isAssignedStoreUser(currentUser, item);

    // 1. MATERIAL REQUEST ACTIONS
    if (cardType === 'material') {
      const toHandlerId = item.pendingHandlerTransfer?.toHandler ? String(item.pendingHandlerTransfer.toHandler._id || item.pendingHandlerTransfer.toHandler.id || item.pendingHandlerTransfer.toHandler) : '';
      const toHandlerEmpId = item.pendingHandlerTransfer?.toHandler?.employeeId ? String(item.pendingHandlerTransfer.toHandler.employeeId) : '';
      const isPendingToHandler = item.pendingHandlerTransfer?.status === 'pending' && ((userId && toHandlerId && String(toHandlerId) === String(userId)) || (userEmpId && toHandlerId && String(toHandlerId) === String(userEmpId)) || (userEmpId && toHandlerEmpId && String(toHandlerEmpId) === String(userEmpId)));

      // If pending handler transfer target -> Show Accept / Reject
      if (isPendingToHandler) {
        return (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              style={[styles.miniBtn, { backgroundColor: '#16a34a' }]}
              onPress={() => handleOpenActionModal(item, 'accept_handler_transfer', 'Accept Handler Assignment')}
            >
              <CheckCircle2 size={14} color="#ffffff" />
              <Text style={styles.miniBtnText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.miniBtn, { backgroundColor: '#dc2626' }]}
              onPress={() => handleOpenActionModal(item, 'reject_handler_transfer', 'Reject Handler Assignment')}
            >
              <XCircle size={14} color="#ffffff" />
              <Text style={styles.miniBtnText}>Reject</Text>
            </TouchableOpacity>
          </View>
        );
      }

      // Handler actions: Strictly 2 Options (Send Material to Requester / Change Handler)
      if (isHandler) {
        if (item.pendingHandlerTransfer?.status === 'pending') {
          const toHName = item.pendingHandlerTransfer?.toHandler?.fullName || item.pendingHandlerTransfer?.toHandler?.name || 'Selected Employee';
          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 11, color: '#d97706', fontWeight: 'bold' }}>
                Transfer pending acceptance by {toHName}
              </Text>
            </View>
          );
        }

        if (['store_accepted', 'handler_assigned'].includes(item.status)) {
          return (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity
                style={[styles.miniBtn, { backgroundColor: '#2563eb' }]}
                onPress={() => handleOpenActionModal(item, 'handler-deliver', 'Send Material to Requester')}
              >
                <Package size={14} color="#ffffff" />
                <Text style={styles.miniBtnText}>Send to Requester</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.miniBtn, { backgroundColor: '#d97706' }]}
                onPress={() => handleOpenActionModal(item, 'handler-transfer', 'Change Handler')}
              >
                <ArrowRightLeft size={14} color="#ffffff" />
                <Text style={styles.miniBtnText}>Change Handler</Text>
              </TouchableOpacity>
            </View>
          );
        }
      }

      // Requester actions on dispatched materials - ONLY Receive Materials (NO Reject button)
      if (['dispatched', 'in_transit'].includes(item.status) && (isRequester || role === 'super_admin')) {
        return (
          <TouchableOpacity
            style={[styles.miniBtn, { backgroundColor: '#16a34a' }]}
            onPress={() => navigation.navigate('ReceivingFormScreen', { id: item._id || item.transactionId })}
          >
            <CheckCircle2 size={14} color="#ffffff" />
            <Text style={styles.miniBtnText}>Receive Materials</Text>
          </TouchableOpacity>
        );
      }

      // Store Dispatch
      if (['mgt_approved', 'ready_for_dispatch', 'store_accepted'].includes(item.status) && isStore) {
        return (
          <TouchableOpacity
            style={[styles.miniBtn, { backgroundColor: '#16a34a' }]}
            onPress={() => navigation.navigate('StoreDispatchScreen', { id: item._id || item.transactionId })}
          >
            <CheckCircle2 size={14} color="#ffffff" />
            <Text style={styles.miniBtnText}>Dispatch / Assign Barcodes</Text>
          </TouchableOpacity>
        );
      }

      // Team Lead -> ONLY can approve/reject when status === 'submitted'
      const isAssignedTL = item.teamLead && String(item.teamLead._id || item.teamLead) === String(userId);
      if ((role === 'team_lead' || isAssignedTL) && item.status === 'submitted' && !isRequester) {
        return (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              style={[styles.miniBtn, { backgroundColor: '#16a34a' }]}
              onPress={() => handleOpenActionModal(item, 'approve', 'Approve & Forward')}
            >
              <CheckCircle2 size={14} color="#ffffff" />
              <Text style={styles.miniBtnText}>Approve</Text>
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

      // If still in 'submitted' status and current user is not Team Lead, NEVER show approve/reject buttons
      if (item.status === 'submitted') {
        return null;
      }

      // Management -> ONLY can approve/reject when status === 'tl_approved' (AFTER Team Lead approval)
      if (isManagementUser(currentUser, item) && item.status === 'tl_approved' && !isRequester) {
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
    }

    // 2. BARCODE TRANSFERS
    if (cardType === 'transfer') {
      const toUserId = item.toUser ? (item.toUser._id || item.toUser) : null;
      const mgmtId = item.managementApprover ? (item.managementApprover._id || item.managementApprover) : null;
      const isRecipient = userId && toUserId && String(toUserId) === String(userId);
      const isMgmtApprover = userId && mgmtId && String(mgmtId) === String(userId);
      const isSuperAdmin = ['super_admin', 'admin', 'company_admin'].includes(role);

      if (item.status === 'pending' && (isMgmtApprover || isSuperAdmin)) {
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

      if ((item.status === 'approved' || (item.status === 'pending' && !item.requiresApproval)) && (isRecipient || isSuperAdmin)) {
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
    }

    // 3. SPLIT REQUESTS
    if (cardType === 'split') {
      if (item.status === 'pending' && isStore) {
        return (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              style={[styles.miniBtn, { backgroundColor: '#16a34a' }]}
              onPress={() => handleOpenActionModal(item, 'approve', 'Approve Split & Issue Serial')}
            >
              <Scissors size={14} color="#ffffff" />
              <Text style={styles.miniBtnText}>Approve Split</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.miniBtn, { backgroundColor: '#dc2626' }]}
              onPress={() => handleOpenActionModal(item, 'reject', 'Reject Split Request')}
            >
              <XCircle size={14} color="#ffffff" />
              <Text style={styles.miniBtnText}>Reject</Text>
            </TouchableOpacity>
          </View>
        );
      }
    }

    // 4. RETURN REQUESTS
    if (cardType === 'return') {
      const returnHandlerId = item.returnHandler ? String(item.returnHandler._id || item.returnHandler.id || item.returnHandler) : '';
      const isReturnHandler = userId && returnHandlerId && String(userId) === returnHandlerId;

      const toReturnHandlerId = item.pendingHandlerTransfer?.toHandler ? String(item.pendingHandlerTransfer.toHandler._id || item.pendingHandlerTransfer.toHandler.id || item.pendingHandlerTransfer.toHandler) : '';
      const isPendingReturnToHandler = item.pendingHandlerTransfer?.status === 'pending' && toReturnHandlerId && String(toReturnHandlerId) === String(userId);

      // Target of pending transfer -> Accept / Reject
      if (isPendingReturnToHandler) {
        return (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              style={[styles.miniBtn, { backgroundColor: '#16a34a' }]}
              onPress={() => handleOpenActionModal(item, 'accept_return_handler_transfer', 'Accept Return Handler Assignment')}
            >
              <CheckCircle2 size={14} color="#ffffff" />
              <Text style={styles.miniBtnText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.miniBtn, { backgroundColor: '#dc2626' }]}
              onPress={() => handleOpenActionModal(item, 'reject_return_handler_transfer', 'Reject Return Handler Assignment')}
            >
              <XCircle size={14} color="#ffffff" />
              <Text style={styles.miniBtnText}>Reject</Text>
            </TouchableOpacity>
          </View>
        );
      }

      // Active Return Handler: Strictly 2 Options (Send to Store / Change Handler)
      if (isReturnHandler) {
        if (item.pendingHandlerTransfer?.status === 'pending') {
          const toHName = item.pendingHandlerTransfer?.toHandler?.fullName || item.pendingHandlerTransfer?.toHandler?.name || 'Selected Employee';
          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 11, color: '#d97706', fontWeight: 'bold' }}>
                Transfer pending acceptance by {toHName}
              </Text>
            </View>
          );
        }

        if (['handler_assigned', 'collected'].includes(item.status)) {
          return (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity
                style={[styles.miniBtn, { backgroundColor: '#2563eb' }]}
                onPress={() => handleOpenActionModal(item, 'return-deliver', 'Send Material to Store')}
              >
                <Package size={14} color="#ffffff" />
                <Text style={styles.miniBtnText}>Send to Store</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.miniBtn, { backgroundColor: '#d97706' }]}
                onPress={() => handleOpenActionModal(item, 'assign-return-handler', 'Change Handler')}
              >
                <ArrowRightLeft size={14} color="#ffffff" />
                <Text style={styles.miniBtnText}>Change Handler</Text>
              </TouchableOpacity>
            </View>
          );
        }
      }

      if (['pending', 'handler_assigned', 'initiated', 'collected', 'store_received'].includes(item.status) && isStore) {
        const targetReturnId = item.returnIds ? item.returnIds[0] : item._id;
        return (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              style={[styles.miniBtn, { backgroundColor: '#16a34a' }]}
              onPress={() => navigation.navigate('ReceivingFormScreen', {
                id: item.transactionId || targetReturnId,
                returnId: targetReturnId,
                returnIds: item.returnIds,
                barcode: item.barcode,
                barcodes: item.barcodes || (item.barcode ? [item.barcode] : []),
                mode: 'store-return',
              })}
            >
              <CheckCircle2 size={14} color="#ffffff" />
              <Text style={styles.miniBtnText}>Store Accept</Text>
            </TouchableOpacity>

            {!item.returnHandler && (
              <TouchableOpacity
                style={[styles.miniBtn, { backgroundColor: '#2563eb' }]}
                onPress={() => handleOpenActionModal(item, 'assign-return-handler', 'Assign Return Handler')}
              >
                <User size={14} color="#ffffff" />
                <Text style={styles.miniBtnText}>Assign Handler</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      }
    }

    // 5. EXCHANGE REQUESTS
    if (cardType === 'exchange') {
      if (item.status === 'pending' && isStore) {
        return (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              style={[styles.miniBtn, { backgroundColor: '#16a34a' }]}
              onPress={() => handleOpenActionModal(item, 'approve', 'Approve Exchange & Issue Serial')}
            >
              <RefreshCw size={14} color="#ffffff" />
              <Text style={styles.miniBtnText}>Approve Exchange</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.miniBtn, { backgroundColor: '#dc2626' }]}
              onPress={() => handleOpenActionModal(item, 'reject', 'Reject Exchange Request')}
            >
              <XCircle size={14} color="#ffffff" />
              <Text style={styles.miniBtnText}>Reject</Text>
            </TouchableOpacity>
          </View>
        );
      }
    }

    // 6. MERGE REQUESTS
    if (cardType === 'merge') {
      if (item.status === 'pending' && isStore) {
        return (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              style={[styles.miniBtn, { backgroundColor: '#16a34a' }]}
              onPress={() => handleOpenActionModal(item, 'approve', 'Approve Merge Request')}
            >
              <GitMerge size={14} color="#ffffff" />
              <Text style={styles.miniBtnText}>Approve Merge</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.miniBtn, { backgroundColor: '#dc2626' }]}
              onPress={() => handleOpenActionModal(item, 'reject', 'Reject Merge Request')}
            >
              <XCircle size={14} color="#ffffff" />
              <Text style={styles.miniBtnText}>Reject</Text>
            </TouchableOpacity>
          </View>
        );
      }
    }

    // 7. CONVERSION REQUESTS
    if (cardType === 'conversion') {
      if (['pending', 'pending_accounts_approval', 'pending_store_acceptance'].includes(item.status)) {
        return (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              style={[styles.miniBtn, { backgroundColor: '#16a34a' }]}
              onPress={() => handleOpenActionModal(item, 'approve', 'Approve Conversion')}
            >
              <CheckCircle2 size={14} color="#ffffff" />
              <Text style={styles.miniBtnText}>Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.miniBtn, { backgroundColor: '#dc2626' }]}
              onPress={() => handleOpenActionModal(item, 'reject', 'Reject Conversion')}
            >
              <XCircle size={14} color="#ffffff" />
              <Text style={styles.miniBtnText}>Reject</Text>
            </TouchableOpacity>
          </View>
        );
      }
    }

    return null;
  };

  const handleCardPress = (item) => {
    setSelectedReturnItem(item);
    setReturnDetailModalVisible(true);
  };

  const handleNavigateToDetails = (item) => {
    const targetId = item.transactionId || item._id || item.id;
    navigation.navigate('MaterialDetailScreen', {
      id: targetId,
      initialTxn: item,
    });
  };

  const renderCardItem = ({ item }) => {
    const cardType = item._cardType;
    const assignedHandlerObj = item.handler || item.returnHandler;
    const assignedHandlerName = assignedHandlerObj ? (typeof assignedHandlerObj === 'object' ? (assignedHandlerObj.fullName || assignedHandlerObj.name) : null) : null;

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.88}
        onPress={() => handleCardPress(item)}
      >
        <View style={styles.cardHeaderRow}>
          <View style={styles.typeBadgeRow}>
            {cardType === 'material' && <Package size={16} color="#2563eb" />}
            {cardType === 'transfer' && <ArrowRightLeft size={16} color="#4f46e5" />}
            {cardType === 'split' && <Scissors size={16} color="#7c3aed" />}
            {cardType === 'return' && <RotateCcw size={16} color="#dc2626" />}
            {cardType === 'conversion' && <FileSpreadsheet size={16} color="#059669" />}
            {cardType === 'exchange' && <RefreshCw size={16} color="#d97706" />}
            {cardType === 'merge' && <GitMerge size={16} color="#0284c7" />}

            <Text style={styles.cardTypeTitle}>
              {cardType === 'material' ? `Material Request #${item.transactionId || item._id}` :
                cardType === 'transfer' ? `Transfer #${item.barcode || item._id}` :
                cardType === 'split' ? `Split Request #${item.barcode}` :
                cardType === 'return' ? `Return Voucher #${item.barcode || item._id}` :
                cardType === 'conversion' ? `Conversion #${item.barcode}` :
                cardType === 'exchange' ? `Exchange #${item.oldBarcode}` :
                `Merge #${item.transactionId || item.selectedParentBarcode || 'LOT'}`}
            </Text>
          </View>

          <StatusBadge status={item.status} />
        </View>

        <View style={styles.divider} />

        <View style={styles.cardBody}>
          <Text style={styles.bodyTextMain}>
            {item.materialName || (item.materials && item.materials[0]?.name) || item.requestedMaterialName || 'Material Items'}
          </Text>

          <Text style={styles.bodyTextSub}>
            Initiated By: {getReturnUserDisplay(item.requester || item.fromUser)}
          </Text>

          {assignedHandlerName ? (
            <Text style={[styles.bodyTextSub, { color: '#2563eb' }]}>
              Logistics Handler: {assignedHandlerName}
            </Text>
          ) : null}

          {item.reason || item.remarks || item.warrantyReason ? (
            <Text style={styles.remarksText} numberOfLines={2}>
              "{item.reason || item.remarks || item.warrantyReason}"
            </Text>
          ) : null}

          <Text style={styles.statusLineText}>
            {getCardStatusLine(item)}
          </Text>
        </View>

        <View style={styles.actionBtnRow}>
          {renderActionButtons(item)}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title="Pending Approvals & Actions"
        subtitle="Operational workflow queue & dispatch hub"
        navigation={navigation}
      />

      {/* Search & Filter Header */}
      <View style={styles.topFilterContainer}>
        <View style={styles.searchRow}>
          <Search size={16} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by ID, barcode, material, or staff..."
            placeholderTextColor="#94a3b8"
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <X size={16} color="#94a3b8" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Pending vs History Tabs */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, statusTab === 'pending' && styles.tabBtnActive]}
            onPress={() => setStatusTab('pending')}
          >
            <Text style={[styles.tabBtnText, statusTab === 'pending' && styles.tabBtnTextActive]}>
              Pending Actions
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, statusTab === 'history' && styles.tabBtnActive]}
            onPress={() => setStatusTab('history')}
          >
            <Text style={[styles.tabBtnText, statusTab === 'history' && styles.tabBtnTextActive]}>
              Completed / History
            </Text>
          </TouchableOpacity>
        </View>

        {/* Category Pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
          {[
            { id: 'all', label: 'All Requests' },
            { id: 'material', label: 'Material Requests' },
            { id: 'transfer', label: 'Transfers' },
            { id: 'split', label: 'Split Lots' },
            { id: 'return', label: 'Returns' },
            { id: 'exchange', label: 'Exchanges' },
            { id: 'merge', label: 'Merges' },
            { id: 'conversion', label: 'DC / Closures' },
          ].map((type) => (
            <TouchableOpacity
              key={type.id}
              style={[styles.typeChip, requestType === type.id && styles.typeChipActive]}
              onPress={() => setRequestType(type.id)}
            >
              <Text style={[styles.typeChipText, requestType === type.id && styles.typeChipTextActive]}>
                {type.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Main List */}
      {loading ? (
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
              <Text style={styles.emptyText}>No requests found matching criteria.</Text>
            </View>
          }
        />
      )}

      {/* Action Approval / Rejection Modal */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{modalTitle}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Split Approval Inputs */}
            {modalItem?._cardType === 'split' && modalActionType === 'approve' && (
              <View style={{ gap: 8 }}>
                <Text style={styles.fieldLabel}>NEW SERIAL BARCODE ID *</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. 100452 (numeric only)"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  value={actionNewBarcode}
                  onChangeText={setActionNewBarcode}
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>QTY</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="1"
                      placeholderTextColor="#94a3b8"
                      keyboardType="numeric"
                      value={actionQuantity}
                      onChangeText={setActionQuantity}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>UNIT</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="Nos"
                      placeholderTextColor="#94a3b8"
                      value={actionUnit}
                      onChangeText={setActionUnit}
                    />
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>RATE (₹)</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="0"
                      placeholderTextColor="#94a3b8"
                      keyboardType="numeric"
                      value={actionRate}
                      onChangeText={setActionRate}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>GODOWN</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="Main Store"
                      placeholderTextColor="#94a3b8"
                      value={actionGodown}
                      onChangeText={setActionGodown}
                    />
                  </View>
                </View>
              </View>
            )}

            {/* Exchange Approval Inputs */}
            {modalItem?._cardType === 'exchange' && modalActionType === 'approve' && (
              <View style={{ gap: 6 }}>
                <Text style={styles.fieldLabel}>REPLACEMENT BARCODE SERIAL ID *</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. 100453 (numeric only)"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  value={actionNewBarcode}
                  onChangeText={setActionNewBarcode}
                />
              </View>
            )}

            {/* Merge Approval (New Mode) Inputs */}
            {modalItem?._cardType === 'merge' && modalActionType === 'approve' && modalItem?.parentBarcodeMode === 'new' && (
              <View style={{ gap: 6 }}>
                <Text style={styles.fieldLabel}>FINAL MASTER BARCODE SERIAL ID *</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. 100454 (numeric only)"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  value={actionNewBarcode}
                  onChangeText={setActionNewBarcode}
                />
              </View>
            )}

            {/* Handler Assignment Inputs (Transfer Job & Assign Return Handler) */}
            {['assign-return-handler', 'handler-transfer'].includes(modalActionType) && (
              <View style={{ gap: 6 }}>
                <Text style={styles.fieldLabel}>SELECT TARGET HANDLER *</Text>
                <TouchableOpacity
                  style={styles.modalPickerBtn}
                  onPress={() => setHandlerPickerDropdownOpen(!handlerPickerDropdownOpen)}
                >
                  <Text style={{ fontSize: 13, color: '#0f172a', fontWeight: '600' }} numberOfLines={1}>
                    {actionSelectedHandlerId
                      ? (() => {
                        const h = (usersList || []).find((u) => (u._id || u.id) === actionSelectedHandlerId);
                        return h ? (h.fullName || h.name) : 'Selected Handler';
                      })()
                      : 'Select Handler...'}
                  </Text>
                  <ChevronDown size={18} color="#64748b" />
                </TouchableOpacity>

                {handlerPickerDropdownOpen && (
                  <ScrollView style={styles.dropdownListContainer} nestedScrollEnabled>
                    {(() => {
                      const curUserId = String(currentUser?._id || currentUser?.id || '');
                      const reqId = String(modalItem?.requester?._id || modalItem?.requester?.id || modalItem?.requester || modalItem?.fromUser?._id || modalItem?.fromUser?.id || modalItem?.fromUser || '');
                      const hId = String(modalItem?.handler?._id || modalItem?.handler?.id || modalItem?.handler || modalItem?.returnHandler?._id || modalItem?.returnHandler?.id || modalItem?.returnHandler || '');

                      const eligibleHandlers = (usersList || []).filter((u) => {
                        if (!u) return false;
                        const uId = String(u._id || u.id || '');
                        if (!uId) return false;
                        if (uId === curUserId) return false;
                        if (hId && uId === hId) return false;
                        if (reqId && uId === reqId) return false;
                        if (u.role === 'super_admin') return false;
                        return true;
                      });

                      if (eligibleHandlers.length === 0) {
                        return (
                          <View style={{ padding: 12 }}>
                            <Text style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>No other handlers available</Text>
                          </View>
                        );
                      }

                      return eligibleHandlers.map((h) => {
                        const hid = h._id || h.id;
                        const isSelected = actionSelectedHandlerId === hid;
                        return (
                          <TouchableOpacity
                            key={hid}
                            style={[styles.dropdownItem, isSelected && styles.dropdownItemActive]}
                            onPress={() => {
                              setActionSelectedHandlerId(hid);
                              setHandlerPickerDropdownOpen(false);
                            }}
                          >
                            <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextActive]}>
                              {h.fullName || h.name}
                            </Text>
                            {isSelected && <Check size={14} color="#2563eb" />}
                          </TouchableOpacity>
                        );
                      });
                    })()}
                  </ScrollView>
                )}
              </View>
            )}

            <Text style={styles.fieldLabel}>
              {modalActionType.includes('reject') ? 'REJECTION REASON *' : 'REMARKS / INSTRUCTIONS'}
            </Text>
            <TextInput
              style={styles.modalTextArea}
              multiline
              numberOfLines={3}
              placeholder={
                modalActionType.includes('reject')
                  ? 'Please specify a rejection reason...'
                  : 'Enter approval notes or delivery instructions...'
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
                  modalActionType.includes('reject') ? { backgroundColor: '#dc2626' } : { backgroundColor: '#16a34a' },
                ]}
                onPress={handleExecuteModalAction}
                disabled={actionSubmitting}
              >
                {actionSubmitting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.confirmModalBtnText}>
                    Confirm {modalActionType.includes('reject') ? 'Rejection' : 'Action'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Return Request Details Modal */}
      <Modal
        visible={returnDetailModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setReturnDetailModalVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
          <View style={styles.modalHeaderStyle}>
            <TouchableOpacity onPress={() => setReturnDetailModalVisible(false)}>
              <X size={22} color="#0f172a" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.modalTitle}>Request Details</Text>
              <Text style={styles.modalSubtitle}>
                {selectedReturnItem?.barcode || selectedReturnItem?.transactionId || 'Movement Voucher'}
              </Text>
            </View>
            {selectedReturnItem && <StatusBadge status={getReturnCardStatus(selectedReturnItem)} />}
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            <View style={styles.modalSectionCard}>
              <Text style={styles.modalSectionTitle}>General Request Info</Text>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Item / Voucher ID:</Text>
                <Text style={styles.detailValueBold}>{selectedReturnItem?.barcode || selectedReturnItem?.transactionId || 'N/A'}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Initiated By:</Text>
                <Text style={styles.detailValue}>
                  {getReturnUserDisplay(selectedReturnItem?.requester || selectedReturnItem?.fromUser)}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Reason / Remarks:</Text>
                <Text style={styles.detailValue}>{selectedReturnItem?.reason || selectedReturnItem?.remarks || selectedReturnItem?.warrantyReason || 'Standard Movement'}</Text>
              </View>

              {selectedReturnItem?.condition && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Physical Condition:</Text>
                  <Text style={styles.detailValueBold}>{(selectedReturnItem.condition).toUpperCase()}</Text>
                </View>
              )}

              {selectedReturnItem?.returnHandler && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Transporter Handler:</Text>
                  <Text style={styles.detailValue}>
                    {typeof selectedReturnItem.returnHandler === 'object'
                      ? (selectedReturnItem.returnHandler.fullName || selectedReturnItem.returnHandler.name)
                      : 'Assigned Handler'}
                  </Text>
                </View>
              )}
            </View>

            {/* Photo Evidence Section */}
            {selectedReturnItem?.photos && selectedReturnItem.photos.length > 0 && (
              <View style={styles.modalSectionCard}>
                <Text style={styles.modalSectionTitle}>Captured Photo Evidence ({selectedReturnItem.photos.length})</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginTop: 8 }}>
                  {selectedReturnItem.photos.map((photo, pIdx) => (
                    <Image
                      key={pIdx}
                      source={{ uri: typeof photo === 'string' ? photo : photo.url }}
                      style={{ width: 110, height: 110, borderRadius: 10, marginRight: 10, borderWidth: 1, borderColor: '#cbd5e1' }}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Modal Navigation Actions */}
            <View style={{ gap: 10, marginTop: 10 }}>
              {selectedReturnItem?._cardType === 'return' && (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#16a34a', borderRadius: 12, paddingVertical: 14 }}
                  onPress={() => {
                    const targetReturnId = selectedReturnItem?.returnIds ? selectedReturnItem.returnIds[0] : selectedReturnItem?._id;
                    setReturnDetailModalVisible(false);
                    navigation.navigate('ReceivingFormScreen', {
                      id: selectedReturnItem?.transactionId || targetReturnId,
                      returnId: targetReturnId,
                      returnIds: selectedReturnItem?.returnIds,
                      barcode: selectedReturnItem?.barcode,
                      barcodes: selectedReturnItem?.barcodes || (selectedReturnItem?.barcode ? [selectedReturnItem.barcode] : []),
                      mode: 'store-return',
                    });
                  }}
                >
                  <Camera size={18} color="#ffffff" />
                  <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#ffffff' }}>Accept & Return Material (Receiving Form)</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 12 }}
                onPress={() => {
                  setReturnDetailModalVisible(false);
                  if (selectedReturnItem) {
                    handleNavigateToDetails(selectedReturnItem);
                  }
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#ffffff' }}>Open Full Material Detail Screen ➔</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
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
    flexWrap: 'wrap',
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
    gap: 10,
    maxHeight: '90%',
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
  modalSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  modalInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 42,
    fontSize: 13,
    color: '#0f172a',
  },
  modalPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 42,
  },
  dropdownListContainer: {
    maxHeight: 140,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  dropdownItemActive: {
    backgroundColor: '#eff6ff',
  },
  dropdownItemText: {
    fontSize: 13,
    color: '#334155',
  },
  dropdownItemTextActive: {
    color: '#2563eb',
    fontWeight: '700',
  },
  modalTextArea: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: '#0f172a',
    minHeight: 60,
    textAlignVertical: 'top',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  cancelModalBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  cancelModalBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  confirmModalBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 8,
    backgroundColor: '#16a34a',
    alignItems: 'center',
  },
  confirmModalBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  modalHeaderStyle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
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
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 12,
    color: '#1e293b',
    fontWeight: '600',
  },
  detailValueBold: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '800',
  },
});

export default PendingTransactionsScreen;
