import DateTimePicker from "@react-native-community/datetimepicker";
import {
  Calendar,
  CheckCircle2,
  Droplet,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  MapPin,
  Phone,
  ShieldAlert,
  User,
  UserCheck,
  X,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import api from "../api/axios";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const EditProfileModal = ({ visible, onClose, user, onProfileUpdated }) => {
  const [activeTab, setActiveTab] = useState("personal"); // 'personal' | 'password'

  // Personal Info Form State
  const [address, setAddress] = useState("");
  const [dob, setDob] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [bloodGroup, setBloodGroup] = useState("");
  const [referenceName1, setReferenceName1] = useState("");
  const [referenceNumber1, setReferenceNumber1] = useState("");
  const [referenceName2, setReferenceName2] = useState("");
  const [referenceNumber2, setReferenceNumber2] = useState("");

  // Password Form State
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Status & Loading states
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  useEffect(() => {
    if (user && visible) {
      setAddress(user.address || "");
      setDob(user.dob ? new Date(user.dob) : null);
      setBloodGroup(user.bloodGroup || "");
      setReferenceName1(user.referenceName1 || "");
      setReferenceNumber1(user.referenceNumber1 || "");
      setReferenceName2(user.referenceName2 || "");
      setReferenceNumber2(user.referenceNumber2 || "");

      // Reset password fields
      setNewPassword("");
      setConfirmPassword("");
      setShowNewPassword(false);
      setShowConfirmPassword(false);
    }
  }, [user, visible]);

  const showToast = (message, type = "success", duration = 3000) => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, duration);
  };

  const handleDateChange = (event, selectedDate) => {
    setShowDatePicker(Platform.OS === "ios");
    if (selectedDate) {
      setDob(selectedDate);
    }
  };

  const handleSavePersonal = async () => {
    // Validate reference phone numbers if entered
    const cleanRef1 = referenceNumber1.trim();
    const cleanRef2 = referenceNumber2.trim();

    if (cleanRef1 && cleanRef1.length !== 10) {
      showToast("Reference 1 mobile number must be 10 digits", "error");
      return;
    }

    if (cleanRef2 && cleanRef2.length !== 10) {
      showToast("Reference 2 mobile number must be 10 digits", "error");
      return;
    }

    setSavingPersonal(true);
    try {
      const payload = {
        address: address.trim(),
        dob: dob ? dob.toISOString() : null,
        bloodGroup: bloodGroup.trim(),
        referenceName1: referenceName1.trim(),
        referenceNumber1: cleanRef1,
        referenceName2: referenceName2.trim(),
        referenceNumber2: cleanRef2,
      };

      const res = await api.put("/auth/updatedetails", payload);
      if (res.data?.success) {
        showToast("Profile details updated successfully!", "success");
        if (onProfileUpdated) {
          onProfileUpdated(res.data.data);
        }
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        showToast(res.data?.message || "Failed to update profile", "error");
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message || "Network error updating profile";
      showToast(errorMsg, "error");
    } finally {
      setSavingPersonal(false);
    }
  };

  const handleSavePassword = async () => {
    const trimmedPass = newPassword.trim();
    const trimmedConfirm = confirmPassword.trim();

    if (!trimmedPass) {
      showToast("Please enter a new password", "error");
      return;
    }

    if (trimmedPass.length < 6) {
      showToast("Password must be at least 6 characters long", "error");
      return;
    }

    if (trimmedPass !== trimmedConfirm) {
      showToast("Passwords do not match. Please verify.", "error");
      return;
    }

    setSavingPassword(true);
    try {
      let res;
      try {
        res = await api.put("/auth/updatepassword", {
          newPassword: trimmedPass,
          password: trimmedPass,
        });
      } catch (err) {
        if (err.response?.status === 404) {
          // Fallback to /auth/updatedetails if /auth/updatepassword route is not yet deployed on server
          res = await api.put("/auth/updatedetails", {
            password: trimmedPass,
            newPassword: trimmedPass,
          });
        } else {
          throw err;
        }
      }

      if (res.data?.success) {
        showToast("Password changed! Use this new password for next login.", "success", 4000);
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => {
          onClose();
        }, 1800);
      } else {
        showToast(res.data?.message || "Failed to update password", "error");
      }
    } catch (err) {
      const errorMsg =
        err.response?.data?.message ||
        (err.response?.status === 404
          ? "Server endpoint not found (404). Please ensure backend updates are deployed to Railway."
          : err.message || "Failed to update password");
      showToast(errorMsg, "error");
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.modalOverlay}
      >
        <View style={styles.sheetContainer}>
          {/* Top Drag Indicator */}
          <View style={styles.dragIndicator} />

          {/* Header */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.headerTitle}>Edit Profile</Text>
              <Text style={styles.headerSubtitle}>Manage your details & security</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <X size={20} color="#64748b" />
            </TouchableOpacity>
          </View>

          {/* Tab Switcher */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              onPress={() => setActiveTab("personal")}
              style={[styles.tabButton, activeTab === "personal" && styles.tabButtonActive]}
              activeOpacity={0.8}
            >
              <User size={16} color={activeTab === "personal" ? "#1972e9" : "#64748b"} />
              <Text style={[styles.tabText, activeTab === "personal" && styles.tabTextActive]}>
                Personal Info
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setActiveTab("password")}
              style={[styles.tabButton, activeTab === "password" && styles.tabButtonActive]}
              activeOpacity={0.8}
            >
              <KeyRound size={16} color={activeTab === "password" ? "#1972e9" : "#64748b"} />
              <Text style={[styles.tabText, activeTab === "password" && styles.tabTextActive]}>
                Edit Password
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tab Content */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {activeTab === "personal" ? (
              <View>
                {/* Residential Address */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>RESIDENTIAL ADDRESS</Text>
                  <View style={styles.textAreaContainer}>
                    <MapPin size={18} color="#64748b" style={styles.inputIconTop} />
                    <TextInput
                      style={styles.textArea}
                      placeholder="Enter complete residential address"
                      placeholderTextColor="#94a3b8"
                      value={address}
                      onChangeText={setAddress}
                      multiline
                      numberOfLines={3}
                    />
                  </View>
                </View>

                {/* Date of Birth */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>DATE OF BIRTH</Text>
                  <TouchableOpacity
                    style={styles.inputContainer}
                    onPress={() => setShowDatePicker(true)}
                    activeOpacity={0.8}
                  >
                    <Calendar size={18} color="#64748b" style={styles.inputIcon} />
                    <Text style={dob ? styles.dateValueText : styles.datePlaceholderText}>
                      {dob
                        ? dob.toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "Select Date of Birth"}
                    </Text>
                  </TouchableOpacity>

                  {showDatePicker && (
                    <DateTimePicker
                      value={dob || new Date(2000, 0, 1)}
                      mode="date"
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      maximumDate={new Date()}
                      onChange={handleDateChange}
                    />
                  )}
                </View>

                {/* Blood Group */}
                <View style={styles.inputGroup}>
                  <View style={styles.labelWithIconRow}>
                    <Droplet size={14} color="#e11d48" />
                    <Text style={[styles.inputLabel, { marginLeft: 4, marginBottom: 0 }]}>
                      BLOOD GROUP
                    </Text>
                  </View>
                  <View style={styles.bloodGroupGrid}>
                    {BLOOD_GROUPS.map((bg) => {
                      const isSelected = bloodGroup === bg;
                      return (
                        <TouchableOpacity
                          key={bg}
                          onPress={() => setBloodGroup(isSelected ? "" : bg)}
                          style={[
                            styles.bloodGroupChip,
                            isSelected && styles.bloodGroupChipSelected,
                          ]}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.bloodGroupText,
                              isSelected && styles.bloodGroupTextSelected,
                            ]}
                          >
                            {bg}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Emergency Reference 1 */}
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionHeading}>EMERGENCY REFERENCE 1</Text>

                  <View style={styles.subInputGroup}>
                    <Text style={styles.subInputLabel}>Contact Person Name</Text>
                    <View style={styles.inputContainer}>
                      <UserCheck size={18} color="#64748b" style={styles.inputIcon} />
                      <TextInput
                        style={styles.textInput}
                        placeholder="e.g. John Doe (Relation)"
                        placeholderTextColor="#94a3b8"
                        value={referenceName1}
                        onChangeText={setReferenceName1}
                      />
                    </View>
                  </View>

                  <View style={styles.subInputGroup}>
                    <Text style={styles.subInputLabel}>10-Digit Mobile Number</Text>
                    <View style={styles.inputContainer}>
                      <Phone size={18} color="#64748b" style={styles.inputIcon} />
                      <TextInput
                        style={styles.textInput}
                        placeholder="e.g. 9876543210"
                        placeholderTextColor="#94a3b8"
                        value={referenceNumber1}
                        onChangeText={(val) => setReferenceNumber1(val.replace(/\D/g, "").slice(0, 10))}
                        keyboardType="phone-pad"
                        maxLength={10}
                      />
                    </View>
                  </View>
                </View>

                {/* Emergency Reference 2 */}
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionHeading}>EMERGENCY REFERENCE 2</Text>

                  <View style={styles.subInputGroup}>
                    <Text style={styles.subInputLabel}>Contact Person Name</Text>
                    <View style={styles.inputContainer}>
                      <UserCheck size={18} color="#64748b" style={styles.inputIcon} />
                      <TextInput
                        style={styles.textInput}
                        placeholder="e.g. Jane Doe (Relation)"
                        placeholderTextColor="#94a3b8"
                        value={referenceName2}
                        onChangeText={setReferenceName2}
                      />
                    </View>
                  </View>

                  <View style={styles.subInputGroup}>
                    <Text style={styles.subInputLabel}>10-Digit Mobile Number</Text>
                    <View style={styles.inputContainer}>
                      <Phone size={18} color="#64748b" style={styles.inputIcon} />
                      <TextInput
                        style={styles.textInput}
                        placeholder="e.g. 9876543211"
                        placeholderTextColor="#94a3b8"
                        value={referenceNumber2}
                        onChangeText={(val) => setReferenceNumber2(val.replace(/\D/g, "").slice(0, 10))}
                        keyboardType="phone-pad"
                        maxLength={10}
                      />
                    </View>
                  </View>
                </View>

                {/* Save Personal Info Button */}
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleSavePersonal}
                  disabled={savingPersonal}
                  activeOpacity={0.85}
                >
                  {savingPersonal ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <View style={styles.btnContentRow}>
                      <CheckCircle2 size={18} color="#ffffff" />
                      <Text style={styles.primaryButtonText}>Save Personal Details</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                {/* Security Info Card */}
                <View style={styles.securityNoticeCard}>
                  <View style={styles.securityNoticeIconWrapper}>
                    <ShieldAlert size={20} color="#1972e9" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.securityNoticeTitle}>Important Security Notice</Text>
                    <Text style={styles.securityNoticeText}>
                      This new password will be required for employee sign-in on your mobile application every time. Keep it safe and secure.
                    </Text>
                  </View>
                </View>

                {/* New Password */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>NEW PASSWORD</Text>
                  <View style={styles.inputContainer}>
                    <Lock size={18} color="#64748b" style={styles.inputIcon} />
                    <TextInput
                      style={styles.textInput}
                      placeholder="Enter new password (min 6 characters)"
                      placeholderTextColor="#94a3b8"
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry={!showNewPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      onPress={() => setShowNewPassword(!showNewPassword)}
                      style={styles.eyeBtn}
                      activeOpacity={0.7}
                    >
                      {showNewPassword ? (
                        <EyeOff size={18} color="#94a3b8" />
                      ) : (
                        <Eye size={18} color="#94a3b8" />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Confirm New Password */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>CONFIRM NEW PASSWORD</Text>
                  <View style={styles.inputContainer}>
                    <Lock size={18} color="#64748b" style={styles.inputIcon} />
                    <TextInput
                      style={styles.textInput}
                      placeholder="Re-enter new password"
                      placeholderTextColor="#94a3b8"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showConfirmPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                      style={styles.eyeBtn}
                      activeOpacity={0.7}
                    >
                      {showConfirmPassword ? (
                        <EyeOff size={18} color="#94a3b8" />
                      ) : (
                        <Eye size={18} color="#94a3b8" />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Match indicator */}
                {newPassword.length > 0 && confirmPassword.length > 0 && (
                  <View
                    style={[
                      styles.matchBadge,
                      newPassword === confirmPassword
                        ? styles.matchBadgeSuccess
                        : styles.matchBadgeError,
                    ]}
                  >
                    <Text
                      style={[
                        styles.matchBadgeText,
                        newPassword === confirmPassword
                          ? styles.matchTextSuccess
                          : styles.matchTextError,
                      ]}
                    >
                      {newPassword === confirmPassword
                        ? "✓ Passwords match"
                        : "✕ Passwords do not match"}
                    </Text>
                  </View>
                )}

                {/* Update Password Button */}
                <TouchableOpacity
                  style={[styles.primaryButton, { marginTop: 24 }]}
                  onPress={handleSavePassword}
                  disabled={savingPassword}
                  activeOpacity={0.85}
                >
                  {savingPassword ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <View style={styles.btnContentRow}>
                      <KeyRound size={18} color="#ffffff" />
                      <Text style={styles.primaryButtonText}>Update Login Password</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>

          {/* Floating Toast inside modal */}
          {toast.show && (
            <View
              style={[
                styles.toastContainer,
                toast.type === "success" ? styles.toastSuccess : styles.toastError,
              ]}
            >
              <Text style={styles.toastText}>{toast.message}</Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    maxHeight: "90%",
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 30 : 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  dragIndicator: {
    width: 44,
    height: 5,
    backgroundColor: "#cbd5e1",
    borderRadius: 3,
    alignSelf: "center",
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
    paddingHorizontal: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    marginTop: 2,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#f8fafc",
    borderRadius: 18,
    padding: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 18,
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 14,
    gap: 8,
  },
  tabButtonActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
  },
  tabTextActive: {
    color: "#1972e9",
    fontWeight: "800",
  },
  scrollContent: {
    paddingBottom: 24,
    paddingHorizontal: 4,
  },
  inputGroup: {
    marginBottom: 18,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748b",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  labelWithIconRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: {
    marginRight: 10,
  },
  inputIconTop: {
    marginTop: 14,
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
  },
  textAreaContainer: {
    flexDirection: "row",
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 14,
    paddingVertical: 4,
    minHeight: 88,
  },
  textArea: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
    textAlignVertical: "top",
    paddingTop: 10,
    minHeight: 70,
  },
  dateValueText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
  },
  datePlaceholderText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#94a3b8",
  },
  bloodGroupGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  bloodGroupChip: {
    width: "22%",
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  bloodGroupChipSelected: {
    backgroundColor: "#fee2e2",
    borderColor: "#f87171",
  },
  bloodGroupText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  bloodGroupTextSelected: {
    color: "#b91c1c",
    fontWeight: "800",
  },
  sectionCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 16,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: "800",
    color: "#1972e9",
    letterSpacing: 1,
    marginBottom: 12,
  },
  subInputGroup: {
    marginBottom: 12,
  },
  subInputLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
    marginBottom: 6,
  },
  eyeBtn: {
    padding: 6,
  },
  securityNoticeCard: {
    flexDirection: "row",
    backgroundColor: "#eff6ff",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    marginBottom: 20,
    alignItems: "flex-start",
  },
  securityNoticeIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
  },
  securityNoticeTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1e40af",
    marginBottom: 3,
  },
  securityNoticeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#3b82f6",
    lineHeight: 16,
  },
  matchBadge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignSelf: "flex-start",
    marginTop: -8,
    marginBottom: 12,
  },
  matchBadgeSuccess: {
    backgroundColor: "#ecfdf5",
  },
  matchBadgeError: {
    backgroundColor: "#fef2f2",
  },
  matchBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  matchTextSuccess: {
    color: "#059669",
  },
  matchTextError: {
    color: "#dc2626",
  },
  primaryButton: {
    backgroundColor: "#1972e9",
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1972e9",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
    marginTop: 8,
  },
  btnContentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.2,
  },
  toastContainer: {
    position: "absolute",
    bottom: 24,
    left: 20,
    right: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  toastSuccess: {
    backgroundColor: "#10b981",
  },
  toastError: {
    backgroundColor: "#ef4444",
  },
  toastText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
});

export default EditProfileModal;
