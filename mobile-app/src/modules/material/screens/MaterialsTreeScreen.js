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
import { Folder, Package, ChevronRight, Database } from 'lucide-react-native';
import MaterialHeader from '../components/MaterialHeader';
import MaterialModuleFooter from '../components/MaterialModuleFooter';
import materialApi from '../api/materialApi';

const MaterialsTreeScreen = ({ navigation }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTree = async () => {
    try {
      setLoading(true);
      const res = await materialApi.getTallyInventory();
      if (res && (res.materials || res.data)) {
        setItems(res.materials || res.data || []);
      }
    } catch (e) {
      console.warn('Materials tree error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTree();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title="Materials Stock Tree"
        subtitle="Master stock item hierarchy"
        navigation={navigation}
      />

      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4f46e5" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, index) => item.name || String(index)}
          renderItem={({ item }) => (
            <View style={styles.treeCard}>
              <View style={styles.cardHeader}>
                <Folder size={18} color="#4f46e5" />
                <Text style={styles.groupTitle}>{item.group || item.category || 'Stock Master'}</Text>
              </View>

              <View style={styles.itemRow}>
                <Package size={16} color="#64748b" />
                <View style={styles.itemInfo}>
                  <Text style={styles.matName}>{item.name || item.materialName}</Text>
                  <Text style={styles.matSub}>Unit: {item.unit || 'Pcs'}</Text>
                </View>
                {item.price > 0 && <Text style={styles.priceText}>₹{item.price}</Text>}
              </View>
            </View>
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchTree(); }} colors={['#4f46e5']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Database size={40} color="#94a3b8" />
              <Text style={styles.emptyText}>No stock items available in Tally master.</Text>
            </View>
          }
        />
      )}

      {/* Material Module Footer */}
      <MaterialModuleFooter navigation={navigation} currentScreen="tree" />
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
  listContent: {
    padding: 16,
  },
  treeCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    marginBottom: 8,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#4f46e5',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemInfo: {
    flex: 1,
  },
  matName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  matSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  priceText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#059669',
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

export default MaterialsTreeScreen;
