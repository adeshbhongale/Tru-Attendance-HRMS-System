import DateTimePicker from '@react-native-community/datetimepicker';
import { ArrowLeft, Calendar, ChevronDown, Filter, Info, Plus, RotateCcw, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import api from '../api/axios';

const LEAVE_TYPES = ['Sick Leave', 'Casual Leave', 'Paid Leave'];
const STATUS_FILTERS = ['All', 'Pending', 'Approved', 'Rejected'];

// ── Inline styles for ALL Modal content (Android Modal creates a separate React root
//    outside NavigationContainer; NativeWind className causes context crash there) ──
const ms = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 48 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { fontSize: 20, fontWeight: 'bold', color: '#0f172a' },
  closeBtn: { backgroundColor: '#f1f5f9', padding: 8, borderRadius: 999 },
  filterItem: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: 18, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  filterItemActive: { backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#e0e7ff' },
  filterItemIdle: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: 'transparent' },
  filterText: { fontWeight: 'bold' },
  filterTextActive: { color: '#4f46e5' },
  filterTextIdle: { color: '#475569' },
  filterDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4f46e5' },
  // Apply Leave Modal
  handle: { width: 48, height: 4, backgroundColor: '#e2e8f0', borderRadius: 2, alignSelf: 'center', marginBottom: 24 },
  label: { fontSize: 10, fontWeight: 'bold', color: '#94a3b8', letterSpacing: 2, marginBottom: 10, marginLeft: 2 },
  typeBtn: { flex: 1, paddingVertical: 16, borderRadius: 18, alignItems: 'center', borderWidth: 1 },
  typeBtnActive: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  typeBtnIdle: { backgroundColor: '#fff', borderColor: '#e2e8f0' },
  typeBtnText: { fontSize: 10, fontWeight: 'bold' },
  typeBtnTextAct: { color: '#fff' },
  typeBtnTextIdle: { color: '#64748b' },
  dateBtn: { backgroundColor: '#f8fafc', borderRadius: 18, paddingHorizontal: 16, height: 56, justifyContent: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  dateBtnText: { color: '#1e293b', fontWeight: 'bold' },
  reasonBox: { backgroundColor: '#f8fafc', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 28, borderWidth: 1, borderColor: '#e2e8f0' },
  submitBtn: { backgroundColor: '#4f46e5', height: 64, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  durationBadge: { backgroundColor: '#eef2ff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginTop: 8 },
  durationText: { fontSize: 10, fontWeight: 'bold', color: '#4f46e5' },
});

const LeaveScreen = ({ navigation }) => {
  const [leaves, setLeaves] = useState([]);
  const [filteredLeaves, setFilteredLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState('All');
  const [balance, setBalance] = useState({ used: 0, limit: 3, remaining: 3 });
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [visibleLeaves, setVisibleLeaves] = useState(5);
  const [historyDateFilter, setHistoryDateFilter] = useState(null);
  const [showHistoryDatePicker, setShowHistoryDatePicker] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [form, setForm] = useState({
    leaveType: 'Sick Leave',
    startDate: new Date(),
    endDate: new Date(),
    reason: '',
  });

  useEffect(() => {
    fetchLeaves();
  }, []);

  useEffect(() => {
    if (filter === 'All') {
      setFilteredLeaves(leaves);
    } else {
      setFilteredLeaves(leaves.filter(l => l.status === filter));
    }
  }, [filter, leaves]);

  const fetchLeaves = async () => {
    try {
      setLoading(true);
      const res = await api.get('/leaves/my-leaves');
      const data = res.data.data || [];
      setLeaves(data);
      setFilteredLeaves(data);
      setBalance({
        used: res.data.monthlyUsed || 0,
        limit: res.data.monthlyLimit || 3,
        remaining: res.data.balance || 0
      });
    } catch (err) {
      Alert.alert('Error', 'Could not load your leave records.');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!form.reason.trim()) {
      Alert.alert('Required', 'Please enter a reason for your leave.');
      return;
    }
    if (form.endDate < form.startDate) {
      Alert.alert('Invalid Date', 'End date must be on or after the start date.');
      return;
    }
    if (balance.remaining <= 0) {
      Alert.alert('Limit Reached', 'You have already used your 3 leaves for this month.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/leaves', {
        leaveType: form.leaveType,
        startDate: form.startDate.toISOString().split('T')[0],
        endDate: form.endDate.toISOString().split('T')[0],
        reason: form.reason.trim(),
      });
      Alert.alert('Leave Applied', 'Your leave request has been submitted successfully.');
      setModalVisible(false);
      setForm({ leaveType: 'Sick Leave', startDate: new Date(), endDate: new Date(), reason: '' });
      fetchLeaves();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Could not submit your leave request.');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'Approved': return { bg: '#ecfdf5', text: '#059669' };
      case 'Rejected': return { bg: '#fff1f2', text: '#e11d48' };
      default: return { bg: '#fffbeb', text: '#d97706' };
    }
  };

  const formatDateLabel = (date) =>
    date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const formatLocalDate = (date) => {
    if (!date) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  return (
    <View className="flex-1 bg-slate-50">
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View className="pt-14 px-6 pb-5 bg-white border-b border-slate-100 flex-row justify-between items-center">
        <View className="flex-row items-center">
          <TouchableOpacity
            className="w-10 h-10 rounded-xl bg-slate-50 justify-center items-center border border-slate-100 mr-4"
            onPress={() => navigation.navigate('Home')}
          >
            <ArrowLeft size={20} color="#64748b" />
          </TouchableOpacity>
          <View>
            <Text className="text-2xl font-extrabold text-slate-900 tracking-tight">Leaves</Text>
            <Text className="text-slate-400 font-bold text-xs">Monthly Limit: {balance.limit}</Text>
          </View>
        </View>
        <View className="flex-row items-center gap-3">
          <TouchableOpacity
            onPress={fetchLeaves}
            className="w-10 h-10 rounded-xl bg-slate-50 justify-center items-center border border-slate-100"
          >
            <RotateCcw size={18} color="#64748b" />
          </TouchableOpacity>
          {balance.remaining > 0 && (
            <TouchableOpacity
              className="w-12 h-12 rounded-2xl bg-indigo-600 justify-center items-center"
              onPress={() => setModalVisible(true)}
              style={{ shadowColor: '#4f46e5', shadowOpacity: 0.3, shadowRadius: 8 }}
            >
              <Plus size={24} color="white" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Balance Banner */}
      <View className="bg-indigo-600 px-6 py-4 flex-row justify-between items-center">
        <View>
          <Text className="text-white font-bold text-sm">Monthly Balance</Text>
          <Text className="text-indigo-100 text-[10px] mt-0.5">Approved/Pending leaves this month</Text>
        </View>
        <View className="bg-white/20 px-4 py-2 rounded-xl border border-white/20">
          <Text className="text-white font-bold text-lg">{balance.remaining} / {balance.limit}</Text>
        </View>
      </View>

      {/* Filters Row */}
      <View className="bg-white px-6 py-4 border-b border-slate-100 flex-row gap-3">
        <TouchableOpacity
          onPress={() => setShowStatusModal(true)}
          className="flex-1 bg-slate-50 h-12 rounded-2xl border border-slate-100 flex-row items-center px-4"
        >
          <Filter size={16} color="#6366f1" />
          <Text className="flex-1 ml-2 text-xs font-bold text-slate-700" numberOfLines={1}>
            {filter === 'All' ? 'STATUS' : filter.toUpperCase()}
          </Text>
          <ChevronDown size={16} color="#94a3b8" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShowHistoryDatePicker(true)}
          className="flex-1 bg-slate-50 h-12 rounded-2xl border border-slate-100 flex-row items-center px-4"
        >
          <Calendar size={16} color="#6366f1" />
          <Text className="flex-1 ml-2 text-xs font-bold text-slate-700">
            {historyDateFilter ? formatLocalDate(historyDateFilter) : 'DATE'}
          </Text>
          {historyDateFilter && (
            <TouchableOpacity onPress={() => setHistoryDateFilter(null)}>
              <X size={14} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </View>

      {/* ─── STATUS FILTER MODAL — ALL INLINE STYLES (no className) ─── */}
      <Modal visible={showStatusModal} transparent animationType="fade">
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowStatusModal(false)}
          style={ms.overlay}
        >
          <View style={ms.sheet}>
            <View style={ms.row}>
              <Text style={ms.sheetTitle}>Filter Status</Text>
              <TouchableOpacity onPress={() => setShowStatusModal(false)} style={ms.closeBtn}>
                <X size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            <View style={{ height: 24 }} />
            {STATUS_FILTERS.map(s => (
              <TouchableOpacity
                key={s}
                onPress={() => { setFilter(s); setShowStatusModal(false); }}
                style={[ms.filterItem, filter === s ? ms.filterItemActive : ms.filterItemIdle]}
              >
                <Text style={[ms.filterText, filter === s ? ms.filterTextActive : ms.filterTextIdle]}>
                  {s}
                </Text>
                {filter === s && <View style={ms.filterDot} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {showHistoryDatePicker && (
        <DateTimePicker
          value={historyDateFilter || new Date()}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onChange={(event, selectedDate) => {
            setShowHistoryDatePicker(false);
            if (selectedDate) setHistoryDateFilter(selectedDate);
          }}
        />
      )}

      {/* Leave History List */}
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 110 }}>
        <View className="flex-row justify-between items-center mb-5">
          <View className="flex-row items-center">
            <Calendar size={16} color="#94a3b8" />
            <Text className="text-[10px] font-bold text-slate-400 tracking-widest ml-2">
              {filter} RECORDS
            </Text>
          </View>
          <Text className="text-[10px] font-bold text-indigo-600">{filteredLeaves.length} items</Text>
        </View>

        {loading ? (
          <ActivityIndicator color="#4f46e5" size="large" style={{ marginTop: 40 }} />
        ) : (
          leaves
            .filter(l => {
              const matchesStatus = filter === 'All' || l.status === filter;
              const matchesDate = !historyDateFilter || l.startDate?.includes(formatLocalDate(historyDateFilter));
              return matchesStatus && matchesDate;
            })
            .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))
            .slice(0, visibleLeaves)
            .map((item, index, array) => {
              const statusStyle = getStatusStyle(item.status);
              const date = new Date(item.startDate);
              const currentMonth = date.toLocaleString('default', { month: 'long', year: 'numeric' });
              let showHeader = index === 0;
              if (!showHeader) {
                const prevDate = new Date(array[index - 1].startDate);
                if (prevDate.toLocaleString('default', { month: 'long', year: 'numeric' }) !== currentMonth) {
                  showHeader = true;
                }
              }
              return (
                <View key={item._id}>
                  {showHeader && (
                    <View className="flex-row items-center mt-6 mb-4">
                      <View className="h-[1px] flex-1 bg-slate-200" />
                      <Text className="mx-4 text-[10px] font-bold text-slate-400 tracking-[2px]">{currentMonth}</Text>
                      <View className="h-[1px] flex-1 bg-slate-200" />
                    </View>
                  )}
                  <View className="bg-white p-5 rounded-2xl flex-row justify-between items-center mb-3 border border-slate-100">
                    <View className="flex-1">
                      <Text className="text-base font-extrabold text-slate-800">{item.leaveType}</Text>
                      <Text className="text-xs font-bold text-slate-400 mt-1">
                        {date.toLocaleDateString()} — {new Date(item.endDate).toLocaleDateString()}
                      </Text>
                      {item.reason && (
                        <Text className="text-xs text-slate-400 mt-1" numberOfLines={1}>{item.reason}</Text>
                      )}
                      <View className="mt-2 flex-row items-center">
                        <View className="bg-slate-100 px-2 py-0.5 rounded">
                          <Text className="text-[9px] font-bold text-slate-500">
                            {Math.ceil((new Date(item.endDate) - date) / (1000 * 60 * 60 * 24)) + 1} Day(s)
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, marginLeft: 12, backgroundColor: statusStyle.bg }}>
                      <Text style={{ fontSize: 10, fontWeight: 'bold', color: statusStyle.text }}>{item.status}</Text>
                    </View>
                  </View>
                </View>
              );
            })
        )}

        {leaves.filter(l => {
          const matchesStatus = filter === 'All' || l.status === filter;
          const matchesDate = !historyDateFilter || l.startDate?.includes(formatLocalDate(historyDateFilter));
          return matchesStatus && matchesDate;
        }).length > visibleLeaves && (
            <TouchableOpacity
              onPress={() => setVisibleLeaves(prev => prev + 5)}
              className="mt-4 py-4 bg-white rounded-2xl border border-slate-100 items-center shadow-sm"
            >
              <Text className="text-indigo-600 font-bold text-xs tracking-widest">Load More Records</Text>
            </TouchableOpacity>
          )}

        <View className="mt-6 bg-amber-50 p-4 rounded-2xl border border-amber-100 flex-row">
          <Info size={16} color="#d97706" />
          <Text className="text-[11px] text-amber-700 ml-3 flex-1 font-bold">
            Note: You are allowed a maximum of 3 leaves per month. Only approved requests are deducted from your balance.
          </Text>
        </View>
      </ScrollView>

      {/* ─── APPLY LEAVE MODAL — ALL INLINE STYLES (no className) ─── */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={ms.overlay}>
          <View style={ms.sheet}>
            {/* Handle */}
            <View style={ms.handle} />

            {/* Title Row */}
            <View style={[ms.row, { marginBottom: 4 }]}>
              <Text style={ms.sheetTitle}>New Leave Request</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={ms.closeBtn}>
                <X size={18} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {/* Duration badge */}
            <View style={ms.durationBadge}>
              <Text style={ms.durationText}>
                Total Duration: {Math.ceil((form.endDate - form.startDate) / (1000 * 60 * 60 * 24)) + 1} Day(s)
              </Text>
            </View>

            <View style={{ height: 20 }} />

            {/* Leave Type Selector */}
            <Text style={ms.label}>SELECT TYPE</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
              {LEAVE_TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[ms.typeBtn, form.leaveType === type ? ms.typeBtnActive : ms.typeBtnIdle]}
                  onPress={() => setForm({ ...form, leaveType: type })}
                >
                  <Text style={[ms.typeBtnText, form.leaveType === type ? ms.typeBtnTextAct : ms.typeBtnTextIdle]}>
                    {type.replace(' Leave', '')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Date Pickers */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
              <View style={{ flex: 1 }}>
                <Text style={ms.label}>START DATE</Text>
                <TouchableOpacity onPress={() => setShowStartPicker(true)} style={ms.dateBtn}>
                  <Text style={ms.dateBtnText}>{formatDateLabel(form.startDate)}</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={ms.label}>END DATE</Text>
                <TouchableOpacity onPress={() => setShowEndPicker(true)} style={ms.dateBtn}>
                  <Text style={ms.dateBtnText}>{formatDateLabel(form.endDate)}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Reason */}
            <Text style={ms.label}>REASON <Text style={{ color: '#f43f5e' }}>*</Text></Text>
            <View style={ms.reasonBox}>
              <TextInput
                placeholder="Reason for leave..."
                value={form.reason}
                onChangeText={(v) => setForm({ ...form, reason: v })}
                multiline
                numberOfLines={3}
                style={{ textAlignVertical: 'top', color: '#1e293b', fontWeight: 'bold', fontSize: 14 }}
                placeholderTextColor="#cbd5e1"
              />
            </View>

            {/* Submit */}
            <TouchableOpacity style={ms.submitBtn} onPress={handleApply} disabled={submitting}>
              {submitting
                ? <ActivityIndicator color="white" />
                : <Text style={ms.submitText}>Submit Request</Text>
              }
            </TouchableOpacity>
          </View>
        </View>

        {/* Date pickers inside Modal — no className used */}
        {showStartPicker && (
          <DateTimePicker
            value={form.startDate}
            mode="date"
            onChange={(e, date) => { setShowStartPicker(false); if (date) setForm({ ...form, startDate: date }); }}
          />
        )}
        {showEndPicker && (
          <DateTimePicker
            value={form.endDate}
            mode="date"
            onChange={(e, date) => { setShowEndPicker(false); if (date) setForm({ ...form, endDate: date }); }}
          />
        )}
      </Modal>
    </View>
  );
};

export default LeaveScreen;
