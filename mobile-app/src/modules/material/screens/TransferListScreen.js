import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { ArrowRightLeft, QrCode, User, Calendar } from 'lucide-react-native';
import MaterialHeader from '../components/MaterialHeader';
import MaterialModuleFooter from '../components/MaterialModuleFooter';
import StatusBadge from '../components/StatusBadge';
import materialApi from '../api/materialApi';

const TransferListScreen = ({ navigation }) => {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTransfers = async () => {
    try {
      setLoading(true);
      const res = await materialApi.getTransfersList();
      if (res && (res.success || Array.isArray(res))) {
        setTransfers(res.data || res || []);
      }
    } catch (e) {
      console.warn('Error fetching transfers', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTransfers();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title="Custody Transfers"
        subtitle="Peer-to-peer barcode transfer logs"
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

      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#ea580c" />
        </View>
      ) : (
        <FlatList
          data={transfers}
          keyExtractor={(item) => item._id || item.barcode}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('BarcodeDetailScreen', { barcode: item.barcode })}
            >
              <View style={styles.topRow}>
                <View style={styles.barcodeBox}>
                  <QrCode size={16} color="#ea580c" />
                  <Text style={styles.barcodeText}>{item.barcode}</Text>
                </View>
                <StatusBadge status={item.status || 'pending_acceptance'} />
              </View>

              <View style={styles.divider} />

              <View style={styles.usersRow}>
                <View style={styles.userCol}>
                  <Text style={styles.userLabel}>From:</Text>
                  <Text style={styles.userName}>{item.fromUser?.fullName || 'Sender'}</Text>
                </View>
                <ArrowRightLeft size={16} color="#94a3b8" />
                <View style={styles.userCol}>
                  <Text style={styles.userLabel}>To:</Text>
                  <Text style={styles.userName}>{item.toUser?.fullName || 'Recipient'}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchTransfers(); }} colors={['#ea580c']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <ArrowRightLeft size={40} color="#94a3b8" />
              <Text style={styles.emptyText}>No custody transfers recorded.</Text>
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
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  barcodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barcodeText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 10,
  },
  usersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userCol: {
    flex: 1,
  },
  userLabel: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },
  userName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#334155',
    marginTop: 2,
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
});

export default TransferListScreen;
