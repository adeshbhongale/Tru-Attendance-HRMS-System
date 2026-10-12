import * as ImagePicker from "expo-image-picker";
import { Camera, CircleAlert, CircleCheck, CloudUpload, FileText, Image as ImageIcon, RefreshCw, X } from "lucide-react-native";
import { useState } from "react";
import { Alert, Image, Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import expenseApi from "../api/expenseApi";
import { C, FieldError } from "./ExpenseUI";

/**
 * Multiple bill / receipt / approval-proof uploader.
 * files item: { localId, uri, name, type, size, status: 'uploading'|'done'|'error', progress, url, publicId, error }
 * Files upload immediately after picking; the form only submits once all are 'done'.
 */

const EXT_MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif", pdf: "application/pdf" };
const guessMime = (name, fallback) => {
  const ext = String(name || "").split(".").pop().toLowerCase();
  return EXT_MIME[ext] || fallback || "application/octet-stream";
};
const prettySize = (b) => (!b ? "" : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
let seq = 0;

export const uploadsBusy = (files) => files.some((f) => f.status === "uploading");
export const uploadsFailed = (files) => files.some((f) => f.status === "error");
/** Attachment metadata sent to the API (only successfully uploaded files). */
export const toAttachments = (files) =>
  files.filter((f) => f.status === "done" && f.url).map(({ name, url, publicId, type, size }) => ({ name, url, publicId, type, size }));
/** Stored attachments -> uploader items (edit draft / returned claim). */
export const fromAttachments = (list = []) =>
  list.map((a) => ({ localId: `srv_${a._id || ++seq}`, uri: a.url, url: a.url, publicId: a.publicId, name: a.name, type: a.type, size: a.size, status: "done", progress: 100 }));

const ReceiptUploader = ({
  files,
  setFiles,
  maxFiles = 10,
  maxSizeMb = 10,
  allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"],
  purpose = "receipt",
  title = "Add Photos or PDF",
  subtitle = "Tap to upload or take photo",
  error,
  testID,
}) => {
  const [sheet, setSheet] = useState(false);
  const remaining = Math.max(0, maxFiles - files.length);

  const patch = (localId, changes) => setFiles((prev) => prev.map((f) => (f.localId === localId ? { ...f, ...changes } : f)));

  const startUpload = async (item) => {
    patch(item.localId, { status: "uploading", progress: 0, error: "" });
    const res = await expenseApi.uploadFile({ uri: item.uri, name: item.name, type: item.type }, (p) => patch(item.localId, { progress: p }), purpose);
    if (res.success && res.data?.url) {
      patch(item.localId, { status: "done", progress: 100, url: res.data.url, publicId: res.data.publicId, type: res.data.type || item.type, name: res.data.name || item.name, size: res.data.size || item.size });
    } else {
      patch(item.localId, { status: "error", error: res.network ? "Upload failed – check your connection" : res.message || "Upload failed" });
    }
  };

  const addAssets = (assets) => {
    const rejected = [];
    const accepted = [];
    for (const a of assets) {
      const name = a.fileName || a.name || `${purpose === "receipt" ? "Bill" : "Approval"}_${Date.now()}.${a.mimeType === "application/pdf" ? "pdf" : "jpg"}`;
      const type = a.mimeType && a.mimeType !== "image/*" ? a.mimeType : guessMime(name, "image/jpeg");
      const size = a.fileSize || a.size || 0;
      if (!allowedTypes.includes(type)) { rejected.push(`${name}: unsupported file type`); continue; }
      if (size && size > maxSizeMb * 1048576) { rejected.push(`${name}: larger than ${maxSizeMb} MB`); continue; }
      if (files.length + accepted.length >= maxFiles) { rejected.push(`${name}: maximum ${maxFiles} files`); continue; }
      accepted.push({ localId: `loc_${Date.now()}_${++seq}`, uri: a.uri, name, type, size, status: "uploading", progress: 0 });
    }
    if (accepted.length) {
      setFiles((prev) => [...prev, ...accepted]);
      accepted.forEach(startUpload);
    }
    if (rejected.length) Alert.alert("Some files were not added", rejected.join("\n"));
  };

  const pick = async (source) => {
    setSheet(false);
    if (remaining <= 0) { Alert.alert("Limit reached", `You can attach a maximum of ${maxFiles} files.`); return; }
    try {
      if (source === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Camera permission needed", "Allow camera access to photograph bills.", [{ text: "Cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }]);
          return;
        }
        const r = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.6 });
        if (!r.canceled) addAssets(r.assets || []);
      } else if (source === "gallery") {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Photos permission needed", "Allow photo access to attach bills.", [{ text: "Cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }]);
          return;
        }
        const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6, allowsMultipleSelection: true, selectionLimit: remaining, base64: true });
        if (!r.canceled) addAssets(r.assets || []);
      }
    } catch (e) {
      Alert.alert("Could not open", e?.message || "Please try again.");
    }
  };

  const remove = (f) => {
    const doRemove = () => setFiles((prev) => prev.filter((x) => x.localId !== f.localId));
    if (f.status === "uploading") Alert.alert("Remove file?", "This upload is still in progress.", [{ text: "Keep" }, { text: "Remove", style: "destructive", onPress: doRemove }]);
    else doRemove();
  };

  return (
    <View testID={testID}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setSheet(true)}
        style={[styles.drop, error && { borderColor: C.danger, backgroundColor: "#fffafa" }, remaining === 0 && { opacity: 0.5 }]}
        accessibilityRole="button"
        accessibilityLabel={title}
        testID={testID ? `${testID}-add` : undefined}
      >
        <View style={styles.dropIcon}><CloudUpload size={24} color={C.primary} /></View>
        <Text style={styles.dropTitle}>{title}</Text>
        <Text style={styles.dropSub}>{subtitle}</Text>
        <Text style={styles.dropMeta}>JPG, PNG, HEIC or PDF · max {maxSizeMb} MB · {files.length}/{maxFiles} files</Text>
      </TouchableOpacity>

      {files.length ? (
        <View style={styles.grid}>
          {files.map((f) => {
            const isPdf = f.type === "application/pdf";
            return (
              <View key={f.localId} style={[styles.tile, f.status === "error" && { borderColor: "#fecaca" }]}>
                <View style={styles.thumb}>
                  {isPdf ? <FileText size={28} color={C.danger} /> : <Image source={{ uri: f.uri || f.url }} style={styles.thumbImg} />}
                  {f.status === "uploading" ? (
                    <View style={styles.overlay}><Text style={styles.overlayText}>{f.progress || 0}%</Text></View>
                  ) : null}
                </View>
                <TouchableOpacity style={styles.remove} onPress={() => remove(f)} accessibilityLabel={`Remove ${f.name}`} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <X size={12} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.name} numberOfLines={1}>{f.name}</Text>
                <Text style={styles.type}>{isPdf ? "PDF" : "Image"}{f.size ? ` · ${prettySize(f.size)}` : ""}</Text>
                {f.status === "uploading" ? (
                  <View style={styles.bar}><View style={[styles.barFill, { width: `${f.progress || 3}%` }]} /></View>
                ) : f.status === "done" ? (
                  <View style={styles.statusRow}><CircleCheck size={12} color={C.success} /><Text style={[styles.statusText, { color: C.success }]}>Uploaded</Text></View>
                ) : (
                  <TouchableOpacity style={styles.statusRow} onPress={() => startUpload(f)} accessibilityLabel={`Retry ${f.name}`}>
                    <CircleAlert size={12} color={C.danger} />
                    <Text style={[styles.statusText, { color: C.danger }]} numberOfLines={1}>Failed · </Text>
                    <RefreshCw size={11} color={C.primary} />
                    <Text style={[styles.statusText, { color: C.primary }]}>Retry</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      ) : null}
      <FieldError message={error} />

      <Modal visible={sheet} transparent animationType="slide" onRequestClose={() => setSheet(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setSheet(false)} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>{title}</Text>
          {[
            { key: "camera", label: "Take Photo", sub: "Use the camera to capture a bill", icon: Camera },
            { key: "gallery", label: "Choose From Gallery", sub: "Select one or more images", icon: ImageIcon },
          ].map((o) => {
            const Icon = o.icon;
            return (
              <TouchableOpacity key={o.key} style={styles.option} onPress={() => pick(o.key)} testID={testID ? `${testID}-${o.key}` : undefined}>
                <View style={styles.optionIcon}><Icon size={20} color={C.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionLabel}>{o.label}</Text>
                  <Text style={styles.optionSub}>{o.sub}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={styles.cancel} onPress={() => setSheet(false)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  drop: { borderWidth: 1.5, borderStyle: "dashed", borderColor: "#93c5fd", backgroundColor: "#f8fbff", borderRadius: 14, alignItems: "center", paddingVertical: 18, paddingHorizontal: 12 },
  dropIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  dropTitle: { fontSize: 15, fontWeight: "800", color: C.primary },
  dropSub: { fontSize: 13, color: C.muted, marginTop: 2 },
  dropMeta: { fontSize: 11, color: C.faint, marginTop: 6, textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: 12, marginHorizontal: -4 },
  tile: { width: "31%", marginHorizontal: "1.1%", marginBottom: 10, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 6, backgroundColor: "#fff" },
  thumb: { height: 74, borderRadius: 8, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  thumbImg: { width: "100%", height: "100%" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.45)", alignItems: "center", justifyContent: "center" },
  overlayText: { color: "#fff", fontWeight: "800" },
  remove: { position: "absolute", top: 2, right: 2, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(15,23,42,0.75)", alignItems: "center", justifyContent: "center" },
  name: { fontSize: 11, fontWeight: "700", color: C.text, marginTop: 6 },
  type: { fontSize: 10, color: C.muted, marginTop: 1 },
  bar: { height: 4, borderRadius: 2, backgroundColor: "#e2e8f0", marginTop: 5, overflow: "hidden" },
  barFill: { height: 4, backgroundColor: C.primary },
  statusRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  statusText: { fontSize: 10, fontWeight: "700", marginLeft: 3 },
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 30 },
  handle: { width: 42, height: 5, borderRadius: 3, backgroundColor: "#cbd5e1", alignSelf: "center", marginBottom: 12 },
  sheetTitle: { fontSize: 17, fontWeight: "800", color: C.text, marginBottom: 10 },
  option: { flexDirection: "row", alignItems: "center", paddingVertical: 12, minHeight: 60, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  optionIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center", marginRight: 12 },
  optionLabel: { fontSize: 15, fontWeight: "700", color: C.text },
  optionSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  cancel: { height: 50, borderRadius: 12, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center", marginTop: 14 },
  cancelText: { fontSize: 15, fontWeight: "700", color: C.text },
});

export default ReceiptUploader;
