import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Package,
  QrCode,
  Truck,
  Clock,
  Layers,
  ChevronRight,
  User as UserIcon,
} from 'lucide-react-native';
import MaterialHeader from '../components/MaterialHeader';
import MaterialModuleFooter from '../components/MaterialModuleFooter';
import BarcodeScannerModal from '../components/BarcodeScannerModal';
import StatusBadge from '../components/StatusBadge';
import materialApi from '../api/materialApi';

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch (_) {
    return '';
  }
};

const MaterialDashboardScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [stats, setStats] = useState({
    activeRequests: 0,
    barcodesInHand: 0,
    pendingApprovals: 0,
    dispatchedCount: 0,
  });
  const [recentTransactions, setRecentTransactions] = useState([]);

  const loadDashboardData = useCallback(async () => {
    try {
      // 1. Resolve logged-in user profile from AsyncStorage
      let userObj = null;
      let targetUserId = '';
      let myEmpId = '';
      let myName = '';

      try {
        const userStr = await AsyncStorage.getItem('user');
        if (userStr) {
          userObj = JSON.parse(userStr);
        }
      } catch (_) {}

      try {
        const cachedUserId = await AsyncStorage.getItem('userId');
        targetUserId = String(
          userObj?._id || userObj?.id || userObj?.user?._id || userObj?.user?.id || cachedUserId || ''
        ).trim();
        myEmpId = String(
          userObj?.employeeId || userObj?.empId || userObj?.user?.employeeId || ''
        ).trim().toLowerCase();
        myName = String(
          userObj?.fullName || userObj?.name || userObj?.user?.fullName || userObj?.user?.name || ''
        ).trim().toLowerCase();
      } catch (_) {}

      if (userObj) {
        setCurrentUser(userObj);
      }

      // 2. Fetch all transactions and user-active barcodes concurrently
      const [txnsRes, barcodesRes] = await Promise.all([
        materialApi.getTransactions({ limit: 1000, tab: 'all', status: 'all' }).catch(() => ({ data: [] })),
        materialApi.getMyActiveBarcodes().catch(() => ({ count: 0, data: [] })),
      ]);

      // 3. Extract transaction array safely across possible API envelope formats
      let rawTxns = [];
      if (Array.isArray(txnsRes)) {
        rawTxns = txnsRes;
      } else if (Array.isArray(txnsRes?.data)) {
        rawTxns = txnsRes.data;
      } else if (Array.isArray(txnsRes?.data?.data)) {
        rawTxns = txnsRes.data.data;
      } else if (Array.isArray(txnsRes?.transactions)) {
        rawTxns = txnsRes.transactions;
      }

      // 4. Strict filter: only include transactions created by / requested by the logged-in user
      const isUserTxn = (t) => {
        if (!t) return false;
        if (!targetUserId && !myEmpId && !myName) return true;

        const req = t.requester;
        const reqId = String(typeof req === 'object' ? (req?._id || req?.id || '') : (req || '')).trim();
        const reqEmpId = String(typeof req === 'object' ? (req?.employeeId || '') : '').trim().toLowerCase();
        const reqName = String(typeof req === 'object' ? (req?.fullName || req?.name || '') : '').trim().toLowerCase();

        const createdBy = t.createdBy;
        const createdById = String(typeof createdBy === 'object' ? (createdBy?._id || createdBy?.id || '') : (createdBy || '')).trim();

        const sender = t.sender;
        const senderId = String(typeof sender === 'object' ? (sender?._id || sender?.id || '') : (sender || '')).trim();

        if (targetUserId && (reqId === targetUserId || createdById === targetUserId || senderId === targetUserId)) {
          return true;
        }
        if (myEmpId && reqEmpId && reqEmpId === myEmpId) {
          return true;
        }
        if (myName && reqName && reqName === myName) {
          return true;
        }
        return false;
      };

      const userTxns = rawTxns.filter(isUserTxn);

      // 5. Calculate KPI Metrics for Logged-In User
      // Total Requests
      const activeRequests = userTxns.length;

      // Active Barcodes in Hand (from dedicated backend endpoint or fallback)
      let barcodesInHand = 0;
      if (typeof barcodesRes?.count === 'number') {
        barcodesInHand = barcodesRes.count;
      } else if (Array.isArray(barcodesRes?.data)) {
        barcodesInHand = barcodesRes.data.length;
      } else if (Array.isArray(barcodesRes?.barcodes)) {
        barcodesInHand = barcodesRes.barcodes.length;
      }

      // Fallback: if backend returned 0 but user has active materials in their transactions
      if (barcodesInHand === 0 && userTxns.length > 0) {
        let countFromTxns = 0;
        userTxns.forEach((t) => {
          const st = String(t.status || '').toLowerCase();
          if (['received', 'active', 'partially_returned', 'dispatched'].includes(st)) {
            (t.materials || []).forEach((m) => {
              (m.barcodes || []).forEach((b) => {
                const bStatus = String(typeof b === 'object' ? b.status : '').toLowerCase();
                if (!bStatus || bStatus === 'active' || bStatus === 'exchanged') {
                  countFromTxns++;
                }
              });
            });
          }
        });
        if (countFromTxns > 0) {
          barcodesInHand = countFromTxns;
        }
      }

      // Pending Action (Requests awaiting team lead, management, or store action)
      const pendingStatuses = ['submitted', 'tl_approved', 'mgt_approved', 'store_accepted', 'handler_assigned', 'pending'];
      const pendingApprovals = userTxns.filter((t) =>
        pendingStatuses.includes(String(t.status || '').toLowerCase())
      ).length;

      // Dispatched Items count
      const dispatchedCount = userTxns.filter((t) =>
        String(t.status || '').toLowerCase() === 'dispatched'
      ).length;

      setStats({
        activeRequests,
        barcodesInHand,
        pendingApprovals,
        dispatchedCount,
      });

      // 6. Recent User Transactions (Sort by date descending, top 8)
      const sortedTxns = [...userTxns].sort((a, b) => {
        const timeA = new Date(a.createdAt || a.updatedAt || 0).getTime();
        const timeB = new Date(b.createdAt || b.updatedAt || 0).getTime();
        return timeB - timeA;
      });

      setRecentTransactions(sortedTxns.slice(0, 8));
    } catch (e) {
      console.warn('[MaterialDashboard] Data load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
    const unsubscribe = navigation?.addListener ? navigation.addListener('focus', () => {
      loadDashboardData();
    }) : null;
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [navigation, loadDashboardData]);

  const handleScanSuccess = (code) => {
    navigation.navigate('BarcodeDetailScreen', { barcode: code });
  };

  const userDisplayName = currentUser?.fullName || currentUser?.name || currentUser?.user?.fullName || '';

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title="Material Dashboard"
        subtitle={userDisplayName ? `Logged in: ${userDisplayName}` : "MMS Overview & Metrics Summary"}
        navigation={navigation}
        showBack={false}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadDashboardData();
            }}
            colors={['#4f46e5']}
          />
        }
      >
        {/* Metrics Grid */}
        <View style={styles.metricsGrid}>
          {/* Card 1: Total Requests */}
          <TouchableOpacity
            style={[styles.metricCard, { backgroundColor: '#eef2ff' }]}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('MaterialListScreen', { tab: 'all' })}
          >
            <View style={styles.metricIconRow}>
              <Package size={22} color="#4f46e5" />
              <Text style={[styles.metricValue, { color: '#3730a3' }]}>{stats.activeRequests}</Text>
            </View>
            <Text style={styles.metricLabel}>Total Requests</Text>
          </TouchableOpacity>

          {/* Card 2: Active Barcodes */}
          <TouchableOpacity
            style={[styles.metricCard, { backgroundColor: '#e0f2fe' }]}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('BarcodeViewAllScreen')}
          >
            <View style={styles.metricIconRow}>
              <QrCode size={22} color="#0284c7" />
              <Text style={[styles.metricValue, { color: '#075985' }]}>{stats.barcodesInHand}</Text>
            </View>
            <Text style={styles.metricLabel}>Active Barcodes</Text>
          </TouchableOpacity>

          {/* Card 3: Pending Action */}
          <TouchableOpacity
            style={[styles.metricCard, { backgroundColor: '#fef3c7' }]}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('PendingTransactionsScreen')}
          >
            <View style={styles.metricIconRow}>
              <Clock size={22} color="#d97706" />
              <Text style={[styles.metricValue, { color: '#92400e' }]}>{stats.pendingApprovals}</Text>
            </View>
            <Text style={styles.metricLabel}>Pending Action</Text>
          </TouchableOpacity>

          {/* Card 4: Dispatched Items */}
          <TouchableOpacity
            style={[styles.metricCard, { backgroundColor: '#f3e8ff' }]}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('MaterialListScreen', { tab: 'dispatched' })}
          >
            <View style={styles.metricIconRow}>
              <Truck size={22} color="#9333ea" />
              <Text style={[styles.metricValue, { color: '#6b21a8' }]}>{stats.dispatchedCount}</Text>
            </View>
            <Text style={styles.metricLabel}>Dispatched Items</Text>
          </TouchableOpacity>
        </View>

        {/* Recent Transactions Header */}
        <View style={styles.recentHeader}>
          <Text style={styles.sectionTitle}>MY RECENT TRANSACTIONS</Text>
          <TouchableOpacity onPress={() => navigation.navigate('MaterialListScreen', { tab: 'all' })}>
            <Text style={styles.seeAllText}>View All</Text>
          </TouchableOpacity>
        </View>

        {/* Transactions List */}
        {loading && !refreshing ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#4f46e5" />
            <Text style={styles.loadingText}>Loading metrics...</Text>
          </View>
        ) : recentTransactions.length === 0 ? (
          <View style={styles.emptyBox}>
            <Layers size={38} color="#94a3b8" />
            <Text style={styles.emptyText}>No transactions found for your account.</Text>
            <Text style={styles.emptySubText}>Material sourcing vouchers created by you will appear here.</Text>
          </View>
        ) : (
          recentTransactions.map((item, index) => {
            const rawId = item.transactionId || (item._id ? `REQ-${String(item._id).slice(-6).toUpperCase()}` : `#${index + 1}`);
            const matCount = Array.isArray(item.materials) ? item.materials.length : 1;
            const createdDate = formatDate(item.createdAt);

            return (
              <TouchableOpacity
                key={item._id || item.transactionId || String(index)}
                style={styles.recentItem}
                activeOpacity={0.75}
                onPress={() => navigation.navigate('MaterialDetailScreen', { id: item._id || item.transactionId })}
              >
                <View style={styles.recentItemLeft}>
                  <View style={styles.packageIconWrap}>
                    <Package size={18} color="#4f46e5" />
                  </View>
                  <View style={styles.recentItemInfo}>
                    <Text style={styles.recentTxnId}>{rawId}</Text>
                    <View style={styles.recentMetaRow}>
                      <Text style={styles.recentMeta}>{matCount} Material Item(s)</Text>
                      {createdDate ? (
                        <>
                          <Text style={styles.metaDot}>•</Text>
                          <Text style={styles.recentDate}>{createdDate}</Text>
                        </>
                      ) : null}
                    </View>
                  </View>
                </View>

                <View style={styles.recentItemRight}>
                  {item.status ? <StatusBadge status={item.status} /> : null}
                  <ChevronRight size={18} color="#94a3b8" />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Scanner Modal */}
      <BarcodeScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScanSuccess={handleScanSuccess}
      />

      {/* Material Module Footer */}
      <MaterialModuleFooter navigation={navigation} currentScreen="dashboard" />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  metricCard: {
    width: '48%',
    borderRadius: 14,
    padding: 16,
    justifyContent: 'space-between',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  metricIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#64748b',
    letterSpacing: 0.8,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#4f46e5',
  },
  loadingBox: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  emptyBox: {
    padding: 36,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
  },
  emptySubText: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
  },
  recentItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  packageIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentItemInfo: {
    flex: 1,
  },
  recentTxnId: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 2,
  },
  recentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  recentMeta: {
    fontSize: 12,
    color: '#64748b',
  },
  metaDot: {
    marginHorizontal: 5,
    fontSize: 12,
    color: '#94a3b8',
  },
  recentDate: {
    fontSize: 11,
    color: '#94a3b8',
  },
  recentItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});

export default MaterialDashboardScreen;
