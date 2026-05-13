import DateTimePicker from '@react-native-community/datetimepicker';
import { ArrowLeft, Calendar, ChevronDown, Clock, Filter, Info, RotateCcw, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import api from '../api/axios';
import { formatWorkingHours } from '../utils/timeFormat';

const ShiftManagementScreen = ({ navigation }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [userData, setUserData] = useState(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [visibleLogs, setVisibleLogs] = useState(5);

  // Filters
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState(null); // Date object
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const res = await api.get('/auth/me');
        setUserData(res.data.data);
        await fetchHistory();
      } catch (e) { }
      setLoading(false);
    };
    init();
  }, []);



  const fetchHistory = async () => {
    try {
      setHistoryLoading(true);
      const res = await api.get('/attendance/history');
      setHistory(res.data.data || []);
    } catch (err) {
    } finally {
      setHistoryLoading(false);
    }
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'Present': return { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100' };
      case 'Present-Late': return { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100' };
      case 'Half-Day': return { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-100' };
      case 'Absent': return { bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-100' };
      default: return { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-100' };
    }
  };



  const formatLocalDate = (date) => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const to12Hour = (time24) => {
    if (!time24) return '--:--';
    const [hours, minutes] = time24.split(':');
    let h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${minutes} ${ampm}`;
  };

  if (loading && history.length === 0) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50">
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View className="pt-14 px-6 pb-5 bg-blue-600 border-b border-slate-100 flex-row justify-between items-center">
        <View className="flex-row items-center">
          <TouchableOpacity
            className="w-10 h-10 rounded-xl bg-slate-50 justify-center items-center border border-slate-100 mr-4"
            onPress={() => navigation.navigate('Home')}
          >
            <ArrowLeft size={20} color="#64748b" />
          </TouchableOpacity>
          <Text className="text-2xl font-extrabold text-white tracking-tight">Company Shifts</Text>
        </View>
        <View className="flex-row items-center gap-3">
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Your Assigned Shift */}
        <Text className="text-[10px] font-bold text-slate-400 tracking-[2px] mb-4 ">Current Assignment</Text>
        {userData?.shift ? (
          <View className="bg-indigo-600 rounded-3xl p-6 mb-8 shadow-xl shadow-indigo-200">
            <View className="flex-row justify-between items-start mb-4">
              <View className="flex-row items-center">
                <View className="w-12 h-12 rounded-2xl bg-white/20 justify-center items-center">
                  <Clock size={24} color="white" />
                </View>
                <View className="ml-4">
                  <Text className="text-white font-bold text-lg">{userData.shift.name}</Text>
                  <Text className="text-indigo-100 text-xs font-bold">Standard Work Hours</Text>
                </View>
              </View>
              <View className="bg-white/20 px-3 py-1 rounded-full">
                <Text className="text-white text-[10px] font-bold ">Active</Text>
              </View>
            </View>
            <View className="flex-row justify-between pt-4 border-t border-white/10">
              <View>
                <Text className="text-indigo-200 text-[10px] font-bold  mb-1">Shift Hours</Text>
                <Text className="text-white font-bold">{to12Hour(userData.shift.startTime)} - {to12Hour(userData.shift.endTime)}</Text>
              </View>
              <View className="items-center">
                <Text className="text-indigo-200 text-[10px] font-bold  mb-1">Grace Period</Text>
                <Text className="text-white font-bold">{userData.shift.gracePeriod || 0} Min</Text>
              </View>
              <View className="items-end">
                <Text className="text-indigo-200 text-[10px] font-bold  mb-1">Half Day After</Text>
                <Text className="text-white font-bold">{to12Hour(userData.shift.halfDayAfter)}</Text>
              </View>
            </View>

            {/* Rules Display */}
            {(userData.shift.lateRules || userData.shift.halfDayRules) && (
              <View className="mt-4 pt-4 border-t border-white/10">
                {userData.shift.lateRules && (
                  <View className="mb-3">
                    <View className="flex-row items-center mb-1">
                      <Info size={12} color="#fecaca" />
                      <Text className="text-red-200 text-[9px] font-bold uppercase tracking-wider ml-1">Late Rules</Text>
                    </View>
                    <Text className="text-white text-[11px] leading-relaxed italic">{userData.shift.lateRules}</Text>
                  </View>
                )}
                {userData.shift.halfDayRules && (
                  <View>
                    <View className="flex-row items-center mb-1">
                      <Clock size={12} color="#fed7aa" />
                      <Text className="text-orange-200 text-[9px] font-bold uppercase tracking-wider ml-1">Half Day Rules</Text>
                    </View>
                    <Text className="text-white text-[11px] leading-relaxed italic">{userData.shift.halfDayRules}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        ) : (
          <View className="bg-white rounded-3xl p-6 mb-8 border border-slate-100 border-dashed items-center">
            <Clock size={32} color="#cbd5e1" />
            <Text className="text-slate-400 font-bold mt-2">No shift assigned yet</Text>
          </View>
        )}

        {/* History & Logs */}
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-[10px] font-bold text-slate-400 tracking-[2px] ">Attendance Shift Logs</Text>
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => fetchHistory()}
              className="bg-white p-2 rounded-lg border border-slate-100"
            >
              <RotateCcw size={14} color="#64748b" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Filters Row */}
        <View className="mb-6 flex-row gap-3">
          {/* Status Dropdown */}
          <TouchableOpacity
            onPress={() => setShowStatusModal(true)}
            className="flex-1 bg-white h-12 rounded-2xl border border-slate-100 flex-row items-center px-4 shadow-sm"
          >
            <Filter size={16} color="#6366f1" />
            <Text className="flex-1 ml-2 text-xs font-bold text-slate-700" numberOfLines={1}>
              {statusFilter === 'All' ? 'STATUS' : statusFilter.toUpperCase()}
            </Text>
            <ChevronDown size={16} color="#94a3b8" />
          </TouchableOpacity>

          {/* Date Picker */}
          <TouchableOpacity
            onPress={() => setShowDatePicker(true)}
            className="flex-1 bg-white h-12 rounded-2xl border border-slate-100 flex-row items-center px-4 shadow-sm"
          >
            <Calendar size={16} color="#6366f1" />
            <Text className="flex-1 ml-2 text-xs font-bold text-slate-700">
              {dateFilter ? formatLocalDate(dateFilter) : 'DATE'}
            </Text>
            {dateFilter && (
              <TouchableOpacity 
                onPress={() => setDateFilter(null)}
                style={{ padding: 6, backgroundColor: '#f1f5f9', borderRadius: 999, marginLeft: 4 }}
              >
                <X size={18} color="#f43f5e" />
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
                <Text className="text-xl font-bold text-slate-900">Filter Status</Text>
                <TouchableOpacity onPress={() => setShowStatusModal(false)} className="bg-slate-100 p-2 rounded-full">
                  <X size={20} color="#94a3b8" />
                </TouchableOpacity>
              </View>
              {['All', 'Present', 'Present-Late', 'Half-Day', 'Absent'].map(s => (
                <TouchableOpacity
                  key={s}
                  onPress={() => {
                    setStatusFilter(s);
                    setShowStatusModal(false);
                  }}
                  className={`py-4 px-6 rounded-2xl mb-2 flex-row justify-between items-center ${statusFilter === s ? 'bg-indigo-50 border border-indigo-100' : 'bg-slate-50 border border-transparent'}`}
                >
                  <Text className={`font-bold ${statusFilter === s ? 'text-indigo-600' : 'text-slate-600'}`}>{s}</Text>
                  {statusFilter === s && <View className="w-2 h-2 rounded-full bg-indigo-600" />}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>

        {showDatePicker && (
          <DateTimePicker
            value={dateFilter || new Date()}
            mode="date"
            display="default"
            maximumDate={new Date()}
            onChange={(event, selectedDate) => {
              setShowDatePicker(false);
              if (selectedDate) setDateFilter(selectedDate);
            }}
          />
        )}

        {historyLoading ? (
          <ActivityIndicator color="#4f46e5" className="py-10" />
        ) : (
          history
            .filter(h => {
              const matchesStatus = statusFilter === 'All' || h.status === statusFilter;
              const matchesDate = !dateFilter || h.date?.includes(formatLocalDate(dateFilter));
              return matchesStatus && matchesDate && h.status !== 'Absent';
            })
            .slice(0, visibleLogs)
            .map((log) => {
              const style = getStatusStyle(log.status);
              return (
                <View key={log._id} className="bg-white rounded-3xl p-5 border border-slate-100 mb-4 shadow-sm">
                  <View className="flex-row justify-between items-center mb-4">
                    <View>
                      <Text className="text-slate-400 text-[10px] font-bold  tracking-wider">{new Date(log.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                      <Text className="text-lg font-bold text-slate-900 tracking-tight mt-0.5">{log.shiftInfo?.name || 'Standard Shift'}</Text>
                    </View>
                    <View className={`${style.bg} ${style.border} border px-3 py-1.5 rounded-xl`}>
                      <Text className={`${style.text} text-[10px] font-bold `}>{log.status}</Text>
                    </View>
                  </View>

                  <View className="flex-row gap-4 mb-4">
                    <View className="flex-1 bg-slate-50 p-3 justify-center items-center rounded-2xl border border-slate-100">
                      <Text className="text-[9px] font-bold text-slate-400  mb-1">Punch In</Text>
                      <Text className="text-slate-800 font-bold text-sm">{log.punchIn?.time ? new Date(log.punchIn.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</Text>
                    </View>
                    <View className="flex-1 bg-slate-50 p-3 justify-center items-center rounded-2xl border border-slate-100">
                      <Text className="text-[9px] font-bold text-slate-400  mb-1">Punch Out</Text>
                      <Text className="text-slate-800 font-bold text-sm">{log.punchOut?.time ? new Date(log.punchOut.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</Text>
                    </View>
                  </View>

                  <View className="flex-row justify-between items-center pt-4 border-t border-slate-50">
                    <View className="flex-row gap-5">
                      <View className="justify-center items-center">
                        <Text className="text-[9px] font-bold text-slate-400 ">Working</Text>
                        <Text className="text-xs font-bold text-slate-700">{formatWorkingHours(log.workingHours || 0)}</Text>
                      </View>
                      <View className="justify-center items-center">
                        <Text className="text-[9px] font-bold text-slate-400 ">Break Time</Text>
                        <Text className="text-xs font-bold text-amber-600">
                          {Math.floor((log.breaks?.reduce((acc, b) => acc + (b.duration || 0), 0) || 0) / 60)}h {(log.breaks?.reduce((acc, b) => acc + (b.duration || 0), 0) || 0) % 60}m
                        </Text>
                      </View>
                      <View className="justify-center items-center">
                        <Text className="text-[9px] font-bold text-slate-400 ">Late Time</Text>
                        <Text className="text-xs font-bold text-rose-500">
                          {Math.floor((log.lateTime || 0) / 60)}hr {(log.lateTime || 0) % 60} m
                        </Text>
                      </View>
                      <View className="justify-center items-center">
                        <Text className="text-[9px] font-bold text-slate-400 ">Dist</Text>
                        <Text className="text-xs font-bold text-indigo-500">{(log.distance || 0).toFixed(2)}km</Text>
                      </View>
                      <View className="justify-center items-center">
                        <Text className="text-[9px] font-bold text-slate-400 ">Breaks</Text>
                        <Text className="text-xs font-bold text-slate-500">{log.breaks?.length || 0}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })
        )}

        {history.filter(h => {
          const matchesStatus = statusFilter === 'All' || h.status === statusFilter;
          const matchesDate = !dateFilter || h.date?.includes(formatLocalDate(dateFilter));
          return matchesStatus && matchesDate;
        }).length > visibleLogs && (
            <TouchableOpacity
              onPress={() => setVisibleLogs(prev => prev + 5)}
              className="mt-4 py-4 bg-white rounded-2xl border border-slate-100 items-center shadow-sm"
            >
              <Text className="text-indigo-600 font-bold text-xs tracking-widest">Load More Logs</Text>
            </TouchableOpacity>
          )}
      </ScrollView>
    </View>
  );
};

export default ShiftManagementScreen;
