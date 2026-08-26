import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import {
  Bell,
  Camera,
  Edit3,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import api from "../api/axios";
import EditProfileModal from "../components/EditProfileModal";
import NotificationDrawer from "../components/NotificationDrawer";
// import { useSidebar } from '../context/SidebarContext'; // SIDEBAR COMMENTED OUT
import HRModuleFooter from "../components/HRModuleFooter";
import { clearTrackingSession } from "../services/trackingManager";
import { manualCheckForUpdates } from "../services/updateService";
import socket from "../socket";
import { getFullProfileImageUrl } from "../utils/imageUrl";

const ProfileScreen = ({ navigation }) => {
  // const { openSidebar } = useSidebar(); // SIDEBAR COMMENTED OUT
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notifDrawerVisible, setNotifDrawerVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  // Sync initial unread notifications count on Profile screen load
  useEffect(() => {
    if (user?._id) {
      const syncUnreadCount = () => {
        api
          .get("/notifications/employee/feed")
          .then((res) => {
            if (res.data.success) {
              const feed = res.data.data || [];
              setUnreadNotifications(feed.filter((n) => !n.isRead).length);
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

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await api.get("/auth/me");
      const freshUser = res.data.data;
      setUser(freshUser);
      await AsyncStorage.setItem("user", JSON.stringify(freshUser));
    } catch (err) {
      try {
        const cached = await AsyncStorage.getItem("user");
        if (cached) {
          const parsed = JSON.parse(cached);
          setUser(parsed);
        }
      } catch (_) { }
    } finally {
      setLoading(false);
    }
  };

  const uploadNewPhoto = async (base64Image) => {
    try {
      setUploadingPhoto(true);
      const res = await api.put("/auth/updatedetails", { profileImage: base64Image });
      if (res.data?.success && res.data?.data) {
        const updatedUser = res.data.data;
        setUser(updatedUser);
        await AsyncStorage.setItem("user", JSON.stringify(updatedUser));
        Alert.alert("Success", "Profile photo updated successfully and synced across web and mobile!");
      } else {
        Alert.alert("Upload Failed", res.data?.message || "Could not update profile photo");
      }
    } catch (uploadErr) {
      console.error("[ProfileScreen] Upload error:", uploadErr);
      Alert.alert("Error", uploadErr.response?.data?.message || "Failed to upload profile photo");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handlePickPhoto = async (useCamera = false) => {
    try {
      setPhotoModalVisible(false);
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission Required", "Camera permission is required to take a profile photo.");
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.6,
          base64: true,
        });
        if (!result.canceled && result.assets?.[0]?.base64) {
          await uploadNewPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
        }
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission Required", "Gallery access is required to select a profile photo.");
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.6,
          base64: true,
        });
        if (!result.canceled && result.assets?.[0]?.base64) {
          await uploadNewPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
        }
      }
    } catch (err) {
      console.error("[ProfileScreen] Pick photo error:", err);
      Alert.alert("Error", "Failed to select photo: " + (err.message || "Unknown error"));
    }
  };

  const handleRemovePhoto = () => {
    setPhotoModalVisible(false);
    Alert.alert("Remove Photo", "Are you sure you want to remove your profile photo?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            setUploadingPhoto(true);
            const res = await api.put("/auth/updatedetails", { profileImage: "" });
            if (res.data?.success && res.data?.data) {
              const updatedUser = res.data.data;
              setUser(updatedUser);
              await AsyncStorage.setItem("user", JSON.stringify(updatedUser));
              Alert.alert("Success", "Profile photo removed successfully");
            }
          } catch (e) {
            Alert.alert("Error", "Failed to remove photo");
          } finally {
            setUploadingPhoto(false);
          }
        },
      },
    ]);
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          try {
            await api.get("/auth/logout");
          } catch (_) { }
          try {
            await clearTrackingSession();
          } catch (trackingErr) {
            console.error(
              "[ProfileScreen] Failed to clear tracking session during logout:",
              trackingErr.message,
            );
          }
          await AsyncStorage.clear();
          navigation.reset({ index: 0, routes: [{ name: "Login" }] });
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-[#1972e9]">
        <ActivityIndicator size="large" color="white" />
      </View>
    );
  }

  const avatarUri = getFullProfileImageUrl(user?.profileImage);

  return (
    <View className="flex-1 bg-[#f6f8fc]">
      <StatusBar barStyle="light-content" backgroundColor="#1972e9" />

      {/* Blue Header Section */}
      <View className="bg-[#1972e9] pt-14 pb-20 px-6 rounded-b-[40px] shadow-sm flex-row items-center justify-between">
        <Text className="text-white font-bold text-xl tracking-wide">
          My Profile
        </Text>
        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            onPress={() => setEditModalVisible(true)}
            activeOpacity={0.8}
            className="w-10 h-10 rounded-full bg-white/15 justify-center items-center"
          >
            <Edit3 size={18} color="white" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setNotifDrawerVisible(true)}
            activeOpacity={0.8}
            className="w-10 h-10 rounded-full bg-white/15 justify-center items-center relative"
          >
            <Bell size={20} color="white" />
            {unreadNotifications > 0 && (
              <View className="absolute -top-1 -right-1 bg-[#f33c3c] min-w-[18px] h-[18px] rounded-full justify-center items-center px-1 border border-[#1972e9]">
                <Text className="text-white text-[8px] font-extrabold">
                  {unreadNotifications}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        className="flex-1 -mt-14"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Main Profile Overview Card */}
        <View className="bg-white rounded-[32px] p-6 shadow-xl shadow-slate-200/60 border border-slate-100 items-center mb-6">
          {/* Avatar Container with Camera Action Badge */}
          <View className="relative mb-4">
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setPhotoModalVisible(true)}
              disabled={uploadingPhoto}
              className="w-28 h-28 rounded-full bg-indigo-50 border-4 border-white shadow-md items-center justify-center overflow-hidden"
            >
              {uploadingPhoto ? (
                <View className="w-full h-full bg-slate-900/40 items-center justify-center">
                  <ActivityIndicator size="small" color="#ffffff" />
                </View>
              ) : avatarUri ? (
                <Image
                  source={{ uri: avatarUri }}
                  className="w-full h-full"
                  resizeMode="cover"
                />
              ) : (
                <Text className="text-4xl font-extrabold color-[#1972e9]">
                  {user?.name ? user.name.charAt(0).toUpperCase() : "U"}
                </Text>
              )}
            </TouchableOpacity>

            {/* Floating Camera Badge */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setPhotoModalVisible(true)}
              disabled={uploadingPhoto}
              className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-[#1972e9] border-2 border-white items-center justify-center shadow-lg"
            >
              <Camera size={15} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* User Name */}
          <Text className="text-2xl font-extrabold text-slate-900 text-center tracking-tight mb-1">
            {user?.name || "Employee"}
          </Text>

          {/* User Role / Designation Tag */}
          <View className="bg-indigo-50 px-4 py-1.5 rounded-full">
            <Text className="text-[#1972e9] font-bold text-xs tracking-wide">
              {user?.designation || user?.role || "Employee"}
            </Text>
          </View>
        </View>

        {/* Personal Details Section */}
        <View className="bg-white rounded-[28px] p-6 shadow-sm border border-slate-100 mb-5">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-slate-400 font-extrabold text-[11px] tracking-[0.15em]">
              Personal Details
            </Text>
            <TouchableOpacity
              onPress={() => setEditModalVisible(true)}
              activeOpacity={0.7}
              className="flex-row items-center"
            >
              <Edit3 size={13} color="#1972e9" />
              <Text className="text-[#1972e9] font-bold text-xs ml-1">Edit</Text>
            </TouchableOpacity>
          </View>

          <View className="space-y-4">
            <View className="py-2.5 border-b border-slate-100">
              <Text className="text-slate-400 font-bold text-[11px] tracking-wide mb-1">
                FULL NAME
              </Text>
              <Text className="text-slate-900 font-extrabold text-base">
                {user?.name || "—"}
              </Text>
            </View>

            <View className="py-2.5 border-b border-slate-100">
              <Text className="text-slate-400 font-bold text-[11px] tracking-wide mb-1">
                EMAIL ADDRESS
              </Text>
              <Text className="text-slate-900 font-extrabold text-base">
                {user?.email || "—"}
              </Text>
            </View>

            <View className="py-2.5 border-b border-slate-100">
              <Text className="text-slate-400 font-bold text-[11px] tracking-wide mb-1">
                PHONE NUMBER
              </Text>
              <Text className="text-slate-900 font-extrabold text-base">
                {user?.mobile || "—"}
              </Text>
            </View>

            <View className="py-2.5 border-b border-slate-100">
              <Text className="text-slate-400 font-bold text-[11px] tracking-wide mb-1">
                DATE OF BIRTH
              </Text>
              <Text className="text-slate-900 font-extrabold text-base">
                {user?.dob
                  ? new Date(user.dob).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })
                  : "—"}
              </Text>
            </View>

            <View className="py-2.5 border-b border-slate-100">
              <Text className="text-slate-400 font-bold text-[11px] tracking-wide mb-1">
                BLOOD GROUP
              </Text>
              <Text className="text-rose-600 font-extrabold text-base">
                {user?.bloodGroup || "—"}
              </Text>
            </View>

            <View className="py-2.5">
              <Text className="text-slate-400 font-bold text-[11px] tracking-wide mb-1">
                RESIDENTIAL ADDRESS
              </Text>
              <Text className="text-slate-900 font-bold text-sm leading-relaxed">
                {user?.address || "—"}
              </Text>
            </View>
          </View>
        </View>

        {/* Emergency References Section */}
        <View className="bg-white rounded-[28px] p-6 shadow-sm border border-slate-100 mb-5">
          <Text className="text-slate-400 font-extrabold text-[11px] tracking-[0.15em] mb-4">
            Emergency Reference Contacts
          </Text>

          <View className="space-y-4">
            <View className="py-2.5 border-b border-slate-100">
              <Text className="text-slate-400 font-bold text-[11px] tracking-wide mb-1">
                REFERENCE 1
              </Text>
              <Text className="text-slate-900 font-extrabold text-base">
                {user?.referenceName1 || "Reference 1"}
              </Text>
              <Text className="text-indigo-600 font-bold text-sm mt-0.5">
                {user?.referenceNumber1 || "—"}
              </Text>
            </View>

            <View className="py-2.5">
              <Text className="text-slate-400 font-bold text-[11px] tracking-wide mb-1">
                REFERENCE 2
              </Text>
              <Text className="text-slate-900 font-extrabold text-base">
                {user?.referenceName2 || "Reference 2"}
              </Text>
              <Text className="text-indigo-600 font-bold text-sm mt-0.5">
                {user?.referenceNumber2 || "—"}
              </Text>
            </View>
          </View>
        </View>

        {/* Employee Documents Section */}
        {user?.documents && user.documents.length > 0 && (
          <View className="bg-white rounded-[28px] p-6 shadow-sm border border-slate-100 mb-5">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-slate-400 font-extrabold text-[11px] tracking-[0.15em]">
                Employee Documents
              </Text>
              <View className="bg-indigo-50 px-2.5 py-0.5 rounded-full">
                <Text className="text-[#1972e9] font-bold text-[10px]">
                  {user.documents.length} Files
                </Text>
              </View>
            </View>

            <View className="space-y-3">
              {user.documents.map((doc, idx) => (
                <View
                  key={idx}
                  className="flex-row justify-between items-center p-3.5 bg-slate-50 rounded-2xl border border-slate-100"
                >
                  <View className="flex-row items-center flex-1 mr-3">
                    <View className="w-9 h-9 rounded-xl bg-indigo-100/70 items-center justify-center mr-3">
                      <FileText size={18} color="#1972e9" />
                    </View>
                    <View className="flex-1">
                      <Text
                        className="text-slate-900 font-bold text-xs"
                        numberOfLines={1}
                      >
                        {doc.docName || doc.docType || "Document"}
                      </Text>
                      <Text className="text-slate-400 font-medium text-[9px] mt-0.5">
                        {doc.docType || "File"}
                      </Text>
                    </View>
                  </View>

                  {doc.fileUrl && (
                    <TouchableOpacity
                      onPress={() =>
                        Linking.openURL(doc.fileUrl).catch(() =>
                          Alert.alert("Error", "Unable to open file link"),
                        )
                      }
                      className="bg-[#1972e9] px-3 py-2 rounded-xl flex-row items-center"
                    >
                      <ExternalLink size={12} color="white" />
                      <Text className="text-white font-bold text-[10px] ml-1">
                        View
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Work & Organization Details Section */}
        <View className="bg-white rounded-[28px] p-6 shadow-sm border border-slate-100 mb-6">
          <Text className="text-slate-400 font-extrabold text-[11px] tracking-[0.15em] mb-4">
            Work & Organization Info
          </Text>

          <View className="space-y-4">
            <View className="py-2.5 border-b border-slate-100">
              <Text className="text-slate-400 font-bold text-[11px] tracking-wide mb-1">
                DEPARTMENT
              </Text>
              <Text className="text-slate-900 font-extrabold text-base">
                {typeof user?.department === "object"
                  ? user?.department?.name || "General"
                  : user?.department || "General"}
              </Text>
            </View>

            <View className="py-2.5 border-b border-slate-100">
              <Text className="text-slate-400 font-bold text-[11px] tracking-wide mb-1">
                DESIGNATION
              </Text>
              <Text className="text-slate-900 font-extrabold text-base">
                {typeof user?.designation === "object"
                  ? user?.designation?.name || "Staff Member"
                  : user?.designation || "Staff Member"}
              </Text>
            </View>

            <View className="py-2.5 border-b border-slate-100">
              <Text className="text-slate-400 font-bold text-[11px] tracking-wide mb-1">
                ASSIGNED SHIFT
              </Text>
              <Text className="text-slate-900 font-extrabold text-base">
                {user?.shift?.name || "General Shift"}
                {user?.shift?.startTime
                  ? ` (${user.shift.startTime} - ${user.shift.endTime})`
                  : ""}
              </Text>
            </View>

            <View className="py-2.5">
              <Text className="text-slate-400 font-bold text-[11px] tracking-wide mb-1">
                ACCOUNT ROLE
              </Text>
              <Text className="text-slate-900 font-extrabold text-base capitalize">
                {user?.role || "Employee"}
              </Text>
            </View>
          </View>
        </View>

        {/* Sign Out Button */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleLogout}
          className="w-full bg-rose-50 border border-rose-200 py-4 rounded-2xl items-center mb-6"
        >
          <Text className="text-rose-600 font-extrabold text-base tracking-wide">
            Sign Out Account
          </Text>
        </TouchableOpacity>

        {/* System Info & OTA Update Checker */}
        <View className="items-center py-3 mb-2">
          <Text className="text-[11px] font-bold text-slate-500 tracking-widest uppercase">
            Trucode ERP System
          </Text>
          <Text className="text-[10px] font-medium text-slate-400 mt-0.5 mb-3">
            Version 1.1.1 • Mobile Application
          </Text>

          <TouchableOpacity
            activeOpacity={0.75}
            disabled={checkingUpdate}
            onPress={async () => {
              setCheckingUpdate(true);
              try {
                await manualCheckForUpdates();
              } finally {
                setCheckingUpdate(false);
              }
            }}
            className="flex-row items-center bg-indigo-50 border border-indigo-200/70 px-4 py-2 rounded-full shadow-sm"
          >
            {checkingUpdate ? (
              <ActivityIndicator size="small" color="#1972e9" style={{ marginRight: 8 }} />
            ) : (
              <RefreshCw size={13} color="#1972e9" style={{ marginRight: 8 }} />
            )}
            <Text className="text-[#1972e9] font-bold text-xs">
              {checkingUpdate ? "Checking for Updates..." : "Check for Updates"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>


      {/* Notification Drawer */}
      <NotificationDrawer
        visible={notifDrawerVisible}
        onClose={() => setNotifDrawerVisible(false)}
        onUpdateUnreadCount={(cnt) => setUnreadNotifications(cnt)}
      />

      {/* Edit Profile Modal */}
      <EditProfileModal
        visible={editModalVisible}
        onClose={() => setEditModalVisible(false)}
        user={user}
        onProfileUpdated={async (updatedUser) => {
          if (updatedUser) {
            setUser(updatedUser);
            try {
              await AsyncStorage.setItem("user", JSON.stringify(updatedUser));
            } catch (_) { }
          }
        }}
      />

      {/* Photo Picker Action Modal */}
      <Modal
        visible={photoModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoModalVisible(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(15, 23, 42, 0.6)", justifyContent: "flex-end" }}
          activeOpacity={1}
          onPress={() => setPhotoModalVisible(false)}
        >
          <View className="bg-white rounded-t-[32px] p-6 pb-10 shadow-2xl">
            <View className="flex-row items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <View className="flex-row items-center gap-2">
                <Camera size={20} color="#1972e9" />
                <Text className="text-lg font-bold text-slate-900">Change Profile Photo</Text>
              </View>
              <TouchableOpacity
                onPress={() => setPhotoModalVisible(false)}
                className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center"
              >
                <X size={16} color="#64748b" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => handlePickPhoto(true)}
              className="flex-row items-center gap-3 p-4 bg-indigo-50/60 rounded-2xl mb-3 border border-indigo-100/50"
            >
              <View className="w-10 h-10 rounded-xl bg-indigo-600 items-center justify-center">
                <Camera size={18} color="#ffffff" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold text-slate-900">Take Photo with Camera</Text>
                <Text className="text-xs text-slate-500 font-medium">Use front/back camera to take a new selfie</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => handlePickPhoto(false)}
              className="flex-row items-center gap-3 p-4 bg-slate-50 rounded-2xl mb-3 border border-slate-200/60"
            >
              <View className="w-10 h-10 rounded-xl bg-[#1972e9] items-center justify-center">
                <ImageIcon size={18} color="#ffffff" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold text-slate-900">Choose from Gallery</Text>
                <Text className="text-xs text-slate-500 font-medium">Select photo from device storage</Text>
              </View>
            </TouchableOpacity>

            {Boolean(user?.profileImage) ? (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleRemovePhoto}
                className="flex-row items-center gap-3 p-4 bg-rose-50 rounded-2xl border border-rose-100"
              >
                <View className="w-10 h-10 rounded-xl bg-rose-600 items-center justify-center">
                  <Trash2 size={18} color="#ffffff" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-bold text-rose-700">Remove Photo</Text>
                  <Text className="text-xs text-rose-500 font-medium">Reset to default initial avatar</Text>
                </View>
              </TouchableOpacity>
            ) : null}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* HR Module Footer */}
      <HRModuleFooter navigation={navigation} currentScreen="profile" />
    </View>
  );
};

export default ProfileScreen;
