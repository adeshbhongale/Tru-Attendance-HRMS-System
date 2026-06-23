import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChevronRight, Eye, EyeOff, KeyRound, Mail, Phone, ShieldCheck, X } from 'lucide-react-native';
import { useState, useEffect } from 'react';
import * as Application from 'expo-application';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import api from '../api/axios';
import { registerPushToken } from '../utils/notifications';

const LoginScreen = ({ navigation }) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  useEffect(() => {
    const checkLogin = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        const user = await AsyncStorage.getItem('user');
        if (token && user) {
          navigation.reset({
            index: 0,
            routes: [{ name: 'Main' }],
          });
        }
      } catch (e) {}
    };
    checkLogin();
  }, []);

  const handleLogin = async () => {
    Keyboard.dismiss();
    const trimmedId = identifier.trim();
    const trimmedPass = password.trim();

    if (!trimmedId) {
      setToast({ show: true, message: 'Please enter your email or mobile number', type: 'error' });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2000);
      return;
    }
    if (!trimmedPass) {
      setToast({ show: true, message: 'Please enter your password', type: 'error' });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2000);
      return;
    }

    setLoading(true);
    try {
      let deviceId = 'simulator_fallback_id';
      try {
        if (Platform.OS === 'android') {
          deviceId = Application.getAndroidId() || 'android_fallback';
        } else if (Platform.OS === 'ios') {
          deviceId = await Application.getIosIdForVendorAsync() || 'ios_fallback';
        }
      } catch (deviceErr) {
        console.log('Error retrieving device ID:', deviceErr.message);
      }

      const res = await api.post('/auth/login', {
        identifier: trimmedId,
        password: trimmedPass,
        deviceId
      });
      const { token, user } = res.data;

      if (user.role === 'admin') {
        setLoading(false);
        setToast({ show: true, message: 'Administrators can only log in through the Web Admin Panel.', type: 'error' });
        setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
        return;
      }

      await AsyncStorage.setItem('token', token);
      await AsyncStorage.setItem('user', JSON.stringify(user));
      await AsyncStorage.setItem('userId', user._id || user.id);

      // Register dynamic push notifications token immediately
      registerPushToken().catch(() => {});

      // Trigger tracking initialization immediately if they have an active session
      try {
        const { initializeTracking } = require('../services/trackingManager');
        await initializeTracking();
      } catch (trackInitErr) {
        console.warn('[LoginScreen] Failed to trigger tracking initialization:', trackInitErr.message);
      }

      setToast({ show: true, message: `Welcome back, ${user.name}!`, type: 'success' });
      setTimeout(() => {
        setToast(prev => ({ ...prev, show: false }));
        navigation.reset({
          index: 0,
          routes: [{ name: 'Main' }],
        });
      }, 1500);
    } catch (err) {
      // Network error (server unreachable)
      if (!err.response) {
        setToast({ show: true, message: 'Cannot reach server. Please check your internet connection.', type: 'error' });
      } else {
        // Backend returned a specific error message
        const msg = err.response?.data?.message || 'Login failed. Please check your credentials.';
        setToast({ show: true, message: msg, type: 'error' });
      }
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-slate-50"
    >
      <StatusBar barStyle="dark-content" />
      <View className="flex-1 px-8 pt-20">
        {/* Logo */}
        <View className="mb-10 items-center justify-center">
          <View className="w-20 h-20 rounded-[28px] bg-indigo-600 justify-center items-center mb-8 shadow-xl shadow-indigo-200">
            <ShieldCheck size={38} color="white" />
          </View>
          <Text className="text-4xl font-extrabold text-slate-900 tracking-tight ">Login</Text>
          <Text className="text-base text-slate-500 mt-3 font-bold text-center">
            Enter your credentials to access your dashboard
          </Text>
        </View>

        {/* Form */}
        <View className="gap-5">
          <View>
            <Text className="text-[10px] font-bold text-slate-400 tracking-widest mb-2 ml-1">Email or Phone Number</Text>
            <View className="flex-row items-center bg-white rounded-2xl px-5 h-16 border border-slate-200 shadow-sm">
              <Mail size={20} color="#64748b" />
              <TextInput
                className="flex-1 ml-3 text-base font-bold text-slate-800"
                placeholder="you@company.com"
                value={identifier}
                onChangeText={setIdentifier}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor="#cbd5e1"
              />
            </View>
          </View>

          <View>
            <Text className="text-[10px] font-bold text-slate-400 tracking-widest mb-2 ml-1">Password</Text>
            <View className="flex-row items-center bg-white rounded-2xl px-5 h-16 border border-slate-200 shadow-sm">
              <KeyRound size={20} color="#64748b" />
              <TextInput
                className="flex-1 ml-3 text-base font-bold text-slate-800"
                placeholder="••••••••"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholderTextColor="#cbd5e1"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} className="p-2">
                {showPassword ? <EyeOff size={20} color="#94a3b8" /> : <Eye size={20} color="#94a3b8" />}
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            className="bg-indigo-600 shadow-lg shadow-indigo-200 h-16 rounded-2xl flex-row justify-center items-center mt-2"
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Text className="text-white text-base font-bold mr-3">Sign In</Text>
                <ChevronRight size={18} color="white" />
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <TouchableOpacity
          onPress={() => setShowAdminModal(true)}
          className="mt-auto mb-10 items-center active:opacity-70"
        >
          <Text className="text-slate-400 font-bold text-sm">Need help? Contact Admin</Text>
          <Text className="text-slate-300 text-[10px] mt-2 font-bold tracking-widest">
            Geo-Attendance HRMS • v1.0.0
          </Text>
        </TouchableOpacity>

        {/* Admin Contact Modal */}
        <Modal visible={showAdminModal} transparent animationType="fade">
          <View className="flex-1 bg-black/60 justify-center items-center px-8">
            <View className="bg-white w-full rounded-[32px] p-8 shadow-2xl relative overflow-hidden">
              {/* Background Accent */}
              <View className="absolute top-0 right-0 w-32 h-32 bg-indigo-50/50 rounded-bl-full -mr-16 -mt-16" />

              <View className="flex-row justify-between items-center mb-8 relative">
                <View className="w-12 h-12 bg-indigo-100 rounded-2xl items-center justify-center">
                  <ShieldCheck size={24} color="#4f46e5" />
                </View>
                <TouchableOpacity
                  onPress={() => setShowAdminModal(false)}
                  className="bg-slate-100 p-2 rounded-full"
                >
                  <X size={20} color="#64748b" />
                </TouchableOpacity>
              </View>

              <Text className="text-2xl font-bold text-slate-800 mb-2">Admin Support</Text>
              <Text className="text-slate-500 font-bold text-sm mb-8">Please contact the administrator for account issues or technical help.</Text>

              <View className="gap-4">
                <View className="flex-row items-center bg-slate-50 p-5 rounded-2xl border border-slate-100">
                  <View className="w-10 h-10 bg-white rounded-xl items-center justify-center shadow-sm">
                    <Mail size={18} color="#4f46e5" />
                  </View>
                  <View className="ml-4">
                    <Text className="text-[10px] font-bold text-slate-400 tracking-widest">Support Email</Text>
                    <Text className="text-slate-800 font-bold text-sm">admin@hrms.com</Text>
                  </View>
                </View>

                <View className="flex-row items-center bg-slate-50 p-5 rounded-2xl border border-slate-100">
                  <View className="w-10 h-10 bg-white rounded-xl items-center justify-center shadow-sm">
                    <Phone size={18} color="#0ea5e9" />
                  </View>
                  <View className="ml-4">
                    <Text className="text-[10px] font-bold text-slate-400 tracking-widest">Contact Number</Text>
                    <Text className="text-slate-800 font-bold text-sm">+91 12345 67890</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </Modal>

        {/* Bottom Toast Notification */}
        {toast.show && (
          <View className={`absolute bottom-10 left-6 right-6 p-4 rounded-2xl shadow-2xl flex-row items-center border ${toast.type === 'success' ? 'bg-emerald-500 border-emerald-400' : 'bg-rose-500 border-rose-400'}`}>
            <Text className="text-white font-bold text-sm text-center flex-1">{toast.message}</Text>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

export default LoginScreen;
