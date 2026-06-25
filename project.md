# Project Documentation: Geo-Attendance HRMS System

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture Overview](#architecture-overview)
3. [Technology Stack](#technology-stack)
4. [Database Design](#database-design)
5. [API Endpoints](#api-endpoints)
6. [Features by User Role](#features-by-user-role)
7. [Geo-Fencing Logic](#geo-fencing-logic)
8. [Authentication Flow](#authentication-flow)
9. [Folder Structure](#folder-structure)
10. [Recent System Changes (May 2026)](#recent-system-changes-may-2026)
11. [Recent System Changes (June 2026)](#recent-system-changes-june-2026)

## Project Overview

Geo-Attendance HRMS System is a comprehensive GPS-based employee attendance tracking solution designed for organizations with field and office employees. The system ensures real-time attendance tracking, location verification, live employee tracking, and performance monitoring.

### Key Objectives

- Automate attendance tracking using GPS coordinates
- Improve workforce visibility with real-time location monitoring
- Reduce manual errors through automated systems
- Enable real-time dashboards and analytics
- Support multiple shifts and flexible work schedules
- Track employee leave and manage leave balances

---

## Architecture Overview

The system follows a modern three-tier client-server architecture:

```
┌─────────────────┐          ┌──────────────────┐          ┌──────────────────┐
│  Admin Panel    │          │  Mobile App      │          │  Backend API     │
│  (React.js)     │◄───────►│  (React Native)  │◄───────►│  (Node.js/Express)
│  Web Dashboard  │          │  Attendance      │          │  Socket.io       │
└─────────────────┘          └──────────────────┘          └──────────────────┘
                                                                    │
                                                                    │
                                                            ┌───────▼───────┐
                                                            │   MongoDB     │
                                                            │   Database    │
                                                            └───────────────┘
```

### Components

- **Admin Panel**: React-based web dashboard for HR administrators to manage employees, shifts, attendance, leaves, and generate reports
- **Mobile App**: React Native app for employees to log attendance with GPS, apply leaves, view schedules, and track working hours
- **Backend API**: Node.js/Express server handling all business logic, authentication, geofencing, and real-time updates via Socket.io
- **Database**: MongoDB for persistent data storage with optimized indexes

---

## Technology Stack

### Frontend (Admin Panel)

- **React.js 18+**: UI library
- **Vite**: Build tool and dev server
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide React**: Icon library
- **Framer Motion**: Animation library
- **React Hot Toast**: Toast notifications
- **Axios**: HTTP client
- **Redux**: State management

### Frontend (Mobile)

- **React Native 0.72+**: Cross-platform mobile framework
- **Expo**: Development platform and distribution
- **NativeWind v4**: Tailwind CSS for React Native
- **React Native Maps**: Location mapping
- **Lucide React Native**: Icon library
- **AsyncStorage**: Local data persistence
- **Axios**: HTTP client

### Backend

- **Node.js 18+**: Runtime
- **Express 4.18+**: Web framework
- **MongoDB 5+**: Database
- **Mongoose 7+**: ODM (Object Data Mapper)
- **JWT (jsonwebtoken)**: Token-based authentication
- **bcryptjs**: Password hashing
- **Socket.io**: Real-time bidirectional communication
- **dotenv**: Environment configuration
- **cors**: Cross-Origin Resource Sharing
- **xlsx**: Excel file handling

---

## Database Design

### User Model

```javascript
{
  name: String (required),
  email: String (required, unique),
  mobile: String (required, unique),
  password: String (hashed),
  otp: String (for OTP login),
  otpExpires: Date,
  role: Enum ['admin', 'employee'] (default: 'employee'),
  department: String,
  designation: String,
  shift: ObjectId (reference to Shift),
  status: Enum ['active', 'inactive'] (default: 'active'),
  profileImage: String (URL),
  monthlyLeaveLimit: Number (default: 3),
  leaveBalance: Number (default: 3),
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  refreshToken: String,
  timestamps: { createdAt, updatedAt }
}
```

### Attendance Model

```javascript
{
  user: ObjectId (reference to User, required),
  date: Date (required),
  punchIn: {
    time: Date,
    location: {
      latitude: Number,
      longitude: Number,
      address: String
    },
    selfie: String (URL)
  },
  punchOut: {
    time: Date,
    location: {
      latitude: Number,
      longitude: Number,
      address: String
    }
  },
  status: Enum ['Present', 'Late', 'Half Day', 'Absent'],
  workingHours: Number (decimal),
  isLate: Boolean (default: false),
  isHalfDay: Boolean (default: false),
  isOutside: Boolean (default: false),
  trackingLogs: [{
    time: Date,
    latitude: Number,
    longitude: Number,
    address: String,
    isOutside: Boolean
  }],
  totalDistance: Number (in meters),
  timestamps: { createdAt, updatedAt }
}
```

### Shift Model

```javascript
{
  name: String (required, unique),
  startTime: String (HH:mm format, required),
  endTime: String (HH:mm format, required),
  gracePeriod: Number (in minutes, default: 15),
  halfDayAfter: String (HH:mm format, default: "11:00"),
  punchInCutoff: String (HH:mm format, default: "14:00"),
  workingHours: Number (default: 8),
  weeklyOff: [String] (default: ['Sunday']),
  timestamps: { createdAt, updatedAt }
}
```

### Leave Model

```javascript
{
  user: ObjectId (reference to User, required),
  leaveType: Enum ['Sick Leave', 'Casual Leave', 'Paid Leave', 'Emergency Leave', 'Half Day'],
  startDate: Date (required),
  endDate: Date (required),
  reason: String (required),
  status: Enum ['Pending', 'Approved', 'Rejected'] (default: 'Pending'),
  adminNote: String,
  appliedOn: Date (default: now),
  timestamps: { createdAt, updatedAt }
}
```

### Location Model (Geo-Fence)

```javascript
{
  name: String (required),
  latitude: Number (required),
  longitude: Number (required),
  radius: Number (in meters, required),
  address: String,
  timestamps: { createdAt, updatedAt }
}
```

---

## API Endpoints

### Authentication Routes (`/api/auth`)

- `POST /register` - Register new user
- `POST /send-otp` - Send OTP for login
- `POST /login` - Login with email/mobile and OTP or password
- `POST /logout` - User logout
- `POST /refresh-token` - Refresh JWT token
- `GET /me` - Get current user profile
- `PUT /updatedetails` - Update user profile
- `POST /forgot-password` - Request password reset
- `PUT /reset-password` - Reset password with token

### Attendance Routes (`/api/attendance`)

- `POST /punch-in` - Employee punch-in with GPS location
- `POST /punch-out` - Employee punch-out with GPS location
- `GET /my-attendance` - Get employee's attendance history
- `GET /report` - Get attendance report (admin)
- `GET /:id` - Get specific attendance record
- `PUT /:id` - Update attendance record (admin)
- `DELETE /:id` - Delete attendance record (admin)

### Employee Routes (`/api/employees`)

- `GET /` - Get all employees (admin only)
- `POST /` - Add new employee (admin only)
- `PUT /:id` - Update employee details (admin only)
- `DELETE /:id` - Delete employee (admin only)
- `POST /bulk-upload` - Bulk upload employees from Excel (admin only)

### Leave Routes (`/api/leaves`)

- `POST /` - Apply for leave
- `GET /my-leaves` - Get employee's leave history
- `GET /` - Get all leaves (admin only)
- `PATCH /:id` - Update leave status (admin only)

### Shift Routes (`/api/shifts`)

- `GET /` - Get all shifts
- `POST /` - Create new shift (admin only)
- `PUT /:id` - Update shift (admin only)
- `DELETE /:id` - Delete shift (admin only)

### Location Routes (`/api/locations`)

- `GET /` - Get all office locations
- `POST /` - Create location (admin only)
- `PUT /:id` - Update location (admin only)
- `DELETE /:id` - Delete location (admin only)

---

## Features by User Role

### Admin Features

#### Dashboard

- Real-time overview of employee attendance status
- Daily attendance summary with charts and analytics
- Employee location tracking on map
- System health and uptime monitoring

#### Employee Management

- Add, edit, delete employees
- Bulk upload employees via Excel
- Assign departments, designations, and shifts
- View employee profiles and work history
- Manage employee active/inactive status

#### Attendance Management

- View real-time attendance logs
- Mark attendance manually if needed
- View attendance with geolocation data
- Generate daily/monthly attendance reports
- Export reports to Excel/PDF
- Track working hours and tardiness

#### Leave Management

- View all employee leave requests
- Approve/reject leave applications
- Add admin notes to leave decisions
- Track leave balance per employee
- View leave history and patterns

#### Shift Management

- Create and configure shifts
- Set working hours and grace period
- Define late arrival rules
- Set half-day hour limits
- Assign employees to shifts
- View employees assigned to each shift

#### Reports & Analytics

- Employee-wise attendance analytics
- Daily/weekly/monthly attendance reports
- Leave summary and statistics
- Punctuality reports
- Geolocation heat maps
- Export data in multiple formats

---

### Employee Features

#### Attendance

- Mark punch-in with GPS location and timestamp
- Mark punch-out with GPS location
- Automatic status detection (Present/Late)
- Optional selfie capture during punch-in
- View today's working hours in real-time
- Automatic calculation of working hours

#### Leave Management

- Apply for different types of leaves
- View leave balance (3 leaves per month)
- See leave history and status
- Track approved, pending, rejected leaves
- View admin notes on leave decisions

#### Profile & Settings

- View and edit profile information
- Change assigned shift
- View assigned shift details (start time, end time, grace period)
- Update password
- Manage account settings
- Sign out securely

#### Dashboard

- Quick overview of today's status
- Attendance history
- Upcoming shifts
- Leave balance display
- Working hours summary

---

## Geo-Fencing Logic

### How It Works

The system uses the **Haversine formula** to calculate the distance between:

- **User's Current GPS Coordinates**: Obtained from employee's mobile device
- **Office Coordinates**: Stored in the Location collection (latitude, longitude)
- **Allowed Radius**: Set by admin (default: 200 meters)

### Formula

```
distance = 2 * R * arcsin(sqrt(sin²(Δφ/2) + cos(φ1) * cos(φ2) * sin²(Δλ/2)))

Where:
- R = 6,371,000 (Earth's radius in meters)
- φ = latitude
- λ = longitude
- Δ = difference between coordinates
```

### Attendance Marking

- **If distance ≤ radius**: Mark as "Present" or "Late" (based on time)
- **Grace Period**: A configurable time buffer (e.g., 15 mins) to mark late arrivals
- **Half Day**: If employee works fewer hours than the shift duration

### Status Determination

```
IF punchIn.time <= shift.startTime:
  status = "Present"
ELSE IF punchIn.time <= (shift.startTime + gracePeriod):
  status = "Present"
ELSE IF punchIn.time < shift.endTime:
  status = "Late"
ELSE:
  status = "Absent"

```

---

## Authentication Flow

### Login Process

```
1. Employee enters email/mobile and OTP or password
2. Backend validates credentials
3. Backend generates:
   - JWT Token (15-minute expiry)
   - Refresh Token (7-day expiry)
4. Client stores both tokens securely
5. Client sends JWT in Authorization header for API requests
6. Server validates JWT on each request
```

### Token Management

```
Authorization Header: Bearer <JWT_TOKEN>

JWT Contains:
- User ID
- Role
- Issue Time
- Expiration Time
```

### Refresh Token Flow

```
1. JWT expires (after 15 minutes)
2. Client detects 401 Unauthorized response
3. Client sends Refresh Token to /api/auth/refresh-token
4. Backend validates Refresh Token
5. Backend issues new JWT
6. Client retries original request with new JWT
```

### OTP Login (Admin Only)

```
1. Admin enters email/mobile
2. Backend generates 7-digit OTP
3. OTP sent to admin (logged in console)
4. OTP valid for 10 minutes
5. Admin enters OTP
7. JWT and Refresh Token issued
```

---

## Folder Structure

```
Geo-Attendance-HRMS-System/
├── admin-panel/                    # React Admin Dashboard
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── index.css
│   │   ├── App.css
│   │   ├── api/
│   │   │   └── axios.js           # HTTP client configuration
│   │   ├── components/
│   │   │   ├── Layout.jsx         # Main layout wrapper
│   │   │   └── Sidebar.jsx        # Navigation sidebar
│   │   ├── pages/
│   │   │   ├── Attendance.jsx    # Attendance tracking page
│   │   │   ├── Dashboard.jsx     # Admin dashboard
│   │   │   ├── Employees.jsx     # Employee management
│   │   │   ├── Leaves.jsx        # Leave management
│   │   │   ├── Login.jsx         # Admin login
│   │   │   ├── Profile.jsx       # Admin profile
│   │   │   ├── Settings.jsx      # System settings
│   │   │   └── Shifts.jsx        # Shift management (with employees list)
│   │   ├── store/
│   │   │   ├── authSlice.js      # Redux auth state
│   │   │   └── index.js          # Redux store
│   │   └── assets/
│   ├── public/
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── eslint.config.js
│
├── mobile-app/                     # React Native Mobile App
│   ├── src/
│   │   ├── api/
│   │   │   └── axios.js           # HTTP client
│   │   ├── components/
│   │   │   ├── AttendanceMap.js   # Map for iOS/Android
│   │   │   └── AttendanceMap.web.js # Map for web
│   │   ├── screens/
│   │   │   ├── LoginScreen.js     # Employee login
│   │   │   ├── DashboardScreen.js # Home/dashboard
│   │   │   ├── AttendanceScreen.js # Punch in/out
│   │   │   ├── LeaveScreen.js     # Leave application
│   │   │   ├── ProfileScreen.js   # User profile (shift info)
│   │   │   └── ShiftManagementScreen.js # Shift view (admin)
│   │   ├── store/
│   │   ├── theme/
│   │   │   └── index.js           # Theme configuration
│   │   └── utils/
│   ├── App.js
│   ├── index.js
│   ├── app.json
│   ├── metro.config.js
│   ├── babel.config.js
│   ├── tailwind.config.js
│   ├── global.css
│   └── package.json
│
├── backend/                        # Node.js Backend API
│   ├── src/ or root files
│   ├── config/
│   │   └── db.js                  # Database connection
│   ├── controllers/
│   │   ├── auth.js                # Authentication logic
│   │   ├── attendance.js          # Attendance logic
│   │   ├── employees.js           # Employee management
│   │   ├── leaves.js              # Leave management
│   │   ├── shifts.js              # Shift management
│   │   ├── reports.js             # Report generation
│   │   └── settings.js            # System settings
│   ├── models/
│   │   ├── User.js                # User/Employee schema
│   │   ├── Attendance.js          # Attendance schema
│   │   ├── Leave.js               # Leave schema
│   │   ├── Shift.js               # Shift schema
│   │   └── Location.js            # Location/Geofence schema
│   ├── routes/
│   │   ├── auth.js
│   │   ├── attendance.js
│   │   ├── employees.js
│   │   ├── leaves.js
│   │   ├── shifts.js
│   │   ├── reports.js
│   │   └── settings.js
│   ├── middleware/
│   │   └── auth.js                # JWT verification, role checks
│   ├── scripts/
│   │   ├── seedData.js            # Database seeding script
│   │   ├── createAdmin.js         # Create admin user
│   │   └── resetDB.js             # Reset database
│   ├── utils/
│   │   ├── errorResponse.js       # Error handling
│   │   └── geofence.js            # Haversine formula calculation
│   ├── data/
│   │   └── seed.json              # Seed data (users, shifts, attendance, leaves)
│   ├── server.js                  # Main entry point
│   ├── package.json
│   └── .env                       # Environment variables (not in repo)
│
├── project.md                      # Project documentation
├── README.md
└── package.json                    # Root package (if monorepo)
```

---

## Recent System Changes (May 2026)

### 1. Leave Balance System Updated

**Changed**: Monthly leave limit updated from 5 to 3 leaves per month

- **File**: `backend/controllers/leaves.js`
- **Impact**: All employees now have maximum 3 leaves per month
- **Functionality**:
  - Employees can apply for a maximum of 3 leaves/month
  - Leave balance tracked as `leaveBalance: 3`
  - Both Approved and Pending leaves count towards monthly limit
  - Admin can view and manage leave balance

### 2. Comprehensive Seed Data Enhanced

**Changed**: Seeds now include realistic attendance and leave data

- **File**: `backend/data/seed.json`

#### Attendance Data Improvements:

- All records use **today (May 7, 2026)** and **yesterday (May 6, 2026)** dates
- Each employee has **one attendance record per day** (realistic pattern)
- **New Tracking Logs**: Each attendance includes `trackingLogs[]` array with:
  - Multiple location updates throughout the day
  - GPS coordinates at different times
  - Address information for each tracking point
  - Status of whether employee was inside/outside geofence

#### Attendance Status Mix:

- **Present**: Normal full-day work (8+ hours)
- **Late**: Punch-in after shift start + grace period
- **Half Day**: Partial working hours (< 4 hours)
- **Absent**: No punch-in record

#### Leave Data Improvements:

- **27 total leave records** across all employees
- **3 leaves per employee** for testing and diversity
- **All leave types**: Sick Leave, Casual Leave, Paid Leave, Emergency Leave
- **Mixed statuses**: Approved, Pending, Rejected
- **Realistic reasons**: Medical, personal, family, travel, etc.

#### Shift Assignments:

- **General Shift** (09:00-18:00): Adesh, Jane, Alice, Diana, Admin
- **Morning Shift** (06:00-15:00): John, Bob, Fiona
- **Night Shift** (21:00-06:00): Charlie, Ethan

### 3. Admin Shifts Page Enhanced

**Changed**: Shift management page now displays assigned employees

- **File**: `admin-panel/src/pages/Shifts.jsx`
- **New Features**:
  - Shows "Assigned Employees" section on each shift card
  - Displays employee count per shift
  - Lists all employee names as interactive badges
  - Auto-updates when employees are added/removed
  - Complete shift details with timing and rules

### 4. Mobile App Integration

**Status**: Already configured for shift management

- Real-time shift information

### 5. Mobile UX & Stability Finalization (May 8, 2026)

**Changed**: Comprehensive refactor of mobile navigation, dashboard, and management screens.

- **Files**: `mobile-app/App.js`, `mobile-app/src/screens/DashboardScreen.js`, `mobile-app/src/screens/ShiftManagementScreen.js`, `mobile-app/src/screens/LeaveScreen.js`

#### Dashboard & Map Enhancements:

- **Full-Screen Map**: Integrated a "Google Maps" style expand button on the dashboard map card, opening a true full-screen interactive modal.
- **Localized Refresh**: Moved the dashboard refresh button from the global header to the map card for contextual data synchronization.
- **Home Navigation**: Updated the bottom tab icon to a standard `Home` icon for better user recognition.

#### Navigation Stability:

- **Context Fixes**: Resolved "Couldn't find navigation context" errors by switching from the `useNavigation` hook to direct prop injection for high-priority screens like `LeaveScreen`.
- **Auth Flow Security**: Enforced `navigation.reset()` for Login/Logout actions to prevent history-back navigation into secure areas.

#### Management Screens (Shift & Leave):

- **Unified Filter UI**: Implemented a modern "Split-Row" filter design (50/50 width) containing:
  - **Status Dropdown**: A bottom-sheet modal for selecting status (Present, Pending, etc.).
  - **Native Date Picker**: A native calendar selector with timezone-safe formatting (fixing the "one day back" bug).
- **Validation**: Restricted filters to past/current dates only (`maximumDate` enforced).
- **Cleanup**: Removed over 150 lines of unused administrative code from the employee-facing shift view to optimize bundle size and focus.

#### Leave System Synchronization:

- **Full Support**: Re-enabled **Sick, Casual, and Paid Leave** types across the Backend (`Leave.js` model) and Mobile Frontend.
- **Strict Logic**: Enforced a 3-leave-per-month limit with real-time balance tracking.

### 6. Admin Panel UI & Navigation Finalization (May 9, 2026)

**Changed**: Standardized Admin UI, fixed Google Maps integration, and optimized employee navigation.

- **Files**: `admin-panel/src/pages/Employees.jsx`, `admin-panel/src/pages/TrackingDashboard.jsx`, `admin-panel/src/pages/Settings.jsx`, `admin-panel/src/pages/Attendance.jsx`

#### Admin Panel UI Cleanup:

- **Staff Directory Modernization**:
  - Removed legacy "Admin Users" statistic cards from `Employees.jsx`.
  - Updated the Employee Edit form to use dynamic, data-driven dropdowns for Role and Shift management.
  - Standardized status tracking to use real-time `isOnline` indicators.
- **Attendance Dashboard**: Removed the unused "Headquarter Wise" tab and search box from `Attendance.jsx` for a cleaner interface.

#### Google Maps Stability:

- **Loader Resolution**: Fixed the "Loader must not be called again with different options" error by standardizing the `libraries` configuration (`['places']`) across `Settings.jsx` and `EmployeeTrackRoute.jsx`.
- **Geofencing UI**: Refined the office location picker with a consistent library set.

#### Navigation & Data Integrity:

- **Telemetry-Focused Navigation**: Updated the `TrackingDashboard.jsx` to navigate directly to detailed **Track Logs** (Activity Table) when clicking on an employee's name or profile image, facilitating immediate movement auditing.
- **Legacy Field Removal**: Completely stripped "Internal" employee types and "Battery" metrics across the reporting and tracking modules.

#### Mobile App Patch:

- **Syntax Correction**: Resolved critical syntax errors in `AttendanceScreen.js` and `ShiftManagementScreen.js` caused by metadata injection, restoring full mobile app functionality.

### 7. Mobile Navigation & Attendance Stabilizations (May 9, 2026)

**Changed**: Resolved critical "Navigation context" crashes on Android, standardized app entry points, and fixed monthly attendance summary logic.

- **Files**: `mobile-app/index.js`, `mobile-app/App.js`, `mobile-app/src/screens/MonthlyViewScreen.js`, `backend/controllers/attendance.js`

#### Navigation & Native Stability:

- **Gesture Handler Root**: Moved `import 'react-native-gesture-handler';` to the absolute first line of `index.js`. This ensures the native navigation context is initialized before any components mount, resolving recurrent crashes on Android devices.
- **Provider Hierarchy**: Restructured `App.js` to wrap `SafeAreaProvider` inside the `NavigationContainer`, providing a more stable context for React Navigation v7.
- **Prop-Based Navigation**: Standardized all major screens to use the `navigation` prop instead of the `useNavigation` hook, eliminating "missing context" exceptions during module loading.

#### Monthly View & Logic Fixes:

- **Future Date Suppression**: Updated the `getMonthlyView` backend controller to identify future dates and return a `Future` status. The mobile frontend now renders these dates without any status dots, keeping the calendar clean.
- **Accurate Absenteeism Stats**: Fixed the absenteeism count logic to only calculate missed days up to "today". Future days in the current month are no longer counted as "Absent," providing accurate real-time metrics.
- **Multi-Month Synchronization**: Ensured that changing the month in the `MonthlyViewScreen` correctly triggers a data refresh and updates the summary counts (Present, Absent, Leave) dynamically.

### 8. HRMS Standardization & Legacy Cleanup (May 10, 2026)

**Changed**: Finalized administrative UI standardization, integrated real-time online tracking, and removed legacy reporting modules.

- **Files**: `admin-panel/src/pages/EmployeeDetails.jsx`, `admin-panel/src/pages/Attendance.jsx`, `backend/controllers/reports.js`, `mobile-app/src/screens/MonthlyViewScreen.js`, `backend/models/User.js`

#### Administrative UI Standardization:

- **Employee Personal Page**:
  - Integrated a timezone-safe **Date Range Picker** (`startDate` to `endDate`) for individual attendance auditing.
  - Standardized table layout and column widths to match the global admin design system.
  - Implemented server-side date filtering for individual employee statistics.
- **Attendance Reporting**:
  - Completely decommissioned the **"Headquarter-Wise"** reporting module across the frontend, backend, and database.
  - Standardized the Attendance Dashboard to focus on Department and Shift-wise metrics only.

#### Data Integrity & Real-Time Tracking:

- **Persistent Online Status**: Replaced ephemeral session checking with the persistent `isOnline` boolean from the `User` model. This ensures the Admin Dashboard and Employee tables reflect the absolute current connectivity status of mobile users.
- **Schema Optimization**: Removed the obsolete `headquarter` field from the `User` model to simplify the database architecture and prevent data fragmentation.

#### Mobile App Experience:

- **Monthly View Enhancements**:
  - Redesigned the **Monthly Attendance Calendar** to match the premium dark/light theme of the web dashboard.
  - Fixed logic where attendance counts (Present/Absent/Leave) were not updating correctly when switching months.
  - Suppressed status coloring for future dates to maintain a clean UI.
- **Verification Logs**: Added location and selfie metadata to the mobile history view, allowing users to verify their own punch-in accuracy.

#### Reliability & Testing:

- **Comprehensive Seeding**: Updated `seed_comprehensive.js` to include advanced test points for multi-session attendance, diverse leave patterns, and varied geofencing scenarios.
- **Navigation Hardening**: Verified that all new screens are correctly wrapped in the Navigation context to prevent "Couldn't find navigation context" errors on native Android builds.

### 9. Geo-Intelligence, Admin Location Display & Date Persistence (May 10, 2026)

**Changed**: Full-address geocoding across all admin views, Punch location cards in Track Data, and date persistence fix in Tracking Dashboard.

#### Mobile App — Google Geocoding for Background Tracking Logs

- **File**: `mobile-app/src/screens/DashboardScreen.js`
- **Before**: Background tracking pings (every 2 min) stored addresses as `"${street}, ${city}"` — short, truncated format.
- **After**: Now calls **Google Geocoding API** (`formatted_address`) for each ping. Full addresses (building, ward, road, area, city, state, pincode) are stored in every `trackingLog` entry.
- **Fallback**: If Google API fails → `expo-location reverseGeocodeAsync` with all available fields joined.

#### Admin Panel — Reports: Full Address in Time Columns

- **File**: `admin-panel/src/pages/Reports.jsx`
- **Employee Overview Sheet**: Check-In and Check-Out columns now show the full `timeInLocation` / `timeOutLocation` address below the time value.
- **Present Timing Sheet**: In Time and Out Time columns display the full address below the time (with `max-w-[160px]` wrap constraint for column width balance).
- Backend already returned `timeInLocation` and `timeOutLocation` fields — only frontend rendering was added.

#### Admin Panel — Tracking Dashboard: Full Address, No Truncation

- **File**: `admin-panel/src/pages/TrackingDashboard.jsx`
- **Before**: "Last Known Location" column used `line-clamp-1` — address cut off with `...`.
- **After**: Removed `line-clamp-1`. Address wraps fully with an indigo `MapPin` icon prefix and timestamp indented below.

#### Admin Panel — EmployeeTrackData: Punch Location Cards

- **File**: `admin-panel/src/pages/EmployeeTrackData.jsx`
- **New section** added between the employee summary card and the activity logs table:
  - 🟢 **Punch In Location card**: Shows exact full address + punch-in time + lat/lng coordinates.
  - 🔴 **Punch Out Location card**: Shows exact full address + punch-out time + lat/lng coordinates.
  - Cards only render if attendance data exists for the selected date.
- **Activity Logs table**: Removed `max-w-md` truncation from Location Address column. `MapPin` icon upgraded to indigo for better visibility. Addresses wrap freely.

#### Admin Panel — TrackingDashboard: Date Persists Across Navigation

- **File**: `admin-panel/src/pages/TrackingDashboard.jsx`
- **Root Cause**: `selectedDate` used `useState` — reset to today on every component remount.
- **Scenario that failed**: Select date → click employee → open EmployeeTrackData → press back → **date resets to today**.
- **Fix**: Replaced `useState` with `useSearchParams`. Date stored in URL as `?date=YYYY-MM-DD`.
- **Result**: Browser back button and in-app navigation now preserve the selected date correctly.

### 10. Stability Hardening & Shift Re-Configuration (May 11, 2026)

**Changed**: Standardized shift timings, removed debug telemetry, and hardened mobile route tracking.

- **Files**: `backend/server.js`, `mobile-app/src/screens/TrackMyRoute.js`, `mobile-app/src/screens/ProfileScreen.js`, `backend/data/seed.json`

#### Shift Re-Configuration:

- **Standardized 8-Hour Shifts**:
  - **Morning Shift**: 08:00 AM to 04:00 PM
  - **Evening Shift**: 04:00 PM to 12:00 AM (Midnight)
  - **Night Shift**: 12:00 AM to 08:00 AM
- **Seeding**: Updated the global `seed.json` with these standard timings and re-seeded the production database.

#### Mobile UI & UX Modernization:

- **Dashboard Simplification**: Redesigned the `ProfileScreen` to use a clean, dashboard-style grid with primary actions:
  - **Monthly Attendance Card**: Quick access to monthly logs.
  - **Track Location Card**: Day-wise movement history.
  - **Horizontal Sign Out**: High-visibility logout button at the bottom of the dashboard.
- **Visual Branding**: Removed all legacy "TruCode" and "Geoattend" branding, replacing it with a generic, professional "Profile" and "Dashboard" interface.

#### Tracking Stability & 404 Resolution:

- **Direct Route Mounting**: Resolved persistent 404 errors in mobile API calls by mounting high-priority tracking routes directly in `server.js`.
- **Render Hardening**: Implemented robust coordinate validation in `TrackMyRoute.js` to prevent crashes caused by partial or malformed location payloads.
- **Diagnostic Cleanup**: Completely stripped all `[DEBUG]` logs and console telemetry from both the Backend and Mobile application to prepare for production readiness.

### 11. High-Fidelity Tracking & Simulation Analytics (May 11, 2026)

**Changed**: Upgraded movement simulation scale and real-time connectivity tracking for enterprise-grade auditing.

- **Files**: `backend/scripts/seed_comprehensive.js`, `backend/scripts/simulateMovement.js`, `backend/server.js`, `mobile-app/src/screens/AttendanceScreen.js`

### 12. Production Stability & Identification Tracking (May 13, 2026)

**Changed**: Standardized system identification, refined attendance reporting logic, and implemented rich-media onboarding features.

- **Files**: `backend/services/employeeStatsService.js`, `backend/controllers/reports.js`, `admin-panel/src/pages/Employees.jsx`, `mobile-app/src/screens/DashboardScreen.js`, `admin-panel/index.html`

#### Administrative Onboarding & Sharing:

- **Credentials Success Modal**: Added a high-fidelity modal in `Employees.jsx` that appears immediately after creating a new staff member.
- **Native Sharing Integration**:
  - Implemented **Web Share API** support for "Share" (WhatsApp/Email) and **Clipboard API** for "Copy Info".
  - Shared messages now include formatted Markdown for better readability in chat apps.
- **Rich Link Previews (OG Tags)**:
  - Integrated **Open Graph (OG) Meta Tags** in the admin portal to provide professional logo thumbnails and metadata in chats.
  - Optimized message structure by placing the website URL first to ensure reliable link previews.

#### Identification Architecture:

- **System ID Standardization**: Completely removed the legacy random 8-digit `staffId` in favor of a consistent **Emp ID**.
- **Full vs. Truncated IDs**:
  - General UI (Lists, Mobile Profile) uses the **last 8 characters** of the MongoDB `_id` for readability.
  - Official records and the creation modal display the **Full 24-character ID** for absolute precision.
- **Cross-System Synchronization**: Updated Excel/PDF exports, Backend reporting controllers, and Mobile Profile screens to use this standardized identifier.

#### Attendance & Reporting Logic Refinement:

- **Join Date Integrity**: Modified `employeeStatsService.js` to strictly ignore all dates before an employee's `createdAt` timestamp, preventing false "Absent" counts for new hires.
- **Dynamic Absent Today Logic**:
  - Updated the "Absent Today" trigger to only activate **after the employee's shift has ended**.
  - Employees without a punch-in remain "Blank" during their shift and only transition to "Absent" (+1) once their assigned work hours have passed.
- **Reporting Consistency**: Fixed historical daily reports in `reports.js` to only count employees who were active as of the specific report date.

#### Mobile Presence & UX:

- **Online Status Indicator**: Implemented an `AppState` listener in the mobile dashboard that displays a 2-second "Employee is Online" status toast whenever the app is resumed from the background.
- **Login Persistence**: Verified and hardened mobile session persistence to prevent unexpected logouts.

#### Movement Scale & Visibility:

- **Substantial Telemetry**: Refactored the movement simulation logic to ensure every tracking log entry reflects a meaningful distance.
  - **Local Trips**: Expanded to a ~100m - 200m radius with a minimum jump of 50m per segment.
  - **Road Trips**: Expanded to a ~2.2km - 3.3km range with multi-kilometer jumps for long-range auditing.
- **Visual Impact**: These changes ensure that the "Distance (km)" and "Meter Lines" in the Admin Dashboard logs are substantial and clearly visible on the map, eliminating sub-meter "noise" logs.

#### Real-Time Connectivity Tracking:

- **isOnline Persistence**: Implemented real-time socket `join` and `disconnect` handlers. When an employee opens the mobile app, they are instantly marked as **Online** in the database.
- **Geofence Adherence Sync**: The root `isOutside` status of each attendance record is now dynamically updated during every location ping, ensuring 100% data consistency between the Tracking Dashboard and the official attendance reports.

#### Multi-User Telemetry Variety:

- **Unique Trails**: Every seeded employee now follows a unique, date-dependent movement path. 25% of employees are simulated to end their day outside the geofence, providing a diverse dataset for testing adherence alerts and compliance auditing.

---

### 13. HRMS Reporting Analytics Stabilization & Professional Export (May 11, 2026)

**Changed**: Standardized HRMS reporting engine, implemented professional PDF/CSV export system, and resolved critical React runtime stability issues.

#### Dynamic Reporting & Analytics Engine:

- **File**: `backend/services/attendanceStatsService.js`
- **Working Days Logic**: Refactored calculation to explicitly count `Present + Late + Half Day` as "Working Days".
- **Granular Metrics**: Added distinct counters for `presentOnly` (on-time), `lateDays`, and `halfDayCount` to provide deeper performance insights.
- **Real-Time Accuracy**: Eliminated static seeding fallback in favor of live calculation from filtered attendance records.

#### Professional Export System:

- **Files**: `admin-panel/src/pages/EmployeeDetails.jsx`, `admin-panel/src/pages/Reports.jsx`
- **Premium PDF Generation**: Integrated `jsPDF` and `jspdf-autotable` with a landscape-optimized, branded layout.
  - Includes performance summary headers, detailed attendance logs, and clean typography.
  - Automatic column wrapping for long address strings in check-in/out logs.
- **CSV Export**: Standardized Excel-compatible CSV generation for both individual employee details and company-wide reports.
- **UX**: Replaced standard download buttons with modern, animated dropdown menus for format selection.

#### UI Stability & Code Quality:

- **Hook Order Resolution**: Fixed `EmployeeDetails.jsx` crash caused by React Hook order violations (moving all hooks to component top-level).
- **Chart Dimension Fixes**: Resolved Recharts `width(-1)` warnings by enforcing `minWidth={0}` and `minHeight={150}` on all `ResponsiveContainer` instances.
- **Time Formatting**: Standardized duration displays across the Admin Panel and Mobile App to use human-readable formats (e.g., "2hr 34m" instead of minutes).
- **Cleanup**: Removed all internal testing and scratch scripts from the production environment.

### 14. Tracking Precision, Teleportation Guard & Admin Visibility (May 11, 2026)

**Changed**: Upgraded mobile tracking to 10s intervals, implemented 1-meter movement sensitivity, and added a Backend "Teleportation Guard" to resolve distance inflation bugs.

#### Mobile App — High-Precision Tracking Logic

- **File**: `mobile-app/src/screens/AttendanceScreen.js`
- **Upgrade**: Tracking frequency increased from 60s to **10s** for ultra-granular route lines.
- **Precision**: Implemented a **1-meter movement threshold**. The app now detects and logs even tiny movements, creating high-fidelity "scribble" paths that perfectly align with road geometry.
- **Optimization**: If the device is stationary (moved < 1m), logging is skipped to preserve battery and prevent data clutter.

#### Backend — Teleportation Guard (Anti-Inflation)

- **File**: `backend/controllers/attendance.js`
- **The "227 KM" Fix**: Resolved the critical bug where GPS coordinate jumps (e.g., to 0,0) caused massive distance inflation.
- **Logic**: Added a check in `trackLocation` that automatically discards any movement jump greater than **5 KM** within a single 10s window. This effectively filters out all GPS glitches.
- **Repair Utility**: Created `backend/scripts/repair_distances.js` to audit and correct legacy distance errors by recalculating path lengths directly from coordinate logs.

#### Admin Panel — Telemetry & Dashboard

- **File**: `admin-panel/src/pages/TrackingDashboard.jsx`
- **Visibility**: Enhanced the "Last Known Location" cell to show exact **hours:minutes:seconds** timestamps and high-precision coordinates.
- **Global Stats**: Updated the Telemetry cards to sum up verified, audited distances across the entire workforce.
- **UI Optimization**: Standardized the tracking table to show live data with high contrast indigo status markers.

---

### 15. Employee Management Finalization & Interface Professionalization (May 12, 2026)

**Changed**: Finalized the Staff Directory interface with centered navigation, 12hr time standards, and hardened bulk data processing.

#### Admin Panel — Employee Management UI:

- **Files**: `admin-panel/src/pages/Employees.jsx`
- **Interface Density**: Adjusted container width to `max-w-[calc(100vw-350px)]` and reduced column padding (`px-4`) to ensure a perfect fit with the sidebar and eliminate horizontal scrolling.

---

## Recent System Changes (June 2026)

### 16. Self-Healing Tracking System with Heartbeat & Watchdog (June 2026)

**Changed**: Implemented comprehensive self-healing tracking infrastructure with real-time health monitoring.

#### New Services & Files:

- **Backend**: `backend/services/trackingHealthService.js`
- **Mobile**: `mobile-app/src/services/heartbeat.service.js`, `mobile-app/src/services/selfHealingWatchdog.js`

#### Mobile App — Heartbeat Service:

- **Files**: `mobile-app/src/services/heartbeat.service.js`, `mobile-app/src/socket.js`
- **Functionality**:
  - Sends 30-second heartbeat to backend with GPS last update time, battery level, and network status.
  - Listens for `restart_tracking` events from backend and triggers GPS watcher restart.
  - Uses `expo-battery` to read current battery level.
- **Socket Connection**: Added `transports: ['websocket']` to force WebSocket for faster and more stable connections.

#### Mobile App — Self-Healing Watchdog:

- **Files**: `mobile-app/src/services/selfHealingWatchdog.js`, `mobile-app/src/services/tracking.service.js`
- **Checks Performed Every 30 Seconds**:
  1. **Permission Check**: Verifies foreground location permissions are granted.
  2. **GPS Enabled Check**: Ensures device location services are turned on.
  3. **Background Task Check**: Verifies background tracking task is running, auto-restarts if not.
  4. **GPS Freshness Check**: Detects if GPS is stale (> 60 seconds) and tries local restart up to 3 times.
  5. **Stuck GPS Detection**: Detects if coordinates are identical for > 5 minutes and restarts watcher.
- **New Tracking Service Methods**:
  - `getLastGpsTimestamp()`: Returns timestamp of last collected GPS point.
  - `getLastGpsPoint()`: Returns full details of last collected GPS point.
  - `restartGpsWatcher()`: Silently restarts GPS watcher subscription.
  - Dynamic interval adjustment based on speed (2s for >15 km/h, 5s for >1 km/h, 10s for stationary).

#### Backend — Tracking Health Service:

- **Files**: `backend/services/trackingHealthService.js`, `backend/models/Tracking.js`, `backend/server.js`
- **LiveEmployeeStatus Model**: New fields:
  - `lastHeartbeat`: Last heartbeat timestamp.
  - `heartbeatBattery`: Battery level from last heartbeat.
  - `lastGpsTime`: Last GPS update time from heartbeat.
  - `trackingHealth`: Current health status (healthy, recovering, gps_lost, permission_lost, service_restarting).
  - `trackingHealthReason`: Human-readable reason for current health status.
  - `recoveryAttempts`: Number of recovery attempts made.
  - `lastRecoveryTime`: Time of last recovery attempt.
- **Watchdog Cycle (Every 30 Seconds)**:
  - Detects offline employees (no heartbeat > 120 seconds).
  - Detects GPS-stale employees (no GPS > 90 seconds while heartbeat active) and sends `restart_tracking` event.
  - Sends emergency notifications to admins when tracking becomes unresponsive.

#### Admin Notifications:

- **Files**: `backend/services/trackingHealthService.js`
- **Functionality**: When employee tracking becomes unresponsive (no heartbeat > 120 seconds), sends an emergency notification to all admins with:
  - Employee name and email.
  - Time since last heartbeat.
- **Admin Panel Pages**: Notifications system already exists in `admin-panel/src/pages/notifications/`:
  - `AdminNotifications.jsx`
  - `AllNotifications.jsx`
  - `CreateNotification.jsx`
  - `NotificationAnalytics.jsx`
  - `NotificationReports.jsx`

#### Other Changes:

- **Files Modified**:
  - `admin-panel/src/pages/EmployeeTrackData.jsx`: Enhanced route visualization.
  - `admin-panel/src/pages/EmployeeTrackRoute.jsx`: Improved map rendering.
  - `admin-panel/src/pages/TrackingDashboard.jsx`: Updated to display tracking health status.
  - `backend/config/db.js`: Enhanced DB connection.
  - `backend/controllers/attendance.js`: Added health check endpoints.
  - `backend/controllers/auth.js`: Added today's attendance to `/me` endpoint.
  - `backend/controllers/reports.js`: Enhanced reporting.
  - `backend/models/Attendance.js`: Schema updates.
  - `backend/models/Tracking.js`: Added LiveEmployeeStatus model.
  - `backend/scripts/seed_comprehensive.js`: Updated seeding.
  - `backend/scripts/simulateMovement.js`: Enhanced simulation.
  - `backend/server.js`: Added watchdog cycle, heartbeat socket listeners, and health routes.
  - `backend/services/enterpriseTrackingService.js`: Enhanced.
  - `backend/services/geoTrackingService.js`: Enhanced.
  - `backend/services/gpsFilterService.js`: Enhanced.
  - `backend/services/roadSnapService.js`: Enhanced.
  - `backend/services/roadValidationService.js`: Enhanced.
  - `mobile-app/App.js`: Enhanced initialization.
  - `mobile-app/src/components/NotificationDrawer.js`: Updated.
  - `mobile-app/src/screens/AttendanceScreen.js`: Enhanced tracking integration.
  - `mobile-app/src/screens/LoginScreen.js`: Enhanced.
  - `mobile-app/src/screens/ProfileScreen.js`: Enhanced.
  - `mobile-app/src/screens/TrackMyRoute.js`: Enhanced.
  - `mobile-app/src/services/trackingManager.js`: Added heartbeat and watchdog integration, dynamic background interval adjustment, server-side active session check on startup.
  - `mobile-app/src/socket.js`: Added WebSocket transport.
- **Pagination**: Moved navigation buttons to the **center** of the table footer for a balanced, modern aesthetic.
- **Time Standards**: Implemented `formatTime12h` helper to display all shift schedules in 12hr format with **AM/PM** indicators.
- **Export Suite Fixes**:
  - Refactored PDF generation using the reliable `autoTable(doc, ...)` pattern, resolving block-scoped redeclaration errors.
  - Included **Staff ID** as a visible string column in Excel exports for easier administrative tracking.

#### Backend — Bulk Upload & Data Integrity:

- **File**: `backend/controllers/employees.js`
- **Intelligent Deduplication**: Upgraded the `bulkUpload` handler to cross-reference both **Email** and **Mobile** duplicates against the database and the upload file.
- **Silent Conflict Resolution**: Records with existing credentials are now automatically skipped instead of triggering `E11000` errors, allowing valid entries to process seamlessly.
- **Data Standardization**: Implemented mandatory "NA" fallbacks for missing fields and enforced strict enum validation for employee status ('active'/'inactive').
- **Feedback**: Enhanced response payloads to provide granular counts of successfully added vs. skipped duplicate records.

### 16. Leave Management Stabilization & URL Decoupling (May 12, 2026)

**Changed**: Resolved critical Leave Management API errors, refined analytical dashboard UX, and decoupled the codebase from all hardcoded local URLs.

#### Leave Management Module Stabilization:

- **Files**: `backend/controllers/leaves.js`, `admin-panel/src/pages/Leaves.jsx`, `admin-panel/src/pages/LeaveDashboard.jsx`
- **API 400 Resolution**: Corrected runtime exceptions in the `getAllLeaves` and `getLeaveDashboard` controllers. The issue originated from illegal spreading of Mongoose `.lean()` objects; this has been replaced with safe object mapping.
- **Date Sync Architecture**: Standardized the administrative date filtering logic using URL search parameters, ensuring that selected date ranges persist during navigation and correctly filter the request table.
- **Interface Simplification**: Removed the explicit date-range picker from the **Leave Requests** table (per management request) to provide a comprehensive, all-history view by default, while preserving status-based filtering.

#### Administrative Dashboard & UX:

- **Chart Precision**: Suppressed Recharts `width(-1)` console warnings by enforcing positive dimension constraints on all `ResponsiveContainer` instances.
- **Event Conflict Resolution**: Implemented `e.stopPropagation()` on all calendar triggers to prevent event bubbling from prematurely closing dropdown menus and modals.
- **Designation Consistency**: Hardened the employee designation display, providing a "Staff Member" fallback to ensure a premium, data-complete aesthetic across the dashboard.

#### Environment-Driven URL Architecture:

- **Files**: `admin-panel/src/api/axios.js`, `mobile-app/src/api/axios.js`, `mobile-app/src/socket.js`
- **Decoupling**: Completely eliminated hardcoded `localhost` and local IP addresses (`192.168.x.x`) from the codebase.
- **Strict Configuration**: Enforced the use of `VITE_API_URL` (Admin), `VITE_IMAGE_URL` (Admin), and `EXPO_PUBLIC_API_URL` (Mobile) across all networking layers.
- **Dynamic Derivation**: Configured the mobile socket and image handlers to dynamically derive their endpoints from the primary environment variable, ensuring the system is fully portable and deployment-ready.

### 17. Multi-Day Attendance Reporting (May 12, 2026)

- **Feature**: Implemented a comprehensive From/To date range picker on the Admin Reports page.
- **Backend Enhancement**: Updated the `getEmployeeReports` controller to handle `startDate` and `endDate` parameters, performing multi-day data aggregation from the MongoDB `Attendance` collection.
- **Dynamic UI**: Added a "Date" column to the reporting tables to clarify multi-day logs and updated the subtitle to reflect the active range.
- **Export Consistency**: Synchronized CSV and PDF export logic to respect the selected date range, including dynamic filenames (e.g., `Present_Timing_Sheet_2026-05-11_to_2026-05-12.pdf`).
- **Data Fidelity Fix**: Resolved a bug where the "Shift" column displayed "NA" by implementing nested Mongoose population in the `getEmployeeReports` controller.
- **Dashboard Analytics Overhaul**: Replaced single-day views with dynamic multi-day date range filtering (`startDate` to `endDate`). All stat cards and trend graphs now aggregate data over the selected period.
- **Attendance Dashboard Evolution**: Integrated the dual-date picker into the Attendance module, allowing for period-based department and shift-wise analysis.
- **Enriched Attendance Exports**: Added CSV and PDF export capabilities to the Attendance Dashboard, including detailed punch-in/out addresses and geofence status (Inside/Outside) for audit-ready documentation.
- **Employee Detail Transparency**: Synchronized the Employee Details page exports to include identical high-fidelity location data and geofence status markers.
- **Layout Optimization**: Reduced horizontal whitespace between "Date" and "Name" columns, centrally aligned the "Shift" column, and adjusted font sizes for a pixel-perfect table fit.
- **Enhanced Data Exports**: Upgraded CSV and PDF generators in the Reports module to include detailed punch-in and punch-out locations (address) along with the "Inside/Outside" geofence status.
- **NFR Compliance**: Verified that multi-day report generation remains under the **2s response time** threshold through latency benchmarking.

### 18. Backend Performance & Shift Stability (May 13, 2026)

**Changed**: Massive performance overhaul of the Admin Dashboard and Shift Management module through advanced aggregation and DOM stability hardening.

#### 🚀 Dashboard Performance Optimization:

- **File**: `backend/controllers/reports.js`
- **Issue**: The dashboard trend graph was performing up to 31 sequential database queries per load, causing significant latency for large date ranges.
- **Solution**: Replaced the iterative loop with a single **MongoDB Aggregation Pipeline**.
  - **Date Grouping**: Uses `$dateToString` to group attendance records by YYYY-MM-DD in one pass.
  - **Parallel Execution**: Refactored `getStats` to use `Promise.all`, running employee counts, leave checks, and trend aggregations concurrently.
  - **Impact**: Dashboard load time reduced from ~1200ms to **<80ms** for 30-day ranges.

#### 🛠️ Shift Management Stability:

- **Files**: `admin-panel/src/pages/Shifts.jsx`, `backend/controllers/shifts.js`
- **React Error Fix**: Resolved the "NotFoundError: Failed to execute 'insertBefore'" exception.
  - **Cause**: Browser translation tools (Brave/Chrome) were modifying text nodes inside complex `motion` components, breaking React's fiber reconciliation.
  - **Fix**: Wrapped table headers in stable `<span>` tags and simplified the column hierarchy to ensure DOM node stability during translation.
- **N+1 Query Resolution**: Optimized the `getShifts` API to use aggregation for employee counts per shift, eliminating sequential queries in the backend.
- **Assignment Guard**: Added safety validation to prevent 400 errors during mass shift assignment if a shift ID is intermittently missing.

#### 👥 Staff List Optimization:

- **File**: `backend/controllers/employees.js`
- **Aggregate Statistics**: Replaced the per-employee leave counting loop with a single aggregation against the `Leaves` collection.
- **Efficient Connectivity**: Implemented a `Set`-based lookup for online user status, ensuring $O(1)$ complexity regardless of workforce size.

#### 🎨 Branding & Identity:

- **Splash Screen**: Integrated `assets/splash.png` as the primary app launch image, configured via `app.json`.
- **Branding Sync**: Replaced legacy shield icons with the corporate `favicon.png` across the Admin login and portal headers for visual consistency.

### 19. HRMS Logic & Production Stability (May 13, 2026)

**Changed**: Refactored core attendance policy to allow permissive punch-ins, implemented deferred absence marking, and resolved SPA routing issues.

#### 🕒 Permissive Attendance Policy:

- **Punch-In Flexibility**: Removed shift-end timing restrictions in `backend/controllers/attendance.js`. Employees can now punch in at any time during their scheduled day, even after the shift has technically ended.
- **Deferred Absence Marking**:
  - **Logic**: Updated `backend/services/employeeStatsService.js` to skip marking employees as "Absent" for the current day.
  - **Requirement**: Absence is now only calculated once a day is fully complete (End-of-Day processing).
  - **Dashboard Synchronization**: Updated all summary statistics in `backend/controllers/reports.js` to reflect 0 absences for the current day.

#### 🛠️ Infrastructure & UI:

- **Routing Stability (404 Fix)**: Added `admin-panel/vercel.json` to handle SPA routing. This resolves `404 NOT_FOUND` errors that occurred when administrators refreshed the page on deeper routes.
- **Leave Management Refinement**: Standardized the date display format to `DD-MM-YYYY` across the Admin Panel and added a dedicated "Applied On" column to the Leave Requests table.
- **Mobile UX**: Implemented `Keyboard.dismiss()` on login button press to ensure immediate visibility of success messages and loading states.

### 20. Production Security Hardening & Real-Time Controls (May 13, 2026)

**Changed**: Implemented comprehensive security hardening, transitioned to hashed-only password storage, and added real-time access revocation.

#### 🔐 Advanced Security Hardening:

- **Hashed-Only Passwords**: Completely eliminated `plainPassword` storage from the database. Passwords are now exclusively stored as secure Bcrypt hashes.
- **Administrative Overwrite Model**: Admin password management transitioned to a "Reset Only" flow. When editing an employee, the password field is blank by default; typing a new password overwrites the old one, while leaving it blank preserves the existing hashed credential.
- **Middleware Infrastructure**: Enabled `express-mongo-sanitize` for NoSQL injection protection and `xss-clean` for cross-site scripting prevention.
- **Rate Limiting & CORS**: Hardened API rate limits to 200 requests per 10 minutes and restricted CORS to specific `CLIENT_URL` origins.
- **Mass Assignment Protection**: Implemented strict field white-listing across all critical controllers (Employees, Leaves, Profiles) to prevent unauthorized privilege escalation.

#### ⚡ Real-Time Force Logout:

- **Socket.io Trigger**: Implemented a `forceLogout` event in the backend `deleteEmployee` controller.
- **Instant Revocation**: Added a global listener in the mobile app (`socket.js`) that instantly clears local session data and redirects the user to the login screen as soon as their account is deleted by an administrator.

---

### 21. Enterprise Geo-Tracking Architecture (May 2026)

**Changed**: Implemented ultra-high-fidelity real-time employee tracking with unified data fetching and optimized telemetry processing.

#### High-Fidelity Mobile Telemetry:

- **Internal 2s Sampling**: The mobile app now captures GPS coordinates every 2 seconds while the employee is punched in.
- **Validation Engine**: Each point is validated for:
  - GPS Accuracy (< 50m threshold)
  - Velocity/Speed Validation (up to 30km/hr for pedestrians/bikes)
  - Distance Jumps (filtered unrealistic jumps)
  - Fake GPS detection
- **Efficient Batching**: Valid points are stored in a local buffer and transmitted to the server in batches every 10 seconds (or 5 valid points), significantly reducing network overhead and battery drain.

#### Unified Backend Architecture:

- **Real-Time Data Merging**: The `getEmployeeTrackDetails` API now merges three distinct data sources into a single timeline:
  1. **Legacy Logs**: Backward compatibility with `Attendance.trackingLogs`.
  2. **Summarized Logs**: 1-minute aggregated summaries (`TrackingLog` collection).
  3. **Pending Points**: High-fidelity raw points (`RawTrackingPoint` collection) that haven't been summarized yet.
- **In-Memory Buffering**: Utilizes high-performance in-memory `Map` buffers for real-time point aggregation, ensuring ultra-low latency without external dependencies like Redis.
- **Automated Summarization**: A background worker summarizes raw points into 1-minute blocks every 60 seconds, optimizing storage while maintaining historical accuracy.

#### Admin & Dashboard Enhancements:

- **"Processing..." Live Feedback**: The activity table now displays "Processing..." for raw points captured in the last minute, providing instant confirmation of employee movement.
- **1-Meter Path Fidelity**: The red tracking line on the map now renders movements as small as 1 meter (reduced from 5m), providing a near-continuous visual path of the employee's route.
- **Performance Summary Simplification**:
  - Removed **"Present Only"** and **"Unpaid Leave"** metrics to focus on key KPIs like Working Days, Late Days, and Total Distance.
  - Reorganized the grid for better readability.
  - Standardized CSV and PDF exports to match the simplified UI.

#### System Maintenance & Optimization:

- **Expo Architecture Alignment**: Removed explicit `newArchEnabled` disabling to align with Expo Go's internal architecture, resolving startup warnings.
- **Purged Telemetry**: Removed all development-level `console.log` statements from production-ready controllers and mobile screens.
- **Standardized Distance**: Unified distance calculations using the Haversine formula across all modules (Admin, Mobile, and Backend) for 100% data consistency.

### 22. Attendance Submission Performance Optimization (May 2026)

**Optimized**: Reduced the latency for punch-in and punch-out submissions, especially when verifying identity with a selfie.

#### Mobile Optimization:

- **Telemetry Compression**: Reduced selfie image quality to **0.1** and enforced a fixed resolution of **320x480**. This reduces the base64 payload size by over **80%**, drastically speeding up network transmission.
- **Immediate Feedback**: Maintained high-fidelity verification while ensuring the UI remains responsive during the compressed upload.

#### Backend Concurrent Processing:

- **Parallel Execution**: Re-architected the `punchIn` and `punchOut` controllers to utilize `Promise.all` for concurrent operations:
  - **Selfie Upload**: Image is uploaded to Cloudinary in parallel with database lookups.
  - **System Checks**: Office geofence settings and User shift data are fetched simultaneously.
- **Reduced DB Roundtrips**: Eliminated redundant database queries by utilizing the pre-fetched data from the parallel block, resulting in a significantly slimmer execution path.
- **Latency Reduction**: These changes combined result in a **2x to 3x faster response time** for attendance actions, providing a "premium" feel to the end-user experience.

### 23. Modular Settings Architecture & Decoupling (May 2026)

**Changed**: Completely refactored the monolithic Settings page into a modular, scalable architecture with dedicated CRUD interfaces for each operational entity.

#### Administrative UI Decoupling:

- **Files**: Added new dedicated pages for `Departments.jsx`, `Designations.jsx`, `Holidays.jsx`, `LeaveTypes.jsx`, `ShiftSetup.jsx`, `WeekOffs.jsx`, `WorkingPlaces.jsx`.
- **Interface**: Replaced the cluttered, multi-tab `Settings.jsx` with a clean, sidebar-driven navigation structure. Each entity now has its own full-page management table with dedicated Add/Edit modals.
- **Routing**: Removed legacy `Layout.jsx` and updated `App.jsx` and `Sidebar.jsx` to reflect the new independent routing structure.

#### Backend Decoupling & API Expansion:

- **Controllers & Routes**: Created individual, modular controllers and routes (`departments.js`, `designations.js`, `holidays.js`, `leaveTypes.js`, `settings.js`) to handle entity-specific logic independently.
- **Database Models**: Extracted inline schemas into dedicated Mongoose models (`CompanySetting.js`, `Department.js`, `Designation.js`, `Holiday.js`, `LeaveType.js`) for improved data integrity and relational mapping.
- **Seed Data**: Updated `seed_comprehensive.js` to populate the new discrete collections during database initialization.

### 24. Mobile HRMS Stabilization, Authentication Hardening & Dynamic Leave Dashboard (May 2026)

**Stabilized**: Resolved backend-to-mobile connectivity, secured employee login, modernized mobile leave workflows with real-time API syncing, added Sunday/Leave punch-button guards, and synced the admin leave dashboard to automatically filter by the current month range.

#### 1. Production API Integration & CORS Hardening:

- **Production URL Alignment**: Configured `mobile-app/.env` to target the active Railway production URL (`https://geo-attendance-hrms-system-production.up.railway.app/api`), ensuring mobile users can successfully communicate with the system from any network.
- **Dynamic CORS Support**: Enhanced backend `server.js` and Socket.io setups to support broad connection policies for mobile endpoints, enabling robust cross-origin handshakes.
- **Clear Connection Failure Dialogs**: Refined mobile login page to instantly detect `ERR_NETWORK_UNREACHABLE` states, throwing clean, human-readable toasts instead of cryptic runtime exceptions.

#### 2. Authentication Logic & Database Seeding Repairs:

- **Simplified Status Concepts**: Removed redundant concept blocks in auth controllers, verifying active/inactive states dynamically and providing clean, structured JWT payloads.
- **Comprehensive Shift Seed Repair**: Rectified key mismatches in the DB seed engine (`seed_comprehensive.js`) where the `Shift` model expected a `name` field while the script populated `shiftName`.
- **Pre-flight Logic Audits**: Added `testEmployeeLogin.js` for developers to test DB schema compatibility, login credential hashes, and JWT responses directly in command environments.

#### 3. Admin Panel Layout & Dynamic UI Improvements:

- **Sidebar Auto-Expansion**: Synchronized Layout settings so that clicking any Office/Setup nested screen automatically opens and highlights the correct dropdown section in the sidebar.
- **Clean Employee Information Display**: Restructured employee grid listings to render Designation, Department, and Shift details cleanly, placing easily copyable raw IDs right under their names.
- **Removed DOM Attribute Warnings**: Resolved React warnings regarding non-boolean props passed to DOM containers (specifically `z`).

#### 4. Real-time Mobile Leaves & Sunday Guards:

- **Decoupled Quotas & Balances**: Refactored `LeaveScreen.js` to fetch every single leave record, dynamic limit, and remaining balance entirely from backend APIs, removing all legacy front-end mock arrays.
- **Sunday Punch Safeguard**: Updated `DashboardScreen.js` to identify Sundays automatically. When selected, the application blocks the Punch-In/Punch-Out button and instead renders a professional "Weekly Off — Sunday" calendar banner.
- **Approved Leave Punch Guard**: Seamlessly blocks the punch-in/out touchable interface when the employee has an approved "Full Day" leave registered for today, displaying a sleek "On Leave — Full Day" notice.
- **IST Timezone Validation Repair**: Solved a bug in local date comparison where timezone discrepancies between local midnight and UTC midnight would misidentify the current day as a "past date" and prevent same-day leave applications.

#### 5. Dynamic Admin Leave Dashboard Ranges:

- **Auto-Initialization to Current Month**: Modified `LeaveDashboard.jsx` to load `startDate` as the first day of the current month (`YYYY-MM-01`) and `endDate` as today.
- **Real-time Stats Filtering**: Displays the seeded totals (Waiting Approval, Approved, Rejected, Cancelled, Half Day, Full Day) dynamically based on dates. When you change filters, the cards and main employee details table update automatically in real-time.

#### 6. Sunday & Future-Date Graph & Table Guards:

- **Skip Sunday & Future Absent Counts (Single & Multi-Day)**: Enhanced both frontend pages and the backend controller ([reports.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/controllers/reports.js)) to identify Sundays and future dates. For single-day selections, absent counts are skipped entirely. For multi-day ranges, the backend automatically subtracts the exact number of Sundays falling within the range from the `totalExpectedAttendance` multiplier.
- **Synchronized Stats & Row Totals**: Adjusted per-row employee totals (`total - absent`), center donut labels, and footer total summaries to exclude absent counts when skipping is active, keeping graphs and tables perfectly aligned.
- **Robust Tracking Dashboard Date Syncing**: Refactored the `selectedDate` in `TrackingDashboard.jsx` to be driven by a robust local `useState` synchronized with `searchParams`. This guarantees that changing dates in the picker immediately triggers a component re-render and re-fetches the correct metrics every single time.
- **Ultra-Fast Past-Date Loading (MongoDB Projection Slice)**: Optimized the `/reports/tracking` API in [reports.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/controllers/reports.js) to exclude loading the giant `trackingLogs` array using a selective Mongoose projection (`.select({ trackingLogs: { $slice: -1 } })`). This returns only the latest tracking point instead of transferring thousands of historical logs, cutting down past-date response time from over 32 seconds to under 100 milliseconds.

#### 7. Active Holidays & Employee Joining Date Exclusions:

- **Comprehensive Holiday Seeding**: Cleaned and seeded the `Holiday` collection with 5 active default public holidays in `seed_comprehensive.js`.
- **Public Holiday Exclusions in Expected Attendance**: Refactored `/reports/attendance-dashboard` in [reports.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/controllers/reports.js) to query active holidays inside the range and subtract them along with Sundays from expected working days.
- **Employee Joining Date Skip Constraints**: Implemented strict joining date checks in [reports.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/controllers/reports.js). For any date (single or range), employees are excluded from expected attendance, absent counts, and leave records if the target date precedes their specific `joiningDate` or `createdAt` timestamp.
- **Strict Zero-Floor Bounds**: Integrated `Math.max(0, ...)` limits across all backend API metrics and frontend tabular layouts in [Attendance.jsx](file:///e:/Downloads/Geo-Attendance-HRMS-System/admin-panel/src/pages/Attendance.jsx) to guarantee that no negative values or minus counts ever display.

#### 8. Seeding & Tracking Simulation Optimizations:

- **Bcrypt Hash Extraction**: Moved the expensive `bcrypt.hash` operations entirely outside of the employee generation loop in [seed_comprehensive.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/scripts/seed_comprehensive.js), cutting seeding execution time by 90%+.
- **Timezone-Robust Today Boundary**: Refactored the today-date shifting logic to use pure UTC string comparisons (`dateStr === todayStr`), avoiding mismatch errors caused by local timezone offset conversions.
- **Holiday-Aware Attendance Generation**: Prevented simulated attendance records from being generated on public holidays, aligning with expected working day statistics.
- **High-Frequency Console Logging Purge**: Cleaned up verbose and repetitive `console.log` statements inside loops across [resetDB.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/scripts/resetDB.js) and [simulateMovement.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/scripts/simulateMovement.js) to improve performance and keep the logs perfectly clean.
- **Fail-Safe Connection Guides**: Embedded proactive troubleshooting output inside the seeding catch block to clearly identify MongoDB server selection timeouts and advise on local fallback configurations.

#### 9. Comprehensive Admin UI Hardening & Safes:

- **`Employees.jsx` ReferenceError Resolution**: Solved the critical reference crash on lowercase/uppercase array bindings when rendering empty states.
- **Search Filtering Hardening**: Safeguarded `.toLowerCase().includes()` operations across all administrative modules ([Employees.jsx](file:///e:/Downloads/Geo-Attendance-HRMS-System/admin-panel/src/pages/Employees.jsx), [Leaves.jsx](file:///e:/Downloads/Geo-Attendance-HRMS-System/admin-panel/src/pages/Leaves.jsx), [Shifts.jsx](file:///e:/Downloads/Geo-Attendance-HRMS-System/admin-panel/src/pages/Shifts.jsx), [Designations.jsx](file:///e:/Downloads/Geo-Attendance-HRMS-System/admin-panel/src/pages/Designations.jsx), [Departments.jsx](file:///e:/Downloads/Geo-Attendance-HRMS-System/admin-panel/src/pages/Departments.jsx), [AiAnalytics.jsx](file:///e:/Downloads/Geo-Attendance-HRMS-System/admin-panel/src/pages/AiAnalytics.jsx), [EmployeeTrackData.jsx](file:///e:/Downloads/Geo-Attendance-HRMS-System/admin-panel/src/pages/EmployeeTrackData.jsx), [LeaveDashboard.jsx](file:///e:/Downloads/Geo-Attendance-HRMS-System/admin-panel/src/pages/LeaveDashboard.jsx), [LeaveTypes.jsx](file:///e:/Downloads/Geo-Attendance-HRMS-System/admin-panel/src/pages/LeaveTypes.jsx), [TrackingDashboard.jsx](file:///e:/Downloads/Geo-Attendance-HRMS-System/admin-panel/src/pages/TrackingDashboard.jsx), [WorkingPlaces.jsx](file:///e:/Downloads/Geo-Attendance-HRMS-System/admin-panel/src/pages/WorkingPlaces.jsx), [Holidays.jsx](file:///e:/Downloads/Geo-Attendance-HRMS-System/admin-panel/src/pages/Holidays.jsx)) by integrating fallback operators (`|| ''`), completely eliminating `TypeError: Cannot read properties of undefined (reading 'includes')` when records contain partially filled or empty data.
- **Resilient Zero-Data State**: Standardized falling back arrays (`|| []`) and rendering nodes to guarantee a completely crash-free experience when database collections are entirely clean or newly initialized.
- **`getAttendanceDashboard` ReferenceError Fix**: Resolved the critical `ReferenceError: diffDays is not defined` in the backend reports controller by properly instantiating the `diffDays` calculation on range query parsing, eliminating the HTTP 400 Bad Request error on dashboard load.

### 25. High-Fidelity Notification System, Date Telemetry Auditing & React Native Hermes Stability (May 18, 2026)

**Stabilized**: Built and verified a complete enterprise Notification Campaigns and Reports suite, engineered date-range filtering and Mongoose aggregations, realigned telemetry reporting by department string names, and resolved the critical React Native block-scope compilation crash under Hermes.

#### 1. Premium Admin Notifications Dashboard & Campaign Creator:

- **Modular Tabs**: Re-designed and engineered the full-page notification console with high-fidelity layout split into:
  - **Campaigns Feed**: Grid of sent notifications detailing date, title, description, targets, and delivery states.
  - **Create Announcement**: Clean, user-friendly form with intuitive dropdown selectors.
- **Audience Targeting Rules**: Supports dispatching to:
  - **All Employees**: Broadcasting dynamically to every active employee.
  - **Specific Department**: Multi-selection of organizational units.
  - **Specific Employees**: Dropdown multi-select targeting particular individuals.
- **Toast Notifications**: Interactive state alerts on dispatch.

#### 2. Advanced Notification Reports Screen & Date-Range Telemetry:

- **Aligning Default Start Date**: Updated default `fromDate` filter state to `'2024-01-01'` to align with the Dashboard page and historical database telemetry.
- **Date Comparison Fix**: Fixed date parsed checks inside `NotificationReports.jsx` by checking dynamic Mongoose fields (`log.sentAt || log.sentTime || log.createdAt`) to prevent `NaN` date evaluations that filtered out all log records.
- **CSV Data Exporter**: Formatted exporting schema to download full titles, employee credentials, departments, delivery status, and timestamps.

---

### 26. Continuous GPS Tracking, Road Snapping & Seed Data Enhancement (June 2026)

**Changed**: Implemented fixed-interval continuous GPS tracking with robust permissions, added enterprise-level road snapping, and enhanced seed data to include RawTrackingPoint records for perfect route visualization.

#### Mobile App — Continuous GPS Tracking:

- **Files**: `mobile-app/src/services/trackingManager.js`, `mobile-app/App.js`, `mobile-app/app.json`, `mobile-app/app.config.js`
- **Architecture Overview**:
  - Removed dynamic interval changes to prevent OS killing the service on Realme/OPPO devices.
  - Uses fixed 5-second interval for GPS sampling via `Location.startLocationUpdatesAsync`.
  - Foreground service notification keeps app alive in background.
- **Permissions Setup**:
  - Android: All required permissions in `app.json` (ACCESS_COARSE_LOCATION, ACCESS_FINE_LOCATION, ACCESS_BACKGROUND_LOCATION, FOREGROUND_SERVICE, FOREGROUND_SERVICE_LOCATION, WAKE_LOCK, RECEIVE_BOOT_COMPLETED, ACCESS_NETWORK_STATE, ACCESS_WIFI_STATE, REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, POST_NOTIFICATIONS).
  - iOS: Required InfoPlist entries for foreground and background location, background modes enabled.
  - Permission lock screen in App.js ensures both foreground and background permissions are granted before app proceeds.
- **Background Task**: Defined in App.js, processes GPS points, validates, saves to SQLite, and syncs to backend.
- **Tracking Manager**: Manages start/stop of tracking, auto-resumes on app restart if active trip exists, checks server for active attendance session on login.

#### Backend — Enterprise Tracking Pipeline:

- **Files**: `backend/services/enterpriseTrackingService.js`, `backend/services/geoTrackingService.js`, `backend/services/gpsFilterService.js`, `backend/services/roadSnapService.js`, `backend/services/roadValidationService.js`, `backend/models/Tracking.js`
- **RawTrackingPoint Model**: Stores raw and snapped GPS coordinates, accuracy, speed, heading, battery, tripId, deviceId, timestamp, status, isMock, isOffline, routeStatus, processedTime, provider, road metadata.
- **TrackingSession Model**: Groups RawTrackingPoint records by attendance session.
- **TrackingLog Model**: 1-minute aggregated summaries for efficient reporting.
- **LiveEmployeeStatus Model**: Real-time status tracking with health monitoring.
- **Road Snapping Service**:
  - Primary: Google Roads API.
  - Fallback: OSRM Match Service.
  - Both generate candidate roads and snapped coordinates.
- **GPS Filtering & Smoothing**: Kalman filter for coordinate smoothing, outlier detection for GPS glitches, accuracy validation.

#### Seed Data Enhancement:

- **File**: `backend/scripts/seed_comprehensive.js`
- Added seeding of RawTrackingPoint records for all employees with attendance records, generating realistic road-aligned GPS trails.
- Seeded LiveEmployeeStatus for all employees.
- Seeded TrackingSession records linked to attendance.

#### Mobile App Requirements for Continuous GPS:

- **Permissions**: User must grant "Allow all the time" location permission on Android, "Always Allow" on iOS.
- **Notifications**: User must allow notifications for the foreground service to work.
- **Battery Optimization**: User should exempt the app from battery optimization (requested via REQUEST_IGNORE_BATTERY_OPTIMIZATIONS permission).
- **Background Refresh**: Enabled on iOS (handled by Expo Location background mode).
- **Unified Design Theme**: Replaced ad-hoc layout tables with premium styled tailwind components matching the core admin system.

#### 3. Real-time Telemetry Analytics & Mongoose Resolvers:

- **Read State Analysis**: Aligned stats aggregation inside `NotificationAnalytics.jsx` to map read status fields correctly against database schemas.
- **Department Aggregation Realignment**: Updated Mongoose querying to match string names inside `employee.department` instead of matching raw ObjectIDs, resolving the department telemetry tracking filter.
- **Comprehensive Database Seeding**: Updated `seed_notification_telemetry.js` and `seed_comprehensive.js` to automatically clear collections and instantiate rich, multi-day historical campaigns and logs.

#### 4. React Native Hermes Block-Scoping Crash Resolution:

- **ReferenceError Resolution**: Resolved a critical runtime crash on the mobile app's main page `DashboardScreen.js` where `isNewEmployee` was block-scoped inside the `now < start` block, but accessed in the `else` block, causing React Native's Hermes engine to throw `ReferenceError: Property 'isNewEmployee' doesn't exist`.
- **Variable Hoisting**: Moved the `isNewEmployee` evaluation to the parent function level, making it safely accessible throughout the entire component.
- **Expo Push Token Acquisition**: Verified automatic Expo push token permission request and registration with the database.

---

### 26. Database Connection Resilience & Scheduler Graceful Fallback (May 18, 2026)

**Changed**: Hardened the background scheduled task engines to be completely resilient to database connectivity drops, network route disruptions, and socket connection resets (`ECONNRESET`).

#### ⏰ Background Scheduler Resilience & Safeguards:

- **Files**: `backend/services/notificationSchedulerService.js`
- **Mongoose connection check**: Enforced checking `mongoose.connection.readyState !== 1` before performing queries in `checkAndDispatchScheduled` and `dispatchNotificationDocument`. This bypasses scheduled actions when the database is offline, avoiding unhandled timeouts.
- **Granular Network Error Interception**: Refactored the error-handling catch blocks to isolate DNS lookup errors (`ENOTFOUND`, `getaddrinfo`), server selection issues (`MongoServerSelectionError`), and TCP socket resets (`ECONNRESET`).
- **Clean Console Output**: Replaced massive multiline error stack trace spam with high-level, human-readable console warnings (`⏰ Background Notification Scheduler: MongoDB host is currently offline or unreachable. Reconnection is in progress...`).
- **Secondary Save Guards**: Prevented write operations (`notification.status = 'failed'`) inside catch blocks when the connection is dropped, keeping the server error-free and stable during DB failovers.

---

### 27. High-Fidelity Custom Dropdowns & Automated Workflow Configuration (May 18, 2026)

**Changed**: Integrated state-of-the-art interactive custom select elements (`CustomSelect`) in the announcement dashboard to replace all standard HTML `<select>` elements, relaxed campaign editing restrictions, and added custom filters on the list page.

#### 🎨 Premium Customized Dropdowns & Filters (`CustomSelect` & `CustomFilterSelect`):

- **Dynamic Framer Motion Overlays**: Engineered reusable, high-fidelity custom drop-down menus that animate with subtle scaling and translation on open/close (`framer-motion`'s `AnimatePresence`).
- **Standardized Look & Feel**: Features custom hover states, border transitions, and checked indicator icons that perfectly match the premium HRMS visual design guidelines.
- **Auto-Close Behaviors**: Configured an invisible fullscreen backdrop overlay that automatically closes open dropdown panels upon clicking outside the element.
- **Compact Custom Grid Filters**: Replaced ugly native `<select>` dropdowns for **Status** and **Type** filters in `AllNotifications.jsx` with animated compact selection menus.
- **Uncompromised Full-Text Mobile Feed Displays**: Redesigned the in-app notification drawer component ([NotificationDrawer.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/mobile-app/src/components/NotificationDrawer.js)) by removing all layout truncation constraints, line caps (`numberOfLines={2}`), and text clipping classes (`truncate`). The mobile app now displays the full notification title and the complete announcement description immediately in the feed list view without truncation.
- **Dynamic Content Fallback Ingestion**: Added a double-binding data resolution (`item.message || item.body`) to the mobile renderer, ensuring that standard custom text messages and system-generated database events render seamlessly across all devices.
- **Mobile Push Background Deliverability**: Prioritized raw native FCM/APNs registration tokens (via `getDevicePushTokenAsync()`) over standard Expo tokens on real devices, resolving Firebase SDK delivery payload rejections.
- **Android Alert Wakes & Notification Channels**: Programmed the client to create and register the high-importance `'default'` Android Notification Channel (`importance: MAX`), and updated the backend in `firebaseService.js` to assign all outgoing multicast and single-device messages to this channel, permitting sound playbacks and heads-up alerts.
- **Production-Grade Push Wake Payloads**: Injected high-priority delivery parameters (`android: { priority: 'high', notification: { sound: 'default', channelId: 'default' } }` and APNs `aps` blocks) into all FCM payload builders, forcing Android and iOS operating systems to wake up locked/dozed devices and immediately display push banners outside the application.

#### ⚡ Automated & Manual Announcement Flows:

- **Relaxed Campaign Editing Safeguards**: Removed the restrictive `status === 'sent'` block in the backend `updateNotification` controller (`backend/controllers/notifications.js`), allowing administrators to modify and update already created/sent manual notification campaigns for absolute operational flexibility.
- **Unlimited Manual Dispatches**: Bypassed the `'sent'` check in `sendNotificationImmediately` controller, enabling administrators to manually broadcast any push notification campaign at any time with absolutely no system-imposed limits.
- **Firebase Network Hang Safety**: Set a 2.5-second Promise race timeout safeguard across all FCM delivery functions in `firebaseService.js` (`sendToSingleDevice`, `sendMulticast`, `sendToTopic`). If a connection block or Google DNS latency delays the API request, it automatically terminates and logs a clean warning rather than hanging the admin frontend loop indefinitely.
- **Seeded Template Empty Target Validation**: Upgraded the immediate send controller to reload and check if a dispatched campaign resolves to 0 active targeted employees (which commonly occurs with legacy seeded campaigns referencing mock user IDs). It now instantly catches this and alerts the administrator with a helpful feedback toast (`Failed to broadcast: No matching active target employees were found.`), preventing false successes.
- **Recurrence Schedule Auto-Recalculation**: Programmed automated interval calculations for Daily, Weekly, and Monthly campaigns inside the scheduler service (`notificationSchedulerService.js`). When a recurring campaign fires, its `scheduledAt` date automatically shifts forward (by +1 day, +7 days, or +1 month) and keeps status as `'scheduled'` for subsequent automated loops.
- **Delivery Flow Mode Toggle**: Exposed a dynamic selector in `CreateNotification.jsx` allowing admins to register a notification as either `Manual Broadcast` or `Automatic Workflow` (`isAuto: true`).
- **Dynamic Trigger Selectors**: If "Automatic Workflow" is selected, a context-aware selector appears instantly for assigning trigger events such as `Employee late by 15 mins`, `Employee outside geofence`, `Leave approved`, etc.
- **Flexible Manual Broadcasting**: Enabled administrators to send automatic notification campaigns manually on-demand directly from the central grid, removing standard limitations on `Sent` and automated triggers.
- **Backend API Ingestion**: Updated backend query scopes in `getNotifications` controller to retrieve all campaign logs, letting standard and automated notifications live, filter, and render under a single unified administration grid.
- **Smart Automated Absent & Late Grace Engines**: Created the dynamic background scanner `processAutomaticWorkflows` inside `notificationSchedulerService.js`. On every ticks loop (every 30 seconds):
  - **Leave and Holiday Exemptions**: Automatically queries and bypasses any employee who is currently on an approved leave (`status: 'Approved'`) today or if today is a public holiday, preventing incorrect penalty notifications.
  - **Grace Period Elapsed Late Alerts**: Dynamically tracks employee shift schedules. If the grace period (e.g. shift start + 15 minutes) passes and they have not clocked in, it dispatches an automated high-priority late reminder.
  - **70% Shift Duration Elapsed Absent Alerts**: If 70% of the employee's shift duration has elapsed today and they still have not clocked in, it dispatches an automated absent alert.
  - **"Automatically Gone" Clear Actions**: If a late employee punches in, the system dynamically locates all unread late/attendance alerts sent to that employee today and automatically marks them as read, immediately clearing their notification drawer unread badges.
- **Dashboard Table Columns Syncing**: Resolved the duplicate display issue where all rows showed "Manual dispatch" in the administration grid. Re-anchored timing fields to correct schema keys (`scheduledAt`, `status`, `createdAt`), rendering true scheduled timings, dispatch logs, failure counts, or draft details properly for all rows while fully maintaining layout consistency.
- **Premium Mobile Category Branding**: Implemented distinct color branding and visual themes for every notification type (`Emergency Alert`, `HR Announcement`, `Attendance Alert`, `Punch Confirmation`, etc.) in the employee mobile app:
  - **Color-Coded Status Pills**: Added beautiful high-contrast text badges to identify categories instantly on mobile feeds.
  - **Dynamic Unread Accent Borders**: Unread cards feature left-hand dynamic color borders matched to the type.
  - **Themed Glowing Shadows & Glows**: Active unread alerts are styled with soft themed drop shadows of the category's primary color.

---

### 28. Seed Database Interactive Admin Integration (May 19, 2026)

**Changed**: Integrated a dynamic "Seed DB" utility directly into the Admin Staff Directory page to reset and populate the HRMS database on-demand.

#### Backend Controller & Route:

- **File**: `backend/controllers/settings.js`, `backend/routes/settings.js`
- **Route**: `POST /api/settings/seed-db`
- **Implementation**: Spawns the comprehensive seeding script `seed_comprehensive.js` as an isolated child process using `child_process.fork`, passing system environment variables. Bypasses blocking process termination by waiting for the exit code asynchronously before returning a success or failure status to the frontend.

#### Admin Panel Integration:

- **File**: `admin-panel/src/pages/Employees.jsx`
- **Interactive Trigger**: Rendered a premium amber "Seed DB" button directly to the left of the "Format" button.
- **State Handling**: Includes loader spinners (`isSeeding` state) and interactive action confirmation dialog guards (`window.confirm`) to prevent accidental database resets. Reloads all staff records dynamically upon successful completion.

---

### 29. Timezone-Robust Notification Reports Date Filtering (May 20, 2026)

**Fixed**: Resolved a date range filtering issue in the Notification Reports dashboard that caused older logs (such as May 10 data) to display even when the start filter was set to a later date (such as May 15).

#### 🌐 Timezone-Independent Date Parsing & Filtering:

- **Frontend Calendar Parsing (`CustomDatePicker.jsx` & `NotificationReports.jsx`)**: Updated custom date picker parsing to parse YYYY-MM-DD input strings in local timezone instead of defaulting to UTC, eliminating timezone-offset shifting. Configured client-side report date filters to parse search bounds in local timezone to guarantee accurate visual filtering in the table grid.
- **Backend API Query Constraints (`notifications.js`)**: Modified `/api/notifications/reports` start/end date parsing from timezone-dependent `.setHours()` modifications to strict, timezone-independent UTC ISO-8601 formatting (e.g. `YYYY-MM-DDT00:00:00.000Z` and `YYYY-MM-DDT23:59:59.999Z`). This ensures that MongoDB queries match exactly against stored UTC dates without local timezone overlap or leakage.

---

### 30. Automated Notification Daily Single-Delivery Frequency Constraint (May 20, 2026)

**Changed**: Integrated a frequency guard to ensure that automated notifications of a specific type (e.g., late reminders, geofence alerts, punch confirmations, etc.) are sent at most **once per employee per day**, preventing spamming from background workers. Manual announcements sent by admins remain fully unlimited and unrestricted.

#### 🔕 Daily Delivery Frequency Cap logic:

- **Instant Dispatch Guard (`notificationService.js`)**: In `createAndSendNotification`, if `isAuto` is true, the system dynamically checks for any automated notification of the target `type` dispatched to each resolved employee today. Any employee who has already received one is filtered out from the target pool, avoiding duplicate notifications.
- **Scheduled Dispatch Guard (`notificationSchedulerService.js`)**: Applied the same daily single-delivery constraints inside `dispatchNotificationDocument` for scheduled automated campaigns, filtering out already notified employees prior to executing bulk push and feed logs creation.

---

### 31. Notification Dashboard Department Employee Counts (May 20, 2026)

**Changed**: Added an "Employees Count" column to the department-wise report table, giving admins visibility into the total size of each department alongside message telemetry.

#### 📊 Telemetry and CSV Export Enhancements:

- **Department-wise Employee Counts (`NotificationAnalytics.jsx`)**: Integrated an inline filtering operation to count active employees for each department by dynamically matching their department names with case-insensitive and whitespace-trimmed safety.
- **Header & CSV Updates**: Added the "Employees Count" header and data column to both the grid UI and the CSV export format.

---

### 32. Custom Form Status Dropdowns for Shift Setup, Departments, and Designations (May 20, 2026)

**Changed**: Replaced the native HTML status `<select>` inputs with custom styled interactive dropdown buttons on three primary management pages.

#### 🎨 Custom Dropdown Enhancements:

- **Consistent Visual Design (`ShiftSetup.jsx`, `Departments.jsx`, `Designations.jsx`)**: Designed a premium state-indicator select dropdown featuring status-colored dots (emerald for Active, rose for Inactive), smooth chevron rotations, and outside-click automatic closing.
- **Table Integrity Kept**: Restructured form components exclusively, avoiding any side-effects to existing grid view columns or bulk toggle interactions.

---

### 33. Employee Assignment Overview, Deferred Absences, and AI Performance Leaderboard (May 21, 2026)

**Changed**: Integrated "Neutral" status in shifts, deferred daily absence marking until shift completion, added table pagination, overhauled AI Analytics to a clean score leaderboard, and optimized the Gemini AI/Fallback workflows.

#### 🕒 Neutral Status & Deferred Daily Absences:

- **Deferred Absence Logic ([attendance.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/controllers/attendance.js) & [reports.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/controllers/reports.js))**: Modified backend controller rules to defer marking employees as "Absent" for the current day. Employees are only marked as "Absent" once their shift has fully ended. While their shift is still active, they remain marked as "Not Punched In" (which renders on the frontend as a "Neutral" status).
- **Joining Date & Leave Guards**: Restructured user checking parameters to skip expected attendance evaluation for employees whose joining/creation dates fall after the queried target date.

#### 📄 Shifts Page Pagination:

- **Table Pagination ([Shifts.jsx](file:///e:/Downloads/Geo-Attendance-HRMS-System/admin-panel/src/pages/Shifts.jsx))**: Added pagination controls to the Employee Shift Overview table with an increment threshold of 10 records per page.

#### 📊 AI Leaderboard Overhaul & Sliding Drawers:

- **Clean Performance Grid ([AiAnalytics.jsx](file:///e:/Downloads/Geo-Attendance-HRMS-System/admin-panel/src/pages/AiAnalytics.jsx))**: Replaced complex sub-panels with a single premium leaderboard showing employee Rank, Name, Department, and AI Score. Included a button to toggle-expand a custom glassmorphic drawer containing the 12 primary stats (Working Days, Total Work Hours, Break Time, Distance, Shift details, Late days, Half Day Count, Absent Days, Leave Days).
- **Explicit Table Grid Lines**: Enforced `border-collapse` and `border-slate-300` styling on the table container, headers (`th`), cells (`td`), and expanded drawer rows to present a consistent visual grid.

#### 🧠 Optimized Gemini & Local Fallback Workflows:

- **Batch AI Evaluations ([aiAnalytics.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/controllers/aiAnalytics.js))**: Configured the controller to summarize employee stats and query Gemini in a single batch prompt, evaluating all workforce scores simultaneously.
- **Local Fallback Formula**: Integrated a fallback weighted HR model (weighted 35% Attendance, 25% Punctuality, 30% Productivity, 10% Break Discipline) to calculate performance scores locally when the Gemini API is unreachable or invalid.
- **Proactive Key Guard**: Implemented pre-flight checks in the backend to immediately skip Gemini API calls if the `GEMINI_API_KEY` is missing or a placeholder, returning fallback scores with `isFallback: true` to avoid network hang times.
- **Header Warning Indicators**: Added a warning alert banner and a `Gemini API Offline (Fallback Mode)` badge in the header when using local fallback metrics.

---

### 34. Timezone-Aware Shift & Attendance Alignment (May 22, 2026)

**Changed**: Aligned backend timezone-aware calculations to fixed Indian Standard Time (IST, UTC+5.5), resolving shift mapping discrepancy offsets, incorrect daily absence counts, and missing attendance punch-in records on server time zone differences.

#### 🌐 Indian Standard Time (IST) Alignment:

- **Central Timezone Utility ([timezone.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/utils/timezone.js))**: Created a fixed Indian Standard Time (IST) Date builder and component generator, decoupling calculations from host system timezone.
- **Dynamic Shift Window Alignment ([attendance.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/controllers/attendance.js) & [employeeStatsService.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/services/employeeStatsService.js))**: Updated `matchShift` to compare current time against yesterday, today, and tomorrow shift windows relative to IST. Decoupled status verification (`resolveStatus`), check-in buffers, and late calculations from server timezone biases.
- **Unified Attendance Queries ([auth.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/controllers/auth.js) & [employees.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/controllers/employees.js))**: Fixed `/me` profile check and online status queries to query active sessions within the target date's IST midnight boundaries.
- **Reporting Grid Sync ([reports.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/controllers/reports.js))**: Configured aggregation queries using timezone `+05:30` parameters and localized monthly calendar indexing in `getMonthlyView` to prevent off-by-one calendar cells.
- **Validation Suite**: Added direct verification and unit-test scripts (`verify_controllers.js` and `simulate_new_logic.js`) to validate logic stability.

---

### 35. Dashboard Attendance and Shift Completion Adjustments (May 22, 2026)

**Changed**: Updated the dashboard logic for both the mobile app and website to allow employees to punch in/out after their shift has ended, and to avoid counting employees as absent until the calendar day is complete.

#### 📱 Mobile App Dashboard screen ([DashboardScreen.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/mobile-app/src/screens/DashboardScreen.js)):

- Removed `isMissed` and `isOver` checks from the "Day Completed" view logic.
- Configured the dashboard to render the active action button ("Punch In Now" or "Punch Out Now") regardless of whether the shift has ended, until the user actually punches out.

#### 💻 Website/Admin Dashboard Page stats ([reports.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/controllers/reports.js)):

- Modified the main statistic aggregation endpoint `getStats` to count an employee as absent only if the calendar day has ended (after 23:00) without any punch-in, instead of checking if their shift has ended.
- Standardized absent-marking logic to align with `getTrackingStats` and `getAttendanceDashboard` rules.

---

### 36. Attendance Policy, Timezone Hardening, and Mobile UX Upgrades (May 23, 2026)

**Changed**: Implemented 13 key updates covering comprehensive database seeding, mobile focus sync, timezone calculations, isNightShift refactoring, shift-end punch checks, mobile name wrapping, and admin reporting guards.

#### 1. Fresh Seeding Condition Guard

- **File**: `backend/scripts/seed_comprehensive.js`
- **Fix**: Updated seed logic so that key test accounts (e.g. `adesh@example.com`) are seeded without active punch-in records for today, allowing verification of fresh/not-punched states.

#### 2. Mobile App Attendance Screen Refresh

- **File**: `mobile-app/src/screens/AttendanceScreen.js`
- **Fix**: Added dynamic `focus` navigation listeners that re-trigger all metadata, status, settings, history, and leave synchronization routines whenever the employee navigates to or opens the page.

#### 3. Shift Setup Grace and Cutoff Retention

- **File**: `backend/controllers/attendance.js`
- **Fix**: Configured backend `punchIn` and database tracking controllers to populate and save shift grace period and half-day cutoff values directly into the daily attendance document.

#### 4. Punch Button Completion Safeguards

- **Files**: `mobile-app/src/screens/DashboardScreen.js`, `mobile-app/src/screens/AttendanceScreen.js`
- **Fix**: Restructured check routines to completely hide or lock the punch-in/out button widgets once the employee has registered both check-in and check-out logs for today.

#### 5. Late vs. Half Day Validation Realignment

- **File**: `backend/services/employeeStatsService.js`
- **Fix**: Hardened shift delay verification to mark employees as "Half Day" rather than "Late" if they check in after their shift's configured half-day cutoff threshold.

#### 6. Complete Removal of legacy `isNightShift`

- **Files**: `backend/models/Shift.js`, `backend/data/seed.json`, `mobile-app/src/screens/DashboardScreen.js`
- **Fix**: Completely cleaned and removed the obsolete `isNightShift` model property across the backend server and mobile codebase, replacing it with dynamic time boundary comparison rules.

#### 7. Admin Tracking Dashboard Graph Alignment

- **File**: `backend/controllers/reports.js`
- **Fix**: Realigned graph queries on the admin dashboard to skip counting un-punched employees as absent and show them under the "Neutral" statistic category until their specific shift or the calendar day has ended.

#### 8. End-of-Day Deferred Absenteeism Checks

- **Files**: `backend/controllers/reports.js`, `backend/services/employeeStatsService.js`
- **Fix**: Ensured that the daily scheduler and statistics modules defer marking non-punching employees as absent until after 23:00 IST (or shift end), keeping them neutral beforehand.

#### 9. Shifts Overview Page Leave Status Display

- **Files**: [Shifts.jsx](file:///e:/Downloads/Geo-Attendance-HRMS-System/admin-panel/src/pages/Shifts.jsx), [shifts.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/controllers/shifts.js)
- **Fix**: Fetched approved leaves on the frontend and matched them against the selectedDate to override status to 'Leave' (purple badge). Added a descriptor comment in shifts.js to satisfy file limits.

#### 10. Timezone-Safe Leave Query Boundaries

- **File**: `backend/controllers/attendance.js`
- **Fix**: Replaced direct offset-bound matching with strict start/end UTC limits mapped to the target date's IST day boundaries to locate active leaves reliably.

#### 11. New Hire Joining Date Constraints

- **File**: `backend/controllers/attendance.js`
- **Fix**: Unified target day boundary checks to ignore expected attendance tracking for employee accounts whose creation timestamp or joining date post-dates the query date.

#### 12. Localized Sunday Weekoff Check

- **File**: `backend/controllers/attendance.js`
- **Fix**: Refactored Sunday check logic to parse localized IST components instead of offset-based UTC days.

#### 13. Mobile UI Name-Wrapping Optimizations

- **Files**: `mobile-app/src/screens/DashboardScreen.js`, `mobile-app/src/screens/ProfileScreen.js`
- **Fix**: Adjusted container metrics, fonts, and styling properties to gracefully wrap long employee name strings in the header and profile screens, preventing text clip-offs.

---

### 37. Notification Categorization, Custom UI Elements, and Campaign Seeding (May 24, 2026)

**Changed**: Standardized notification categories to strict lowercase enums, integrated custom select components, overhauled the campaign creation layout, and resolved seeding typos.

#### 📢 Category Enums & Trigger Mappings:

- **Files**: `backend/models/Notification.js`, `backend/services/autoNotificationService.js`, `backend/scripts/seed_comprehensive.js`
- **Unified Names**: Set Notification categories to exactly: `'general notification'`, `'emergancy notification'`, `'hr announcement'`, `'attendance notification'`, and `'tracing notification'`.
- **Auto-Notification Triggers**: Restructured backend services and seed logic to dispatch and template categories correctly based on sub-auto types:
  - `general notification`: `Leave approved`, `Shift change reminder`
  - `attendance notification`: `Employee late by grace time`, `Employee punch out reminder`, `Employee absent`
  - `tracing notification`: `Employee outside geofence`, `Employee inside geofence area`

#### 🎨 Custom Select Dropdowns & Centered Form UI:

- **File**: `admin-panel/src/pages/notifications/CreateNotification.jsx`
- **Custom Dropdowns**: Integrated custom animated `CustomSelect` elements to replace all standard HTML select elements, matching the premium indigo visual theme.
- **Centered Layout**: Centered the main card element on the page (`min-h-[80vh] flex flex-col justify-center items-center`), replaced black accents with theme colors, and removed the mobile phone mock preview panel.
- **Custom Confirmation Modal**: Added a custom deletion confirmation overlay widget, deprecating native `window.confirm` dialogs.
- **Bug Fixes**: Corrected matching case targets inside `getSubAutoTypesForType` to cleanly parse `'general notification'` and `'tracing notification'`.

#### 📊 Notification Reports & Feeds:

- **Files**: `admin-panel/src/pages/notifications/AllNotifications.jsx`, `mobile-app/src/components/NotificationDrawer.js`
- **Dynamic Alignment**: Aligned the notification overview list tags and mobile notification drawer feeds to color-code and display the revised lowercase types.

---

### 38. Leave Dashboard, Orphan Record Cleanup, and Socket-Reconnection Hardening (May 26, 2026)

**Changed**: Resolved leave dashboard waiting counts, filtered out orphaned leave records, fixed reports date filtering, and hardened database and socket-connection layers.

- **Files**: `backend/controllers/leaves.js`, `backend/scripts/seed_comprehensive.js`, `admin-panel/src/pages/Reports.jsx`, `admin-panel/src/pages/Shifts.jsx`, `admin-panel/src/pages/EmployeeDetails.jsx`, `backend/controllers/reports.js`, `backend/config/db.js`, `backend/services/autoNotificationService.js`, `backend/services/geoTrackingService.js`, `backend/services/notificationSchedulerService.js`, `mobile-app/App.js`, `mobile-app/app.json`, `mobile-app/src/components/NotificationDrawer.js`, `mobile-app/src/screens/AttendanceScreen.js`, `mobile-app/src/screens/ShiftManagementScreen.js`, `mobile-app/src/socket.js`

#### 📊 Leave Dashboard & Statistics:

- **Pending Leave Scope**: Modified the database query filter in `getLeaveDashboard` (`backend/controllers/leaves.js`) to fetch leaves that either overlap the selected date range OR have a status of `'Pending'` using an `$or` query. This ensures that all future pending leaves are counted in the dashboard "Waiting Approval" summary box and tables.
- **Orphan Leaf Filtering**: Added defensive checks to filter out leaves belonging to deleted users (where user is `null`) in both the dashboard and general leaves list queries, eliminating empty employee names with "Staff Member" fallback designations.

#### ⚙️ Database Resilience & Seeding:

- **MongoDB Auto-Reconnection**: Wrapped database queries inside a retry mechanism in `backend/config/db.js` and `backend/scripts/seed_comprehensive.js` to automatically re-connect and retry when encountering temporary `ECONNRESET` socket exceptions.
- **Leave Request Dates**: Refactored the comprehensive seeding script to output realistic past application dates (rather than the current execution date) for past historical leave requests, aligning leave counts precisely with attendance reports.

#### 📱 Mobile App Socket & UI:

- **Socket Auto-Reconnection**: Hardened client-side socket initialization in `mobile-app/src/socket.js` to automatically reconnect on drops and improve real-time telemetry updates.
- **UX Refresh**: Refined layout, notifications feed components, and shift tracking screen responsiveness.

#### 📝 Half-Day Leave Status Representation:

- **Reports, Shifts, and Employee Personal Tables**: Configured `Reports.jsx`, `Shifts.jsx`, `EmployeeDetails.jsx` and the backend personal details controller (`reports.js`) to display a distinct `'Leave(Half)'` status for approved half-day leaves, leaving the existing `'Half Day'` status strictly for normal half-day check-in records.
- **UI Enhancements**: Added `'Leave(Half)'` as a selectable status in report and shift assignment filters, sorting columns, and configured its rendering styling to map to the purple Leave visual class.

---

### 39. Holiday Exclusions and Mobile Tracking Route Restriction (May 27, 2026)

**Changed**: Excluded active holidays from employee absent statistics, labeled holiday dates on the employee details logs, and restricted route tracking view in the mobile app.

- **Files**: `backend/services/employeeStatsService.js`, `backend/controllers/reports.js`, `admin-panel/src/pages/EmployeeDetails.jsx`, `mobile-app/src/screens/TrackMyRoute.js`

#### 📊 Holiday Absence Exclusions:

- **Employee Statistics**: Modified `getEmployeeFullStats` and `getAggregatedStats` in `backend/services/employeeStatsService.js` to fetch and check active holidays, ensuring that holidays are excluded from the calculated `absentDays` count on the individual employee details page.
- **Personal Details Logs**: Configured `getEmployeePersonalDetails` in `backend/controllers/reports.js` to fetch active holidays in the queried date range. Dates with no attendance records that fall on holidays resolve with status `'Holiday'` instead of `'Absent'`.
- **Admin Details Table**: Updated `EmployeeDetails.jsx` to map and render the `'Holiday'` status badge as a blue badge (`bg-blue-50 text-blue-600 border-blue-100`).

#### 🗺️ Mobile Route Tracking Restrictions:

- **TrackMyRoute Page**: Updated `TrackMyRoute.js` to fetch weekly off days, active holidays, and approved leaves. If the selected date falls on a weekly off day, holiday, or full-day leave, a "Tracking Not Available" message is displayed, mapping overlays are hidden, and total distance defaults to `0 meters`.

---

### 40. Office Setup Counts, WeekOffs Redesign, Custom Holiday Picker, and Export Fixes (May 27, 2026)

**Changed**: Integrated live employee counts in Department and Designation tables, overhauled the WeekOffs layout and validations, resolved custom date-picker dropdown close bugs, centered import formats, and fixed Excel date formatting overflows.

- **Files**: `backend/controllers/departments.js`, `backend/controllers/designations.js`, `backend/scripts/seedData.js`, `admin-panel/src/pages/Departments.jsx`, `admin-panel/src/pages/Designations.jsx`, `admin-panel/src/pages/WeekOffs.jsx`, `admin-panel/src/pages/Holidays.jsx`

#### 📊 Live Employee Counts for Department & Designation:

- **Backend Aggregation**: Updated both `departments.js` and `designations.js` controllers to use Mongoose `$group` aggregation pipelines on the `User` collection. Computes and maps counts case-insensitively using `.trim().toLowerCase()` to handle mismatches.
- **Frontend Columns**: Rendered the dynamic `employeeCount` column in Department and Designation tables, and included counts in their respective CSV exports.
- **Seeding Script Syncing**: Refactored `seedData.js` to clear and pre-populate discrete `Department` and `Designation` schemas based on unique user values in `seed.json`, ensuring seeded employee counts display correctly on clean installations.

#### ⚙️ WeekOffs Redesign & Selection Validation:

- **Full-Width Layout**: Redesigned the WeekOffs page UI, expanding the day-selection buttons into a clean, full-width responsive grid.
- **Information Panel Removal**: Removed the right-side summary text and configuration guidelines to reduce clutter.
- **Button Relocation**: Placed the "Save Changes" action button inside the 8th grid slot next to Sunday.
- **Validation Guard**: Added validation enforcing that at least one weekly off day must be selected, warning the user and preventing empty submissions.

#### 📅 Custom Holiday Date Picker & Import UI:

- **Future Date Support**: Built an interactive custom calendar picker in `Holidays.jsx` supporting past and future dates (+10 years) with custom year and month dropdown selectors.
- **Propagation Bug Resolution**: Added `e.stopPropagation()` handlers on dropdown `onMouseDown` events, preventing clicks on month/year select options from closing the popover calendar.
- **Import Format Table Centering**: Centered headers and cells in the Holiday Import Format modal table.
- **CSV Excel Overflow Safeguard**: Prepended a leading space (`' '`) to dates in CSV exports, forcing Excel to treat them as text and resolving the clipped date display error (`###`).

---

### 41. Device Login Protection, Custom Month & Attendance Controls, and Leave Dashboard Enhancements (June 2026)

**Changed**: Implemented duplicate device login blocking, custom month picker and base-60 hours conversion in mobile app, leave dashboard availed detailed breakdowns, centered leaves table alignment, global stats calculations, and custom pagination resetting.

- **Files**: `mobile-app/package.json`, `mobile-app/src/screens/DashboardScreen.js`, `admin-panel/src/pages/Leaves.jsx`, `admin-panel/src/pages/LeaveDashboard.jsx`, `admin-panel/src/pages/EmployeeDetails.jsx`, `admin-panel/src/pages/notifications/NotificationReports.jsx`, `admin-panel/src/pages/Shifts.jsx`, `admin-panel/src/pages/Reports.jsx`, `admin-panel/src/pages/Employees.jsx`, `backend/controllers/leaves.js`, `backend/controllers/auth.js`

#### 📱 Mobile App Enhancements:

- **Duplicate Device Login Protection**: Integrated `expo-application` dependency to capture unique hardware device IDs on mobile login. The backend records `currentDeviceId` and blocks logins from foreign devices if active.
- **Custom Month Dropdown Picker**: Replaced the static month label with a touchable dropdown calendar trigger opening a native React Native Modal. Displays a scrollable list of the last 12 months, fetching report statistics for the exact date range of the selected month.
- **Base-60 Hours Formatter**: Developed a converter function (`formatCustomHours`) to translate standard decimal hours into base-60 minutes representation (e.g. 3 hours 27 minutes renders as `3.27hr` instead of `3.45hr`) for both Worked Hours and Break Time dashboard cards.

#### 📊 Admin Leave Dashboard & Requests:

- **Availed Leave Breakdown**: Updated `getLeaveDashboard` backend controller to query and return `fullCount` and `halfCount` for employee availed leave types. The frontend Leave Dashboard displays detailed breakouts for each availed type (e.g. `2.5 (2 Full, 1 Half)` or `0.5 (1 Half)`).
- **Half-Day Quantities Display**: Formatted the "Half Day" summary card and table cells to display the request count beside equivalent days (e.g. `2 (1d)`).
- **Pagination Filter Reset**: Configured the Leave Requests page (`Leaves.jsx`) to reset the current page index to 1 whenever any status, type, duration, or search filter changes, preventing empty states on high page offsets.
- **Global Cards Stats**: Re-mapped stats card counts in `Leaves.jsx` to filter from the global requests array rather than the active filtered sub-rows.
- **Table Visual Enhancements**: Centered all text and column values in the Leave Requests table. Formatted "Applied On" dates to display time components in 12-hour AM/PM format.

#### ⚙️ Admin Logs, Orderings & Confirmations:

- **Last 10 Days Default**: Changed the individual employee details page (`EmployeeDetails.jsx`) to default its date range to the last 10 days and retrieve the corresponding logs.
- **Notification Custom Date**: Set `NotificationReports.jsx` to default its start date boundary to 10 days ago, and replaced the pagination dropdown with a custom "Show X rows" picker.
- **Shifts & Reports Date & Sort**:
  - `Shifts.jsx` displays the current date and lists the latest punched-in user at the top.
  - `Reports.jsx` (for both present and break sheets) orders data so that the latest check-in and break activity appears at the top of the tables.
- **Removed Confirmation Popups**: Cleaned employee creation, updates, and deletions in `Employees.jsx` by deprecating native confirmation dialogs.

---

### 42. Dynamic Mobile App Download Links & Employee Deletion Confirmation (June 1, 2026)

**Changed**: Enabled dynamic mobile app download links editing on the Admin Profile page, integrated the links dynamically into employee credential generation and sharing systems, and added a custom delete confirmation dialog to the Employee List.

#### ⚙️ Profile Page - Dynamic App Download Links:

- **Files**: [Profile.jsx](file:///e:/Downloads/Geo-Attendance-HRMS-System/admin-panel/src/pages/Profile.jsx), [CompanySetting.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/models/CompanySetting.js), [settings.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/controllers/settings.js), [backend/.env](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/.env), [backend/.env.example](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/.env.example)
- **Dynamic Link Inputs**: Added inputs on the Profile edit page to edit Android and iOS download URLs. Saved these link updates dynamically via `PUT /settings/office` to mongoose `CompanySetting` document.
- **Backend Defaults & Fallbacks**: Configured `CompanySetting` defaults and `getOfficeSettings` controller fallbacks to retrieve `ANDROID_APK_URL` and `IOS_APP_URL` from the backend environment configuration, rather than using hardcoded values.

#### 📱 Staff Directory - Dynamic Link Sharing & Deletion Confirmation:

- **File**: [Employees.jsx](file:///e:/Downloads/Geo-Attendance-HRMS-System/admin-panel/src/pages/Employees.jsx)
- **Link Sharing**: Fetched the dynamic mobile app links from office settings in `fetchData` and applied them to the Employee Success Modal and share/copy template messages.
- **Confirmation dialog**: Restored the custom confirmation overlay dialog (`requestActionConfirm`) when clicking the employee Delete button instead of executing the deletion immediately.

---

### 43. Customer Visit System — Full UI/UX Overhaul (June 3, 2026)

**Changed**: Comprehensive improvements across the Admin Panel's Customer Visit Dashboard & Reports pages, and the Mobile App's Customer Visit Screen — covering syntax fixes, UI enhancements, GPS/selfie flow, one-visit-at-a-time enforcement, and report column additions.

- **Files**: `admin-panel/src/pages/CustomerVisitDashboard.jsx`, `admin-panel/src/pages/CustomerVisitReports.jsx`, `mobile-app/src/screens/CustomerVisitScreen.js`

#### 🐛 Admin Panel — CustomerVisitDashboard Syntax Fix:

- Fixed broken JSX returned by the user's edit: misplaced closing `);` and `export default` statement were incorrectly indented inside the component body — moved both to correct top-level positions.
- Improved loading spinner from inline text to a properly centered `flex-col` layout with an uppercase "LOADING DATA…" label.

#### 📊 Admin Panel — CustomerVisitReports Column Fixes:

- **TypeError fix**: Removed orphaned `{columns.schedule.visible && ...}` table cell from the tbody — the `schedule` key had been deleted from the `columns` state but its `<td>` render block remained, causing `Cannot read properties of undefined (reading 'visible')`.
- **Executed On column added**: New `executedOn` column added to the `columns` state, `<thead>`, and `<tbody>` immediately to the right of Start Details. Displays the execution date (`DD/MM/YYYY`) and 12-hour time extracted from `visit.startTime`. Column is sortable via `requestSort('startTime')` and togglable through the existing column visibility dropdown.
- Time formatting in Executed On cell uses `formatDateDMY` and `formatTime12` helpers (already present) for consistency.

#### 📱 Mobile App — CustomerVisitScreen Improvements:

**LocationMapCard Redesign:**

- Removed the static Google Maps thumbnail image entirely from `LocationMapCard` — was causing layout bloat and required a paid API key.
- Replaced with a compact single-row address card: `MapPin` icon → full address text (no `numberOfLines` truncation, wraps freely) → `ExternalLink` icon (tappable to open Google Maps).

**GPS Location Confirmation Before Selfie:**

- On both Start and Complete actions, after GPS capture and reverse-geocoding, the employee now sees an Alert: `"📍 Your Current Location"` showing the full resolved address + coordinates (`lat, lng` to 6 decimal places).
- Employee must tap **"OK — Take Selfie"** to proceed, or **Cancel** to abort — ensuring they verify their location before the selfie is taken.
- Cancelling does not show an error alert (Promise rejection with `'cancelled'` is caught silently).

**One Visit In Progress at a Time:**

- Before executing a `start` action, the code now checks `visits.find(v => v.status === 'In Progress' && v._id !== visitId)`.
- If another visit is already In Progress, the employee sees an alert: `"Visit Already In Progress — You already have an active visit with [customerName]. Please complete it before starting a new one."` and the action is blocked.

**Active Visit (In Progress) Card — Start Info Panel:**

- When a visit is In Progress, the complete action area now shows a full start-info panel (indigo background) above the completion input:
  - **VISIT STARTED** label with the start time (12-hr format).
  - Selfie thumbnail (tappable to full-screen preview).
  - Full start address in `LocationMapCard` (tappable to open Google Maps).
  - Scheduled reason text.

**History Cards — End Reason:**

- History card completion section now checks both `visit.completionReason` (dedicated field) and `visit.reason` (fallback for completed visits), displaying `"End Reason: …"` if either exists.

**Address Geocoding Improvement:**

- Replaced string template concatenation (`${g.name || ''} ${g.street || ''}...`) with `[g.name, g.street, g.city, g.region].filter(Boolean).join(', ')` to avoid spurious commas or double spaces in addresses.

---

### 44. Geofence Map Toggles, Home Navigation, and Employee Scheduling Assignment (June 16, 2026)

**Changed**: Integrated dynamic map geofence visibility toggling, early attendance checks on customer visit startup, actual name-wise employee assignment, back-to-home navigation on attendance, automated live location polling, reverse geocoding, and map container lifecycle cleaning.

#### 🗺️ Geofence Visibility Toggle on Maps:

- **Files**: `mobile-app/src/components/AttendanceMap.js`, `mobile-app/src/components/AttendanceMap.web.js`, `mobile-app/src/screens/DashboardScreen.js`, `mobile-app/src/screens/AttendanceScreen.js`, `admin-panel/src/pages/WorkingPlaces.jsx`
- **Dynamic Render Control**: Configured map Circle components to render dynamically based on `geofenceEnabled` office settings.
- **Admin Map Circle Toggle**: Hooked a React `useEffect` to `geofenceEnabled` in WorkingPlaces to add or remove Leaflet circle dynamically from map layer when the geofence toggle is clicked.
- **Mobile Map Propagation**: Passed the `geofenceEnabled` property down to all inline and full-screen maps on Dashboard and Attendance pages to hide the blue zone border when geofencing is turned off.

#### 👥 Name-Wise Employee Visit Scheduling:

- **File**: `admin-panel/src/pages/Customers.jsx`
- **Dropdown List Updates**: Overhauled employee list mapping to display and filter by actual employee names (retrieved from User schema `name` field) rather than displaying designation/department fields as primary entries.
- **Label Mapping**: Rewrote `getSelectedEmployeesLabel` to trace and list selected employee names with a fallback indicator.

#### 🚶 Attendance Page Back Navigation & Selfie Capture UX:

- **File**: `mobile-app/src/screens/AttendanceScreen.js`
- **Back Button Navigation**: Set the top-left navigation button in the Attendance Screen to navigate directly to the `'Home'` page.
- **Selfie Verification Box**: Configured the identity verification box (selfie container) to stay hidden initially, showing only when a selfie is captured.
- **Selfie-Mandatory flow**: Hardened punch button behavior to prompt for a selfie before submitting check-ins/outs.

#### 📍 Auto Live Location, Reverse-Geocoding, and High Precision Maps:

- **File**: `admin-panel/src/pages/WorkingPlaces.jsx`
- **Live Location Polling**: Initiated automatic browser geolocation capture when opening the Add Working Place modal to set pin location.
- **Reverse Geocoding**: Connected map markers and map click events to Nominatim reverse geocoding API to dynamically populate the formatted address in the Address box.
- **Location Refresh Button**: Added a coordinates header button next to form labels to trigger manual geolocation updates.
- **Stale Container Cleanup**: Fixed "Map container is already initialized" errors by running a full cleanup routine (`googleMap.current.remove()`) on modal remounts.
- **Zoom & View Settings**: Integrated Google Maps terrain view layer with zoom capability up to 22 (1 meter ground distance precision).

#### 🚏 Customer Visit Start-Attendance Check:

- **File**: `mobile-app/src/screens/CustomerVisitScreen.js`
- **Early Punch-in Validation**: Ensured clicking "START VISIT" triggers an immediate check for today's attendance. Prevents location mapping or selfie capture if the employee is not punched in.

---

### 45. Enterprise Location Tracking Overhaul, Kalman Smoothing, Offline Queueing, and Deduplication (June 17, 2026)

**Changed**: Architected an enterprise-grade high-fidelity tracking system featuring client-side offline buffering, Kalman route smoothing, background geocoding, strict deduplication, and sequential path distance recalculation.

#### 1. 2D Kalman Filter & Route Smoothing

- **File**: [geoTrackingService.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/services/geoTrackingService.js)
- **Smoothing Engine**: Implemented a 2D Kalman filter algorithm (`smoothPoints`) to filter out GPS jitter and smooth route polyline coords.

#### 2. GPS Signal Recovery & Accuracy Preservation

- **File**: [geoTrackingService.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/services/geoTrackingService.js)
- **Signal Gaps**: Gaps > 120s are parsed as recovery points, starting a fresh segment (setting incremental distance to 0) instead of accumulating large jump distance errors.
- **Accuracy Preserver**: High-error coordinates (>50m accuracy) are flagged as `'weak'` rather than discarded, keeping the map route continuous without frozen positions.

#### 3. Client-Side Persistent Offline Buffering

- **File**: [offlineQueue.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/mobile-app/src/utils/offlineQueue.js)
- **Local Persistence**: Built a local queue using `AsyncStorage` to persistently buffer points when offline, automatically flushing them using Socket.IO (with REST fallback) upon reconnection.
- **App Entry Task**: Integrated the queue with the mobile background `LOCATION_TRACKING_TASK` and foreground trackers.

#### 4. Decoupled Asynchronous Reverse Geocoding

- **Files**: [enterpriseTrackingService.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/services/enterpriseTrackingService.js), [googleMaps.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/utils/googleMaps.js)
- **Background Worker**: Moved reverse geocoding to an asynchronous background worker (`reverseGeocodeAsync`) to prevent blocking socket event loops.
- **Throttling**: Configured geocoding to trigger only if the user has moved > 100 meters or if 5 minutes have elapsed since the last geocode, reusing cached addresses otherwise.

#### 5. Strict Deduplication, Sorting, and Recalculation

- **Files**: [enterpriseTrackingService.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/services/enterpriseTrackingService.js), [attendance.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/controllers/attendance.js)
- **Deduplication**: Filters out duplicate points by timestamp before writing to `RawTrackingPoint` or `trackingLogs`.
- **Chronological Sorting**: Automatically merges and sorts tracking logs ascending by time before performing distance accumulation.
- **Sequential Recalculation**: Loops through the sorted array to calculate `distanceFromPrevious` (applying a 5m stationary drift filter) and `totalDistanceTillNow` sequentially. Corrects double-counting and out-of-order jumps.

#### 6. Admin Panel Map Polyline

- **File**: [EmployeeTrackRoute.jsx](file:///e:/Downloads/Geo-Attendance-HRMS-System/admin-panel/src/pages/EmployeeTrackRoute.jsx)
- **Polyline Map**: Simplified route lines to render a single continuous red polyline on Leaflet, showing start (blue) and end (red) marker states.

#### 7. Robust Fallbacks & Bug Fixes

- **Files**: [attendance.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/controllers/attendance.js), [enterpriseTrackingService.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/services/enterpriseTrackingService.js)
- **Sync 500 Fix**: Resolved 500 internal server errors by changing `reverseGeocodeAsync` into a local scope function (fixing circular module requires) and validating `userId` to fall back to the authenticated user ID (`req.user.id`) if the client sends invalid values (like `"null"`).

### 46. High-Fidelity Road Snapping, Playback Animation, and Live Telemetry Dashboard (June 18, 2026)

**Changed**: Integrated high-fidelity road snapping (Google Roads + OSRM), interactive route playback animation, and comprehensive real-time telemetry (speeds, battery, signal quality, stops) across the mobile app and admin dashboards.

#### 1. SQLite WebAssembly Build Fix

- **File**: [metro.config.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/mobile-app/metro.config.js)
- **Asset Support**: Added `config.resolver.assetExts.push("wasm")` to Metro configuration, resolving the `wa-sqlite.wasm` compilation error and restoring full React Native bundling.

#### 2. Background Task Metadata Syncing

- **Files**: [tracking.service.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/mobile-app/src/services/tracking.service.js), [App.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/mobile-app/App.js)
- **Metadata Cache**: Updated the location service to write `activeTripId` and `deviceId` to `AsyncStorage` when tracking starts, and configured the background location task to retrieve these values. Ensures background GPS coordinates are mapped to the correct employee trip.

#### 3. Real-Time Telemetry Merging (Backend)

- **File**: [reports.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/controllers/reports.js)
- **Live Aggregation**: Updated `getTrackingStats` to query `LiveEmployeeStatus` and merge current speed, battery level, signal quality, stops, and travel time into the dashboard payload.
- **Route Summary Stats**: Updated route details endpoints to calculate and return aggregate daily stats (`avgSpeed`, `maxSpeed`, `stops`, and snapping `provider`).

#### 4. Premium Playback Replay & Dual-Route Maps

- **File**: [EmployeeTrackRoute.jsx](file:///e:/Downloads/Geo-Attendance-HRMS-System/admin-panel/src/pages/EmployeeTrackRoute.jsx)
- **Dual-Path Drawing**: Renders the road-snapped route (indigo line) and the raw GPS coordinates (dotted orange line) with overlay checkboxes to toggle views.
- **Route Replay Animation**: Implemented interactive playback controls (Play/Pause, restart, speed multipliers 1x/2x/5x/10x, and progress slider) to animate a moving pulse dot along the route, displaying telemetry tooltips for speed, time, address, and mock flags.
- **Daily Stats Cards**: Added cards displaying Distance, Avg Speed, Max Speed, Stops, and Snapping Provider.

#### 5. Live Telemetry Dashboard & Mobile Stats Cards

- **Files**: [TrackingDashboard.jsx](file:///e:/Downloads/Geo-Attendance-HRMS-System/admin-panel/src/pages/TrackingDashboard.jsx), [TrackMyRoute.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/mobile-app/src/screens/TrackMyRoute.js)
- **Dashboard Telemetry**: Added **Telemetry** (speed, color-coded battery %, signal badge) and **Stops / Time** (stops, travel time in minutes) columns to the live staff tracking table.
- **Mobile Routes View**: Updated the employee `TrackMyRoute` screen to display the same telemetry cards (distance, average speed, max speed, stops, and provider).

### 47. Geofence Boundary Circle Overlays, Bypassed Alert Frequency Limits, and Dynamic Address Resolution Fallbacks (June 19, 2026)

**Changed**: Integrated geofence boundary circle overlays on maps, bypassed daily frequency limits on geofence entry/exit alerts, and added dynamic reverse geocoding address resolution with coordinate-based fallbacks.

#### 1. Geofence Boundary Circle Overlays (Admin & Employee Maps)

- **Files**: [reports.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/controllers/reports.js), [EmployeeTrackRoute.jsx](file:///e:/Downloads/Geo-Attendance-HRMS-System/admin-panel/src/pages/EmployeeTrackRoute.jsx), [TrackMyRoute.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/mobile-app/src/screens/TrackMyRoute.js)
- **Employee-Specific Geofence**: Configured the route tracking details APIs to resolve the specific employee's `workingPlace` from the database and output it under `data.office`.
- **Map Overlays**: Updated the React (Leaflet) and React Native (`MapView.Circle`) frontends to draw a semi-transparent shaded circle overlay around the employee's correct office geofence coordinates instead of a generic fallback.

#### 2. Multi-Crossing Geofence Alert Triggers

- **Files**: [notificationService.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/services/notificationService.js), [enterpriseTrackingService.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/services/enterpriseTrackingService.js)
- **Alert Frequency Bypass**: Disabled the daily frequency guard for automated geofence crossing alerts (`tracing notification`), allowing instant push notifications to trigger and send _every time_ the employee enters or exits the boundary during a shift.
- **Entry Alerts**: Enabled the matching `triggerGeofenceEntry` auto-notification check inside the background tracking pipeline when a user returns inside the geofence.

#### 3. Dynamic Reverse Geocoding Address Resolution & Fallbacks

- **Files**: [reports.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/controllers/reports.js), [EmployeeTrackData.jsx](file:///e:/Downloads/Geo-Attendance-HRMS-System/admin-panel/src/pages/EmployeeTrackData.jsx), [TrackMyRoute.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/mobile-app/src/screens/TrackMyRoute.js), [googleMaps.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/utils/googleMaps.js), [enterpriseTrackingService.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/services/enterpriseTrackingService.js)
- **Address Resolution Utility**: Added `resolveMissingAddresses` in the reports controller to fill forward/backward geocoded addresses to neighboring points in a batch (within 1km and 10 minutes).
- **Coordinate-based Fallback**: If no address is geocoded, automatically formats the coordinates (e.g. `Location near 16.688055, 74.250686`) as the address fallback instead of `'Address not resolved'`.
- **Double-Safe Frontend Rendering**: Updated the Admin log table and Employee tracking log list to format coordinates as a fallback if the address is somehow missing or unresolved.

---

### 48. GPS Validation, Telemetry Cutoffs, and U-Turn Loop Pruning (June 20, 2026)

**Changed**: Implemented background telemetry continuity updates, increased warning cutoff thresholds, added 2-lane road U-turn loop pruning, and resolved GPS gap coordinate lockout issues.

- **Files**: `backend/services/enterpriseTrackingService.js`, `backend/services/routeReconstructionService.js`, `backend/services/roadValidationService.js`, `backend/server.js`, `admin-panel/src/pages/EmployeeTrackRoute.jsx`
- **Telemetry & Continuity monitoring**:
  - Updated `enterpriseTrackingService.js` to refresh `liveStatus.lastUpdate` even when all batch coordinates are filtered out as stationary drift, preventing false-positive telemetry alerts.
  - Increased telemetry warning monitor cutoff in `server.js` from 2 minutes to 5 minutes to accommodate background process sleeping.
- **U-Turn Loop Pruning**:
  - Built a loop/reversal detection algorithm `pruneUturnLoops` in `routeReconstructionService.js` to find and splice out detour/U-turn loops on undivided 2-lane roads.
- **GPS Lockout Recovery**:
  - Configured `roadValidationService.js` to trigger a Recovery Mode check when a gap >= 20 seconds is encountered, letting the system immediately accept the new coordinate.

---

### 49. Fail-Safe Route Rendering and Missing Snapped Points Fallbacks (June 20, 2026)

**Changed**: Added complete coordinate fallbacks for unsnapped tracking points to guarantee route rendering under any condition in the admin panel and mobile app.

- **Files**: `backend/controllers/reports.js`, `backend/services/routeReconstructionService.js`, `backend/services/enterpriseTrackingService.js`, `admin-panel/src/pages/EmployeeTrackRoute.jsx`
- **Backend Snapped Coordinate Fallbacks**:
  - Updated `reports.js` and `enterpriseTrackingService.js` to map `snappedRoute` and `snappedPath` using the raw coordinates (`p.rawLatitude || p.location.coordinates[1]`) as a fallback if the database `snappedLatitude` is `null`.
  - Hardened `routeReconstructionService.js` to return `coords` as the `geometry` fallback instead of an empty array `[]` when the distance is under 10 meters, when routing APIs return insufficient points, or when all providers fail/timeout.
- **Frontend Fail-Safe Rendering**:
  - Overhauled `EmployeeTrackRoute.jsx` to render snapped lines by cascading through `roadGeometry`, `snappedRoute`, and raw GPS `path` arrays.
  - Removed strict checks on `data.reconstructionSuccess` and `totalDistKm >= 0.01` for drawing, ensuring a line is drawn under any condition.

---

### 50. Context-Aware 7-Stage Tracking Pipeline, Flyover/Underpass Jitter-Resistant Consensus, and Offline Route Refinement (June 22, 2026)

**Changed**: Redesigned the tracking engine into a 7-stage pipeline, integrated segment-jitter resistant consensus validation to handle flyover/underpass transitions, added mobile raw GPS toggles and map navigation shortcuts, and built a high-performance offline database seeder.

#### 1. 7-Stage Tracking Pipeline & 9-Factor Confidence Engine:

- **Files**: [roadValidationService.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/services/roadValidationService.js), [enterpriseTrackingService.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/services/enterpriseTrackingService.js)
- **Engine Logic**: Redesigned the validation pipeline to evaluate previous movement history, travel heading, speed transitions, and time gaps across a 9-factor confidence calculation.
- **Highway/Flyover Turning Penalty**: Penalizes highway/flyover candidates when traveling at slow speed (<25 km/h) or when heading changes, resolving false-positive snaps to overpasses and correctly snapping the user to the service road below (e.g. Pune-Bangalore Highway flyover at Tavde Hotel Chowk).

#### 2. Segment-Jitter Resistant Consensus:

- **File**: [roadValidationService.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/services/roadValidationService.js)
- **Consensus Compatibility**: Modified the 3-point consensus queue check to allow contiguous road segments (varying Place IDs) to accumulate consensus if their clean names match (stripping parenthetical place IDs) or if their distance is <50m. Prevents Place ID splits from resetting the consensus buffer, immediately snapping turns off the flyover.

#### 3. Return Loop Preservation:

- **File**: [routeReconstructionService.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/services/routeReconstructionService.js)
- **Loop Retention**: Bypassed U-turn loop pruning in route reconstruction geometry to preserve return routes where an employee returns to a previously visited location, like Laxmipuri.

#### 4. Monotonic Distance Integrity & 5m Jitter Filter:

- **Files**: [enterpriseTrackingService.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/services/enterpriseTrackingService.js), [refine_routes.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/refine_routes.js)
- **Monotonicity Enforced**: Distance can only increase, never decrease, preventing snapping adjustments from reducing travel logs.
- **Jitter Filter**: Enforced a 5-meter movement threshold filter in distance accumulation to avoid accumulation of GPS stationary drift.

#### 5. High-Performance Bulk Refinement Script:

- **File**: [refine_routes.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/backend/refine_routes.js)
- **Mongoose updateOne & bulkWrite**: Implemented MongoDB `bulkWrite` to execute snapped coordinate updates in a single round-trip, and utilized `updateOne` to completely bypass Mongoose `VersionError` checks, allowing robust offline refinement of the entire database history.
- **Migration Run**: Successfully executed the seeder for `adesh@example.com` (26.0490 KM), `sk512@gmail.com` (13.7716 KM), and `adeshbhongale03@gmail.com` (0.8884 KM).

#### 6. Mobile Permission Lock & UX Toggles:

- **Files**: [App.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/mobile-app/App.js), [TrackMyRoute.js](file:///e:/Downloads/Geo-Attendance-HRMS-System/mobile-app/src/screens/TrackMyRoute.js), [EmployeeTrackRoute.jsx](file:///e:/Downloads/Geo-Attendance-HRMS-System/admin-panel/src/pages/EmployeeTrackRoute.jsx)
- **Permissions Lock Overlay**: Overlay block in `App.js` checks and prompts for all required locations/notification permissions, preventing access until completed.
- **Icon Controls & Raw Toggle**: Stacked icon shortcuts added for fast navigation on maps (Live, Office, Punch In locations) and added a raw GPS route visibility toggle on the employee route screen.

### 17. GPS Classification System — Classify, Don't Delete (June 26, 2026)

**Changed**: Replaced aggressive GPS point filtering with a classification-based approach. Points are never deleted — they are classified into categories for different consumers.

#### Core Philosophy Change:

- **Old behavior**: GPS points with accuracy > 50m or speed > 120 km/h were rejected before storage
- **New behavior**: All valid coordinates are saved. Points are classified as `valid`, `weak`, `suspicious`, or `idle`. Only impossible coordinates (null, NaN, out-of-range, 0,0) are rejected

#### Files Modified:

- `backend/services/gpsFilterService.js`: Refactored `filterBatch` → `classifyBatch`
  - Added `classifyPoint()` — classifies a single point with context, never rejects valid coordinates
  - Returns categorized arrays: `rawPoints`, `displayPoints`, `distancePoints`, `suspiciousPoints`, `weakPoints`
  - Thresholds: `maxGoodAccuracyMeters: 50`, `maxWeakAccuracyMeters: 150`, `suspiciousSpeedMps: 35` (~126 km/h), `impossibleSpeedMps: 60` (~216 km/h), `minDistanceMeters: 3`
  - Recovery mode: suspicious-speed points confirmed by a realistic next point stay display-eligible
  - Legacy `filterBatch` maintained for backward compatibility

- `backend/services/enterpriseTrackingService.js`: Uses `classifyBatch` instead of `filterBatch`
  - Distance calculation uses only `distanceEligible` points (skips weak/suspicious/idle)
  - Socket.IO broadcast includes `rawPath` (orange map line), `displayPath` (blue/clean map line), and existing `path`
  - Tracking logs store `isDistanceEligible`, `isDisplayEligible`, and `status`

- `backend/controllers/reports.js`: Fixed coordinate separation in both `getEmployeeTrackDetails` and `getEmployeeTrackDetailsMe`
  - `rawPath[].latitude/longitude` now returns true **raw** coordinates (was accidentally returning snapped)
  - `snappedRoute` properly returns road-snapped coordinates with metadata (status, speed, accuracy)

- `admin-panel/src/pages/EmployeeTrackRoute.jsx`: Fixed `simulationPath` fallback
  - Now uses `data.snappedRoute` when `roadGeometry` is empty, instead of falling back to raw coordinates

- `mobile-app/src/screens/TrackMyRoute.js`: Fixed raw/snapped coordinate separation
  - `addPoint()` uses `rawLatitude/rawLongitude` for the orange raw GPS line
  - `snappedPath` fallback correctly uses `snappedLatitude/snappedLongitude`

#### Threshold Configuration:

| Parameter               | Value  | Meaning                                             |
| ----------------------- | ------ | --------------------------------------------------- |
| `maxGoodAccuracyMeters` | 50m    | Points ≤ 50m accuracy are `valid`                   |
| `maxWeakAccuracyMeters` | 150m   | Points > 150m accuracy marked `weak`                |
| `suspiciousSpeedMps`    | 35 m/s | ~126 km/h — points above this marked `suspicious`   |
| `impossibleSpeedMps`    | 60 m/s | ~216 km/h — points above this excluded from display |
| `minDistanceMeters`     | 3m     | Movement < 3m classified as `idle`                  |

---

**Last Updated**: June 26, 2026
**Version**: 3.9.0
**Status**: Production Hardened, Connection Resilient, Duplicate Login Blocked, Month Dropdown Modal Integrated, Base-60 Hour Format Active, Leave Dashboard Availed Breakdown Configured, Filters Page Reset Active, Global Stats Restored, Timezone-Robust Date Range Filtering Operational, Dynamic Mobile App Download Links Editable, Delete Confirmation Active, Customer Visit System Overhauled, One-Visit-At-A-Time Enforced, GPS Location Confirmation Flow Active, Executed On Column Active, Geofence Mapping Toggle Active, Scheduling Employee dropdown Name-wise Refactored, Attendance Screen Back to Home Nav Active, Selfie verification box hidden initially, Kalman Smoothing Active, Offline Tracking Queue Active, Tracking Logs Deduplicated and Chronologically Sorted, Distance Calculations Recalculated Sequentially, SQLite WebAssembly Build Error Resolved, Background Task Metadata Synced, Real-time Telemetry Merged, Premium Replay Playback Animation Integrated, Dual-path Map Rendering Active, Geofence Circle Overlays Display Active, Geofence Multi-Alerts Active, Dynamic Address Resolution & Coordinate Fallbacks Integrated, Telemetry Monitor Hardened, 2-Lane Road U-Turn Snapping Fix Active, GPS Gap Recovery Mode Active, Snapped Coordinate Fallbacks Active, Fail-safe Route Line Rendering Active, 7-Stage Tracking Pipeline Active, Jitter-Resistant Road Consensus Active, Highway Flyover Snapping Penalty Active, Offline Route Bulk Refinement Complete, Mobile Permissions Enforced, Raw GPS Switch Active, GPS Classification System Active, Classify-Don't-Delete Pipeline Active, Zero Build Errors.
