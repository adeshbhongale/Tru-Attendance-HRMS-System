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
11. [Setup & Deployment](#setup--deployment)

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
  halfDayLimit: Number (in hours, default: 4),
  lateRules: String (description of late arrival rules),
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
6. Backend validates OTP
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

---

## Setup & Deployment

### Local Development Setup

#### Backend Setup

```bash
cd backend
npm install

# Create .env file with:
# MONGO_URI=mongodb://localhost:27017/geo-attendance
# JWT_SECRET=your_jwt_secret_key
# REFRESH_TOKEN_SECRET=your_refresh_token_secret
# PORT=5000

# Seed database
npm run seed

# Start server
npm start
```

#### Admin Panel Setup

```bash
cd admin-panel
npm install
npm run dev
# Access at http://localhost:5173
```

#### Mobile App Setup

```bash
cd mobile-app
npm install

# For iOS
npm run ios

# For Android
npm run android

# For Web
npm run web
```

### Building for Production

#### Backend

```bash
# Using PM2 for process management
npm install -g pm2
pm2 start server.js --name "geo-attendance-api"
pm2 startup
pm2 save
```

#### Admin Panel

```bash
npm run build
# Deploy dist/ folder to Vercel, Netlify, or AWS S3+CloudFront
```

#### Mobile App (Expo)

```bash
eas build --platform ios
eas build --platform android
eas submit --platform ios --latest
eas submit --platform android --latest
```

### Deployment Platforms

#### Backend Deployment Options:

- **AWS EC2**: Full control, auto-scaling available
- **Heroku**: Simple Git-based deployment
- **DigitalOcean**: Droplets with app platform
- **Railway**: Modern deployment platform
- **Render**: Free tier available

#### Admin Panel Deployment Options:

- **Vercel**: Optimized for React, instant deployments
- **Netlify**: Git-based deployment with CI/CD
- **AWS S3 + CloudFront**: Highly scalable
- **GitHub Pages**: Free hosting (static sites only)

#### Database Hosting:

- **MongoDB Atlas**: Cloud MongoDB with auto-scaling
- **AWS DocumentDB**: Managed MongoDB-compatible database
- **Azure Cosmos DB**: Globally distributed database

---

## Key Statistics

### System Capacity

- **Max Concurrent Users**: 10,000+ (with proper infrastructure)
- **API Response Time**: < 200ms (with caching)
- **Uptime Target**: 99.9%
- **Data Retention**: Configurable (default: unlimited)

### Seed Data Statistics

- **Total Users**: 10 (1 admin, 9 employees)
- **Total Shifts**: 3 (General, Morning, Night)
- **Total Attendance Records**: 20 (2 per employee)
- **Total Leave Records**: 27 (3 per employee on average)
- **Coverage**: All leave types and attendance statuses

---

## Security Features

- JWT-based authentication with refresh tokens
- Password hashing with bcryptjs
- OTP verification for admin login
- Role-based access control (RBAC)
- CORS enabled with proper headers
- Input validation and sanitization
- SQL injection prevention via Mongoose
- XSS protection via React escaping
- HTTPS ready for deployment

---

## Performance Optimizations

- Database indexing on frequently queried fields
- Real-time caching with Redis (optional)
- Pagination for large datasets
- Image optimization and CDN support
- Code splitting in React applications
- Mobile app offline support with AsyncStorage
- API response compression

---

## Support & Maintenance

- Regular security patches
- Database backups (automated)
- Monitoring and alerting setup
- User documentation and guides
- Admin training materials
- 24/7 system monitoring

---

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

#### Mobile App — Production Console.log Cleanup

All debug `console.log` and `console.error` statements removed from 10 files for production build:
`App.js`, `axios.js`, `ErrorBoundary.js`, `AttendanceScreen.js`, `DashboardScreen.js`, `LeaveScreen.js`, `LoginScreen.js`, `MonthlyViewScreen.js`, `ProfileScreen.js`, `navigation.js`

### 10. HRMS Reporting Analytics Stabilization & Professional Export (May 11, 2026)

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

### 11. Tracking Precision, Teleportation Guard & Admin Visibility (May 11, 2026)

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

**Last Updated**: May 11, 2026
**Version**: 1.4.0
**Status**: Production Stable (High-Precision Tracking & Distance Audit Finalized)
