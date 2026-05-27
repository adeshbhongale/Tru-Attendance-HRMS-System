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