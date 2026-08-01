import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { QrCode, User, ChevronRight, Layers } from 'lucide-react-native';
import StatusBadge from './StatusBadge';

const BarcodeCard = ({ item, onPress }) => {
  const ownerName = item.owner?.fullName || item.owner?.name || 'Store Stock / Unassigned';

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.barcodeBox}>
          <QrCode size={18} color="#4f46e5" />
          <Text style={styles.barcodeText}>{item.barcode}</Text>
        </View>
        <StatusBadge status={item.status} />
      </View>

      <Text style={styles.matName}>{item.materialName}</Text>

      <View style={styles.divider} />

      <View style={styles.bottomRow}>
        <View style={styles.infoCol}>
          <View style={styles.metaRow}>
            <User size={14} color="#64748b" />
            <Text style={styles.metaText} numberOfLines={1}>{ownerName}</Text>
          </View>
          {item.parentBarcode && (
            <View style={styles.metaRow}>
              <Layers size={14} color="#0284c7" />
              <Text style={styles.parentText}>Parent: {item.parentBarcode}</Text>
            </View>
          )}
        </View>

        <ChevronRight size={20} color="#94a3b8" />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  barcodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barcodeText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  matName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 8,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoCol: {
    flex: 1,
    gap: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    color: '#475569',
  },
  parentText: {
    fontSize: 12,
    color: '#0284c7',
    fontWeight: '500',
  },
});

export default BarcodeCard;
