import { ArrowLeft, Check, ChevronDown, Clock, RotateCcw, ShieldCheck, X, XCircle } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import api from '../api/axios';
import HRModuleFooter from '../components/HRModuleFooter';

const ms = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 48 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { fontSize: 20, fontWeight: 'bold', color: '#0f172a' },
  closeBtn: { backgroundColor: '#f1f5f9', padding: 8, borderRadius: 999 },
});

const to12Hour = (time24) => {
  if (!time24 || time24 === 'NA' || time24 === 'NA:NA') return '--:--';
  if (time24.includes('AM') || time24.includes('PM')) return time24;
  const parts = time24.split(':');
  if (parts.length < 2) return '--:--';
  const hours = parseInt(parts[0], 10);
  if (isNaN(hours)) return '--:--';
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h = hours % 12 || 12;
  return `${h}:${parts[1]} ${ampm}`;
};

const LeaveApprovalsScreen = ({ navigation }) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [filter, setFilter] = useState('Pending');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [detail, setDetail] = useState(null);

  const STATUS_FILTERS = ['Pending', 'All', 'Approved', 'Rejected', 'Cancelled'];

  const [hasSubordinates, setHasSubordinates] = useState(true);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const res = await api.get('/leaves/approvals');
      const data = res.data?.data || [];
      const hasSubs = res.data?.hasSubordinates ?? true;
      setHasSubordinates(hasSubs);
      setRequests(data);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Could not load leave approvals.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const filteredRequests = filter === 'All' ? requests : requests.filter((r) => r.status === filter);

  const doAction = async (item, action) => {
    setActionLoading(true);
    try {
      if (action === 'approve') {
        try {
          await api.patch(`/leaves/approvals/${item._id}/approve`);
        } catch (appErr) {
          await api.patch(`/leaves/${item._id}`, { status: 'Approved' });
        }
        Alert.alert('Approved', `Leave approved for ${item.user?.name || 'the employee'}.`);
      } else {
        try {
          await api.patch(`/leaves/approvals/${item._id}/reject`);
        } catch (rejErr) {
          await api.patch(`/leaves/${item._id}`, { status: 'Rejected' });
        }
        Alert.alert('Rejected', `Leave rejected for ${item.user?.name || 'the employee'}.`);
      }
      setDetail(null);
      fetchRequests();
    } catch (err) {
      Alert.alert('Action Failed', err.response?.data?.message || 'Could not update this request.');
    } finally {
      setActionLoading(false);
    }
  };

  const confirmAction = (item, action) => {
    Alert.alert(
      action === 'approve' ? 'Approve Leave?' : 'Reject Leave?',
      action === 'approve'
        ? `Approve ${item.leaveType} for ${item.user?.name || 'employee'} (${item.duration || 'Full Day'})?`
        : `Reject the ${item.leaveType} request from ${item.user?.name || 'employee'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: action === 'approve' ? 'Yes, Approve' : 'Yes, Reject', style: action === 'reject' ? 'destructive' : 'default', onPress: () => doAction(item, action) },
      ]
    );
  };

  const openDetail = (item) => setDetail(item);

  const statusStyle = (status) => {
    switch (status) {
      case 'Approved': return { bg: '#ecfdf5', text: '#059669' };
      case 'Rejected': return { bg: '#fff1f2', text: '#e11d48' };
      case 'Cancelled': return { bg: '#f4f4f5', text: '#52525b' };
      default: return { bg: '#fffbeb', text: '#d97706' };
    }
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
            <Text className="text-2xl font-extrabold text-slate-900 tracking-tight">Leave Approvals</Text>
            <Text className="text-[10px] font-bold text-slate-400 tracking-wide mt-1">
              {requests.filter((r) => r.status === 'Pending').length} pending for your approval
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={fetchRequests}
          className="w-10 h-10 rounded-xl bg-slate-50 justify-center items-center border border-slate-100"
        >
          <RotateCcw size={18} color="#64748b" />
        </TouchableOpacity>
      </View>

      {/* Filter row */}
      <View className="bg-white px-6 py-4 border-b border-slate-100">
        <TouchableOpacity
          onPress={() => setShowFilterModal(true)}
          className="bg-slate-50 h-12 rounded-2xl border border-slate-100 flex-row items-center px-4"
        >
          <ShieldCheck size={16} color="#6366f1" />
          <Text className="flex-1 ml-2 text-xs font-bold text-slate-700">
            {filter === 'All' ? 'ALL REQUESTS' : filter.toUpperCase()}
          </Text>
          <ChevronDown size={16} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {/* List */}
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 110 }}>
        {loading ? (
          <ActivityIndicator color="#4f46e5" size="large" style={{ marginTop: 40 }} />
        ) : (
          filteredRequests.map((item) => {
            const st = statusStyle(item.status);
            const days = item.duration === 'Half Day' ? '0.5' : item.durationDays || Math.ceil((new Date(item.endDate) - new Date(item.startDate)) / (1000 * 60 * 60 * 24)) + 1;
            return (
              <TouchableOpacity
                key={item._id}
                activeOpacity={0.9}
                onPress={() => openDetail(item)}
                className="bg-white p-5 rounded-2xl border border-slate-100 mb-3"
              >
                <View className="flex-row justify-between items-start mb-3">
                  <View className="flex-1">
                    <View className="flex-row items-center">
                      <View className="w-10 h-10 rounded-xl bg-indigo-50 items-center justify-center mr-3">
                        <Text className="text-indigo-600 font-extrabold text-sm">
                          {(item.user?.name || 'E').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-base font-extrabold text-slate-800">{item.user?.name || 'Unknown employee'}</Text>
                        <Text className="text-[10px] font-bold text-slate-400 tracking-wide">
                          {item.user?.designation || 'Employee'} {item.user?.department ? ` • ${typeof item.user.department === 'object' ? item.user.department?.name : item.user.department}` : ''}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: st.bg }}>
                    <Text style={{ fontSize: 9, fontWeight: 'bold', color: st.text }}>{item.status.toUpperCase()}</Text>
                  </View>
                </View>

                <View className="ml-13">
                  <Text className="text-base font-extrabold text-slate-800">{item.leaveType}</Text>
                  <Text className="text-xs font-bold text-slate-600 mt-1">
                    {new Date(item.startDate).toLocaleDateString()} — {new Date(item.endDate).toLocaleDateString()}
                  </Text>
                  {item.duration === 'Half Day' && (
                    <View className="flex-row items-center mt-2 bg-indigo-50 px-2 py-1 rounded-md self-start">
                      <Clock size={10} color="#4f46e5" />
                      <Text className="text-[9px] font-bold text-indigo-600 ml-1">
                        HALF DAY: {to12Hour(item.startTime)} - {to12Hour(item.endTime)}
                      </Text>
                    </View>
                  )}
                  {item.reason ? (
                    <Text className="text-xs text-slate-500 mt-2 mb-1">{item.reason}</Text>
                  ) : null}
                </View>

                <View className="flex-row justify-between items-center mt-3 pt-3 border-t border-slate-50">
                  <View className="bg-slate-50 px-3 py-1 rounded-lg">
                    <Text className="text-[10px] font-bold text-slate-500">{days} Day(s)</Text>
                  </View>
                  {item.status === 'Pending' && (
                    <View className="flex-row gap-2">
                      <TouchableOpacity
                        onPress={(e) => { e.stopPropagation(); confirmAction(item, 'approve'); }}
                        className="px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-100"
                      >
                        <Text className="text-[10px] font-bold text-emerald-600">APPROVE</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={(e) => { e.stopPropagation(); confirmAction(item, 'reject'); }}
                        className="px-3 py-2 bg-rose-50 rounded-lg border border-rose-100"
                      >
                        <Text className="text-[10px] font-bold text-rose-600">REJECT</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}

        {!loading && !hasSubordinates && (
          <View className="items-center mt-20 px-6">
            <View className="w-16 h-16 bg-slate-100 rounded-2xl items-center justify-center mb-4 border border-slate-200">
              <ShieldCheck size={32} color="#94a3b8" />
            </View>
            <Text className="text-slate-800 font-extrabold text-base text-center">No Direct Reports Assigned</Text>
            <Text className="text-slate-500 font-bold text-xs text-center mt-1.5 leading-relaxed">
              You currently do not have any team members reporting to you. Leave approvals are reserved for reporting managers and team leads.
            </Text>
          </View>
        )}

        {!loading && hasSubordinates && filteredRequests.length === 0 && (
          <View className="items-center mt-20">
            <View className="w-16 h-16 bg-indigo-50 rounded-2xl items-center justify-center mb-4">
              <ShieldCheck size={32} color="#6366f1" />
            </View>
            <Text className="text-slate-400 font-bold text-sm">No {filter.toLowerCase()} requests.</Text>
            <Text className="text-slate-300 font-bold text-xs mt-1">Leave requests from your team will appear here.</Text>
          </View>
        )}
      </ScrollView>

      {/* Filter modal */}
      <Modal visible={showFilterModal} transparent animationType="fade">
        <TouchableOpacity activeOpacity={1} onPress={() => setShowFilterModal(false)} style={ms.overlay}>
          <View style={ms.sheet}>
            <View style={ms.row}>
              <Text style={ms.sheetTitle}>Filter Requests</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)} style={ms.closeBtn}>
                <X size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            <View style={{ height: 24 }} />
            {STATUS_FILTERS.map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => { setFilter(s); setShowFilterModal(false); }}
                style={{
                  paddingVertical: 14, paddingHorizontal: 20, borderRadius: 18, marginBottom: 8,
                  flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                  backgroundColor: filter === s ? '#eef2ff' : '#f8fafc',
                  borderWidth: 1, borderColor: filter === s ? '#e0e7ff' : 'transparent',
                }}
              >
                <Text style={{ fontWeight: 'bold', color: filter === s ? '#4f46e5' : '#475569' }}>{s}</Text>
                {filter === s && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#4f46e5' }} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Detail modal */}
      <Modal visible={!!detail} transparent animationType="fade">
        <View style={ms.overlay}>
          <View style={[ms.sheet, { minHeight: 380 }]}>
            <View style={ms.row}>
              <Text style={ms.sheetTitle}>Request Details</Text>
              <TouchableOpacity onPress={() => setDetail(null)} style={ms.closeBtn}>
                <X size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            {detail && (
              <View style={{ marginTop: 20 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#0f172a' }}>{detail.user?.name}</Text>
                <Text style={{ fontSize: 12, color: '#64748b', fontWeight: 'bold', marginTop: 4 }}>
                  {detail.user?.designation || 'Employee'} • {(typeof detail.user?.department === 'object' ? detail.user?.department?.name : detail.user?.department) || '—'}
                </Text>
                <View style={{ height: 20 }} />
                <DetailRow label="Leave type" value={detail.leaveType} />
                <DetailRow label="Dates" value={`${new Date(detail.startDate).toLocaleDateString()} — ${new Date(detail.endDate).toLocaleDateString()}`} />
                <DetailRow label="Duration" value={detail.duration === 'Half Day' ? `Half day (${to12Hour(detail.startTime)} - ${to12Hour(detail.endTime)})` : 'Full day'} />
                <DetailRow label="Days" value={detail.duration === 'Half Day' ? '0.5' : (detail.durationDays || (Math.ceil((new Date(detail.endDate) - new Date(detail.startDate)) / (1000 * 60 * 60 * 24)) + 1))} />
                <DetailRow label="Applied on" value={new Date(detail.createdAt).toLocaleString()} />
                <DetailRow label="Status" value={detail.status} />
                {detail.reason ? <DetailRow label="Reason" value={detail.reason} multiline /> : null}

                {detail.status === 'Pending' && (
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 28 }}>
                    <TouchableOpacity
                      onPress={() => confirmAction(detail, 'reject')}
                      disabled={actionLoading}
                      style={{ flex: 1, height: 56, borderRadius: 16, backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3', justifyContent: 'center', alignItems: 'center' }}
                    >
                      {actionLoading ? <ActivityIndicator color="#e11d48" /> : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <XCircle size={16} color="#e11d48" />
                          <Text style={{ color: '#e11d48', fontWeight: 'bold', fontSize: 14 }}>Reject</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => confirmAction(detail, 'approve')}
                      disabled={actionLoading}
                      style={{ flex: 1, height: 56, borderRadius: 16, backgroundColor: '#4f46e5', justifyContent: 'center', alignItems: 'center' }}
                    >
                      {actionLoading ? <ActivityIndicator color="#fff" /> : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Check size={16} color="#fff" />
                          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>Approve</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>

      <HRModuleFooter navigation={navigation} currentScreen="leaveApprovals" />
    </View>
  );
};

const DetailRow = ({ label, value, multiline }) => (
  <View style={{ marginBottom: 12 }}>
    <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#94a3b8', letterSpacing: 1.5, marginBottom: 4 }}>{label.toUpperCase()}</Text>
    <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#334155', lineHeight: multiline ? 18 : undefined }}>{value}</Text>
  </View>
);

export default LeaveApprovalsScreen;