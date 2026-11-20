# Gatimaan (`com.adesh.trackflow`) — Privacy Policy & Google Play Data Safety Reference

> **Purpose:** Publish the updated sections below at `https://www.gatimaan.io/privacy-policy` and use the Data Safety Matrix when completing **Google Play Console → App Content → Data Safety**.

---

## 1. Required Additions to `https://www.gatimaan.io/privacy-policy`

### A. Foreground & Background Location Data (Prominent Disclosure Alignment)
- **Foreground Location (`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`):** Collected when you punch in, punch out, log a customer visit, or capture geo-tagged material receipt evidence to verify compliance with your assigned workplace geofence.
- **Background Location (`ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE_LOCATION`):** When live field route tracking is enabled for your role and you are actively punched in on duty, Gatimaan collects precise GPS location coordinates in the background—**even when the app is closed or not in use**—accompanied by a persistent foreground notification. Background tracking stops automatically when you punch out.

### B. Camera, Photos & Supporting Documents
- **Camera (`CAMERA`):** Used to capture live attendance verification selfies, customer visit photos, barcode scans, and geo-tagged material evidence. During attendance punch-in and punch-out, real-time eye-blink and smile liveness checks run ephemerally on-device in memory prior to selfie capture; no live video frames or facial biometric templates are stored or transmitted.
- **Photos & Files (Android System Photo Picker & Document Picker):** Used when you voluntarily attach profile pictures, expense claim receipts, petty cash proof, or material receiving documents (PDF, Word, Excel, JPEG/PNG). Gatimaan does not require broad access to your device's media library.

### C. Employee Profile, Emergency Contacts & Device Telemetry
- **Employee Profile & Emergency Reference Contacts:** Name, employee ID, phone number, email address, residential address, date of birth (`dob`), and optional emergency reference contact names and phone numbers (`referenceName1`, `referenceNumber1`, `referenceName2`, `referenceNumber2`) are collected for enterprise HR administration and workplace safety.
- **Device & Diagnostic Telemetry (`Application.getAndroidId()`, `expo-battery`):** Hardware device identifier (`androidId`), operating system version, battery status, network state, and GPS accuracy/mock-location status (`mocked`) are collected during login and active duty sessions to bind sessions, ensure route tracking reliability, and prevent attendance spoofing.
- **Push Notifications (`POST_NOTIFICATIONS`):** Used to display the active duty tracking status notification and deliver attendance, leave, expense, and dispatch alerts via Firebase Cloud Messaging (FCM) / Expo Push Services.
- **Service Providers (Processors):** Uploaded attendance selfies, expense receipts, and material verification documents are stored securely via Cloudinary on behalf of your employer organization. Maps/routing services (Google Maps, Nominatim, OSRM), workforce analytics (Google Gemini AI), push delivery (Firebase Cloud Messaging, Expo Push Services), and employer-configured Tally Prime instances act strictly as contracted service providers/tenant integrations; no personal data is sold or shared with third-party advertisers or data brokers.

### D. Enterprise B2B Account Model (No In-App Account Creation)
- Employee accounts are provisioned, administered, and managed exclusively by the respective Employer Organization (Company Administrator / HR Department). Gatimaan does not support consumer self-registration or in-app account creation.

---

## 2. Google Play Console — Data Safety Section Matrix

| Data Category | Data Type | Collected? | Shared with 3rd Parties? | Ephemeral? | Required or Optional? | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Location** | Approximate location | Yes | No | No | Required | App functionality, Fraud prevention & security |
| **Location** | Precise location (incl. Background) | Yes | No | No | Required | App functionality, Fraud prevention & security |
| **Personal info** | Name, Email address, User IDs, Address, Phone number | Yes | No | No | Required | App functionality, Account management |
| **Personal info** | Other info (Date of Birth, Emergency Reference Contact names & numbers) | Yes | No | No | Optional | App functionality, Account management |
| **Financial info** | Other financial info (Expense claims & petty cash entries) | Yes | No | No | Optional | App functionality |
| **Photos and videos** | Photos (Selfies, receipts, material evidence) | Yes | No | No | Required (Selfie) / Optional (Receipts) | App functionality, Fraud prevention |
| **Files and docs** | Files and docs (PDF/Word/Excel attachments) | Yes | No | No | Optional | App functionality |
| **App info and performance** | Diagnostics (Battery level, GPS health & mock-location telemetry) | Yes | No | No | Required | App functionality, Fraud prevention |
| **Device or other IDs** | Device or other IDs (`androidId` hardware identifier, Push token) | Yes | No | No | Required | App functionality, Fraud prevention, Developer communications |

