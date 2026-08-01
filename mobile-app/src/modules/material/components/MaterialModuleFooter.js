import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowRightLeft,
  Building2,
  CirclePlus,
  Clock,
  FolderTree,
  House as Home,
  Package,
  RotateCcw,
  TrendingUp,
  Truck,
  Users,
  X,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// All Material Movement module items
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
];

const BUBBLE_SIZE = 54;
const BUBBLE_HALF = BUBBLE_SIZE / 2;
const RADIUS = 145;
const INITIAL_ROTATION = -90; // Top 12 o'clock

/**
 * MaterialModuleFooter - Bullet Chamber Circular Spin Wheel Navigation
 */
const MaterialModuleFooter = ({ navigation, currentScreen }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [btnLayout, setBtnLayout] = useState(null);
  const [rotationAngle, setRotationAngle] = useState(INITIAL_ROTATION);

  const overlayAnim = useRef(new Animated.Value(0)).current;
  const menuOpenAnim = useRef(new Animated.Value(0)).current;

  // Items to show in circular menu
  const menuItems = ALL_MATERIAL_ITEMS.filter((item) => item.key !== currentScreen);
  const totalItems = menuItems.length;
  const ANGLE_STEP = 360 / Math.max(totalItems, 1);

  const footerHeight = 72;
  const ANCHOR_X = btnLayout ? btnLayout.x + btnLayout.width / 2 : 44;
  const ANCHOR_Y_ABS = SCREEN_HEIGHT - (footerHeight / 2) - 8;

  // Refs for tracking touch rotation & inertia spin
  const angleRef = useRef(INITIAL_ROTATION);
  const lastTouchAngleRef = useRef(0);
  const lastTimeRef = useRef(0);
  const velocityRef = useRef(0);
  const animFrameRef = useRef(null);
  const isDraggingRef = useRef(false);

  // Keep angleRef synced with state
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
    const relativeAngle = current - INITIAL_ROTATION;
    const snappedRelative = Math.round(relativeAngle / ANGLE_STEP) * ANGLE_STEP;
    const target = snappedRelative + INITIAL_ROTATION;

    const startVal = current;
    const diff = target - startVal;
    const duration = 250;
    const startTime = Date.now();

    const animateSnap = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3); // Cubic ease out

      updateAngle(startVal + diff * ease);

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animateSnap);
      }
    };
    animFrameRef.current = requestAnimationFrame(animateSnap);
  };

  const startInertia = () => {
    const friction = 0.94;
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

  // PanResponder for full-screen circular spin gesture
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2,
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
      onPanResponderMove: (evt, gestureState) => {
        if (!isDraggingRef.current) return;
        const { pageX, pageY } = evt.nativeEvent;
        const currentTouchAngle = getTouchAngle(pageX, pageY);
        let delta = currentTouchAngle - lastTouchAngleRef.current;

        // Wrap-around angle correction
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;

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
        if (Math.abs(gestureState.dx) < 6 && Math.abs(gestureState.dy) < 6) {
          // It was a tap
          return;
        }
        startInertia();
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
      closeMenu(() => navigation.navigate(item.screen));
    }
  };

  return (
    <>
      {/* Dim overlay with PanResponder for circular wheel spin gesture */}
      {menuOpen && (
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 98, opacity: overlayAnim },
          ]}
        >
          <TouchableWithoutFeedback onPress={() => closeMenu()}>
            <View style={StyleSheet.absoluteFillObject} />
          </TouchableWithoutFeedback>
        </Animated.View>
      )}

      {/* Circular Spin Wheel Chamber Items */}
      {menuOpen &&
        menuItems.map((item, index) => {
          const angleDeg = rotationAngle + index * ANGLE_STEP;
          const rad = (angleDeg * Math.PI) / 180;

          const x = RADIUS * Math.cos(rad);
          const y = RADIUS * Math.sin(rad);

          // Calculate normalized world angle to filter visible top arc
          let worldAngle = angleDeg % 360;
          if (worldAngle < -180) worldAngle += 360;
          if (worldAngle > 180) worldAngle -= 360;

          // Upper arc hemisphere (top visible semi-circle above nav bar)
          const isVisible = worldAngle > -175 && worldAngle < -5;

          const posX = ANCHOR_X + x - BUBBLE_HALF;
          const posY = ANCHOR_Y_ABS + y - BUBBLE_HALF;

          const Icon = item.icon;

          if (!isVisible) return null;

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
                  <Icon size={20} color={item.iconColor} />
                </View>
                <Text style={styles.bubbleLabel} numberOfLines={2}>
                  {item.label}
                </Text>
                {item.comingSoon && <Text style={styles.bubbleSoon}>Soon</Text>}
              </TouchableOpacity>
            </Animated.View>
          );
        })}

      {/* ── FOOTER BAR ── */}
      <View style={styles.footer}>
        {/* Material FAB Button */}
        <View
          onLayout={(e) => setBtnLayout(e.nativeEvent.layout)}
          style={styles.matButtonWrapper}
        >
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={menuOpen ? () => closeMenu() : openMenu}
            style={[styles.matButton, menuOpen && styles.matButtonActive]}
          >
            {menuOpen ? (
              <X size={22} color="white" />
            ) : (
              <Truck size={22} color="white" />
            )}
          </TouchableOpacity>
          <Text style={[styles.footerLabel, menuOpen && { color: '#374151' }]}>Material</Text>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* HR */}
        <TouchableOpacity
          activeOpacity={0.75}
          style={styles.footerTab}
          onPress={() => navigation.navigate('HRScreen')}
        >
          <View style={styles.footerIconBg}>
            <Users size={18} color="#e91e63" />
          </View>
          <Text style={styles.footerLabel}>HR</Text>
        </TouchableOpacity>

        {/* Department */}
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

        {/* Reports */}
        <TouchableOpacity
          activeOpacity={0.75}
          style={styles.footerTab}
          onPress={() =>
            Alert.alert('Coming Soon', 'Reports module will be available soon.')
          }
        >
          <View style={styles.footerIconBg}>
            <TrendingUp size={18} color="#c9a06a" />
          </View>
          <Text style={styles.footerLabel}>Reports</Text>
          <Text style={styles.soonBadge}>SOON</Text>
        </TouchableOpacity>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  // ── Footer Bar ──────────────────────────────────────────────
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e8ecf2',
    paddingTop: 8,
    paddingBottom: 16,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 14,
    zIndex: 99,
  },

  divider: {
    width: 1,
    height: 48,
    backgroundColor: '#e8ecf2',
    marginHorizontal: 2,
  },

  footerTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },

  footerIconBg: {
    width: 40,
    height: 40,
    borderRadius: 13,
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

  // ── Material FAB ──────────────────────────────────────────────
  matButtonWrapper: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },

  matButton: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#0d9488',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 3,
    shadowColor: '#0d9488',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10,
  },

  matButtonActive: {
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
    marginTop: 5,
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 12,
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

export default MaterialModuleFooter;
