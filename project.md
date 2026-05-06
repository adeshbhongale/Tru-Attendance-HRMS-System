# Project Documentation: Geo-Attendance HRMS System

## Architecture Overview
The system follows a modern client-server architecture:
- **Client (Admin)**: A React-based web dashboard for HR administrators.
- **Client (Mobile)**: A React Native app for employees to log attendance and track locations.
- **Server**: A Node.js/Express API with Socket.io for real-time updates.
- **Database**: MongoDB for persistent data storage.

## Database Design (Mongoose Models)

### User / Employee
- `name`, `email`, `mobile`, `password`, `role` (Admin/Employee), `department`, `shift`, `status`, `profileImage`.

### Attendance
- `user` (Ref), `date`, `punchIn` (time, location, selfie), `punchOut` (time, location), `status`, `workingHours`, `isLate`, `isHalfDay`, `isOutside`.

### Shift
- `name`, `startTime`, `endTime`, `gracePeriod`, `halfDayLimit`.

### Location (Geo-Fence)
- `name`, `latitude`, `longitude`, `radius`, `address`.

## Geo-Fencing Logic
The system uses the **Haversine formula** to calculate the distance between the employee's current GPS coordinates and the predefined office coordinates.
If the distance > radius, the attendance is marked as "Outside Location".

## Authentication Flow
1. User logs in via Email/Mobile.
2. Server validates and issues a JWT and a Refresh Token.
3. Client stores tokens securely and includes the JWT in the `Authorization` header for subsequent requests.
4. If JWT expires, the Refresh Token is used to obtain a new JWT.

## Deployment Guide
- **Backend**: Can be deployed on AWS EC2, Heroku, or DigitalOcean using PM2.
- **Admin Panel**: Can be deployed on Vercel, Netlify, or AWS S3+CloudFront.
- **Mobile App**: Can be built using Expo EAS and distributed via App Store / Play Store.
