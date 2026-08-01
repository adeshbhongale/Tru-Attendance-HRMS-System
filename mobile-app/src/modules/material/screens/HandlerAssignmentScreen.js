import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, Calendar, Send, FileText, CheckCircle2 } from 'lucide-react-native';
import MaterialHeader from '../components/MaterialHeader';
import materialApi from '../api/materialApi';

const HandlerAssignmentScreen = ({ route, navigation }) => {
  const transactionId = route.params?.id || route.params?.transactionId || '';
  const [handlers, setHandlers] = useState([]);
  const [selectedHandlerId, setSelectedHandlerId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(
    new Date(Date.now() + 86400000).toISOString().slice(0, 16)
  );
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadHandlers();
  }, []);

  const loadHandlers = async () => {
    try {
      setLoading(true);
      const res = await materialApi.getUsers();
      if (res && (res.employees || res.data?.employees || res.data || Array.isArray(res))) {
        const list = res.employees || res.data?.employees || res.data || (Array.isArray(res) ? res : []);
        setHandlers(list);
        if (list.length > 0) {
          setSelectedHandlerId(list[0]._id || list[0].id);
        }
      }
    } catch (err) {
      console.warn('Failed to load handlers list', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedHandlerId) {
      Alert.alert('Validation Error', 'Please select a delivery handler.');
      return;
    }
    if (!expectedDeliveryDate.trim()) {
      Alert.alert('Validation Error', 'Please enter expected delivery date and time.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        handlerId: selectedHandlerId,
        remarks: remarks.trim(),
        expectedDeliveryDate: expectedDeliveryDate.trim(),
      };

      const res = await materialApi.assignHandler(transactionId, payload);
      if (res && (res.success || res.message || res._id)) {
        Alert.alert('Success', 'Delivery handler assigned successfully!');
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.navigate('MaterialDetailScreen', { id: transactionId });
        }
      } else {
        Alert.alert('Error', res?.message || 'Failed to assign handler.');
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title="Assign Delivery Handler"
        subtitle={`Transaction Voucher: ${transactionId || 'N/A'}`}
        navigation={navigation}
      />

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading Handlers List...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.card}>
            {/* Handler Picker */}
            <Text style={styles.fieldLabel}>SELECT DELIVERY HANDLER *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
              {handlers.map((h) => {
                const hid = h._id || h.id;
                const hName = h.fullName || h.name || 'Staff Member';
                const deptName = h.department?.name || h.designation || 'Logistics';
                const isSelected = selectedHandlerId === hid;

                return (
                  <TouchableOpacity
                    key={hid}
                    style={[styles.handlerChip, isSelected && styles.handlerChipActive]}
                    onPress={() => setSelectedHandlerId(hid)}
                  >
                    <User size={16} color={isSelected ? '#ffffff' : '#64748b'} />
                    <View>
                      <Text style={[styles.chipTitle, isSelected && styles.chipTitleActive]}>
                        {hName}
                      </Text>
                      <Text style={[styles.chipSub, isSelected && styles.chipSubActive]}>
                        {deptName}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Expected Delivery Date */}
            <Text style={styles.fieldLabel}>EXPECTED DELIVERY DATE & TIME *</Text>
            <View style={styles.inputRow}>
              <Calendar size={18} color="#64748b" />
              <TextInput
                style={styles.textInput}
                placeholder="YYYY-MM-DD THH:mm (e.g. 2026-08-01 10:00)"
                placeholderTextColor="#94a3b8"
                value={expectedDeliveryDate}
                onChangeText={setExpectedDeliveryDate}
              />
            </View>

            {/* Instruction / Remarks */}
            <Text style={styles.fieldLabel}>DELIVERY INSTRUCTIONS / REMARKS</Text>
            <TextInput
              style={styles.textArea}
              multiline
              numberOfLines={3}
              placeholder="Add specific handling or dispatch instructions..."
              placeholderTextColor="#94a3b8"
              value={remarks}
              onChangeText={setRemarks}
            />

            {/* Action Buttons */}
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => navigation.goBack()}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <>
                    <Send size={16} color="#ffffff" />
                    <Text style={styles.submitBtnText}>Assign & Notify Handler</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  hScroll: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  handlerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    gap: 8,
  },
  handlerChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  chipTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  chipTitleActive: {
    color: '#ffffff',
  },
  chipSub: {
    fontSize: 11,
    color: '#64748b',
  },
  chipSubActive: {
    color: '#bfdbfe',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
    gap: 8,
  },
  textInput: {
    flex: 1,
    height: 46,
    fontSize: 14,
    color: '#0f172a',
  },
  textArea: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    padding: 12,
    fontSize: 14,
    color: '#0f172a',
    textAlignVertical: 'top',
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 12,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#2563eb',
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
});

export default HandlerAssignmentScreen;
