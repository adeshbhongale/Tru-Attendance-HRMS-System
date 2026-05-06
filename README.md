# Geo-Attendance HRMS System

A comprehensive HRMS solution with real-time GPS tracking, geo-fencing, and shift management.

## Features
- **Real-time Attendance**: GPS-based punch-in/out with selfie validation.
- **Geo-Fencing**: Automatic validation of employee location within office radius.
- **Live Tracking**: Socket.io integration for real-time location markers on admin dashboard.
- **Employee Management**: CRUD operations with bulk Excel upload support.
- **Leave Management**: Simplified workflow for leave applications and approvals.
- **Analytics**: Beautiful charts for attendance, leaves, and department statistics.

## Project Structure
- `backend/`: Node.js, Express, Mongoose, Socket.io
- `admin-panel/`: React, Vite, Recharts, Framer Motion
- `mobile-app/`: React Native, Expo, Google Maps

## Setup Instructions

### Backend
1. `cd backend`
2. `npm install`
3. Create `.env` from `.env.example`
4. `node scripts/seedData.js` (Seed initial data)
5. `npm run dev`

### Admin Panel
1. `cd admin-panel`
2. `npm install`
3. `npm run dev`

### Mobile App
1. `cd mobile-app`
2. `npm install`
3. `npx expo start`

## Admin Credentials
Admin credentials can be configured in the `backend/.env` file using `ADMIN_EMAIL` and `ADMIN_PASSWORD` keys.