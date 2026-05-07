import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, Calendar, ChevronDown, Filter, Info, Plus, RotateCcw, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import api from '../api/axios';

const LEAVE_TYPES = ['Sick Leave', 'Casual Leave', 'Paid Leave'];
const STATUS_FILTERS = ['All', 'Pending', 'Approved', 'Rejected'];

const LeaveScreen = ({ navigation }) => {
  const [leaves, setLeaves] = useState([]);
  const [filteredLeaves, setFilteredLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState('All');
  const [balance, setBalance] = useState({ used: 0, limit: 3, remaining: 3 });
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [historyDateFilter, setHistoryDateFilter] = useState(null);
  const [showHistoryDatePicker, setShowHistoryDatePicker] = useState(false);

  // Date Picker States
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
      case 'Approved': return { bg: 'bg-emerald-50', text: 'text-emerald-600' };
      case 'Rejected': return { bg: 'bg-rose-50', text: 'text-rose-600' };
      default: return { bg: 'bg-amber-50', text: 'text-amber-600' };
    }
  };

  const formatDateLabel = (date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatLocalDate = (date) => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  return (
    <View className="flex-1 bg-slate-50">
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View className="pt-14 px-6 pb-5 bg-white border-b border-slate-100 flex-row justify-between items-center">
        <View className="flex-row items-center">
          <TouchableOpacity
            className="w-10 h-10 rounded-xl bg-slate-50 justify-center items-center border border-slate-100 mr-4"
            onPress={() => navigation.goBack()}
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
        {/* Status Dropdown */}
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

        {/* Date Picker */}
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

      {/* Status Selection Modal */}
      <Modal visible={showStatusModal} transparent animationType="fade">
        <TouchableOpacity 
          activeOpacity={1} 
          onPress={() => setShowStatusModal(false)}
          className="flex-1 bg-black/40 justify-end"
        >
          <View className="bg-white rounded-t-[32px] p-6 pb-12">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-xl font-black text-slate-900">Filter Status</Text>
              <TouchableOpacity onPress={() => setShowStatusModal(false)} className="bg-slate-100 p-2 rounded-full">
                <X size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            {STATUS_FILTERS.map(s => (
              <TouchableOpacity
                key={s}
                onPress={() => {
                  setFilter(s);
                  setShowStatusModal(false);
                }}
                className={`py-4 px-6 rounded-2xl mb-2 flex-row justify-between items-center ${filter === s ? 'bg-indigo-50 border border-indigo-100' : 'bg-slate-50 border border-transparent'}`}
              >
                <Text className={`font-bold ${filter === s ? 'text-indigo-600' : 'text-slate-600'}`}>{s}</Text>
                {filter === s && <View className="w-2 h-2 rounded-full bg-indigo-600" />}
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

      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 110 }}>
        {/* History Header */}
        <View className="flex-row justify-between items-center mb-5">
          <View className="flex-row items-center">
            <Calendar size={16} color="#94a3b8" />
            <Text className="text-[10px] font-bold text-slate-400 tracking-widest ml-2 ">
              {filter} RECORDS
            </Text>
          </View>
          <Text className="text-[10px] font-bold text-indigo-600">{filteredLeaves.length} items</Text>
        </View>

        {loading ? (
          <ActivityIndicator color="#4f46e5" size="large" className="mt-10" />
        ) : (
          leaves
            .filter(l => {
              const matchesStatus = filter === 'All' || l.status === filter;
              const matchesDate = !historyDateFilter || l.startDate?.includes(formatLocalDate(historyDateFilter));
              return matchesStatus && matchesDate;
            })
            .sort((a, b) => new Date(b.startDate) - new Date(a.startDate)) // Sort by date descending
            .map((item, index, array) => {
              const style = getStatusStyle(item.status);
              const date = new Date(item.startDate);
              const currentMonth = date.toLocaleString('default', { month: 'long', year: 'numeric' });
              
              // Check if this is a new month compared to the previous item
              let showHeader = false;
              if (index === 0) {
                showHeader = true;
              } else {
                const prevDate = new Date(array[index - 1].startDate);
                const prevMonth = prevDate.toLocaleString('default', { month: 'long', year: 'numeric' });
                if (currentMonth !== prevMonth) {
                  showHeader = true;
                }
              }

              return (
                <View key={item._id}>
                  {showHeader && (
                    <View className="flex-row items-center mt-6 mb-4">
                      <View className="h-[1px] flex-1 bg-slate-200" />
                      <Text className="mx-4 text-[10px] font-black text-slate-400 uppercase tracking-[2px]">
                        {currentMonth}
                      </Text>
                      <View className="h-[1px] flex-1 bg-slate-200" />
                    </View>
                  )}
                  <View className="bg-white p-5 rounded-2xl flex-row justify-between items-center mb-3 border border-slate-100 shadow-sm">
                    <View className="flex-1">
                      <Text className="text-base font-extrabold text-slate-800 tracking-tight">{item.leaveType}</Text>
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
                    <View className={`px-3 py-2 rounded-xl ml-3 ${style.bg}`}>
                      <Text className={`text-[10px] font-bold ${style.text}`}>{item.status}</Text>
                    </View>
                  </View>
                </View>
              );
            })
        )}

        <View className="mt-6 bg-amber-50 p-4 rounded-2xl border border-amber-100 flex-row">
          <Info size={16} color="#d97706" />
          <Text className="text-[11px] text-amber-700 ml-3 flex-1 font-bold">
            Note: You are allowed a maximum of 3 leaves per month. Only approved requests are deducted from your balance.
          </Text>
        </View>
      </ScrollView>

      {/* Apply Leave Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-[32px] px-6 pt-6 pb-10 shadow-2xl">
            <View className="items-center mb-6">
              <View className="w-12 h-1 bg-slate-200 rounded-full mb-6" />
              <View className="flex-row justify-between w-full items-center">
                <Text className="text-xl font-extrabold text-slate-900">New Leave Request</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)} className="w-8 h-8 rounded-full bg-slate-100 justify-center items-center">
                  <X size={18} color="#94a3b8" />
                </TouchableOpacity>
              </View>
              <View className="mt-2 flex-row items-center">
                <Text className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
                  Total Duration: {Math.ceil((form.endDate - form.startDate) / (1000 * 60 * 60 * 24)) + 1} Day(s)
                </Text>
              </View>
            </View>

            {/* Leave Type Selector */}
            <Text className="text-[10px] font-bold text-slate-400 tracking-widest mb-3 ml-1 ">Select Type</Text>
            <View className="flex-row mb-6" style={{ gap: 8 }}>
              {LEAVE_TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  className={`flex-1 py-4 rounded-2xl border items-center ${form.leaveType === type ? 'bg-indigo-600 border-indigo-600 shadow-md shadow-indigo-100' : 'bg-white border-slate-200'}`}
                  onPress={() => setForm({ ...form, leaveType: type })}
                >
                  <Text className={`text-[10px] font-bold ${form.leaveType === type ? 'text-white' : 'text-slate-500'}`}>
                    {type.replace(' Leave', '')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Date Pickers */}
            <View className="flex-row mb-6" style={{ gap: 12 }}>
              <View className="flex-1">
                <Text className="text-[10px] font-bold text-slate-400 tracking-widest mb-3 ml-1 ">Start Date</Text>
                <TouchableOpacity
                  onPress={() => setShowStartPicker(true)}
                  className="bg-slate-50 rounded-2xl px-4 h-14 justify-center border border-slate-200"
                >
                  <Text className="text-slate-800 font-bold">{formatDateLabel(form.startDate)}</Text>
                </TouchableOpacity>
              </View>
              <View className="flex-1">
                <Text className="text-[10px] font-bold text-slate-400 tracking-widest mb-3 ml-1 ">End Date</Text>
                <TouchableOpacity
                  onPress={() => setShowEndPicker(true)}
                  className="bg-slate-50 rounded-2xl px-4 h-14 justify-center border border-slate-200"
                >
                  <Text className="text-slate-800 font-bold">{formatDateLabel(form.endDate)}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Reason */}
            <Text className="text-[10px] font-bold text-slate-400 tracking-widest mb-3 ml-1 ">Reason <Text className="text-rose-500">*</Text></Text>
            <View className="bg-slate-50 rounded-2xl px-4 py-4 mb-8 border border-slate-200">
              <TextInput
                placeholder="Reason for leave..."
                value={form.reason}
                onChangeText={(v) => setForm({ ...form, reason: v })}
                multiline
                numberOfLines={3}
                className="text-slate-800 font-bold text-sm"
                placeholderTextColor="#cbd5e1"
                style={{ textAlignVertical: 'top' }}
              />
            </View>

            <TouchableOpacity
              className="bg-indigo-600 h-16 rounded-2xl justify-center items-center shadow-lg shadow-indigo-200"
              onPress={handleApply}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-bold text-base">Submit Request</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {showStartPicker && (
          <DateTimePicker
            value={form.startDate}
            mode="date"
            onChange={(e, date) => {
              setShowStartPicker(false);
              if (date) setForm({ ...form, startDate: date });
            }}
          />
        )}
        {showEndPicker && (
          <DateTimePicker
            value={form.endDate}
            mode="date"
            onChange={(e, date) => {
              setShowEndPicker(false);
              if (date) setForm({ ...form, endDate: date });
            }}
          />
        )}
      </Modal>
    </View>
  );
};

export default LeaveScreen;
