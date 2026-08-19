import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../api/axios';
import {
  Bell,
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  House as Home,
  LayoutGrid,
  LogOut,
  MapPin,
  ArrowRightLeft,
  RotateCcw,
  CirclePlus,
  FolderTree,
  Package,
  TrendingUp,
  User as UserIcon,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSidebar } from '../context/SidebarContext';
import { clearTrackingSession } from '../services/trackingManager';
import { navigationRef } from '../utils/navigation';

const { width } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(width * 0.82, 320);

const SidebarDrawer = ({ navigation, onOpenNotifications }) => {
  const { sidebarVisible, closeSidebar } = useSidebar();
  const [userData, setUserData] = useState(null);
  const [isHrExpanded, setIsHrExpanded] = useState(true);
  const [isMaterialExpanded, setIsMaterialExpanded] = useState(true);

  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loadUser = async () => {
      try {
        const u = await AsyncStorage.getItem('user');
        if (u) {
          setUserData(JSON.parse(u));
        }
      } catch (e) {}
    };
    if (sidebarVisible) {
      loadUser();
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(overlayAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -DRAWER_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(overlayAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [sidebarVisible]);

  const handleNavigate = (routeName, params) => {
    closeSidebar();
    setTimeout(() => {
      if (navigationRef.isReady()) {
        navigationRef.navigate(routeName, params);
      } else if (navigation) {
        navigation.navigate(routeName, params);
      }
    }, 150);
  };

  const handleLogout = async () => {
    closeSidebar();
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.get('/auth/logout');
            } catch (_) {}
            try {
              await clearTrackingSession();
              await AsyncStorage.removeItem('token');
              await AsyncStorage.removeItem('user');
              await AsyncStorage.removeItem('userId');
              await AsyncStorage.removeItem('activeTripId');
              if (navigationRef.isReady()) {
                navigationRef.reset({
                  index: 0,
                  routes: [{ name: 'Login' }],
                });
              } else if (navigation) {
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'Login' }],
                });
              }
            } catch (e) {
              console.error('Logout error:', e);
            }
          },
        },
      ]
    );
  };

  const handleComingSoon = (featureName) => {
    closeSidebar();
    setTimeout(() => {
      Alert.alert('Coming Soon', `${featureName} module will be available in the upcoming update.`);
    }, 150);
  };

  const hrScreens = [
    {
      key: 'home',
      label: 'Home / Dashboard',
      icon: Home,
      iconColor: '#1972e9',
      bgColor: '#ebf3fe',
      onPress: () => handleNavigate('Home'),
    },
    {
      key: 'attendance',
      label: 'Attendance',
      icon: CalendarCheck,
      iconColor: '#10b981',
      bgColor: '#e6f7f0',
      onPress: () => handleNavigate('Attendance'),
    },
    {
      key: 'shift',
      label: 'Shift Management',
      icon: Clock,
      iconColor: '#f59e0b',
      bgColor: '#fff7e6',
      onPress: () => handleNavigate('Shift'),
    },
    {
      key: 'leaves',
      label: 'Leaves',
      icon: CalendarDays,
      iconColor: '#ef4444',
      bgColor: '#fdeeee',
      onPress: () => handleNavigate('Leave'),
    },
    {
      key: 'profile',
      label: 'Profile',
      icon: UserIcon,
      iconColor: '#8b5cf6',
      bgColor: '#f2edfe',
      onPress: () => handleNavigate('Profile'),
    },
    {
      key: 'monthlyView',
      label: 'Monthly View',
      icon: LayoutGrid,
      iconColor: '#06b6d4',
      bgColor: '#ecfeff',
      onPress: () => handleNavigate('MonthlyViewScreen'),
    },
    {
      key: 'customerVisit',
      label: 'Customer Visit',
      icon: MapPin,
      iconColor: '#e91e63',
      bgColor: '#fdf0f5',
      onPress: () => handleNavigate('CustomerVisitScreen'),
    },
  ];

  if (!sidebarVisible) return null;

  return (
    <Modal
      transparent
      visible={sidebarVisible}
      animationType="none"
      onRequestClose={closeSidebar}
    >
      {/* Full-screen touchable backdrop — tap anywhere outside drawer to close */}
      <TouchableWithoutFeedback onPress={closeSidebar}>
        <View style={styles.container}>
          {/* Dimmed overlay */}
          <Animated.View
            style={[
              styles.backdrop,
              { opacity: overlayAnim },
            ]}
          />

          {/* Drawer Panel — inner taps absorbed so they don't close the sidebar */}
          <TouchableWithoutFeedback onPress={() => {}}>
            <Animated.View
              style={[
                styles.drawer,
                { width: DRAWER_WIDTH, transform: [{ translateX: slideAnim }] },
              ]}
            >
          <SafeAreaView style={{ flex: 1 }}>
            {/* User Profile Header */}
            <View style={styles.header}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => handleNavigate('Profile')}
                style={styles.headerLeft}
              >
                <View style={styles.avatarContainer}>
                  <Text style={styles.avatarText}>
                    {userData?.name ? userData.name.charAt(0).toUpperCase() : 'U'}
                  </Text>
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userName} numberOfLines={1}>
                    {userData?.name || 'User Account'}
                  </Text>
                  <Text style={styles.userRole} numberOfLines={1}>
                    {(typeof userData?.designation === 'object' ? userData?.designation?.name : userData?.designation) || (typeof userData?.department === 'object' ? userData?.department?.name : userData?.department) || (typeof userData?.role === 'object' ? userData?.role?.name : userData?.role) || 'Employee'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Menu Items Content */}
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* HR Service Dropdown Section */}
              <View style={styles.dropdownContainer}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setIsHrExpanded(prev => !prev)}
                  style={styles.dropdownHeader}
                >
                  <View style={styles.dropdownHeaderLeft}>
                    <View style={[styles.iconBox, { backgroundColor: '#e0e7ff' }]}>
                      <Briefcase size={18} color="#4f46e5" />
                    </View>
                    <Text style={styles.dropdownHeaderTitle}>HR Service</Text>
                  </View>
                  {isHrExpanded ? (
                    <ChevronDown size={18} color="#4f46e5" />
                  ) : (
                    <ChevronRight size={18} color="#94a3b8" />
                  )}
                </TouchableOpacity>

                {/* Expanded Sub-items */}
                {isHrExpanded && (
                  <View style={styles.dropdownBody}>
                    {hrScreens.map((item) => {
                      const IconComponent = item.icon;
                      return (
                        <TouchableOpacity
                          key={item.key}
                          activeOpacity={0.7}
                          onPress={item.onPress}
                          style={styles.subItemRow}
                        >
                          <View style={[styles.subIconBox, { backgroundColor: item.bgColor }]}>
                            <IconComponent size={15} color={item.iconColor} />
                          </View>
                          <Text style={styles.subItemText}>{item.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>

              <View style={styles.divider} />

              {/* Items Below HR Service */}
              <Text style={styles.sectionHeader}>OTHER SERVICES</Text>

              {/* Material Management Expandable Section */}
              <View style={styles.dropdownContainer}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setIsMaterialExpanded(prev => !prev)}
                  style={styles.dropdownHeader}
                >
                  <View style={styles.dropdownHeaderLeft}>
                    <View style={[styles.iconBox, { backgroundColor: '#eef2ff' }]}>
                      <Package size={18} color="#4f46e5" />
                    </View>
                    <Text style={styles.dropdownHeaderTitle}>Material Movement</Text>
                  </View>
                  {isMaterialExpanded ? (
                    <ChevronDown size={18} color="#4f46e5" />
                  ) : (
                    <ChevronRight size={18} color="#94a3b8" />
                  )}
                </TouchableOpacity>

                {isMaterialExpanded && (
                  <View style={styles.dropdownBody}>
                    {[
                      { key: 'm_dash', label: 'Dashboard', icon: Home, color: '#4f46e5', bg: '#eef2ff', screen: 'MaterialDashboard' },
                      { key: 'm_pending', label: 'Pending Requests', icon: Clock, color: '#d97706', bg: '#fef3c7', screen: 'PendingTransactionsScreen' },
                      { key: 'm_txns', label: 'Transactions', icon: Package, color: '#2563eb', bg: '#eff6ff', screen: 'MaterialListScreen' },
                      { key: 'm_create', label: 'Create Request', icon: CirclePlus, color: '#16a34a', bg: '#f0fdf4', screen: 'MaterialRequestScreen' },
                      { key: 'm_tree', label: 'Materials Tree', icon: FolderTree, color: '#9333ea', bg: '#f3e8ff', screen: 'MaterialsTreeScreen' },
                      { key: 'm_transfers', label: 'Transfers', icon: ArrowRightLeft, color: '#ea580c', bg: '#ffedd5', screen: 'TransferListScreen' },
                      { key: 'm_returns', label: 'Returns', icon: RotateCcw, color: '#dc2626', bg: '#fef2f2', screen: 'ReturnListScreen' },
                    ].map((item) => {
                      const IconComp = item.icon;
                      return (
                        <TouchableOpacity
                          key={item.key}
                          activeOpacity={0.7}
                          onPress={() => handleNavigate(item.screen)}
                          style={styles.subItemRow}
                        >
                          <View style={[styles.subIconBox, { backgroundColor: item.bg }]}>
                            <IconComp size={15} color={item.color} />
                          </View>
                          <Text style={styles.subItemText}>{item.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* Department */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => handleComingSoon('Department')}
                style={styles.itemRow}
              >
                <View style={[styles.iconBox, { backgroundColor: '#f3e8ff' }]}>
                  <Building2 size={18} color="#9333ea" />
                </View>
                <Text style={styles.itemText}>Department</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>Soon</Text>
                </View>
              </TouchableOpacity>

              {/* Reports */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => handleNavigate('Reports')}
                style={styles.itemRow}
              >
                <View style={[styles.iconBox, { backgroundColor: '#eff6ff' }]}>
                  <TrendingUp size={18} color="#0284c7" />
                </View>
                <Text style={styles.itemText}>Reports</Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Sidebar Footer */}
            <View style={styles.footer}>
              {onOpenNotifications && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    closeSidebar();
                    setTimeout(() => onOpenNotifications(), 150);
                  }}
                  style={styles.footerBtn}
                >
                  <Bell size={18} color="#4f46e5" />
                  <Text style={[styles.footerBtnText, { color: '#4f46e5' }]}>Notifications</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleLogout}
                style={[styles.footerBtn, styles.logoutBtn]}
              >
                <LogOut size={18} color="#ef4444" />
                <Text style={[styles.footerBtnText, { color: '#ef4444' }]}>Logout</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
  },
  drawer: {
    height: '100%',
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#1972e9',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  avatarContainer: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1972e9',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  userRole: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  dropdownContainer: {
    marginBottom: 8,
  },
  dropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  dropdownHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dropdownHeaderTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1e293b',
    marginLeft: 12,
  },
  dropdownBody: {
    marginTop: 8,
    paddingLeft: 10,
  },
  subItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  subIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  subItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 14,
  },
  sectionHeader: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#94a3b8',
    letterSpacing: 1.5,
    marginBottom: 10,
    marginLeft: 6,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  itemText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#ffedd5',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#ea580c',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#ffffff',
    gap: 8,
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  logoutBtn: {
    backgroundColor: '#fef2f2',
    borderColor: '#fee2e2',
  },
  footerBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
});

export default SidebarDrawer;
