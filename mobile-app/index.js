import 'react-native-gesture-handler';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
import "./global.css";

try {
  configureReanimatedLogger({
    level: ReanimatedLogLevel.warn,
    strict: false,
  });
} catch (_) {}
import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

import App from './App';

if (__DEV__) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 [GATIMAAN APP STARTUP]');
  console.log('📱 Platform:', Platform.OS);
  console.log('⚙️  Environment:', __DEV__ ? 'Development' : 'Production Build');
  console.log('📦 App Ownership:', Constants?.appOwnership || 'Standalone/Native APK');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

registerRootComponent(App);
