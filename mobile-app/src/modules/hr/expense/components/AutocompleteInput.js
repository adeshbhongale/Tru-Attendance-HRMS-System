import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { C, FieldError, ui } from "./ExpenseUI";

/**
 * Text input with suggestions from an existing master (customers, cities).
 * Free text is always allowed; picking a suggestion also returns its id.
 * search(query) -> Promise<[{ key, title, subtitle? }]>
 */
const AutocompleteInput = ({ value, onChange, onPick, search, placeholder, icon: Icon, error, testID, maxLength = 150, minChars = 1 }) => {
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState([]);
  const timer = useRef(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!focused || !search) return undefined;
    const q = String(value || "").trim();
    if (q.length < minChars) { setOptions([]); return undefined; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const id = ++seq.current;
      setLoading(true);
      try {
        const res = await search(q);
        if (id === seq.current) setOptions((res || []).slice(0, 6));
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [value, focused, search, minChars]);

  const showList = focused && (loading || options.length > 0);

  return (
    <View>
      <View style={[ui.input, styles.row, error && ui.inputError, focused && { borderColor: C.primary }]}>
        {Icon ? <Icon size={18} color={C.primary} /> : null}
        <TextInput
          value={value}
          onChangeText={(t) => onChange(t)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={placeholder}
          placeholderTextColor={C.faint}
          style={styles.input}
          maxLength={maxLength}
          autoCorrect={false}
          testID={testID}
          returnKeyType="done"
        />
        {loading ? <ActivityIndicator size="small" color={C.primary} /> : null}
      </View>
      {showList ? (
        <View style={styles.list}>
          {options.map((o) => (
            <TouchableOpacity
              key={String(o.key)}
              style={styles.option}
              onPress={() => { onPick ? onPick(o) : onChange(o.title); setOptions([]); setFocused(false); }}
              testID={testID ? `${testID}-option-${o.key}` : undefined}
            >
              <Text style={styles.optTitle}>{o.title}</Text>
              {o.subtitle ? <Text style={styles.optSub}>{o.subtitle}</Text> : null}
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      <FieldError message={error} />
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  input: { flex: 1, fontSize: 16, color: C.text, marginLeft: 10, paddingVertical: 12 },
  list: { marginTop: 6, borderWidth: 1, borderColor: C.border, borderRadius: 12, backgroundColor: "#fff", overflow: "hidden" },
  option: { paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: "#f1f5f9", minHeight: 48 },
  optTitle: { fontSize: 15, color: C.text, fontWeight: "600" },
  optSub: { fontSize: 12, color: C.muted, marginTop: 2 },
});

export default AutocompleteInput;
