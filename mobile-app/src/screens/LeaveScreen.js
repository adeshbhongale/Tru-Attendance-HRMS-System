import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { theme } from '../theme';
import { Calendar, Plus } from 'lucide-react-native';

const LeaveScreen = () => {
  const history = [
    { id: 1, type: 'Sick Leave', status: 'Approved', days: '2 Days', date: 'May 02 - May 04' },
    { id: 2, type: 'Casual Leave', status: 'Pending', days: '1 Day', date: 'May 10 - May 10' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Leave Management</Text>
        <TouchableOpacity style={styles.addBtn}>
          <Plus size={24} color="white" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.balanceContainer}>
          <View style={styles.balanceCard}>
            <Text style={styles.balanceVal}>12</Text>
            <Text style={styles.balanceLabel}>Sick</Text>
          </View>
          <View style={styles.balanceCard}>
            <Text style={styles.balanceVal}>08</Text>
            <Text style={styles.balanceLabel}>Casual</Text>
          </View>
          <View style={styles.balanceCard}>
            <Text style={styles.balanceVal}>15</Text>
            <Text style={styles.balanceLabel}>Paid</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Leave History</Text>
        
        {history.map(item => (
          <View key={item.id} style={styles.historyCard}>
            <View style={styles.historyInfo}>
              <Text style={styles.historyType}>{item.type}</Text>
              <Text style={styles.historyDate}>{item.date} • {item.days}</Text>
            </View>
            <View style={[
              styles.statusBadge, 
              { backgroundColor: item.status === 'Approved' ? '#dcfce7' : '#fef3c7' }
            ]}>
              <Text style={[
                styles.statusText,
                { color: item.status === 'Approved' ? '#166534' : '#92400e' }
              ]}>{item.status}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.text,
  },
  addBtn: {
    width: 45,
    height: 45,
    borderRadius: 15,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 20,
  },
  balanceContainer: {
    flexDirection: 'row',
    gap: 15,
    marginBottom: 30,
  },
  balanceCard: {
    flex: 1,
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 20,
    alignItems: 'center',
    ...theme.shadows.light,
  },
  balanceVal: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.primary,
  },
  balanceLabel: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 5,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 15,
  },
  historyCard: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    ...theme.shadows.light,
  },
  historyType: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  historyDate: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
});

export default LeaveScreen;
