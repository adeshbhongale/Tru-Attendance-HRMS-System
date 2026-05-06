import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform,
  Dimensions,
  Alert
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { theme } from '../theme';
import { Mail, ShieldCheck, ChevronRight, Send } from 'lucide-react-native';

const { width } = Dimensions.get('window');
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api';

const LoginScreen = ({ navigation }) => {
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState(1); 
  const [loading, setLoading] = useState(false);

  const handleSendOTP = async () => {
    if (!identifier) return Alert.alert('Error', 'Please enter email or mobile number');
    setLoading(true);
    try {
      await axios.post(`${API_URL}/auth/send-otp`, { identifier });
      setStep(2);
      Alert.alert('Sent', 'OTP sent! Please check your registered email or mobile.');
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!otp) return Alert.alert('Error', 'Please enter OTP');
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/auth/login`, { identifier, otp });
      const { token, user } = res.data;
      
      await AsyncStorage.setItem('token', token);
      await AsyncStorage.setItem('user', JSON.stringify(user));
      
      navigation.navigate('Dashboard');
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.topSection}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>GeoHR</Text>
        </View>
        <Text style={styles.welcomeText}>Welcome Back</Text>
        <Text style={styles.subText}>
          {step === 1 ? 'Enter your email or mobile to receive OTP' : 'Enter the 6-digit OTP sent to your device'}
        </Text>
      </View>

      <View style={styles.formSection}>
        {step === 1 ? (
          <>
            <View style={styles.inputContainer}>
              <Mail size={20} color={theme.colors.textMuted} style={styles.inputIcon} />
              <TextInput 
                style={styles.input}
                placeholder="Email or Mobile Number"
                value={identifier}
                onChangeText={setIdentifier}
                keyboardType="default"
                autoCapitalize="none"
              />
            </View>
            <TouchableOpacity style={styles.loginButton} onPress={handleSendOTP} disabled={loading}>
              <Text style={styles.loginButtonText}>{loading ? 'Sending...' : 'Send OTP'}</Text>
              <Send size={20} color="white" />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.inputContainer}>
              <ShieldCheck size={20} color={theme.colors.textMuted} style={styles.inputIcon} />
              <TextInput 
                style={styles.input}
                placeholder="Enter 6-digit OTP"
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={6}
              />
            </View>
            <TouchableOpacity style={styles.loginButton} onPress={handleLogin} disabled={loading}>
              <Text style={styles.loginButtonText}>{loading ? 'Logging in...' : 'Sign In'}</Text>
              <ChevronRight size={20} color="white" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setStep(1)} style={styles.backBtn}>
              <Text style={styles.backBtnText}>Back to Login</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Don't have an account? </Text>
        <TouchableOpacity>
          <Text style={styles.signUpText}>Contact Admin</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
  },
  topSection: {
    marginTop: 80,
    marginBottom: 50,
  },
  logoContainer: {
    width: 60,
    height: 60,
    borderRadius: 15,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  logoText: {
    color: 'white',
    fontWeight: '900',
    fontSize: 18,
  },
  welcomeText: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.colors.text,
  },
  subText: {
    fontSize: 16,
    color: theme.colors.textMuted,
    marginTop: 5,
  },
  formSection: {
    gap: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 15,
    height: 60,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.light,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: theme.colors.text,
  },
  loginButton: {
    backgroundColor: theme.colors.primary,
    height: 60,
    borderRadius: theme.borderRadius.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    ...theme.shadows.medium,
  },
  loginButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
    marginRight: 10,
  },
  backBtn: {
    alignItems: 'center',
    marginTop: 10,
  },
  backBtnText: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 'auto',
    marginBottom: 20,
  },
  footerText: {
    color: theme.colors.textMuted,
  },
  signUpText: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
});

export default LoginScreen;
