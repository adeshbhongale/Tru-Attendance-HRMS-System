# Geo-Attendance HRMS System

A comprehensive HRMS solution with real-time GPS tracking, geo-fencing, and shift management for organizations with field and office employees.

---

## 🚀 Installation & Setup

### 1. Prerequisites
Ensure you have the following installed:
- **Node.js** v18.0.0 or higher
- **MongoDB** v5.0 or higher (running locally or Atlas)

### 2. Backend Setup
```bash
cd backend
npm install
npm run seedmore  # Seed database with comprehensive configuration & mock records
npm run dev       # Start backend server
```

### 3. Admin Panel Setup
```bash
cd admin-panel
npm install
npm run dev       # Start admin web portal
```

### 4. Mobile App Setup
```bash
cd mobile-app
npm install
npm start         # Start Expo development server
```

---

## 🏃 Running the Application

Start each service in a separate terminal:

1. **Backend**: `cd backend && npm run dev`
2. **Admin Panel**: `cd admin-panel && npm run dev`
3. **Mobile App**: `cd mobile-app && npm start`

---

## 💾 Essential Scripts (As defined in package.json)

### Backend
- `npm run dev` - Start development server using nodemon
- `npm start` - Start production server using node
- `npm run seedmore` - Seed comprehensive historical logs & demo data
- `npm run admin` - Create administrator account manually
- `npm run reset` - Reset database tables (wipes existing data)
- `npm run bench` - Run application benchmarks
- `npm run simulate` - Run real-time background location simulation

### Admin Panel
- `npm run dev` - Start development server
- `npm run build` - Build production bundle
- `npm run lint` - Run ESLint checking
- `npm run preview` - Preview production build locally

### Mobile App
- `npm start` - Start Expo development server
- `npm run build` - Export production bundle
- `npm run android` - Compile and run on Android emulator/device
- `npm run ios` - Compile and run on iOS simulator/device
- `npm run web` - Run in browser


---

## 🖥️ Website (Admin Panel) Pages & Functionalities

The Web Admin Panel provides a comprehensive administrative dashboard for HR managers and administrators to configure, manage, and monitor the workforce.

*   **📊 Dashboard**: Real-time overview of active employees, daily attendance counts (Present, Late, Half Day, Absent, On Leave, Neutral), live location tracking map, and dynamic trend analytics.
*   **👥 Staff Directory (Employees)**: Create, edit, and delete employee profiles. Supports bulk onboarding via Excel imports, automatic password hashing, interactive credential sharing, and role-based access assignments.
*   **🕒 Attendance Tracking**: Interactive grid monitoring daily check-ins and check-outs, including dynamic geofence checks (Inside/Outside indicators) and exact coordinates.
*   **📅 Leave Management & Dashboard**: Centralized panel to review, approve, or reject employee leave requests with optional admin notes. Includes a month-specific statistics summary.
*   **🔄 Shift Management**: Configure shifts with unique start/end timings, grace periods, and half-day cutoff limits. Assign employees to shifts and track coverage.
*   **📈 Reports & Analytics**: Generate landscape-optimized PDF sheets and Excel-compatible CSV exports for daily/monthly attendance history. Includes multi-day range aggregations.
*   **📢 Notifications Console**: Create, schedule, and broadcast custom announcement campaigns (All, Departments, or Specific Employees). Configures automated triggers (e.g., late/absent reminders) synced with Firebase/Expo push notifications.
*   **🧠 AI Performance Leaderboard**: Ranks employees dynamically using a batch-processed Gemini AI evaluation or a weighted fallback HR model, showing 12 granular metrics inside expandable glassmorphic drawers.
*   **⚙️ Office Setup Configuration**: Dedicated panels for configuring operational entities:
    *   *Departments & Designations*: Live count displays tracking employee counts case-sensitively.
    *   *Holidays & WeekOffs*: Custom popover date pickers for scheduling public holidays, and a full-width grid validation layout for weekly off configurations.
    *   *Shift Setup & Working Places*: Manage remote/office geolocation geofences and radii.

---

## 📱 Mobile App Screens & Functionalities

The React Native Mobile App is tailored for employees to seamlessly log their attendance, review schedules, apply for leaves, and track telemetry.

*   **🔐 Authentication (Login)**: Secure authentication via password or OTP (One-Time Password) with persistent login sessions.
*   **🏠 Main Dashboard**: Features dynamic action buttons for Punch-In (requires selfie verification) and Punch-Out. Includes fail-safe guards disabling punches on weekly offs or approved leave days.
*   **📍 Location Tracking & Route Map**: Displays the employee's current coordinates relative to geofenced office areas. Wakes background tracking and sends verified movement logs to the backend.
*   **📅 Monthly Attendance View**: Provides a calendar visualizing check-in statuses (Present, Late, Half Day, Leave, Absent) with dot indicators, hiding status indicators on future dates.
*   **✉️ Leave Applications**: Form to request Sick, Casual, Paid, Emergency, or Half-day leaves. Fetches and updates quotas and leave balances dynamically.
*   **👤 Employee Profile**: View personal records, contact credentials, assigned shift timings, and access quick, high-visibility sign-out configurations.
*   **🗺️ Track My Route**: Visualizes day-wise movement routes on an interactive map. Automatically locks maps and telemetry on holidays or approved leaves.
*   **🔔 Notification Drawer**: View push announcements and alerts. Automatically clears unread markers for attendance alerts when the employee successfully punches in.

---

## 📞 Support

For issues or questions:

1. Check [project.md](./project.md) for detailed documentation
2. Review troubleshooting section above
3. Check terminal logs for error messages
4. Verify all prerequisites are installed

---

## 📄 License

This project is proprietary software. All rights reserved.

---

## 🔒 Secure Setup (Firebase & Apple Push Notification Config)

To run this project securely and enable notification/authentication features, you must configure Firebase credentials for both Android and iOS devices.

### 1. Android Configuration (`google-services.json`)
1. Go to the **Firebase Console** and select your project.
2. Click **Add App** and select **Android**.
3. Register the app with the Package Name: `com.adesh.trackflow`.
4. Download the `google-services.json` file.
5. Place the downloaded `google-services.json` file in the root of the **`mobile-app/`** directory.

### 2. iOS/Apple Configuration (`GoogleService-Info.plist`)
1. In the **Firebase Console**, click **Add App** and select **iOS**.
2. Register the app with the Apple Bundle ID: `com.adesh.trackflow`.
3. Download the `GoogleService-Info.plist` file.
4. Place the downloaded `GoogleService-Info.plist` file in the root of the **`mobile-app/`** directory.

### 3. Security Check (Git Configuration)
To prevent committing these sensitive configuration files to public repositories, confirm that both files are ignored in your **`mobile-app/.gitignore`**:
```gitignore
# Firebase configurations
/google-services.json
/GoogleService-Info.plist
```

### 4. How Expo Loads These Configurations
The configurations are mapped inside **`mobile-app/app.json`** to build native credentials dynamically:
- **Android**: `"googleServicesFile": "./google-services.json"`
- **iOS**: `"googleServicesFile": "./GoogleService-Info.plist"`

### 5. Testing with the Expo Go App
To test the mobile app on a physical device using the **Expo Go** testing application:

1. **Install Expo Go**: Download and install the "Expo Go" app on your physical device from the Google Play Store (Android) or App Store (iOS).
2. **Connect to Same Network**: Make sure both your development machine (running the server) and your mobile device are connected to the **same Wi-Fi network**.
3. **Start the Dev Server**: Run the following command in the `mobile-app` directory:
   ```bash
   npx expo start
   ```
4. **Scan the QR Code**:
   - **On Android**: Open the Expo Go app and use the "Scan QR Code" option to scan the QR code printed in the terminal.
   - **On iOS**: Open the native iOS Camera app, point it at the QR code, and tap the link overlay to open the project inside Expo Go.
5. **Set Local API Endpoint**: Verify that your `mobile-app/src/api/axios.js` file is pointed to your computer's local IP address (e.g., `http://192.168.x.x:5000/api`) so the mobile app can reach the backend server over Wi-Fi.

---