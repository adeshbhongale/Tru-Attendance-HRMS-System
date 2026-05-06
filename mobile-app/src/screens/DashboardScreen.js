import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Dimensions,
  SafeAreaView,
  Platform,
  StatusBar,
  ActivityIndicator
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { theme } from '../theme';
import { 
  MapPin, 
  Clock, 
  Calendar, 
  User as UserIcon, 
  Bell, 
  Search,
  Zap,
  Map as MapIcon,
  Activity,
  History
} from 'lucide-react-native';

// Only import MapView on native platforms
let MapView, Marker, Circle;
if (Platform.OS !== 'web') {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Marker = Maps.Marker;
  Circle = Maps.Circle;
}

const { width, height } = Dimensions.get('window');
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api';

const DashboardScreen = ({ navigation }) => {
  const [userData, setUserData] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await axios.get(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUserData(res.data.data);
      setAttendance(res.data.todayAttendance);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Map Section */}
      <View style={styles.mapContainer}>
        {Platform.OS === 'web' ? (
          <View style={[styles.map, styles.webMapPlaceholder]}>
            <MapIcon size={40} color={theme.colors.primary} />
            <Text style={styles.webMapText}>Map View (Mobile Only)</Text>
          </View>
        ) : (
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: 18.5204,
              longitude: 73.8567,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
          >
            <Marker
              coordinate={{ latitude: 18.5204, longitude: 73.8567 }}
              title="Office Location"
            >
              <View style={styles.markerContainer}>
                <View style={styles.markerCircle} />
              </View>
            </Marker>
            <Circle
              center={{ latitude: 18.5204, longitude: 73.8567 }}
              radius={200}
              fillColor="rgba(37, 99, 235, 0.1)"
              strokeColor="rgba(37, 99, 235, 0.3)"
            />
          </MapView>
        )}

        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconButton}>
            <Search size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton}>
            <Bell size={22} color={theme.colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Sliding Panel Content */}
      <View style={styles.contentPanel}>
        <View style={styles.panelHeader}>
          <View style={styles.dragHandle} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Status Header */}
          <View style={styles.statusHeader}>
            <View>
              <Text style={styles.nameText}>{userData?.name || 'Employee'}</Text>
              <Text style={styles.idText}>{userData?.designation || 'Staff'}</Text>
              <View style={styles.statusBadge}>
                <View style={[styles.statusDot, { backgroundColor: attendance ? theme.colors.success : theme.colors.textMuted }]} />
                <Text style={styles.statusText}>{attendance ? 'On Duty' : 'Off Duty'}</Text>
              </View>
            </View>
            <View style={styles.batteryContainer}>
              <Text style={styles.batteryText}>95%</Text>
              <View style={styles.batteryIcon} />
            </View>
          </View>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Zap size={20} color={theme.colors.primary} />
              <Text style={styles.statLabel}>Status</Text>
              <Text style={styles.statValue}>{attendance?.status || 'Absent'}</Text>
            </View>
            <View style={styles.statCard}>
              <Clock size={20} color="#10b981" />
              <Text style={styles.statLabel}>In Time</Text>
              <Text style={styles.statValue}>
                {attendance?.punchIn?.time ? new Date(attendance.punchIn.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
              </Text>
            </View>
            <View style={styles.statCard}>
              <History size={20} color="#f59e0b" />
              <Text style={styles.statLabel}>Working</Text>
              <Text style={styles.statValue}>{attendance?.workingHours ? `${attendance.workingHours}h` : '0h'}</Text>
            </View>
          </View>

          {/* Action Button */}
          <TouchableOpacity 
            style={styles.punchButton} 
            onPress={() => navigation.navigate('Attendance')}
          >
            <View style={styles.punchButtonInner}>
              <View style={[styles.punchCircle, { backgroundColor: attendance ? theme.colors.danger : theme.colors.success }]}>
                <Clock size={24} color="white" />
              </View>
              <View style={{ flex: 1, marginLeft: 15 }}>
                <Text style={styles.punchTitle}>{attendance ? 'Punch Out' : 'Punch In'}</Text>
                <Text style={styles.punchSubtitle}>
                  {attendance ? 'You are currently on duty' : 'Start your work day'}
                </Text>
              </View>
              <ChevronRight size={20} color={theme.colors.textMuted} />
            </View>
          </TouchableOpacity>

          {/* Recent History Section placeholder */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Shift Information</Text>
          </View>

          <View style={styles.historyCard}>
            <View style={styles.historyItem}>
              <Calendar size={18} color={theme.colors.primary} />
              <View style={styles.historyContent}>
                <Text style={styles.historyTitle}>Assigned Shift</Text>
                <Text style={styles.historyTime}>{userData?.shift?.name || 'General'} ({userData?.shift?.startTime} - {userData?.shift?.endTime})</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </View>

      {/* Bottom Nav */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem}>
          <Activity size={24} color={theme.colors.primary} />
          <Text style={[styles.navText, { color: theme.colors.primary }]}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('Leave')}>
          <Calendar size={24} color={theme.colors.textMuted} />
          <Text style={styles.navText}>Leave</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('Profile')}>
          <UserIcon size={24} color={theme.colors.textMuted} />
          <Text style={styles.navText}>Profile</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mapContainer: { height: height * 0.45, width: '100%' },
  map: { ...StyleSheet.absoluteFillObject },
  topBar: { position: 'absolute', top: 50, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between' },
  iconButton: { width: 45, height: 45, borderRadius: 22.5, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center', ...theme.shadows.medium },
  contentPanel: { flex: 1, backgroundColor: 'white', marginTop: -30, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, ...theme.shadows.medium },
  panelHeader: { alignItems: 'center', paddingVertical: 15 },
  dragHandle: { width: 40, height: 5, backgroundColor: '#e2e8f0', borderRadius: 2.5 },
  scrollContent: { paddingBottom: 100 },
  statusHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  nameText: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  idText: { fontSize: 14, color: theme.colors.textMuted, fontWeight: '600' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: { fontSize: 14, color: theme.colors.textMuted, fontWeight: '600' },
  batteryContainer: { flexDirection: 'row', alignItems: 'center' },
  batteryText: { fontSize: 14, color: theme.colors.textMuted, marginRight: 5 },
  batteryIcon: { width: 24, height: 12, borderWidth: 1, borderColor: theme.colors.textMuted, borderRadius: 2 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: '#f8fafc', borderRadius: 15, padding: 15, alignItems: 'center', borderWidth: 1, borderColor: '#f1f5f9' },
  statLabel: { fontSize: 12, color: theme.colors.textMuted, marginTop: 8 },
  statValue: { fontSize: 14, fontWeight: '700', color: theme.colors.text, marginTop: 2 },
  punchButton: { backgroundColor: '#f8fafc', borderRadius: 20, padding: 15, borderWidth: 1, borderColor: '#f1f5f9', marginBottom: 20 },
  punchButtonInner: { flexDirection: 'row', alignItems: 'center' },
  punchCircle: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  punchTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  punchSubtitle: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  sectionHeader: { marginBottom: 15 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  historyCard: { backgroundColor: '#f8fafc', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#f1f5f9' },
  historyItem: { flexDirection: 'row', alignItems: 'center' },
  historyContent: { marginLeft: 15 },
  historyTitle: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  historyTime: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  bottomNav: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 80, backgroundColor: 'white', flexDirection: 'row', justifyContent: 'space-around', paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingHorizontal: 20 },
  navItem: { alignItems: 'center' },
  navText: { fontSize: 11, marginTop: 4, fontWeight: '600', color: theme.colors.textMuted },
  webMapPlaceholder: { backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', padding: 20 },
  webMapText: { marginTop: 10, fontSize: 16, fontWeight: '700', color: theme.colors.text, textAlign: 'center' },
  markerContainer: { alignItems: 'center', justifyContent: 'center' },
  markerCircle: { width: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.primary, borderWidth: 3, borderColor: 'white' },
});

export default DashboardScreen;
