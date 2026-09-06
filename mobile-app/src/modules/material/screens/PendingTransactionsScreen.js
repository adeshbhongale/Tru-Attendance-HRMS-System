import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AlertTriangle,
  ArrowRightLeft,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Edit3,
  FileSpreadsheet,
  FileText,
  GitMerge,
  Package,
  QrCode,
  RefreshCw,
  RotateCcw,
  Scissors,
  Search,
  Trash2,
  Truck,
  User,
  X,
  XCircle
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
import BarcodeScannerModal from '../components/BarcodeScannerModal';
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

  // 2-Phase Split Approval State
  const [splitPhase, setSplitPhase] = useState(1); // 1 = Phase 1 (Accept & Tally Stock Journal), 2 = Phase 2 (Scan Barcode & Remark)
  const [splitTallyVoucherNumber, setSplitTallyVoucherNumber] = useState('');
  const [childScannedBarcodes, setChildScannedBarcodes] = useState({});
  const [activeScanningChildIndex, setActiveScanningChildIndex] = useState(null);

  // Helper to parse each individual child material lot for split approvals
  const getSplitChildItems = (item) => {
    if (!item) return [];

    let list = [];
    if (Array.isArray(item.childItems) && item.childItems.length > 0) {
      list = item.childItems.map((c, i) => ({
        materialName: typeof c === 'string' ? c : (c.materialName || c.name || `Child Material #${i + 1}`),
        quantity: typeof c === 'object' && c.quantity ? Number(c.quantity) : 1,
        unit: (typeof c === 'object' && c.unit) || item.unit || 'Nos',
        price: typeof c === 'object' && c.price !== undefined ? Number(c.price) : (item.price || 0),
        barcode: (typeof c === 'object' && c.barcode) || '',
      }));
    } else if (item.requestedMaterialName) {
      const parts = item.requestedMaterialName.split(/[+,]/).map((s) => s.trim()).filter(Boolean);
      if (parts.length > 1) {
        list = parts.map((p, i) => ({
          materialName: p,
          quantity: 1,
          unit: item.unit || 'Nos',
          price: item.price || 0,
          barcode: '',
        }));
      }
    }

    if (list.length === 0) {
      const qty = Math.max(1, Number(item.newQuantity) || 1);
      if (qty > 1 && (!item.unit || ['nos', 'pcs', 'unit', 'units', 'box', 'boxes'].includes(String(item.unit).toLowerCase()))) {
        list = Array.from({ length: qty }, (_, i) => ({
          materialName: `${item.requestedMaterialName || item.materialName || 'Child Material Lot'} (Unit ${i + 1})`,
          quantity: 1,
          unit: item.unit || 'Nos',
          price: (item.price || 0) / qty,
          barcode: i === 0 ? (item.newBarcode || '') : '',
        }));
      } else {
        list = [
          {
            materialName: item.requestedMaterialName || item.materialName || 'Child Material Lot #1',
            quantity: item.newQuantity || 1,
            unit: item.unit || 'Nos',
            price: item.price || 0,
            barcode: item.newBarcode || '',
          },
        ];
      }
    }

    // CRITICAL: If ANY item in list has "+" in its materialName, expand it into separate child items!
    const expanded = [];
    list.forEach((entry) => {
      if (entry.materialName && entry.materialName.includes('+')) {
        const parts = entry.materialName.split('+').map((s) => s.trim()).filter(Boolean);
        parts.forEach((p) => {
          expanded.push({
            ...entry,
            materialName: p,
            quantity: 1,
            barcode: '',
          });
        });
      } else {
        expanded.push(entry);
      }
    });

    return expanded;
  };

  // Return Detail Modal State
  const [returnDetailModalVisible, setReturnDetailModalVisible] = useState(false);
  const [selectedReturnItem, setSelectedReturnItem] = useState(null);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState(null);
  const [scannerVisible, setScannerVisible] = useState(false);

  useEffect(() => {
    const init = async () => {
      await loadUser();
      await fetchApprovals();
    };
    init();

    const unsubscribe = navigation?.addListener ? navigation.addListener('focus', () => {
      loadUser();
      fetchApprovals();
    }) : null;

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [navigation]);

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
        materialApi.getTransactions().catch(() => ({ data: [] })),
        materialApi.getAllTransfers().catch(() => ({ data: [] })),
        materialApi.getAllSplits().catch(() => ({ data: [] })),
        materialApi.getAllReturns().catch(() => ({ data: [] })),
        materialApi.getPendingCloseRequests().catch(() => ({ data: [] })),
        materialApi.getAllExchanges().catch(() => ({ data: [] })),
        materialApi.getAllMerges().catch(() => ({ data: [] })),
        materialApi.getUsers().catch(() => []),
      ]);

      const extractArray = (res) => {
        if (!res) return [];
        if (Array.isArray(res)) return res;
        if (Array.isArray(res.data)) return res.data;
        if (Array.isArray(res.requests)) return res.requests;
        if (res.data && Array.isArray(res.data.data)) return res.data.data;
        if (res.data && Array.isArray(res.data.requests)) return res.data.requests;
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

  const getResolvedEmployee = (item) => {
    if (!item) return { name: 'Staff Employee', employeeId: '', department: '', role: '' };

    let emp = item.requester || item.fromUser || item.user || null;
    let empIdStr = '';
    if (emp && typeof emp === 'object') {
      empIdStr = String(emp._id || emp.id || emp.employeeId || '').trim();
    } else if (typeof emp === 'string') {
      empIdStr = emp.trim();
    }

    let fullUser = null;
    if (empIdStr && Array.isArray(usersList) && usersList.length > 0) {
      fullUser = usersList.find((u) => {
        const uId = String(u._id || u.id || '');
        const uEmpId = String(u.employeeId || '');
        return (uId && uId === empIdStr) || (uEmpId && uEmpId === empIdStr);
      });
    }

    if (!fullUser && currentUser) {
      const cId = String(currentUser._id || currentUser.id || '');
      const cEmpId = String(currentUser.employeeId || '');
      if ((cId && cId === empIdStr) || (cEmpId && cEmpId === empIdStr)) {
        fullUser = currentUser;
      }
    }

    // 1. Department resolution
    let deptName = '';
    const userDept = (fullUser && fullUser.department) || (emp && typeof emp === 'object' && emp.department);
    if (userDept) {
      if (typeof userDept === 'object') {
        deptName = userDept.name || userDept.departmentName || '';
      } else if (typeof userDept === 'string') {
        deptName = userDept;
      }
    }
    if (!deptName) {
      const itemDept = item.fromDepartment || item.department;
      if (itemDept) {
        if (typeof itemDept === 'object') {
          deptName = itemDept.name || itemDept.departmentName || '';
        } else if (typeof itemDept === 'string') {
          deptName = itemDept;
        }
      }
    }

    // 2. Role / Designation resolution
    let roleName = (fullUser && (fullUser.designation || fullUser.role)) ||
      (emp && typeof emp === 'object' && (emp.designation || emp.role)) ||
      '';
    if (roleName) {
      roleName = String(roleName).replace(/_/g, ' ').toUpperCase();
    }

    // 3. Employee ID
    let employeeId = (fullUser && fullUser.employeeId) ||
      (emp && typeof emp === 'object' && (emp.employeeId || emp.employeeIdCode)) ||
      '';

    // 4. Name
    let name = (fullUser && (fullUser.fullName || fullUser.name)) ||
      (emp && typeof emp === 'object' && (emp.fullName || emp.name)) ||
      getReturnUserDisplay(emp);

    return { name, employeeId, department: deptName, role: roleName };
  };

  const handleDeleteRequest = (item) => {
    Alert.alert(
      'Delete Material Request',
      `Are you sure you want to delete material request #${item.transactionId || ''}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionSubmitting(true);
              const targetId = item._id || item.transactionId;
              const res = await materialApi.deleteTransaction(targetId);
              if (res && res.success !== false) {
                Alert.alert('Deleted', 'Material request deleted successfully.');
                setReturnDetailModalVisible(false);
                fetchApprovals();
              } else {
                Alert.alert('Error', res?.message || 'Failed to delete request.');
              }
            } catch (err) {
              Alert.alert('Error', err.response?.data?.message || err.message);
            } finally {
              setActionSubmitting(false);
            }
          },
        },
      ]
    );
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

  const formatDateTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    try {
      const d = new Date(timestamp);
      if (isNaN(d.getTime())) return String(timestamp);
      return d.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch (_) {
      return String(timestamp);
    }
  };

  const isHistoryFinalStatus = (status) => {
    if (!status) return false;
    const s = String(status).toLowerCase();
    // 'store_accepted' is an intermediate pending state for splits (awaiting Phase 2 barcode scan)
    // and material requests (awaiting handler delivery / requester receipt). Never treat as history final status!
    if (s === 'store_accepted') return false;
    // Strictly accepted / approved / completed or rejected final outcomes
    const isAccepted = ['approved', 'accepted', 'completed', 'received', 'closed', 'store_received'].includes(s);
    const isRejected = s.includes('reject');
    return isAccepted || isRejected;
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
    const userId = String(user._id || user.id || user.user?._id || user.user?.id || '');

    // 1. Direct match: If a specific store user/approver is assigned on this item
    if (item && userId) {
      const storeField = item.store || item.storeAdmin || item.assignedStoreUser;
      if (storeField) {
        const storeId = String(typeof storeField === 'object' ? (storeField._id || storeField.id || '') : storeField);
        if (storeId && storeId === userId) {
          return true;
        }
      }
    }

    // 2. Name or email match: Gokul Shirgaon store user selected by super admin
    const userName = String(user.name || user.fullName || user.user?.name || user.user?.fullName || '').toLowerCase();
    const userEmail = String(user.email || user.user?.email || '').toLowerCase();
    if (userName.includes('gokul') || userEmail.includes('gokul')) return true;

    const adminType = String(user.adminType || user.departmentAdminType || user.user?.adminType || user.user?.departmentAdminType || '').toLowerCase();
    const userRole = String(user.role || user.user?.role || '').toLowerCase();

    // If user is explicitly management or accounts, they are NOT store approver
    if (adminType === 'management' || adminType === 'accounts' || userRole === 'management') {
      return false;
    }

    // Department check: Store or Warehouse personnel
    const dept = user.department || user.user?.department;
    const deptName = String(typeof dept === 'object' ? (dept.name || dept.departmentName || '') : dept).toLowerCase();
    if (deptName.includes('store') || deptName.includes('warehouse')) return true;

    // Designation check: Store Keeper, Store Incharge, Store Manager, etc.
    const designation = String(user.designation || user.user?.designation || '').toLowerCase();
    if (designation.includes('store') || designation.includes('warehouse')) return true;

    // Store admin or store role
    if (['store', 'store_admin', 'tcstr1', 'store_manager', 'storekeeper', 'warehouse'].includes(userRole)) return true;
    if (userRole.includes('store') || userRole.includes('warehouse')) return true;
    if (userRole === 'department_admin' && (adminType === 'store' || adminType === 'warehouse')) return true;

    const roleCode = String(user.roleCode || user.user?.roleCode || '').toUpperCase();
    if (['STORE_ADMIN', 'TCSTR1', 'TCST8A', 'STORE'].includes(roleCode) || roleCode.includes('STR') || roleCode.includes('STORE')) return true;

    if (
      user.isSuperAdmin === true ||
      user.isAdmin === true ||
      user.scope === 'GLOBAL' ||
      ['super_admin', 'company_admin', 'admin', 'superadmin', 'companyadmin', 'store_admin', 'storeadmin', 'store', 'tcstr1', 'store_manager'].includes(userRole) ||
      userRole.includes('admin')
    ) {
      return true;
    }

    return false;
  };

  const isManagementUser = (user, item) => {
    if (!user) return false;
    const uId = String(user._id || user.id || user.user?._id || user.user?.id || '');
    if (item && item.managementApprover) {
      const mId = String(item.managementApprover._id || item.managementApprover.id || item.managementApprover);
      if (uId && mId && uId === mId) return true;
    }
    const userRole = String(user.role || user.user?.role || '').toLowerCase();
    const adminType = String(user.adminType || user.departmentAdminType || user.user?.adminType || user.user?.departmentAdminType || '').toLowerCase();
    if (userRole === 'management' || adminType === 'management') return true;
    if (['super_admin', 'admin', 'company_admin'].includes(userRole)) return true;
    return false;
  };

  const isAccountsUser = (user) => {
    if (!user) return false;
    const userRole = String(user.role || user.user?.role || '').toLowerCase();
    const adminType = String(user.adminType || user.departmentAdminType || user.user?.adminType || user.user?.departmentAdminType || '').toLowerCase();
    const roleCode = String(user.roleCode || user.user?.roleCode || '').toUpperCase();
    if (['accounts', 'account_admin', 'account', 'finance', 'tcacc1', 'tcacc2'].includes(userRole)) return true;
    if (userRole === 'department_admin' && (adminType === 'accounts' || adminType === 'account' || adminType === 'finance')) return true;
    if (['ACCOUNT_ADMIN', 'TCACC1', 'TCACC2', 'FINANCE'].includes(roleCode)) return true;
    if (['super_admin', 'admin', 'company_admin'].includes(userRole)) return true;
    return false;
  };

  const getFilteredItems = () => {
    const list = [];
    const role = String(currentUser?.role || currentUser?.user?.role || '').toLowerCase();
    const userId = String(currentUser?._id || currentUser?.id || currentUser?.user?._id || currentUser?.user?.id || '');
    const userEmpId = String(currentUser?.employeeId || currentUser?.user?.employeeId || '');
    const adminType = String(currentUser?.adminType || currentUser?.departmentAdminType || currentUser?.user?.adminType || currentUser?.user?.departmentAdminType || '').toLowerCase();
    const roleCode = String(currentUser?.roleCode || currentUser?.user?.roleCode || '').toUpperCase();
    const currentUserName = String(currentUser?.name || currentUser?.fullName || currentUser?.user?.name || currentUser?.user?.fullName || '').toLowerCase().trim();
    const isTL = role === 'team_lead' || role === 'tl' || adminType === 'team_lead' || Boolean(currentUser?.isTeamLead || currentUser?.user?.isTeamLead) || roleCode === 'TCTL1' || roleCode.includes('TL') || currentUserName.includes('prathmesh');
    const isMgt = isManagementUser(currentUser);
    const isAcc = isAccountsUser(currentUser);
    const isStore = isAssignedStoreUser(currentUser);
    const isSuperOrCompanyAdmin = ['super_admin', 'company_admin', 'admin'].includes(role) || currentUser?.scope === 'GLOBAL';

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
          // 1. If status is 'submitted', ONLY the assigned Team Lead (or TL in same department) can see it for approval action!
          // Subordinates and other departments MUST NOT see it!
          if (status === 'submitted') {
            if (isSender) return filterBySearch(t, 'transactionId');
            if (isAssignedTL) return filterBySearch(t, 'transactionId');
            if (isTL) {
              const userDept = currentUser?.department || currentUser?.user?.department;
              const userDeptId = String(typeof userDept === 'object' ? (userDept?._id || userDept?.id || '') : (userDept || ''));
              const userDeptName = String(typeof userDept === 'object' ? (userDept?.name || userDept?.departmentName || '') : '').toLowerCase();
              const txnDept = t.department;
              const txnDeptId = String(typeof txnDept === 'object' ? (txnDept?._id || txnDept?.id || '') : (txnDept || ''));
              const txnDeptName = String(typeof txnDept === 'object' ? (txnDept?.name || txnDept?.departmentName || '') : '').toLowerCase();

              const sameDept = !txnDeptId || (userDeptId && txnDeptId && userDeptId === txnDeptId) ||
                (userDeptName && txnDeptName && userDeptName === txnDeptName);

              if (sameDept) return filterBySearch(t, 'transactionId');
            }
            return false; // Do not show to other departments, Management or Store until TL approves
          }

          // 2. If status is 'tl_approved':
          // Strictly visible to Requester and Management Approver for management authorization.
          // Store only sees it AFTER management approves ('mgt_approved').
          if (status === 'tl_approved') {
            if (isSender) return filterBySearch(t, 'transactionId');
            if (isMgt || isAssignedMgt) return filterBySearch(t, 'transactionId');
            return false;
          }

          // 3. If status is 'mgt_approved' or 'store_accepted' or 'ready_for_dispatch':
          // Management has ALREADY approved. ALL Store users see it for dispatch!
          if (['mgt_approved', 'ready_for_dispatch'].includes(status)) {
            if (isSender) return filterBySearch(t, 'transactionId');
            if (isAssignedStore || isStore) return filterBySearch(t, 'transactionId');
            return false; // Subordinates and other department users MUST NOT see it in pending
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
            if ((isAssignedStore || isStore) && (status === 'store_accepted' || t.handlerRejected || t.handlerStatus === 'declined' || t.handlerStatus === 'rejected') && !isHandler) return filterBySearch(t, 'transactionId');
            return false;
          }

          const isPending = ['submitted', 'tl_approved', 'mgt_approved', 'store_accepted', 'handler_assigned', 'dispatched'].includes(status);
          if (!isPending) return false;
        } else {
          // History tab: Strictly accepted (received, completed, closed) or rejected requests
          const isHistory = isHistoryFinalStatus(status);
          if (!isHistory) return false;
          if (isSuperOrCompanyAdmin || isSender || isAssignedTL || isAssignedMgt || isAssignedStore || isStore || isHandler) {
            return filterBySearch(t, 'transactionId');
          }
          return false;
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

        // History tab: strictly accepted or rejected
        if (!isHistoryFinalStatus(tr.status)) return false;
        if (isSender || isRecipient || isMgmtApprover || role === 'super_admin' || isSuperOrCompanyAdmin) {
          return filterBySearch(tr, 'barcode');
        }
        return false;
      });
      list.push(...filteredTransfers.map((tr) => ({ ...tr, _cardType: 'transfer' })));
    }

    // 3. Split Requests
    if (['all', 'split'].includes(requestType)) {
      const filteredSplits = splits.filter((s) => {
        const sStatus = String(s.status || '').toLowerCase().trim();
        const isPending = ['pending', 'submitted', 'initiated', 'store_accepted'].includes(sStatus);
        if (statusTab === 'pending' ? !isPending : isPending) return false;

        const isStoreApprover = isAssignedStoreUser(currentUser, s);
        const reqId = String(typeof (s.requester || s.requestedBy) === 'object' ? ((s.requester || s.requestedBy)?._id || (s.requester || s.requestedBy)?.id || '') : (s.requester || s.requestedBy || s.user?._id || s.user?.id || s.user || ''));
        const reqEmpId = String(typeof (s.requester || s.requestedBy) === 'object' ? ((s.requester || s.requestedBy)?.employeeId || '') : '');
        const isRequester = (userId && reqId && userId === reqId) || (userEmpId && reqId && userEmpId === reqId) || (userEmpId && reqEmpId && userEmpId === reqEmpId);

        if (statusTab === 'pending') {
          // Store approvers, admins, and the requester themselves can track pending split requests
          if (isStoreApprover || isSuperOrCompanyAdmin || isRequester) {
            return filterBySearch(s, 'barcode');
          }
          return false;
        }

        // History tab: strictly approved or rejected
        if (!['approved', 'rejected'].includes(sStatus)) return false;
        if (isRequester || isStoreApprover || isSuperOrCompanyAdmin) {
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
        const reqEmpId = String(typeof (r.fromUser || r.requester) === 'object' ? ((r.fromUser || r.requester)?.employeeId || '') : '');
        const returnHandlerId = String(typeof r.returnHandler === 'object' ? (r.returnHandler?._id || r.returnHandler?.id || '') : (r.returnHandler || ''));
        const returnHandlerEmpId = String(typeof r.returnHandler === 'object' ? (r.returnHandler?.employeeId || '') : '');
        const toHandlerId = String(typeof r.pendingHandlerTransfer?.toHandler === 'object' ? (r.pendingHandlerTransfer?.toHandler?._id || r.pendingHandlerTransfer?.toHandler?.id || '') : (r.pendingHandlerTransfer?.toHandler || ''));
        const toHandlerEmpId = String(typeof r.pendingHandlerTransfer?.toHandler === 'object' ? (r.pendingHandlerTransfer?.toHandler?.employeeId || '') : '');
        const fromHandlerId = String(typeof r.pendingHandlerTransfer?.fromHandler === 'object' ? (r.pendingHandlerTransfer?.fromHandler?._id || r.pendingHandlerTransfer?.fromHandler?.id || '') : (r.pendingHandlerTransfer?.fromHandler || ''));
        const fromHandlerEmpId = String(typeof r.pendingHandlerTransfer?.fromHandler === 'object' ? (r.pendingHandlerTransfer?.fromHandler?.employeeId || '') : '');

        const isRequester = (userId && reqId && userId === reqId) || (userEmpId && reqId && userEmpId === reqId) || (userEmpId && reqEmpId && userEmpId === reqEmpId);
        const isReturnHandler = (userId && returnHandlerId && userId === returnHandlerId) || (userEmpId && returnHandlerId && userEmpId === returnHandlerId) || (userEmpId && returnHandlerEmpId && userEmpId === returnHandlerEmpId);
        const isPendingReturnToHandler = r.pendingHandlerTransfer?.status === 'pending' && ((userId && toHandlerId && userId === toHandlerId) || (userEmpId && toHandlerId && userEmpId === toHandlerId) || (userEmpId && toHandlerEmpId && userEmpId === toHandlerEmpId));
        const isPendingReturnFromHandler = r.pendingHandlerTransfer?.status === 'pending' && ((userId && fromHandlerId && userId === fromHandlerId) || (userEmpId && fromHandlerId && userEmpId === fromHandlerId) || (userEmpId && fromHandlerEmpId && userEmpId === fromHandlerEmpId));
        const isStoreApprover = isAssignedStoreUser(currentUser, r);

        if (statusTab === 'pending') {
          // If return has a handler assigned, Store MUST NOT see it until handler has sent it to store (status === 'store_received')!
          if (isStoreApprover || isSuperOrCompanyAdmin) {
            if (r.returnMethod !== 'direct' && returnHandlerId && r.status !== 'store_received') {
              return false; // Hidden from store until handler delivers!
            }
            return filterBySearch(r, 'barcode');
          }

          if (isPendingReturnToHandler || isPendingReturnFromHandler) {
            return filterBySearch(r, 'barcode');
          }
          if (isReturnHandler || isRequester) {
            return filterBySearch(r, 'barcode');
          }
          return false;
        }

        // History tab: strictly accepted (store_received, completed) or rejected
        if (!isHistoryFinalStatus(r.status)) return false;
        if (isSuperOrCompanyAdmin || isRequester || isReturnHandler || isStoreApprover) {
          return filterBySearch(r, 'barcode');
        }
        return false;
      });

      // Group returns so multiple materials in the same return (by direct requester or handler) appear as ONE consolidated request for Store, Handlers, and Requesters
      const processedReturns = [];
      const returnGroups = {};

      filteredReturns.forEach((r) => {
        const fromId = String(typeof (r.fromUser || r.requester) === 'object' ? ((r.fromUser || r.requester)?._id || (r.fromUser || r.requester)?.id || '') : (r.fromUser || r.requester || ''));
        const returnHandlerId = String(typeof r.returnHandler === 'object' ? (r.returnHandler?._id || r.returnHandler?.id || '') : (r.returnHandler || ''));

        // Group key uniquely identifies the return batch
        const groupKey = r.bulkReturnId
          ? `BULK_${r.bulkReturnId}_${r.status}`
          : `RET_${fromId}_${returnHandlerId || 'direct'}_${r.transactionId || 'tx'}_${r.status}_${(r.createdAt || '').slice(0, 16)}`;

        if (!returnGroups[groupKey]) {
          returnGroups[groupKey] = {
            ...r,
            _cardType: 'return',
            isBulkGroup: true,
            returnIds: [r._id || r.id],
            barcodes: r.barcode ? [r.barcode] : [],
            materialsList: [{
              barcode: r.barcode,
              materialName: r.materialName || r.barcode,
              condition: r.condition,
              photos: r.photos || [],
            }],
            photos: [...(r.photos || [])],
            barcode: r.barcode,
          };
          processedReturns.push(returnGroups[groupKey]);
        } else {
          const grp = returnGroups[groupKey];
          const curId = r._id || r.id;
          if (curId && !grp.returnIds.includes(curId)) {
            grp.returnIds.push(curId);
            if (r.barcode && !grp.barcodes.includes(r.barcode)) {
              grp.barcodes.push(r.barcode);
            }
            grp.materialsList.push({
              barcode: r.barcode,
              materialName: r.materialName || r.barcode,
              condition: r.condition,
              photos: r.photos || [],
            });
            if (r.photos && Array.isArray(r.photos) && r.photos.length > 0) {
              r.photos.forEach((p) => {
                const pUrl = typeof p === 'string' ? p : p.url;
                const exists = grp.photos.some((gp) => (typeof gp === 'string' ? gp : gp.url) === pUrl);
                if (!exists) grp.photos.push(p);
              });
            }
          }
        }
      });

      list.push(...processedReturns);
    }

    // 5. Conversions / Close Requests (DC Internal, DC FOC, Invoice)
    if (['all', 'conversion'].includes(requestType)) {
      const filteredCloses = closeRequests.filter((c) => {
        const isPending = ['pending', 'pending_accounts_approval', 'pending_store_acceptance'].includes(c.status);
        if (statusTab === 'pending' ? !isPending : isPending) return false;

        const reqId = String(typeof (c.requester || c.requestedBy) === 'object' ? ((c.requester || c.requestedBy)?._id || (c.requester || c.requestedBy)?.id || '') : (c.requester || c.requestedBy || c.user?._id || c.user?.id || c.user || ''));
        const isRequester = userId && reqId && (userId === reqId);
        const mgtApproverId = String(typeof c.managementApprover === 'object' ? (c.managementApprover?._id || c.managementApprover?.id || '') : (c.managementApprover || ''));
        const isAssignedMgt = userId && mgtApproverId && (userId === mgtApproverId);

        const tlObj = c.teamLead;
        const tlApproverId = String(typeof tlObj === 'object' ? (tlObj?._id || tlObj?.id || '') : (tlObj || ''));
        const tlApproverName = String(typeof tlObj === 'object' ? (tlObj?.name || tlObj?.fullName || '') : '').toLowerCase().trim();
        const tlApproverEmpId = String(typeof tlObj === 'object' ? (tlObj?.employeeId || tlObj?.employeeIdCode || '') : '').toUpperCase().trim();

        const isAssignedTL = Boolean(
          (userId && tlApproverId && userId === tlApproverId) ||
          (userEmpId && tlApproverEmpId && userEmpId === tlApproverEmpId) ||
          (currentUserName && tlApproverName && currentUserName === tlApproverName) ||
          (c.requester && (String(c.requester.reportsTo?._id || c.requester.reportsTo || c.requester.reportingTo?._id || c.requester.reportingTo || '') === userId))
        );
        const isStoreApprover = isAssignedStoreUser(currentUser, c);

        if (statusTab === 'pending') {
          // STAGE 1: 'pending' -> Only Team Lead (for DC Internal) or Assigned Management Approver (for DC FOC / Invoice)
          if (c.status === 'pending') {
            if (c.documentType === 'DC Internal') {
              const reqDept = String(typeof c.requester === 'object' ? (c.requester?.department?.name || c.requester?.department?._id || c.requester?.department || '') : (c.requester?.department || '')).toLowerCase().trim();
              const myDept = String(currentUser?.department?.name || currentUser?.department?._id || currentUser?.department || currentUser?.user?.department?.name || currentUser?.user?.department?._id || currentUser?.user?.department || '').toLowerCase().trim();
              const isSameDept = Boolean(reqDept && myDept && reqDept === myDept);
              const canTLView = (isAssignedTL || ((isTL || currentUserName.includes('prathmesh')) && (isSameDept || !reqDept || !myDept)) || isSuperOrCompanyAdmin) && !isMgt;
              if (canTLView) return filterBySearch(c, 'barcode');
              return false;
            }
            if (['DC FOC', 'Invoice'].includes(c.documentType) && (isAssignedMgt || (isMgt && !mgtApproverId))) return filterBySearch(c, 'barcode');
            return false;
          }

          // STAGE 2: 'pending_accounts_approval' -> Only Accounts Admin (Management must NOT see)
          if (c.status === 'pending_accounts_approval') {
            if (isAcc && !isMgt) return filterBySearch(c, 'barcode');
            return false;
          }

          // STAGE 3: 'pending_store_acceptance' -> ONLY Store User (STRICTLY NOT Management, NOT Requester, NOT Accounts)
          if (c.status === 'pending_store_acceptance') {
            if (isStoreApprover && !isMgt) return filterBySearch(c, 'barcode');
            return false;
          }

          return false;
        }

        // History Tab -> strictly accepted or rejected
        if (!isHistoryFinalStatus(c.status)) return false;
        if (isSuperOrCompanyAdmin || isRequester || isAssignedMgt || isMgt || isStoreApprover || isAcc) {
          return filterBySearch(c, 'barcode');
        }
        return false;
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

        // History tab: strictly accepted or rejected
        if (!isHistoryFinalStatus(e.status)) return false;
        const reqId = String(typeof (e.requester || e.requestedBy) === 'object' ? ((e.requester || e.requestedBy)?._id || (e.requester || e.requestedBy)?.id || '') : (e.requester || e.requestedBy || e.user?._id || e.user?.id || e.user || ''));
        const isRequester = userId && reqId && (userId === reqId);
        if (isRequester || isStoreApprover || isSuperOrCompanyAdmin) {
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

        // History tab: strictly accepted or rejected
        if (!isHistoryFinalStatus(m.status)) return false;
        const reqId = String(typeof (m.requester || m.requestedBy) === 'object' ? ((m.requester || m.requestedBy)?._id || (m.requester || m.requestedBy)?.id || '') : (m.requester || m.requestedBy || m.user?._id || m.user?.id || m.user || ''));
        const isRequester = userId && reqId && (userId === reqId);
        if (isRequester || isStoreApprover || isSuperOrCompanyAdmin) {
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
  const handleOpenActionModal = (item, actionType, title, forcePhase = null) => {
    setModalItem(item);
    setModalActionType(actionType);
    setModalTitle(title);
    setActionRemarks('');
    if (item._cardType === 'split') {
      const targetPhase = forcePhase !== null ? forcePhase : (item.status === 'store_accepted' ? 2 : 1);
      setSplitPhase(targetPhase);
      const vNum = item.tallyVoucherNumber || splitTallyVoucherNumber || '';
      setSplitTallyVoucherNumber(vNum);
      if (targetPhase === 2) {
        setModalTitle('Phase 2: Barcode Assignment');
      } else {
        setModalTitle('Phase 1: Accept Split Request');
      }
      const children = getSplitChildItems(item);
      const initialBarcodes = {};
      children.forEach((c, idx) => {
        const bc = (Array.isArray(item.childBarcodes) && item.childBarcodes[idx]) ||
                   (Array.isArray(item.childItems) && item.childItems[idx]?.barcode) ||
                   c.barcode ||
                   (idx === 0 ? (item.newBarcode || '') : '') || '';
        initialBarcodes[idx] = bc ? String(bc) : '';
      });
      setChildScannedBarcodes(initialBarcodes);
      setActionNewBarcode(initialBarcodes[0] || '');
      setActionRemarks(item.storeRemark || '');
    } else {
      setActionNewBarcode(item.newBarcode ? String(item.newBarcode) : '');
    }
    setActionQuantity(item.newQuantity ? String(item.newQuantity) : '1');
    setActionUnit(item.unit || 'Nos');
    setActionRate(item.price || item.rate ? String(item.price || item.rate) : '');
    setActionGodown('Main Store');

    const curUserId = String(currentUser?._id || currentUser?.id || '');
    const curUserEmpId = String(currentUser?.employeeId || currentUser?.user?.employeeId || '');
    const reqId = String(item.requester?._id || item.requester?.id || item.requester || item.fromUser?._id || item.fromUser?.id || item.fromUser || '');
    const reqEmpId = String(item.requester?.employeeId || item.fromUser?.employeeId || '');
    const hId = String(item.handler?._id || item.handler?.id || item.handler || item.returnHandler?._id || item.returnHandler?.id || item.returnHandler || '');
    const hEmpId = String(item.handler?.employeeId || item.returnHandler?.employeeId || '');

    const eligibleHandlers = (usersList || []).filter((u) => {
      if (!u) return false;
      const uId = String(u._id || u.id || '');
      const uEmpId = String(u.employeeId || '');
      if (!uId) return false;
      if (curUserId && uId === curUserId) return false;
      if (curUserEmpId && uEmpId && curUserEmpId === uEmpId) return false;
      if (hId && uId === hId) return false;
      if (hEmpId && uEmpId && hEmpId === uEmpId) return false;
      if (reqId && uId === reqId) return false;
      if (reqEmpId && uEmpId && reqEmpId === uEmpId) return false;
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
        } else if (modalActionType === 'handler-accept') {
          await materialApi.handlerAction(itemId, { actionType: 'collect', remarks: actionRemarks || 'Accepted handler assignment' });
          Alert.alert('Accepted', 'You have accepted the handler assignment!');
        } else if (modalActionType === 'handler-decline') {
          await materialApi.handlerAction(itemId, { actionType: 'decline', remarks: actionRemarks || 'Declined handler assignment' });
          Alert.alert('Declined', 'Handler assignment declined.');
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
        } else if (modalActionType === 'store-direct-dispatch') {
          await materialApi.handlerAction(itemId, { actionType: 'direct_dispatch', remarks: actionRemarks || 'Dispatched direct to requester' });
          Alert.alert('Success', 'Material dispatched directly to requester for physical receipt.');
        } else if (modalActionType === 'store-assign-handler') {
          if (!actionSelectedHandlerId) {
            Alert.alert('Validation Error', 'Please select a handler.');
            return;
          }
          await materialApi.assignHandler(itemId, { handlerId: actionSelectedHandlerId, remarks: actionRemarks || 'Assigned handler for delivery' });
          Alert.alert('Success', 'New handler assigned successfully. Request sent to handler.');
        } else if (modalActionType === 'reject_receipt') {
          await materialApi.rejectReceipt(itemId, { remarks: actionRemarks });
          Alert.alert('Rejected', 'Material receipt rejected and sent back.');
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
          if (splitPhase === 1) {
            // Phase 1: Store accepts split request and posts Autofill Stock Journal in Tally
            const acceptPayload = {
              storeRemark: actionRemarks.trim() || 'Store accepted split request'
            };
            let res;
            try {
              res = await materialApi.acceptSplit(itemId, acceptPayload);
            } catch (err) {
              res = await materialApi.approveSplit({
                requestId: itemId,
                action: 'accept',
                phase: 1,
                ...acceptPayload
              });
            }

            if (res && res.success !== false) {
              const vNum = res.tallyVoucherNumber || res.splitReq?.tallyVoucherNumber || res.data?.tallyVoucherNumber || `SJ-SPLIT-${Date.now().toString().slice(-6)}`;

              // Update local state in splits list
              setSplits(prev => prev.map(s => (s._id === itemId || s.id === itemId) ? {
                ...s,
                status: 'store_accepted',
                tallyVoucherNumber: vNum,
                storeRemark: actionRemarks.trim() || s.storeRemark
              } : s));

              // Automatically transition modal to Phase 2: Barcode Assignment
              setSplitPhase(2);
              setSplitTallyVoucherNumber(vNum);
              const updatedItem = {
                ...modalItem,
                status: 'store_accepted',
                tallyVoucherNumber: vNum,
                storeRemark: actionRemarks.trim() || modalItem?.storeRemark,
              };
              setModalItem(updatedItem);
              setModalTitle('Phase 2: Barcode Assignment');
              const children = getSplitChildItems(updatedItem);
              const initialBarcodes = {};
              children.forEach((c, idx) => {
                const bc = (Array.isArray(updatedItem.childBarcodes) && updatedItem.childBarcodes[idx]) ||
                           (Array.isArray(updatedItem.childItems) && updatedItem.childItems[idx]?.barcode) ||
                           c.barcode ||
                           (idx === 0 ? (res.splitReq?.newBarcode || res.newBarcode || '') : '') || '';
                initialBarcodes[idx] = bc ? String(bc) : '';
              });
              setChildScannedBarcodes(initialBarcodes);
              setActionNewBarcode(initialBarcodes[0] || '');
              setActionRemarks('');
              setActionSubmitting(false);

              Alert.alert(
                'Phase 1 Accepted',
                `Autofill Stock Journal voucher (${vNum}) created in Tally!\n\nStatus is now Store Accepted.\n\nPlease scan or enter the printed barcode sticker(s) for each child item in Phase 2 to activate.`
              );
              return; // Keep modal open for Phase 2!
            } else {
              Alert.alert('Phase 1 Error', res?.message || 'Failed to accept split in Phase 1.');
              setActionSubmitting(false);
              return;
            }
          } else {
            // Phase 2: Barcode Scan / Manual Entry for each child item + Optional Remarks
            const rawChildItems = getSplitChildItems(modalItem);
            const missingChildNames = [];
            const resolvedChildren = rawChildItems.map((c, idx) => {
              const enteredBc = (childScannedBarcodes[idx] || (idx === 0 ? actionNewBarcode : '') || '').trim().toUpperCase();
              if (!enteredBc) {
                missingChildNames.push(`#${idx + 1} (${c.materialName})`);
              }
              return {
                ...c,
                barcode: enteredBc,
              };
            });

            if (missingChildNames.length > 0) {
              Alert.alert(
                'Barcode Required',
                `Please scan or enter a barcode for all child items:\n• ${missingChildNames.join('\n• ')}`
              );
              setActionSubmitting(false);
              return;
            }

            // Verify child barcodes are distinct
            const bcValues = resolvedChildren.map(c => c.barcode);
            const duplicates = bcValues.filter((bc, idx) => bcValues.indexOf(bc) !== idx);
            if (duplicates.length > 0) {
              Alert.alert(
                'Duplicate Barcode',
                `Barcode "${duplicates[0]}" is assigned to multiple child items. Each child item must have a unique barcode.`
              );
              setActionSubmitting(false);
              return;
            }

            const primaryBarcode = resolvedChildren[0].barcode;
            const res = await materialApi.approveSplit({
              requestId: itemId,
              action: 'approve',
              phase: 2,
              newBarcode: primaryBarcode,
              childBarcodes: resolvedChildren.map(c => c.barcode),
              childItems: resolvedChildren,
              storeRemark: actionRemarks.trim() || 'Split approved and barcodes activated by Store',
              reason: actionRemarks.trim() || 'Split approved and barcodes activated by Store',
              quantity: resolvedChildren.reduce((sum, c) => sum + (Number(c.quantity) || 1), 0),
              unit: actionUnit || modalItem?.unit || 'Nos',
              godown: actionGodown || 'Main Store',
            });

            if (res && res.success !== false) {
              const bcListStr = resolvedChildren.map((c, idx) => `• #${idx + 1} ${c.materialName}: ${c.barcode}`).join('\n');
              Alert.alert(
                'Split Completed & Barcodes Active',
                `Child barcode(s) have been successfully activated and linked to parent ${modalItem?.barcode || ''}!\n\n${bcListStr}\n\nRequester now has active custody of these items.`
              );
              setModalVisible(false);
              fetchApprovals();
              const targetTxnId = res.transactionId || modalItem?.transactionId || (modalItem?.transaction?._id || modalItem?.transaction?.transactionId || modalItem?.transaction);
              if (targetTxnId) {
                navigation.navigate('MaterialDetailScreen', { id: targetTxnId });
              }
            } else {
              Alert.alert('Split Activation Error', res?.message || 'Failed to activate child barcodes.');
            }
          }
        } else {
          const res = await materialApi.approveSplit({
            requestId: itemId,
            action: 'reject',
            reason: actionRemarks.trim() || 'Rejected by Store',
            storeRemark: actionRemarks.trim() || 'Rejected by Store',
          });
          if (res && res.success !== false) {
            Alert.alert('Success', 'Split request rejected.');
            setModalVisible(false);
            fetchApprovals();
          } else {
            Alert.alert('Split Rejection Error', res?.message || 'Split rejection failed.');
          }
        }
      } else if (cardType === 'return') {
        const returnIdsToProcess = (modalItem.returnIds && modalItem.returnIds.length > 0) ? modalItem.returnIds : [itemId];
        if (modalActionType === 'assign-return-handler') {
          if (!actionSelectedHandlerId) {
            Alert.alert('Validation Error', 'Please select return handler.');
            return;
          }
          for (const rId of returnIdsToProcess) {
            await materialApi.assignReturnHandler(rId, {
              handlerId: actionSelectedHandlerId,
              remarks: actionRemarks.trim(),
            });
          }
          Alert.alert('Success', `Return handler reassignment request sent for ${returnIdsToProcess.length} item(s)!`);
        } else if (modalActionType === 'accept_return_handler_transfer') {
          for (const rId of returnIdsToProcess) {
            await materialApi.returnHandlerAction(rId, {
              actionType: 'accept_transfer',
              remarks: actionRemarks.trim(),
            });
          }
          Alert.alert('Success', `You have accepted the return handler assignment for ${returnIdsToProcess.length} item(s)!`);
        } else if (modalActionType === 'reject_return_handler_transfer') {
          for (const rId of returnIdsToProcess) {
            await materialApi.returnHandlerAction(rId, {
              actionType: 'reject_transfer',
              remarks: actionRemarks.trim(),
            });
          }
          Alert.alert('Success', `Return handler assignment request rejected for ${returnIdsToProcess.length} item(s).`);
        } else if (modalActionType === 'return-collect') {
          for (const rId of returnIdsToProcess) {
            await materialApi.returnHandlerAction(rId, {
              actionType: 'collect',
              remarks: actionRemarks.trim(),
            });
          }
          Alert.alert('Success', `Return material(s) (${returnIdsToProcess.length} items) accepted and collected!`);
        } else if (modalActionType === 'return-reject') {
          for (const rId of returnIdsToProcess) {
            await materialApi.returnHandlerAction(rId, {
              actionType: 'reject',
              remarks: actionRemarks.trim(),
            });
          }
          Alert.alert('Success', `Return assignment rejected for ${returnIdsToProcess.length} item(s).`);
        } else if (modalActionType === 'return-deliver') {
          for (const rId of returnIdsToProcess) {
            await materialApi.returnHandlerAction(rId, {
              actionType: 'deliver',
              remarks: actionRemarks.trim(),
            });
          }
          Alert.alert('Success', `Return material(s) (${returnIdsToProcess.length} items) delivered and sent to Store!`);
        } else {
          for (const rId of returnIdsToProcess) {
            await materialApi.acceptReturn(rId, { remarks: actionRemarks });
          }
          Alert.alert('Success', `Return voucher receipt confirmed for ${returnIdsToProcess.length} barcode(s)!`);
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
          const finalBarcode = (modalItem?.newBarcode || actionNewBarcode || '').trim();
          if (!finalBarcode) {
            Alert.alert('Validation Error', 'Replacement barcode serial is required. Please scan the replacement barcode.');
            return;
          }
          if (!/^\d+$/.test(finalBarcode)) {
            Alert.alert('Validation Error', 'Replacement barcode serial must be numeric only.');
            return;
          }
          await materialApi.respondExchange(itemId, {
            action: 'accept',
            newBarcode: finalBarcode,
            storeRemark: actionRemarks.trim(),
          });
          Alert.alert('Success', `Exchange request approved with replacement serial ${finalBarcode}!`);
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
      setReturnDetailModalVisible(false);
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

    if (item._cardType === 'split') {
      if (item.status === 'pending') {
        return 'Phase 1: Awaiting Store Acceptance & Tally Stock Journal';
      }
      if (item.status === 'store_accepted') {
        return 'Phase 2: Store Accepted — Awaiting Barcode Assignment & Labeling';
      }
      if (item.status === 'approved') {
        return `Split Done: New Barcode ${item.newBarcode || ''}`;
      }
      if (item.status === 'rejected') {
        return `Split Rejected: ${item.storeRemark || item.rejectionReason || 'Declined'}`;
      }
    }

    if (item._cardType === 'return') {
      if (item.status === 'completed' || item.status === 'closed') {
        return 'Tracking: Received & Accepted by Store';
      }
      if (item.returnMethod === 'direct' || !item.returnHandler) {
        return 'Tracking: Direct Store Return (Pending Store Acceptance)';
      }
      const hObj = item.returnHandler;
      const hName = hObj ? (typeof hObj === 'object' ? (hObj.fullName || hObj.name) : 'Handler') : null;
      if (hName) {
        return `Tracking: Return Handler Assigned (${hName})`;
      }
      return 'Tracking: Direct Store Return (Pending Store Acceptance)';
    }

    if (item._cardType === 'conversion') {
      const doc = item.documentType || 'Conversion';
      if (item.status === 'pending') {
        if (doc === 'DC Internal') return 'Awaiting Team Leader Review';
        return 'Awaiting Management Authorization';
      }
      if (item.status === 'pending_accounts_approval') {
        return 'Awaiting Accounts Admin Review';
      }
      if (item.status === 'pending_store_acceptance') {
        return 'Awaiting Store Physical Acceptance';
      }
      if (item.status === 'approved' || item.status === 'closed') {
        return `Completed: Converted to ${doc}`;
      }
      if (item.status === 'rejected') {
        return `Rejected: ${item.rejectionReason || 'Conversion Rejected'}`;
      }
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
    // If in history tab or item is already accepted/rejected, no pending action buttons
    if (statusTab === 'history') {
      return null;
    }
    if (item._cardType === 'split') {
      const sStatus = String(item.status || '').toLowerCase().trim();
      if (!['pending', 'submitted', 'initiated', 'store_accepted'].includes(sStatus)) {
        return null;
      }
    } else if (isHistoryFinalStatus(item.status)) {
      return null;
    }

    const role = String(currentUser?.role || currentUser?.user?.role || 'employee').toLowerCase();
    const userId = String(currentUser?._id || currentUser?.id || currentUser?.user?._id || currentUser?.user?.id || '');
    const userEmpId = String(currentUser?.employeeId || currentUser?.user?.employeeId || '');
    const adminType = String(currentUser?.adminType || currentUser?.departmentAdminType || currentUser?.user?.adminType || currentUser?.user?.departmentAdminType || '').toLowerCase();
    const roleCode = String(currentUser?.roleCode || currentUser?.user?.roleCode || '').toUpperCase();
    const cardType = item._cardType;

    const currentUserName = String(currentUser?.name || currentUser?.fullName || currentUser?.user?.name || currentUser?.user?.fullName || '').toLowerCase().trim();
    const isTL = role === 'team_lead' || role === 'tl' || adminType === 'team_lead' || Boolean(currentUser?.isTeamLead || currentUser?.user?.isTeamLead) || roleCode === 'TCTL1' || roleCode.includes('TL') || currentUserName.includes('prathmesh');
    const isMgt = isManagementUser(currentUser, item);
    const isAcc = isAccountsUser(currentUser);
    const isStore = isAssignedStoreUser(currentUser, item);
    const isSuperOrCompanyAdmin = ['super_admin', 'company_admin', 'admin'].includes(role) || currentUser?.scope === 'GLOBAL';

    const handlerId = item.handler ? String(item.handler._id || item.handler.id || item.handler) : '';
    const handlerEmpId = item.handler?.employeeId ? String(item.handler.employeeId) : '';
    const isHandler = (userId && handlerId && userId === handlerId) || (userEmpId && handlerId && userEmpId === handlerId) || (userEmpId && handlerEmpId && userEmpId === handlerEmpId);

    const requesterId = item.requester ? String(item.requester._id || item.requester.id || item.requester) : '';
    const requesterEmpId = item.requester?.employeeId ? String(item.requester.employeeId) : '';
    const isRequester = (userId && requesterId && userId === requesterId) || (userEmpId && requesterId && userEmpId === requesterId) || (userEmpId && requesterEmpId && userEmpId === requesterEmpId);

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

      // Handler actions
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

        const hasAccepted = item.handlerAccepted === true || item.status === 'collected' || (item.timeline && item.timeline.some(t => t.action?.toLowerCase().includes('handler accepted')));

        // If handler has NOT accepted yet: Show Accept / Reject buttons (WITHOUT Send to Requester or Change Handler)
        if (!hasAccepted && ['store_accepted', 'handler_assigned'].includes(item.status)) {
          return (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity
                style={[styles.miniBtn, { backgroundColor: '#16a34a' }]}
                onPress={() => handleOpenActionModal(item, 'handler-accept', 'Accept Handler Assignment')}
              >
                <CheckCircle2 size={14} color="#ffffff" />
                <Text style={styles.miniBtnText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.miniBtn, { backgroundColor: '#dc2626' }]}
                onPress={() => handleOpenActionModal(item, 'handler-decline', 'Reject Handler Assignment')}
              >
                <XCircle size={14} color="#ffffff" />
                <Text style={styles.miniBtnText}>Reject</Text>
              </TouchableOpacity>
            </View>
          );
        }

        // ONLY AFTER Handler accepts: Show "Send to Requester" and "Change Handler"
        if (hasAccepted && ['store_accepted', 'handler_assigned', 'collected'].includes(item.status)) {
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

      // Requester actions on dispatched materials
      // Show Reject button ONLY when dispatch was direct (no handler), hide when handler is assigned
      if (['dispatched', 'in_transit'].includes(item.status) && (isRequester || role === 'super_admin')) {
        const isDirectDispatch = !item.handler;
        return (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              style={[styles.miniBtn, { backgroundColor: '#16a34a' }]}
              onPress={() => navigation.navigate('ReceivingFormScreen', { id: item._id || item.transactionId })}
            >
              <CheckCircle2 size={14} color="#ffffff" />
              <Text style={styles.miniBtnText}>Receive Materials</Text>
            </TouchableOpacity>
            {isDirectDispatch && (
              <TouchableOpacity
                style={[styles.miniBtn, { backgroundColor: '#dc2626' }]}
                onPress={() => handleOpenActionModal(item, 'reject_receipt', 'Reject Material Receipt')}
              >
                <XCircle size={14} color="#ffffff" />
                <Text style={styles.miniBtnText}>Reject</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      }

      // Store Dispatch - strictly requires management authorization first ('mgt_approved')
      const isDispatchableStatus = ['mgt_approved', 'ready_for_dispatch', 'store_accepted'].includes(item.status);

      if (isDispatchableStatus && isStore) {
        const hasHandlerDeclined = item.handlerRejected === true ||
          item.handlerStatus === 'declined' ||
          item.handlerStatus === 'rejected' ||
          (item.timeline && item.timeline.some(t => (t.action || '').toLowerCase().includes('handler declined')));

        if (hasHandlerDeclined) {
          return (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <TouchableOpacity
                style={[styles.miniBtn, { backgroundColor: '#16a34a' }]}
                onPress={() => handleOpenActionModal(item, 'store-direct-dispatch', 'Dispatch Direct to Requester')}
              >
                <Truck size={14} color="#ffffff" />
                <Text style={styles.miniBtnText}>1. Direct to Requester</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.miniBtn, { backgroundColor: '#2563eb' }]}
                onPress={() => handleOpenActionModal(item, 'store-assign-handler', 'Assign New Handler')}
              >
                <User size={14} color="#ffffff" />
                <Text style={styles.miniBtnText}>2. Assign New Handler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.miniBtn, { backgroundColor: '#64748b' }]}
                onPress={() => navigation.navigate('StoreDispatchScreen', { id: item._id || item.transactionId })}
              >
                <Package size={14} color="#ffffff" />
                <Text style={styles.miniBtnText}>Edit Barcodes</Text>
              </TouchableOpacity>
            </View>
          );
        }

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
              onPress={() => navigation.navigate('ReceivingFormScreen', {
                id: item.transactionId || item._id,
                transferId: item._id || item.id,
                barcode: item.barcode,
                mode: 'transfer-accept',
              })}
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
      const sStatus = String(item.status || '').toLowerCase().trim();
      const isPhase1Done = sStatus === 'store_accepted';
      const isSplitPending = ['pending', 'submitted', 'initiated', 'store_accepted'].includes(sStatus);

      if (isSplitPending && (isStore || isSuperOrCompanyAdmin)) {
        return (
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {/* Phase 1 Button: Store Acceptance & Tally Stock Journal */}
            {isPhase1Done ? (
              <View
                style={[
                  styles.miniBtn,
                  {
                    backgroundColor: '#e0e7ff',
                    borderWidth: 1,
                    borderColor: '#a5b4fc',
                    paddingHorizontal: 8,
                  },
                ]}
              >
                <CheckCircle2 size={13} color="#4338ca" />
                <Text style={[styles.miniBtnText, { color: '#4338ca' }]}>
                  ✓ Phase 1 Done
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[
                  styles.miniBtn,
                  {
                    backgroundColor: '#16a34a',
                    paddingHorizontal: 10,
                  },
                ]}
                onPress={() => handleOpenActionModal(item, 'approve', 'Phase 1: Accept Split & Tally Stock Journal', 1)}
              >
                <CheckCircle2 size={13} color="#ffffff" />
                <Text style={styles.miniBtnText}>Phase 1: Approve Split</Text>
              </TouchableOpacity>
            )}

            {/* Phase 2 Button: Barcode Tagging & Activation */}
            {isPhase1Done ? (
              <TouchableOpacity
                style={[
                  styles.miniBtn,
                  {
                    backgroundColor: '#7c3aed',
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                  },
                ]}
                onPress={() => handleOpenActionModal(item, 'approve', 'Phase 2: Barcode Assignment', 2)}
              >
                <QrCode size={14} color="#ffffff" />
                <Text style={styles.miniBtnText}>Phase 2: Scan Barcode</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.miniBtn,
                  {
                    backgroundColor: '#f1f5f9',
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    paddingHorizontal: 8,
                  },
                ]}
                onPress={() => {
                  Alert.alert(
                    'Phase 1 Store Acceptance Required',
                    'Please complete Phase 1 first. Store approval will post the Tally Stock Journal voucher and enable barcode assignment.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Start Phase 1 Now',
                        onPress: () => handleOpenActionModal(item, 'approve', 'Phase 1: Accept Split & Tally Stock Journal', 1),
                      },
                    ]
                  );
                }}
              >
                <QrCode size={13} color="#94a3b8" />
                <Text style={[styles.miniBtnText, { color: '#64748b' }]}>Phase 2: Barcode</Text>
              </TouchableOpacity>
            )}

            {/* Reject Button (Only visible before Phase 1 is completed) */}
            {!isPhase1Done && (
              <TouchableOpacity
                style={[styles.miniBtn, { backgroundColor: '#dc2626' }]}
                onPress={() => handleOpenActionModal(item, 'reject', 'Reject Split Request')}
              >
                <XCircle size={13} color="#ffffff" />
                <Text style={styles.miniBtnText}>Reject</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      }
    }

    // 4. RETURN REQUESTS
    if (cardType === 'return') {
      const isStoreUser = isStore || isSuperOrCompanyAdmin;
      const isPending = ['pending', 'handler_assigned', 'initiated', 'collected', 'store_received', 'submitted'].includes(String(item.status || '').toLowerCase().trim());

      if (isPending && isStoreUser) {
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
          </View>
        );
      }

      return null;
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
      const isStoreApprover = isAssignedStoreUser(currentUser, item);
      if (item.status === 'pending') {
        const mgtApproverId = String(typeof item.managementApprover === 'object' ? (item.managementApprover?._id || item.managementApprover?.id || '') : (item.managementApprover || ''));
        const isAssignedMgt = userId && mgtApproverId && (userId === mgtApproverId);

        const tlObj = item.teamLead;
        const tlApproverId = String(typeof tlObj === 'object' ? (tlObj?._id || tlObj?.id || '') : (tlObj || ''));
        const tlApproverName = String(typeof tlObj === 'object' ? (tlObj?.name || tlObj?.fullName || '') : '').toLowerCase().trim();
        const tlApproverEmpId = String(typeof tlObj === 'object' ? (tlObj?.employeeId || tlObj?.employeeIdCode || '') : '').toUpperCase().trim();

        const isAssignedTL = Boolean(
          (userId && tlApproverId && userId === tlApproverId) ||
          (userEmpId && tlApproverEmpId && userEmpId === tlApproverEmpId) ||
          (currentUserName && tlApproverName && currentUserName === tlApproverName) ||
          (item.requester && (String(item.requester.reportsTo?._id || item.requester.reportsTo || item.requester.reportingTo?._id || item.requester.reportingTo || '') === userId))
        );

        const reqDept = String(typeof item.requester === 'object' ? (item.requester?.department?.name || item.requester?.department?._id || item.requester?.department || '') : (item.requester?.department || '')).toLowerCase().trim();
        const myDept = String(currentUser?.department?.name || currentUser?.department?._id || currentUser?.department || currentUser?.user?.department?.name || currentUser?.user?.department?._id || currentUser?.user?.department || '').toLowerCase().trim();
        const isSameDept = Boolean(reqDept && myDept && reqDept === myDept);
        const canTLApprove = (item.documentType === 'DC Internal' && (isAssignedTL || ((isTL || currentUserName.includes('prathmesh')) && (isSameDept || !reqDept || !myDept)) || isSuperOrCompanyAdmin) && !isMgt);
        const canMgtApprove = (['DC FOC', 'Invoice'].includes(item.documentType) && (isAssignedMgt || (isMgt && !mgtApproverId)));
        const canApprovePending = canTLApprove || canMgtApprove;
        if (canApprovePending) {
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
      } else if (item.status === 'pending_accounts_approval') {
        if (isAcc && !isMgt) {
          return (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity
                style={[styles.miniBtn, { backgroundColor: '#16a34a' }]}
                onPress={() => handleOpenActionModal(item, 'approve', 'Accounts Approve')}
              >
                <CheckCircle2 size={14} color="#ffffff" />
                <Text style={styles.miniBtnText}>Accounts Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.miniBtn, { backgroundColor: '#dc2626' }]}
                onPress={() => handleOpenActionModal(item, 'reject', 'Accounts Reject')}
              >
                <XCircle size={14} color="#ffffff" />
                <Text style={styles.miniBtnText}>Reject</Text>
              </TouchableOpacity>
            </View>
          );
        }
      } else if (item.status === 'pending_store_acceptance') {
        if (isStoreApprover && !isMgt) {
          return (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity
                style={[styles.miniBtn, { backgroundColor: '#2563eb' }]}
                onPress={() => handleOpenActionModal(item, 'approve', 'Store Physical Acceptance')}
              >
                <CheckCircle2 size={14} color="#ffffff" />
                <Text style={styles.miniBtnText}>Store Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.miniBtn, { backgroundColor: '#dc2626' }]}
                onPress={() => handleOpenActionModal(item, 'reject', 'Store Physical Reject')}
              >
                <XCircle size={14} color="#ffffff" />
                <Text style={styles.miniBtnText}>Reject</Text>
              </TouchableOpacity>
            </View>
          );
        }
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
                    cardType === 'return' ? (item.isBulkGroup && item.barcodes && item.barcodes.length > 1 ? `Bulk Return Request (${item.barcodes.length} Items)` : `Return Voucher #${item.barcode || item._id}`) :
                      cardType === 'conversion' ? `Conversion #${item.barcode}` :
                        cardType === 'exchange' ? `Exchange #${item.oldBarcode}` :
                          `Merge #${item.transactionId || item.selectedParentBarcode || 'LOT'}`}
            </Text>
          </View>

          <StatusBadge status={item.status} />
        </View>

        <View style={styles.divider} />

        <View style={styles.cardBody}>
          {cardType === 'return' && item.isBulkGroup && item.barcodes && item.barcodes.length > 1 ? (
            <View style={{ marginBottom: 4 }}>
              <Text style={styles.bodyTextMain}>
                {item.barcodes.length} Return Items in Batch:
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4, marginBottom: 4 }}>
                {item.barcodes.map((bc, bIdx) => (
                  <View key={bIdx} style={{ backgroundColor: '#fee2e2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#fca5a5' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#b91c1c' }}>{bc}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <Text style={styles.bodyTextMain}>
              {item.materialName || (item.materials && item.materials[0]?.name) || item.requestedMaterialName || 'Material Items'}
            </Text>
          )}

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

          {/* Handler Rejection Alert for Store User */}
          {(() => {
            const hasDeclined = item.handlerRejected === true ||
              item.handlerStatus === 'declined' ||
              item.handlerStatus === 'rejected' ||
              (item.timeline && item.timeline.some(t => (t.action || '').toLowerCase().includes('handler declined')));
            if (hasDeclined && isAssignedStoreUser(currentUser, item)) {
              const declineEntry = item.timeline?.slice().reverse().find(t => (t.action || '').toLowerCase().includes('handler declined'));
              return (
                <View style={{ backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 8, padding: 8, marginTop: 6, marginBottom: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#b45309' }}>
                    ⚠️ Handler Declined Dispatch: Request Returned to Store
                  </Text>
                  {declineEntry?.description ? (
                    <Text style={{ fontSize: 10, color: '#92400e', marginTop: 2 }}>
                      {declineEntry.description}
                    </Text>
                  ) : null}
                  <Text style={{ fontSize: 10, color: '#b45309', fontWeight: '600', marginTop: 3 }}>
                    Please select: 1. Direct to Requester or 2. Assign New Handler.
                  </Text>
                </View>
              );
            }
            return null;
          })()}

          {/* Split Two-Phase Notice Banner on Card */}
          {cardType === 'split' && (
            <View style={{
              backgroundColor: item.status === 'store_accepted' ? '#f5f3ff' : '#f0fdf4',
              borderWidth: 1,
              borderColor: item.status === 'store_accepted' ? '#c4b5fd' : '#bbf7d0',
              borderRadius: 8,
              padding: 9,
              marginTop: 6,
              marginBottom: 4,
              gap: 3,
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: item.status === 'store_accepted' ? '#6d28d9' : '#15803d' }}>
                  {item.status === 'store_accepted' ? 'Split Step 2: Barcode Tagging Required' : 'Split Step 1: Store Approval & Tally Journal'}
                </Text>
                <View style={{
                  backgroundColor: item.status === 'store_accepted' ? '#7c3aed' : '#16a34a',
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 4,
                }}>
                  <Text style={{ color: '#ffffff', fontSize: 9, fontWeight: '800' }}>
                    {item.status === 'store_accepted' ? 'PHASE 2 READY' : 'PHASE 1 PENDING'}
                  </Text>
                </View>
              </View>
              {item.status === 'store_accepted' ? (
                <>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#4c1d95' }}>
                    Tally Voucher: <Text style={{ fontFamily: 'monospace', fontWeight: '800' }}>{item.tallyVoucherNumber || 'Generated'}</Text>
                  </Text>
                  <Text style={{ fontSize: 10, color: '#6d28d9' }}>
                    Physical barcode label printed. Tap "Phase 2: Scan Barcode" to activate child lot.
                  </Text>
                </>
              ) : (
                <Text style={{ fontSize: 10, color: '#166534' }}>
                  Tap "Phase 1: Approve Split" to post Tally Stock Journal voucher and advance to barcode tagging.
                </Text>
              )}
            </View>
          )}

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

            {/* Split Approval 2-Phase Workflow */}
            {modalItem?._cardType === 'split' && modalActionType === 'approve' && (
              <View style={{ gap: 12 }}>
                {splitPhase === 1 ? (
                  /* Phase 1: Confirmation Box */
                  <View style={{ gap: 10 }}>
                    <View style={{ backgroundColor: '#f0fdf4', borderWidth: 1.5, borderColor: '#86efac', borderRadius: 10, padding: 12, gap: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <CheckCircle2 size={16} color="#16a34a" />
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#166534', letterSpacing: 0.5 }}>
                          PHASE 1: ACCEPT SPLIT & GENERATE TALLY STOCK JOURNAL
                        </Text>
                      </View>
                      {modalItem.status === 'store_accepted' ? (
                        <View style={{ backgroundColor: '#ecfdf5', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#a7f3d0', gap: 6 }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#065f46' }}>
                            ✓ Split Request Already Accepted by Store
                          </Text>
                          <Text style={{ fontSize: 11, color: '#047857' }}>
                            Tally Autofill Stock Journal: <Text style={{ fontWeight: '800', fontFamily: 'monospace' }}>{modalItem.tallyVoucherNumber || splitTallyVoucherNumber || 'Posted'}</Text>
                          </Text>
                          <TouchableOpacity
                            style={{ backgroundColor: '#7c3aed', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, alignItems: 'center', marginTop: 4 }}
                            onPress={() => {
                              setSplitPhase(2);
                              setModalTitle('Phase 2: Barcode Assignment');
                            }}
                          >
                            <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '800' }}>Proceed to Phase 2 (Scan Barcode) ➔</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <>
                          <Text style={{ fontSize: 12, color: '#334155', lineHeight: 17 }}>
                            Accepting this split request will automatically post an <Text style={{ fontWeight: '700', color: '#166534' }}>Autofill Stock Journal</Text> voucher in Tally Prime:
                          </Text>
                          <View style={{ backgroundColor: '#ffffff', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#dcfce7', gap: 4 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                              <Text style={{ fontSize: 11, color: '#64748b' }}>Outward (Consumption):</Text>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#0f172a' }}>
                                Deduct {modalItem.newQuantity || 1} {modalItem.unit || 'Nos'} from parent {modalItem.barcode}
                              </Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                              <Text style={{ fontSize: 11, color: '#64748b' }}>Inward (Production):</Text>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#4f46e5' }}>
                                Allocated to {typeof modalItem.requester === 'object' ? (modalItem.requester.fullName || modalItem.requester.name) : 'Requester'} Godown
                              </Text>
                            </View>
                          </View>
                          <Text style={{ fontSize: 11, color: '#16a34a', fontWeight: '600' }}>
                            ✦ Once accepted, Phase 2 will open immediately to scan the printed barcode sticker.
                          </Text>
                        </>
                      )}
                    </View>

                    {/* Phase 1 Remarks */}
                    <View style={{ gap: 4 }}>
                      <Text style={styles.fieldLabel}>STORE ACCEPTANCE REMARK (OPTIONAL)</Text>
                      <TextInput
                        style={styles.modalTextArea}
                        multiline
                        numberOfLines={2}
                        placeholder="Optional notes for Phase 1 acceptance..."
                        placeholderTextColor="#94a3b8"
                        value={actionRemarks}
                        onChangeText={setActionRemarks}
                      />
                    </View>
                  </View>
                ) : (
                  /* Phase 2: Barcode Assignment & Activation */
                  <View style={{ gap: 12 }}>
                    <View style={{ backgroundColor: '#f5f3ff', borderWidth: 1.5, borderColor: '#c4b5fd', borderRadius: 10, padding: 12, gap: 4 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#6d28d9', letterSpacing: 0.5 }}>
                          PHASE 2: BARCODE ASSIGNMENT
                        </Text>
                        <View style={{ backgroundColor: '#7c3aed', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                          <Text style={{ color: '#ffffff', fontSize: 10, fontWeight: '800' }}>SCAN REQUIRED</Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#4c1d95', marginTop: 2 }}>
                        Phase 2: Barcode Scan Required • Tally Voucher: <Text style={{ fontFamily: 'monospace', fontWeight: '800' }}>{splitTallyVoucherNumber || modalItem.tallyVoucherNumber || 'Posted'}</Text>
                      </Text>
                      <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                        Parent Barcode: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{modalItem.barcode}</Text> • Split Qty: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{modalItem.newQuantity || 1} {modalItem.unit || 'Nos'}</Text>
                      </Text>
                    </View>

                    {/* Multi-Child Barcode Scan & Entry Cards */}
                    {(() => {
                      const childList = getSplitChildItems(modalItem);
                      return (
                        <View style={{ gap: 10 }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#334155' }}>
                            ASSIGN BARCODES ({childList.length} Child {childList.length > 1 ? 'Items' : 'Item'}) *
                          </Text>
                          {childList.map((child, idx) => {
                            const currentVal = childScannedBarcodes[idx] !== undefined
                              ? childScannedBarcodes[idx]
                              : (idx === 0 ? actionNewBarcode : '');
                            return (
                              <View
                                key={idx}
                                style={{
                                  backgroundColor: '#ffffff',
                                  borderWidth: 1.5,
                                  borderColor: currentVal ? '#a78bfa' : '#e2e8f0',
                                  borderRadius: 10,
                                  padding: 10,
                                  gap: 6,
                                }}
                              >
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <View style={{ flex: 1, marginRight: 8 }}>
                                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#1e1b4b' }} numberOfLines={1}>
                                      #{idx + 1}. {child.materialName}
                                    </Text>
                                    <Text style={{ fontSize: 11, color: '#64748b' }}>
                                      Qty: {child.quantity || 1} {child.unit || modalItem.unit || 'Nos'}
                                    </Text>
                                  </View>
                                  <TouchableOpacity
                                    style={{
                                      flexDirection: 'row',
                                      alignItems: 'center',
                                      gap: 4,
                                      backgroundColor: '#7c3aed',
                                      paddingHorizontal: 10,
                                      paddingVertical: 5,
                                      borderRadius: 6,
                                    }}
                                    onPress={() => {
                                      setActiveScanningChildIndex(idx);
                                      setScannerVisible(true);
                                    }}
                                  >
                                    <QrCode size={13} color="#ffffff" />
                                    <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '800' }}>Camera Scan</Text>
                                  </TouchableOpacity>
                                </View>

                                <View style={{ position: 'relative' }}>
                                  <TextInput
                                    style={[
                                      styles.modalInput,
                                      {
                                        fontSize: 14,
                                        fontWeight: '800',
                                        fontFamily: 'monospace',
                                        color: '#1e1b4b',
                                        paddingRight: 36,
                                        backgroundColor: '#f8fafc',
                                      },
                                    ]}
                                    placeholder={`Barcode for ${child.materialName}`}
                                    placeholderTextColor="#94a3b8"
                                    value={currentVal}
                                    onChangeText={(t) => {
                                      const upper = t.toUpperCase();
                                      setChildScannedBarcodes((prev) => ({
                                        ...prev,
                                        [idx]: upper,
                                      }));
                                      if (idx === 0) {
                                        setActionNewBarcode(upper);
                                      }
                                    }}
                                    autoCapitalize="characters"
                                  />
                                  {Boolean(currentVal) && (
                                    <TouchableOpacity
                                      style={{ position: 'absolute', right: 10, top: 10, padding: 4 }}
                                      onPress={() => {
                                        setChildScannedBarcodes((prev) => ({
                                          ...prev,
                                          [idx]: '',
                                        }));
                                        if (idx === 0) {
                                          setActionNewBarcode('');
                                        }
                                      }}
                                    >
                                      <X size={16} color="#94a3b8" />
                                    </TouchableOpacity>
                                  )}
                                </View>
                              </View>
                            );
                          })}
                          <Text style={{ fontSize: 11, color: '#64748b' }}>
                            Store Admin can scan each child barcode sticker with camera or hardware scanner, or type manually.
                          </Text>
                        </View>
                      );
                    })()}

                    {/* Phase 2 Remarks */}
                    <View style={{ gap: 4 }}>
                      <Text style={styles.fieldLabel}>STORE REMARKS (OPTIONAL)</Text>
                      <TextInput
                        style={styles.modalTextArea}
                        multiline
                        numberOfLines={2}
                        placeholder="Enter any optional remarks..."
                        placeholderTextColor="#94a3b8"
                        value={actionRemarks}
                        onChangeText={setActionRemarks}
                      />
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Exchange Approval Inputs */}
            {modalItem?._cardType === 'exchange' && modalActionType === 'approve' && (
              modalItem?.newBarcode ? (
                <View style={{ backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 8, padding: 12, gap: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#166534', letterSpacing: 0.5 }}>REPLACEMENT BARCODE (SCANNED BY REQUESTER)</Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#15803d' }}>{modalItem.newBarcode}</Text>
                  <Text style={{ fontSize: 11, color: '#16a34a', marginTop: 2 }}>
                    This scanned barcode will be used for the transaction & Tally voucher. No new voucher required.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  <Text style={styles.fieldLabel}>REPLACEMENT BARCODE SERIAL ID (SCAN ONLY) *</Text>
                  {actionNewBarcode ? (
                    <View style={{ backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 8, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#166534' }}>Scanned Replacement Barcode:</Text>
                        <Text style={{ fontSize: 17, fontWeight: '800', color: '#15803d' }}>{actionNewBarcode}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => setScannerVisible(true)}
                        style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#16a34a', borderRadius: 6 }}
                      >
                        <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '700' }}>Re-scan</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => setScannerVisible(true)}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 8 }}
                      activeOpacity={0.8}
                    >
                      <QrCode size={18} color="#ffffff" />
                      <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 13 }}>Scan Replacement Barcode</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )
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

            {/* Store Direct Dispatch Info */}
            {modalActionType === 'store-direct-dispatch' && (
              <View style={{ backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 8, padding: 10, marginBottom: 6 }}>
                <Text style={{ fontSize: 12, color: '#1e40af', fontWeight: '600', lineHeight: 17 }}>
                  This will dispatch the material directly to the requester without a handler. The requester will be notified to inspect and receive the material.
                </Text>
              </View>
            )}

            {/* Handler Assignment Inputs (Transfer Job, Assign Return Handler, Store Assign Handler) */}
            {['assign-return-handler', 'handler-transfer', 'store-assign-handler'].includes(modalActionType) && (
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

            {/* Generic Remarks Field (Only for non-split approvals or rejections) */}
            {!(modalItem?._cardType === 'split' && modalActionType === 'approve') && (
              <>
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
              </>
            )}

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
                  modalActionType.includes('reject')
                    ? { backgroundColor: '#dc2626' }
                    : (modalItem?._cardType === 'split' && splitPhase === 2 ? { backgroundColor: '#7c3aed' } : { backgroundColor: '#16a34a' }),
                ]}
                onPress={handleExecuteModalAction}
                disabled={
                  actionSubmitting ||
                  (modalItem?._cardType === 'split' && modalActionType === 'approve' && splitPhase === 2 && (
                    (() => {
                      const childList = getSplitChildItems(modalItem);
                      if (!childList.length) return !actionNewBarcode.trim();
                      return childList.some((_, i) => !(childScannedBarcodes[i] || (i === 0 ? actionNewBarcode : ''))?.trim());
                    })()
                  ))
                }
              >
                {actionSubmitting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.confirmModalBtnText}>
                    {modalActionType.includes('reject')
                      ? 'Confirm Rejection'
                      : modalItem?._cardType === 'split'
                        ? (splitPhase === 1 ? 'Accept & Generate Tally Stock Journal' : 'Complete Split & Activate Barcodes')
                        : 'Confirm Action'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Comprehensive Request Details Modal */}
      <Modal
        visible={returnDetailModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setReturnDetailModalVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
          <View style={styles.modalHeaderStyle}>
            <TouchableOpacity onPress={() => setReturnDetailModalVisible(false)} style={{ padding: 4 }}>
              <X size={22} color="#0f172a" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.modalTitle}>Request Details</Text>
              <Text style={styles.modalSubtitle} numberOfLines={1}>
                {selectedReturnItem?._cardType === 'material' ? `Material Request #${selectedReturnItem?.transactionId || selectedReturnItem?._id}` :
                  selectedReturnItem?._cardType === 'transfer' ? `Custody Transfer #${selectedReturnItem?.barcode || selectedReturnItem?._id}` :
                    selectedReturnItem?._cardType === 'split' ? `Split Lot Request #${selectedReturnItem?.barcode}` :
                      selectedReturnItem?._cardType === 'return' ? `Material Return #${selectedReturnItem?.barcode || selectedReturnItem?._id}` :
                        selectedReturnItem?._cardType === 'conversion' ? `Conversion #${selectedReturnItem?.barcode}` :
                          selectedReturnItem?._cardType === 'exchange' ? `Exchange #${selectedReturnItem?.oldBarcode}` :
                            `Merge Lot Request #${selectedReturnItem?.transactionId || selectedReturnItem?.selectedParentBarcode || 'LOT'}`}
              </Text>
            </View>
            {selectedReturnItem && <StatusBadge status={getReturnCardStatus(selectedReturnItem)} />}
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            {/* Rejection Alert Banner if request was rejected */}
            {Boolean(selectedReturnItem && String(selectedReturnItem.status || '').toLowerCase().includes('reject')) && (
              <View style={styles.rejectionBanner}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={18} color="#dc2626" />
                  <Text style={styles.rejectionBannerTitle}>REQUEST REJECTED</Text>
                </View>
                <Text style={styles.rejectionBannerText}>
                  Reason: {selectedReturnItem?.rejectionReason || selectedReturnItem?.reason || 'No specific rejection reason recorded.'}
                </Text>
                {selectedReturnItem?.rejectedBy && (
                  <Text style={{ fontSize: 11, color: '#b91c1c', marginTop: 2 }}>
                    Rejected By: {typeof selectedReturnItem.rejectedBy === 'object' ? (selectedReturnItem.rejectedBy.fullName || selectedReturnItem.rejectedBy.name) : selectedReturnItem.rejectedBy}
                  </Text>
                )}
                {selectedReturnItem?.rejectedAt && (
                  <Text style={{ fontSize: 11, color: '#b91c1c' }}>
                    Rejected On: {formatDateTime(selectedReturnItem.rejectedAt)}
                  </Text>
                )}
              </View>
            )}

            {/* Section 1: From Who User Requests */}
            {(() => {
              const empInfo = getResolvedEmployee(selectedReturnItem);
              const resolvedApprovedAt = selectedReturnItem?.approvedAt || (selectedReturnItem?.approvalChain && selectedReturnItem?.approvalChain.find(a => a.action === 'approved')?.timestamp);

              return (
                <>
                  <View style={styles.modalSectionCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <User size={16} color="#2563eb" />
                      <Text style={styles.modalSectionTitle}>Requester / Applicant Information</Text>
                    </View>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Initiated By:</Text>
                      <Text style={styles.detailValueBold}>{empInfo.name}</Text>
                    </View>

                    {empInfo.employeeId ? (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Employee ID:</Text>
                        <Text style={styles.detailValueBold}>{empInfo.employeeId}</Text>
                      </View>
                    ) : null}

                    {empInfo.department ? (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Department:</Text>
                        <Text style={[styles.detailValueBold, { color: '#0f172a' }]}>{empInfo.department}</Text>
                      </View>
                    ) : null}

                    {empInfo.role ? (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Designation / Role:</Text>
                        <Text style={styles.detailValue}>{empInfo.role}</Text>
                      </View>
                    ) : null}

                    {/* If Transfer: Target Recipient Employee */}
                    {selectedReturnItem?._cardType === 'transfer' && selectedReturnItem?.toUser && (
                      <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                        <Text style={[styles.detailLabel, { color: '#4f46e5', fontWeight: '700', marginBottom: 4 }]}>Target Recipient Employee:</Text>
                        <Text style={styles.detailValueBold}>
                          {typeof selectedReturnItem.toUser === 'object' ? (selectedReturnItem.toUser.fullName || selectedReturnItem.toUser.name) : selectedReturnItem.toUser}
                        </Text>
                      </View>
                    )}

                    {/* If Handler assigned */}
                    {((selectedReturnItem?.handler || selectedReturnItem?.returnHandler) && selectedReturnItem?.returnMethod !== 'direct') ? (
                      <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                        <Text style={[styles.detailLabel, { color: '#2563eb', fontWeight: '700', marginBottom: 4 }]}>Logistics Transporter Handler:</Text>
                        <Text style={styles.detailValueBold}>
                          {typeof (selectedReturnItem.handler || selectedReturnItem.returnHandler) === 'object'
                            ? ((selectedReturnItem.handler || selectedReturnItem.returnHandler).fullName || (selectedReturnItem.handler || selectedReturnItem.returnHandler).name)
                            : (selectedReturnItem.handler || selectedReturnItem.returnHandler)}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Section 2: Actual Date and Time of Request */}
                  <View style={styles.modalSectionCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Calendar size={16} color="#059669" />
                      <Text style={styles.modalSectionTitle}>Date & Timestamp Records</Text>
                    </View>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Actual Request Date & Time:</Text>
                      <Text style={[styles.detailValueBold, { color: '#0f172a' }]}>{formatDateTime(selectedReturnItem?.createdAt)}</Text>
                    </View>

                    {resolvedApprovedAt ? (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Approved Date & Time:</Text>
                        <Text style={[styles.detailValueBold, { color: '#16a34a' }]}>{formatDateTime(resolvedApprovedAt)}</Text>
                      </View>
                    ) : null}

                    {selectedReturnItem?.rejectedAt ? (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Rejected Date & Time:</Text>
                        <Text style={[styles.detailValueBold, { color: '#dc2626' }]}>{formatDateTime(selectedReturnItem?.rejectedAt)}</Text>
                      </View>
                    ) : null}

                    {(selectedReturnItem?.dueDate || selectedReturnItem?.expectedReturnDate) ? (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Expected Return Due Date:</Text>
                        <Text style={[styles.detailValueBold, { color: '#d97706' }]}>{selectedReturnItem.dueDate || selectedReturnItem.expectedReturnDate}</Text>
                      </View>
                    ) : null}
                  </View>
                </>
              );
            })()}

            {/* Section 3: Reason & Remarks */}
            <View style={styles.modalSectionCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <FileText size={16} color="#475569" />
                <Text style={styles.modalSectionTitle}>Purpose & Remarks</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Request Purpose / Reason:</Text>
              </View>
              <Text style={{ fontSize: 13, color: '#1e293b', fontStyle: 'italic', backgroundColor: '#f8fafc', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', marginTop: 2 }}>
                "{selectedReturnItem?.reason || selectedReturnItem?.description || selectedReturnItem?.remarks || selectedReturnItem?.warrantyReason || 'Standard Material Movement Request'}"
              </Text>
            </View>

            {/* Section 4: Barcode Information */}
            <View style={styles.modalSectionCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Package size={16} color="#7c3aed" />
                <Text style={styles.modalSectionTitle}>Barcode & Material Information</Text>
              </View>

              {/* Material Request: Multi-material breakdown */}
              {selectedReturnItem?._cardType === 'material' && selectedReturnItem?.materials && (
                <View style={{ gap: 8 }}>
                  {selectedReturnItem.materials.map((mat, mIdx) => (
                    <View key={mIdx} style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#e2e8f0', gap: 4 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#0f172a', flex: 1 }}>{mat.name || mat.materialName || `Item #${mIdx + 1}`}</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#2563eb' }}>{mat.quantity || mat.qty || 1} {mat.unit || 'Nos'}</Text>
                      </View>
                      {mat.barcodes && mat.barcodes.length > 0 ? (
                        <View style={{ marginTop: 4 }}>
                          <Text style={{ fontSize: 11, color: '#64748b', fontWeight: '600', marginBottom: 4 }}>Assigned Barcode(s):</Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                            {mat.barcodes.map((bObj, bIdx) => {
                              const bCode = typeof bObj === 'object' ? bObj.barcode : bObj;
                              const bStatus = typeof bObj === 'object' ? bObj.status : 'Active';
                              return (
                                <View key={bIdx} style={styles.barcodeTag}>
                                  <Text style={styles.barcodeTagText}>{bCode}</Text>
                                  {bStatus && <Text style={{ fontSize: 9, color: '#64748b' }}>({bStatus})</Text>}
                                </View>
                              );
                            })}
                          </View>
                        </View>
                      ) : (
                        <Text style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', marginTop: 2 }}>Pending store barcode assignment</Text>
                      )}
                    </View>
                  ))}
                </View>
              )}

              {/* Transfer Barcode */}
              {selectedReturnItem?._cardType === 'transfer' && (
                <View style={{ gap: 6 }}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Barcode Number:</Text>
                    <Text style={[styles.detailValueBold, { color: '#1d4ed8' }]}>{selectedReturnItem.barcode}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Material Condition:</Text>
                    <Text style={styles.detailValueBold}>{(selectedReturnItem.materialCondition || selectedReturnItem.condition || 'good').toUpperCase()}</Text>
                  </View>
                </View>
              )}

              {/* Split Barcode */}
              {selectedReturnItem?._cardType === 'split' && (
                <View style={{ gap: 6 }}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Original Lot Barcode:</Text>
                    <Text style={[styles.detailValueBold, { color: '#64748b' }]}>{selectedReturnItem.barcode}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Split Quantity:</Text>
                    <Text style={styles.detailValueBold}>{selectedReturnItem.newQuantity} {selectedReturnItem.unit || 'Nos'}</Text>
                  </View>
                  {selectedReturnItem.status === 'approved' && selectedReturnItem.newBarcode ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>New Serial Barcode:</Text>
                      <Text style={[styles.detailValueBold, { color: '#16a34a', fontSize: 14 }]}>{selectedReturnItem.newBarcode}</Text>
                    </View>
                  ) : selectedReturnItem.status === 'store_accepted' ? (
                    <>
                      {selectedReturnItem.tallyVoucherNumber ? (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Tally Stock Journal:</Text>
                          <Text style={[styles.detailValueBold, { color: '#4f46e5' }]}>{selectedReturnItem.tallyVoucherNumber}</Text>
                        </View>
                      ) : null}
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Child Barcode:</Text>
                        <Text style={[styles.detailValueBold, { color: '#d97706' }]}>Phase 2: Awaiting Physical Barcode Scan</Text>
                      </View>
                      <TouchableOpacity
                        style={{
                          backgroundColor: '#f5f3ff',
                          borderColor: '#7c3aed',
                          borderWidth: 1.5,
                          borderRadius: 8,
                          padding: 10,
                          marginTop: 6,
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                        onPress={() => {
                          const targetItem = selectedReturnItem;
                          setReturnDetailModalVisible(false);
                          handleOpenActionModal(targetItem, 'approve', 'Phase 2: Complete Split & Scan Barcode', 2);
                        }}
                      >
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={{ fontSize: 11, fontWeight: '800', color: '#6d28d9' }}>
                            PHASE 2: BARCODE ASSIGNMENT PENDING
                          </Text>
                          <Text style={{ fontSize: 11, color: '#4c1d95', marginTop: 2 }}>
                            Tap here to scan child barcode stickers
                          </Text>
                        </View>
                        <View style={{ backgroundColor: '#7c3aed', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}>
                          <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '800' }}>Reopen Phase 2 ➔</Text>
                        </View>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Child Barcode:</Text>
                      <Text style={[styles.detailValueBold, { color: '#64748b' }]}>Phase 1: Awaiting Store Acceptance</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Return Barcode(s) */}
              {selectedReturnItem?._cardType === 'return' && (
                <View style={{ gap: 6 }}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Return Barcode(s):</Text>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {(selectedReturnItem.barcodes || (selectedReturnItem.barcode ? [selectedReturnItem.barcode] : [])).map((bCode, bIndex) => (
                      <View key={bIndex} style={{ backgroundColor: '#fee2e2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#fca5a5' }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#b91c1c' }}>{bCode}</Text>
                      </View>
                    ))}
                  </View>
                  {selectedReturnItem.condition && (
                    <View style={[styles.detailRow, { marginTop: 4 }]}>
                      <Text style={styles.detailLabel}>Physical Condition:</Text>
                      <Text style={styles.detailValueBold}>{(selectedReturnItem.condition).toUpperCase()}</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Exchange Barcode */}
              {selectedReturnItem?._cardType === 'exchange' && (
                <View style={{ gap: 6 }}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Defective / Old Barcode:</Text>
                    <Text style={[styles.detailValueBold, { color: '#dc2626' }]}>{selectedReturnItem.oldBarcode}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>New Replacement Barcode:</Text>
                    <Text style={[styles.detailValueBold, { color: '#16a34a' }]}>{selectedReturnItem.newBarcode || 'Pending Exchange'}</Text>
                  </View>
                </View>
              )}

              {/* Merge Barcode */}
              {selectedReturnItem?._cardType === 'merge' && (
                <View style={{ gap: 6 }}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Target Parent Barcode:</Text>
                    <Text style={[styles.detailValueBold, { color: '#0284c7' }]}>{selectedReturnItem.selectedParentBarcode}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Merged Child Barcodes:</Text>
                    <Text style={styles.detailValue}>{(selectedReturnItem.mergedBarcodes || []).join(', ') || 'N/A'}</Text>
                  </View>
                </View>
              )}

              {/* Conversion Barcode */}
              {selectedReturnItem?._cardType === 'conversion' && (
                <View style={{ gap: 6 }}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Barcode Number:</Text>
                    <Text style={[styles.detailValueBold, { color: '#059669' }]}>{selectedReturnItem.barcode}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Target Document Type:</Text>
                    <Text style={styles.detailValueBold}>{selectedReturnItem.documentType || 'Conversion'}</Text>
                  </View>
                </View>
              )}
            </View>

            {/* Section 5: Photo Evidence Gallery */}
            {(() => {
              const photosList = [];
              if (Array.isArray(selectedReturnItem?.photos)) {
                selectedReturnItem.photos.forEach(p => {
                  const u = typeof p === 'string' ? p : p?.url;
                  if (u && !photosList.includes(u)) photosList.push(u);
                });
              }
              if (selectedReturnItem?.photo && typeof selectedReturnItem.photo === 'string') {
                if (!photosList.includes(selectedReturnItem.photo)) photosList.push(selectedReturnItem.photo);
              }
              if (Array.isArray(selectedReturnItem?.materialsList)) {
                selectedReturnItem.materialsList.forEach(m => {
                  (m.photos || []).forEach(p => {
                    const u = typeof p === 'string' ? p : p?.url;
                    if (u && !photosList.includes(u)) photosList.push(u);
                  });
                });
              }
              if (Array.isArray(selectedReturnItem?.materials)) {
                selectedReturnItem.materials.forEach(m => {
                  (m.barcodes || []).forEach(b => {
                    if (b && Array.isArray(b.photos)) {
                      b.photos.forEach(p => {
                        const u = typeof p === 'string' ? p : p?.url;
                        if (u && !photosList.includes(u)) photosList.push(u);
                      });
                    }
                  });
                });
              }
              if (Array.isArray(selectedReturnItem?.documents)) {
                selectedReturnItem.documents.forEach(d => {
                  const u = typeof d === 'string' ? d : d?.url;
                  if (u && (u.endsWith('.jpg') || u.endsWith('.png') || u.endsWith('.jpeg')) && !photosList.includes(u)) {
                    photosList.push(u);
                  }
                });
              }

              return (
                <View style={styles.modalSectionCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Camera size={16} color="#0284c7" />
                    <Text style={styles.modalSectionTitle}>Captured Photo Evidence ({photosList.length})</Text>
                  </View>
                  {photosList.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginTop: 8 }}>
                      {photosList.map((photoUrl, pIdx) => (
                        <TouchableOpacity key={pIdx} activeOpacity={0.8} onPress={() => setPreviewPhotoUrl(photoUrl)}>
                          <Image
                            source={{ uri: photoUrl }}
                            style={styles.photoThumb}
                          />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  ) : (
                    <Text style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', marginTop: 4 }}>No photos attached for this request.</Text>
                  )}
                </View>
              );
            })()}

            {/* Modal Navigation Actions */}
            <View style={{ gap: 10, marginTop: 10 }}>
              {selectedReturnItem?._cardType === 'material' && selectedReturnItem?.status === 'submitted' && (() => {
                const curId = String(currentUser?._id || currentUser?.id || '');
                const curEmpId = String(currentUser?.employeeId || '');
                const reqId = String(selectedReturnItem.requester?._id || selectedReturnItem.requester?.id || selectedReturnItem.requester || '');
                const reqEmpId = String(selectedReturnItem.requester?.employeeId || '');
                const isOwner = (curId && reqId && curId === reqId) || (curEmpId && reqId && curEmpId === reqId) || (curEmpId && reqEmpId && curEmpId === reqEmpId);
                const isSuper = ['super_admin', 'admin', 'company_admin'].includes(currentUser?.role);
                if (!isOwner && !isSuper) return null;

                return (
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                    <TouchableOpacity
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 10 }}
                      onPress={() => {
                        setReturnDetailModalVisible(false);
                        navigation.navigate('MaterialRequestScreen', { editTransaction: selectedReturnItem });
                      }}
                    >
                      <Edit3 size={15} color="#ffffff" />
                      <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 13 }}>Edit Request</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#dc2626', paddingVertical: 12, borderRadius: 10 }}
                      onPress={() => handleDeleteRequest(selectedReturnItem)}
                    >
                      <Trash2 size={15} color="#ffffff" />
                      <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 13 }}>Delete Request</Text>
                    </TouchableOpacity>
                  </View>
                );
              })()}

              {selectedReturnItem?._cardType === 'return' && statusTab === 'pending' && isAssignedStoreUser(currentUser, selectedReturnItem) && (
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

              {/* Split Action: Both Phase 1 and Phase 2 visible in Detail Modal */}
              {selectedReturnItem?._cardType === 'split' && ['pending', 'submitted', 'initiated', 'store_accepted'].includes(String(selectedReturnItem?.status || '').toLowerCase().trim()) && (() => {
                const role = String(currentUser?.role || currentUser?.user?.role || '').toLowerCase();
                const isSuperOrCompanyAdmin = ['super_admin', 'company_admin', 'admin'].includes(role) || currentUser?.scope === 'GLOBAL';
                const isStore = isAssignedStoreUser(currentUser, selectedReturnItem);
                if (!isStore && !isSuperOrCompanyAdmin) return null;

                const isP2 = String(selectedReturnItem.status || '').toLowerCase().trim() === 'store_accepted';
                return (
                  <View style={{ gap: 8 }}>
                    {isP2 ? (
                      <>
                        <View style={{ backgroundColor: '#f5f3ff', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#ddd6fe' }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#6d28d9' }}>
                            ✓ Phase 1 Completed: Tally Voucher {selectedReturnItem.tallyVoucherNumber || 'Generated'}
                          </Text>
                          <Text style={{ fontSize: 11, color: '#7c3aed', marginTop: 2 }}>
                            Proceed to Phase 2 to scan the printed barcode sticker and finalize custody.
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            backgroundColor: '#7c3aed',
                            borderRadius: 12,
                            paddingVertical: 14,
                          }}
                          onPress={() => {
                            const targetItem = selectedReturnItem;
                            setReturnDetailModalVisible(false);
                            handleOpenActionModal(
                              targetItem,
                              'approve',
                              'Phase 2: Barcode Assignment',
                              2
                            );
                          }}
                        >
                          <QrCode size={18} color="#ffffff" />
                          <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#ffffff' }}>
                            Phase 2: Scan & Assign Barcode ➔
                          </Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        <TouchableOpacity
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            backgroundColor: '#16a34a',
                            borderRadius: 12,
                            paddingVertical: 14,
                          }}
                          onPress={() => {
                            const targetItem = selectedReturnItem;
                            setReturnDetailModalVisible(false);
                            handleOpenActionModal(
                              targetItem,
                              'approve',
                              'Phase 1: Accept Split & Tally Stock Journal',
                              1
                            );
                          }}
                        >
                          <CheckCircle2 size={18} color="#ffffff" />
                          <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#ffffff' }}>
                            Phase 1: Approve Split & Post Stock Journal ➔
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            backgroundColor: '#f1f5f9',
                            borderWidth: 1,
                            borderColor: '#cbd5e1',
                            borderRadius: 12,
                            paddingVertical: 12,
                          }}
                          onPress={() => {
                            Alert.alert(
                              'Phase 1 Required First',
                              'Please complete Phase 1 Store Acceptance first. This will automatically post the Tally Stock Journal voucher before barcode assignment.',
                              [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                  text: 'Start Phase 1 Now',
                                  onPress: () => {
                                    const targetItem = selectedReturnItem;
                                    setReturnDetailModalVisible(false);
                                    handleOpenActionModal(
                                      targetItem,
                                      'approve',
                                      'Phase 1: Accept Split & Tally Stock Journal',
                                      1
                                    );
                                  },
                                },
                              ]
                            );
                          }}
                        >
                          <QrCode size={16} color="#64748b" />
                          <Text style={{ fontSize: 13, fontWeight: '600', color: '#64748b' }}>
                            Phase 2: Assign Barcode (Requires Phase 1)
                          </Text>
                        </TouchableOpacity>
                      </>
                    )}

                    {!isP2 && (
                      <TouchableOpacity
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          backgroundColor: '#dc2626',
                          borderRadius: 10,
                          paddingVertical: 10,
                        }}
                        onPress={() => {
                          const targetItem = selectedReturnItem;
                          setReturnDetailModalVisible(false);
                          handleOpenActionModal(targetItem, 'reject', 'Reject Split Request');
                        }}
                      >
                        <XCircle size={15} color="#ffffff" />
                        <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#ffffff' }}>Reject Split Request</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })()}

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

      {/* Fullscreen Photo Preview Modal */}
      <Modal visible={Boolean(previewPhotoUrl)} transparent animationType="fade" onRequestClose={() => setPreviewPhotoUrl(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 10, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 24 }}
            onPress={() => setPreviewPhotoUrl(null)}
          >
            <X size={24} color="#ffffff" />
          </TouchableOpacity>
          {previewPhotoUrl && (
            <Image
              source={{ uri: previewPhotoUrl }}
              style={{ width: '90%', height: '70%', resizeMode: 'contain' }}
            />
          )}
        </View>
      </Modal>

      {/* Barcode Scanner Modal for Store Approval Scan Only (Top Level) */}
      <BarcodeScannerModal
        visible={scannerVisible}
        onClose={() => {
          setScannerVisible(false);
          setActiveScanningChildIndex(null);
        }}
        onScanSuccess={(code) => {
          if (code) {
            const clean = String(code).trim().toUpperCase();
            if (activeScanningChildIndex !== null && activeScanningChildIndex !== undefined) {
              setChildScannedBarcodes((prev) => ({
                ...prev,
                [activeScanningChildIndex]: clean,
              }));
              if (activeScanningChildIndex === 0) {
                setActionNewBarcode(clean);
              }
              setActiveScanningChildIndex(null);
            } else {
              setActionNewBarcode(clean);
              setChildScannedBarcodes((prev) => ({
                ...prev,
                0: clean,
              }));
            }
          }
          setScannerVisible(false);
        }}
        title={
          modalItem?._cardType === 'split'
            ? activeScanningChildIndex !== null && modalItem
              ? `Scan Barcode: ${getSplitChildItems(modalItem)[activeScanningChildIndex]?.materialName || `Child #${activeScanningChildIndex + 1}`}`
              : 'Scan Split Barcode Sticker'
            : 'Scan Replacement Barcode'
        }
      />

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
  rejectionBanner: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  rejectionBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#b91c1c',
  },
  rejectionBannerText: {
    fontSize: 12,
    color: '#991b1b',
    fontWeight: '600',
    lineHeight: 17,
  },
  barcodeTag: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  barcodeTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  photoThumb: {
    width: 100,
    height: 100,
    borderRadius: 10,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f1f5f9',
  },
});

export default PendingTransactionsScreen;
