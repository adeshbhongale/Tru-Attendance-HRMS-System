import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { Search, X, Package, Database } from 'lucide-react-native';
import materialApi from '../api/materialApi';

const TallyMaterialSelectModal = ({ visible, onClose, onSelect }) => {
  const [materials, setMaterials] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (visible) {
      loadTallyInventory();
    }
  }, [visible]);

  const loadTallyInventory = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      const res = await materialApi.getTallyInventory();
      if (res && (res.success || res.materials)) {
        const list = res.materials || res.data || [];
        setMaterials(list);
      } else {
        setErrorMsg(res?.message || 'Could not load Tally items.');
      }
    } catch (e) {
      setErrorMsg('Tally server unreachable or offline.');
    } finally {
      setLoading(false);
    }
  };

  const filtered = materials.filter((m) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = (m.name || m.materialName || '').toLowerCase();
    const grp = (m.group || '').toLowerCase();
    const cat = (m.category || '').toLowerCase();
    return name.includes(q) || grp.includes(q) || cat.includes(q);
  });

  const handleSelectItem = (item) => {
    onSelect({
      materialName: item.name || item.materialName,
      unit: item.unit || 'Pcs',
      rate: item.price || item.rate || 0,
      price: item.price || item.rate || 0,
      group: item.group || '',
      category: item.category || '',
    });
    onClose();
  };

  const handleUseCustomName = () => {
    if (!searchQuery.trim()) return;
    onSelect({
      materialName: searchQuery.trim(),
      unit: 'Pcs',
      rate: 0,
      price: 0,
    });
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Database size={20} color="#4f46e5" />
            <Text style={styles.headerTitle}>Select Tally Material Stock</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <X size={22} color="#64748b" />
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBox}>
            <Search size={18} color="#94a3b8" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search Tally Stock Name, Group, or Category..."
              placeholderTextColor="#94a3b8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
          </View>
        </View>

        {/* Items List */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#4f46e5" />
            <Text style={styles.loadingText}>Fetching live Tally inventory...</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item, index) => item.name || String(index)}
            renderItem={({ item }) => {
              const priceVal = item.price || item.rate || 0;

              return (
                <TouchableOpacity
                  style={styles.itemRow}
                  onPress={() => handleSelectItem(item)}
                >
                  <View style={styles.itemIconBox}>
                    <Package size={18} color="#4f46e5" />
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{item.name || item.materialName}</Text>
                    <Text style={styles.itemSub}>
                      {item.group ? `Group: ${item.group}` : ''}
                      {item.group && item.category ? ' • ' : ''}
                      {item.category ? `Cat: ${item.category}` : ''}
                    </Text>
                  </View>
                  <View style={styles.badgeColumn}>
                    <View style={styles.unitBadge}>
                      <Text style={styles.unitText}>{item.unit || 'Pcs'}</Text>
                    </View>
                    {priceVal > 0 && (
                      <Text style={styles.priceText}>₹{priceVal}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            }}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>
                  {errorMsg || 'No matching Tally stock items found.'}
                </Text>
                {searchQuery.trim() ? (
                  <TouchableOpacity onPress={handleUseCustomName} style={styles.customBtn}>
                    <Text style={styles.customBtnText}>
                      Use Custom Name: "{searchQuery.trim()}"
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            }
          />
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  closeBtn: {
    padding: 6,
  },
  searchContainer: {
    padding: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748b',
  },
  listContent: {
    padding: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  itemIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  itemSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  badgeColumn: {
    alignItems: 'flex-end',
    gap: 4,
  },
  unitBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  unitText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#475569',
  },
  priceText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#16a34a',
  },
  emptyBox: {
    padding: 30,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
  },
  customBtn: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  customBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 13,
  },
});

export default TallyMaterialSelectModal;
