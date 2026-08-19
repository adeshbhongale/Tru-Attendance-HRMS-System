import React, { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../api/axios';
import {
  Alert,
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ArrowRightLeft,
  Building2,
  CalendarCheck,
  CalendarDays,
  CirclePlus,
  Clock,
  FolderTree,
  House as Home,
  LayoutGrid,
  MapPin,
  Package,
  Receipt,
  RotateCcw,
  TrendingUp,
  Truck,
  User,
  Users,
  X,
  ShieldCheck,
} from 'lucide-react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ── HR MODULE ITEMS (Includes Dashboard + all HR sub-features) ──
const ALL_HR_ITEMS = [
  {
    key: 'hrDashboard',
    label: 'Dashboard',
    icon: Home,
    iconColor: '#e91e63',
    bg: '#fdf0f5',
    screen: 'HRScreen',
  },
  {
    key: 'attendance',
    label: 'Attendance',
    icon: CalendarCheck,
    iconColor: '#1972e9',
    bg: '#ebf3fe',
    screen: 'Attendance',
  },
  {
    key: 'shift',
    label: 'Shift',
    icon: Clock,
    iconColor: '#f59e0b',
    bg: '#fff7e6',
    screen: 'Shift',
  },
  {
    key: 'leaves',
    label: 'Leaves',
    icon: CalendarDays,
    iconColor: '#ef4444',
    bg: '#fdeeee',
    screen: 'Leave',
  },
  {
    key: 'leaveApprovals',
    label: 'Leave\nApprovals',
    icon: ShieldCheck,
    iconColor: '#10b981',
    bg: '#e6f7f0',
    screen: 'LeaveApprovals',
  },
  {
    key: 'orgChart',
    label: 'Org Chart',
    icon: FolderTree,
    iconColor: '#7c3aed',
    bg: '#f3e8ff',
    screen: 'OrgChartScreen',
  },
  {
    key: 'profile',
    label: 'Profile',
    icon: User,
    iconColor: '#8b5cf6',
    bg: '#f2edfe',
    screen: 'Profile',
  },
  {
    key: 'monthlyView',
    label: 'Monthly View',
    icon: LayoutGrid,
    iconColor: '#10b981',
    bg: '#e6f7f0',
    screen: 'MonthlyViewScreen',
  },
  {
    key: 'customerVisit',
    label: 'Customer Visit',
    icon: MapPin,
    iconColor: '#e91e63',
    bg: '#fdf0f5',
    screen: 'CustomerVisitScreen',
  },
  {
    key: 'expenseClaim',
    label: 'Expense',
    icon: Receipt,
    iconColor: '#ff9800',
    bg: '#fff3eb',
    screen: 'ExpenseDashboard',
  },
  {
    key: 'reports',
    label: 'Reports',
    icon: TrendingUp,
    iconColor: '#0284c7',
    bg: '#eff6ff',
    screen: 'Reports',
  },
];

// ── MATERIAL MOVEMENT MODULE ITEMS (Includes Dashboard + all Material sub-features) ──
const ALL_MATERIAL_ITEMS = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: Home,
    iconColor: '#4f46e5',
    bg: '#eef2ff',
    screen: 'MaterialDashboard',
  },
  {
    key: 'pending',
    label: 'Pending',
    icon: Clock,
    iconColor: '#d97706',
    bg: '#fef3c7',
    screen: 'PendingTransactionsScreen',
  },
  {
    key: 'transactions',
    label: 'Transactions',
    icon: Package,
    iconColor: '#2563eb',
    bg: '#eff6ff',
    screen: 'MaterialListScreen',
  },
  {
    key: 'create',
    label: 'Create\nRequest',
    icon: CirclePlus,
    iconColor: '#16a34a',
    bg: '#f0fdf4',
    screen: 'MaterialRequestScreen',
  },
  {
    key: 'tree',
    label: 'Materials\nTree',
    icon: FolderTree,
    iconColor: '#9333ea',
    bg: '#f3e8ff',
    screen: 'MaterialsTreeScreen',
  },
  {
    key: 'transfers',
    label: 'Transfers',
    icon: ArrowRightLeft,
    iconColor: '#ea580c',
    bg: '#ffedd5',
    screen: 'TransferListScreen',
  },
  {
    key: 'returns',
    label: 'Returns',
    icon: RotateCcw,
    iconColor: '#dc2626',
    bg: '#fef2f2',
    screen: 'ReturnListScreen',
  },
  {
    key: 'reports',
    label: 'Reports',
    icon: TrendingUp,
    iconColor: '#0d9488',
    bg: '#f0fdfa',
    screen: 'Reports',
    params: { module: 'material' },
  },
];

const BUBBLE_SIZE = 50;
const BUBBLE_HALF = BUBBLE_SIZE / 2;
const RADIUS = 142;
const INITIAL_ROTATION = 0;

/**
 * GlobalAppFooter - Fixed 4-Tab Bottom Footer with Circular Spin Wheel Submenu
 * 
 * @param {object} props
 * @param {object} props.navigation - React Navigation object
 * @param {string} props.currentScreen - Key of current screen
 * @param {'hr' | 'material'} [props.module='hr'] - Active module context
 */
const GlobalAppFooter = ({ navigation, currentScreen, module = 'hr' }) => {
  const [activeModule, setActiveModule] = useState(module);
  const isHrModule = activeModule === 'hr';
  const isMaterialModule = activeModule === 'material';

  const [menuOpen, setMenuOpen] = useState(false);
  const [rotationAngle, setRotationAngle] = useState(INITIAL_ROTATION);

  const overlayAnim = useRef(new Animated.Value(0)).current;
  const menuOpenAnim = useRef(new Animated.Value(0)).current;

  const [canApproveLeaves, setCanApproveLeaves] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const checkReportingStatus = async () => {
      try {
        const userStr = await AsyncStorage.getItem('user');
        if (userStr) {
          const userObj = JSON.parse(userStr);
          const roleLower = (userObj.role || '').toLowerCase();
          const roleCodeUpper = (userObj.roleCode || '').toUpperCase();
          const isManagerRole =
            ['admin', 'superadmin', 'hr', 'manager', 'supervisor', 'head', 'lead', 'tcsa1', 'tcca1'].includes(roleLower) ||
            ['TCSA1', 'TCCA1'].includes(roleCodeUpper);

          if (isManagerRole) {
            if (isMounted) setCanApproveLeaves(true);
            return;
          }
        }

        const res = await api.get('/leaves/approvals');
        const hasSubs = res.data?.hasSubordinates ?? false;
        if (hasSubs && isMounted) {
          setCanApproveLeaves(true);
        } else if (isMounted) {
          setCanApproveLeaves(false);
        }
      } catch (e) {
        if (isMounted) setCanApproveLeaves(false);
      }
    };
    checkReportingStatus();
    return () => {
      isMounted = false;
    };
  }, []);

  // Submenu items
  const rawItems = isHrModule ? ALL_HR_ITEMS : ALL_MATERIAL_ITEMS;
  const menuItems = rawItems.filter((item) => {
    if (item.key === 'leaveApprovals' && !canApproveLeaves) {
      return false;
    }
    return item.key !== currentScreen;
  });
  const totalItems = menuItems.length;

  const ANGLE_STEP = 30;

  // Fixed Anchor X coordinates: HR tab at Tab 1 (12.5%), Material tab at Tab 2 (37.5%)
  const ANCHOR_X = isHrModule ? SCREEN_WIDTH * 0.125 : SCREEN_WIDTH * 0.375;
  const ANCHOR_Y_ABS = SCREEN_HEIGHT - 45;

  // Touch & inertia rotation refs
  const angleRef = useRef(INITIAL_ROTATION);
  const lastTouchAngleRef = useRef(0);
  const lastTimeRef = useRef(0);
  const velocityRef = useRef(0);
  const animFrameRef = useRef(null);
  const isDraggingRef = useRef(false);

  angleRef.current = rotationAngle;

  const updateAngle = (newAngle) => {
    angleRef.current = newAngle;
    setRotationAngle(newAngle);
  };

  const getTouchAngle = (pageX, pageY) => {
    const dx = pageX - ANCHOR_X;
    const dy = pageY - ANCHOR_Y_ABS;
    return (Math.atan2(dy, dx) * 180) / Math.PI;
  };

  const snapToSlot = () => {
    const current = angleRef.current;
    const snappedRelative = Math.round(current / ANGLE_STEP) * ANGLE_STEP;

    const startVal = current;
    const diff = snappedRelative - startVal;
    const duration = 220;
    const startTime = Date.now();

    const animateSnap = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);

      updateAngle(startVal + diff * ease);

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animateSnap);
      }
    };
    animFrameRef.current = requestAnimationFrame(animateSnap);
  };

  const startInertia = () => {
    const friction = 0.93;
    const stopThreshold = 0.01;

    const step = () => {
      if (Math.abs(velocityRef.current) > stopThreshold) {
        const nextAngle = angleRef.current + velocityRef.current * 16;
        velocityRef.current *= friction;
        updateAngle(nextAngle);
        animFrameRef.current = requestAnimationFrame(step);
      } else {
        snapToSlot();
      }
    };
    animFrameRef.current = requestAnimationFrame(step);
  };

  // PanResponder for continuous 360° circular drag spinning
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3,
      onMoveShouldSetPanResponderCapture: (_, gestureState) =>
        Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3,

      onPanResponderGrant: (evt) => {
        isDraggingRef.current = true;
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
        }
        const { pageX, pageY } = evt.nativeEvent;
        lastTouchAngleRef.current = getTouchAngle(pageX, pageY);
        lastTimeRef.current = Date.now();
        velocityRef.current = 0;
      },
      onPanResponderMove: (evt) => {
        if (!isDraggingRef.current) return;
        const { pageX, pageY } = evt.nativeEvent;
        const currentTouchAngle = getTouchAngle(pageX, pageY);
        let delta = currentTouchAngle - lastTouchAngleRef.current;

        // Wrap-around angle correction for continuous smooth 360° rotation
        while (delta > 180) delta -= 360;
        while (delta < -180) delta += 360;

        const newAngle = angleRef.current + delta;
        const now = Date.now();
        const dt = now - lastTimeRef.current;

        if (dt > 0) {
          velocityRef.current = delta / dt;
        }

        lastTouchAngleRef.current = currentTouchAngle;
        lastTimeRef.current = now;

        updateAngle(newAngle);
      },
      onPanResponderRelease: (_, gestureState) => {
        isDraggingRef.current = false;
        if (Math.abs(gestureState.dx) > 6 || Math.abs(gestureState.dy) > 6) {
          startInertia();
        }
      },
      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
      },
    })
  ).current;

  const openMenu = () => {
    setMenuOpen(true);
    updateAngle(INITIAL_ROTATION);

    Animated.parallel([
      Animated.timing(overlayAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.spring(menuOpenAnim, {
        toValue: 1,
        friction: 6,
        tension: 70,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeMenu = (callback) => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    Animated.parallel([
      Animated.timing(overlayAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(menuOpenAnim, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setMenuOpen(false);
      if (callback) callback();
    });
  };

  const handleItemPress = (item) => {
    if (item.comingSoon) {
      closeMenu(() =>
        Alert.alert('Coming Soon', `${item.label.replace('\n', ' ')} will be available soon.`)
      );
      return;
    }
    if (item.screen) {
      closeMenu(() => navigation.navigate(item.screen, item.params || {}));
    }
  };

  return (
    <>
      {/* FULL SCREEN TRANSPARENT MODAL FOR CIRCULAR WHEEL MENU */}
      <Modal
        visible={menuOpen}
        transparent={true}
        animationType="none"
        onRequestClose={() => closeMenu()}
      >
        <View style={StyleSheet.absoluteFillObject}>
          {/* Dim Overlay with PanResponder Gesture Handler */}
          <Animated.View
            {...panResponder.panHandlers}
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: 'rgba(15, 23, 42, 0.55)', zIndex: 98, opacity: overlayAnim },
            ]}
          >
            {/* Tap outside overlay to close */}
            <TouchableOpacity
              activeOpacity={1}
              style={StyleSheet.absoluteFillObject}
              onPress={() => closeMenu()}
            />

            {/* Submenu Icons rendered along circular arc [-162°, -18°] above bottom bar */}
            {menuItems.map((item, index) => {
              const rawOffset = index * ANGLE_STEP + rotationAngle;
              const cyclicOffset = ((rawOffset % 180) + 180) % 180;
              const angleDeg = -162 + (cyclicOffset / 180) * 144;

              const rad = (angleDeg * Math.PI) / 180;
              const x = RADIUS * Math.cos(rad);
              const y = RADIUS * Math.sin(rad);

              const posX = ANCHOR_X + x - BUBBLE_HALF;
              const posY = ANCHOR_Y_ABS + y - BUBBLE_HALF;

              const Icon = item.icon;

              return (
                <Animated.View
                  key={item.key}
                  style={[
                    styles.bubbleWrapper,
                    {
                      left: posX,
                      top: posY,
                      opacity: menuOpenAnim,
                      transform: [{ scale: menuOpenAnim }],
                      zIndex: 100,
                    },
                  ]}
                >
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => handleItemPress(item)}
                    style={styles.bubbleTouchable}
                  >
                    <View style={[styles.bubbleCircle, { backgroundColor: item.bg }]}>
                      <Icon size={19} color={item.iconColor} />
                    </View>
                    <Text style={styles.bubbleLabel} numberOfLines={2}>
                      {item.label}
                    </Text>
                    {item.comingSoon && <Text style={styles.bubbleSoon}>Soon</Text>}
                  </TouchableOpacity>
                </Animated.View>
              );
            })}

            {/* Explicit Close FAB Cross Button inside Modal Layer */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => closeMenu()}
              style={[
                styles.fabButton,
                styles.fabActive,
                {
                  position: 'absolute',
                  left: ANCHOR_X - 24,
                  top: ANCHOR_Y_ABS - 24,
                  zIndex: 102,
                },
              ]}
            >
              <X size={20} color="white" />
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      {/* ── UNIFIED FIXED 4-TAB FOOTER BAR ── */}
      <View style={styles.footer}>
        {/* TAB 1 (FIXED POSITION 1 - LEFT): HR */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              if (menuOpen && isHrModule) {
                closeMenu();
              } else {
                setActiveModule('hr');
                openMenu();
              }
            }}
            style={[styles.fabButton, styles.hrFab, menuOpen && isHrModule && styles.fabActive]}
          >
            {menuOpen && isHrModule ? <X size={20} color="white" /> : <Users size={20} color="white" />}
          </TouchableOpacity>
          <Text style={[styles.footerLabel, isHrModule && menuOpen && { color: '#e91e63', fontWeight: '800' }]}>
            HR
          </Text>
        </View>

        {/* TAB 2 (FIXED POSITION 2): MATERIAL MOVEMENT */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              if (menuOpen && isMaterialModule) {
                closeMenu();
              } else {
                setActiveModule('material');
                openMenu();
              }
            }}
            style={[styles.fabButton, styles.matFab, menuOpen && isMaterialModule && styles.fabActive]}
          >
            {menuOpen && isMaterialModule ? <X size={20} color="white" /> : <Truck size={20} color="white" />}
          </TouchableOpacity>
          <Text style={[styles.footerLabel, isMaterialModule && menuOpen && { color: '#0d9488', fontWeight: '800' }]} numberOfLines={1}>
            Material
          </Text>
        </View>

        {/* TAB 3 (FIXED POSITION 3): DEPARTMENT */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            activeOpacity={0.75}
            style={styles.footerTab}
            onPress={() =>
              Alert.alert('Coming Soon', 'Department module will be available soon.')
            }
          >
            <View style={styles.footerIconBg}>
              <Building2 size={18} color="#8a97a8" />
            </View>
            <Text style={styles.footerLabel}>Department</Text>
            <Text style={styles.soonBadge}>SOON</Text>
          </TouchableOpacity>
        </View>

        {/* TAB 4 (FIXED POSITION 4 - RIGHT): REPORTS */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            activeOpacity={0.75}
            style={styles.footerTab}
            onPress={() => {
              if (currentScreen !== 'Reports') {
                navigation.navigate('Reports');
              }
            }}
          >
            <View style={[styles.footerIconBg, currentScreen === 'Reports' && { backgroundColor: '#eff6ff' }]}>
              <TrendingUp size={18} color={currentScreen === 'Reports' ? '#4f46e5' : '#c9a06a'} />
            </View>
            <Text style={[styles.footerLabel, currentScreen === 'Reports' && { color: '#4f46e5', fontWeight: '800' }]}>
              Reports
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  // ── Footer Bar ──────────────────────────────────────────────
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e8ecf2',
    paddingTop: 6,
    paddingBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 14,
    zIndex: 99,
  },

  tabContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  footerTab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },

  footerIconBg: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#f0f4f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 3,
  },

  footerLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'center',
    letterSpacing: 0.1,
  },

  soonBadge: {
    fontSize: 7.5,
    fontWeight: '800',
    color: '#f59e0b',
    marginTop: 1,
    textAlign: 'center',
    letterSpacing: 0.5,
  },

  // ── FAB Buttons ─────────────────────────────────────────────
  fabButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 3,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },

  hrFab: {
    backgroundColor: '#e91e63',
    shadowColor: '#e91e63',
  },

  matFab: {
    backgroundColor: '#0d9488',
    shadowColor: '#0d9488',
  },

  fabActive: {
    backgroundColor: '#1e293b',
    shadowColor: '#1e293b',
  },

  // ── Circular Wheel Chamber Bubbles ──────────────────────────
  bubbleWrapper: {
    position: 'absolute',
    alignItems: 'center',
    width: BUBBLE_SIZE + 20,
  },

  bubbleTouchable: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  bubbleCircle: {
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.95)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 8,
  },

  bubbleLabel: {
    marginTop: 4,
    fontSize: 9.5,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 11,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  bubbleSoon: {
    marginTop: 1,
    fontSize: 8,
    fontWeight: '800',
    color: '#ffcf6b',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});

export default GlobalAppFooter;
