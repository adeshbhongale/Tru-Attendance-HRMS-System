import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { ChevronRight, Eye, EyeOff, KeyRound, Mail, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import api from '../api/axios';

const LoginScreen = () => {
  const navigation = useNavigation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const trimmedId = identifier.trim();
    const trimmedPass = password.trim();

    if (!trimmedId) return Alert.alert('Required', 'Please enter your email or mobile number');
    if (!trimmedPass) return Alert.alert('Required', 'Please enter your password');

    setLoading(true);
    try {
      const res = await api.post('/auth/login', { 
        identifier: trimmedId, 
        password: trimmedPass 
      });
      const { token, user } = res.data;
      
      await AsyncStorage.setItem('token', token);
      await AsyncStorage.setItem('user', JSON.stringify(user));
      
      Alert.alert('Success', `Welcome back, ${user.name}!`);
      navigation.reset({
        index: 0,
        routes: [{ name: 'Main' }],
      });
    } catch (err) {
      const msg = err.response?.data?.message || 'Login failed. Please check your credentials.';
      Alert.alert('Login Failed', msg);
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
        <View className="mb-10">
          <View className="w-20 h-20 rounded-[28px] bg-indigo-600 justify-center items-center mb-8 shadow-xl shadow-indigo-200">
            <ShieldCheck size={38} color="white" />
          </View>
          <Text className="text-4xl font-extrabold text-slate-900 tracking-tight">Login</Text>
          <Text className="text-base text-slate-500 mt-3 font-bold">
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
        <View className="mt-auto mb-10 items-center">
          <Text className="text-slate-400 font-bold text-sm">Need help? Contact Admin</Text>
          <Text className="text-slate-300 text-[10px] mt-2 font-bold tracking-widest">
            Geo-Attendance HRMS • v1.0.0
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

export default LoginScreen;
