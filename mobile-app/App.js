import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { Calendar, CalendarCheck, Clock, Home, User as UserIcon } from 'lucide-react-native';
import { View } from 'react-native';
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

export default function App() {
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
