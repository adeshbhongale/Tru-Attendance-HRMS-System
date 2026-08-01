import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Calendar, Package, ChevronRight, User, Layers } from 'lucide-react-native';
import StatusBadge from './StatusBadge';

const MaterialCard = ({ item, onPress }) => {
  const dateStr = item.createdAt
    ? new Date(item.createdAt).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : 'N/A';

  const itemCount = item.materials ? item.materials.length : 0;
  const requesterName = item.requester?.fullName || item.requester?.name || 'Unknown User';

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.txnIdBox}>
          <Package size={16} color="#4f46e5" />
          <Text style={styles.txnIdText}>{item.transactionId || item._id}</Text>
        </View>
        <StatusBadge status={item.status} />
      </View>

      <View style={styles.divider} />

      <View style={styles.bodyRow}>
        <View style={styles.infoCol}>
          <View style={styles.metaRow}>
            <User size={14} color="#64748b" />
            <Text style={styles.metaText} numberOfLines={1}>{requesterName}</Text>
          </View>

          <View style={styles.metaRow}>
            <Layers size={14} color="#64748b" />
            <Text style={styles.metaText}>{itemCount} Material Type(s)</Text>
          </View>

          <View style={styles.metaRow}>
            <Calendar size={14} color="#64748b" />
            <Text style={styles.metaText}>{dateStr}</Text>
          </View>
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  txnIdBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  txnIdText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 10,
  },
  bodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoCol: {
    flex: 1,
    gap: 6,
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
});

export default MaterialCard;
