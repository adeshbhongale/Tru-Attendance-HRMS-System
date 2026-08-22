import * as Location from 'expo-location';
import {
  AlertTriangle,
  BatteryCharging,
  Bell,
  CheckCircle2,
  ChevronRight,
  MapPin,
  Navigation,
  RefreshCw,
  Settings,
  ShieldCheck,
  Zap
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

let Notifications = null;
try {
  Notifications = require('expo-notifications');
} catch (e) {
  // Graceful fallback if expo-notifications is not available
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PreLoginPermissionScreen = ({ onPermissionsComplete, onContinueAnyway }) => {
  const [checking, setChecking] = useState(true);
  const [requestingAll, setRequestingAll] = useState(false);
  const [fgStatus, setFgStatus] = useState('undetermined');
  const [bgStatus, setBgStatus] = useState('undetermined');
  const [notifStatus, setNotifStatus] = useState('undetermined');
  const [gpsServicesEnabled, setGpsServicesEnabled] = useState(false);

  const checkStatus = async () => {
    try {
      setChecking(true);

      // 1. Foreground Location
      if (typeof Location.getForegroundPermissionsAsync === 'function') {
        const fg = await Location.getForegroundPermissionsAsync();
        setFgStatus(fg?.status || 'undetermined');
      }

      // 2. Background Location
      if (typeof Location.getBackgroundPermissionsAsync === 'function') {
        try {
          const bg = await Location.getBackgroundPermissionsAsync();
          setBgStatus(bg?.status || 'undetermined');
        } catch (e) {
          setBgStatus('undetermined');
        }
      }

      // 3. Location Services (GPS Provider Hardware)
      if (typeof Location.hasServicesEnabledAsync === 'function') {
        const gps = await Location.hasServicesEnabledAsync();
        setGpsServicesEnabled(!!gps);
      }

      // 4. Notifications
      if (Notifications && typeof Notifications.getPermissionsAsync === 'function') {
        try {
          const notif = await Notifications.getPermissionsAsync();
          setNotifStatus(notif?.status || 'undetermined');
        } catch (e) {
          setNotifStatus('undetermined');
        }
      } else {
        setNotifStatus('granted');
      }
    } catch (err) {
      console.warn('[PreLoginPermissionScreen] Check error:', err?.message);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  // Master handler: Directly request all permissions sequentially
  const handleGrantAllPermissions = async () => {
    try {
      setRequestingAll(true);

      // 1. Request Foreground Location
      let fgResult = null;
      try {
        fgResult = await Location.requestForegroundPermissionsAsync();
        setFgStatus(fgResult?.status || 'denied');
      } catch (e) {
        console.warn('[PreLoginPermissionScreen] FG request failed:', e?.message);
      }

      // 2. Request Background Location ("Allow all the time")
      let bgResult = null;
      if (typeof Location.requestBackgroundPermissionsAsync === 'function') {
        try {
          bgResult = await Location.requestBackgroundPermissionsAsync();
          setBgStatus(bgResult?.status || 'denied');
        } catch (bgErr) {
          console.warn('[PreLoginPermissionScreen] BG request note:', bgErr?.message);
        }
      }

      // 3. Request Notifications
      if (Notifications && typeof Notifications.requestPermissionsAsync === 'function') {
        try {
          const notifResult = await Notifications.requestPermissionsAsync();
          setNotifStatus(notifResult?.status || 'denied');
        } catch (notifErr) {
          console.warn('[PreLoginPermissionScreen] Notif request error:', notifErr?.message);
        }
      }

      // 4. Check Location Services
      if (typeof Location.hasServicesEnabledAsync === 'function') {
        const gps = await Location.hasServicesEnabledAsync();
        setGpsServicesEnabled(!!gps);
      }

      // Re-verify latest status
      await checkStatus();

      // If foreground is granted, auto-advance or prompt for background if needed
      if (fgResult?.status === 'granted') {
        if (bgResult?.status === 'granted' || Platform.OS !== 'android') {
          if (onPermissionsComplete) {
            onPermissionsComplete();
          }
        } else {
          Alert.alert(
            'Background Location Access',
            'To track attendance when your screen is locked, please set Location to "Allow all the time" in App Settings.',
            [
              { text: 'Later', onPress: () => onPermissionsComplete && onPermissionsComplete(), style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ]
          );
        }
      } else {
        Alert.alert(
          'Location Permission Required',
          'Attendance tracking requires location access. Please tap "Open Settings" and enable Location permission.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
      }
    } catch (err) {
      console.warn('[PreLoginPermissionScreen] Grant all error:', err?.message);
    } finally {
      setRequestingAll(false);
    }
  };

  const handleOpenAppSettings = () => {
    try {
      Linking.openSettings();
    } catch (e) {
      Alert.alert('Settings', 'Please open your device Settings ➔ Apps ➔ Geo-Track HRMS.');
    }
  };

  const isForegroundGranted = fgStatus === 'granted';
  const isBackgroundGranted = bgStatus === 'granted';
  const isAllGranted = isForegroundGranted && isBackgroundGranted && gpsServicesEnabled;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* Header Banner */}
      <View style={styles.header}>
        <View style={styles.headerIconContainer}>
          <ShieldCheck size={32} color="#ffffff" />
        </View>
        <Text style={styles.headerTitle}>Permissions &amp; Services</Text>
        <Text style={styles.headerSubtitle}>Geo-Track HRMS Enterprise</Text>
        <Text style={styles.headerDesc}>
          Grant the required permissions below to enable continuous real-time GPS tracking and instant attendance sync.
        </Text>
      </View>

      {/* Main Content Area */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Permission Feature Cards */}
        <View style={styles.cardsContainer}>
          {/* Card 1: Precise GPS Location */}
          <View style={styles.permissionCard}>
            <View style={[styles.iconBox, { backgroundColor: '#eef2ff' }]}>
              <MapPin size={22} color="#4f46e5" />
            </View>
            <View style={styles.cardContent}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>Foreground Location</Text>
                {isForegroundGranted ? (
                  <View style={styles.badgeSuccess}>
                    <Text style={styles.badgeSuccessText}>Granted</Text>
                  </View>
                ) : (
                  <View style={styles.badgeWarning}>
                    <Text style={styles.badgeWarningText}>Required</Text>
                  </View>
                )}
              </View>
              <Text style={styles.cardDesc}>
                Captures accurate GPS coordinates during punch in/out and customer visits.
              </Text>
            </View>
          </View>

          {/* Card 2: Background "Allow All The Time" */}
          <View style={styles.permissionCard}>
            <View style={[styles.iconBox, { backgroundColor: '#f0fdf4' }]}>
              <Navigation size={22} color="#059669" />
            </View>
            <View style={styles.cardContent}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>Background GPS Tracking</Text>
                {isBackgroundGranted ? (
                  <View style={styles.badgeSuccess}>
                    <Text style={styles.badgeSuccessText}>Always Active</Text>
                  </View>
                ) : (
                  <View style={styles.badgeWarning}>
                    <Text style={styles.badgeWarningText}>Pending</Text>
                  </View>
                )}
              </View>
              <Text style={styles.cardDesc}>
                Maintains continuous tracking while on duty even when the phone screen is locked.
              </Text>
            </View>
          </View>

          {/* Card 3: Battery & Background Sync */}
          <View style={styles.permissionCard}>
            <View style={[styles.iconBox, { backgroundColor: '#fff7ed' }]}>
              <BatteryCharging size={22} color="#ea580c" />
            </View>
            <View style={styles.cardContent}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>Battery Optimization</Text>
                <View style={styles.badgeInfo}>
                  <Text style={styles.badgeInfoText}>Unrestricted</Text>
                </View>
              </View>
              <Text style={styles.cardDesc}>
                Prevents the OS battery saver from putting the GPS background sync service to sleep.
              </Text>
            </View>
          </View>

          {/* Card 4: Push Notifications */}
          <View style={styles.permissionCard}>
            <View style={[styles.iconBox, { backgroundColor: '#f5f3ff' }]}>
              <Bell size={22} color="#7c3aed" />
            </View>
            <View style={styles.cardContent}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>Real-Time Notifications</Text>
                {notifStatus === 'granted' ? (
                  <View style={styles.badgeSuccess}>
                    <Text style={styles.badgeSuccessText}>Enabled</Text>
                  </View>
                ) : (
                  <View style={styles.badgeNeutral}>
                    <Text style={styles.badgeNeutralText}>Optional</Text>
                  </View>
                )}
              </View>
              <Text style={styles.cardDesc}>
                Displays persistent duty status notification and shift/leave approval alerts.
              </Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.bottomSection}>
          {/* Master Grant All Button */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleGrantAllPermissions}
            disabled={requestingAll}
            style={[styles.primaryActionBtn, isAllGranted && styles.primaryActionBtnSuccess]}
          >
            {requestingAll ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : isAllGranted ? (
              <>
                <CheckCircle2 size={20} color="#ffffff" />
                <Text style={styles.primaryActionBtnText}>All Permissions Granted — Continue</Text>
              </>
            ) : (
              <>
                <Zap size={20} color="#ffffff" />
                <Text style={styles.primaryActionBtnText}>Grant All Permissions</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Open App Settings Button */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleOpenAppSettings}
            style={styles.settingsBtn}
          >
            <Settings size={16} color="#475569" />
            <Text style={styles.settingsBtnText}>Open Device App Settings</Text>
          </TouchableOpacity>

          {/* Skip / Continue Anyway */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onContinueAnyway || onPermissionsComplete}
            style={styles.skipBtn}
          >
            <Text style={styles.skipBtnText}>Proceed to Login Screen ➔</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    backgroundColor: '#0f172a',
    paddingTop: 52,
    paddingBottom: 24,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    alignItems: 'center',
  },
  headerIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#818cf8',
    marginTop: 2,
  },
  headerDesc: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 36,
    gap: 16,
  },
  cardsContainer: {
    gap: 12,
  },
  permissionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    gap: 14,
  },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  cardDesc: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    lineHeight: 15,
  },
  badgeSuccess: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeSuccessText: {
    color: '#15803d',
    fontSize: 10,
    fontWeight: '800',
  },
  badgeWarning: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeWarningText: {
    color: '#b45309',
    fontSize: 10,
    fontWeight: '800',
  },
  badgeInfo: {
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeInfoText: {
    color: '#4338ca',
    fontSize: 10,
    fontWeight: '800',
  },
  badgeNeutral: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeNeutralText: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '800',
  },
  bottomSection: {
    gap: 10,
    marginTop: 8,
  },
  primaryActionBtn: {
    backgroundColor: '#4f46e5',
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  primaryActionBtnSuccess: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
  },
  primaryActionBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  settingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  settingsBtnText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '800',
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  skipBtnText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
  },
});

export default PreLoginPermissionScreen;
