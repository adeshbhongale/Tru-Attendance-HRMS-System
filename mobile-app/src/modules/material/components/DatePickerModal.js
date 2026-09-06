import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Calendar, X, Check, Clock, ChevronLeft, ChevronRight } from 'lucide-react-native';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DatePickerModal = ({
  visible,
  onClose,
  onSelectDate,
  initialDate,
  minimumDate = true,
  title = 'Select Return Date'
}) => {
  const today = new Date();
  const minDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + (minimumDate ? 1 : 0));
  const minTs = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()).getTime();

  // Parsing initialDate if provided (format YYYY-MM-DD)
  const parseInitialDate = () => {
    if (initialDate && typeof initialDate === 'string') {
      const parts = initialDate.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
          return { y, m, d };
        }
      }
    }
    return {
      y: minimumDate ? minDate.getFullYear() : today.getFullYear(),
      m: minimumDate ? minDate.getMonth() : today.getMonth(),
      d: minimumDate ? minDate.getDate() : today.getDate(),
    };
  };

  const initial = parseInitialDate();
  const [viewYear, setViewYear] = useState(initial.y);
  const [viewMonth, setViewMonth] = useState(initial.m);
  const [selectedYear, setSelectedYear] = useState(initial.y);
  const [selectedMonth, setSelectedMonth] = useState(initial.m);
  const [selectedDay, setSelectedDay] = useState(initial.d);

  useEffect(() => {
    if (visible) {
      const init = parseInitialDate();
      setViewYear(init.y);
      setViewMonth(init.m);
      setSelectedYear(init.y);
      setSelectedMonth(init.m);
      setSelectedDay(init.d);
    }
  }, [visible, initialDate]);

  // Calendar calculations for current viewMonth/viewYear
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((prev) => prev - 1);
    } else {
      setViewMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((prev) => prev + 1);
    } else {
      setViewMonth((prev) => prev + 1);
    }
  };

  const handleSelectDay = (day) => {
    setSelectedYear(viewYear);
    setSelectedMonth(viewMonth);
    setSelectedDay(day);
  };

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

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.overlay}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Calendar size={20} color="#4f46e5" />
              <Text style={styles.title}>{title}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color="#64748b" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Quick Presets */}
            <View style={styles.presetSection}>
              <Text style={styles.sectionLabel}>QUICK DURATION SHORTCUTS</Text>
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
                    <Clock size={13} color="#4f46e5" />
                    <Text style={styles.presetChipText}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Calendar View Container */}
            <View style={styles.calendarCard}>
              {/* Month / Year Navigator */}
              <View style={styles.monthNavRow}>
                <TouchableOpacity onPress={handlePrevMonth} style={styles.navBtn}>
                  <ChevronLeft size={20} color="#334155" />
                </TouchableOpacity>

                <View style={styles.monthYearTitleBox}>
                  <Text style={styles.monthYearText}>
                    {MONTH_NAMES[viewMonth]} {viewYear}
                  </Text>
                </View>

                <TouchableOpacity onPress={handleNextMonth} style={styles.navBtn}>
                  <ChevronRight size={20} color="#334155" />
                </TouchableOpacity>
              </View>

              {/* Day of Week Labels */}
              <View style={styles.weekdaysRow}>
                {WEEKDAYS.map((w, idx) => (
                  <Text key={idx} style={[styles.weekdayText, (idx === 0 || idx === 6) && styles.weekendText]}>
                    {w}
                  </Text>
                ))}
              </View>

              {/* 7-Column Day Grid */}
              <View style={styles.calendarGrid}>
                {/* Empty cells before the first day of the month */}
                {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
                  <View key={`empty-${idx}`} style={styles.dayCellSpacer} />
                ))}

                {/* Day cells for the month */}
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                  const dayTs = new Date(viewYear, viewMonth, day).getTime();
                  const isDisabled = minimumDate && dayTs < minTs;
                  const isSelected =
                    selectedYear === viewYear &&
                    selectedMonth === viewMonth &&
                    selectedDay === day;
                  const isToday =
                    today.getFullYear() === viewYear &&
                    today.getMonth() === viewMonth &&
                    today.getDate() === day;

                  return (
                    <TouchableOpacity
                      key={`day-${day}`}
                      disabled={isDisabled}
                      onPress={() => handleSelectDay(day)}
                      style={[
                        styles.dayCell,
                        isSelected && styles.dayCellSelected,
                        isToday && !isSelected && styles.dayCellToday,
                        isDisabled && styles.dayCellDisabled,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          isSelected && styles.dayTextSelected,
                          isToday && !isSelected && styles.dayTextToday,
                          isDisabled && styles.dayTextDisabled,
                        ]}
                      >
                        {day}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
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
    maxHeight: '85%',
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    marginBottom: 10,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
  },
  presetSection: {
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#64748b',
    letterSpacing: 0.5,
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
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#eef2ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4338ca',
  },
  calendarCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    marginBottom: 14,
  },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthYearTitleBox: {
    alignItems: 'center',
  },
  monthYearText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  weekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    marginBottom: 8,
  },
  weekdayText: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  weekendText: {
    color: '#94a3b8',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCellSpacer: {
    width: '14.28%',
    height: 38,
  },
  dayCell: {
    width: '14.28%',
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    marginVertical: 2,
  },
  dayCellSelected: {
    backgroundColor: '#4f46e5',
  },
  dayCellToday: {
    borderWidth: 1.5,
    borderColor: '#4f46e5',
    backgroundColor: '#eef2ff',
  },
  dayCellDisabled: {
    opacity: 0.25,
  },
  dayText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
  },
  dayTextSelected: {
    color: '#ffffff',
    fontWeight: '800',
  },
  dayTextToday: {
    color: '#4f46e5',
    fontWeight: '800',
  },
  dayTextDisabled: {
    color: '#94a3b8',
  },
  confirmBtn: {
    backgroundColor: '#4f46e5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  confirmBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default DatePickerModal;
