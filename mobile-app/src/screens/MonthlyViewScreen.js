import { ArrowLeft, Camera, CheckCircle, ChevronLeft, ChevronRight, Clock, Eye, Home, MapPin, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import api from '../api/axios';
// import { useSidebar } from '../context/SidebarContext'; // SIDEBAR COMMENTED OUT
import HRModuleFooter from '../components/HRModuleFooter';
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

const formatTime = (timeStr) => {
  if (!timeStr) return '--:--';
  const d = new Date(timeStr);
  if (isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const MonthlyViewScreen = ({ navigation }) => {
  // const { openSidebar } = useSidebar(); // SIDEBAR COMMENTED OUT

  // --- ALL HOOKS MUST BE UNCONDITIONAL AND AT TOP LEVEL ---
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [user, setUser] = useState(null);
  const [renderError, setRenderError] = useState(null);
  const [selectedDayData, setSelectedDayData] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);

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
      if (!isFuture && !isBeforeJoining && !status?.isWeekOff) {
        const s = status?.status;
        // Half Day and Late are now Green as requested
        if (s === 'Present' || s === 'Late' || s === 'Half Day' || s === 'Half-Day' || s === 'Present-Late') {
          dotBg = '#10b981'; // Green
        } else if (s === 'On Leave' || s === 'OnLeave' || s === 'Half Day Leave' || s === 'Leave(Half)') {
          dotBg = '#facc15'; // Yellow
        } else if (s === 'Absent') {
          dotBg = '#f43f5e'; // Red
        } else {
          dotBg = status?.color || 'transparent';
        }
      }

      cells.push(
        <TouchableOpacity
          key={day}
          onPress={() => {
            setSelectedDayData({
              day,
              month: MONTHS[currentDate.getMonth()],
              year: currentDate.getFullYear(),
              ...status
            });
            setModalVisible(true);
          }}
          activeOpacity={0.7}
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
        </TouchableOpacity>
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

  const pIn = selectedDayData?.punchInDetails || (typeof selectedDayData?.punchIn === 'object' ? selectedDayData.punchIn : (selectedDayData?.punchIn ? { time: selectedDayData.punchIn } : null));
  const pOut = selectedDayData?.punchOutDetails || (typeof selectedDayData?.punchOut === 'object' ? selectedDayData.punchOut : (selectedDayData?.punchOut ? { time: selectedDayData.punchOut } : null));

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
      }}>
        {/* SIDEBAR BUTTON COMMENTED OUT
        <TouchableOpacity
          onPress={openSidebar}
          style={{ marginRight: 16 }}
        >
          <Menu size={24} color="white" />
        </TouchableOpacity>
        */}
        <Text style={{ color: 'white', fontSize: 20, fontWeight: 'bold' }}>Monthly View</Text>
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
            <Text style={{ color: '#1e293b', fontWeight: 'bold', fontSize: 13 }}>: {(typeof user?.designation === 'object' ? user?.designation?.name : user?.designation) || 'NA'}</Text>
          </View>
          <View style={{ flexDirection: 'row', marginBottom: 4 }}>
            <Text style={{ width: 110, color: '#94a3b8', fontWeight: 'bold', fontSize: 13 }}>Department</Text>
            <Text style={{ color: '#1e293b', fontWeight: 'bold', fontSize: 13 }}>: {(typeof user?.department === 'object' ? user?.department?.name : user?.department) || 'NA'}</Text>
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

      {/* Date Attendance Info Modal */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.65)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: 'white', width: '100%', maxWidth: 360, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 }}>
            
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
              <View>
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#0f172a' }}>
                  {selectedDayData?.day} {selectedDayData?.month} {selectedDayData?.year}
                </Text>
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748b', marginTop: 2 }}>
                  Attendance Details
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 8,
                  backgroundColor: selectedDayData?.status === 'Late' ? '#fef3c7' : selectedDayData?.status === 'Half Day' ? '#ffedd5' : (selectedDayData?.status === 'Present' || selectedDayData?.status === 'Present-Late') ? '#d1fae5' : selectedDayData?.status === 'Absent' ? '#ffe4e6' : '#f1f5f9'
                }}>
                  <Text style={{
                    fontSize: 10,
                    fontWeight: 'bold',
                    color: selectedDayData?.status === 'Late' ? '#d97706' : selectedDayData?.status === 'Half Day' ? '#ea580c' : (selectedDayData?.status === 'Present' || selectedDayData?.status === 'Present-Late') ? '#059669' : selectedDayData?.status === 'Absent' ? '#e11d48' : '#64748b'
                  }}>
                    {selectedDayData?.status || 'No Record'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setModalVisible(false)} style={{ padding: 4, borderRadius: 12, backgroundColor: '#f8fafc' }}>
                  <X size={18} color="#64748b" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Attendance Details Body */}
            {(pIn?.time || pOut?.time || selectedDayData?.punchIn || selectedDayData?.punchOut) ? (
              <View style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {/* Punch In Card */}
                  <View style={{ flex: 1, backgroundColor: '#f8fafc', borderRadius: 16, padding: 10, borderWidth: 1, borderColor: '#e2e8f0' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#4f46e5' }}>PUNCH IN</Text>
                      <View style={{ paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, backgroundColor: pIn?.isOutside ? '#ffe4e6' : '#d1fae5' }}>
                        <Text style={{ fontSize: 7, fontWeight: 'bold', color: pIn?.isOutside ? '#e11d48' : '#059669' }}>
                          {pIn?.isOutside ? 'OUTSIDE' : 'INSIDE'}
                        </Text>
                      </View>
                    </View>
                    
                    <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#1e293b', marginBottom: 6 }}>
                      {formatTime(pIn?.time || selectedDayData?.punchIn)}
                    </Text>

                    {/* Selfie Thumbnail */}
                    <TouchableOpacity
                      onPress={() => pIn?.selfie && setPreviewImage(pIn.selfie)}
                      activeOpacity={0.8}
                      style={{ height: 72, borderRadius: 10, backgroundColor: 'white', overflow: 'hidden', borderWidth: 1, borderColor: '#cbd5e1', marginBottom: 6, justifyContent: 'center', alignItems: 'center' }}
                    >
                      {pIn?.selfie ? (
                        <>
                          <Image source={{ uri: pIn.selfie }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                          <View style={{ position: 'absolute', top: 3, right: 3, backgroundColor: 'rgba(255,255,255,0.85)', padding: 3, borderRadius: 4 }}>
                            <Eye size={10} color="#4f46e5" />
                          </View>
                        </>
                      ) : (
                        <View style={{ alignItems: 'center' }}>
                          <Camera size={16} color="#94a3b8" />
                          <Text style={{ fontSize: 8, color: '#94a3b8', marginTop: 2 }}>No Photo</Text>
                        </View>
                      )}
                    </TouchableOpacity>

                    {/* Location Address */}
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                      <MapPin size={10} color="#64748b" style={{ marginTop: 2, marginRight: 3 }} />
                      <Text style={{ fontSize: 8, fontWeight: '600', color: '#475569', flex: 1, lineHeight: 11 }} numberOfLines={2}>
                        {pIn?.location?.address || 'Address unavailable'}
                      </Text>
                    </View>
                  </View>

                  {/* Punch Out Card */}
                  <View style={{ flex: 1, backgroundColor: '#f8fafc', borderRadius: 16, padding: 10, borderWidth: 1, borderColor: '#e2e8f0' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#f43f5e' }}>PUNCH OUT</Text>
                      <View style={{ paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, backgroundColor: pOut?.isOutside ? '#ffe4e6' : '#d1fae5' }}>
                        <Text style={{ fontSize: 7, fontWeight: 'bold', color: pOut?.isOutside ? '#e11d48' : '#059669' }}>
                          {pOut?.isOutside ? 'OUTSIDE' : 'INSIDE'}
                        </Text>
                      </View>
                    </View>
                    
                    <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#1e293b', marginBottom: 6 }}>
                      {formatTime(pOut?.time || selectedDayData?.punchOut)}
                    </Text>

                    {/* Selfie Thumbnail */}
                    <TouchableOpacity
                      onPress={() => pOut?.selfie && setPreviewImage(pOut.selfie)}
                      activeOpacity={0.8}
                      style={{ height: 72, borderRadius: 10, backgroundColor: 'white', overflow: 'hidden', borderWidth: 1, borderColor: '#cbd5e1', marginBottom: 6, justifyContent: 'center', alignItems: 'center' }}
                    >
                      {pOut?.selfie ? (
                        <>
                          <Image source={{ uri: pOut.selfie }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                          <View style={{ position: 'absolute', top: 3, right: 3, backgroundColor: 'rgba(255,255,255,0.85)', padding: 3, borderRadius: 4 }}>
                            <Eye size={10} color="#f43f5e" />
                          </View>
                        </>
                      ) : (
                        <View style={{ alignItems: 'center' }}>
                          <Camera size={16} color="#94a3b8" />
                          <Text style={{ fontSize: 8, color: '#94a3b8', marginTop: 2 }}>No Photo</Text>
                        </View>
                      )}
                    </TouchableOpacity>

                    {/* Location Address */}
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                      <MapPin size={10} color="#64748b" style={{ marginTop: 2, marginRight: 3 }} />
                      <Text style={{ fontSize: 8, fontWeight: '600', color: '#475569', flex: 1, lineHeight: 11 }} numberOfLines={2}>
                        {pOut?.location?.address || (selectedDayData?.punchOut ? 'Address unavailable' : 'Not Punched Out')}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            ) : (
              <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#64748b', textAlign: 'center' }}>
                  {selectedDayData?.isHoliday ? `Holiday: ${selectedDayData?.holidayName || ''}` : selectedDayData?.isWeekOff ? 'Weekly Off' : selectedDayData?.isFuture ? 'Future Date' : 'No attendance recorded for this date.'}
                </Text>
              </View>
            )}

            {/* Close Button */}
            <TouchableOpacity
              onPress={() => setModalVisible(false)}
              style={{ marginTop: 16, backgroundColor: '#4f46e5', paddingVertical: 10, borderRadius: 12, alignItems: 'center' }}
            >
              <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Full Screen Image Preview Modal */}
      <Modal visible={!!previewImage} transparent={true} animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => setPreviewImage(null)}
            style={{ position: 'absolute', top: 50, right: 20, width: 40, height: 40, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, justifyContent: 'center', alignItems: 'center' }}
          >
            <X size={24} color="white" />
          </TouchableOpacity>
          {previewImage && (
            <Image source={{ uri: previewImage }} style={{ width: '90%', height: '70%', borderRadius: 20 }} resizeMode="contain" />
          )}
        </View>
      </Modal>

      {/* HR Module Footer */}
      <HRModuleFooter navigation={navigation} currentScreen="monthlyView" />
    </View>
  );
};

export default MonthlyViewScreen;
