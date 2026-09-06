import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  RotateCcw,
  QrCode,
  User,
  Calendar,
  Search,
  Package,
  Tag,
  Truck,
  FileText,
  CircleAlert,
  CircleCheck,
  Clock,
} from 'lucide-react-native';
import MaterialHeader from '../components/MaterialHeader';
import MaterialModuleFooter from '../components/MaterialModuleFooter';
import StatusBadge from '../components/StatusBadge';
import materialApi from '../api/materialApi';

const safeDateTime = (dateStr) => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return '';
  }
};

const getConditionStyle = (cond) => {
  const c = String(cond || 'good').toLowerCase();
  if (c.includes('good')) {
    return { bg: '#ecfdf5', text: '#059669', border: '#a7f3d0', label: 'Good Condition' };
  }
  if (c.includes('fault') || c.includes('damage')) {
    return { bg: '#fef2f2', text: '#dc2626', border: '#fecaca', label: 'Damaged / Faulty' };
  }
  if (c.includes('repair')) {
    return { bg: '#fffbeb', text: '#d97706', border: '#fde68a', label: 'Needs Repair' };
  }
  if (c.includes('scrap')) {
    return { bg: '#f8fafc', text: '#475569', border: '#cbd5e1', label: 'Scrap' };
  }
  return { bg: '#fff7ed', text: '#ea580c', border: '#fed7aa', label: cond };
};

const FILTER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'collected', label: 'In Transit' },
  { id: 'store_received', label: 'At Store' },
  { id: 'completed', label: 'Completed' },
  { id: 'rejected', label: 'Rejected' },
];

const ReturnListScreen = ({ navigation }) => {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserId, setCurrentUserId] = useState('');

  const fetchReturns = async () => {
    try {
      setLoading(true);

      // Load logged-in user details
      let userObj = null;
      try {
        const uStr = await AsyncStorage.getItem('user');
        if (uStr) userObj = JSON.parse(uStr);
      } catch (_) {}

      const cachedUserId = await AsyncStorage.getItem('userId');
      const targetUserId = userObj?._id || userObj?.id || cachedUserId || '';
      setCurrentUser(userObj);
      setCurrentUserId(String(targetUserId));

      // Fetch returns for the logged-in user
      const res = await materialApi.getReturnsList({
        userOnly: true,
        userId: targetUserId,
      });

      const list = Array.isArray(res?.data)
        ? res.data
        : (Array.isArray(res?.returns) ? res.returns : (Array.isArray(res) ? res : []));

      // Client-side guard: strictly ensure return belongs to logged-in user
      const myId = String(targetUserId);
      const myEmpId = String(userObj?.employeeId || '').trim().toLowerCase();
      const myName = String(userObj?.fullName || userObj?.name || '').trim().toLowerCase();

      const userReturns = list.filter((r) => {
        if (!myId && !myEmpId && !myName) return true;
        const fromId = String(r.fromUser?._id || r.fromUser?.id || r.fromUser || '');
        const handlerId = String(r.returnHandler?._id || r.returnHandler?.id || r.returnHandler || '');
        const fromEmp = String(r.fromUser?.employeeId || '').trim().toLowerCase();
        const handlerEmp = String(r.returnHandler?.employeeId || '').trim().toLowerCase();
        const fromName = String(r.fromUser?.fullName || r.fromUser?.name || '').trim().toLowerCase();
        const handlerName = String(r.returnHandler?.fullName || r.returnHandler?.name || '').trim().toLowerCase();

        return (
          (Boolean(myId) && (fromId === myId || handlerId === myId)) ||
          (Boolean(myEmpId) && (fromEmp === myEmpId || handlerEmp === myEmpId)) ||
          (Boolean(myName) && (fromName === myName || handlerName === myName))
        );
      });

      setReturns(userReturns);
    } catch (e) {
      console.warn('Error fetching returns:', e);
      setReturns([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchReturns();
  }, []);

  // Summary Metrics for user returns
  const metrics = useMemo(() => {
    const total = returns.length;
    const pending = returns.filter((r) =>
      ['pending', 'handler_assigned'].includes(String(r.status || '').toLowerCase())
    ).length;
    const inTransit = returns.filter((r) =>
      ['collected'].includes(String(r.status || '').toLowerCase())
    ).length;
    const received = returns.filter((r) =>
      ['store_received', 'completed'].includes(String(r.status || '').toLowerCase())
    ).length;
    return { total, pending, inTransit, received };
  }, [returns]);

  // Filter & Search
  const filteredReturns = useMemo(() => {
    let list = returns;

    // Filter by tab
    if (selectedFilter !== 'all') {
      list = list.filter((r) => {
        const s = String(r.status || '').toLowerCase();
        if (selectedFilter === 'pending') {
          return ['pending', 'handler_assigned'].includes(s);
        }
        if (selectedFilter === 'collected') {
          return s === 'collected';
        }
        if (selectedFilter === 'store_received') {
          return ['store_received', 'received'].includes(s);
        }
        if (selectedFilter === 'completed') {
          return s === 'completed';
        }
        if (selectedFilter === 'rejected') {
          return s === 'rejected';
        }
        return s === selectedFilter;
      });
    }

    // Filter by search query
    const q = (searchQuery || '').trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const barcodeMatch = (r.barcode || '').toLowerCase().includes(q);
        const matMatch = (r.materialName || '').toLowerCase().includes(q);
        const txnMatch = (r.transactionId || r.bulkReturnId || '').toLowerCase().includes(q);
        const userMatch = (
          (r.fromUser?.fullName || r.fromUser?.name || '') +
          ' ' +
          (r.fromUser?.employeeId || '')
        ).toLowerCase().includes(q);
        const handlerMatch = (
          (r.returnHandler?.fullName || r.returnHandler?.name || '') +
          ' ' +
          (r.store?.fullName || r.store?.name || '')
        ).toLowerCase().includes(q);
        return barcodeMatch || matMatch || txnMatch || userMatch || handlerMatch;
      });
    }

    return list;
  }, [returns, selectedFilter, searchQuery]);

  const renderReturnCard = ({ item }) => {
    const fromUserName =
      item.fromUser?.fullName || item.fromUser?.name || currentUser?.fullName || 'My Account';
    const fromUserEmpId = item.fromUser?.employeeId ? ` (${item.fromUser.employeeId})` : '';
    const fromUserDept =
      item.fromUser?.department?.name ||
      (typeof item.fromUser?.department === 'string' ? item.fromUser?.department : '');

    const handlerName = item.returnHandler?.fullName || item.returnHandler?.name;
    const storeName = item.store?.fullName || item.store?.name;
    const condStyle = getConditionStyle(item.condition);
    const dateFormatted = safeDateTime(item.createdAt);

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('BarcodeDetailScreen', { barcode: item.barcode })}
      >
        {/* Top Row: Material Name & Status */}
        <View style={styles.topRow}>
          <View style={styles.materialNameBox}>
            <Package size={17} color="#dc2626" />
            <Text style={styles.materialNameText} numberOfLines={1}>
              {item.materialName || 'Material Item'}
            </Text>
            {Boolean(item.unit) && (
              <Text style={styles.unitText}>({item.unit})</Text>
            )}
          </View>
          <StatusBadge status={item.status || 'pending'} />
        </View>

        {/* Barcode & Transaction ID Pill */}
        <View style={styles.identifierRow}>
          <View style={styles.barcodeBox}>
            <QrCode size={15} color="#dc2626" />
            <Text style={styles.barcodeText}>{item.barcode}</Text>
          </View>

          {Boolean(item.transactionId || item.bulkReturnId) && (
            <View style={styles.txnBadge}>
              <Tag size={12} color="#64748b" />
              <Text style={styles.txnText}>
                {item.transactionId || item.bulkReturnId}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.divider} />

        {/* Returned By */}
        <View style={styles.infoRow}>
          <User size={14} color="#64748b" />
          <Text style={styles.infoLabel}>Returned By:</Text>
          <Text style={styles.infoValue} numberOfLines={1}>
            {fromUserName}
            {fromUserEmpId}
            {fromUserDept ? ` • ${fromUserDept}` : ''}
          </Text>
        </View>

        {/* Assigned Handler or Store */}
        {(Boolean(handlerName) || Boolean(storeName)) && (
          <View style={styles.infoRow}>
            <Truck size={14} color="#64748b" />
            <Text style={styles.infoLabel}>
              {handlerName ? 'Handler:' : 'Store Receiver:'}
            </Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {handlerName || storeName}
            </Text>
          </View>
        )}

        {/* Return Condition & Creation Date */}
        <View style={styles.metaRow}>
          <View
            style={[
              styles.condBadge,
              { backgroundColor: condStyle.bg, borderColor: condStyle.border },
            ]}
          >
            <Text style={[styles.condText, { color: condStyle.text }]}>
              {condStyle.label}
            </Text>
          </View>

          {Boolean(dateFormatted) && (
            <View style={styles.dateBox}>
              <Calendar size={12} color="#94a3b8" />
              <Text style={styles.dateText}>{dateFormatted}</Text>
            </View>
          )}
        </View>

        {/* Remarks or Reason (if any) */}
        {(Boolean(item.reason) || Boolean(item.remarks)) && (
          <View style={styles.remarksBox}>
            <FileText size={13} color="#64748b" />
            <Text style={styles.remarksText} numberOfLines={2}>
              {item.reason || item.remarks}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title="My Store Returns"
        subtitle="Your warehouse return logs & inspection status"
        navigation={navigation}
        rightElement={
          <TouchableOpacity
            onPress={() => navigation.navigate('ReturnMaterialScreen')}
            style={styles.newBtn}
          >
            <RotateCcw size={18} color="#ffffff" />
          </TouchableOpacity>
        }
      />

      {/* Metrics Banner */}
      <View style={styles.metricsBanner}>
        <View style={styles.metricCol}>
          <Text style={styles.metricVal}>{metrics.total}</Text>
          <Text style={styles.metricLabel}>Total</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricCol}>
          <Text style={[styles.metricVal, { color: '#ea580c' }]}>{metrics.pending}</Text>
          <Text style={styles.metricLabel}>Pending</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricCol}>
          <Text style={[styles.metricVal, { color: '#d97706' }]}>{metrics.inTransit}</Text>
          <Text style={styles.metricLabel}>In Transit</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricCol}>
          <Text style={[styles.metricVal, { color: '#15803d' }]}>{metrics.received}</Text>
          <Text style={styles.metricLabel}>At Store</Text>
        </View>
      </View>

      {/* Search Input */}
      <View style={styles.searchSection}>
        <View style={styles.searchInputWrap}>
          <Search size={16} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search material, barcode, or TXN..."
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterTabsRow}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={FILTER_TABS}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.filterTabsContent}
          renderItem={({ item }) => {
            const isActive = selectedFilter === item.id;
            return (
              <TouchableOpacity
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setSelectedFilter(item.id)}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Content List */}
      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#dc2626" />
          <Text style={styles.loadingText}>Loading your return logs...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredReturns}
          keyExtractor={(item, idx) => item._id || item.barcode || String(idx)}
          renderItem={renderReturnCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchReturns();
              }}
              colors={['#dc2626']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <RotateCcw size={42} color="#94a3b8" />
              <Text style={styles.emptyTitle}>No Returns Found</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery
                  ? `No returns matched query "${searchQuery}".`
                  : 'You have not submitted any return requests. Returns initiated by you will appear here.'}
              </Text>
            </View>
          }
        />
      )}

      {/* Material Module Footer */}
      <MaterialModuleFooter navigation={navigation} currentScreen="returns" />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  newBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 3,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  metricsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
  },
  metricCol: {
    flex: 1,
    alignItems: 'center',
  },
  metricVal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  metricLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 2,
  },
  metricDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#f1f5f9',
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 4,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0f172a',
    padding: 0,
  },
  filterTabsRow: {
    paddingVertical: 6,
  },
  filterTabsContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterChipActive: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  filterChipTextActive: {
    color: '#ffffff',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    paddingTop: 4,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  materialNameBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  materialNameText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    flexShrink: 1,
  },
  unitText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  identifierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  barcodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fef2f2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fee2e2',
  },
  barcodeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#dc2626',
    letterSpacing: 0.5,
  },
  txnBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  txnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  infoValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#f8fafc',
  },
  condBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  condText: {
    fontSize: 11,
    fontWeight: '700',
  },
  dateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '500',
  },
  remarksBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#f8fafc',
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  remarksText: {
    fontSize: 11,
    color: '#475569',
    fontStyle: 'italic',
    flex: 1,
  },
  emptyBox: {
    padding: 40,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#475569',
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
  },
});

export default ReturnListScreen;
