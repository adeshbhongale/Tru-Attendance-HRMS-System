import AsyncStorage from '@react-native-async-storage/async-storage';
import { Calendar, ChevronDown, Send, ShieldCheck, User, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import materialApi from '../api/materialApi';
import MaterialHeader from '../components/MaterialHeader';

const HandlerAssignmentScreen = ({ route, navigation }) => {
  const transactionId = route.params?.id || route.params?.transactionId || '';
  const [handlers, setHandlers] = useState([]);
  const [selectedHandlerId, setSelectedHandlerId] = useState('');
  const [handlerModalVisible, setHandlerModalVisible] = useState(false);
  const [handlerSearchQuery, setHandlerSearchQuery] = useState('');
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
      let curUserId = '';
      let curEmpId = '';
      let curEmail = '';
      try {
        const uStr = await AsyncStorage.getItem('user');
        if (uStr) {
          const uObj = JSON.parse(uStr);
          curUserId = String(uObj._id || uObj.id || uObj.user?._id || uObj.user?.id || '').toLowerCase();
          curEmpId = String(uObj.employeeId || uObj.user?.employeeId || '').toLowerCase();
          curEmail = String(uObj.email || uObj.user?.email || '').toLowerCase();
        }
      } catch (e) { }

      let reqId = '';
      let reqEmpId = '';
      let reqEmail = '';
      let hId = '';
      let hEmpId = '';
      if (transactionId) {
        try {
          const txRes = await materialApi.getTransactionById(transactionId);
          const t = txRes?.data || txRes?.transaction || txRes;
          if (t) {
            reqId = String(typeof t.requester === 'object' ? (t.requester?._id || t.requester?.id || '') : (t.requester || '')).toLowerCase();
            reqEmpId = String(typeof t.requester === 'object' ? (t.requester?.employeeId || '') : '').toLowerCase();
            reqEmail = String(typeof t.requester === 'object' ? (t.requester?.email || '') : '').toLowerCase();

            hId = String(typeof t.handler === 'object' ? (t.handler?._id || t.handler?.id || '') : (t.handler || '')).toLowerCase();
            hEmpId = String(typeof t.handler === 'object' ? (t.handler?.employeeId || '') : '').toLowerCase();
          }
        } catch (e) { }
      }

      const res = await materialApi.getUsers();
      if (res && (res.employees || res.data?.employees || res.data || Array.isArray(res))) {
        const list = res.employees || res.data?.employees || res.data || (Array.isArray(res) ? res : []);
        const filtered = list.filter((h) => {
          if (!h) return false;
          const uid = String(h._id || h.id || '').toLowerCase();
          const empId = String(h.employeeId || '').toLowerCase();
          const email = String(h.email || '').toLowerCase();
          const hRole = String(h.role || '').toLowerCase();

          // 1. Exclude Current User (name, ID, email)
          if (curUserId && uid === curUserId) return false;
          if (curEmpId && empId === curEmpId) return false;
          if (curEmail && email === curEmail) return false;

          // 2. Exclude Current Assigned Handler
          if (hId && uid === hId) return false;
          if (hEmpId && empId === hEmpId) return false;

          // 3. Exclude Requester (name, ID, email)
          if (reqId && uid === reqId) return false;
          if (reqEmpId && empId === reqEmpId) return false;
          if (reqEmail && email === reqEmail) return false;

          // 4. Exclude Company Admin, Super Admin, and System Admin
          if (['company_admin', 'super_admin', 'admin'].includes(hRole)) return false;

          return true;
        });

        setHandlers(filtered);
        if (filtered.length > 0) {
          setSelectedHandlerId(filtered[0]._id || filtered[0].id);
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

            {/* Dropdown Selector Box matching StoreDispatchScreen.js */}
            <TouchableOpacity
              style={styles.handlerSelectBox}
              onPress={() => setHandlerModalVisible(true)}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <User size={18} color="#2563eb" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: '#0f172a', fontWeight: '700' }} numberOfLines={1}>
                    {(() => {
                      const h = handlers.find((u) => (u._id || u.id) === selectedHandlerId);
                      return h ? (h.fullName || h.name) : 'Select Delivery Handler...';
                    })()}
                  </Text>
                  {(() => {
                    const h = handlers.find((u) => (u._id || u.id) === selectedHandlerId);
                    return h ? (
                      <Text style={{ fontSize: 11, color: '#64748b' }}>
                        {h.department?.name || h.designation || `ID: ${h.employeeId || 'EMP'}`}
                      </Text>
                    ) : null;
                  })()}
                </View>
              </View>
              <ChevronDown size={18} color="#64748b" />
            </TouchableOpacity>

            {/* <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
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
            </ScrollView> */}

            {/* Expected Delivery Date */}
            <Text style={styles.fieldLabel}>EXPECTED DELIVERY DATE & TIME *</Text>
            <View style={styles.inputRow}>
              <Calendar size={18} color="#64748b" />
              <TextInput
                style={styles.textInput}
                placeholder="YYYY-MM-DD THH:mm (e.g. 2026-08-01 10:00)"
                placeholderTextColor="#94a3b8"
                value={expectedDeliveryDate}
              // onChangeText={setExpectedDeliveryDate}
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

      {/* Sourcing Handler Selection Modal */}
      <Modal visible={handlerModalVisible} animationType="slide" transparent={false}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#ffffff' }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Delivery Handler</Text>
            <TouchableOpacity onPress={() => setHandlerModalVisible(false)}>
              <X size={20} color="#0f172a" />
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.searchBar}
            value={handlerSearchQuery}
            onChangeText={setHandlerSearchQuery}
            placeholder="Search handler by name, ID or department..."
            placeholderTextColor="#94a3b8"
          />
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {handlers
              .filter((h) => {
                if (!handlerSearchQuery.trim()) return true;
                const q = handlerSearchQuery.toLowerCase();
                return (
                  (h.fullName || h.name || '').toLowerCase().includes(q) ||
                  (h.employeeId || '').toLowerCase().includes(q) ||
                  (h.department?.name || h.designation || '').toLowerCase().includes(q)
                );
              })
              .map((h) => {
                const hid = h._id || h.id;
                const isSelected = selectedHandlerId === hid;
                return (
                  <TouchableOpacity
                    key={hid}
                    style={styles.empRow}
                    onPress={() => {
                      setSelectedHandlerId(hid);
                      setHandlerModalVisible(false);
                    }}
                  >
                    <User size={18} color="#2563eb" />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.empName}>{h.fullName || h.name}</Text>
                      <Text style={styles.empSub}>
                        {h.department?.name || h.designation || 'Logistics'} • ID: {h.employeeId || 'EMP'}
                      </Text>
                    </View>
                    {isSelected && <ShieldCheck size={18} color="#16a34a" />}
                  </TouchableOpacity>
                );
              })}
            {handlers.length === 0 && (
              <Text style={{ padding: 14, color: '#94a3b8', fontSize: 13 }}>No eligible delivery handlers available.</Text>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
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
  handlerSelectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  searchBar: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 14,
    height: 42,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 8,
    fontSize: 13,
    color: '#0f172a',
  },
  empRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  empName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  empSub: {
    fontSize: 11,
    color: '#64748b',
  },
});

export default HandlerAssignmentScreen;
