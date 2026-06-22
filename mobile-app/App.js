import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { Calendar, CalendarCheck, Clock, Home, User as UserIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, AppState, StyleSheet, ActivityIndicator, Alert, Linking } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { enableScreens } from 'react-native-screens';
import api from './src/api/axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import socket from './src/socket';

enableScreens();

import AttendanceScreen from './src/screens/AttendanceScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import LeaveScreen from './src/screens/LeaveScreen';
import LoginScreen from './src/screens/LoginScreen';
import MonthlyViewScreen from './src/screens/MonthlyViewScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import ShiftManagementScreen from './src/screens/ShiftManagementScreen';
import TrackMyRoute from './src/screens/TrackMyRoute';
import CustomerVisitScreen from './src/screens/CustomerVisitScreen';
import { navigationRef } from './src/utils/navigation';
import ErrorBoundary from './src/components/ErrorBoundary';
import { LogBox } from 'react-native';

LogBox.ignoreAllLogs(true);

const LOCATION_TRACKING_TASK = 'background-location-tracking';

// Background Task Definition — Enterprise Pipeline
TaskManager.defineTask(LOCATION_TRACKING_TASK, async ({ data, error }) => {
  if (error) return;
  if (data) {
    const { locations } = data;
    if (locations && locations.length > 0) {
      try {
        // Try enterprise pipeline first (SQLite)
        const { insertTrackingPoint, initDatabase } = require('./src/services/database.service');
        const { syncPendingPoints } = require('./src/services/sync.service');
        
        await initDatabase();

        const activeTripId = await AsyncStorage.getItem('activeTripId');
        const deviceId = await AsyncStorage.getItem('deviceId');

        let batteryLevel = 100;
        try {
          const level = await Battery.getBatteryLevelAsync();
          if (level >= 0) {
            batteryLevel = Math.round(level * 100);
          }
        } catch (batErr) {
          console.warn('[BackgroundLocation] Failed to read battery level:', batErr.message);
        }

        for (const loc of locations) {
          const { latitude, longitude, accuracy, speed, heading, altitude, mocked, timestamp } = loc.coords;
          await insertTrackingPoint({
            latitude,
            longitude,
            accuracy,
            speed: speed || 0,
            heading: heading || 0,
            altitude: altitude || 0,
            timestamp: timestamp || Date.now(),
            tripId: activeTripId,
            deviceId: deviceId || 'background-unknown',
            battery: batteryLevel,
            isOffline: accuracy > 50,
            isMock: mocked || false
          });
        }

        // Trigger sync
        await syncPendingPoints();
      } catch (enterpriseErr) {
        // Fallback to legacy offlineQueue
        try {
          const { addPointToQueue, syncQueue } = require('./src/utils/offlineQueue');
          for (const loc of locations) {
            const { latitude, longitude, accuracy, speed, heading, mocked, timestamp } = loc.coords;
            await addPointToQueue({
              latitude,
              longitude,
              accuracy,
              speed: speed || 0,
              heading,
              isMock: mocked,
              timestamp: timestamp || Date.now()
            });
          }
          await syncQueue();
        } catch (fallbackErr) {
          console.error('[BackgroundTask] Both enterprise and fallback sync failed');
        }
      }
    }
  }
});

const RootStack = createStackNavigator();
const DashboardStackNav = createStackNavigator();
const Tab = createBottomTabNavigator();

function DashboardStack() {
  return (
    <DashboardStackNav.Navigator screenOptions={{ headerShown: false }}>
      <DashboardStackNav.Screen name="DashboardMain" component={DashboardScreen} />
    </DashboardStackNav.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          height: 85,
          paddingTop: 12,
          paddingBottom: 25,
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#f1f5f9',
          elevation: 0,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.05,
          shadowRadius: 12,
        },
        tabBarActiveTintColor: '#4f46e5',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: 'bold',
          marginTop: 4,
        },
        tabBarIcon: ({ color, size, focused }) => {
          let Icon;
          if (route.name === 'Home') Icon = Home;
          else if (route.name === 'Attendance') Icon = CalendarCheck;
          else if (route.name === 'Shift') Icon = Clock;
          else if (route.name === 'Leave') Icon = Calendar;
          else if (route.name === 'Profile') Icon = UserIcon;

          return (
            <View className="items-center">
              <Icon size={24} color={color} />
              {focused && <View className="w-1 h-1 rounded-full bg-indigo-600 mt-1" />}
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="Home" component={DashboardStack} />
      <Tab.Screen name="Attendance" component={AttendanceScreen} />
      <Tab.Screen name="Shift" component={ShiftManagementScreen} />
      <Tab.Screen name="Leave" component={LeaveScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const PermissionLockScreen = ({ onRequestPermissions, checking }) => {
  return (
    <View style={styles.lockContainer}>
      <Text style={styles.lockTitle}>🏢 Geo-Attendance HRMS</Text>
      <Text style={styles.lockSubtitle}>Location Permissions Required</Text>
      <Text style={styles.lockDescription}>
        To punch in and record attendance, this app requires background and foreground location access.
        {"\n\n"}
        Please enable "Allow all the time" location permissions in settings.
      </Text>
      {checking ? (
        <ActivityIndicator size="large" color="#4f46e5" />
      ) : (
        <TouchableOpacity style={styles.lockButton} onPress={onRequestPermissions}>
          <Text style={styles.lockButtonText}>Grant Permissions</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default function App() {
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [checkingPermissions, setCheckingPermissions] = useState(true);

  const checkAllPermissions = async () => {
    try {
      setCheckingPermissions(true);
      
      // 1. Check Foreground Permission
      const fgStatus = await Location.getForegroundPermissionsAsync();
      if (fgStatus.status !== 'granted') {
        setPermissionsGranted(false);
        setCheckingPermissions(false);
        return false;
      }

      // 2. Check Background Permission
      const bgStatus = await Location.getBackgroundPermissionsAsync();
      if (bgStatus.status !== 'granted') {
        setPermissionsGranted(false);
        setCheckingPermissions(false);
        return false;
      }

      setPermissionsGranted(true);
      setCheckingPermissions(false);
      return true;
    } catch (e) {
      console.warn('[Permissions] Failed to check permissions:', e);
      setPermissionsGranted(false);
      setCheckingPermissions(false);
      return false;
    }
  };

  const requestAllPermissions = async () => {
    try {
      setCheckingPermissions(true);
      
      // Request Foreground first (Android requirement: request foreground, then background)
      const fgRequest = await Location.requestForegroundPermissionsAsync();
      if (fgRequest.status !== 'granted') {
        setPermissionsGranted(false);
        setCheckingPermissions(false);
        Alert.alert(
          "Permission Required",
          "Foreground Location permission is required to track attendance. Please enable it in Settings.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() }
          ]
        );
        return;
      }

      // Request Background
      const bgRequest = await Location.requestBackgroundPermissionsAsync();
      if (bgRequest.status !== 'granted') {
        setPermissionsGranted(false);
        setCheckingPermissions(false);
        Alert.alert(
          "Background Location Required",
          "Please set Location permission to 'Allow all the time' in Settings to track your route in the background.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() }
          ]
        );
        return;
      }

      setPermissionsGranted(true);
      setCheckingPermissions(false);
    } catch (e) {
      console.warn('[Permissions] Request failed:', e);
      setPermissionsGranted(false);
      setCheckingPermissions(false);
    }
  };

  useEffect(() => {
    checkAllPermissions();

    // Listen for AppState changes to check permissions again when user returns from settings
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        checkAllPermissions();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (permissionsGranted) {
      const { initializeTracking } = require('./src/services/trackingManager');
      initializeTracking();
    }
  }, [permissionsGranted]);

  if (!permissionsGranted) {
    return (
      <SafeAreaProvider>
        <PermissionLockScreen 
          onRequestPermissions={requestAllPermissions} 
          checking={checkingPermissions} 
        />
      </SafeAreaProvider>
    );
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <NavigationContainer ref={navigationRef}>
            <RootStack.Navigator
              initialRouteName="Login"
              screenOptions={{ headerShown: false }}
            >
              <RootStack.Screen name="Login" component={LoginScreen} />
              <RootStack.Screen name="Main" component={MainTabs} />
              <RootStack.Screen name="MonthlyViewScreen" component={MonthlyViewScreen} />
              <RootStack.Screen name="TrackMyRoute" component={TrackMyRoute} />
              <RootStack.Screen name="CustomerVisitScreen" component={CustomerVisitScreen} />
            </RootStack.Navigator>
          </NavigationContainer>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  lockContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  lockTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 10,
    textAlign: 'center',
  },
  lockSubtitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4f46e5',
    marginBottom: 20,
    textAlign: 'center',
  },
  lockDescription: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 40,
  },
  lockButton: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  lockButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
