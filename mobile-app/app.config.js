const path = require('path');
try {
  require('dotenv').config({ path: path.resolve(__dirname, '.env') });
} catch (e) {}

const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyCP_wcD-7ZCxw_4DbVmiANpp5FE1Bk0JiI";

module.exports = ({ config }) => {
  return {
    ...config,
    plugins: [
      ...(config.plugins || []),
      "expo-sqlite",
      ["expo-location", {
        locationAlwaysAndWhenInUsePermission: "Allow Geo-Track HRMS to access your location for attendance tracking.",
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true
      }],
      ["react-native-maps", {
        "androidGoogleMapsApiKey": googleMapsApiKey
      }]
    ],
    updates: {
      enabled: false,
      checkOnLaunch: "NEVER",
      fallbackToCacheTimeout: 0
    },
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: {
          apiKey: googleMapsApiKey
        }
      }
    }
  };
};
