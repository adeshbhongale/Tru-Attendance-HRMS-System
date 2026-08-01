import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const STATUS_CONFIG = {
  submitted: { label: 'Submitted', bg: '#eff6ff', text: '#2563eb' },
  tl_approved: { label: 'TL Approved', bg: '#f0fdf4', text: '#16a34a' },
  mgt_approved: { label: 'Mgt Approved', bg: '#ecfdf5', text: '#059669' },
  store_accepted: { label: 'Store Accepted', bg: '#fef3c7', text: '#d97706' },
  handler_assigned: { label: 'Handler Assigned', bg: '#fef9c3', text: '#ca8a04' },
  dispatched: { label: 'Dispatched', bg: '#f3e8ff', text: '#9333ea' },
  received: { label: 'Received', bg: '#e0e7ff', text: '#4f46e5' },
  active: { label: 'Active', bg: '#dcfce7', text: '#15803d' },
  closed: { label: 'Closed', bg: '#f1f5f9', text: '#475569' },
  rejected: { label: 'Rejected', bg: '#fef2f2', text: '#dc2626' },
  pending_acceptance: { label: 'Pending Hand-off', bg: '#ffedd5', text: '#ea580c' },
  split: { label: 'Split', bg: '#e0f2fe', text: '#0284c7' },
  returned: { label: 'Returned to Store', bg: '#f3f4f6', text: '#4b5563' },
};

const StatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status?.toLowerCase()] || {
    label: status ? status.replace(/_/g, ' ') : 'Unknown',
    bg: '#f3f4f6',
    text: '#6b7280',
  };

  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.text, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});

export default StatusBadge;
