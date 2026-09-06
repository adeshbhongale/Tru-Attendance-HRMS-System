import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, Layers, Calendar } from 'lucide-react-native';
import MaterialHeader from '../components/MaterialHeader';
import MaterialModuleFooter from '../components/MaterialModuleFooter';
import materialApi from '../api/materialApi';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'received', label: 'Received' },
  { key: 'partially_returned', label: 'Partially Returned' },
  { key: 'closed', label: 'Closed' },
  { key: 'rejected', label: 'Rejected' },
];

const getStatusBadgeVariant = (status) => {
  const s = (status || '').toLowerCase();
  switch (s) {
    case 'closed':
    case 'completed':
      return { bg: '#dcfce7', text: '#15803d', border: '#bbf7d0', label: 'CLOSED' };
    case 'rejected':
    case 'cancelled':
      return { bg: '#fee2e2', text: '#b91c1c', border: '#fecaca', label: 'REJECTED' };
    case 'partially_returned':
      return { bg: '#fef3c7', text: '#b45309', border: '#fde68a', label: 'PARTIALLY RETURNED' };
    case 'received':
    case 'active':
      return { bg: '#dbeafe', text: '#1d4ed8', border: '#bfdbfe', label: 'RECEIVED' };
    case 'dispatched':
    case 'store_accepted':
    case 'handler_assigned':
      return { bg: '#e0e7ff', text: '#4338ca', border: '#c7d2fe', label: 'DISPATCHED' };
    case 'submitted':
    default:
      return { bg: '#f3e8ff', text: '#6b21a8', border: '#e9d5ff', label: (status || 'SUBMITTED').replace('_', ' ').toUpperCase() };
  }
};

const calculateProgress = (row) => {
  const statusLower = (row.status || '').toLowerCase();
  let progress = 0;

  if (statusLower === 'rejected' || statusLower === 'cancelled') {
    return 100;
  }

  // Workflow progress steps (up to 50%)
  if (['submitted', 'tl_approved', 'mgt_approved', 'store_accepted', 'handler_assigned', 'dispatched', 'received', 'active', 'partially_returned', 'closed', 'completed'].includes(statusLower)) {
    progress += 10;
  }
  if (['tl_approved', 'mgt_approved', 'store_accepted', 'handler_assigned', 'dispatched', 'received', 'active', 'partially_returned', 'closed', 'completed'].includes(statusLower)) {
    progress += 10;
  }
  if (['mgt_approved', 'store_accepted', 'handler_assigned', 'dispatched', 'received', 'active', 'partially_returned', 'closed', 'completed'].includes(statusLower)) {
    progress += 10;
  }
  if (['store_accepted', 'handler_assigned', 'dispatched', 'received', 'active', 'partially_returned', 'closed', 'completed'].includes(statusLower)) {
    progress += 10;
  }
  if (['received', 'active', 'partially_returned', 'closed', 'completed'].includes(statusLower)) {
    progress += 10;
  }

  // Item returns progress (remaining 50%)
  let totalItems = 0;
  if (row.materials && row.materials.length > 0) {
    row.materials.forEach((m) => {
      if (m.barcodes && m.barcodes.length > 0) {
        totalItems += m.barcodes.length;
      } else {
        totalItems += m.quantity || 0;
      }
    });
  }
  if (!totalItems) totalItems = row.totalItems || 0;

  let returnedOrClosed = 0;
  if (row.materials && row.materials.length > 0) {
    row.materials.forEach((m) => {
      if (m.barcodes && m.barcodes.length > 0) {
        m.barcodes.forEach((b) => {
          if (b.status === 'Returned' || b.status === 'Closed') {
            returnedOrClosed++;
          }
        });
      }
    });
  }
  if (!returnedOrClosed) {
    returnedOrClosed = (row.returnedItems || 0) + (row.closedItems || 0);
  }

  if (totalItems > 0) {
    const pctPerItem = 50 / totalItems;
    progress += Math.round(returnedOrClosed * pctPerItem);
  }

  return Math.min(progress, 100);
};

const MaterialListScreen = ({ route, navigation }) => {
  const initialTab = route.params?.tab || 'all';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [usersMap, setUsersMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      let userObj = currentUser;
      if (!userObj) {
        try {
          const userStr = await AsyncStorage.getItem('user');
          if (userStr) {
            userObj = JSON.parse(userStr);
            setCurrentUser(userObj);
          }
        } catch (_) {}
      }

      const role = String(userObj?.role || userObj?.user?.role || '').toLowerCase();
      const userId = String(userObj?._id || userObj?.id || userObj?.user?._id || userObj?.user?.id || '');
      const isTL = role === 'team_lead';

      let statusFilter = '';
      if (activeTab === 'pending') statusFilter = 'submitted';
      else if (activeTab === 'in_progress') statusFilter = 'in_progress';
      else if (activeTab === 'received') statusFilter = 'received';
      else if (activeTab === 'partially_returned') statusFilter = 'partially_returned';
      else if (activeTab === 'closed') statusFilter = 'closed';
      else if (activeTab === 'rejected') statusFilter = 'rejected';

      const [res, usersRes] = await Promise.all([
        materialApi.getTransactions({
          tab: activeTab,
          status: statusFilter,
          search: searchQuery,
        }),
        materialApi.getUsers().catch(() => []),
      ]);

      if (usersRes) {
        const uList = Array.isArray(usersRes.data)
          ? usersRes.data
          : (Array.isArray(usersRes) ? usersRes : (Array.isArray(usersRes.users) ? usersRes.users : []));
        const map = {};
        uList.forEach((u) => {
          const uid = u._id || u.id;
          if (uid) map[String(uid)] = u;
          if (u.employeeId) map[String(u.employeeId)] = u;
          if (u.employeeIdCode) map[String(u.employeeIdCode)] = u;
        });
        setUsersMap((prev) => ({ ...prev, ...map }));
      }

      let data = Array.isArray(res.data?.data)
        ? res.data.data
        : (Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []));

      // Client-side filtering matching TransactionListPage.jsx logic
      if (activeTab === 'pending') {
        data = data.filter((t) => ['submitted', 'tl_approved'].includes(t.status));
      } else if (activeTab === 'in_progress') {
        data = data.filter((t) =>
          ['tl_approved', 'mgt_approved', 'store_accepted', 'handler_assigned', 'dispatched', 'received'].includes(t.status)
        );
      } else if (activeTab === 'received') {
        data = data.filter((t) => ['received', 'active'].includes(t.status));
      } else if (activeTab === 'partially_returned') {
        data = data.filter((t) => t.status === 'partially_returned');
      } else if (activeTab === 'closed') {
        data = data.filter((t) => ['closed', 'completed'].includes(t.status));
      } else if (activeTab === 'rejected') {
        data = data.filter((t) => ['rejected', 'cancelled'].includes(t.status));
      }

      // Enforce comprehensive lifecycle progression and rejection visibility rules:
      data = data.filter((t) => {
        const uRole = String(userObj?.role || userObj?.user?.role || '').toLowerCase();
        const uAdminType = String(userObj?.departmentAdminType || userObj?.adminType || userObj?.user?.departmentAdminType || userObj?.user?.adminType || '').toLowerCase();
        const uId = String(userObj?._id || userObj?.id || userObj?.user?._id || userObj?.user?.id || '');
        const uEmpId = String(userObj?.employeeId || userObj?.empId || userObj?.user?.employeeId || '');

        if (['super_admin', 'superadmin', 'admin', 'company_admin'].includes(uRole) || userObj?.scope === 'GLOBAL') {
          return true;
        }

        const reqId = String(typeof t.requester === 'object' ? (t.requester?._id || t.requester?.id || '') : (t.requester || t.sender || t.createdBy || ''));
        const reqEmpId = String(typeof t.requester === 'object' ? (t.requester?.employeeId || '') : '');
        const tlId = String(typeof t.teamLead === 'object' ? (t.teamLead?._id || t.teamLead?.id || '') : (t.teamLead || ''));
        const tlEmpId = String(typeof t.teamLead === 'object' ? (t.teamLead?.employeeId || '') : '');
        const mgtId = String(typeof t.managementApprover === 'object' ? (t.managementApprover?._id || t.managementApprover?.id || '') : (t.managementApprover || ''));
        const mgtEmpId = String(typeof t.managementApprover === 'object' ? (t.managementApprover?.employeeId || '') : '');
        const storeId = String(typeof t.store === 'object' ? (t.store?._id || t.store?.id || '') : (t.store || ''));
        const storeEmpId = String(typeof t.store === 'object' ? (t.store?.employeeId || '') : '');
        const handlerId = String(typeof t.handler === 'object' ? (t.handler?._id || t.handler?.id || '') : (t.handler || ''));
        const handlerEmpId = String(typeof t.handler === 'object' ? (t.handler?.employeeId || '') : '');
        const toHandlerId = String(typeof t.pendingHandlerTransfer?.toHandler === 'object' ? (t.pendingHandlerTransfer?.toHandler?._id || t.pendingHandlerTransfer?.toHandler?.id || '') : (t.pendingHandlerTransfer?.toHandler || ''));
        const toHandlerEmpId = String(typeof t.pendingHandlerTransfer?.toHandler === 'object' ? (t.pendingHandlerTransfer?.toHandler?.employeeId || '') : '');

        const isRequester = (uId && reqId && uId === reqId) || (uEmpId && reqId && uEmpId === reqId) || (uEmpId && reqEmpId && uEmpId === reqEmpId);
        const isAssignedTL = (uId && tlId && uId === tlId) || (uEmpId && tlId && uEmpId === tlId) || (uEmpId && tlEmpId && uEmpId === tlEmpId);
        const isAssignedMgt = (uId && mgtId && uId === mgtId) || (uEmpId && mgtId && uEmpId === mgtId) || (uEmpId && mgtEmpId && uEmpId === mgtEmpId);
        const isAssignedStore = (uId && storeId && uId === storeId) || (uEmpId && storeId && uEmpId === storeId) || (uEmpId && storeEmpId && uEmpId === storeEmpId);
        const isAssignedHandler = (uId && handlerId && uId === handlerId) || (uEmpId && handlerId && uEmpId === handlerId) || (uEmpId && handlerEmpId && uEmpId === handlerEmpId);
        const isPendingToHandler = Boolean(t.pendingHandlerTransfer?.status === 'pending' && ((uId && toHandlerId && uId === toHandlerId) || (uEmpId && toHandlerId && uEmpId === toHandlerId) || (uEmpId && toHandlerEmpId && uEmpId === toHandlerEmpId)));
        const uRoleCode = String(userObj?.roleCode || userObj?.user?.roleCode || '').toUpperCase();
        const uDept = userObj?.department || userObj?.user?.department;
        const uDeptId = String(typeof uDept === 'object' ? (uDept?._id || uDept?.id || '') : (uDept || ''));
        const uDeptName = String(typeof uDept === 'object' ? (uDept?.name || uDept?.departmentName || '') : '').toLowerCase();
        const uFullName = String(userObj?.fullName || userObj?.name || userObj?.user?.fullName || userObj?.user?.name || '').toLowerCase();

        const tDept = t.department;
        const tDeptId = String(typeof tDept === 'object' ? (tDept?._id || tDept?.id || '') : (tDept || ''));
        const tDeptName = String(typeof tDept === 'object' ? (tDept?.name || tDept?.departmentName || '') : '').toLowerCase();

        const isSameDept = !tDeptId || (uDeptId && tDeptId && uDeptId === tDeptId) ||
          (uDeptName && tDeptName && uDeptName === tDeptName);

        const isTLRole = isAssignedTL || (isSameDept && (uRole === 'team_lead' || uRole === 'tl' || Boolean(userObj?.isTeamLead || userObj?.user?.isTeamLead) || uRoleCode === 'TCTL1' || uRoleCode.includes('TL')));
        const isMgtRole = uRole === 'management' || (uRole === 'department_admin' && (uAdminType === 'management' || !uAdminType)) || isAssignedMgt;
        const isStoreRole = isAssignedStore ||
          ['store', 'store_admin', 'tcstr1', 'store_manager'].includes(uRole) ||
          ['STORE', 'STORE_ADMIN', 'TCSTR1', 'TCST8A', 'TCST5A'].includes(uRoleCode) ||
          uRoleCode.includes('STR') ||
          uDeptName.includes('store') || uDeptName.includes('warehouse') ||
          uFullName.includes('gokul') ||
          (uRole === 'department_admin' && ['store', 'warehouse'].includes(uAdminType));

        // 1. Requester ALWAYS sees each and every transaction
        if (isRequester) {
          return true;
        }

        // 2. Barcode ownership / Transferee Check
        if (t.materials && Array.isArray(t.materials)) {
          for (const mat of t.materials) {
            if (mat.barcodes && Array.isArray(mat.barcodes)) {
              for (const bc of mat.barcodes) {
                const ownerId = String(typeof bc.owner === 'object' ? (bc.owner?._id || bc.owner?.id || '') : (bc.owner || ''));
                if (uId && ownerId && uId === ownerId) return true;
              }
            }
          }
        }

        const status = (t.status || '').toLowerCase();

        // 3. Rejection Scenarios
        if (status === 'rejected' || status === 'cancelled') {
          const hasTLApproval = Array.isArray(t.approvalChain) && t.approvalChain.some(
            (a) => a.role === 'team_lead' && a.action === 'approved'
          );
          const hasMgtApproval = Array.isArray(t.approvalChain) && t.approvalChain.some(
            (a) => (a.role === 'management' || a.role === 'department_admin') && a.action === 'approved'
          );
          const isDeliveryRejection = t.rejectedDeliveryStatus === 'rejected_by_requester' ||
            (Array.isArray(t.timeline) && t.timeline.some((entry) => (entry.action || '').includes('Rejected') && (entry.description || '').toLowerCase().includes('delivery')));

          // Case 3A: Rejected at Delivery / Receipt Stage (Store sent to requester and then rejected)
          // Show all participants in this process (Requester, TL, Management, Store, Handler)
          if (isDeliveryRejection || hasMgtApproval) {
            return isTLRole || isMgtRole || isStoreRole || isAssignedHandler || isPendingToHandler;
          }

          // Case 3B: Rejected by Management (TL approved, Management rejected)
          // Show Management, TL, Requester (Hide from Store, Handlers)
          if (hasTLApproval) {
            return isTLRole || isMgtRole;
          }

          // Case 3C: Rejected by Team Leader (rejected at submitted stage)
          // Show ONLY Team Leader and Requester (Hide from Management, Store, Handlers)
          return isTLRole;
        }

        // 4. Sequential Lifecycle Progression
        if (status === 'submitted') {
          // Visible ONLY to Requester and TL
          return isTLRole;
        }

        if (status === 'tl_approved') {
          // Visible to Requester, TL, Management
          return isTLRole || isMgtRole;
        }

        if (status === 'mgt_approved') {
          // Visible to Requester, TL, Management, Store
          return isTLRole || isMgtRole || isStoreRole;
        }

        if (['store_accepted', 'handler_assigned', 'dispatched'].includes(status)) {
          // Visible to Requester, TL, Management, Store, Sourcing Handler
          return isTLRole || isMgtRole || isStoreRole || isAssignedHandler || isPendingToHandler;
        }

        if (['received', 'active', 'partially_returned', 'closed', 'completed'].includes(status)) {
          // Visible to all participants
          return isTLRole || isMgtRole || isStoreRole || isAssignedHandler || isPendingToHandler;
        }

        return false;
      });

      setTransactions(data || []);
    } catch (err) {
      console.warn('Error fetching transactions:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
    const unsubscribe = navigation.addListener('focus', () => {
      fetchTransactions();
    });
    return unsubscribe;
  }, [activeTab, navigation]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchTransactions();
  };

  const getRequesterName = (item) => {
    if (!item) return 'Requester';

    // 1. Direct object properties on item
    const candidates = [
      item.requester,
      item.sender,
      item.createdBy,
      item.user,
      item.requestedBy,
    ];

    for (const c of candidates) {
      if (c && typeof c === 'object') {
        const name = c.fullName || c.name || c.employeeName || c.username || c.email?.split('@')[0];
        if (name && typeof name === 'string' && !/^[0-9a-fA-F]{24}$/.test(name.trim())) {
          return name.trim();
        }
      }
    }

    // 2. Check candidate IDs against usersMap or currentUser
    for (const c of candidates) {
      const idStr = String(typeof c === 'object' ? (c?._id || c?.id || '') : (c || '')).trim();
      if (idStr && usersMap[idStr]) {
        const u = usersMap[idStr];
        const name = u.fullName || u.name || u.employeeName || u.username;
        if (name && typeof name === 'string' && !/^[0-9a-fA-F]{24}$/.test(name.trim())) {
          return name.trim();
        }
      }
      if (currentUser) {
        const curId = String(currentUser._id || currentUser.id || currentUser.user?._id || currentUser.user?.id || '');
        const curEmpId = String(currentUser.employeeId || currentUser.user?.employeeId || currentUser.employeeIdCode || '');
        if ((curId && idStr === curId) || (curEmpId && idStr === curEmpId)) {
          const curName = currentUser.fullName || currentUser.name || currentUser.user?.fullName || currentUser.user?.name;
          if (curName) return curName;
        }
      }
    }

    // 3. Check timeline for creation/submission entry
    if (Array.isArray(item.timeline)) {
      const createEntry = item.timeline.find(
        (t) => t.action === 'Request Created' || t.action === 'Submitted' || t.action === 'Created'
      );
      if (createEntry) {
        if (createEntry.user) {
          if (typeof createEntry.user === 'object') {
            const name = createEntry.user.fullName || createEntry.user.name;
            if (name && !/^[0-9a-fA-F]{24}$/.test(name.trim())) return name.trim();
          } else {
            const uId = String(createEntry.user);
            if (usersMap[uId]) {
              const u = usersMap[uId];
              const name = u.fullName || u.name;
              if (name) return name;
            }
          }
        }
        if (createEntry.description && typeof createEntry.description === 'string') {
          const match = createEntry.description.match(/(?:by|from)\s+([A-Za-z\s]+?)(?:\s*[:\(]|$)/i);
          if (match && match[1] && match[1].trim().length > 1) {
            return match[1].trim();
          }
        }
      }
    }

    // 4. Plain string candidate
    for (const c of candidates) {
      if (c && typeof c === 'string' && !/^[0-9a-fA-F]{24}$/.test(c.trim())) {
        return c.trim();
      }
    }

    return 'Requester';
  };

  const getRequesterEmpId = (item) => {
    if (!item) return '';

    const candidates = [item.requester, item.sender, item.createdBy, item.user, item.requestedBy];
    for (const c of candidates) {
      if (c && typeof c === 'object') {
        const empId = c.employeeId || c.employeeIdCode || c.empId;
        if (empId) return String(empId);
      }
      const idStr = String(typeof c === 'object' ? (c?._id || c?.id || '') : (c || '')).trim();
      if (idStr && usersMap[idStr]) {
        const u = usersMap[idStr];
        const empId = u.employeeId || u.employeeIdCode || u.empId;
        if (empId) return String(empId);
      }
      if (currentUser) {
        const curId = String(currentUser._id || currentUser.id || currentUser.user?._id || '');
        const curEmpId = currentUser.employeeId || currentUser.user?.employeeId || currentUser.employeeIdCode;
        if (curId && idStr === curId && curEmpId) {
          return String(curEmpId);
        }
      }
    }
    return '';
  };

  const filteredTransactions = transactions.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const txnId = (t.transactionId || '').toLowerCase();
    const reqName = getRequesterName(t).toLowerCase();
    const empId = getRequesterEmpId(t).toLowerCase();
    return txnId.includes(q) || reqName.includes(q) || empId.includes(q);
  });

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title="Material Requests"
        subtitle="Vouchers & Movement Logs"
        navigation={navigation}
      />

      {/* Horizontal Tabs matching TransactionListPage */}
      <View style={styles.tabBarContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabItem, activeTab === tab.key && styles.tabItemActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Search size={18} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search TXN ID, Requester or Employee ID..."
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={fetchTransactions}
          />
        </View>
      </View>

      {/* List Content */}
      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : (
        <FlatList
          data={filteredTransactions}
          keyExtractor={(item) => item._id || item.transactionId}
          renderItem={({ item }) => {
            const badge = getStatusBadgeVariant(item.status);
            const progress = calculateProgress(item);
            const reqName = getRequesterName(item);
            const empId = getRequesterEmpId(item);
            const createdDate = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '';
            const dueDateFormatted = item.dueDate ? new Date(item.dueDate).toLocaleDateString() : 'N/A';

            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.7}
                onPress={() =>
                  navigation.navigate('MaterialDetailScreen', {
                    id: item._id || item.transactionId,
                    initialTxn: item,
                  })
                }
              >
                {/* Top Row: TXN ID & Status Badge */}
                <View style={styles.cardHeader}>
                  <View style={styles.txnRow}>
                    <Text style={styles.docTypeBadge}>{item.documentType || 'RDC'}</Text>
                    <Text style={styles.txnIdText}>{item.transactionId}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                    <Text style={[styles.statusBadgeText, { color: badge.text }]}>{badge.label}</Text>
                  </View>
                </View>

                {/* Requester Info & Date */}
                <View style={styles.cardBody}>
                  <View style={styles.infoCol}>
                    <Text style={styles.requesterName}>{reqName}</Text>
                    {empId ? <Text style={styles.employeeId}>{empId}</Text> : null}
                  </View>

                  <View style={styles.dateCol}>
                    <View style={styles.dateRow}>
                      <Calendar size={12} color="#64748b" />
                      <Text style={styles.dateText}>{createdDate}</Text>
                    </View>
                    <Text style={styles.dueDateText}>Due: {dueDateFormatted}</Text>
                  </View>
                </View>

                {/* Materials Count & Items Summary */}
                {item.materials && item.materials.length > 0 && (
                  <Text style={styles.materialsSummaryText} numberOfLines={1}>
                    📦 {item.materials.map((m) => `${m.name || m.materialName || 'Item'} (${m.quantity || m.qty || 1} ${m.unit || 'pcs'})`).join(', ')}
                  </Text>
                )}

                {/* Progress Bar matching TransactionListPage */}
                <View style={styles.progressContainer}>
                  <View style={styles.progressHeader}>
                    <Text style={styles.progressLabel}>Lifecycle Progress</Text>
                    <Text style={styles.progressPctText}>{progress}%</Text>
                  </View>
                  <View style={styles.progressBarTrack}>
                    <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#2563eb']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Layers size={44} color="#94a3b8" />
              <Text style={styles.emptyTitle}>No Transactions Found</Text>
              <Text style={styles.emptySubText}>
                No requests matched your filter: "{TABS.find((t) => t.key === activeTab)?.label}".
              </Text>
            </View>
          }
        />
      )}

      {/* Material Module Footer */}
      <MaterialModuleFooter navigation={navigation} currentScreen="transactions" />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  tabBarContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tabBar: {
    paddingHorizontal: 12,
    gap: 4,
  },
  tabItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0f172a',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
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
  txnRow: {
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
    fontSize: 15,
    fontWeight: '700',
    color: '#1e40af',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  cardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  infoCol: {
    flex: 1,
  },
  requesterName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  employeeId: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    marginTop: 2,
  },
  dateCol: {
    alignItems: 'flex-end',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  dueDateText: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  materialsSummaryText: {
    fontSize: 12,
    color: '#475569',
    backgroundColor: '#f8fafc',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  progressContainer: {
    gap: 4,
    marginTop: 2,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  progressPctText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#2563eb',
    borderRadius: 3,
  },
  emptyBox: {
    padding: 40,
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
  },
  emptySubText: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
  },
});

export default MaterialListScreen;
