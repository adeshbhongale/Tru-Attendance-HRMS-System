const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const RolePermission = require('../models/RolePermission');

const DEFAULT_PERMISSIONS = [
  // Dashboard
  { permissionKey: 'dashboard:view', category: 'Dashboard', description: 'View standard user dashboard', usedIn: 'Web Admin Panel /dashboard & Mobile App Main Screen', usagePurpose: 'Enables standard employees to view personal attendance stats, punch status, and personal notification cards.', allowedRoles: ['super_admin', 'company_admin', 'admin', 'dept:management_admin', 'dept:store_admin', 'dept:hr_admin', 'dept:ops_admin', 'dept:it_admin', 'dept:finance_admin', 'dept:sales_admin', 'team_lead', 'employee'] },
  { permissionKey: 'dashboard:view_all', category: 'Dashboard', description: 'View enterprise-wide dashboard metrics', usedIn: 'Executive Analytics /dashboard & Organization Overview', usagePurpose: 'Gives Company Admin full enterprise overview of total headcount, live company attendance rates, and material dispatch summaries.', allowedRoles: ['super_admin', 'company_admin', 'dept:management_admin'] },
  { permissionKey: 'dashboard:view_department', category: 'Dashboard', description: 'View department dashboard metrics', usedIn: 'Department Dashboard /dashboard', usagePurpose: 'Enables Level 1 Dept Heads & Managers to monitor department attendance rates, absent counts, and active team dispatches.', allowedRoles: ['admin', 'dept:management_admin', 'dept:store_admin', 'dept:hr_admin', 'dept:ops_admin', 'dept:it_admin', 'dept:finance_admin', 'dept:sales_admin'] },
  { permissionKey: 'dashboard:view_team', category: 'Dashboard', description: 'View team dashboard metrics', usedIn: 'Team Lead Workspace & Mobile App Manager Feed', usagePurpose: 'Allows Level 2 Team Leads to view real-time status of direct report team members and active field tasks.', allowedRoles: ['team_lead'] },

  // Attendance & Leaves
  { permissionKey: 'attendance:punch', category: 'Attendance', description: 'Punch attendance in/out', usedIn: 'Mobile App Geo-Punch Screen & POST /api/attendance/punch', usagePurpose: 'Allows employees and staff to record daily clock-in/out with GPS location geofencing and selfie photo verification.', allowedRoles: ['super_admin', 'company_admin', 'admin', 'dept:management_admin', 'dept:store_admin', 'dept:hr_admin', 'dept:ops_admin', 'dept:it_admin', 'dept:finance_admin', 'dept:sales_admin', 'team_lead', 'employee'] },
  { permissionKey: 'attendance:view_own', category: 'Attendance', description: 'View own attendance history', usedIn: 'Mobile App History & Web Employee Portal /attendance/my', usagePurpose: 'Permits individual users to view their personal work hours, punch timestamps, late arrivals, and monthly timesheets.', allowedRoles: ['super_admin', 'company_admin', 'admin', 'dept:management_admin', 'dept:store_admin', 'dept:hr_admin', 'dept:ops_admin', 'dept:it_admin', 'dept:finance_admin', 'dept:sales_admin', 'team_lead', 'employee'] },
  { permissionKey: 'attendance:view_department', category: 'Attendance', description: 'View department attendance records', usedIn: 'Attendance Register Page /attendance', usagePurpose: 'Allows HR Dept Head & Managers to inspect daily punch logs and shift registers for employees.', allowedRoles: ['super_admin', 'company_admin', 'dept:hr_admin'] },
  { permissionKey: 'attendance:view_all', category: 'Attendance', description: 'View enterprise-wide attendance records', usedIn: 'Central Attendance Audit /attendance/all', usagePurpose: 'Grants Company Admin organization-wide visibility across all company branches, departments, and shift locations.', allowedRoles: ['super_admin', 'company_admin', 'dept:hr_admin'] },
  { permissionKey: 'attendance:approve', category: 'Attendance', description: 'Approve or reject attendance regularization & leaves', usedIn: 'Attendance & Leave Regularization Queue /attendance/approvals', usagePurpose: 'Enables HR Dept Head to approve or reject leave requests, late punch regularization, overtime claims, and manual attendance adjustments.', allowedRoles: ['super_admin', 'company_admin', 'dept:hr_admin'] },

  // Transactions & Material Movement
  { permissionKey: 'transaction:create', category: 'Transactions & Material Movement', description: 'Create material dispatch or transfer transactions', usedIn: 'Material Movement Module /material-movement & POST /api/materials/transactions', usagePurpose: 'Allows storekeepers, site engineers, and employees to initiate outward material dispatches, site transfers, and inventory movements.', allowedRoles: ['super_admin', 'company_admin', 'dept:store_admin', 'dept:ops_admin', 'dept:management_admin', 'department_admin', 'admin', 'team_lead', 'employee'] },
  { permissionKey: 'transaction:view_own', category: 'Transactions & Material Movement', description: 'View own created transactions', usedIn: 'Material Movement My Transactions /material-movement?tab=my', usagePurpose: 'Permits users to track the real-time status and delivery progress of material dispatch orders they personally created.', allowedRoles: ['super_admin', 'company_admin', 'admin', 'dept:store_admin', 'dept:ops_admin', 'dept:management_admin', 'department_admin', 'team_lead', 'employee'] },
  { permissionKey: 'transaction:view_department', category: 'Transactions & Material Movement', description: 'View department material transactions', usedIn: 'Department Material Log /material-movement?tab=dept', usagePurpose: 'Enables Store & Ops Department Heads to monitor all material inflows and outflows originating from or sent to their department.', allowedRoles: ['super_admin', 'company_admin', 'dept:store_admin', 'dept:ops_admin', 'dept:management_admin', 'department_admin'] },
  { permissionKey: 'transaction:view_all', category: 'Transactions & Material Movement', description: 'View all enterprise material transactions', usedIn: 'Material Movement Central Hub /material-movement', usagePurpose: 'Gives Company Admin and Store Admin complete oversight over all inventory movements, godown dispatches, and inter-site material transfers across the company.', allowedRoles: ['super_admin', 'company_admin', 'dept:store_admin', 'dept:management_admin', 'department_admin'] },
  { permissionKey: 'transaction:edit', category: 'Transactions & Material Movement', description: 'Modify active transactions', usedIn: 'Transaction Editor Drawer & PUT /api/materials/transactions/:id', usagePurpose: 'Allows Store Managers to update item quantities, driver details, vehicle numbers, or destination addresses before dispatch finalization.', allowedRoles: ['super_admin', 'company_admin', 'dept:store_admin', 'dept:management_admin', 'department_admin'] },
  { permissionKey: 'transaction:cancel', category: 'Transactions & Material Movement', description: 'Cancel pending material transactions', usedIn: 'Transaction Actions /api/materials/transactions/:id/cancel', usagePurpose: 'Enables Store Managers to void or abort incorrect or redundant material dispatch orders before store acceptance.', allowedRoles: ['super_admin', 'company_admin', 'dept:store_admin', 'dept:management_admin', 'department_admin'] },

  // Approvals & Store Operations
  { permissionKey: 'approval:view', category: 'Approvals & Store Operations', description: 'View pending transaction approvals', usedIn: 'Approvals Queue /material-movement/approvals', usagePurpose: 'Displays a dedicated inbox of material dispatches and high-value stock transfers awaiting store sign-off.', allowedRoles: ['super_admin', 'company_admin', 'dept:store_admin', 'dept:management_admin', 'department_admin'] },
  { permissionKey: 'approval:approve', category: 'Approvals & Store Operations', description: 'Approve material requests or transfers', usedIn: 'Approval Workflow POST /api/materials/approvals/:id/approve', usagePurpose: 'Grants Store Admin authority to sign off on material releases and authorize inventory dispatch execution.', allowedRoles: ['super_admin', 'company_admin', 'dept:store_admin', 'dept:management_admin', 'department_admin'] },
  { permissionKey: 'approval:reject', category: 'Approvals & Store Operations', description: 'Reject material requests or transfers', usedIn: 'Approval Workflow POST /api/materials/approvals/:id/reject', usagePurpose: 'Allows Store Admin to deny unauthorized or budget-exceeding material requests with mandatory rejection remarks.', allowedRoles: ['super_admin', 'company_admin', 'dept:store_admin', 'dept:management_admin', 'department_admin'] },
  { permissionKey: 'approval:bulk', category: 'Approvals & Store Operations', description: 'Perform bulk approvals or rejections', usedIn: 'Store Operations Batch Bar POST /api/materials/approvals/bulk', usagePurpose: 'Enables Store Admin to approve or reject multiple material movement orders simultaneously.', allowedRoles: ['super_admin', 'company_admin', 'dept:store_admin', 'dept:management_admin', 'department_admin'] },

  { permissionKey: 'store:accept', category: 'Approvals & Store Operations', description: 'Store keeper accept material dispatches', usedIn: 'Store Receiving Portal POST /api/materials/store/accept', usagePurpose: 'Allows storekeepers to physically inspect, count, and sign off on incoming material shipments into the godown/store.', allowedRoles: ['super_admin', 'company_admin', 'dept:store_admin'] },
  { permissionKey: 'store:assign_handler', category: 'Approvals & Store Operations', description: 'Assign store handler to dispatches', usedIn: 'Store Allocation POST /api/materials/store/assign-handler', usagePurpose: 'Enables Level 1 Store Managers to assign loading/unloading handlers and store personnel to incoming dispatch orders.', allowedRoles: ['super_admin', 'company_admin', 'dept:store_admin'] },
  { permissionKey: 'store:inventory', category: 'Approvals & Store Operations', description: 'View & adjust store inventory stock', usedIn: 'Store Inventory Ledger /materials/inventory', usagePurpose: 'Allows store admins to audit current stock levels, perform stock reconciliation, and adjust physical vs system counts.', allowedRoles: ['super_admin', 'company_admin', 'dept:store_admin'] },
  { permissionKey: 'store:receive_return', category: 'Approvals & Store Operations', description: 'Receive & accept material returns into store', usedIn: 'Store Return Counter POST /api/materials/returns/receive', usagePurpose: 'Grants storekeepers authority to check returned materials for damage/usability and restock them into active store inventory.', allowedRoles: ['super_admin', 'company_admin', 'dept:store_admin'] },

  // Materials & Barcodes
  { permissionKey: 'material:view', category: 'Materials & Barcodes', description: 'View material master list', usedIn: 'Material Catalog /materials/catalog', usagePurpose: 'Enables users to browse the organization\'s standardized catalog of items, SKUs, unit measures, and material categories.', allowedRoles: ['super_admin', 'company_admin', 'dept:store_admin', 'dept:ops_admin', 'admin', 'team_lead', 'employee'] },
  { permissionKey: 'barcode:view', category: 'Materials & Barcodes', description: 'View barcode master & stock locations', usedIn: 'Barcode Management /materials/barcodes', usagePurpose: 'Allows users to view unique barcode serial numbers, QR code assets, and current physical storage rack/bin locations.', allowedRoles: ['super_admin', 'company_admin', 'dept:store_admin', 'dept:ops_admin', 'admin', 'team_lead', 'employee'] },
  { permissionKey: 'barcode:scan', category: 'Materials & Barcodes', description: 'Scan barcodes using scanner or mobile app', usedIn: 'Mobile Barcode Scanner & Handheld Reader POST /api/materials/scan', usagePurpose: 'Enables storekeepers and field staff to scan item barcodes for instant dispatch verification, stock audits, and receiving.', allowedRoles: ['super_admin', 'company_admin', 'dept:store_admin', 'dept:ops_admin', 'admin', 'team_lead', 'employee'] },

  // Transfers & Returns
  { permissionKey: 'transfer:create', category: 'Transfers & Returns', description: 'Create internal barcode or godown transfers', usedIn: 'Inter-Godown Transfer Form /materials/transfers/new', usagePurpose: 'Allows users to initiate transfer requests of barcoded items between different godowns, sites, or departments.', allowedRoles: ['super_admin', 'company_admin', 'dept:store_admin', 'dept:ops_admin', 'admin', 'team_lead', 'employee'] },
  { permissionKey: 'transfer:approve', category: 'Transfers & Returns', description: 'Approve barcode transfers', usedIn: 'Transfer Approval POST /api/materials/transfers/:id/approve', usagePurpose: 'Gives Store Manager authority to validate and authorize relocation of barcoded inventory across facilities.', allowedRoles: ['super_admin', 'company_admin', 'dept:store_admin'] },
  { permissionKey: 'transfer:view', category: 'Transfers & Returns', description: 'View active transfers', usedIn: 'Material Transfer Tracker /materials/transfers', usagePurpose: 'Displays live status of in-transit material transfers, origin/destination godowns, and estimated arrival times.', allowedRoles: ['super_admin', 'company_admin', 'dept:store_admin', 'dept:ops_admin', 'admin', 'team_lead', 'employee'] },

  { permissionKey: 'return:create', category: 'Transfers & Returns', description: 'Initiate material return to store', usedIn: 'Site Return Form /materials/returns/new', usagePurpose: 'Enables site staff to initiate return requests for unused, excess, or defective materials back to central store.', allowedRoles: ['super_admin', 'company_admin', 'dept:store_admin', 'dept:ops_admin', 'admin', 'team_lead', 'employee'] },
  { permissionKey: 'return:accept', category: 'Transfers & Returns', description: 'Accept material returns into store', usedIn: 'Store Return Verification POST /api/materials/returns/:id/accept', usagePurpose: 'Allows store managers to inspect returned goods, categorize item condition, and credit inventory back to stock.', allowedRoles: ['super_admin', 'company_admin', 'dept:store_admin'] },
  { permissionKey: 'return:view', category: 'Transfers & Returns', description: 'View material return history', usedIn: 'Return History Register /materials/returns', usagePurpose: 'Provides access to historic records of material returns, return reasons, and approval audit logs.', allowedRoles: ['super_admin', 'company_admin', 'dept:store_admin', 'dept:ops_admin', 'admin', 'team_lead', 'employee'] },

  { permissionKey: 'receiving:receive', category: 'Transfers & Returns', description: 'Receive dispatched materials at target location', usedIn: 'Goods Received Note (GRN) Verification /materials/receiving', usagePurpose: 'Enables destination site supervisors to confirm physical receipt of dispatched materials and acknowledge quantity received.', allowedRoles: ['super_admin', 'company_admin', 'dept:store_admin', 'dept:ops_admin', 'admin', 'team_lead', 'employee'] },

  // Chat & Documents
  { permissionKey: 'chat:send', category: 'Chat & Documents', description: 'Send messages in transaction chat rooms', usedIn: 'Material Movement Chat Drawer POST /api/materials/chat/send', usagePurpose: 'Allows dispatchers, drivers, storekeepers, and managers to communicate in real-time regarding specific dispatch orders.', allowedRoles: ['super_admin', 'company_admin', 'dept:store_admin', 'dept:ops_admin', 'admin', 'team_lead', 'employee'] },
  { permissionKey: 'chat:view', category: 'Chat & Documents', description: 'View transaction chat history', usedIn: 'Material Movement Chat Drawer GET /api/materials/chat/history', usagePurpose: 'Gives authorized participants access to view discussion logs, notes, and audit messages attached to material transactions.', allowedRoles: ['super_admin', 'company_admin', 'dept:store_admin', 'dept:ops_admin', 'admin', 'team_lead', 'employee'] },
  { permissionKey: 'document:upload', category: 'Chat & Documents', description: 'Upload attachments to transactions', usedIn: 'Dispatch Attachment Uploader POST /api/materials/documents/upload', usagePurpose: 'Enables users to attach delivery challans, invoices, photos of loaded goods, or weighbridge slips to transactions.', allowedRoles: ['super_admin', 'company_admin', 'dept:store_admin', 'dept:ops_admin', 'admin', 'team_lead', 'employee'] },
  { permissionKey: 'document:view', category: 'Chat & Documents', description: 'View transaction attachments', usedIn: 'Document Viewer Modal GET /api/materials/documents/view', usagePurpose: 'Allows users to view and download attached documents, challan PDFs, and photo evidence for material movements.', allowedRoles: ['super_admin', 'company_admin', 'dept:store_admin', 'dept:ops_admin', 'admin', 'team_lead', 'employee'] },

  // Reports & Audit
  { permissionKey: 'report:view', category: 'Reports & Audit', description: 'View operational reports', usedIn: 'Reports Hub /reports', usagePurpose: 'Grants access to standard operational reports like daily attendance summary, material dispatch counts, and department totals.', allowedRoles: ['super_admin', 'company_admin', 'dept:finance_admin', 'dept:hr_admin', 'dept:store_admin', 'admin', 'team_lead', 'employee'] },
  { permissionKey: 'report:export', category: 'Reports & Audit', description: 'Export reports to Excel or PDF', usedIn: 'Reports Export POST /reports/export', usagePurpose: 'Enables Accounts Admin and HR Admin to download generated reports in CSV, XLSX Excel spreadsheet, or PDF document formats.', allowedRoles: ['super_admin', 'company_admin', 'dept:finance_admin', 'dept:hr_admin'] },
  { permissionKey: 'report:view_all', category: 'Reports & Audit', description: 'View executive enterprise financial & stock reports', usedIn: 'Executive Analytics /reports/executive', usagePurpose: 'Gives Accounts Admin and Company Admin access to company-wide financial metrics, cross-department cost centers, and executive dashboards.', allowedRoles: ['super_admin', 'company_admin', 'dept:finance_admin'] },

  { permissionKey: 'audit:view', category: 'Reports & Audit', description: 'View audit & financial change logs', usedIn: 'Activity Audit Trail /audit-logs', usagePurpose: 'Enables Accounts Admin and Company Admin to inspect change histories, billing edits, and transaction audit logs.', allowedRoles: ['super_admin', 'company_admin', 'dept:finance_admin'] },
  { permissionKey: 'audit:view_all', category: 'Reports & Audit', description: 'View all system compliance & audit logs', usedIn: 'System Compliance Audit /audit-logs/system', usagePurpose: 'Gives Accounts Admin and Company Admin full access to system-wide security logs, financial adjustments, and data changes.', allowedRoles: ['super_admin', 'company_admin', 'dept:finance_admin'] },

  // User & Master Management
  { permissionKey: 'user:view', category: 'User & Master Management', description: 'View employee directory', usedIn: 'Employee Directory /employees', usagePurpose: 'Allows users to search and view employee profile details, designations, contact details, and department listings.', allowedRoles: ['super_admin', 'company_admin', 'dept:hr_admin', 'admin', 'team_lead', 'employee'] },
  { permissionKey: 'user:create', category: 'User & Master Management', description: 'Create new employee users', usedIn: 'Employee Onboarding /employees/new & POST /api/employees', usagePurpose: 'Grants HR Admin authority to create new employee profiles, assign system credentials, and set initial role levels.', allowedRoles: ['super_admin', 'company_admin', 'dept:hr_admin'] },
  { permissionKey: 'user:edit', category: 'User & Master Management', description: 'Edit employee user details', usedIn: 'Employee Profile Editor /employees/:id/edit', usagePurpose: 'Enables HR Admin to update employee personal info, designation, contact numbers, and shift assignments.', allowedRoles: ['super_admin', 'company_admin', 'dept:hr_admin'] },
  { permissionKey: 'user:delete', category: 'User & Master Management', description: 'Delete employee users', usedIn: 'Employee Directory Actions DELETE /api/employees/:id', usagePurpose: 'Restricts permanent user deletion or deactivation capabilities exclusively to HR Admin and top-level administration.', allowedRoles: ['super_admin', 'company_admin', 'dept:hr_admin'] },
  { permissionKey: 'user:manage_department', category: 'User & Master Management', description: 'Assign employees to departments', usedIn: 'Department Mapping /departments/assign', usagePurpose: 'Enables HR Admin to reassign employees across departments, project sites, or reporting managers.', allowedRoles: ['super_admin', 'company_admin', 'dept:hr_admin'] },

  { permissionKey: 'master:view', category: 'User & Master Management', description: 'View system masters (Departments, Designations, Shifts)', usedIn: 'Master Setup Pages /departments, /designations, /shifts', usagePurpose: 'Allows users to view organization configuration lists including shifts, department structures, and designation titles.', allowedRoles: ['super_admin', 'company_admin', 'dept:hr_admin', 'dept:finance_admin', 'admin', 'team_lead', 'employee'] },
  { permissionKey: 'master:create', category: 'User & Master Management', description: 'Create system master records', usedIn: 'Master Setup Modals POST /api/departments, POST /api/shifts', usagePurpose: 'Enables HR Admin to configure new departments, designation hierarchies, shift timings, and holiday master records.', allowedRoles: ['super_admin', 'company_admin', 'dept:hr_admin'] },
  { permissionKey: 'master:edit', category: 'User & Master Management', description: 'Edit system master records', usedIn: 'Master Setup Modals PUT /api/departments/:id, PUT /api/shifts/:id', usagePurpose: 'Enables HR Admin to modify department names, shift rules, overtime policies, and designation grade mappings.', allowedRoles: ['super_admin', 'company_admin', 'dept:hr_admin'] },
  { permissionKey: 'master:delete', category: 'User & Master Management', description: 'Delete system master records', usedIn: 'Master Setup Actions DELETE /api/departments/:id', usagePurpose: 'Restricts removal of core organization structures, shifts, or department codes to HR Admin and top-level administration.', allowedRoles: ['super_admin', 'company_admin', 'dept:hr_admin'] },

  // Settings
  { permissionKey: 'settings:view', category: 'Settings', description: 'View company settings', usedIn: 'System Settings /settings', usagePurpose: 'Grants access to view global company settings, geofencing parameters, attendance policies, and working hours.', allowedRoles: ['super_admin', 'company_admin', 'admin'] },
  { permissionKey: 'settings:edit', category: 'Settings', description: 'Modify company settings', usedIn: 'System Settings POST /settings/save', usagePurpose: 'Grants authority to alter enterprise-wide system rules, geofence radius, default attendance rules, and organization profile.', allowedRoles: ['super_admin', 'company_admin', 'admin'] },

  { permissionKey: 'notification:view', category: 'Notifications', description: 'View user notifications', usedIn: 'Header Notification Bell & Mobile Alerts /notifications', usagePurpose: 'Enables all system users to receive real-time push notifications, attendance alerts, dispatch updates, and system notices.', allowedRoles: ['super_admin', 'company_admin', 'dept:store_admin', 'dept:hr_admin', 'dept:ops_admin', 'dept:it_admin', 'dept:finance_admin', 'admin', 'team_lead', 'employee'] },
];

async function seedAllPermissions() {
  console.log('Seeding system permissions into MongoDB...');
  const bulkOps = DEFAULT_PERMISSIONS.map(p => ({
    updateOne: {
      filter: { permissionKey: p.permissionKey },
      update: { $set: p },
      upsert: true,
    }
  }));

  await RolePermission.bulkWrite(bulkOps);
  console.log(`Successfully seeded ${DEFAULT_PERMISSIONS.length} permissions into MongoDB!`);
}

if (require.main === module) {
  (async () => {
    try {
      if (process.env.MONGO_URI) {
        await mongoose.connect(process.env.MONGO_URI);
        await seedAllPermissions();
        await mongoose.disconnect();
      }
    } catch (err) {
      console.error('Error seeding permissions:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = {
  DEFAULT_PERMISSIONS,
  seedAllPermissions,
};
