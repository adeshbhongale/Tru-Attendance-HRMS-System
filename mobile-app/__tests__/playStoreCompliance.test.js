const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const MOBILE_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(MOBILE_ROOT, "..");

function readFile(relPath, base = MOBILE_ROOT) {
  return fs.readFileSync(path.resolve(base, relPath), "utf8");
}

function getAllJsFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllJsFiles(fullPath));
    } else if (entry.isFile() && fullPath.endsWith(".js")) {
      results.push(fullPath);
    }
  }
  return results;
}

test("CRIT-01: ForceUpdateModal uses Google Play Store redirect instead of self-updating APK download", () => {
  const content = readFile("src/components/ForceUpdateModal.js");
  assert.ok(!content.includes("androidApkUrl"), "ForceUpdateModal must not use androidApkUrl");
  assert.ok(!/downloaded APK/i.test(content), "ForceUpdateModal must not instruct users to sideload APK files");
  assert.ok(content.includes("market://details?id="), "ForceUpdateModal must support market:// URI");
  assert.ok(
    content.includes("https://play.google.com/store/apps/details?id="),
    "ForceUpdateModal must include Google Play Store web fallback URL"
  );
  assert.ok(content.includes("Update on Google Play"), "ForceUpdateModal button must say 'Update on Google Play'");
});

test("CRIT-02: No hardcoded Google Maps API keys exist in eas.json, AndroidManifest.xml, or src/", () => {
  const easJson = readFile("eas.json");
  assert.ok(!easJson.includes("AIzaSy"), "eas.json must not contain hardcoded Google API keys");

  const manifest = readFile("android/app/src/main/AndroidManifest.xml");
  assert.ok(!manifest.includes("AIzaSy"), "AndroidManifest.xml must not contain hardcoded Google API keys");
  assert.ok(
    !manifest.includes("com.google.android.geo.API_KEY"),
    "AndroidManifest.xml must not inject unused com.google.android.geo.API_KEY"
  );

  const srcFiles = getAllJsFiles(path.join(MOBILE_ROOT, "src"));
  for (const file of srcFiles) {
    const srcContent = fs.readFileSync(file, "utf8");
    const rel = path.relative(MOBILE_ROOT, file);
    assert.ok(
      !srcContent.includes("AIzaSy"),
      `Hardcoded Google API key found in ${rel}`
    );
    assert.ok(
      !srcContent.includes("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY"),
      `${rel} must not expose EXPO_PUBLIC_GOOGLE_MAPS_API_KEY in client JS bundle`
    );
    assert.ok(
      !srcContent.includes("18.5204") && !srcContent.includes("73.8567"),
      `${rel} must not contain hardcoded fake GPS coordinates (18.5204, 73.8567)`
    );
    assert.ok(
      !srcContent.includes('require("expo-sharing")') && !srcContent.includes("require('expo-sharing')"),
      `${rel} must not require uninstalled expo-sharing module`
    );
  }
});

test("CRIT-03: Android backup is disabled and secureStorage utility is wired across auth/API modules", () => {
  const manifest = readFile("android/app/src/main/AndroidManifest.xml");
  assert.ok(
    manifest.includes('android:allowBackup="false"'),
    'AndroidManifest.xml must set android:allowBackup="false"'
  );

  const appJson = JSON.parse(readFile("app.json"));
  assert.equal(appJson.expo.android.allowBackup, false, "app.json must set android.allowBackup = false");

  const pkgJson = JSON.parse(readFile("package.json"));
  assert.ok(pkgJson.dependencies["expo-secure-store"], "package.json must include expo-secure-store dependency");
  assert.ok(!pkgJson.dependencies["react-native-maps"], "package.json must not include unused react-native-maps");

  const secureStorage = readFile("src/utils/secureStorage.js");
  assert.ok(secureStorage.includes("expo-secure-store"), "secureStorage.js must integrate expo-secure-store");
  assert.ok(secureStorage.includes("setSecureToken"), "secureStorage.js must export setSecureToken");
  assert.ok(secureStorage.includes("getSecureToken"), "secureStorage.js must export getSecureToken");
  assert.ok(secureStorage.includes("removeSecureToken"), "secureStorage.js must export removeSecureToken");

  const loginScreen = readFile("src/screens/LoginScreen.js");
  assert.ok(loginScreen.includes("setSecureToken"), "LoginScreen.js must save token via setSecureToken");
  assert.ok(loginScreen.includes("getSecureToken"), "LoginScreen.js must read token via getSecureToken");
  assert.ok(
    !loginScreen.includes('AsyncStorage.setItem("token"') && !loginScreen.includes("AsyncStorage.setItem('token'"),
    "LoginScreen.js must not write plaintext JWT token directly to AsyncStorage"
  );

  assert.ok(readFile("src/api/axios.js").includes("getSecureToken"), "axios.js must read token via getSecureToken");
  assert.ok(readFile("src/socket.js").includes("getSecureToken"), "socket.js must read token via getSecureToken");
  assert.ok(readFile("src/socket.js").includes("removeSecureToken"), "socket.js forceLogout must clear token via removeSecureToken");
  assert.ok(readFile("src/socket.js").includes("clearTrackingSession"), "socket.js forceLogout must stop tracking session");
  assert.ok(readFile("src/screens/ProfileScreen.js").includes("removeSecureToken"), "ProfileScreen.js must clear token via removeSecureToken");
});

test("CRIT-04: Background location is not chained pre-login and Prominent Disclosure precedes location requests", () => {
  const preLogin = readFile("src/screens/PreLoginPermissionScreen.js");
  const grantBlockMatch = preLogin.match(/const handleGrantAllPermissions[\s\S]*?const handleOpenAppSettings/);
  assert.ok(grantBlockMatch, "handleGrantAllPermissions function should exist in PreLoginPermissionScreen.js");
  assert.ok(
    !grantBlockMatch[0].includes("requestBackgroundPermissionsAsync"),
    "PreLoginPermissionScreen must not chain requestBackgroundPermissionsAsync before login"
  );

  const attendance = readFile("src/screens/AttendanceScreen.js");
  assert.ok(
    attendance.includes("Location Access Disclosure"),
    "AttendanceScreen must show Location Access Disclosure before requesting foreground location if skipped pre-login"
  );
  assert.ok(
    attendance.includes("user?.trackingEnabled !== false"),
    "AttendanceScreen must only require background location when user.trackingEnabled !== false"
  );

  const customerVisit = readFile("src/screens/CustomerVisitScreen.js");
  assert.ok(
    customerVisit.includes("Location Access Disclosure"),
    "CustomerVisitScreen must show Location Access Disclosure before requesting foreground location"
  );

  if (fs.existsSync(path.resolve(MOBILE_ROOT, "src/modules/material/components/GeoCameraModal.js"))) {
    const geoCamera = readFile("src/modules/material/components/GeoCameraModal.js");
    assert.ok(
      geoCamera.includes("Location Access Disclosure"),
      "GeoCameraModal must show Location Access Disclosure before requesting foreground location"
    );
  }
});

test("CRIT-05 & HIGH-05: Release signing config, R8 minification, and Target SDK 36 are configured", () => {
  const buildGradle = readFile("android/app/build.gradle");
  assert.ok(
    buildGradle.includes("ANDROID_KEYSTORE_PATH") && buildGradle.includes("MYAPP_UPLOAD_STORE_FILE"),
    "android/app/build.gradle must support release keystore signing configuration"
  );
  assert.ok(
    !buildGradle.includes("signingConfigs.release.storeFile ? signingConfigs.release : signingConfigs.debug"),
    "android/app/build.gradle must not silently sign production release builds with debug.keystore"
  );

  const gradleProps = readFile("android/gradle.properties");
  assert.ok(
    gradleProps.includes("android.enableMinifyInReleaseBuilds=true"),
    "gradle.properties must enable R8 minification in release builds"
  );
  assert.ok(
    gradleProps.includes("android.enableShrinkResourcesInReleaseBuilds=true"),
    "gradle.properties must enable resource shrinking in release builds"
  );
  assert.ok(
    gradleProps.includes("android.targetSdkVersion=36"),
    "gradle.properties must target Android 16 (API 36)"
  );
  assert.ok(
    gradleProps.includes("android.compileSdkVersion=36"),
    "gradle.properties must compile against Android 16 (API 36)"
  );
});

test("HIGH-01 & LOW-02: Zero requestMediaLibraryPermissionsAsync or deprecated MediaTypeOptions in src/ and legacy storage permissions blocked", () => {
  const srcFiles = getAllJsFiles(path.join(MOBILE_ROOT, "src"));
  for (const file of srcFiles) {
    const content = fs.readFileSync(file, "utf8");
    const rel = path.relative(MOBILE_ROOT, file);
    assert.ok(
      !content.includes("requestMediaLibraryPermissionsAsync"),
      `${rel} must not call requestMediaLibraryPermissionsAsync (use Android system Photo Picker directly)`
    );
    assert.ok(
      !content.includes("MediaTypeOptions"),
      `${rel} must not use deprecated ImagePicker.MediaTypeOptions`
    );
  }

  const manifest = readFile("android/app/src/main/AndroidManifest.xml");
  for (const perm of [
    "android.permission.READ_EXTERNAL_STORAGE",
    "android.permission.WRITE_EXTERNAL_STORAGE",
    "android.permission.READ_MEDIA_IMAGES",
    "android.permission.READ_MEDIA_VIDEO",
    "android.permission.READ_MEDIA_AUDIO",
    "android.permission.RECORD_AUDIO",
  ]) {
    const regex = new RegExp(`<uses-permission[^>]*android:name="${perm.replace(/\./g, "\\.")}"[^>]*tools:node="remove"`);
    assert.ok(regex.test(manifest), `AndroidManifest.xml must block ${perm} with tools:node="remove"`);
  }
});

test("HIGH-02, LOW-01, LOW-03: Runtime version, app icons, and portrait orientation are synced", () => {
  const appJson = JSON.parse(readFile("app.json"));
  const pkgJson = JSON.parse(readFile("package.json"));
  const stringsXml = readFile("android/app/src/main/res/values/strings.xml");

  assert.equal(appJson.expo.version, pkgJson.version);
  assert.ok(appJson.expo.android.versionCode >= 3);
  assert.equal(appJson.expo.runtimeVersion, appJson.expo.version);
  assert.ok(
    stringsXml.includes(`<string name="expo_runtime_version">${appJson.expo.runtimeVersion}</string>`),
    `strings.xml expo_runtime_version must match app.json runtimeVersion (${appJson.expo.runtimeVersion})`
  );
  assert.equal(appJson.expo.icon, "./assets/icon.png", "app.json icon must point to ./assets/icon.png");
  assert.equal(
    appJson.expo.android.adaptiveIcon.foregroundImage,
    "./assets/adaptive-icon.png",
    "app.json adaptiveIcon.foregroundImage must point to ./assets/adaptive-icon.png"
  );
  assert.equal(appJson.expo.orientation, "portrait", "app.json orientation must be portrait");
});

test("HIGH-03: .gitignore excludes Firebase config files and tracks native Android release config", () => {
  const gitignore = readFile(".gitignore");
  assert.ok(gitignore.includes("google-services.json"), ".gitignore must ignore google-services.json");
  assert.ok(gitignore.includes("GoogleService-Info.plist"), ".gitignore must ignore GoogleService-Info.plist");
  assert.ok(!/^\/android\s*$/m.test(gitignore), ".gitignore must not ignore the entire /android folder");
});

test("HIGH-04: PDF download does not expose JWT token in URL query string and uses legacy FileSystem API", () => {
  const expenseApi = readFile("src/modules/hr/expense/api/expenseApi.js");
  assert.ok(
    !expenseApi.includes("?token="),
    "expenseApi.js must not append ?token= to PDF download URLs"
  );
  assert.ok(
    expenseApi.includes("expo-file-system/legacy"),
    "expenseApi.js must import expo-file-system/legacy on SDK 57"
  );

  const detailScreen = readFile("src/modules/hr/expense/screens/ExpenseClaimDetailScreen.js");
  assert.ok(
    !detailScreen.includes("?token="),
    "ExpenseClaimDetailScreen.js must not append ?token= to PDF download URLs"
  );
  assert.ok(
    detailScreen.includes("Authorization: `Bearer ${token}`"),
    "ExpenseClaimDetailScreen.js must pass JWT via Authorization header during file download"
  );
  assert.ok(
    detailScreen.includes("expo-file-system/legacy"),
    "ExpenseClaimDetailScreen.js must use expo-file-system/legacy"
  );
});

test("HIGH-06: Privacy Policy & Data Safety reference documentation exists and matches app capabilities", () => {
  const doc = readFile("PRIVACY_POLICY_AND_DATA_SAFETY.md");
  assert.ok(doc.includes("ACCESS_BACKGROUND_LOCATION"), "Must document background location collection");
  assert.ok(doc.includes("Data Safety Section Matrix"), "Must include Play Console Data Safety matrix");
  assert.ok(doc.includes("Enterprise B2B Account Model"), "Must document enterprise B2B account model");
  assert.ok(doc.includes("Application.getAndroidId()"), "Must disclose Android hardware identifier collection");
  assert.ok(doc.includes("Emergency Reference Contacts"), "Must disclose emergency reference contact collection");

  const editProfileModal = readFile("src/components/EditProfileModal.js");
  assert.ok(!editProfileModal.includes("bloodGroup"), "EditProfileModal must not collect medical bloodGroup data");
});

test("HIGH-07: Mobile password update minimum 8-char password is enforced", () => {
  const editProfileModal = readFile("src/components/EditProfileModal.js");
  assert.ok(
    editProfileModal.includes("trimmedPass.length < 8"),
    "EditProfileModal.js must enforce at least 8 characters for passwords"
  );
});

test("MED-01, MED-02, MED-03, MED-04: Babel production console stripping, env safety, and dismissible battery prompt", () => {
  const babelConfig = readFile("babel.config.js");
  assert.ok(
    babelConfig.includes("transform-remove-console"),
    "babel.config.js must configure transform-remove-console for production builds"
  );
  assert.ok(
    babelConfig.includes("process.env[m[1]] === undefined"),
    "babel.config.js must not overwrite existing process.env variables"
  );

  const batteryOpt = readFile("src/services/batteryOptimization.js");
  assert.ok(
    batteryOpt.includes("text: 'Later'"),
    "batteryOptimization.js prompt must include a dismissible 'Later' button"
  );
});

test("CRIT-NEW-01 & HIGH-NEW-01..03: Punch-In Prominent Disclosure reachable, AppState skip preserved, 401 stops tracking, and google-services guarded", () => {
  const attendance = readFile("src/screens/AttendanceScreen.js");
  assert.ok(
    !attendance.includes('Location is set to "While using app"'),
    "AttendanceScreen Punch-In button must not intercept with non-compliant 'While using app' alert before Prominent Disclosure"
  );
  assert.ok(
    attendance.includes("handlePunchIn(false)"),
    "AttendanceScreen Punch-In button must invoke handlePunchIn(false) so Prominent Disclosure executes"
  );

  const appJs = readFile("App.js");
  assert.ok(
    appJs.includes("permissionSkippedRef"),
    "App.js must preserve permissionSkippedRef across AppState transitions so NavigationContainer is not unmounted"
  );

  const axiosJs = readFile("src/api/axios.js");
  assert.ok(
    axiosJs.includes("clearTrackingSession"),
    "axios.js 401 interceptor must call clearTrackingSession() before redirecting to Login"
  );

  const buildGradle = readFile("android/app/build.gradle");
  assert.ok(
    buildGradle.includes('if (file("google-services.json").exists())'),
    "android/app/build.gradle must guard com.google.gms.google-services plugin with file existence check"
  );

  const imageUrlJs = readFile("src/utils/imageUrl.js");
  const count = imageUrlJs.split("https://res.cloudinary.com/").length - 1;
  assert.ok(
    count >= 2,
    "Both getFullProfileImageUrl and resolveProofImageUrl must upgrade http://res.cloudinary.com/ to https://"
  );

  const envExample = readFile(".env_example");
  assert.ok(
    !envExample.includes("EXPO_PUBLIC_SOCKET_URL=EXPO_PUBLIC_API_URL="),
    ".env_example must not contain duplicate key assignment on EXPO_PUBLIC_SOCKET_URL"
  );
});

test("CRIT-03 & MED-01 (Audit Pass 2): No mock/dummy attachment URLs, PDF picker supported, ACCESS_WIFI_STATE removed, and backend hardened", () => {
  if (fs.existsSync(path.resolve(MOBILE_ROOT, "src/modules/material/screens/ConvertMaterialScreen.js"))) {
    const convertMaterial = readFile("src/modules/material/screens/ConvertMaterialScreen.js");
    assert.ok(
      !convertMaterial.includes("dummy.pdf") && !convertMaterial.includes("example.com/note.docx"),
      "ConvertMaterialScreen.js must not contain hardcoded dummy attachment URLs"
    );
    assert.ok(
      convertMaterial.includes("DocumentPicker.getDocumentAsync"),
      "ConvertMaterialScreen.js must use real DocumentPicker.getDocumentAsync"
    );
  }

  if (fs.existsSync(path.resolve(MOBILE_ROOT, "src/modules/material/screens/ExchangeBarcodeScreen.js"))) {
    const exchangeBarcode = readFile("src/modules/material/screens/ExchangeBarcodeScreen.js");
    assert.ok(
      !exchangeBarcode.includes("mms-documents.example.com"),
      "ExchangeBarcodeScreen.js must not contain hardcoded fake example.com attachment URLs"
    );
    assert.ok(
      exchangeBarcode.includes("DocumentPicker.getDocumentAsync"),
      "ExchangeBarcodeScreen.js must use real DocumentPicker.getDocumentAsync"
    );
  }

  const receiptUploader = readFile("src/modules/hr/expense/components/ReceiptUploader.js");
  assert.ok(
    receiptUploader.includes("DocumentPicker.getDocumentAsync"),
    "ReceiptUploader.js must support PDF selection via DocumentPicker.getDocumentAsync"
  );

  const appJson = JSON.parse(readFile("app.json"));
  assert.ok(
    !appJson.expo.android.permissions.includes("ACCESS_WIFI_STATE"),
    "app.json must not request unnecessary ACCESS_WIFI_STATE permission"
  );
  assert.equal(
    appJson.expo.updates.fallbackToCacheTimeout,
    10000,
    "app.json updates.fallbackToCacheTimeout must be 10000"
  );

  const manifest = readFile("android/app/src/main/AndroidManifest.xml");
  assert.ok(
    !manifest.includes('android:name="android.permission.ACCESS_WIFI_STATE"'),
    "AndroidManifest.xml must not include unnecessary ACCESS_WIFI_STATE permission"
  );
});

test("Audit Pass 3: ForegroundServiceType location, EAS keystore & google-services fallback, sequential BG location, HTTPS upgrade, and in-app deletion request", () => {
  const manifest = readFile("android/app/src/main/AndroidManifest.xml");
  assert.ok(
    manifest.includes('android:name="expo.modules.location.services.LocationTaskService"') &&
      manifest.includes('android:foregroundServiceType="location"'),
    "AndroidManifest.xml must explicitly declare LocationTaskService with foregroundServiceType=location"
  );

  const buildGradle = readFile("android/app/build.gradle");
  assert.ok(
    buildGradle.includes("gradle.taskGraph.whenReady"),
    "android/app/build.gradle must defer release keystore check to gradle.taskGraph.whenReady for EAS Build compatibility"
  );
  assert.ok(
    buildGradle.includes("GOOGLE_SERVICES_JSON"),
    "android/app/build.gradle must support copying google-services.json from parent or GOOGLE_SERVICES_JSON env"
  );
  assert.ok(
    !buildGradle.includes("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY"),
    "android/app/build.gradle must not reference EXPO_PUBLIC_GOOGLE_MAPS_API_KEY"
  );

  const appConfig = readFile("app.config.js");
  assert.ok(
    !appConfig.includes("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY"),
    "app.config.js must not reference EXPO_PUBLIC_GOOGLE_MAPS_API_KEY"
  );

  const attendance = readFile("src/screens/AttendanceScreen.js");
  assert.ok(
    !attendance.includes("const requestCameraPermission"),
    "AttendanceScreen.js must not contain unused requestCameraPermission helper"
  );
  const bannerMatch = attendance.match(/Background Location Disclosure[\s\S]*?<Text className="text-white font-bold text-xs">Allow<\/Text>/);
  assert.ok(
    bannerMatch && bannerMatch[0].includes("getForegroundPermissionsAsync") && bannerMatch[0].includes("requestForegroundPermissionsAsync"),
    "AttendanceScreen Background Location Disclosure banner must ensure foreground location is granted before requesting background location"
  );

  const notifications = readFile("src/utils/notifications.js");
  assert.ok(
    notifications.includes("if (!token && __DEV__)"),
    "notifications.js must only generate simulated tokens in __DEV__ mode"
  );

  const axiosJs = readFile("src/api/axios.js");
  assert.ok(
    axiosJs.includes('cleaned.replace(/^http:\\/\\//i, "https://")'),
    "axios.js must upgrade non-LAN http:// URLs to https:// in production"
  );

  const socketJs = readFile("src/socket.js");
  assert.ok(
    socketJs.includes("clean.replace(/^http:\\/\\//i, 'https://')"),
    "socket.js must upgrade non-LAN http:// URLs to https:// in production"
  );

  const profileScreen = readFile("src/screens/ProfileScreen.js");
  assert.ok(
    !profileScreen.includes("/auth/deletion-request") && !profileScreen.includes("data-deletion"),
    "ProfileScreen.js must not contain unused account deletion request code"
  );
});

test("Audit Pass 4: .easignore Firebase bridge, usesCleartextTraffic=false, and ErrorBoundary production guard", () => {
  const easignore = readFile(".easignore");
  assert.ok(
    !easignore.includes("\ngoogle-services.json") && !easignore.includes("\nGoogleService-Info.plist"),
    ".easignore must allow google-services.json and GoogleService-Info.plist to be uploaded to EAS Build"
  );

  const appConfig = readFile("app.config.js");
  assert.ok(
    appConfig.includes("process.env.GOOGLE_SERVICES_JSON"),
    "app.config.js must support process.env.GOOGLE_SERVICES_JSON for EAS File Secrets"
  );

  const manifest = readFile("android/app/src/main/AndroidManifest.xml");
  assert.ok(
    manifest.includes('android:usesCleartextTraffic="false"'),
    'AndroidManifest.xml must explicitly declare android:usesCleartextTraffic="false"'
  );

  const loginScreen = readFile("src/screens/LoginScreen.js");
  assert.ok(
    !loginScreen.includes("data-deletion"),
    "LoginScreen.js must not contain unused data-deletion link"
  );

  const errorBoundary = readFile("src/components/ErrorBoundary.js");
  assert.ok(
    errorBoundary.includes("__DEV__"),
    "ErrorBoundary.js must gate raw exception messages behind __DEV__"
  );
});

test("Audit Pass 5: Android 14-16 FGS background start guard, unused Maps key removal, Dashboard GPS permission guard, and Manifest/scheme sync", () => {
  const trackingManager = readFile("src/services/trackingManager.js");
  assert.ok(
    trackingManager.includes("AppState.currentState === 'active'") &&
      trackingManager.includes("AppState.currentState !== 'active'"),
    "trackingManager.js must guard Foreground Service start/restart against background AppState on Android 14-16"
  );

  const watchdog = readFile("src/services/selfHealingWatchdog.js");
  assert.ok(
    watchdog.includes("AppState.currentState"),
    "selfHealingWatchdog.js must check AppState.currentState before restarting GPS watcher in background"
  );

  const heartbeat = readFile("src/services/heartbeat.service.js");
  assert.ok(
    heartbeat.includes("AppState.currentState"),
    "heartbeat.service.js must check AppState.currentState and background permissions on remote restart"
  );

  const manifest = readFile("android/app/src/main/AndroidManifest.xml");
  assert.ok(
    !manifest.includes("com.google.android.geo.API_KEY"),
    "AndroidManifest.xml must not embed unused com.google.android.geo.API_KEY metadata"
  );
  assert.ok(
    !manifest.includes("org.apache.http.legacy"),
    "AndroidManifest.xml must not include deprecated org.apache.http.legacy library"
  );
  assert.ok(
    manifest.includes('android:enableOnBackInvokedCallback="true"'),
    "AndroidManifest.xml must enable predictive back gesture on Target SDK 36"
  );

  const dashboard = readFile("src/screens/DashboardScreen.js");
  assert.ok(
    dashboard.includes("Location.getForegroundPermissionsAsync"),
    "DashboardScreen.js must verify foreground location permission before querying device GPS"
  );

  const appJson = JSON.parse(readFile("app.json"));
  assert.ok(
    Array.isArray(appJson.expo.scheme) &&
      appJson.expo.scheme.includes("gatimaan") &&
      appJson.expo.scheme.includes("trackflow"),
    "app.json scheme must include both gatimaan and trackflow matching AndroidManifest.xml"
  );
});

test("Audit Pass 6: Foreground-before-Background location in handlePunchIn, standalone Location disclosure, no Coming Soon placeholders, and StoreDispatch DocumentPicker", () => {
  const attendance = readFile("src/screens/AttendanceScreen.js");
  const punchInIdx = attendance.indexOf("const handlePunchIn = async");
  assert.ok(punchInIdx !== -1, "handlePunchIn must exist in AttendanceScreen.js");
  const punchInSlice = attendance.slice(punchInIdx, punchInIdx + 2500);
  const fgIdx = punchInSlice.indexOf("Location.getForegroundPermissionsAsync()");
  const bgIdx = punchInSlice.indexOf("Location.getBackgroundPermissionsAsync()");
  assert.ok(
    fgIdx !== -1 && bgIdx !== -1 && fgIdx < bgIdx,
    "handlePunchIn must verify foreground location permission before requesting background location permission"
  );

  const preLogin = readFile("src/screens/PreLoginPermissionScreen.js");
  assert.ok(
    !preLogin.includes("Notifications.requestPermissionsAsync"),
    "PreLoginPermissionScreen.js must be dedicated to Location Prominent Disclosure without bundling Notifications.requestPermissionsAsync"
  );

  const globalFooter = readFile("src/components/GlobalAppFooter.js");
  const dashboard = readFile("src/screens/DashboardScreen.js");
  const sidebar = readFile("src/components/SidebarDrawer.js");
  const hrScreen = readFile("src/screens/HRScreen.js");
  for (const [name, content] of [
    ["GlobalAppFooter.js", globalFooter],
    ["DashboardScreen.js", dashboard],
    ["SidebarDrawer.js", sidebar],
    ["HRScreen.js", hrScreen],
  ]) {
    assert.ok(
      !/coming\s*soon/i.test(content),
      `${name} must not contain 'Coming Soon' placeholder text or alerts`
    );
  }
  assert.ok(
    globalFooter.includes("useSafeAreaInsets"),
    "GlobalAppFooter.js must use useSafeAreaInsets for Android 15/16 Edge-to-Edge bottom bar spacing"
  );

  if (fs.existsSync(path.resolve(MOBILE_ROOT, "src/modules/material/screens/StoreDispatchScreen.js"))) {
    const storeDispatch = readFile("src/modules/material/screens/StoreDispatchScreen.js");
    assert.ok(
      storeDispatch.includes("DocumentPicker.getDocumentAsync"),
      "StoreDispatchScreen.js must support document selection via DocumentPicker.getDocumentAsync"
    );
  }

  const profileScreen = readFile("src/screens/ProfileScreen.js");
  assert.ok(
    !profileScreen.includes("AsyncStorage.clear()") && !sidebar.includes("AsyncStorage.clear()"),
    "Logout handlers must use AsyncStorage.multiRemove instead of AsyncStorage.clear() to preserve consent and tenant code"
  );
});

test("Audit Pass 7: Backend URL leak prevention, FGS foreground upgrade, and Camera/Location Open Settings recovery", () => {
  const indexJs = readFile("index.js");
  assert.ok(
    !indexJs.includes("railway.app") && !indexJs.includes("EXPO_PUBLIC_API_URL"),
    "index.js must not log raw backend API or Socket URLs on startup"
  );

  const socketJs = readFile("src/socket.js");
  assert.ok(
    !socketJs.includes("Connected successfully to:"),
    "socket.js must not leak SOCKET_URL in connect console logs"
  );
  assert.ok(
    socketJs.includes("gatimaan-production.up.railway.app"),
    "socket.js must guard against deprecated gatimaan-production.up.railway.app URL"
  );

  const axiosJs = readFile("src/api/axios.js");
  assert.ok(
    !axiosJs.includes("for ${config.url}"),
    "axios.js must not leak request URLs in auto-retry console logs"
  );
  assert.ok(
    axiosJs.includes("gatimaan-production.up.railway.app"),
    "axios.js must guard against deprecated gatimaan-production.up.railway.app URL"
  );

  const imageUrlJs = readFile("src/utils/imageUrl.js");
  assert.ok(
    imageUrlJs.includes("gatimaan-production.up.railway.app"),
    "imageUrl.js must guard against deprecated gatimaan-production.up.railway.app URL"
  );

  const editProfileModal = readFile("src/components/EditProfileModal.js");
  assert.ok(
    !editProfileModal.toLowerCase().includes("railway"),
    "EditProfileModal.js must not leak backend hosting provider (Railway) in user error messages"
  );

  for (const rel of [
    "src/modules/material/screens/ReturnMaterialScreen.js",
    "src/modules/material/screens/ReturnMultipleScreen.js",
    "src/modules/material/screens/TransferMaterialScreen.js",
  ]) {
    if (!fs.existsSync(path.resolve(MOBILE_ROOT, rel))) continue;
    const content = readFile(rel);
    assert.ok(
      !content.includes("dummy.pdf") && !content.includes("example.com/note.docx") && !content.includes("unsplash.com"),
      `${rel} must not contain hardcoded dummy/unsplash attachment URLs`
    );
    assert.ok(
      content.includes("DocumentPicker.getDocumentAsync"),
      `${rel} must use real DocumentPicker.getDocumentAsync`
    );
  }

  for (const rel of [
    "src/screens/AttendanceScreen.js",
    "src/screens/CustomerVisitScreen.js",
    "src/screens/ProfileScreen.js",
    "src/modules/hr/expense/components/ReceiptUploader.js",
    "src/modules/hr/expense/screens/CreateExpenseClaimScreen.js",
    "src/modules/hr/expense/screens/PettyCashWalletScreen.js",
  ]) {
    const content = readFile(rel);
    assert.ok(
      content.includes("Linking.openSettings"),
      `${rel} must provide Linking.openSettings() recovery when camera/location permissions are denied`
    );
  }
});

test("Audit Pass 8: POST_NOTIFICATIONS requested post-login, BarcodeScannerModal disclosure before OS prompt, and backend auth/debug/CORS hardened", () => {
  const notifications = readFile("src/utils/notifications.js");
  assert.ok(
    notifications.includes("registerPushToken(requestIfUndetermined = true)"),
    "notifications.js must default requestIfUndetermined = true so POST_NOTIFICATIONS is requested on Android 13-16"
  );

  const loginScreen = readFile("src/screens/LoginScreen.js");
  const pushCalls = loginScreen.split("registerPushToken(true)").length - 1;
  assert.ok(
    pushCalls >= 2,
    "LoginScreen.js must call registerPushToken(true) after login and session restore"
  );

  if (fs.existsSync(path.resolve(MOBILE_ROOT, "src/modules/material/components/BarcodeScannerModal.js"))) {
    const barcodeModal = readFile("src/modules/material/components/BarcodeScannerModal.js");
    assert.ok(
      barcodeModal.includes("else if (permission && permission.granted)"),
      "BarcodeScannerModal.js must only auto-request camera on mount if already granted, allowing user to read in-app disclosure first"
    );
  }

  const settingsGradle = readFile("android/settings.gradle");
  assert.ok(
    settingsGradle.includes("autolinking.json") && settingsGradle.includes("deleteDir()"),
    "android/settings.gradle must purge stale cross-OS autolinking.json before EAS Linux Gradle build"
  );

  const rootEasIgnore = readFile(".easignore", REPO_ROOT);
  assert.ok(
    rootEasIgnore.includes("**/android/build/") && rootEasIgnore.includes("**/android/.gradle/"),
    "Root .easignore must exclude **/android/build/ and **/android/.gradle/ from EAS build archives"
  );
});

test("Crash Prevention: RECEIVE_BOOT_COMPLETED is retained for expo-task-manager persisted JobScheduler jobs and MarqueeText stays under GPU texture limit", () => {
  const appJson = JSON.parse(readFile("app.json"));
  assert.ok(
    appJson.expo.android.permissions.includes("RECEIVE_BOOT_COMPLETED"),
    "app.json must include RECEIVE_BOOT_COMPLETED for expo-task-manager JobInfo.Builder.setPersisted(true)"
  );
  assert.ok(
    !appJson.expo.android.blockedPermissions.includes("android.permission.RECEIVE_BOOT_COMPLETED"),
    "app.json must not block android.permission.RECEIVE_BOOT_COMPLETED"
  );

  const manifest = readFile("android/app/src/main/AndroidManifest.xml");
  assert.ok(
    manifest.includes('<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>') &&
      !manifest.includes('android:name="android.permission.RECEIVE_BOOT_COMPLETED" tools:node="remove"'),
    "AndroidManifest.xml must declare RECEIVE_BOOT_COMPLETED without tools:node=remove"
  );

  const marquee = readFile("src/components/MarqueeText.js");
  assert.ok(
    !marquee.includes("width * 25") && marquee.includes("PixelRatio"),
    "MarqueeText.js must cap MEASURE_WIDTH using PixelRatio below Android GPU texture limits"
  );

  const attendance = readFile("src/screens/AttendanceScreen.js");
  assert.ok(
    !attendance.includes("Punch In Anyway") &&
      attendance.includes("!alreadyPunchedIn && Platform.OS === 'android' && user?.trackingEnabled !== false && hasBackgroundPermission !== true"),
    "AttendanceScreen.js must hide Punch In button until 'Allow all the time' background location is granted for tracked employees"
  );
});



