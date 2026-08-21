import 'react-native-gesture-handler';
import "./global.css";
import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

import App from './App';

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🚀 [GEO-HRMS APP STARTUP]');
console.log('📱 Platform:', Platform.OS);
console.log('⚙️  Environment:', __DEV__ ? 'Development' : 'Production Build');
console.log('📦 App Ownership:', Constants?.appOwnership || 'Standalone/Native APK');
console.log('🌐 API URL:', process.env.EXPO_PUBLIC_API_URL || 'https://tru-attendance-hrms-system-production.up.railway.app/api');
console.log('🔌 Socket URL:', process.env.EXPO_PUBLIC_SOCKET_URL || 'https://tru-attendance-hrms-system-production.up.railway.app');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

registerRootComponent(App);
