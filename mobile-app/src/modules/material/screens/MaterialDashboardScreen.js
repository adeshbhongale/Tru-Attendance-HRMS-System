import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import {
  Package,
  QrCode,
  Truck,
  Clock,
  Layers,
  ChevronRight,
} from 'lucide-react-native';
import MaterialHeader from '../components/MaterialHeader';
import BarcodeScannerModal from '../components/BarcodeScannerModal';
import materialApi from '../api/materialApi';

const MaterialDashboardScreen = ({ navigation }) => {
  const [refreshing, setRefreshing] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [stats, setStats] = useState({
    activeRequests: 0,
    barcodesInHand: 0,
    pendingApprovals: 0,
    dispatchedCount: 0,
  });
  const [recentTransactions, setRecentTransactions] = useState([]);

  const loadDashboardData = async () => {
    try {
      setRefreshing(true);
      const [metricsRes, txnsRes] = await Promise.all([
        materialApi.getDashboardMetrics(),
        materialApi.getTransactions({ limit: 5 }),
      ]);

      if (metricsRes) {
        setStats({
          activeRequests: metricsRes.activeRequests || metricsRes.totalCount || 0,
          barcodesInHand: metricsRes.barcodesInHand || metricsRes.activeBarcodes || 0,
          pendingApprovals: metricsRes.pendingApprovals || 0,
          dispatchedCount: metricsRes.dispatchedCount || 0,
        });
      }

      if (txnsRes && txnsRes.success) {
        setRecentTransactions(txnsRes.data || []);
      }
    } catch (e) {
      console.warn('Dashboard load error', e);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const handleScanSuccess = (code) => {
    navigation.navigate('BarcodeDetailScreen', { barcode: code });
  };

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title="Material Dashboard"
        subtitle="MMS Overview & Metrics Summary"
        navigation={navigation}
        showBack={false}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={loadDashboardData} colors={['#4f46e5']} />
        }
      >
        {/* Metrics Grid */}
        <View style={styles.metricsGrid}>
          <TouchableOpacity
            style={[styles.metricCard, { backgroundColor: '#eef2ff' }]}
            onPress={() => navigation.navigate('MaterialListScreen', { tab: 'all' })}
          >
            <View style={styles.metricIconRow}>
              <Package size={22} color="#4f46e5" />
              <Text style={[styles.metricValue, { color: '#3730a3' }]}>{stats.activeRequests}</Text>
            </View>
            <Text style={styles.metricLabel}>Total Requests</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.metricCard, { backgroundColor: '#e0f2fe' }]}
            onPress={() => navigation.navigate('BarcodeViewAllScreen')}
          >
            <View style={styles.metricIconRow}>
              <QrCode size={22} color="#0284c7" />
              <Text style={[styles.metricValue, { color: '#075985' }]}>{stats.barcodesInHand}</Text>
            </View>
            <Text style={styles.metricLabel}>Active Barcodes</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.metricCard, { backgroundColor: '#fef3c7' }]}
            onPress={() => navigation.navigate('PendingTransactionsScreen')}
          >
            <View style={styles.metricIconRow}>
              <Clock size={22} color="#d97706" />
              <Text style={[styles.metricValue, { color: '#92400e' }]}>{stats.pendingApprovals}</Text>
            </View>
            <Text style={styles.metricLabel}>Pending Action</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.metricCard, { backgroundColor: '#f3e8ff' }]}
            onPress={() => navigation.navigate('MaterialListScreen', { tab: 'dispatched' })}
          >
            <View style={styles.metricIconRow}>
              <Truck size={22} color="#9333ea" />
              <Text style={[styles.metricValue, { color: '#6b21a8' }]}>{stats.dispatchedCount}</Text>
            </View>
            <Text style={styles.metricLabel}>Dispatched Items</Text>
          </TouchableOpacity>
        </View>

        {/* Recent Transactions List */}
        <View style={styles.recentHeader}>
          <Text style={styles.sectionTitle}>RECENT TRANSACTIONS</Text>
          <TouchableOpacity onPress={() => navigation.navigate('MaterialListScreen', { tab: 'all' })}>
            <Text style={styles.seeAllText}>View All</Text>
          </TouchableOpacity>
        </View>

        {recentTransactions.length === 0 ? (
          <View style={styles.emptyBox}>
            <Layers size={36} color="#94a3b8" />
            <Text style={styles.emptyText}>No recent transactions found.</Text>
          </View>
        ) : (
          recentTransactions.map((item) => (
            <TouchableOpacity
              key={item._id || item.transactionId}
              style={styles.recentItem}
              onPress={() => navigation.navigate('MaterialDetailScreen', { id: item._id || item.transactionId })}
            >
              <View style={styles.recentItemLeft}>
                <Package size={18} color="#4f46e5" />
                <View>
                  <Text style={styles.recentTxnId}>{item.transactionId}</Text>
                  <Text style={styles.recentMeta}>{item.materials?.length || 0} Material Item(s)</Text>
                </View>
              </View>
              <ChevronRight size={18} color="#94a3b8" />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Scanner Modal */}
      <BarcodeScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScanSuccess={handleScanSuccess}
      />
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
  emptyBox: {
    padding: 40,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  recentItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  recentTxnId: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  recentMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
});

export default MaterialDashboardScreen;
