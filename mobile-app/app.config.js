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
        "androidGoogleMapsApiKey": process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyCAvI2O3xVUJrpARkgMTaH9_nOu1pif80Y"
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
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || ""
        }
      }
    }
  };
};
