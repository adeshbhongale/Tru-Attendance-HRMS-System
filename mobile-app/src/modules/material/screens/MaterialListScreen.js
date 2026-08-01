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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, Layers, Calendar } from 'lucide-react-native';
import MaterialHeader from '../components/MaterialHeader';
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      let statusFilter = '';
      if (activeTab === 'pending') statusFilter = 'submitted';
      else if (activeTab === 'in_progress') statusFilter = 'in_progress';
      else if (activeTab === 'received') statusFilter = 'received';
      else if (activeTab === 'partially_returned') statusFilter = 'partially_returned';
      else if (activeTab === 'closed') statusFilter = 'closed';
      else if (activeTab === 'rejected') statusFilter = 'rejected';

      const res = await materialApi.getTransactions({
        tab: activeTab,
        status: statusFilter,
        search: searchQuery,
      });

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

  const filteredTransactions = transactions.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const txnId = (t.transactionId || '').toLowerCase();
    const reqName = (t.requester?.fullName || t.requester?.name || t.sender?.fullName || '').toLowerCase();
    const empId = (t.requester?.employeeId || t.sender?.employeeId || '').toLowerCase();
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
            const reqName = item.requester?.fullName || item.sender?.fullName || item.requester?.name || 'Unknown User';
            const empId = item.requester?.employeeId || item.sender?.employeeId || 'EMP';
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
                    <Text style={styles.employeeId}>{empId}</Text>
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
