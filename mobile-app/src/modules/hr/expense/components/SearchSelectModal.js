import { Check, Search, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { C } from "./ExpenseUI";

/**
 * Bottom-sheet searchable picker (single or multi select with a maximum).
 * items: [{ key, title, subtitle?, meta?, locked? }]
 */
const SearchSelectModal = ({
  visible,
  title,
  items = [],
  selectedKeys = [],
  onClose,
  onConfirm,
  multi = false,
  max = 1,
  loading = false,
  searchPlaceholder = "Search…",
  emptyText = "No results",
  testID,
}) => {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(selectedKeys);

  useEffect(() => {
    if (visible) { setPicked(selectedKeys); setQuery(""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => `${i.title} ${i.subtitle || ""} ${i.meta || ""}`.toLowerCase().includes(q));
  }, [items, query]);

  const toggle = (item) => {
    if (item.locked) return;
    if (!multi) { onConfirm([item.key]); return; }
    setPicked((prev) => {
      if (prev.includes(item.key)) return prev.filter((k) => k !== item.key);
      if (prev.length >= max) return prev; // cannot exceed No. of Employees
      return [...prev, item.key];
    });
  };

  const full = multi && picked.length >= max;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.wrap}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet} testID={testID}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              {multi ? (
                <Text style={[styles.counter, full && { color: C.success }]}>
                  {picked.length} of {max} selected{full ? " · limit reached" : ""}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.close} accessibilityLabel="Close" accessibilityRole="button">
              <X size={20} color={C.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchBox}>
            <Search size={18} color={C.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={searchPlaceholder}
              placeholderTextColor={C.faint}
              style={styles.searchInput}
              autoCorrect={false}
              testID={testID ? `${testID}-search` : undefined}
            />
          </View>

          {loading ? (
            <ActivityIndicator color={C.primary} style={{ marginVertical: 30 }} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(i) => String(i.key)}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 420 }}
              ListEmptyComponent={<Text style={styles.empty}>{emptyText}</Text>}
              renderItem={({ item }) => {
                const on = picked.includes(item.key);
                const disabled = item.locked || (!on && full);
                return (
                  <TouchableOpacity
                    onPress={() => toggle(item)}
                    activeOpacity={0.7}
                    disabled={disabled && !item.locked}
                    style={[styles.row, on && styles.rowOn, disabled && !on && { opacity: 0.45 }]}
                    accessibilityRole={multi ? "checkbox" : "button"}
                    accessibilityState={{ checked: on, disabled }}
                    testID={testID ? `${testID}-item-${item.key}` : undefined}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{item.title}{item.locked ? "  (you)" : ""}</Text>
                      {item.subtitle ? <Text style={styles.rowSub}>{item.subtitle}</Text> : null}
                      {item.meta ? <Text style={styles.rowMeta}>{item.meta}</Text> : null}
                    </View>
                    <View style={[styles.check, on && styles.checkOn]}>{on ? <Check size={14} color="#fff" /> : null}</View>
                  </TouchableOpacity>
                );
              }}
            />
          )}

          {multi ? (
            <TouchableOpacity style={styles.confirm} onPress={() => onConfirm(picked)} testID={testID ? `${testID}-confirm` : undefined}>
              <Text style={styles.confirmText}>Done ({picked.length}/{max})</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.45)" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingBottom: 28, maxHeight: "88%" },
  handle: { width: 42, height: 5, borderRadius: 3, backgroundColor: "#cbd5e1", alignSelf: "center", marginTop: 10, marginBottom: 8 },
  head: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  title: { fontSize: 17, fontWeight: "800", color: C.text },
  counter: { fontSize: 12, color: C.muted, marginTop: 2, fontWeight: "600" },
  close: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center" },
  searchBox: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, height: 48, marginBottom: 10, backgroundColor: "#f8fafc" },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 15, color: C.text },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, marginBottom: 6, borderWidth: 1, borderColor: "#f1f5f9", minHeight: 56 },
  rowOn: { borderColor: "#93c5fd", backgroundColor: C.primarySoft },
  rowTitle: { fontSize: 15, fontWeight: "700", color: C.text },
  rowSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  rowMeta: { fontSize: 12, color: C.faint, marginTop: 1 },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: "#cbd5e1", alignItems: "center", justifyContent: "center", marginLeft: 10 },
  checkOn: { backgroundColor: C.primary, borderColor: C.primary },
  empty: { textAlign: "center", color: C.muted, marginVertical: 30 },
  confirm: { height: 52, borderRadius: 14, backgroundColor: C.primary, alignItems: "center", justifyContent: "center", marginTop: 8 },
  confirmText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});

export default SearchSelectModal;
