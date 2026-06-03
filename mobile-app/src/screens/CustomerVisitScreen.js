import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import {
  AlertCircle,
  ArrowLeft,
  Briefcase,
  Calendar,
  CheckCircle,
  ChevronDown,
  Clock,
  ExternalLink,
  Eye,
  FileText,
  MapPin,
  PlayCircle,
  Plus,
  RotateCcw,
  Search,
  X
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import api from '../api/axios';

// ─────────────────────────────────────────────────────────────
// STATUS CONFIG
// ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  'Upcoming': { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8', dot: '#3B82F6', label: 'UPCOMING' },
  'To Do': { bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D', dot: '#22C55E', label: 'TO DO' },
  'In Progress': { bg: '#FFFBEB', border: '#FDE68A', text: '#B45309', dot: '#F59E0B', label: 'IN PROGRESS' },
  'Completed': { bg: '#F0FDF4', border: '#A7F3D0', text: '#065F46', dot: '#10B981', label: 'COMPLETED' },
  'Over Due': { bg: '#FFF1F2', border: '#FECDD3', text: '#BE123C', dot: '#F43F5E', label: 'OVERDUE' },
};

const getStatusCfg = (status) =>
  STATUS_CONFIG[status] || { bg: '#F8FAFC', border: '#E2E8F0', text: '#475569', dot: '#94A3B8', label: status?.toUpperCase() || 'UNKNOWN' };

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
const to12Hour = (time24) => {
  if (!time24) return '--:--';
  const [hours, minutes] = time24.split(':');
  let h = parseInt(hours, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${minutes} ${ampm}`;
};

const formatLocalDate = (dateVal) => {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

const formatRelativeDate = (dateVal) => {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  const now = new Date();
  const diff = Math.round((d - now) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1) return `In ${diff} days`;
  return `${Math.abs(diff)} days ago`;
};

// Open Google Maps for a location address or lat/lng
const openGoogleMaps = (address, lat, lng) => {
  let url;
  if (lat && lng) {
    url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  } else if (address) {
    url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }
  if (url) Linking.openURL(url).catch(() => { });
};

// Build Google Maps Static Image URL for a location
const getStaticMapUrl = (lat, lng) => {
  const MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!MAPS_KEY || !lat || !lng) return null;
  return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=16&size=300x120&markers=color:red%7C${lat},${lng}&key=${MAPS_KEY}`;
};

// ─────────────────────────────────────────────────────────────
// STYLESHEET
// ─────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  /* overlay / sheet */
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: '88%',
  },
  sheetHandle: {
    width: 40, height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 99,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  sheetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  closeBtn: { width: 36, height: 36, backgroundColor: '#F1F5F9', borderRadius: 99, justifyContent: 'center', alignItems: 'center' },

  /* form elements */
  label: { fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 2, marginBottom: 8, marginLeft: 2 },
  input: {
    backgroundColor: '#F8FAFC', borderRadius: 16,
    paddingHorizontal: 16, height: 52,
    borderWidth: 1.5, borderColor: '#E2E8F0',
    color: '#1E293B', fontSize: 14, fontWeight: '600',
    marginBottom: 16,
  },
  inputFocused: { borderColor: '#6366F1', backgroundColor: '#FAFAFF' },
  textArea: {
    backgroundColor: '#F8FAFC', borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1.5, borderColor: '#E2E8F0',
    color: '#1E293B', fontSize: 14, fontWeight: '600',
    marginBottom: 16, minHeight: 80,
  },
  primaryBtn: {
    height: 56, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
    flexDirection: 'row', gap: 8,
    marginTop: 8,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.3 },

  /* customer list item */
  custItem: {
    paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: 16, marginBottom: 8,
    borderWidth: 1.5, borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  custItemActive: { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' },
  custIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#E0E7FF', justifyContent: 'center', alignItems: 'center',
  },
  custIconActive: { backgroundColor: '#4F46E5' },
  custName: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  custNameActive: { color: '#4338CA' },
  custSub: { fontSize: 11, color: '#64748B', marginTop: 2 },
});

// ─────────────────────────────────────────────────────────────
// STATUS BADGE COMPONENT
// ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status, small = false }) => {
  const cfg = getStatusCfg(status);
  return (
    <View style={{ backgroundColor: cfg.bg, borderColor: cfg.border, borderWidth: 1.5, borderRadius: small ? 8 : 10, paddingHorizontal: small ? 8 : 10, paddingVertical: small ? 3 : 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: small ? 5 : 6, height: small ? 5 : 6, borderRadius: 99, backgroundColor: cfg.dot }} />
      <Text style={{ fontSize: small ? 9 : 10, fontWeight: '800', color: cfg.text, letterSpacing: 0.8 }}>{cfg.label}</Text>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────
// STAT CARD COMPONENT — white background as requested
// ─────────────────────────────────────────────────────────────
const StatCard = ({ label, count, color, dotColor }) => (
  <View style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12, alignItems: 'center', gap: 4, minWidth: 60, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)' }}>
    <Text style={{ fontSize: 22, fontWeight: '900', color: dotColor }}>{count}</Text>
    <Text style={{ fontSize: 9, fontWeight: '800', color: '#475569', opacity: 0.85, textAlign: 'center', letterSpacing: 0.5 }}>{label}</Text>
  </View>
);

// ─────────────────────────────────────────────────────────────
// LOCATION MAP THUMBNAIL — shows static map + address + open in maps button
// ─────────────────────────────────────────────────────────────
const LocationMapCard = ({ address, latitude, longitude, color = '#10B981', bgColor = '#F0FDF4' }) => {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => openGoogleMaps(address, latitude, longitude)}
      style={{
        backgroundColor: bgColor,
        borderRadius: 14,
        overflow: 'hidden',
        marginBottom: 8,
        borderWidth: 1,
        borderColor: color + '40',
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
      }}
    >
      <MapPin size={14} color={color} style={{ marginTop: 2 }} />
      <Text style={{ fontSize: 12, color: '#1E293B', fontWeight: '600', flex: 1, lineHeight: 18 }}>
        {address || 'Location unavailable'}
      </Text>
      <ExternalLink size={13} color={color} style={{ marginTop: 2 }} />
    </TouchableOpacity>
  );
};

// ─────────────────────────────────────────────────────────────
// SELFIE THUMBNAIL — tappable to show full-screen
// ─────────────────────────────────────────────────────────────
const SelfieThumbnail = ({ uri, onPress, borderColor = '#E0E7FF', size = 52 }) => {
  if (!uri) return null;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        width: size, height: size, borderRadius: 12,
        borderWidth: 2, borderColor,
        overflow: 'hidden',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12, shadowRadius: 4, elevation: 3,
      }}
    >
      <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      <View style={{ position: 'absolute', bottom: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', padding: 3, borderTopLeftRadius: 6 }}>
        <Eye size={8} color="#fff" />
      </View>
    </TouchableOpacity>
  );
};

// ─────────────────────────────────────────────────────────────
// FULL SCREEN IMAGE PREVIEW MODAL
// ─────────────────────────────────────────────────────────────
const ImagePreviewModal = ({ visible, uri, onClose }) => (
  <Modal visible={visible} transparent animationType="fade">
    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' }}>
      <TouchableOpacity
        onPress={onClose}
        style={{ position: 'absolute', top: 56, right: 20, width: 40, height: 40, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 99, justifyContent: 'center', alignItems: 'center', zIndex: 10 }}
      >
        <X size={20} color="#fff" />
      </TouchableOpacity>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: '90%', height: '70%', borderRadius: 20 }}
          resizeMode="contain"
        />
      ) : null}
      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 16, fontWeight: '600' }}>Tap outside or X to close</Text>
    </View>
  </Modal>
);

// ─────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────
const CustomerVisitScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // data
  const [customers, setCustomers] = useState([]);
  const [visits, setVisits] = useState([]);

  // schedule form
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [visitDate, setVisitDate] = useState(new Date());
  const [visitTime, setVisitTime] = useState(new Date());
  const [reason, setReason] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // modals
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [addCustomerModalVisible, setAddCustomerModalVisible] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');

  // add customer form
  const [customerForm, setCustomerForm] = useState({ customerName: '', mobile: '', email: '', address: '' });

  // history
  const HISTORY_TABS = ['All', 'Upcoming', 'To Do', 'In Progress', 'Completed', 'Over Due'];
  const [historyTab, setHistoryTab] = useState('All');
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(8);

  // actions
  const [actionLoading, setActionLoading] = useState(false);
  const [actionVisitId, setActionVisitId] = useState(null);
  const [completionReasons, setCompletionReasons] = useState({}); // per-visit completion reason

  // image preview
  const [previewImageUri, setPreviewImageUri] = useState(null);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);

  // ── fetch ──────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const [custRes, visitRes] = await Promise.all([
        api.get('/customers?isActive=true&limit=1000'),
        api.get('/visits'),
      ]);
      setCustomers(custRes.data.data || []);
      setVisits(visitRes.data.data || []);
    } catch (err) {
      Alert.alert('Error', 'Failed to load data. Please check your connection.');
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchData();
      setLoading(false);
    };
    load();
    const unsub = navigation.addListener('focus', fetchData);
    return unsub;
  }, [navigation, fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  // ── summary stats ──────────────────────────────────────────
  const stats = {
    total: visits.length,
    upcoming: visits.filter(v => v.status === 'Upcoming').length,
    todo: visits.filter(v => v.status === 'To Do').length,
    inProgress: visits.filter(v => v.status === 'In Progress').length,
    completed: visits.filter(v => v.status === 'Completed').length,
    overdue: visits.filter(v => v.status === 'Over Due').length,
  };

  // ── Add customer ──────────────────────────────────────────
  const handleAddCustomer = async () => {
    if (!customerForm.customerName.trim()) {
      Alert.alert('Validation', 'Customer Name is required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post('/customers', customerForm);
      if (res.data.success) {
        const nc = res.data.data;
        setCustomers(prev => [nc, ...prev]);
        setSelectedCustomer(nc);
        setAddCustomerModalVisible(false);
        setCustomerModalVisible(false);
        setCustomerForm({ customerName: '', mobile: '', email: '', address: '' });
        Alert.alert('✓ Success', 'Customer added successfully!');
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to add customer.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Schedule visit ──────────────────────────────────────────
  const handleScheduleVisit = async () => {
    if (!selectedCustomer) {
      Alert.alert('Validation', 'Please select a customer.');
      return;
    }
    if (!reason.trim()) {
      Alert.alert('Validation', 'Reason / Instructions is compulsory.');
      return;
    }
    setSubmitting(true);
    try {
      const dateStr = visitDate.toISOString().split('T')[0];
      const hours = String(visitTime.getHours()).padStart(2, '0');
      const minutes = String(visitTime.getMinutes()).padStart(2, '0');
      const timeStr = `${hours}:${minutes}`;

      const res = await api.post('/visits', {
        customerId: selectedCustomer._id,
        scheduledDate: dateStr,
        scheduledTime: timeStr,
        reason: reason.trim(),
      });

      if (res.data.success) {
        Alert.alert('✓ Scheduled!', 'Visit has been scheduled successfully.');
        setSelectedCustomer(null);
        setReason('');
        setVisitDate(new Date());
        setVisitTime(new Date());
        await fetchData();
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to schedule visit.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Start / Complete actions ───────────────────────────────
  const performVisitAction = async (visitId, action) => {
    const visitCompletionReason = completionReasons[visitId] || '';
    if (action === 'complete' && !visitCompletionReason.trim()) {
      Alert.alert('Validation', 'Completion reason is compulsory to complete a visit.');
      return;
    }

    // Block starting if another visit is already In Progress
    if (action === 'start') {
      const alreadyInProgress = visits.find(v => v.status === 'In Progress' && v._id !== visitId);
      if (alreadyInProgress) {
        Alert.alert(
          'Visit Already In Progress',
          `You already have an active visit with "${alreadyInProgress.customerName}". Please complete it before starting a new one.`,
          [{ text: 'OK' }]
        );
        return;
      }
    }

    setActionLoading(true);
    setActionVisitId(visitId);

    try {
      // 1. GPS
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
        Alert.alert('Permission Denied', 'GPS location access is required.');
        setActionLoading(false); setActionVisitId(null);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });

      // 2. Geocode — get exact address
      let address = 'Location captured';
      try {
        const MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
        if (MAPS_KEY) {
          const geoRes = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${loc.coords.latitude},${loc.coords.longitude}&key=${MAPS_KEY}`
          );
          const geoData = await geoRes.json();
          if (geoData.status === 'OK' && geoData.results.length > 0) {
            address = geoData.results[0].formatted_address;
          } else {
            const geocode = await Location.reverseGeocodeAsync({
              latitude: loc.coords.latitude, longitude: loc.coords.longitude,
            });
            if (geocode[0]) {
              const g = geocode[0];
              address = [g.name, g.street, g.city, g.region].filter(Boolean).join(', ');
            }
          }
        } else {
          const geocode = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude, longitude: loc.coords.longitude,
          });
          if (geocode[0]) {
            const g = geocode[0];
            address = [g.name, g.street, g.city, g.region].filter(Boolean).join(', ');
          }
        }
      } catch (_) { }

      // 3. Show location to employee and ask confirmation to proceed to selfie
      await new Promise((resolve, reject) => {
        Alert.alert(
          '📍 Your Current Location',
          `${address}\n\nCoordinates: ${loc.coords.latitude.toFixed(6)}, ${loc.coords.longitude.toFixed(6)}\n\nDoes this look correct? Tap OK to proceed to selfie.`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => reject('cancelled') },
            { text: 'OK — Take Selfie', onPress: () => resolve() },
          ]
        );
      });

      // 4. Camera
      const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
      if (camStatus !== 'granted') {
        Alert.alert('Permission Denied', 'Camera access is required for selfie verification.');
        setActionLoading(false); setActionVisitId(null);
        return;
      }
      const selfieResult = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images', allowsEditing: false, quality: 0.7,
        base64: true, cameraType: 'front', preferFrontCamera: true,
      });
      if (selfieResult.canceled) {
        Alert.alert('Cancelled', 'Selfie is required to proceed.');
        setActionLoading(false); setActionVisitId(null);
        return;
      }
      const selfieBase64 = `data:image/jpeg;base64,${selfieResult.assets[0].base64}`;

      // 5. API
      if (action === 'start') {
        const res = await api.post(`/visits/${visitId}/start`, {
          latitude: loc.coords.latitude, longitude: loc.coords.longitude,
          address, selfie: selfieBase64,
        });
        if (res.data.success) {
          Alert.alert('✓ Started!', 'Visit marked as In Progress.');
          await fetchData();
        }
      } else if (action === 'complete') {
        const res = await api.post(`/visits/${visitId}/complete`, {
          latitude: loc.coords.latitude, longitude: loc.coords.longitude,
          address, selfie: selfieBase64,
          reason: visitCompletionReason.trim(),
        });
        if (res.data.success) {
          Alert.alert('✓ Completed!', 'Visit has been completed successfully.');
          setCompletionReasons(prev => { const n = { ...prev }; delete n[visitId]; return n; });
          await fetchData();
        }
      }
    } catch (err) {
      if (err !== 'cancelled') {
        Alert.alert('Error', err.response?.data?.message || 'Failed to update visit status.');
      }
    } finally {
      setActionLoading(false);
      setActionVisitId(null);
    }
  };

  // ── Filter helpers ─────────────────────────────────────────
  const filteredCustomers = customers.filter(c =>
    c.customerName.toLowerCase().includes(customerSearchQuery.toLowerCase())
  );

  // Active visits = To Do + In Progress + Over Due (all actionable)
  const activeVisits = visits.filter(v =>
    v.status === 'To Do' || v.status === 'In Progress' || v.status === 'Over Due'
  );

  // History tab filtering
  const historyVisits = (historyTab === 'All' ? visits : visits.filter(v => v.status === historyTab))
    .sort((a, b) => new Date(b.scheduledDate) - new Date(a.scheduledDate));

  // ── Loading screen ─────────────────────────────────────────
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' }}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={{ color: '#94A3B8', fontWeight: '700', marginTop: 16, fontSize: 14 }}>Loading visits…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F0F4FF' }}>
      <StatusBar barStyle="light-content" />

      {/* ── HEADER ── */}
      <View style={{
        paddingTop: Platform.OS === 'ios' ? 56 : 44,
        paddingHorizontal: 20,
        paddingBottom: 20,
        backgroundColor: '#4F46E5',
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            {/* ✅ FIXED: back button uses goBack() */}
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' }}
            >
              <ArrowLeft size={20} color="#fff" />
            </TouchableOpacity>
            <View>
              <Text style={{ fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: -0.5 }}>Customer Visits</Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>
                {stats.total} total • {stats.inProgress} active
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={handleRefresh}
            style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' }}
          >
            <RotateCcw size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* ✅ Status Stats Row — WHITE background */}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <StatCard label="UPCOMING" count={stats.upcoming} color="#EFF6FF" dotColor="#3B82F6" />
          <StatCard label="TO DO" count={stats.todo} color="#F0FDF4" dotColor="#22C55E" />
          <StatCard label="IN PROG" count={stats.inProgress} color="#FFFBEB" dotColor="#F59E0B" />
          <StatCard label="DONE" count={stats.completed} color="#F0FDF4" dotColor="#10B981" />
          <StatCard label="OVERDUE" count={stats.overdue} color="#FFF1F2" dotColor="#F43F5E" />
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#4F46E5']} tintColor="#4F46E5" />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── SCHEDULE VISIT CARD ── */}
        <Text style={{ fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 2, marginBottom: 10, marginLeft: 2 }}>SCHEDULE NEW VISIT</Text>
        <View style={{ backgroundColor: '#fff', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#E0E7FF', marginBottom: 20, shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 }}>

          {/* Customer picker */}
          <Text style={S.label}>CLIENT CUSTOMER *</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            <TouchableOpacity
              onPress={() => setCustomerModalVisible(true)}
              style={{ flex: 1, backgroundColor: '#F8FAFC', height: 52, borderRadius: 16, borderWidth: 1.5, borderColor: selectedCustomer ? '#C7D2FE' : '#E2E8F0', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, justifyContent: 'space-between' }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}>
                <Briefcase size={16} color={selectedCustomer ? '#4F46E5' : '#94A3B8'} />
                <Text style={{ color: selectedCustomer ? '#1E293B' : '#94A3B8', fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
                  {selectedCustomer ? selectedCustomer.customerName : 'Select Customer'}
                </Text>
              </View>
              <ChevronDown size={16} color="#94A3B8" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setAddCustomerModalVisible(true)}
              style={{ width: 52, height: 52, backgroundColor: '#EEF2FF', borderRadius: 16, borderWidth: 1.5, borderColor: '#C7D2FE', justifyContent: 'center', alignItems: 'center' }}
            >
              <Plus size={22} color="#4F46E5" />
            </TouchableOpacity>
          </View>

          {/* Date + Time */}
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
            <View style={{ flex: 1 }}>
              <Text style={S.label}>MEETING DATE</Text>
              <TouchableOpacity
                onPress={() => setShowDatePicker(true)}
                style={{ backgroundColor: '#F8FAFC', height: 52, borderRadius: 16, borderWidth: 1.5, borderColor: '#E2E8F0', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 8 }}
              >
                <Calendar size={16} color="#4F46E5" />
                <Text style={{ color: '#1E293B', fontWeight: '700', fontSize: 13 }}>{formatLocalDate(visitDate)}</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={S.label}>MEETING TIME</Text>
              <TouchableOpacity
                onPress={() => setShowTimePicker(true)}
                style={{ backgroundColor: '#F8FAFC', height: 52, borderRadius: 16, borderWidth: 1.5, borderColor: '#E2E8F0', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 8 }}
              >
                <Clock size={16} color="#4F46E5" />
                <Text style={{ color: '#1E293B', fontWeight: '700', fontSize: 13 }}>
                  {to12Hour(`${String(visitTime.getHours()).padStart(2, '0')}:${String(visitTime.getMinutes()).padStart(2, '0')}`)}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Reason */}
          <Text style={S.label}>REASON / INSTRUCTIONS *</Text>
          <TextInput
            placeholder="Enter visit reason, goals or instructions (Compulsory)…"
            value={reason}
            onChangeText={setReason}
            style={S.textArea}
            placeholderTextColor="#CBD5E1"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          {/* Submit */}
          <TouchableOpacity
            onPress={handleScheduleVisit}
            disabled={submitting}
            style={[S.primaryBtn, { backgroundColor: submitting ? '#A5B4FC' : '#4F46E5' }]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Calendar size={18} color="#fff" />
                <Text style={S.primaryBtnText}>Schedule Visit</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Date/Time pickers */}
        {showDatePicker && (
          <DateTimePicker
            value={visitDate}
            mode="date"
            minimumDate={new Date()}
            onChange={(e, date) => { setShowDatePicker(false); if (date) setVisitDate(date); }}
          />
        )}
        {showTimePicker && (
          <DateTimePicker
            value={visitTime}
            mode="time"
            is24Hour={false}
            onChange={(e, date) => { setShowTimePicker(false); if (date) setVisitTime(date); }}
          />
        )}

        {/* ── ACTIVE VISITS (To Do + In Progress + Over Due) ── */}
        {activeVisits.length > 0 && (
          <>
            <Text style={{ fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 2, marginBottom: 10, marginLeft: 2, marginTop: 4 }}>
              ACTIVE VISITS ({activeVisits.length})
            </Text>
            {activeVisits.map((visit) => {
              const cfg = getStatusCfg(visit.status);
              const isLoading = actionLoading && actionVisitId === visit._id;
              const visitCompletionReason = completionReasons[visit._id] || '';
              const isOverdue = visit.status === 'Over Due';
              const isTodo = visit.status === 'To Do';
              const isInProgress = visit.status === 'In Progress';

              return (
                <View
                  key={visit._id}
                  style={{ backgroundColor: '#fff', borderRadius: 22, borderWidth: 1.5, borderColor: cfg.border, marginBottom: 14, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 }}
                >
                  {/* Colored top strip */}
                  <View style={{ height: 4, backgroundColor: cfg.dot }} />
                  <View style={{ padding: 18 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={{ fontSize: 17, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 }}>{visit.customerName}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <Calendar size={12} color="#94A3B8" />
                          <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>
                            {formatLocalDate(visit.scheduledDate)} at {to12Hour(visit.scheduledTime)}
                          </Text>
                          <Text style={{ fontSize: 10, color: cfg.dot, fontWeight: '700' }}>• {formatRelativeDate(visit.scheduledDate)}</Text>
                        </View>
                      </View>
                      <StatusBadge status={visit.status} />
                    </View>

                    {visit.reason ? (
                      <View style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 10, marginBottom: 12, flexDirection: 'row', gap: 8 }}>
                        <FileText size={13} color="#94A3B8" style={{ marginTop: 1 }} />
                        <Text style={{ fontSize: 12, color: '#475569', flex: 1, fontWeight: '500', fontStyle: 'normal' }}>{visit.reason}</Text>
                      </View>
                    ) : null}

                    {/* ✅ OVERDUE warning banner */}
                    {isOverdue && (
                      <View style={{ backgroundColor: '#FFF1F2', borderRadius: 10, padding: 10, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#FECDD3' }}>
                        <AlertCircle size={14} color="#F43F5E" />
                        <Text style={{ fontSize: 12, color: '#BE123C', fontWeight: '700', flex: 1 }}>
                          This visit is overdue! Please start or mark as complete.
                        </Text>
                      </View>
                    )}

                    {/* Action button */}
                    <View style={{ borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 12 }}>
                      {/* ✅ To Do & Over Due → show START button */}
                      {(isTodo || isOverdue) ? (
                        <TouchableOpacity
                          onPress={() => performVisitAction(visit._id, 'start')}
                          disabled={isLoading}
                          style={{ backgroundColor: isOverdue ? '#F43F5E' : '#4F46E5', height: 48, borderRadius: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }}
                        >
                          {isLoading ? <ActivityIndicator color="#fff" /> : (
                            <>
                              <PlayCircle size={18} color="#fff" />
                              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>
                                {isOverdue ? 'START OVERDUE VISIT (GPS + Selfie)' : 'START VISIT (GPS + Selfie)'}
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>
                      ) : (
                        /* ✅ In Progress → show selfie + start address + reason + COMPLETE section */
                        <View>
                          {/* Start info: selfie + location + reason */}
                          {(visit.startSelfie || visit.startAddress || visit.reason) ? (
                            <View style={{ backgroundColor: '#EEF2FF', borderRadius: 16, padding: 12, marginBottom: 12, gap: 8 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <PlayCircle size={12} color="#4F46E5" />
                                <Text style={{ fontSize: 9, fontWeight: '800', color: '#4F46E5', letterSpacing: 1 }}>VISIT STARTED</Text>
                                <Text style={{ fontSize: 11, color: '#334155', fontWeight: '700', marginLeft: 4 }}>
                                  {visit.startTime ? new Date(visit.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : ''}
                                </Text>
                              </View>
                              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                                {visit.startSelfie ? (
                                  <SelfieThumbnail
                                    uri={visit.startSelfie}
                                    borderColor="#C7D2FE"
                                    size={60}
                                    onPress={() => { setPreviewImageUri(visit.startSelfie); setPreviewModalVisible(true); }}
                                  />
                                ) : null}
                                <View style={{ flex: 1, gap: 6 }}>
                                  {visit.startAddress ? (
                                    <LocationMapCard
                                      address={visit.startAddress}
                                      latitude={visit.startLatitude}
                                      longitude={visit.startLongitude}
                                      color="#4F46E5"
                                      bgColor="#fff"
                                    />
                                  ) : null}
                                  {visit.reason ? (
                                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
                                      <FileText size={11} color="#6366F1" style={{ marginTop: 1 }} />
                                      <Text style={{ flex: 1, fontSize: 11, color: '#3730A3', fontWeight: '600', fontStyle: 'normal' }}>{visit.reason}</Text>
                                    </View>
                                  ) : null}
                                </View>
                              </View>
                            </View>
                          ) : null}
                          <TextInput
                            placeholder="Completion reason (Compulsory)…"
                            value={visitCompletionReason}
                            onChangeText={v => setCompletionReasons(prev => ({ ...prev, [visit._id]: v }))}
                            style={{ backgroundColor: '#F8FAFC', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1.5, borderColor: '#E2E8F0', fontSize: 13, color: '#1E293B', fontWeight: '600', marginBottom: 10 }}
                            placeholderTextColor="#CBD5E1"
                          />
                          <TouchableOpacity
                            onPress={() => performVisitAction(visit._id, 'complete')}
                            disabled={isLoading}
                            style={{ backgroundColor: '#10B981', height: 48, borderRadius: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }}
                          >
                            {isLoading ? <ActivityIndicator color="#fff" /> : (
                              <>
                                <CheckCircle size={18} color="#fff" />
                                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>COMPLETE VISIT (GPS + Selfie)</Text>
                              </>
                            )}
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* ── VISIT HISTORY ── */}
        <Text style={{ fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 2, marginBottom: 10, marginLeft: 2, marginTop: 4 }}>
          VISIT HISTORY
        </Text>

        {/* Tab filters */}
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 14 }}
        >
          {HISTORY_TABS.map(tab => {
            const isActive = historyTab === tab;
            const cfg = tab === 'All' ? null : getStatusCfg(tab);
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => { setHistoryTab(tab); setVisibleHistoryCount(8); }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 20,
                  borderWidth: 1.5,
                  borderColor: isActive ? (cfg?.dot || '#4F46E5') : '#E2E8F0',
                  backgroundColor: isActive ? (cfg?.bg || '#EEF2FF') : '#fff',
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                }}
              >
                {cfg ? <View style={{ width: 7, height: 7, borderRadius: 99, backgroundColor: cfg.dot }} /> : null}
                <Text style={{ fontSize: 12, fontWeight: '700', color: isActive ? (cfg?.text || '#4338CA') : '#64748B' }}>
                  {tab}
                  {tab !== 'All' ? ` (${visits.filter(v => v.status === tab).length})` : ` (${visits.length})`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── History cards ── */}
        {historyVisits.length === 0 ? (
          <View style={{ backgroundColor: '#fff', borderRadius: 24, padding: 40, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
            <Briefcase size={40} color="#CBD5E1" />
            <Text style={{ color: '#94A3B8', fontWeight: '700', marginTop: 12, fontSize: 14 }}>No visits found for this filter</Text>
          </View>
        ) : (
          historyVisits.slice(0, visibleHistoryCount).map((visit) => {
            const cfg = getStatusCfg(visit.status);
            return (
              <View
                key={visit._id}
                style={{ backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#E8ECFF', marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 }}
              >
                <View style={{ padding: 16 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: '#0F172A' }}>{visit.customerName}</Text>
                      <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600', marginTop: 2 }}>
                        {formatLocalDate(visit.scheduledDate)} at {to12Hour(visit.scheduledTime)}
                        {' • '}
                        <Text style={{ color: cfg.dot, fontWeight: '700' }}>{formatRelativeDate(visit.scheduledDate)}</Text>
                      </Text>
                    </View>
                    <StatusBadge status={visit.status} small />
                  </View>

                  {/* ✅ Schedule reason (always shown) */}
                  {visit.reason ? (
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start', backgroundColor: '#F8FAFC', borderRadius: 10, padding: 8, marginBottom: 8 }}>
                      <FileText size={12} color="#94A3B8" style={{ marginTop: 1 }} />
                      <Text style={{ flex: 1, fontSize: 11, color: '#475569', fontWeight: '500', fontStyle: 'normal' }}>{visit.reason}</Text>
                    </View>
                  ) : null}

                  {/* ✅ Timeline if started/completed — with map + selfie */}
                  {(visit.startTime || visit.endTime) ? (
                    <View style={{ backgroundColor: '#F8FAFC', borderRadius: 14, padding: 12, marginTop: 4, gap: 12 }}>

                      {/* STARTED block */}
                      {visit.startTime ? (
                        <View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                            <PlayCircle size={13} color="#4F46E5" />
                            <Text style={{ fontSize: 9, fontWeight: '800', color: '#4F46E5', letterSpacing: 1 }}>VISIT STARTED</Text>
                            <Text style={{ fontSize: 11, color: '#334155', fontWeight: '700', marginLeft: 4 }}>
                              {new Date(visit.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                          </View>

                          {/* Selfie + location side by side or stacked */}
                          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                            {/* Selfie thumbnail */}
                            {visit.startSelfie ? (
                              <SelfieThumbnail
                                uri={visit.startSelfie}
                                borderColor="#C7D2FE"
                                size={64}
                                onPress={() => { setPreviewImageUri(visit.startSelfie); setPreviewModalVisible(true); }}
                              />
                            ) : null}
                            {/* Location info */}
                            <View style={{ flex: 1 }}>
                              {visit.startAddress ? (
                                <LocationMapCard
                                  address={visit.startAddress}
                                  latitude={visit.startLatitude}
                                  longitude={visit.startLongitude}
                                  color="#4F46E5"
                                  bgColor="#EEF2FF"
                                />
                              ) : null}
                            </View>
                          </View>
                        </View>
                      ) : null}

                      {/* COMPLETED block */}
                      {visit.endTime ? (
                        <View style={{ borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 10 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                            <CheckCircle size={13} color="#10B981" />
                            <Text style={{ fontSize: 9, fontWeight: '800', color: '#10B981', letterSpacing: 1 }}>VISIT COMPLETED</Text>
                            <Text style={{ fontSize: 11, color: '#334155', fontWeight: '700', marginLeft: 4 }}>
                              {new Date(visit.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                          </View>

                          {/* Selfie + location side by side or stacked */}
                          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                            {/* Selfie thumbnail */}
                            {visit.endSelfie ? (
                              <SelfieThumbnail
                                uri={visit.endSelfie}
                                borderColor="#A7F3D0"
                                size={64}
                                onPress={() => { setPreviewImageUri(visit.endSelfie); setPreviewModalVisible(true); }}
                              />
                            ) : null}
                            {/* Location info */}
                            <View style={{ flex: 1 }}>
                              {visit.endAddress ? (
                                <LocationMapCard
                                  address={visit.endAddress}
                                  latitude={visit.endLatitude}
                                  longitude={visit.endLongitude}
                                  color="#10B981"
                                  bgColor="#F0FDF4"
                                />
                              ) : null}
                            </View>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })
        )}

        {historyVisits.length > visibleHistoryCount && (
          <TouchableOpacity
            onPress={() => setVisibleHistoryCount(prev => prev + 8)}
            style={{ paddingVertical: 16, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#E0E7FF', alignItems: 'center' }}
          >
            <Text style={{ color: '#4F46E5', fontWeight: '800', fontSize: 12, letterSpacing: 1 }}>
              LOAD MORE ({historyVisits.length - visibleHistoryCount} remaining)
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* ══════════ MODAL: Select Customer ══════════ */}
      <Modal visible={customerModalVisible} transparent animationType="slide">
        <View style={S.overlay}>
          <View style={S.sheet}>
            <View style={S.sheetHandle} />
            <View style={S.sheetRow}>
              <Text style={S.sheetTitle}>Select Customer</Text>
              <TouchableOpacity
                onPress={() => { setCustomerModalVisible(false); setCustomerSearchQuery(''); }}
                style={S.closeBtn}
              >
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, height: 48, borderWidth: 1.5, borderColor: '#E2E8F0', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10, marginBottom: 14 }}>
              <Search size={16} color="#94A3B8" />
              <TextInput
                placeholder="Search customers…"
                value={customerSearchQuery}
                onChangeText={setCustomerSearchQuery}
                style={{ flex: 1, color: '#1E293B', fontWeight: '600', fontSize: 14 }}
                placeholderTextColor="#CBD5E1"
              />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
              {filteredCustomers.length === 0 ? (
                <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                  <AlertCircle size={32} color="#CBD5E1" />
                  <Text style={{ color: '#94A3B8', fontWeight: '700', marginTop: 10 }}>No customers found</Text>
                </View>
              ) : (
                filteredCustomers.map(cust => {
                  const isSelected = selectedCustomer?._id === cust._id;
                  return (
                    <TouchableOpacity
                      key={cust._id}
                      onPress={() => { setSelectedCustomer(cust); setCustomerModalVisible(false); setCustomerSearchQuery(''); }}
                      style={[S.custItem, isSelected ? S.custItemActive : null]}
                    >
                      <View style={[S.custIcon, isSelected ? S.custIconActive : null]}>
                        <Briefcase size={18} color={isSelected ? '#fff' : '#4F46E5'} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[S.custName, isSelected ? S.custNameActive : null]}>{cust.customerName}</Text>
                        <Text style={S.custSub}>{cust.address || cust.email || 'No additional info'}</Text>
                      </View>
                      {isSelected ? <CheckCircle size={18} color="#4F46E5" /> : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <TouchableOpacity
              onPress={() => setAddCustomerModalVisible(true)}
              style={[S.primaryBtn, { backgroundColor: '#4F46E5', marginTop: 16 }]}
            >
              <Plus size={18} color="#fff" />
              <Text style={S.primaryBtnText}>Add New Customer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ══════════ MODAL: Add Customer ══════════ */}
      <Modal visible={addCustomerModalVisible} transparent animationType="slide">
        <View style={S.overlay}>
          <View style={S.sheet}>
            <View style={S.sheetHandle} />
            <View style={S.sheetRow}>
              <Text style={S.sheetTitle}>Add New Customer</Text>
              <TouchableOpacity onPress={() => setAddCustomerModalVisible(false)} style={S.closeBtn}>
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={S.label}>CUSTOMER NAME *</Text>
              <TextInput
                placeholder="e.g. Acme Corporation"
                value={customerForm.customerName}
                onChangeText={v => setCustomerForm({ ...customerForm, customerName: v })}
                style={S.input}
                placeholderTextColor="#CBD5E1"
              />

              <Text style={S.label}>MOBILE / PHONE</Text>
              <TextInput
                placeholder="Enter phone number"
                value={customerForm.mobile}
                onChangeText={v => setCustomerForm({ ...customerForm, mobile: v })}
                style={S.input}
                placeholderTextColor="#CBD5E1"
                keyboardType="phone-pad"
              />

              <Text style={S.label}>EMAIL ADDRESS</Text>
              <TextInput
                placeholder="Enter email address"
                value={customerForm.email}
                onChangeText={v => setCustomerForm({ ...customerForm, email: v })}
                style={S.input}
                placeholderTextColor="#CBD5E1"
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={S.label}>ADDRESS</Text>
              <TextInput
                placeholder="Enter full address"
                value={customerForm.address}
                onChangeText={v => setCustomerForm({ ...customerForm, address: v })}
                style={S.textArea}
                placeholderTextColor="#CBD5E1"
                multiline
                numberOfLines={2}
                textAlignVertical="top"
              />

              <TouchableOpacity
                onPress={handleAddCustomer}
                disabled={submitting}
                style={[S.primaryBtn, { backgroundColor: submitting ? '#A5B4FC' : '#10B981', marginTop: 4 }]}
              >
                {submitting ? <ActivityIndicator color="#fff" size="small" /> : (
                  <>
                    <CheckCircle size={18} color="#fff" />
                    <Text style={S.primaryBtnText}>Save Customer</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ══════════ MODAL: Full-screen selfie preview ══════════ */}
      <ImagePreviewModal
        visible={previewModalVisible}
        uri={previewImageUri}
        onClose={() => { setPreviewModalVisible(false); setPreviewImageUri(null); }}
      />
    </View>
  );
};

export default CustomerVisitScreen;
