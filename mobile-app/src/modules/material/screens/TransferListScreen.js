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
  ArrowRightLeft,
  QrCode,
  User,
  Calendar,
  Search,
  Package,
  Tag,
  ArrowRight,
  ShieldCheck,
  FileText,
  CircleAlert,
  Building,
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
    return { bg: '#ecfdf5', text: '#059669', border: '#a7f3d0', label: 'Good' };
  }
  if (c.includes('damage')) {
    return { bg: '#fef2f2', text: '#dc2626', border: '#fecaca', label: 'Damaged' };
  }
  if (c.includes('repair')) {
    return { bg: '#fffbeb', text: '#d97706', border: '#fde68a', label: 'Needs Repair' };
  }
  return { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1', label: cond || 'Normal' };
};

const getTransferTypeBadge = (type) => {
  const t = String(type || 'internal').toLowerCase();
  if (t === 'cross_department') {
    return { label: 'Cross-Dept', bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' };
  }
  if (t === 'handler_transfer') {
    return { label: 'Handler', bg: '#f5f3ff', text: '#7c3aed', border: '#ddd6fe' };
  }
  return { label: 'Internal', bg: '#f8fafc', text: '#475569', border: '#e2e8f0' };
};

const FILTER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'outgoing', label: 'Sent by Me' },
  { id: 'incoming', label: 'Received by Me' },
  { id: 'pending', label: 'Pending' },
  { id: 'completed', label: 'Completed' },
];

const TransferListScreen = ({ navigation }) => {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserId, setCurrentUserId] = useState('');

  const fetchTransfers = async () => {
    try {
      setLoading(true);

      // Load logged-in user
      let userObj = null;
      try {
        const uStr = await AsyncStorage.getItem('user');
        if (uStr) userObj = JSON.parse(uStr);
      } catch (_) {}

      const cachedUserId = await AsyncStorage.getItem('userId');
      const targetUserId = userObj?._id || userObj?.id || cachedUserId || '';
      setCurrentUser(userObj);
      setCurrentUserId(String(targetUserId));

      // Fetch only transfers for the logged-in user
      const res = await materialApi.getTransfersList({
        userOnly: true,
        userId: targetUserId,
      });

      const list = Array.isArray(res?.data)
        ? res.data
        : (Array.isArray(res?.transfers) ? res.transfers : (Array.isArray(res) ? res : []));

      // Client-side guard: strictly ensure every transfer involves the logged-in user
      const myId = String(targetUserId);
      const myEmpId = String(userObj?.employeeId || '').trim().toLowerCase();
      const myName = String(userObj?.fullName || userObj?.name || '').trim().toLowerCase();

      const userTransfers = list.filter((t) => {
        if (!myId && !myEmpId && !myName) return true;
        const fromId = String(t.fromUser?._id || t.fromUser?.id || t.fromUser || '');
        const toId = String(t.toUser?._id || t.toUser?.id || t.toUser || '');
        const fromEmp = String(t.fromUser?.employeeId || '').trim().toLowerCase();
        const toEmp = String(t.toUser?.employeeId || '').trim().toLowerCase();
        const fromName = String(t.fromUser?.fullName || t.fromUser?.name || '').trim().toLowerCase();
        const toName = String(t.toUser?.fullName || t.toUser?.name || '').trim().toLowerCase();

        return (
          (Boolean(myId) && (fromId === myId || toId === myId)) ||
          (Boolean(myEmpId) && (fromEmp === myEmpId || toEmp === myEmpId)) ||
          (Boolean(myName) && (fromName === myName || toName === myName))
        );
      });

      setTransfers(userTransfers);
    } catch (e) {
      console.warn('Error fetching transfers:', e);
      setTransfers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTransfers();
  }, []);

  // Summary Metrics for user's transfers
  const metrics = useMemo(() => {
    const total = transfers.length;
    const myId = String(currentUserId || '');
    const myEmpId = String(currentUser?.employeeId || '').trim().toLowerCase();
    const myName = String(currentUser?.fullName || currentUser?.name || '').trim().toLowerCase();

    const isOutgoing = (t) => {
      const fromId = String(t.fromUser?._id || t.fromUser?.id || t.fromUser || '');
      const fromEmp = String(t.fromUser?.employeeId || '').trim().toLowerCase();
      const fromName = String(t.fromUser?.fullName || t.fromUser?.name || '').trim().toLowerCase();
      return (
        (Boolean(myId) && fromId === myId) ||
        (Boolean(myEmpId) && fromEmp === myEmpId) ||
        (Boolean(myName) && fromName === myName)
      );
    };

    const sentByMe = transfers.filter(isOutgoing).length;
    const receivedByMe = total - sentByMe;
    const pending = transfers.filter((t) =>
      ['pending', 'pending_acceptance'].includes(String(t.status || '').toLowerCase())
    ).length;
    const completed = transfers.filter((t) =>
      ['completed'].includes(String(t.status || '').toLowerCase())
    ).length;

    return { total, sentByMe, receivedByMe, pending, completed };
  }, [transfers, currentUserId, currentUser]);

  // Filter & Search
  const filteredTransfers = useMemo(() => {
    let list = transfers;

    const myId = String(currentUserId || '');
    const myEmpId = String(currentUser?.employeeId || '').trim().toLowerCase();
    const myName = String(currentUser?.fullName || currentUser?.name || '').trim().toLowerCase();

    const isOutgoing = (t) => {
      const fromId = String(t.fromUser?._id || t.fromUser?.id || t.fromUser || '');
      const fromEmp = String(t.fromUser?.employeeId || '').trim().toLowerCase();
      const fromName = String(t.fromUser?.fullName || t.fromUser?.name || '').trim().toLowerCase();
      return (
        (Boolean(myId) && fromId === myId) ||
        (Boolean(myEmpId) && fromEmp === myEmpId) ||
        (Boolean(myName) && fromName === myName)
      );
    };

    // Filter by tab
    if (selectedFilter !== 'all') {
      list = list.filter((t) => {
        const s = String(t.status || '').toLowerCase();
        if (selectedFilter === 'outgoing') {
          return isOutgoing(t);
        }
        if (selectedFilter === 'incoming') {
          return !isOutgoing(t);
        }
        if (selectedFilter === 'pending') {
          return ['pending', 'pending_acceptance'].includes(s);
        }
        if (selectedFilter === 'completed') {
          return s === 'completed';
        }
        return s === selectedFilter;
      });
    }

    // Filter by search query
    const q = (searchQuery || '').trim().toLowerCase();
    if (q) {
      list = list.filter((t) => {
        const barcodeMatch = (t.barcode || '').toLowerCase().includes(q);
        const matMatch = (t.materialName || '').toLowerCase().includes(q);
        const txnMatch = (t.transactionId || '').toLowerCase().includes(q);
        const senderMatch = (
          (t.fromUser?.fullName || t.fromUser?.name || '') +
          ' ' +
          (t.fromUser?.employeeId || '')
        ).toLowerCase().includes(q);
        const receiverMatch = (
          (t.toUser?.fullName || t.toUser?.name || '') +
          ' ' +
          (t.toUser?.employeeId || '')
        ).toLowerCase().includes(q);
        const deptMatch = (
          (t.fromDepartment?.name || (typeof t.fromDepartment === 'string' ? t.fromDepartment : '')) +
          ' ' +
          (t.toDepartment?.name || (typeof t.toDepartment === 'string' ? t.toDepartment : ''))
        ).toLowerCase().includes(q);
        return barcodeMatch || matMatch || txnMatch || senderMatch || receiverMatch || deptMatch;
      });
    }

    return list;
  }, [transfers, selectedFilter, searchQuery, currentUserId, currentUser]);

  const renderTransferCard = ({ item }) => {
    const fromUserName =
      item.fromUser?.fullName || item.fromUser?.name || 'Sender';
    const fromUserDept =
      item.fromDepartment?.name ||
      item.fromUser?.department?.name ||
      (typeof item.fromDepartment === 'string' ? item.fromDepartment : '') ||
      (typeof item.fromUser?.department === 'string' ? item.fromUser?.department : '');

    const toUserName =
      item.toUser?.fullName || item.toUser?.name || 'Recipient';
    const toUserDept =
      item.toDepartment?.name ||
      item.toUser?.department?.name ||
      (typeof item.toDepartment === 'string' ? item.toDepartment : '') ||
      (typeof item.toUser?.department === 'string' ? item.toUser?.department : '');

    const approverName =
      item.managementApprover?.fullName || item.managementApprover?.name || item.approvedBy?.fullName;
    const typeBadge = getTransferTypeBadge(item.type);
    const condStyle = getConditionStyle(item.materialCondition);
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
            <Package size={17} color="#ea580c" />
            <Text style={styles.materialNameText} numberOfLines={1}>
              {item.materialName || 'Material Item'}
            </Text>
            {Boolean(item.unit) && (
              <Text style={styles.unitText}>({item.unit})</Text>
            )}
          </View>
          <StatusBadge status={item.status || 'pending'} />
        </View>

        {/* Barcode, Transaction ID & Type Badge */}
        <View style={styles.identifierRow}>
          <View style={styles.barcodeBox}>
            <QrCode size={15} color="#ea580c" />
            <Text style={styles.barcodeText}>{item.barcode}</Text>
          </View>

          <View style={styles.badgeGroup}>
            <View
              style={[
                styles.typeBadge,
                { backgroundColor: typeBadge.bg, borderColor: typeBadge.border },
              ]}
            >
              <Text style={[styles.typeBadgeText, { color: typeBadge.text }]}>
                {typeBadge.label}
              </Text>
            </View>

            {Boolean(item.transactionId) && (
              <View style={styles.txnBadge}>
                <Tag size={12} color="#64748b" />
                <Text style={styles.txnText}>{item.transactionId}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.divider} />

        {/* Custody Transfer Flow: From ➔ To */}
        <View style={styles.custodyFlowBox}>
          {/* Sender Column */}
          <View style={styles.custodianCol}>
            <View style={styles.custodianHeader}>
              <User size={12} color="#64748b" />
              <Text style={styles.custodianLabel}>FROM SENDER</Text>
            </View>
            <Text style={styles.custodianName} numberOfLines={1}>
              {fromUserName}
            </Text>
            {Boolean(fromUserDept) && (
              <View style={styles.deptWrap}>
                <Building size={11} color="#94a3b8" />
                <Text style={styles.deptText} numberOfLines={1}>
                  {fromUserDept}
                </Text>
              </View>
            )}
          </View>

          {/* Flow Direction Indicator */}
          <View style={styles.flowArrowWrap}>
            <ArrowRight size={18} color="#ea580c" />
          </View>

          {/* Recipient Column */}
          <View style={styles.custodianCol}>
            <View style={styles.custodianHeader}>
              <User size={12} color="#ea580c" />
              <Text style={[styles.custodianLabel, { color: '#ea580c' }]}>TO RECIPIENT</Text>
            </View>
            <Text style={styles.custodianName} numberOfLines={1}>
              {toUserName}
            </Text>
            {Boolean(toUserDept) && (
              <View style={styles.deptWrap}>
                <Building size={11} color="#94a3b8" />
                <Text style={styles.deptText} numberOfLines={1}>
                  {toUserDept}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Management Approver (if required) */}
        {Boolean(approverName) && (
          <View style={styles.approverRow}>
            <ShieldCheck size={14} color="#059669" />
            <Text style={styles.approverLabel}>Approver:</Text>
            <Text style={styles.approverValue} numberOfLines={1}>
              {approverName}
            </Text>
          </View>
        )}

        {/* Bottom Meta Row: Condition & Date */}
        <View style={styles.metaRow}>
          <View
            style={[
              styles.condBadge,
              { backgroundColor: condStyle.bg, borderColor: condStyle.border },
            ]}
          >
            <Text style={[styles.condText, { color: condStyle.text }]}>
              Condition: {condStyle.label}
            </Text>
          </View>

          {Boolean(dateFormatted) && (
            <View style={styles.dateBox}>
              <Calendar size={12} color="#94a3b8" />
              <Text style={styles.dateText}>{dateFormatted}</Text>
            </View>
          )}
        </View>

        {/* Remarks (if any) */}
        {Boolean(item.remarks) && (
          <View style={styles.remarksBox}>
            <FileText size={13} color="#64748b" />
            <Text style={styles.remarksText} numberOfLines={2}>
              {item.remarks}
            </Text>
          </View>
        )}

        {/* Rejection Alert (if rejected) */}
        {Boolean(item.rejectionReason) && (
          <View style={styles.rejectBox}>
            <CircleAlert size={13} color="#dc2626" />
            <Text style={styles.rejectText} numberOfLines={2}>
              Rejection Reason: {item.rejectionReason}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title="My Custody Transfers"
        subtitle="Your incoming and outgoing material transfers"
        navigation={navigation}
        rightElement={
          <TouchableOpacity
            onPress={() => navigation.navigate('TransferMaterialScreen')}
            style={styles.newBtn}
          >
            <ArrowRightLeft size={18} color="#ffffff" />
          </TouchableOpacity>
        }
      />

      {/* Metrics Summary Strip */}
      <View style={styles.metricsBanner}>
        <View style={styles.metricCol}>
          <Text style={styles.metricVal}>{metrics.total}</Text>
          <Text style={styles.metricLabel}>Total</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricCol}>
          <Text style={[styles.metricVal, { color: '#ea580c' }]}>{metrics.sentByMe}</Text>
          <Text style={styles.metricLabel}>Sent by Me</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricCol}>
          <Text style={[styles.metricVal, { color: '#2563eb' }]}>{metrics.receivedByMe}</Text>
          <Text style={styles.metricLabel}>Received</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricCol}>
          <Text style={[styles.metricVal, { color: '#059669' }]}>{metrics.completed}</Text>
          <Text style={styles.metricLabel}>Completed</Text>
        </View>
      </View>

      {/* Search Input */}
      <View style={styles.searchSection}>
        <View style={styles.searchInputWrap}>
          <Search size={16} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search material, barcode, sender, or recipient..."
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
          <ActivityIndicator size="large" color="#ea580c" />
          <Text style={styles.loadingText}>Loading your custody transfers...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredTransfers}
          keyExtractor={(item, idx) => item._id || item.barcode || String(idx)}
          renderItem={renderTransferCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchTransfers();
              }}
              colors={['#ea580c']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <ArrowRightLeft size={42} color="#94a3b8" />
              <Text style={styles.emptyTitle}>No Transfers Found</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery
                  ? `No transfer logs match query "${searchQuery}".`
                  : 'You have no custody transfers recorded. Transfers where you are sender or recipient will appear here.'}
              </Text>
            </View>
          }
        />
      )}

      {/* Material Module Footer */}
      <MaterialModuleFooter navigation={navigation} currentScreen="transfers" />
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
    backgroundColor: '#ea580c',
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
    backgroundColor: '#ea580c',
    borderColor: '#ea580c',
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
    flexWrap: 'wrap',
    gap: 6,
  },
  barcodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff7ed',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  barcodeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ea580c',
    letterSpacing: 0.5,
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
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
  custodyFlowBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    marginBottom: 8,
  },
  custodianCol: {
    flex: 1,
  },
  custodianHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 3,
  },
  custodianLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.4,
  },
  custodianName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },
  deptWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  deptText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  flowArrowWrap: {
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#dcfce7',
  },
  approverLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16a34a',
  },
  approverValue: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
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
  rejectBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#fef2f2',
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#fee2e2',
  },
  rejectText: {
    fontSize: 11,
    color: '#dc2626',
    fontWeight: '600',
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

export default TransferListScreen;
