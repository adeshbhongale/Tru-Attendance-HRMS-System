import AsyncStorage from "@react-native-async-storage/async-storage";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import * as Battery from "expo-battery";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { enableScreens } from "react-native-screens";

enableScreens();

import { LogBox } from "react-native";
import ErrorBoundary from "./src/components/ErrorBoundary";
// import SidebarDrawer from './src/components/SidebarDrawer'; // SIDEBAR COMMENTED OUT
import { SidebarProvider } from "./src/context/SidebarContext";
import AttendanceScreen from "./src/screens/AttendanceScreen";
import CustomerVisitScreen from "./src/screens/CustomerVisitScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import HRScreen from "./src/screens/HRScreen";
import LeaveScreen from "./src/screens/LeaveScreen";
import LoginScreen from "./src/screens/LoginScreen";
import MonthlyViewScreen from "./src/screens/MonthlyViewScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import ShiftManagementScreen from "./src/screens/ShiftManagementScreen";
import OrgChartScreen from "./src/screens/OrgChartScreen";
import LeaveApprovalsScreen from "./src/screens/LeaveApprovalsScreen";
import ReportsScreen from "./src/screens/ReportsScreen";
import { navigationRef } from "./src/utils/navigation";

// Material Management Module Screens
import MaterialDashboardScreen from "./src/modules/material/screens/MaterialDashboardScreen";
import MaterialRequestScreen from "./src/modules/material/screens/MaterialRequestScreen";
import MaterialListScreen from "./src/modules/material/screens/MaterialListScreen";
import MaterialDetailScreen from "./src/modules/material/screens/MaterialDetailScreen";
import BarcodeViewAllScreen from "./src/modules/material/screens/BarcodeViewAllScreen";
import BarcodeDetailScreen from "./src/modules/material/screens/BarcodeDetailScreen";
import TransferMaterialScreen from "./src/modules/material/screens/TransferMaterialScreen";
import ReturnMaterialScreen from "./src/modules/material/screens/ReturnMaterialScreen";
import SplitMaterialScreen from "./src/modules/material/screens/SplitMaterialScreen";
import ConvertMaterialScreen from "./src/modules/material/screens/ConvertMaterialScreen";
import HandlerAssignmentScreen from "./src/modules/material/screens/HandlerAssignmentScreen";
import StoreDispatchScreen from "./src/modules/material/screens/StoreDispatchScreen";
import ReceivingFormScreen from "./src/modules/material/screens/ReceivingFormScreen";
import ExchangeBarcodeScreen from "./src/modules/material/screens/ExchangeBarcodeScreen";
import MaterialsTreeScreen from "./src/modules/material/screens/MaterialsTreeScreen";
import TransferListScreen from "./src/modules/material/screens/TransferListScreen";
import ReturnListScreen from "./src/modules/material/screens/ReturnListScreen";
import PendingTransactionsScreen from "./src/modules/material/screens/PendingTransactionsScreen";
import MaterialMovementHubScreen from "./src/modules/material/screens/MaterialMovementHubScreen";
import MergeMaterialScreen from "./src/modules/material/screens/MergeMaterialScreen";
import ReturnMultipleScreen from "./src/modules/material/screens/ReturnMultipleScreen";

// Expense Management (HR Module) Screens
import ExpenseDashboardScreen from "./src/modules/hr/expense/screens/ExpenseDashboardScreen";
import CreateExpenseClaimScreen from "./src/modules/hr/expense/screens/CreateExpenseClaimScreen";
import ExpenseClaimDetailScreen from "./src/modules/hr/expense/screens/ExpenseClaimDetailScreen";

if (!__DEV__) {
  LogBox.ignoreAllLogs(true);
}

const LOCATION_TRACKING_TASK = "background-location-tracking";

// Background Task Definition — Enterprise Pipeline (Single GPS System)
// This is the ONLY GPS collection mechanism. No watchPositionAsync.
try {
  const Constants = require("expo-constants").default;
  const isExpoGo =
    Constants?.appOwnership === "expo" ||
    Constants?.executionEnvironment === "storeClient";
  if (!isExpoGo && typeof TaskManager?.defineTask === "function") {
    TaskManager.defineTask(LOCATION_TRACKING_TASK, async ({ data, error }) => {
      if (error) return;
      if (data) {
        const { locations } = data;
        if (locations && locations.length > 0) {
          try {
            const {
              insertTrackingPoint,
              initDatabase,
            } = require("./src/services/database.service");
            const { syncPendingPoints } = require("./src/services/sync.service");
            const { setLastPoint } = require("./src/services/tracking.service");

            await initDatabase();

            const activeTripId = await AsyncStorage.getItem("activeTripId");
            const deviceId = await AsyncStorage.getItem("deviceId");

            let batteryLevel = 100;
            try {
              const level = await Battery.getBatteryLevelAsync();
              if (level >= 0) {
                batteryLevel = Math.round(level * 100);
              }
            } catch (batErr) {
              console.warn(
                "[BackgroundLocation] Failed to read battery level:",
                batErr.message,
              );
            }

            for (const loc of locations) {
              const {
                latitude,
                longitude,
                accuracy,
                speed,
                heading,
                altitude,
                mocked,
              } = loc.coords;
              const timestamp = loc.timestamp || Date.now();
              await insertTrackingPoint({
                latitude,
                longitude,
                accuracy,
                speed: speed || 0,
                heading: heading || 0,
                altitude: altitude || 0,
                timestamp: timestamp,
                tripId: activeTripId,
                deviceId: deviceId || "background-unknown",
                battery: batteryLevel,
                isOffline: accuracy > 50,
                isMock: mocked || false,
              });

              // Update lastPoint in tracking.service.js so heartbeat knows GPS is active
              setLastPoint({
                latitude,
                longitude,
                timestamp,
                tripId: activeTripId,
              });
            }

            // Trigger sync
            await syncPendingPoints();
          } catch (enterpriseErr) {
            // Fallback to legacy offlineQueue
            try {
              const {
                addPointToQueue,
                syncQueue,
              } = require("./src/utils/offlineQueue");
              for (const loc of locations) {
                const {
                  latitude,
                  longitude,
                  accuracy,
                  speed,
                  heading,
                  mocked,
                  timestamp,
                } = loc.coords;
                await addPointToQueue({
                  latitude,
                  longitude,
                  accuracy,
                  speed: speed || 0,
                  heading,
                  isMock: mocked,
                  timestamp: timestamp || Date.now(),
                });
              }
              await syncQueue();
            } catch (fallbackErr) {
              console.error(
                "[BackgroundTask] Both enterprise and fallback sync failed",
              );
            }
          }
        }
      }
    });
  }
} catch (taskErr) {
  console.warn("[TaskManager] Task definition skipped:", taskErr?.message);
}

const RootStack = createStackNavigator();

const PermissionLockScreen = ({ onRequestPermissions, onContinue, checking }) => {
  return (
    <View style={styles.lockContainer}>
      <Text style={styles.lockTitle}>🏢 Geo-Attendance HRMS</Text>
      <Text style={styles.lockSubtitle}>Location Permission Required</Text>
      <Text style={styles.lockDescription}>
        To punch in and record attendance with geofencing, this app requires location access.
        {"\n\n"}
        Please enable location permission to continue.
      </Text>
      {checking ? (
        <ActivityIndicator size="large" color="#4f46e5" />
      ) : (
        <View style={{ width: "100%", alignItems: "center", gap: 12 }}>
          <TouchableOpacity
            style={styles.lockButton}
            onPress={onRequestPermissions}
          >
            <Text style={styles.lockButtonText}>Grant Location Permission</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.lockButton, { backgroundColor: "#f1f5f9", elevation: 0, shadowOpacity: 0 }]}
            onPress={onContinue}
          >
            <Text style={[styles.lockButtonText, { color: "#64748b" }]}>Continue to Login</Text>
          </TouchableOpacity>
        </View>
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

      // Check Foreground Permission
      const fgStatus = await Location.getForegroundPermissionsAsync();
      if (fgStatus.status === "granted") {
        setPermissionsGranted(true);
        setCheckingPermissions(false);
        return true;
      }

      setPermissionsGranted(false);
      setCheckingPermissions(false);
      return false;
    } catch (e) {
      console.warn("[Permissions] Failed to check permissions:", e);
      setPermissionsGranted(true); // Allow app entry on check error
      setCheckingPermissions(false);
      return false;
    }
  };

  const requestAllPermissions = async () => {
    try {
      setCheckingPermissions(true);

      // Step 1: Request Foreground first (Android requirement: request foreground before background)
      const fgRequest = await Location.requestForegroundPermissionsAsync();
      if (fgRequest.status !== "granted") {
        setCheckingPermissions(false);
        Alert.alert(
          "Permission Required",
          "Location permission is needed to record attendance geofencing. You can also grant it later in Settings.",
          [
            { text: "Continue Anyway", onPress: () => setPermissionsGranted(true) },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }

      setPermissionsGranted(true);
      setCheckingPermissions(false);

      // Step 2: Request Background in separate non-blocking step
      try {
        const bgStatus = await Location.getBackgroundPermissionsAsync();
        if (bgStatus.status !== "granted") {
          await Location.requestBackgroundPermissionsAsync();
        }
      } catch (bgErr) {
        console.log("[Permissions] Background location prompt info:", bgErr?.message);
      }
    } catch (e) {
      console.warn("[Permissions] Request failed:", e);
      setPermissionsGranted(true);
      setCheckingPermissions(false);
    }
  };

  useEffect(() => {
    checkAllPermissions();

    // Listen for AppState changes to check permissions again when user returns from settings
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        checkAllPermissions();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (permissionsGranted) {
      // Defer tracking init so UI tree mounts before any native module calls
      const timer = setTimeout(() => {
        try {
          const { initializeTracking } = require("./src/services/trackingManager");
          console.log("[App] Initializing tracking services...");
          initializeTracking();
        } catch (initErr) {
          console.warn("[App] Tracking init non-critical error:", initErr?.message);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [permissionsGranted]);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          {!permissionsGranted ? (
            <PermissionLockScreen
              onRequestPermissions={requestAllPermissions}
              onContinue={() => setPermissionsGranted(true)}
              checking={checkingPermissions}
            />
          ) : (
            <SidebarProvider>
              <NavigationContainer ref={navigationRef}>
                <RootStack.Navigator
                  initialRouteName="Login"
                  screenOptions={{ headerShown: false }}
                >
                  <RootStack.Screen name="Login" component={LoginScreen} />
                  <RootStack.Screen name="Main" component={DashboardScreen} />
                  <RootStack.Screen name="Home" component={DashboardScreen} />
                  <RootStack.Screen
                    name="Attendance"
                    component={AttendanceScreen}
                  />
                  <RootStack.Screen
                    name="Shift"
                    component={ShiftManagementScreen}
                  />
                  <RootStack.Screen name="Leave" component={LeaveScreen} />
                  <RootStack.Screen name="Profile" component={ProfileScreen} />
                  <RootStack.Screen
                    name="MonthlyViewScreen"
                    component={MonthlyViewScreen}
                  />
                  <RootStack.Screen
                    name="CustomerVisitScreen"
                    component={CustomerVisitScreen}
                  />
                  <RootStack.Screen name="HRScreen" component={HRScreen} />
                  <RootStack.Screen
                    name="LeaveApprovals"
                    component={LeaveApprovalsScreen}
                  />
                  <RootStack.Screen
                    name="OrgChartScreen"
                    component={OrgChartScreen}
                  />

                  {/* Material Management Module */}
                  <RootStack.Screen
                    name="MaterialDashboard"
                    component={MaterialDashboardScreen}
                  />
                  <RootStack.Screen
                    name="MaterialRequestScreen"
                    component={MaterialRequestScreen}
                  />
                  <RootStack.Screen
                    name="MaterialListScreen"
                    component={MaterialListScreen}
                  />
                  <RootStack.Screen
                    name="MaterialDetailScreen"
                    component={MaterialDetailScreen}
                  />
                  <RootStack.Screen
                    name="BarcodeViewAllScreen"
                    component={BarcodeViewAllScreen}
                  />
                  <RootStack.Screen
                    name="BarcodeDetailScreen"
                    component={BarcodeDetailScreen}
                  />
                  <RootStack.Screen
                    name="TransferMaterialScreen"
                    component={TransferMaterialScreen}
                  />
                  <RootStack.Screen
                    name="ReturnMaterialScreen"
                    component={ReturnMaterialScreen}
                  />
                  <RootStack.Screen
                    name="SplitMaterialScreen"
                    component={SplitMaterialScreen}
                  />
                  <RootStack.Screen
                    name="ConvertMaterialScreen"
                    component={ConvertMaterialScreen}
                  />
                  <RootStack.Screen
                    name="StoreDispatchScreen"
                    component={StoreDispatchScreen}
                  />
                  <RootStack.Screen
                    name="ReceivingFormScreen"
                    component={ReceivingFormScreen}
                  />
                  <RootStack.Screen
                    name="ExchangeBarcodeScreen"
                    component={ExchangeBarcodeScreen}
                  />
                  <RootStack.Screen
                    name="MaterialsTreeScreen"
                    component={MaterialsTreeScreen}
                  />
                  <RootStack.Screen
                    name="TransferListScreen"
                    component={TransferListScreen}
                  />
                  <RootStack.Screen
                    name="ReturnListScreen"
                    component={ReturnListScreen}
                  />
                  <RootStack.Screen
                    name="PendingTransactionsScreen"
                    component={PendingTransactionsScreen}
                  />
                  <RootStack.Screen
                    name="MaterialMovementHub"
                    component={MaterialMovementHubScreen}
                  />
                  <RootStack.Screen
                    name="MergeMaterialScreen"
                    component={MergeMaterialScreen}
                  />
                  <RootStack.Screen
                    name="ReturnMultipleScreen"
                    component={ReturnMultipleScreen}
                  />
                  <RootStack.Screen
                    name="HandlerAssignmentScreen"
                    component={HandlerAssignmentScreen}
                  />

                  {/* Expense Management Module */}
                  <RootStack.Screen
                    name="ExpenseDashboard"
                    component={ExpenseDashboardScreen}
                  />
                  <RootStack.Screen
                    name="CreateExpenseClaim"
                    component={CreateExpenseClaimScreen}
                  />
                  <RootStack.Screen
                    name="ExpenseClaimDetail"
                    component={ExpenseClaimDetailScreen}
                  />

                  {/* Reports Module */}
                  <RootStack.Screen
                    name="Reports"
                    component={ReportsScreen}
                  />
                  <RootStack.Screen
                    name="ReportsScreen"
                    component={ReportsScreen}
                  />
                </RootStack.Navigator>
                {/* <SidebarDrawer /> */}
              </NavigationContainer>
            </SidebarProvider>
          )}
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  lockContainer: {
    flex: 1,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
  },
  lockTitle: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#1e293b",
    marginBottom: 10,
    textAlign: "center",
  },
  lockSubtitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#4f46e5",
    marginBottom: 20,
    textAlign: "center",
  },
  lockDescription: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 40,
  },
  lockButton: {
    backgroundColor: "#4f46e5",
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    shadowColor: "#4f46e5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  lockButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
