import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Calendar, X, Check, Clock } from 'lucide-react-native';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DatePickerModal = ({ visible, onClose, onSelectDate, initialDate }) => {
  const today = new Date();
  const currentYear = today.getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState(today.getDate());

  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();

  const handleApplyPreset = (daysToAdd) => {
    const target = new Date();
    target.setDate(target.getDate() + daysToAdd);
    const yyyy = target.getFullYear();
    const mm = String(target.getMonth() + 1).padStart(2, '0');
    const dd = String(target.getDate()).padStart(2, '0');
    const formatted = `${yyyy}-${mm}-${dd}`;
    onSelectDate(formatted);
    onClose();
  };

  const handleConfirmCustom = () => {
    const mm = String(selectedMonth + 1).padStart(2, '0');
    const dd = String(selectedDay).padStart(2, '0');
    const formatted = `${selectedYear}-${mm}-${dd}`;
    onSelectDate(formatted);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.overlay}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Calendar size={20} color="#4f46e5" />
              <Text style={styles.title}>Select Return Date</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color="#64748b" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Quick Presets */}
            <Text style={styles.sectionLabel}>QUICK RETURN DURATION</Text>
            <View style={styles.presetRow}>
              {[
                { label: '+3 Days', days: 3 },
                { label: '+7 Days (1 Wk)', days: 7 },
                { label: '+14 Days (2 Wks)', days: 14 },
                { label: '+30 Days (1 Mo)', days: 30 },
              ].map((p) => (
                <TouchableOpacity
                  key={p.days}
                  style={styles.presetChip}
                  onPress={() => handleApplyPreset(p.days)}
                >
                  <Clock size={14} color="#4f46e5" />
                  <Text style={styles.presetChipText}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Custom Date Picker: Year */}
            <Text style={styles.sectionLabel}>YEAR</Text>
            <View style={styles.yearRow}>
              {[currentYear, currentYear + 1, currentYear + 2].map((y) => (
                <TouchableOpacity
                  key={y}
                  style={[styles.yearChip, selectedYear === y && styles.yearChipActive]}
                  onPress={() => setSelectedYear(y)}
                >
                  <Text style={[styles.yearChipText, selectedYear === y && styles.yearChipTextActive]}>
                    {y}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Custom Date Picker: Month */}
            <Text style={styles.sectionLabel}>MONTH</Text>
            <View style={styles.gridContainer}>
              {MONTHS.map((m, idx) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.monthChip, selectedMonth === idx && styles.monthChipActive]}
                  onPress={() => setSelectedMonth(idx)}
                >
                  <Text style={[styles.monthChipText, selectedMonth === idx && styles.monthChipTextActive]}>
                    {m}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Custom Date Picker: Day */}
            <Text style={styles.sectionLabel}>DAY ({MONTHS[selectedMonth]} {selectedYear})</Text>
            <View style={styles.gridContainer}>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.dayChip, selectedDay === d && styles.dayChipActive]}
                  onPress={() => setSelectedDay(d)}
                >
                  <Text style={[styles.dayChipText, selectedDay === d && styles.dayChipTextActive]}>
                    {d}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Confirm Button */}
          <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirmCustom}>
            <Check size={18} color="#ffffff" />
            <Text style={styles.confirmBtnText}>
              Set Date: {selectedYear}-{String(selectedMonth + 1).padStart(2, '0')}-{String(selectedDay).padStart(2, '0')}
            </Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  closeBtn: {
    padding: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#64748b',
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 8,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#4f46e5',
  },
  yearRow: {
    flexDirection: 'row',
    gap: 10,
  },
  yearChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  yearChipActive: {
    backgroundColor: '#4f46e5',
  },
  yearChipText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#475569',
  },
  yearChipTextActive: {
    color: '#ffffff',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  monthChip: {
    width: '23%',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  monthChipActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  monthChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  monthChipTextActive: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  dayChip: {
    width: '12.5%',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  dayChipActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  dayChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  dayChipTextActive: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#4f46e5',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 16,
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#ffffff',
  },
});

export default DatePickerModal;
