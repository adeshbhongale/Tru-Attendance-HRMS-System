import DateTimePicker from "@react-native-community/datetimepicker";
import { Calendar, ChevronDown } from "lucide-react-native";
import { useState } from "react";
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { C, FieldError, formatDate, fromISODate, toISODate, ui } from "./ExpenseUI";

/**
 * Native date picker field. value / onChange use "YYYY-MM-DD".
 * Android: system dialog. iOS: inline calendar in a bottom sheet.
 */
const DateField = ({ value, onChange, placeholder = "Select date", minimumDate, maximumDate, error, testID, disabled }) => {
  const [open, setOpen] = useState(false);
  const [iosTemp, setIosTemp] = useState(null);
  const current = fromISODate(value) || maximumDate || new Date();

  const handleAndroid = (event, date) => {
    setOpen(false);
    if (event.type === "set" && date) onChange(toISODate(date));
  };

  return (
    <View>
      <TouchableOpacity
        testID={testID}
        disabled={disabled}
        activeOpacity={0.8}
        onPress={() => { setIosTemp(current); setOpen(true); }}
        style={[ui.input, styles.field, error && ui.inputError, disabled && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel={value ? `Selected date ${formatDate(value)}` : placeholder}
      >
        <Calendar size={18} color={C.primary} />
        <Text style={[styles.text, !value && { color: C.faint }]}>{value ? formatDate(value) : placeholder}</Text>
        <ChevronDown size={18} color={C.muted} />
      </TouchableOpacity>
      <FieldError message={error} />

      {open && Platform.OS === "android" ? (
        <DateTimePicker
          value={current}
          mode="date"
          display="calendar"
          onValueChange={handleAndroid}
          onDismiss={() => setOpen(false)}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
        />
      ) : null}

      {Platform.OS !== "android" ? (
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <DateTimePicker
              value={iosTemp || current}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              onValueChange={(e, d) => d && setIosTemp(d)}
              onDismiss={() => setOpen(false)}
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              themeVariant="light"
            />
            <View style={styles.sheetActions}>
              <TouchableOpacity style={[styles.sheetBtn, styles.sheetCancel]} onPress={() => setOpen(false)}>
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetBtn, styles.sheetOk]}
                onPress={() => { onChange(toISODate(iosTemp || current)); setOpen(false); }}
                testID={testID ? `${testID}-confirm` : undefined}
              >
                <Text style={styles.sheetOkText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  field: { flexDirection: "row", alignItems: "center" },
  text: { flex: 1, marginLeft: 10, fontSize: 16, color: C.text, fontWeight: "600" },
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32 },
  sheetActions: { flexDirection: "row", marginTop: 8 },
  sheetBtn: { flex: 1, height: 50, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  sheetCancel: { backgroundColor: "#f1f5f9", marginRight: 8 },
  sheetOk: { backgroundColor: C.primary, marginLeft: 8 },
  sheetCancelText: { color: C.text, fontWeight: "700", fontSize: 15 },
  sheetOkText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});

export default DateField;
