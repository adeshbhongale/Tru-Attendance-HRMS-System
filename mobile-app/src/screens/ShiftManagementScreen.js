import { ArrowLeft, Clock, Plus, Save, Trash2, X } from 'lucide-react-native';
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

const ShiftManagementScreen = ({ navigation }) => {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkRole = async () => {
      try {
        const res = await api.get('/auth/me');
        setIsAdmin(res.data.data.role === 'admin');
      } catch (e) {}
    };
    checkRole();
    fetchShifts();
  }, []);

  const [form, setForm] = useState({
    name: '',
    startTime: '09:00',
    endTime: '18:00',
    gracePeriod: '15',
    halfDayLimit: '4',
  });

  useEffect(() => {
    fetchShifts();
  }, []);

  const fetchShifts = async () => {
    try {
      setLoading(true);
      const res = await api.get('/shifts');
      setShifts(res.data.data || []);
    } catch (err) {
      Alert.alert('Error', 'Could not fetch shifts');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (shift = null) => {
    if (shift) {
      setEditingShift(shift);
      setForm({
        name: shift.name,
        startTime: shift.startTime,
        endTime: shift.endTime,
        gracePeriod: String(shift.gracePeriod || 0),
        halfDayLimit: String(shift.halfDayLimit || 0),
      });
    } else {
      setEditingShift(null);
      setForm({
        name: '',
        startTime: '09:00',
        endTime: '18:00',
        gracePeriod: '15',
        halfDayLimit: '4',
      });
    }
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.startTime || !form.endTime) {
      Alert.alert('Required', 'Please fill name and times');
      return;
    }

    setSaving(true);
    try {
      if (editingShift) {
        await api.put(`/shifts/${editingShift._id}`, form);
      } else {
        await api.post('/shifts', form);
      }
      fetchShifts();
      setModalVisible(false);
      Alert.alert('Success', `Shift ${editingShift ? 'updated' : 'created'} successfully`);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Action failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id) => {
    Alert.alert('Delete Shift', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/shifts/${id}`);
            fetchShifts();
          } catch (err) {
            Alert.alert('Error', 'Could not delete shift');
          }
        },
      },
    ]);
  };

  if (loading && shifts.length === 0) {
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
      <View className="pt-14 px-6 pb-5 bg-white border-b border-slate-100 flex-row justify-between items-center">
        <View className="flex-row items-center">
          <TouchableOpacity
            className="w-10 h-10 rounded-xl bg-slate-50 justify-center items-center border border-slate-100 mr-4"
            onPress={() => navigation.goBack()}
          >
            <ArrowLeft size={20} color="#64748b" />
          </TouchableOpacity>
          <Text className="text-2xl font-extrabold text-slate-900 tracking-tight">{isAdmin ? 'Manage Shifts' : 'Company Shifts'}</Text>
        </View>
        {isAdmin && (
          <TouchableOpacity
            onPress={() => handleOpenModal()}
            className="w-10 h-10 rounded-xl bg-indigo-600 justify-center items-center shadow-lg shadow-indigo-100"
          >
            <Plus size={22} color="white" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 20 }}>
        {shifts.map((shift) => (
          <View key={shift._id} className="bg-white rounded-3xl p-5 border border-slate-100 mb-4 shadow-sm">
            <View className="flex-row justify-between items-start">
              <View className="flex-row items-center">
                <View className="w-12 h-12 rounded-2xl bg-indigo-50 justify-center items-center">
                  <Clock size={22} color="#4f46e5" />
                </View>
                <View className="ml-4">
                  <Text className="text-lg font-black text-slate-800">{shift.name}</Text>
                  <Text className="text-slate-400 font-bold text-xs">{shift.startTime} — {shift.endTime}</Text>
                </View>
              </View>
              {isAdmin && (
                <View className="flex-row">
                  <TouchableOpacity onPress={() => handleOpenModal(shift)} className="p-2 bg-slate-50 rounded-lg mr-2">
                    <Save size={16} color="#4f46e5" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(shift._id)} className="p-2 bg-rose-50 rounded-lg">
                    <Trash2 size={16} color="#f43f5e" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
            <View className="flex-row mt-4 pt-4 border-t border-slate-50 justify-between items-end">
              <View className="flex-row gap-4">
                <View>
                  <Text className="text-[10px] font-bold text-slate-400 uppercase">Grace</Text>
                  <Text className="text-xs font-bold text-slate-700">{shift.gracePeriod} min</Text>
                </View>
                <View>
                  <Text className="text-[10px] font-bold text-slate-400 uppercase">Half Day</Text>
                  <Text className="text-xs font-bold text-slate-700">{shift.halfDayLimit} hrs</Text>
                </View>
              </View>
              {!isAdmin && (
                <TouchableOpacity
                  onPress={async () => {
                    try {
                      await api.put('/auth/updatedetails', { shift: shift._id });
                      Alert.alert('Success', `Shift changed to ${shift.name}`);
                    } catch (e) {
                      Alert.alert('Error', 'Failed to update shift');
                    }
                  }}
                  className="bg-indigo-600 px-4 py-2 rounded-xl"
                >
                  <Text className="text-white text-[10px] font-black uppercase">Select</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="fade" transparent>
        <View className="flex-1 bg-black/50 justify-center px-6">
          <View className="bg-white rounded-[32px] p-6 shadow-2xl">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-xl font-black text-slate-900">{editingShift ? 'Edit Shift' : 'New Shift'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} className="bg-slate-100 p-2 rounded-full">
                <X size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <View className="gap-4">
              <View>
                <Text className="text-[10px] font-bold text-slate-400 mb-1.5 ml-1 uppercase">Shift Name</Text>
                <TextInput
                  className="bg-slate-50 rounded-2xl px-4 h-12 border border-slate-100 font-bold"
                  value={form.name}
                  onChangeText={(v) => setForm({ ...form, name: v })}
                  placeholder="e.g. Night Shift"
                />
              </View>
              <View className="flex-row gap-4">
                <View className="flex-1">
                  <Text className="text-[10px] font-bold text-slate-400 mb-1.5 ml-1 uppercase">Start Time</Text>
                  <TextInput
                    className="bg-slate-50 rounded-2xl px-4 h-12 border border-slate-100 font-bold"
                    value={form.startTime}
                    onChangeText={(v) => setForm({ ...form, startTime: v })}
                    placeholder="09:00"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-[10px] font-bold text-slate-400 mb-1.5 ml-1 uppercase">End Time</Text>
                  <TextInput
                    className="bg-slate-50 rounded-2xl px-4 h-12 border border-slate-100 font-bold"
                    value={form.endTime}
                    onChangeText={(v) => setForm({ ...form, endTime: v })}
                    placeholder="18:00"
                  />
                </View>
              </View>
            </View>

            <TouchableOpacity
              className="bg-indigo-600 h-14 rounded-2xl justify-center items-center mt-8 shadow-lg shadow-indigo-100"
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color="white" /> : <Text className="text-white font-black uppercase">Save Shift</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default ShiftManagementScreen;
