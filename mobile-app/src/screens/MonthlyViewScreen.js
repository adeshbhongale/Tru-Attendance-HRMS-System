import { ArrowLeft, ChevronLeft, ChevronRight, Home } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import api from '../api/axios';
import { navigateGlobal } from '../utils/navigation';


const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// ============================================================
// ALL HOOKS ARE AT THE TOP LEVEL — NO try-catch AROUND HOOKS
// This is required by the Rules of Hooks. Violating this
// destroys the navigation context on Android.
// ============================================================
const formatWorkingHours = (hours) => {
  if (hours === undefined || hours === null || isNaN(hours)) return '0hr 0m';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}hr`;
  return `${h}hr ${m}m`;
};

const MonthlyViewScreen = () => {

  // --- ALL HOOKS MUST BE UNCONDITIONAL AND AT TOP LEVEL ---
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [user, setUser] = useState(null);
  const [renderError, setRenderError] = useState(null);

  useEffect(() => {
    fetchUserData();
    fetchMonthlyData();
  }, [currentDate]);
  // ---------------------------------------------------------

  const fetchUserData = async () => {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data.data);
    } catch (err) {
      // silently ignore
    }
  };

  const fetchMonthlyData = async () => {
    try {
      setLoading(true);
      const month = currentDate.getMonth() + 1;
      const year = currentDate.getFullYear();
      const res = await api.get(`/attendance/monthly-view?month=${month}&year=${year}`);
      setData(res.data.data);
    } catch (err) {
      // silently ignore
    } finally {
      setLoading(false);
    }
  };

  const changeMonth = (offset) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + offset);
    setCurrentDate(newDate);
  };

  const renderCalendar = () => {
    if (!data) return null;

    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
    const daysInMonth = data.daysInMonth;
    const dailyStatus = data.dailyStatus;

    const calendarRows = [];
    let cells = [];

    for (let i = 0; i < firstDayOfMonth; i++) {
      cells.push(<View key={`empty-${i}`} style={{ flex: 1, height: 64 }} />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const status = dailyStatus[day];
      const isToday = status?.isToday;
      const isFuture = status?.isFuture;
      const isBeforeJoining = status?.isBeforeJoining;

      // Dots color mapping based on status
      let dotBg = 'transparent';
      if (!isFuture && !isBeforeJoining && !status?.isSunday) {
        const s = status?.status;
        // Half Day and Late are now Green as requested
        if (s === 'Present' || s === 'Late' || s === 'Half Day' || s === 'Half-Day' || s === 'Present-Late') {
          dotBg = '#10b981'; // Green
        } else if (s === 'On Leave' || s === 'OnLeave') {
          dotBg = '#facc15'; // Yellow
        } else if (s === 'Absent') {
          dotBg = '#f43f5e'; // Red
        } else {
          dotBg = status?.color || 'transparent';
        }
      }

      cells.push(
        <View
          key={day}
          style={{
            flex: 1,
            height: 64,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isToday ? 'rgba(99,102,241,0.06)' : 'transparent',
            borderRadius: isToday ? 16 : 0,
            borderWidth: isToday ? 1 : 0,
            borderColor: isToday ? '#e0e7ff' : 'transparent',
          }}
        >
          <Text style={{ color: isToday ? '#38bdf8' : '#334155', fontWeight: 'bold', fontSize: 15 }}>{day}</Text>
          <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 3, backgroundColor: dotBg }} />
        </View>
      );

      if (cells.length === 7) {
        calendarRows.push(<View key={`row-${day}`} style={{ flexDirection: 'row' }}>{cells}</View>);
        cells = [];
      }
    }

    if (cells.length > 0) {
      while (cells.length < 7) {
        cells.push(<View key={`empty-last-${cells.length}`} style={{ flex: 1, height: 64 }} />);
      }
      calendarRows.push(<View key="row-last" style={{ flexDirection: 'row' }}>{cells}</View>);
    }

    return (
      <View style={{ backgroundColor: 'white', borderRadius: 24, padding: 16, borderWidth: 1, borderColor: '#f1f5f9' }}>
        <View style={{ flexDirection: 'row', marginBottom: 16 }}>
          {daysOfWeek.map(d => (
            <Text key={d} style={{ flex: 1, textAlign: 'center', color: '#94a3b8', fontWeight: 'bold', fontSize: 11 }}>{d}</Text>
          ))}
        </View>
        {calendarRows}
      </View>
    );
  };

  // If something in the render logic fails, show fallback
  if (renderError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, backgroundColor: 'white' }}>
        <Text style={{ color: '#ef4444', fontWeight: 'bold', fontSize: 18, marginBottom: 12 }}>Screen Error</Text>
        <Text style={{ color: '#64748b', textAlign: 'center', marginBottom: 24 }}>{String(renderError)}</Text>
        <TouchableOpacity
          onPress={() => navigateGlobal('Main')}
          style={{ backgroundColor: '#4f46e5', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
        >
          <Text style={{ color: 'white', fontWeight: 'bold' }}>Return to Dashboard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const monthName = MONTHS[currentDate.getMonth()];
  const year = currentDate.getFullYear();

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={{
        backgroundColor: '#4f46e5',
        paddingTop: 50,
        paddingBottom: 18,
        paddingHorizontal: 24,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => navigateGlobal('Main', { screen: 'Profile' })}
            style={{ marginRight: 16 }}
          >
            <ArrowLeft size={24} color="white" />
          </TouchableOpacity>
          <Text style={{ color: 'white', fontSize: 20, fontWeight: 'bold', marginRight: 120 }}>Monthly View</Text>
          <TouchableOpacity
            onPress={() => navigateGlobal('Main')}
            style={{ marginRight: 16 }}
          >
            <Home size={24} color="white" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
        {/* Employee Details */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{ color: '#0f172a', fontWeight: 'bold', fontSize: 16, marginBottom: 8 }}>Employee Details</Text>
          <View style={{ flexDirection: 'row', marginBottom: 4 }}>
            <Text style={{ width: 110, color: '#94a3b8', fontWeight: 'bold', fontSize: 13 }}>Name</Text>
            <Text style={{ color: '#1e293b', fontWeight: 'bold', fontSize: 13 }}>: {user?.name || '...'}</Text>
          </View>
          <View style={{ flexDirection: 'row', marginBottom: 4 }}>
            <Text style={{ width: 110, color: '#94a3b8', fontWeight: 'bold', fontSize: 13 }}>Designation</Text>
            <Text style={{ color: '#1e293b', fontWeight: 'bold', fontSize: 13 }}>: {user?.role === 'admin' ? 'Administrator' : 'Employee'}</Text>
          </View>
          <View style={{ flexDirection: 'row', marginBottom: 4 }}>
            <Text style={{ width: 110, color: '#94a3b8', fontWeight: 'bold', fontSize: 13 }}>Department</Text>
            <Text style={{ color: '#1e293b', fontWeight: 'bold', fontSize: 13 }}>: {user?.department || 'General'}</Text>
          </View>
        </View>

        {/* Summary Stats */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 32 }}>
          <View style={{ flex: 1, backgroundColor: 'white', padding: 16, borderRadius: 18, borderWidth: 1, borderColor: '#f1f5f9', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#10b981', marginRight: 6 }} />
              <Text style={{ color: '#1e293b', fontWeight: 'bold', fontSize: 11 }}>Present</Text>
            </View>
            <Text style={{ color: '#059669', fontSize: 24, fontWeight: 'bold' }}>
              {(data?.summary?.present || 0) + (data?.summary?.late || 0) + (data?.summary?.halfDay || 0)}
            </Text>
          </View>
          <View style={{ flex: 1, backgroundColor: 'white', padding: 16, borderRadius: 18, borderWidth: 1, borderColor: '#f1f5f9', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#f43f5e', marginRight: 6 }} />
              <Text style={{ color: '#1e293b', fontWeight: 'bold', fontSize: 11 }}>Absent</Text>
            </View>
            <Text style={{ color: '#e11d48', fontSize: 24, fontWeight: 'bold' }}>{data?.summary?.absent || 0}</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: 'white', padding: 16, borderRadius: 18, borderWidth: 1, borderColor: '#f1f5f9', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#facc15', marginRight: 6 }} />
              <Text style={{ color: '#1e293b', fontWeight: 'bold', fontSize: 11 }}>Leave</Text>
            </View>
            <Text style={{ color: '#ca8a04', fontSize: 24, fontWeight: 'bold' }}>{data?.summary?.onLeave || 0}</Text>
          </View>
        </View>

        {/* Productivity Summary */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 32 }}>
          <View style={{ flex: 1, backgroundColor: 'white', padding: 16, borderRadius: 18, borderWidth: 1, borderColor: '#f1f5f9' }}>
            <Text style={{ color: '#94a3b8', fontWeight: 'bold', fontSize: 10, trackingWidest: 1, marginBottom: 4 }}>TOTAL WORKED</Text>
            <Text style={{ color: '#10b981', fontSize: 20, fontWeight: 'bold' }}>{formatWorkingHours(data?.summary?.totalWorkedHours || 0)}</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: 'white', padding: 16, borderRadius: 18, borderWidth: 1, borderColor: '#f1f5f9' }}>
            <Text style={{ color: '#94a3b8', fontWeight: 'bold', fontSize: 10, trackingWidest: 1, marginBottom: 4 }}>TOTAL BREAK</Text>
            <Text style={{ color: '#f59e0b', fontSize: 20, fontWeight: 'bold' }}>
              {Math.floor((data?.summary?.totalBreakMinutes || 0) / 60)}h {(data?.summary?.totalBreakMinutes || 0) % 60}m
            </Text>
          </View>
        </View>

        {/* Month Selector */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <Text style={{ color: '#0f172a', fontWeight: 'bold', fontSize: 13 }}>
            01 {monthName.slice(0, 3)} {year} – {data?.daysInMonth || '–'} {monthName.slice(0, 3)} {year}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={() => changeMonth(-1)} style={{ padding: 4 }}>
              <ChevronLeft size={20} color="#4f46e5" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => changeMonth(1)} style={{ padding: 4 }}>
              <ChevronRight size={20} color="#4f46e5" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Calendar */}
        <View style={{ marginBottom: 16 }}>
          <Text style={{ textAlign: 'center', color: '#1e293b', fontWeight: 'bold', fontSize: 17, marginBottom: 16 }}>
            {monthName} {year}
          </Text>
          {loading ? (
            <View style={{ height: 256, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator color="#4f46e5" size="large" />
            </View>
          ) : (
            renderCalendar()
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default MonthlyViewScreen;
