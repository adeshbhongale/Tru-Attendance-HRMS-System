import * as Location from 'expo-location';
import {
  CheckCircle2,
  MapPin,
  Navigation,
  Settings,
  ShieldCheck,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Alert,
  Image,
  Linking,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const PreLoginPermissionScreen = ({ onPermissionsComplete, onContinueAnyway }) => {
  const [checking, setChecking] = useState(true);
  const [requestingAll, setRequestingAll] = useState(false);
  const [fgStatus, setFgStatus] = useState('undetermined');
  const [bgStatus, setBgStatus] = useState('undetermined');
  const [gpsServicesEnabled, setGpsServicesEnabled] = useState(false);

  const checkStatus = async () => {
    try {
      setChecking(true);

      let curFg = 'undetermined';
      let curBg = 'undetermined';
      let curGps = false;

      // 1. Foreground Location
      if (typeof Location.getForegroundPermissionsAsync === 'function') {
        const fg = await Location.getForegroundPermissionsAsync();
        curFg = fg?.status || 'undetermined';
        setFgStatus(curFg);
      }

      // 2. Background Location
      if (typeof Location.getBackgroundPermissionsAsync === 'function') {
        try {
          const bg = await Location.getBackgroundPermissionsAsync();
          curBg = bg?.status || 'undetermined';
          setBgStatus(curBg);
        } catch (e) {
          setBgStatus('undetermined');
        }
      }

      // 3. Location Services (GPS Provider Hardware)
      if (typeof Location.hasServicesEnabledAsync === 'function') {
        const gps = await Location.hasServicesEnabledAsync();
        curGps = !!gps;
        setGpsServicesEnabled(curGps);
      }

      // Auto-advance if required foreground location permission and GPS are granted
      if (curFg === 'granted' && curGps) {
        if (onPermissionsComplete) {
          onPermissionsComplete();
        }
      }
    } catch (err) {
      console.warn('[PreLoginPermissionScreen] Check error:', err?.message);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkStatus();

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        checkStatus();
      }
    });

    return () => {
      sub.remove();
    };
  }, []);

  // Request foreground location permission after user accepts the standalone Location Prominent Disclosure.
  // Background location ("Allow all the time") is requested only after login when starting an active shift or field route.
  const handleGrantAllPermissions = async () => {
    try {
      setRequestingAll(true);

      // 1. Request Foreground Location first
      let fgResult = null;
      try {
        fgResult = await Location.requestForegroundPermissionsAsync();
        setFgStatus(fgResult?.status || 'denied');
      } catch (e) {
        console.warn('[PreLoginPermissionScreen] FG request failed:', e?.message);
      }

      // 2. Check Location Services
      if (typeof Location.hasServicesEnabledAsync === 'function') {
        const gps = await Location.hasServicesEnabledAsync();
        setGpsServicesEnabled(!!gps);
      }

      await checkStatus();

      if (fgResult?.status === 'granted') {
        if (onPermissionsComplete) {
          onPermissionsComplete();
        }
      } else {
        Alert.alert(
          'Location Permission Required',
          'Gatimaan requires location access to verify attendance punch-in/out within your office geofence.',
          [
            {
              text: 'Not Now',
              style: 'cancel',
              onPress: () => {
                if (onContinueAnyway) onContinueAnyway();
              },
            },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
      }
    } catch (err) {
      console.warn('[PreLoginPermissionScreen] Consent error:', err?.message);
    } finally {
      setRequestingAll(false);
    }
  };

  const handleOpenAppSettings = () => {
    try {
      Linking.openSettings();
    } catch (e) {
      Alert.alert('Settings', 'Please open your device Settings ➔ Apps ➔ Gatimaan.');
    }
  };

  const isForegroundGranted = fgStatus === 'granted';
  const isBackgroundGranted = bgStatus === 'granted';
  const isAllGranted = isForegroundGranted && gpsServicesEnabled;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* Header Banner — Prominent Disclosure */}
      <View style={styles.header}>
        <Image
          source={require('../../assets/favicon.png')}
          style={{ width: 72, height: 72, marginBottom: 8 }}
          resizeMode="contain"
        />
        <Text style={styles.headerTitle}>Location Disclosure</Text>
        <Text style={styles.headerSubtitle}>Gatimaan Enterprise</Text>
        <Text style={styles.headerDesc}>
          Gatimaan collects location data to enable attendance geofence verification, live field route tracking, and customer visit logging even when the app is closed or not in use.
        </Text>
      </View>

      {/* Main Content Area */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.cardsContainer}>
          {/* Card 1: Foreground GPS Location */}
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
                Captures accurate GPS coordinates during attendance punch-in/out and customer visits.
              </Text>
            </View>
          </View>

          {/* Card 2: Background Location Disclosure */}
          <View style={styles.permissionCard}>
            <View style={[styles.iconBox, { backgroundColor: '#f0fdf4' }]}>
              <Navigation size={22} color="#059669" />
            </View>
            <View style={styles.cardContent}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>Background Location</Text>
                {isBackgroundGranted ? (
                  <View style={styles.badgeSuccess}>
                    <Text style={styles.badgeSuccessText}>Granted</Text>
                  </View>
                ) : (
                  <View style={styles.badgeWarning}>
                    <Text style={styles.badgeWarningText}>Required for Duty</Text>
                  </View>
                )}
              </View>
              <Text style={styles.cardDesc}>
                Gatimaan collects location data in the background while you are punched in on duty to record field routes and geofence compliance even when the app is closed or not in use. Tracking stops automatically when you punch out.
              </Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.bottomSection}>
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
                <ShieldCheck size={20} color="#ffffff" />
                <Text style={styles.primaryActionBtnText}>Accept &amp; Continue</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleOpenAppSettings}
            style={styles.settingsBtn}
          >
            <Settings size={16} color="#475569" />
            <Text style={styles.settingsBtnText}>Open Device App Settings</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              if (onContinueAnyway) onContinueAnyway();
              else if (onPermissionsComplete) onPermissionsComplete();
            }}
            style={styles.skipBtn}
          >
            <Text style={styles.skipBtnText}>Not Now — Proceed to Login Screen →</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => Linking.openURL('https://www.gatimaan.io/privacy-policy')}
            style={{ alignItems: 'center', paddingVertical: 4 }}
          >
            <Text style={{ color: '#4f46e5', fontSize: 11, fontWeight: '700', textDecorationLine: 'underline' }}>
              Read Privacy Policy
            </Text>
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
    color: '#cbd5e1',
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
