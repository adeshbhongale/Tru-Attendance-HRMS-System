import * as Location from 'expo-location';
import {
  AlertTriangle,
  Battery,
  BatteryCharging,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Info,
  Layers,
  Lock,
  MapPin,
  Navigation,
  Radio,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const OEM_GUIDES = [
  {
    id: 'standard',
    brand: 'Standard Android / Pixel / Moto / Nothing',
    icon: '📱',
    steps: [
      'Open phone Settings ➔ Apps ➔ Geo-Track HRMS.',
      'Tap App battery usage (or Battery).',
      'Select "Unrestricted" (instead of "Optimized" or "Restricted").',
    ],
  },
  {
    id: 'samsung',
    brand: 'Samsung Galaxy (One UI)',
    icon: '📱',
    steps: [
      'Open Settings ➔ Apps ➔ Geo-Track HRMS.',
      'Tap Battery ➔ Choose "Unrestricted".',
      'Go to Settings ➔ Battery and device care ➔ Battery ➔ Background usage limits.',
      'Tap Never sleeping apps ➔ Tap (+) and add Geo-Track HRMS.',
    ],
  },
  {
    id: 'xiaomi',
    brand: 'Xiaomi / Redmi / POCO (MIUI / HyperOS)',
    icon: '📱',
    steps: [
      'Open Settings ➔ Apps ➔ Manage apps ➔ Geo-Track HRMS.',
      'Enable Autostart (toggle switch to ON).',
      'Scroll down and tap Battery saver ➔ Select "No restrictions".',
    ],
  },
  {
    id: 'vivo',
    brand: 'Vivo / iQOO (Funtouch OS)',
    icon: '📱',
    steps: [
      'Open Settings ➔ Battery ➔ Background power consumption management.',
      'Find Geo-Track HRMS and select "High background power usage" or "Do not restrict".',
      'Go to Settings ➔ Apps & permissions ➔ Autostart ➔ Enable for Geo-Track HRMS.',
    ],
  },
  {
    id: 'oppo',
    brand: 'Oppo / Realme / OnePlus (ColorOS / OxygenOS)',
    icon: '📱',
    steps: [
      'Open Settings ➔ Apps ➔ App management ➔ Geo-Track HRMS.',
      'Tap Battery usage ➔ Turn ON "Allow background activity".',
      'Turn ON "Allow auto-launch" & "Allow foreground activity".',
    ],
  },
];

const PreLoginPermissionScreen = ({ onPermissionsComplete, onContinueAnyway }) => {
  const [checking, setChecking] = useState(true);
  const [fgStatus, setFgStatus] = useState('undetermined');
  const [bgStatus, setBgStatus] = useState('undetermined');
  const [gpsServicesEnabled, setGpsServicesEnabled] = useState(false);
  const [activeOemTab, setActiveOemTab] = useState('standard');
  const [activeStepTab, setActiveStepTab] = useState(1);

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

      // 3. Location Services (GPS Provider)
      if (typeof Location.hasServicesEnabledAsync === 'function') {
        const gps = await Location.hasServicesEnabledAsync();
        setGpsServicesEnabled(!!gps);
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

  const handleRequestLocation = async () => {
    try {
      setChecking(true);

      // Step 1: Foreground
      let fgResult = await Location.requestForegroundPermissionsAsync();
      setFgStatus(fgResult?.status || 'denied');

      if (fgResult?.status !== 'granted') {
        Alert.alert(
          'Location Permission Required',
          'Attendance tracking requires location access. Please tap "Open Settings", then Permissions ➔ Location ➔ "Allow all the time".',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        setChecking(false);
        return;
      }

      // Step 2: Background ("Allow all the time")
      if (typeof Location.requestBackgroundPermissionsAsync === 'function') {
        try {
          const bgResult = await Location.requestBackgroundPermissionsAsync();
          setBgStatus(bgResult?.status || 'denied');

          if (bgResult?.status !== 'granted') {
            Alert.alert(
              'Set Location to "Allow All The Time"',
              'Android requires you to manually choose "Allow all the time" in App Settings so GPS tracking remains active while the screen is off in your pocket.\n\nTap "Open Settings" ➔ Permissions ➔ Location ➔ Select "Allow all the time".',
              [
                { text: 'Later', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings() },
              ]
            );
          }
        } catch (bgErr) {
          console.warn('[PreLoginPermissionScreen] Background prompt note:', bgErr?.message);
          Alert.alert(
            'Action Required in Settings',
            'Please open App Settings ➔ Permissions ➔ Location ➔ Choose "Allow all the time".',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ]
          );
        }
      }

      await checkStatus();
    } catch (err) {
      console.warn('[PreLoginPermissionScreen] Request error:', err);
    } finally {
      setChecking(false);
    }
  };

  const handleOpenAppSettings = () => {
    try {
      Linking.openSettings();
    } catch (e) {
      Alert.alert('Settings', 'Please open your phone Settings ➔ Apps ➔ Geo-Track HRMS.');
    }
  };

  const isAllGood = fgStatus === 'granted' && bgStatus === 'granted' && gpsServicesEnabled;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* Header Banner */}
      <View style={styles.header}>
        <View style={styles.headerIconContainer}>
          <ShieldCheck size={28} color="#ffffff" />
        </View>
        <Text style={styles.headerTitle}>Geo-Track HRMS</Text>
        <Text style={styles.headerSubtitle}>Device &amp; GPS Setup Checklist</Text>
        <Text style={styles.headerDesc}>
          Complete the 4 steps below to ensure accurate 5-second raw GPS tracking when your screen is locked.
        </Text>
      </View>

      {/* Main Content ScrollView */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Live Diagnostics Card */}
        <View style={styles.diagCard}>
          <View style={styles.diagHeader}>
            <Text style={styles.diagTitle}>Live Diagnostic Status</Text>
            <TouchableOpacity onPress={checkStatus} style={styles.refreshBtn}>
              {checking ? (
                <ActivityIndicator size="small" color="#6366f1" />
              ) : (
                <RefreshCw size={14} color="#6366f1" />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.diagGrid}>
            {/* Foreground */}
            <View style={styles.diagItem}>
              <Text style={styles.diagLabel}>Foreground GPS</Text>
              <View style={[styles.badge, fgStatus === 'granted' ? styles.badgeSuccess : styles.badgeWarning]}>
                <Text style={[styles.badgeText, fgStatus === 'granted' ? styles.badgeSuccessText : styles.badgeWarningText]}>
                  {fgStatus === 'granted' ? '✓ Granted' : '⚠️ Missing'}
                </Text>
              </View>
            </View>

            {/* Background */}
            <View style={styles.diagItem}>
              <Text style={styles.diagLabel}>Background (Always)</Text>
              <View style={[styles.badge, bgStatus === 'granted' ? styles.badgeSuccess : styles.badgeDanger]}>
                <Text style={[styles.badgeText, bgStatus === 'granted' ? styles.badgeSuccessText : styles.badgeDangerText]}>
                  {bgStatus === 'granted' ? '✓ Allow All Time' : '⚠️ Pending'}
                </Text>
              </View>
            </View>

            {/* GPS Hardware */}
            <View style={styles.diagItem}>
              <Text style={styles.diagLabel}>Location Services</Text>
              <View style={[styles.badge, gpsServicesEnabled ? styles.badgeSuccess : styles.badgeWarning]}>
                <Text style={[styles.badgeText, gpsServicesEnabled ? styles.badgeSuccessText : styles.badgeWarningText]}>
                  {gpsServicesEnabled ? '✓ Enabled' : '⚠️ Turn ON'}
                </Text>
              </View>
            </View>

            {/* Battery Mode */}
            <View style={styles.diagItem}>
              <Text style={styles.diagLabel}>Battery Restriction</Text>
              <View style={[styles.badge, styles.badgeInfo]}>
                <Text style={[styles.badgeText, styles.badgeInfoText]}>
                  Set "Unrestricted"
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* STEP 1 CARD */}
        <View style={styles.stepCard}>
          <View style={styles.stepHeader}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>STEP 1</Text>
            </View>
            <Text style={styles.stepTitle}>Set Location to "Allow all the time"</Text>
          </View>

          <Text style={styles.stepDesc}>
            By default, Android selects "While using the app", which turns off GPS immediately when your screen is locked.
          </Text>

          <View style={styles.instructionBox}>
            <Text style={styles.instructionStep}>1. Long-press the <Text style={styles.boldText}>Geo-Track HRMS</Text> app icon.</Text>
            <Text style={styles.instructionStep}>2. Tap <Text style={styles.boldText}>App info (ⓘ)</Text> ➔ <Text style={styles.boldText}>Permissions ➔ Location</Text>.</Text>
            <Text style={styles.instructionStep}>3. Choose <Text style={[styles.boldText, { color: '#059669' }]}>"Allow all the time"</Text>.</Text>
            <Text style={styles.instructionStep}>4. Toggle ON <Text style={styles.boldText}>"Use precise location"</Text> (High Accuracy).</Text>
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleRequestLocation}
              style={[styles.actionBtn, { backgroundColor: '#4f46e5' }]}
            >
              <MapPin size={16} color="#ffffff" />
              <Text style={styles.actionBtnText}>Grant Location Permission</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleOpenAppSettings}
              style={[styles.actionBtnSecondary, { borderColor: '#c7d2fe' }]}
            >
              <Settings size={15} color="#4f46e5" />
              <Text style={[styles.actionBtnSecondaryText, { color: '#4f46e5' }]}>Open App Settings</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* STEP 2 CARD: BATTERY UNRESTRICTED */}
        <View style={styles.stepCard}>
          <View style={styles.stepHeader}>
            <View style={[styles.stepBadge, { backgroundColor: '#ea580c' }]}>
              <Text style={styles.stepBadgeText}>STEP 2</Text>
            </View>
            <Text style={styles.stepTitle}>Set Battery Usage to "Unrestricted"</Text>
          </View>

          <Text style={styles.stepDesc}>
            This prevents Android's aggressive Doze Mode from killing the GPS background service while in your pocket.
          </Text>

          {/* OEM Brand Tabs */}
          <Text style={styles.subHeading}>Select your Phone Brand for step-by-step guide:</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.oemTabsRow}
          >
            {OEM_GUIDES.map((oem) => {
              const isSelected = activeOemTab === oem.id;
              return (
                <TouchableOpacity
                  key={oem.id}
                  onPress={() => setActiveOemTab(oem.id)}
                  style={[
                    styles.oemTab,
                    isSelected && styles.oemTabSelected,
                  ]}
                >
                  <Text style={[styles.oemTabText, isSelected && styles.oemTabTextSelected]}>
                    {oem.brand}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Active OEM Guide Box */}
          {(() => {
            const currentOem = OEM_GUIDES.find((g) => g.id === activeOemTab) || OEM_GUIDES[0];
            return (
              <View style={styles.instructionBox}>
                <Text style={styles.oemBoxTitle}>{currentOem.brand} Instructions:</Text>
                {currentOem.steps.map((step, idx) => (
                  <Text key={idx} style={styles.instructionStep}>
                    {idx + 1}. {step}
                  </Text>
                ))}
              </View>
            );
          })()}

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleOpenAppSettings}
            style={[styles.actionBtn, { backgroundColor: '#ea580c', marginTop: 10 }]}
          >
            <BatteryCharging size={16} color="#ffffff" />
            <Text style={styles.actionBtnText}>Open Battery Settings</Text>
          </TouchableOpacity>
        </View>

        {/* STEP 3 CARD: HIGH ACCURACY GPS */}
        <View style={styles.stepCard}>
          <View style={styles.stepHeader}>
            <View style={[styles.stepBadge, { backgroundColor: '#0284c7' }]}>
              <Text style={styles.stepBadgeText}>STEP 3</Text>
            </View>
            <Text style={styles.stepTitle}>Verify High-Accuracy GPS</Text>
          </View>

          <Text style={styles.stepDesc}>
            Ensure Google Location Accuracy (Enhanced Location Accuracy) is turned ON:
          </Text>

          <View style={styles.instructionBox}>
            <Text style={styles.instructionStep}>1. Open phone <Text style={styles.boldText}>Settings ➔ Location</Text>.</Text>
            <Text style={styles.instructionStep}>2. Tap <Text style={styles.boldText}>Location services ➔ Google Location Accuracy</Text>.</Text>
            <Text style={styles.instructionStep}>3. Ensure the switch is toggled <Text style={[styles.boldText, { color: '#059669' }]}>ON</Text>.</Text>
          </View>
        </View>

        {/* STEP 4 CARD: VERIFICATION */}
        <View style={[styles.stepCard, { borderColor: '#a7f3d0', backgroundColor: '#f0fdf4' }]}>
          <View style={styles.stepHeader}>
            <View style={[styles.stepBadge, { backgroundColor: '#059669' }]}>
              <Text style={styles.stepBadgeText}>STEP 4</Text>
            </View>
            <Text style={styles.stepTitle}>How to Know Tracking is Active</Text>
          </View>

          <View style={{ gap: 8, marginTop: 6 }}>
            <View style={styles.bulletRow}>
              <CheckCircle2 size={16} color="#059669" style={{ marginTop: 2 }} />
              <Text style={styles.bulletText}>
                When you punch in, a persistent notification titled <Text style={styles.boldText}>"Geo-Track HRMS — Tracking active until punch out"</Text> will stay in your top notification tray.
              </Text>
            </View>

            <View style={styles.bulletRow}>
              <CheckCircle2 size={16} color="#059669" style={{ marginTop: 2 }} />
              <Text style={styles.bulletText}>
                The app will transmit raw GPS pings <Text style={styles.boldText}>every 5 seconds</Text> continuously without dropping street routes while the screen is locked.
              </Text>
            </View>
          </View>
        </View>

        {/* Bottom Actions */}
        <View style={styles.bottomSection}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onPermissionsComplete}
            style={styles.primaryContinueBtn}
          >
            <Text style={styles.primaryContinueBtnText}>
              {isAllGood ? '✓ Setup Complete — Proceed to Login' : 'Proceed to Login'}
            </Text>
            <ChevronRight size={18} color="#ffffff" />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onContinueAnyway}
            style={styles.skipBtn}
          >
            <Text style={styles.skipBtnText}>I will configure settings later</Text>
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
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    alignItems: 'center',
  },
  headerIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  headerTitle: {
    fontSize: 20,
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
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 16,
    paddingHorizontal: 10,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
  },
  diagCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  diagHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  diagTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#1e293b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  refreshBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  diagGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  diagItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  diagLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 4,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  badgeSuccess: {
    backgroundColor: '#dcfce7',
  },
  badgeSuccessText: {
    color: '#15803d',
    fontSize: 10,
    fontWeight: '800',
  },
  badgeWarning: {
    backgroundColor: '#fef3c7',
  },
  badgeWarningText: {
    color: '#b45309',
    fontSize: 10,
    fontWeight: '800',
  },
  badgeDanger: {
    backgroundColor: '#fee2e2',
  },
  badgeDangerText: {
    color: '#b91c1c',
    fontSize: 10,
    fontWeight: '800',
  },
  badgeInfo: {
    backgroundColor: '#e0e7ff',
  },
  badgeInfoText: {
    color: '#4338ca',
    fontSize: 10,
    fontWeight: '800',
  },
  stepCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  stepBadge: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  stepBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  stepTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0f172a',
    flex: 1,
  },
  stepDesc: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    lineHeight: 16,
    marginBottom: 10,
  },
  subHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 6,
  },
  instructionBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#4f46e5',
    gap: 5,
    marginBottom: 12,
  },
  instructionStep: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
    lineHeight: 16,
  },
  boldText: {
    fontWeight: '800',
    color: '#0f172a',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  actionBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: '#ffffff',
  },
  actionBtnSecondaryText: {
    fontSize: 11,
    fontWeight: '800',
  },
  oemTabsRow: {
    gap: 6,
    paddingBottom: 8,
  },
  oemTab: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  oemTabSelected: {
    backgroundColor: '#ea580c',
    borderColor: '#ea580c',
  },
  oemTabText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
  },
  oemTabTextSelected: {
    color: '#ffffff',
  },
  oemBoxTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#ea580c',
    marginBottom: 4,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bulletText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#065f46',
    flex: 1,
    lineHeight: 16,
  },
  bottomSection: {
    gap: 10,
    marginTop: 8,
  },
  primaryContinueBtn: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  primaryContinueBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  skipBtnText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
  },
});

export default PreLoginPermissionScreen;
