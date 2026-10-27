import React, { useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Linking,
  BackHandler,
  StyleSheet,
  StatusBar,
} from "react-native";
import { Download, AlertTriangle, ArrowUpCircle } from "lucide-react-native";

export default function ForceUpdateModal({
  visible,
  updateInfo,
  currentVersion,
  currentBuild,
}) {
  // Prevent Android hardware back button from closing modal; exits app instead
  useEffect(() => {
    if (!visible) return;
    const backAction = () => {
      BackHandler.exitApp();
      return true;
    };
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );
    return () => backHandler.remove();
  }, [visible]);

  if (!visible) return null;

  const handleDownload = async () => {
    const apkUrl = updateInfo?.androidApkUrl;
    if (!apkUrl) return;
    try {
      await Linking.openURL(apkUrl);
    } catch (e) {
      console.warn("Failed to open update URL:", e);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      statusBarTranslucent={true}
      onRequestClose={() => BackHandler.exitApp()}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header Icon */}
          <View style={styles.iconCircle}>
            <ArrowUpCircle size={44} color="#4f46e5" />
          </View>

          {/* Title */}
          <Text style={styles.title}>Update Required</Text>
          <Text style={styles.subtitle}>
            A newer version of the application is available. You must install the
            latest APK update to continue using the system.
          </Text>

          {/* Version Info Badge */}
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeLabel}>Installed</Text>
              <Text style={styles.badgeValue}>
                v{currentVersion || "1.0.0"} (Build {currentBuild || "1"})
              </Text>
            </View>
            <View style={[styles.badge, styles.badgeHighlight]}>
              <Text style={styles.badgeLabelHighlight}>Required</Text>
              <Text style={styles.badgeValueHighlight}>
                v{updateInfo?.minAndroidVersion || "1.0.1"} (Build{" "}
                {updateInfo?.minAndroidVersionCode || "2"})
              </Text>
            </View>
          </View>

          {/* Release Notes */}
          {Boolean(updateInfo?.updateMessage) && (
            <View style={styles.messageBox}>
              <Text style={styles.messageHeader}>What's New:</Text>
              <Text style={styles.messageText}>
                {updateInfo.updateMessage}
              </Text>
            </View>
          )}

          {/* Download & Install Button */}
          <TouchableOpacity
            style={styles.downloadButton}
            onPress={handleDownload}
            activeOpacity={0.85}
          >
            <Download size={20} color="#ffffff" style={{ marginRight: 8 }} />
            <Text style={styles.downloadButtonText}>
              Download & Install Update
            </Text>
          </TouchableOpacity>

          {/* Helper Notice */}
          <View style={styles.warningRow}>
            <AlertTriangle size={14} color="#94a3b8" />
            <Text style={styles.warningText}>
              After downloading, open the downloaded APK from your notifications or
              downloads folder to update.
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.95)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#ffffff",
    borderRadius: 28,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#eef2ff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 20,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
    marginBottom: 16,
  },
  badge: {
    flex: 1,
    backgroundColor: "#f1f5f9",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    alignItems: "center",
  },
  badgeHighlight: {
    backgroundColor: "#eef2ff",
    borderWidth: 1,
    borderColor: "#c7d2fe",
  },
  badgeLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
  },
  badgeValue: {
    fontSize: 12,
    fontWeight: "800",
    color: "#334155",
    marginTop: 2,
  },
  badgeLabelHighlight: {
    fontSize: 10,
    fontWeight: "700",
    color: "#4f46e5",
    textTransform: "uppercase",
  },
  badgeValueHighlight: {
    fontSize: 12,
    fontWeight: "800",
    color: "#4f46e5",
    marginTop: 2,
  },
  messageBox: {
    width: "100%",
    backgroundColor: "#f8fafc",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 20,
  },
  messageHeader: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 4,
  },
  messageText: {
    fontSize: 12,
    color: "#334155",
    lineHeight: 16,
  },
  downloadButton: {
    width: "100%",
    backgroundColor: "#4f46e5",
    paddingVertical: 15,
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#4f46e5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  downloadButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  warningRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
    paddingHorizontal: 8,
  },
  warningText: {
    fontSize: 11,
    color: "#94a3b8",
    textAlign: "center",
    flex: 1,
  },
});
