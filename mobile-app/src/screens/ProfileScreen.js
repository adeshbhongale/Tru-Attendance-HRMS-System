import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import {
  Bell,
  Briefcase,
  Calendar,
  Camera,
  ChevronRight,
  CreditCard,
  LogOut,
  MapPin,
  Pencil,
  User as UserIcon,
  X
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import api from '../api/axios';
import NotificationDrawer from '../components/NotificationDrawer';
import socket from '../socket';
import { navigateGlobal } from '../utils/navigation';

const ProfileScreen = ({ navigation }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notifDrawerVisible, setNotifDrawerVisible] = useState(false);

  // Sync initial unread notifications count on Profile screen load
  useEffect(() => {
    if (user?._id) {
      const syncUnreadCount = () => {
        api.get('/notifications/employee/feed')
          .then((res) => {
            if (res.data.success) {
              const feed = res.data.data || [];
              setUnreadNotifications(feed.filter(n => !n.isRead).length);
            }
          })
          .catch(() => { });
      };

      syncUnreadCount();

      socket.on(`notificationBadgeUpdate:${user._id}`, syncUnreadCount);
      socket.on(`notificationLiveUpdate:${user._id}`, syncUnreadCount);

      return () => {
        socket.off(`notificationBadgeUpdate:${user._id}`, syncUnreadCount);
        socket.off(`notificationLiveUpdate:${user._id}`, syncUnreadCount);
      };
    }
  }, [user]);

  const [form, setForm] = useState({
    name: '',
    email: '',
    mobile: '',
    profileImage: null,
    designation: '',
  });

  useEffect(() => {
    fetchProfile();
  }, []);

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
        designation: freshUser.designation || '',
        profileImage: null,
      });
      await AsyncStorage.setItem('user', JSON.stringify(freshUser));
    } catch (err) {
      try {
        const cached = await AsyncStorage.getItem('user');
        if (cached) {
          const parsed = JSON.parse(cached);
          setUser(parsed);
          setForm({
            name: parsed.name || '',
            email: parsed.email || '',
            mobile: parsed.mobile || '',
            designation: parsed.designation || '',
            profileImage: null,
          });
        }
      } catch (_) { }
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.mobile.trim()) {
      setToast({ show: true, message: 'Please fill in name, email and mobile.', type: 'error' });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2000);
      return;
    }

    setUpdating(true);
    try {
      const updateData = {
        name: form.name,
        email: form.email,
        mobile: form.mobile,
        profileImage: form.profileImage || 'skipped',
      };

      const res = await api.put('/auth/updatedetails', updateData);
      setUser(res.data.data);
      await AsyncStorage.setItem('user', JSON.stringify(res.data.data));

      setEditModalVisible(false);
      setToast({ show: true, message: 'Profile updated successfully!', type: 'success' });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2000);
    } catch (err) {
      setToast({ show: true, message: err.response?.data?.message || 'Update Failed', type: 'error' });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2000);
    } finally {
      setUpdating(false);
    }
  };

  const pickProfileImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setToast({ show: true, message: 'Camera library access is required.', type: 'error' });
        setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2000);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: false,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled) {
        setForm({ ...form, profileImage: `data:image/jpeg;base64,${result.assets[0].base64}` });
      }
    } catch (err) {
      setToast({ show: true, message: 'Failed to pick image.', type: 'error' });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2000);
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try { await api.get('/auth/logout'); } catch (_) { }
          await AsyncStorage.clear();
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-blue-800">
        <ActivityIndicator size="large" color="white" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-100">
      <StatusBar barStyle="light-content" />

      {/* Top Header Bar (No TruCode) */}
      <View className="bg-blue-600 pt-10 mt-2 pb-24 px-6 flex-row items-center justify-between">
        <View className="w-10" />
        <Text className="text-white font-bold text-xl">Profile</Text>
        {/* Bell Notification Button on Profile page */}
        <TouchableOpacity
          onPress={() => setNotifDrawerVisible(true)}
          activeOpacity={0.8}
          className="w-12 h-12 rounded-xl bg-white/10 justify-center items-center relative border border-white/10"
        >
          <Bell size={20} color="white" />
          {unreadNotifications > 0 && (
            <View className="absolute -top-1 -right-1 bg-rose-500 min-w-4 h-4 rounded-full justify-center items-center px-1 border border-white">
              <Text className="text-white text-[8px] font-extrabold">{unreadNotifications}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        className="flex-1 -mt-20"
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Info Card */}
        <View className="px-6 mb-6">
          <View className="bg-white rounded-3xl p-5 shadow-md flex-row items-center border border-slate-200 relative">

            {/* Left Side: Profile Image */}
            <View className="w-20 h-20 rounded-full bg-slate-100 border-4 border-slate-50 items-center justify-center overflow-hidden shadow-sm mr-4">
              {user?.profileImage ? (
                <Image source={{ uri: user.profileImage }} className="w-full h-full" />
              ) : (
                <UserIcon size={32} color="#94a3b8" />
              )}
            </View>

            {/* Right Side: Other Info */}
            <View className="flex-1 pr-5">
              <Text
                className={`font-bold text-slate-800 ${(user?.name || 'User').length > 25
                  ? 'text-sm'
                  : (user?.name || 'User').length > 18
                    ? 'text-base'
                    : 'text-xl'
                  }`}
                style={{
                  flexWrap: 'wrap',
                  flexShrink: 1,
                  width: '100%',
                  lineHeight: 28,
                }}
              >
                {user?.name || 'User'}
              </Text>
              {/* Department + Designation */}
              <View className="flex-row items-center gap-1.5 mt-2 flex-wrap">
                <Text className="text-slate-500 font-bold text-xs flex-shrink">
                  {user?.department}
                </Text>
                <View className="w-1 h-1 rounded-full bg-slate-400" />
                <Text className="text-slate-500 font-bold text-xs flex-shrink">
                  {user?.designation}
                </Text>
              </View>

              {/* Email + Mobile */}
              <View className="flex-row items-center gap-1.5 mt-2 flex-wrap">
                <Text
                  numberOfLines={1}
                  className="text-slate-600 font-bold text-[10px] flex-shrink"
                >
                  {user?.email}
                </Text>
                <View className="w-1 h-1 rounded-full bg-slate-400" />
                <Text className="text-slate-600 font-bold text-[10px]">
                  {user?.mobile}
                </Text>
              </View>
            </View>

            {/* Edit Button */}
            <TouchableOpacity
              onPress={() => {
                setForm({
                  name: user?.name || '',
                  email: user?.email || '',
                  mobile: user?.mobile || '',
                  designation: user?.designation || '',
                  profileImage: null,
                });
                setEditModalVisible(true);
              }}
              className="absolute top-4 right-4 bg-slate-50 p-2 rounded-xl border border-slate-100 shadow-sm"
            >
              <Pencil size={16} color="#4f46e5" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Simplified Dashboard (2 boxes) */}
        <View className="px-6 mb-8">
          <Text className="text-slate-700 font-bold text-[10px] tracking-widest mb-4 text-center">
            My Activity
          </Text>

          <View className="flex-row justify-between mb-4">
            {/* Monthly Attendance */}
            <TouchableOpacity
              onPress={() => navigateGlobal('MonthlyViewScreen')}
              className="bg-white w-[48%] p-4 rounded-3xl shadow-sm border border-slate-100 items-center justify-center"
              style={{ aspectRatio: 1 }}
            >
              <View className="w-12 h-12 bg-indigo-50 rounded-2xl items-center justify-center mb-3">
                <Calendar size={24} color="#4f46e5" />
              </View>
              <Text className="text-slate-900 font-bold text-sm text-center">
                Monthly
              </Text>
              <Text className="text-slate-900 font-bold text-sm text-center">
                Attendance
              </Text>
              <View className="mt-2 flex-row items-center justify-center">
                <Text className="text-indigo-600 font-bold text-[10px]">
                  VIEW ALL
                </Text>
                <ChevronRight size={12} color="#4f46e5" />
              </View>
            </TouchableOpacity>

            {/* Track Location */}
            <TouchableOpacity
              onPress={() => navigateGlobal('TrackMyRoute')}
              className="bg-white w-[48%] p-4 rounded-3xl shadow-sm border border-slate-100 items-center justify-center"
              style={{ aspectRatio: 1 }}
            >
              <View className="w-12 h-12 bg-rose-50 rounded-2xl items-center justify-center mb-3">
                <MapPin size={24} color="#e11d48" />
              </View>
              <Text className="text-slate-900 font-bold text-sm text-center">
                Track
              </Text>
              <Text className="text-slate-900 font-bold text-sm text-center">
                Location
              </Text>
              <View className="mt-2 flex-row items-center justify-center">
                <Text className="text-rose-600 font-bold text-[10px]">
                  DAY WISE
                </Text>
                <ChevronRight size={12} color="#e11d48" />
              </View>
            </TouchableOpacity>
          </View>

          <View className="flex-row justify-between mb-4">
            {/* Customer Visit */}
            <TouchableOpacity
              onPress={() => navigateGlobal('CustomerVisitScreen')}
              className="bg-white w-[48%] p-4 rounded-3xl shadow-sm border border-slate-100 items-center justify-center"
              style={{ aspectRatio: 1 }}
            >
              <View className="w-12 h-12 bg-emerald-50 rounded-2xl items-center justify-center mb-3">
                <Briefcase size={24} color="#10b981" />
              </View>
              <Text className="text-slate-900 font-bold text-sm text-center">
                Customer
              </Text>
              <Text className="text-slate-900 font-bold text-sm text-center">
                Visit
              </Text>
              <View className="mt-2 flex-row items-center justify-center">
                <Text className="text-emerald-600 font-bold text-[10px]">
                  VIEW ALL
                </Text>
                <ChevronRight size={12} color="#10b981" />
              </View>
            </TouchableOpacity>

            {/* Claim Expense */}
            <TouchableOpacity
              activeOpacity={0.8}
              className="bg-white w-[48%] p-4 rounded-3xl shadow-sm border border-slate-100 items-center justify-center"
              style={{ aspectRatio: 1 }}
            >
              <View className="w-12 h-12 bg-amber-50 rounded-2xl items-center justify-center mb-3">
                <CreditCard size={24} color="#d97706" />
              </View>
              <Text className="text-slate-900 font-bold text-sm text-center">
                Claim
              </Text>
              <Text className="text-slate-900 font-bold text-sm text-center">
                Expense
              </Text>
              <View className="mt-2 bg-amber-100 px-2 py-0.5 rounded-md">
                <Text className="text-amber-700 font-extrabold text-[8px] tracking-wider">
                  COMING SOON
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Horizontal Sign Out */}
          <TouchableOpacity
            onPress={handleLogout}
            className="flex-row items-center justify-center bg-rose-50 p-5 rounded-2xl border border-rose-100 mt-4"
          >
            <LogOut size={24} color="#e11d48" />
            <Text className="text-rose-600 font-bold text-lg ml-3">Sign Out Account</Text>
          </TouchableOpacity>

          {/* App Metadata Footer */}
          <View className="mt-8 items-center opacity-40">
            <Text className="text-[10px] font-bold text-slate-500 tracking-widest">Geo-Track HRMS System</Text>
            <Text className="text-[9px] font-bold text-slate-400 mt-1">Version 1.0.0 • Production Stable</Text>
          </View>
        </View>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={editModalVisible} animationType="slide" transparent>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-[40px] px-8 pt-8 pb-12 shadow-2xl">
            <View className="flex-row justify-between items-center mb-8">
              <Text className="text-2xl font-bold text-slate-800 tracking-tight">Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)} className="bg-slate-100 p-2 rounded-full">
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View className="items-center mb-8">
                <TouchableOpacity onPress={pickProfileImage} className="relative">
                  <View className="w-24 h-24 rounded-full bg-slate-100 overflow-hidden border-2 border-slate-100">
                    {(form.profileImage || user?.profileImage) ? (
                      <Image source={{ uri: form.profileImage || user.profileImage }} className="w-full h-full" />
                    ) : (
                      <View className="flex-1 items-center justify-center">
                        <Camera size={32} color="#94a3b8" />
                      </View>
                    )}
                  </View>
                  <View className="absolute bottom-0 right-0 bg-indigo-600 p-2 rounded-full border-2 border-white">
                    <Camera size={14} color="white" />
                  </View>
                </TouchableOpacity>
              </View>

              <View className="space-y-4">
                <View>
                  <Text className="text-[10px] font-bold text-slate-400  tracking-widest mb-2 ml-1">Full Name</Text>
                  <TextInput
                    className="bg-slate-50 rounded-xl px-5 h-14 border border-slate-100 font-bold text-slate-800"
                    value={form.name}
                    onChangeText={(v) => setForm({ ...form, name: v })}
                    placeholder="Enter full name"
                  />
                </View>
                <View className="mt-4">
                  <Text className="text-[10px] font-bold text-slate-400  tracking-widest mb-2 ml-1">Email</Text>
                  <TextInput
                    className="bg-slate-50 rounded-xl px-5 h-14 border border-slate-100 font-bold text-slate-800"
                    value={form.email}
                    onChangeText={(v) => setForm({ ...form, email: v })}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
                <View className="mt-4">
                  <Text className="text-[10px] font-bold text-slate-400  tracking-widest mb-2 ml-1">Mobile</Text>
                  <TextInput
                    className="bg-slate-50 rounded-xl px-5 h-14 border border-slate-100 font-bold text-slate-800"
                    value={form.mobile}
                    onChangeText={(v) => setForm({ ...form, mobile: v })}
                    keyboardType="phone-pad"
                  />
                </View>


                <TouchableOpacity
                  onPress={handleUpdate}
                  disabled={updating}
                  className="bg-[#0ea5e9] h-16 rounded-xl items-center justify-center mt-8 shadow-lg shadow-blue-800"
                >
                  {updating ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white font-bold text-lg">Save Changes</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Bottom Toast Notification */}
      {toast.show && (
        <View className={`absolute bottom-10 left-6 right-6 p-4 rounded-2xl shadow-2xl flex-row items-center border ${toast.type === 'success' ? 'bg-emerald-500 border-emerald-400' : 'bg-rose-500 border-rose-400'}`}>
          <Text className="text-white font-bold text-sm text-center flex-1">{toast.message}</Text>
        </View>
      )}

      {/* Dynamic sliding history drawer */}
      <NotificationDrawer
        visible={notifDrawerVisible}
        onClose={() => setNotifDrawerVisible(false)}
        onUpdateUnreadCount={(cnt) => setUnreadNotifications(cnt)}
      />
    </View>
  );
};

export default ProfileScreen;
