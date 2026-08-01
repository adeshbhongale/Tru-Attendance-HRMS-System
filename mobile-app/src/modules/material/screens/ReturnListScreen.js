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
import { RotateCcw, QrCode, User } from 'lucide-react-native';
import MaterialHeader from '../components/MaterialHeader';
import StatusBadge from '../components/StatusBadge';
import materialApi from '../api/materialApi';

const ReturnListScreen = ({ navigation }) => {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchReturns = async () => {
    try {
      setLoading(true);
      const res = await materialApi.getReturnsList();
      if (res && (res.success || Array.isArray(res))) {
        setReturns(res.data || res || []);
      }
    } catch (e) {
      console.warn('Error fetching returns', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchReturns();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title="Store Returns"
        subtitle="Warehouse return inspection logs"
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

      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#dc2626" />
        </View>
      ) : (
        <FlatList
          data={returns}
          keyExtractor={(item) => item._id || item.barcode}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('BarcodeDetailScreen', { barcode: item.barcode })}
            >
              <View style={styles.topRow}>
                <View style={styles.barcodeBox}>
                  <QrCode size={16} color="#dc2626" />
                  <Text style={styles.barcodeText}>{item.barcode}</Text>
                </View>
                <StatusBadge status={item.status || 'returned'} />
              </View>

              <View style={styles.divider} />

              <View style={styles.metaRow}>
                <User size={14} color="#64748b" />
                <Text style={styles.metaText}>Returned By: {item.fromUser?.fullName || 'Staff'}</Text>
              </View>
              {item.condition && (
                <View style={styles.condBadge}>
                  <Text style={styles.condText}>Condition: {item.condition}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchReturns(); }} colors={['#dc2626']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <RotateCcw size={40} color="#94a3b8" />
              <Text style={styles.emptyText}>No store return requests logged.</Text>
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
  newBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#dc2626',
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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  metaText: {
    fontSize: 13,
    color: '#475569',
  },
  condBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff7ed',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  condText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#ea580c',
    textTransform: 'capitalize',
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

export default ReturnListScreen;
