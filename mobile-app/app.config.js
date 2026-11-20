const fs = require("fs");
const path = require("path");

try {
  const envFile = fs.readFileSync(path.resolve(__dirname, ".env"), "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  }
} catch (_) { }

module.exports = ({ config }) => {
  const projectId = config.extra?.eas?.projectId;
  const androidGoogleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ||
    (fs.existsSync(path.resolve(__dirname, "google-services.json"))
      ? "./google-services.json"
      : null);
  const iosGoogleServicesFile =
    process.env.GOOGLE_SERVICE_INFO_PLIST ||
    (fs.existsSync(path.resolve(__dirname, "GoogleService-Info.plist"))
      ? "./GoogleService-Info.plist"
      : null);

  const iosConfig = { ...(config.ios || {}) };
  if (iosGoogleServicesFile) {
    iosConfig.googleServicesFile = iosGoogleServicesFile;
  } else {
    delete iosConfig.googleServicesFile;
  }

  const androidConfig = {
    ...(config.android || {}),
    allowBackup: false,
  };
  if (androidGoogleServicesFile) {
    androidConfig.googleServicesFile = androidGoogleServicesFile;
  } else {
    delete androidConfig.googleServicesFile;
  }

  return {
    ...config,
    ios: iosConfig,
    updates: {
      ...(config.updates || {}),
      ...(projectId ? { url: `https://u.expo.dev/${projectId}` } : {}),
      enabled: true,
      checkAutomatically: "ON_LOAD",
      fallbackToCacheTimeout: 10000,
    },
    runtimeVersion: config.runtimeVersion || {
      policy: "appVersion",
    },
    extra: {
      ...(config.extra || {}),
      eas: {
        ...(projectId ? { projectId } : {}),
        ...(config.extra?.eas || {}),
      },
    },
    // Single source of truth for all Expo config plugins
    plugins: [
      "@react-native-community/datetimepicker",
      [
        "expo-camera",
        {
          recordAudioAndroid: false,
        },
      ],
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission:
            "Gatimaan collects location data in the foreground and background to log your field route and verify compliance with office geofencing rules while you are punched in.",
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true,
        },
      ],
      [
        "expo-splash-screen",
        {
          image: "./assets/splash.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: {
            image: "./assets/splash.png",
            imageWidth: 200,
            resizeMode: "contain",
            backgroundColor: "#ffffff",
          },
        },
      ],
      "expo-notifications",
      "expo-secure-store",
      "expo-task-manager",
      "expo-updates",
      "expo-sqlite",
    ],
    android: androidConfig,
  };
};
