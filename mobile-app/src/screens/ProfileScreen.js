import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, Briefcase, ChevronRight, Clock, Edit3, LogOut, Mail, Phone, Shield, X } from 'lucide-react-native';
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

const ProfileScreen = ({ navigation }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [shifts, setShifts] = useState([]);
  
  // Edit Form State
  const [form, setForm] = useState({
    name: '',
    email: '',
    mobile: '',
    shift: '',
  });

  useEffect(() => {
    fetchProfile();
    fetchShifts();
  }, []);

  const fetchShifts = async () => {
    try {
      const res = await api.get('/shifts');
      setShifts(res.data.data || []);
    } catch (err) {
      console.error('Shifts fetch error:', err.message);
    }
  };

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await api.get('/auth/me');
      const freshUser = res.data.data;
      setUser(freshUser);
      setForm({
        name: freshUser.name || '',
        email: freshUser.email || '',
        mobile: freshUser.mobile || '',
        shift: freshUser.shift?._id || '',
      });
      await AsyncStorage.setItem('user', JSON.stringify(freshUser));
    } catch (err) {
      console.error('Profile fetch error:', err.message);
      try {
        const cached = await AsyncStorage.getItem('user');
        if (cached) {
          const parsed = JSON.parse(cached);
          setUser(parsed);
          setForm({
            name: parsed.name || '',
            email: parsed.email || '',
            mobile: parsed.mobile || '',
            shift: parsed.shift?._id || '',
          });
        }
      } catch (_) {}
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.mobile.trim()) {
      Alert.alert('Required', 'Please fill in name, email and mobile.');
      return;
    }

    setUpdating(true);
    try {
      const res = await api.put('/auth/updatedetails', form);
      setUser(res.data.data);
      await AsyncStorage.setItem('user', JSON.stringify(res.data.data));
      Alert.alert('Success', 'Profile and Shift updated successfully!');
      setEditModalVisible(false);
    } catch (err) {
      Alert.alert('Update Failed', err.response?.data?.message || 'Could not update profile.');
    } finally {
      setUpdating(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.get('/auth/logout');
          } catch (_) {}
          await AsyncStorage.clear();
          navigation.replace('Login');
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  const initial = user?.name?.charAt(0)?.toUpperCase() || 'U';

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
          <Text className="text-2xl font-extrabold text-slate-900 tracking-tight">Settings</Text>
        </View>
        <TouchableOpacity
          onPress={() => setEditModalVisible(true)}
          className="bg-indigo-600 px-4 py-2 rounded-xl shadow-lg shadow-indigo-100 flex-row items-center"
        >
          <Edit3 size={16} color="white" />
          <Text className="text-white font-bold ml-2 text-xs">Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 110 }}>
        {/* Profile Info Section */}
        <View className="pb-10 bg-white items-center border-b border-slate-100 pt-8 shadow-sm">
          <View
            className="w-28 h-28 rounded-full bg-indigo-600 justify-center items-center mb-5"
            style={{ shadowColor: '#4f46e5', shadowOpacity: 0.35, shadowRadius: 16 }}
          >
            <Text className="text-white text-4xl font-black">{initial}</Text>
          </View>
          <Text className="text-2xl font-black text-slate-900 tracking-tight">{user?.name || '—'}</Text>
          <View className="flex-row items-center mt-3 bg-indigo-50 px-5 py-2 rounded-full">
            <Briefcase size={14} color="#4f46e5" />
            <Text className="text-indigo-600 font-bold ml-2 text-xs">
              {user?.designation || 'Employee'}{user?.department ? ` • ${user.department}` : ''}
            </Text>
          </View>
        </View>

        <View className="p-6">
          {/* Active Shift Card */}
          <View className="bg-slate-900 rounded-[32px] p-6 mb-6 shadow-xl shadow-slate-200">
            <View className="flex-row items-center mb-5">
              <View className="w-12 h-12 rounded-2xl bg-white/10 justify-center items-center border border-white/10">
                <Clock size={22} color="white" />
              </View>
              <View className="ml-4">
                <Text className="text-slate-400 text-[10px] font-black tracking-widest uppercase">My Active Shift</Text>
                <Text className="text-white text-xl font-black mt-0.5">{user?.shift?.name || 'Not Set'}</Text>
              </View>
            </View>
            <View className="flex-row justify-between pt-5 border-t border-white/10">
              <View>
                <Text className="text-slate-500 text-[10px] font-black uppercase mb-1">Starts</Text>
                <Text className="text-white font-black text-base">{user?.shift?.startTime || '—'}</Text>
              </View>
              <View className="items-end">
                <Text className="text-slate-500 text-[10px] font-black uppercase mb-1">Ends</Text>
                <Text className="text-white font-black text-base">{user?.shift?.endTime || '—'}</Text>
              </View>
            </View>
          </View>

          {/* Personal Details */}
          <View className="bg-white rounded-3xl p-6 border border-slate-100 mb-6 shadow-sm">
            <Text className="text-[10px] font-bold text-slate-400 tracking-widest mb-6 uppercase">Contact Information</Text>

            <View className="flex-row items-center mb-6">
              <View className="w-10 h-10 rounded-xl bg-slate-50 justify-center items-center">
                <Mail size={18} color="#64748b" />
              </View>
              <View className="ml-4 flex-1">
                <Text className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Email</Text>
                <Text className="text-base font-bold text-slate-800 mt-0.5">{user?.email || 'N/A'}</Text>
              </View>
            </View>

            <View className="flex-row items-center mb-6">
              <View className="w-10 h-10 rounded-xl bg-slate-50 justify-center items-center">
                <Phone size={18} color="#64748b" />
              </View>
              <View className="ml-4 flex-1">
                <Text className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Phone</Text>
                <Text className="text-base font-bold text-slate-800 mt-0.5">{user?.mobile || 'N/A'}</Text>
              </View>
            </View>

            <View className="flex-row items-center">
              <View className="w-10 h-10 rounded-xl bg-slate-50 justify-center items-center">
                <Shield size={18} color="#64748b" />
              </View>
              <View className="ml-4 flex-1">
                <Text className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Role</Text>
                <Text className="text-base font-bold text-slate-800 mt-0.5">
                  {user?.role === 'admin' ? 'Administrator' : 'Employee'}
                </Text>
              </View>
            </View>
          </View>

          {/* Admin Tools */}
          {user?.role === 'admin' && (
            <View className="mb-6">
              <Text className="text-[10px] font-bold text-slate-400 tracking-widest mb-4 uppercase">Administrative Tools</Text>
              <TouchableOpacity
                className="bg-white flex-row items-center p-5 rounded-[28px] border border-slate-100 shadow-sm"
                onPress={() => navigation.navigate('ShiftManagement')}
                activeOpacity={0.85}
              >
                <View className="w-12 h-12 rounded-2xl bg-indigo-50 justify-center items-center">
                  <Clock size={20} color="#4f46e5" />
                </View>
                <View className="flex-1 ml-4">
                  <Text className="text-slate-900 font-extrabold text-base tracking-tight">Shift Management</Text>
                  <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Manage work schedules</Text>
                </View>
                <ChevronRight size={18} color="#cbd5e1" />
              </TouchableOpacity>
            </View>
          )}

          {/* Sign Out */}
          <TouchableOpacity
            className="bg-rose-50 flex-row items-center p-5 rounded-2xl border border-rose-100"
            onPress={handleLogout}
            activeOpacity={0.85}
          >
            <View className="w-10 h-10 rounded-xl bg-rose-500 justify-center items-center shadow-md shadow-rose-100">
              <LogOut size={18} color="white" />
            </View>
            <Text className="flex-1 ml-4 text-rose-600 font-extrabold text-base">Sign Out</Text>
            <ChevronRight size={18} color="#fb7185" />
          </TouchableOpacity>

          <Text className="text-center text-slate-300 text-[10px] mt-10 font-bold tracking-widest uppercase">
            Geo-Attendance HRMS • v1.0.0
          </Text>
        </View>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={editModalVisible} animationType="slide" transparent>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-[32px] px-6 pt-6 pb-10 shadow-2xl">
            <View className="flex-row justify-between items-center mb-8">
              <Text className="text-2xl font-black text-slate-900">Manage Account</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)} className="bg-slate-100 p-2 rounded-full">
                <X size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View className="gap-6">
                <View>
                  <Text className="text-[10px] font-black text-slate-400 tracking-widest mb-2.5 ml-1 uppercase">Full Name</Text>
                  <TextInput
                    className="bg-slate-50 rounded-2xl px-5 h-14 border border-slate-200 text-slate-800 font-bold"
                    value={form.name}
                    onChangeText={(v) => setForm({ ...form, name: v })}
                    placeholder="Full Name"
                  />
                </View>
                <View>
                  <Text className="text-[10px] font-black text-slate-400 tracking-widest mb-2.5 ml-1 uppercase">Email Address</Text>
                  <TextInput
                    className="bg-slate-50 rounded-2xl px-5 h-14 border border-slate-200 text-slate-800 font-bold"
                    value={form.email}
                    onChangeText={(v) => setForm({ ...form, email: v })}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
                <View>
                  <Text className="text-[10px] font-black text-slate-400 tracking-widest mb-2.5 ml-1 uppercase">Mobile Number</Text>
                  <TextInput
                    className="bg-slate-50 rounded-2xl px-5 h-14 border border-slate-200 text-slate-800 font-bold"
                    value={form.mobile}
                    onChangeText={(v) => setForm({ ...form, mobile: v })}
                    keyboardType="phone-pad"
                  />
                </View>

                {/* Shift Selector */}
                <View>
                  <Text className="text-[10px] font-black text-slate-400 tracking-widest mb-3 ml-1 uppercase">Choose Your Shift</Text>
                  <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                    {shifts.map((s) => (
                      <TouchableOpacity
                        key={s._id}
                        onPress={() => setForm({ ...form, shift: s._id })}
                        className={`px-4 py-3 rounded-xl border-2 ${form.shift === s._id ? 'bg-indigo-600 border-indigo-600 shadow-lg shadow-indigo-100' : 'bg-white border-slate-100'}`}
                      >
                        <Text className={`text-xs font-bold ${form.shift === s._id ? 'text-white' : 'text-slate-600'}`}>
                          {s.name} ({s.startTime})
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <TouchableOpacity
                  className="bg-indigo-600 h-16 rounded-2xl justify-center items-center mt-6 shadow-xl shadow-indigo-200"
                  onPress={handleUpdate}
                  disabled={updating}
                >
                  {updating ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white font-black text-base uppercase tracking-tight">Update My Profile</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default ProfileScreen;
