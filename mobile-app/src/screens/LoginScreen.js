import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import {
  Building,
  ChevronRight,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  Phone,
  ShieldCheck,
  X,
} from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import api from "../api/axios";
import { registerPushToken } from "../utils/notifications";

const LoginScreen = ({ navigation }) => {
  const [companyCode, setCompanyCode] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });

  const mobileInputRef = useRef(null);
  const passwordInputRef = useRef(null);

  useEffect(() => {
    const checkLogin = async () => {
      try {
        const token = await AsyncStorage.getItem("token");
        const user = await AsyncStorage.getItem("user");
        const savedCompanyCode = await AsyncStorage.getItem("companyCode");

        if (savedCompanyCode) {
          setCompanyCode(savedCompanyCode);
        }

        if (token && user) {
          navigation.reset({
            index: 0,
            routes: [{ name: "Main" }],
          });
        }
      } catch (e) { }
    };
    checkLogin();
  }, []);

  const handleLogin = async () => {
    Keyboard.dismiss();
    const trimmedCode = companyCode.trim().toUpperCase();
    const trimmedId = identifier.trim();
    const trimmedPass = password.trim();

    if (!trimmedCode) {
      setToast({
        show: true,
        message: "Please enter your Company Code (e.g. TCSL)",
        type: "error",
      });
      setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 2500);
      return;
    }

    if (!trimmedId) {
      setToast({
        show: true,
        message: "Please enter your mobile number",
        type: "error",
      });
      setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 2500);
      return;
    }

    if (trimmedId.length !== 10) {
      setToast({
        show: true,
        message: "Mobile number must be exactly 10 digits",
        type: "error",
      });
      setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 2500);
      return;
    }

    if (!trimmedPass) {
      setToast({
        show: true,
        message: "Please enter your password",
        type: "error",
      });
      setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 2500);
      return;
    }

    setLoading(true);
    try {
      let deviceId = "simulator_fallback_id";
      try {
        if (Platform.OS === "android") {
          deviceId = Application.getAndroidId() || "android_fallback";
        } else if (Platform.OS === "ios") {
          deviceId =
            (await Application.getIosIdForVendorAsync()) || "ios_fallback";
        }
      } catch (deviceErr) {
        console.log("Error retrieving device ID:", deviceErr.message);
      }

      const res = await api.post("/auth/login", {
        companyCode: trimmedCode,
        identifier: trimmedId,
        password: trimmedPass,
        deviceId,
        clientType: "mobile",
      });
      const { token, user } = res.data;

      const userRole = (user.role || '').toLowerCase();
      const userRoleCode = (user.roleCode || '').toUpperCase();
      const EXCLUDED_ADMIN_ROLES = [
        'superadmin', 'super_admin',
        'company_admin', 'companyadmin'
      ];
      const EXCLUDED_ADMIN_CODES = ['TCSA1', 'TCCA1', 'SUPERADMIN', 'COMPANY_ADMIN', 'HR_ADMIN', 'STORE_ADMIN', 'ACCOUNT_ADMIN', 'TCSTR1', 'TCACC1', 'TCSF2A'];

      const isForbiddenAdmin = EXCLUDED_ADMIN_ROLES.includes(userRole) || EXCLUDED_ADMIN_CODES.includes(userRoleCode) || user.scope === 'GLOBAL';

      if (isForbiddenAdmin) {
        setToast({
          show: true,
          message: "Access denied. Admin portal accounts cannot log in to the mobile app.",
          type: "error",
        });
        setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 3500);
        setLoading(false);
        return;
      }

      await AsyncStorage.setItem("token", token);
      await AsyncStorage.setItem("user", JSON.stringify(user));
      await AsyncStorage.setItem("userId", user._id || user.id);
      await AsyncStorage.setItem("companyCode", trimmedCode);

      registerPushToken().catch(() => { });

      try {
        const { initializeTracking } = require("../services/trackingManager");
        await initializeTracking();
      } catch (trackInitErr) {
        console.warn(
          "[LoginScreen] Failed to trigger tracking initialization:",
          trackInitErr.message,
        );
      }

      setToast({
        show: true,
        message: `Welcome back, ${user.name}!`,
        type: "success",
      });
      setTimeout(() => {
        setToast((prev) => ({ ...prev, show: false }));
        navigation.reset({
          index: 0,
          routes: [{ name: "Main" }],
        });
      }, 1500);
    } catch (err) {
      console.log("[LoginScreen] Login error:", err?.message, err?.code);
      if (!err.response) {
        const isTimeout = err?.code === 'ECONNABORTED' || (err?.message && err.message.toLowerCase().includes('timeout'));
        setToast({
          show: true,
          message: isTimeout
            ? "Server is waking up (cloud spin-up). Please retry in 10 seconds."
            : "Cannot reach server. Please check internet connection.",
          type: "error",
        });
      } else {
        const msg =
          err.response?.data?.message ||
          "Login failed. Please check your credentials.";
        setToast({ show: true, message: msg, type: "error" });
      }
      setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 4000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-slate-50"
    >
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="always"
        className="flex-1 px-8 pt-10 pb-8"
      >
        <View className="flex-1 justify-between py-4">
          <View>
            <View className="mb-6 items-center justify-center">
              <View className="w-16 h-16 rounded-[22px] bg-indigo-600 justify-center items-center mb-4 shadow-lg shadow-indigo-200">
                <ShieldCheck size={32} color="white" />
              </View>
              <Text className="text-3xl font-extrabold text-slate-900 tracking-tight text-center">
                Sign In
              </Text>
              <Text className="text-sm text-slate-500 mt-1 font-semibold text-center px-2">
                Enter your company code and credentials to access your HRMS workspace
              </Text>
            </View>

            <View className="gap-4">
              <View>
                <Text className="text-[10px] font-extrabold text-slate-400 tracking-widest uppercase mb-1.5 ml-1">
                  Company Code (e.g. TCSL)
                </Text>
                <View className="flex-row items-center bg-white rounded-2xl px-5 h-16 border border-slate-200 shadow-sm">
                  <Building size={20} color="#4f46e5" />
                  <TextInput
                    className="flex-1 ml-3 text-base font-bold text-slate-900 uppercase tracking-widest"
                    placeholder="ENTER COMPANY CODE"
                    value={companyCode}
                    onChangeText={(val) => setCompanyCode(val.toUpperCase())}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    returnKeyType="next"
                    onSubmitEditing={() => mobileInputRef.current?.focus()}
                    placeholderTextColor="#cbd5e1"
                  />
                </View>
              </View>

              <View>
                <Text className="text-[10px] font-extrabold text-slate-400 tracking-widest uppercase mb-1.5 ml-1">
                  Mobile Number
                </Text>
                <View className="flex-row items-center bg-white rounded-2xl px-5 h-16 border border-slate-200 shadow-sm">
                  <Phone size={20} color="#64748b" />
                  <TextInput
                    ref={mobileInputRef}
                    className="flex-1 ml-3 text-base font-bold text-slate-800"
                    placeholder="Enter 10-digit mobile number"
                    value={identifier}
                    onChangeText={(val) => setIdentifier(val.replace(/\D/g, '').slice(0, 10))}
                    keyboardType="phone-pad"
                    maxLength={10}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    onSubmitEditing={() => passwordInputRef.current?.focus()}
                    placeholderTextColor="#cbd5e1"
                  />
                </View>
              </View>

              <View>
                <Text className="text-[10px] font-extrabold text-slate-400 tracking-widest uppercase mb-1.5 ml-1">
                  Password
                </Text>
                <View className="flex-row items-center bg-white rounded-2xl px-5 h-16 border border-slate-200 shadow-sm">
                  <KeyRound size={20} color="#64748b" />
                  <TextInput
                    ref={passwordInputRef}
                    className="flex-1 ml-3 text-base font-bold text-slate-800"
                    placeholder="••••••••"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                    placeholderTextColor="#cbd5e1"
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    className="p-2"
                  >
                    {showPassword ? (
                      <EyeOff size={20} color="#94a3b8" />
                    ) : (
                      <Eye size={20} color="#94a3b8" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              <Pressable
                className="bg-indigo-600 shadow-lg shadow-indigo-200 h-16 rounded-2xl flex-row justify-center items-center mt-2"
                style={({ pressed }) => ({
                  backgroundColor: pressed ? "#4338ca" : "#4f46e5",
                  height: 64,
                  borderRadius: 16,
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "center",
                  marginTop: 8,
                  opacity: pressed ? 0.85 : 1,
                })}
                onPress={handleLogin}
                disabled={loading}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <View pointerEvents="none" className="flex-row items-center justify-center">
                    <Text
                      className="text-white text-base font-bold mr-3"
                      style={{ color: "#ffffff", fontSize: 16, fontWeight: "700", marginRight: 12 }}
                    >
                      Sign In
                    </Text>
                    <ChevronRight size={18} color="white" />
                  </View>
                )}
              </Pressable>
            </View>
          </View>

          <TouchableOpacity
            onPress={() => setShowAdminModal(true)}
            className="items-center pt-8 pb-4 active:opacity-70"
          >
            <Text className="text-slate-400 font-bold text-sm">
              Need help? Contact Admin
            </Text>
            <Text className="text-slate-300 text-[10px] mt-2 font-bold tracking-widest">
              Geo-Attendance HRMS • Multi-Tenant v1.0
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={showAdminModal} transparent animationType="fade">
        <View className="flex-1 bg-black/60 justify-center items-center px-8">
          <View className="bg-white w-full rounded-[32px] p-8 shadow-2xl relative overflow-hidden">
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

            <Text className="text-2xl font-bold text-slate-800 mb-2">
              Admin Support
            </Text>
            <Text className="text-slate-500 font-bold text-sm mb-8">
              Please contact your company administrator for account setup or technical assistance.
            </Text>

            <View className="gap-4">
              <View className="flex-row items-center bg-slate-50 p-5 rounded-2xl border border-slate-100">
                <View className="w-10 h-10 bg-white rounded-xl items-center justify-center shadow-sm">
                  <Mail size={18} color="#4f46e5" />
                </View>
                <View className="ml-4">
                  <Text className="text-[10px] font-bold text-slate-400 tracking-widest">
                    Support Email
                  </Text>
                  <Text className="text-slate-800 font-bold text-sm">
                    admin@hrms.com
                  </Text>
                </View>
              </View>

              <View className="flex-row items-center bg-slate-50 p-5 rounded-2xl border border-slate-100">
                <View className="w-10 h-10 bg-white rounded-xl items-center justify-center shadow-sm">
                  <Phone size={18} color="#0ea5e9" />
                </View>
                <View className="ml-4">
                  <Text className="text-[10px] font-bold text-slate-400 tracking-widest">
                    Contact Number
                  </Text>
                  <Text className="text-slate-800 font-bold text-sm">
                    +91 12345 67890
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {toast.show && (
        <View
          className={`absolute bottom-10 left-6 right-6 p-4 rounded-2xl shadow-2xl flex-row items-center border ${toast.type === "success" ? "bg-emerald-500 border-emerald-400" : "bg-rose-500 border-rose-400"}`}
        >
          <Text className="text-white font-bold text-sm text-center flex-1">
            {toast.message}
          </Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
};

export default LoginScreen;
