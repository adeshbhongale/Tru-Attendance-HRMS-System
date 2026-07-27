const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Customer = require('../models/Customer');

/**
 * Enterprise Customer Seed Data Definition
 */
function getEnterpriseSeedData() {
  return [
    {
      customerCode: 'CUST-10001',
      customerName: 'Amul Food & Dairy Enterprise Pvt Ltd',
      industry: 'Dairy & Food Processing',
      email: 'contact@amuldairy.co.in',
      phone: '+91 22 67890000',
      customerSince: new Date('2021-03-15'),
      remarks: 'Mega dairy processing plant running Milk, Curd, Cheese, Butter and Powdered Milk automated production lines equipped with laser, inkjet, color printers & TTO date coders.',

      contactPerson: 'Rajesh Sharma',
      mobile: '+91 9822011223',
      address: 'Plot 15, Anand Dairy Industrial Zone, Anand, Gujarat 388001',

      registeredOffice: {
        addressLine1: 'Plot 15, Anand Dairy Industrial Zone',
        addressLine2: 'Near Express Highway Toll',
        area: 'Anand Food Processing Zone',
        city: 'Anand',
        district: 'Anand',
        state: 'Gujarat',
        country: 'India',
        pincode: '388001'
      },

      primaryContact: {
        contactPerson: 'Rajesh Sharma',
        designation: 'Vice President - Plant Operations',
        mobileNumber: '+91 9822011223',
        email: 'r.sharma@amuldairy.co.in',
        landline: '+91 22 67890010',
        extension: '101',
        whatsApp: '+91 9822011223'
      },

      departmentContacts: {
        purchase: [
          { name: 'Amit Varma', designation: 'General Manager - Purchase', mobile: '+91 9822044556', email: 'purchase@amuldairy.co.in' },
          { name: 'Suresh Patil', designation: 'Senior Packaging Procurement Lead', mobile: '+91 9822044557', email: 'suresh.p@amuldairy.co.in' }
        ],
        accounts: [
          { name: 'Priya Kulkarni', designation: 'Chief Financial Officer', mobile: '+91 9822077889', email: 'accounts@amuldairy.co.in' },
          { name: 'Nilesh Joshi', designation: 'Sr Taxation Executive', mobile: '+91 9822077890', email: 'nilesh.j@amuldairy.co.in' }
        ],
        production: [
          { name: 'Sunil Deshmukh', designation: 'Production Head - Dairy Division', mobile: '+91 9822088990', email: 'production@amuldairy.co.in' },
          { name: 'Mahesh Pawar', designation: 'Milk & Curd Packaging Line Supervisor', mobile: '+91 9822088991', email: 'mahesh.p@amuldairy.co.in' }
        ],
        maintenance: [
          { name: 'Rohit Patil', designation: 'Chief Automation & Printer Engineer', mobile: '+91 9822099112', email: 'maint@amuldairy.co.in' },
          { name: 'Ganesh More', designation: 'Mechanical & Laser Maintenance Lead', mobile: '+91 9822099113', email: 'ganesh.m@amuldairy.co.in' }
        ]
      },

      financialInfo: {
        panNumber: 'AAACA1234F',
        gstNumber: '24AAACA1234F1Z1',
        dateOfIncorporation: new Date('1998-04-12'),
        msmeNumber: 'UDYAM-GJ-01-0012345',
        msmeStatus: 'Medium'
      },

      // Dynamic Cloudinary Dummy Documents
      documents: [
        {
          docType: 'GST Certificate',
          docName: 'GST_Certificate_Amul_Dairy.pdf',
          fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/gst_sample.pdf',
          issueDate: new Date('2017-07-01'),
          uploadedBy: 'Admin User',
          uploadedOn: new Date('2024-01-10'),
          version: '1.0'
        },
        {
          docType: 'MSME Certificate',
          docName: 'Udyam_MSME_Amul_Dairy.pdf',
          fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/msme_sample.pdf',
          issueDate: new Date('2020-09-10'),
          uploadedBy: 'Admin User',
          uploadedOn: new Date('2024-01-10'),
          version: '1.0'
        },
        {
          docType: 'PAN Card',
          docName: 'PAN_Card_Amul_Dairy.png',
          fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/pan_sample.png',
          issueDate: new Date('1998-04-12'),
          uploadedBy: 'Admin User',
          uploadedOn: new Date('2024-01-10'),
          version: '1.0'
        },
        {
          docType: 'FSSAI License',
          docName: 'FSSAI_Food_Safety_License_2025.pdf',
          fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/fssai_sample.pdf',
          issueDate: new Date('2023-01-01'),
          uploadedBy: 'Admin User',
          uploadedOn: new Date('2024-01-10'),
          version: '2.0'
        }
      ],

      bankDetails: {
        bankName: 'HDFC Bank Ltd',
        accountNumber: '50200012345678',
        ifscCode: 'HDFC0000104',
        branchName: 'Main Commercial Branch, Anand',
        accountType: 'Current'
      },

      // Section 1: Milk, Section 2: Cheese with SubSections Milk & Curd and Laser/Color Printers
      productionSections: [
        {
          sectionName: 'sec-1 : milk',
          description: 'High-speed fresh milk processing, pasteurization & pouch bottling section',
          manager: 'Sunil Deshmukh',
          location: 'Dairy Complex Bay 1 - Ground Floor',
          subSections: [
            {
              subSectionName: 'subsec-1 : milk',
              description: 'Automated fresh milk pouch filling, sealing & date coding line',
              installedProducts: [
                {
                  productId: 'PRINTER-MILK-01',
                  productName: 'High Speed Fiber Laser Printer LM500',
                  modelNumber: 'LM500-MILK-LASER',
                  productCode: 'LM-500-F',
                  machineSerialNo: 'SN-LM500-MILK-001',
                  barcode: 'BAR-LM500-MILK-01',
                  qrCode: 'QR-LM500-MILK-01',
                  brand: 'TruCode Laser',
                  installationDate: new Date('2024-01-12'),
                  warrantyExpiry: new Date('2026-01-12'),
                  amcExpiry: new Date('2027-01-12'),
                  currentStatus: 'Running',
                  engineerAssigned: 'Rohit Patil'
                },
                {
                  productId: 'PRINTER-MILK-02',
                  productName: 'Continuous Inkjet Date & Batch Printer IP800',
                  modelNumber: 'IP800-INKJET-CLR',
                  productCode: 'IP-800',
                  machineSerialNo: 'SN-IP800-MILK-002',
                  barcode: 'BAR-IP800-MILK-02',
                  qrCode: 'QR-IP800-MILK-02',
                  brand: 'TruCode Print',
                  installationDate: new Date('2024-02-15'),
                  warrantyExpiry: new Date('2026-02-15'),
                  amcExpiry: new Date('2027-02-15'),
                  currentStatus: 'Running',
                  engineerAssigned: 'Vijay Lokhande'
                },
                {
                  productId: 'PRINTER-MILK-03',
                  productName: 'Industrial Color Pouch Label Printer CL300',
                  modelNumber: 'CL300-COLOR-PRINT',
                  productCode: 'CL-300',
                  machineSerialNo: 'SN-CL300-MILK-003',
                  barcode: 'BAR-CL300-MILK-03',
                  qrCode: 'QR-CL300-MILK-03',
                  brand: 'TruCode Color',
                  installationDate: new Date('2024-03-01'),
                  warrantyExpiry: new Date('2026-03-01'),
                  amcExpiry: new Date('2027-03-01'),
                  currentStatus: 'Running',
                  engineerAssigned: 'Kiran Shinde'
                },
                {
                  productId: 'SCANNER-MILK-04',
                  productName: 'Inline Barcode & QR Code Verification Scanner',
                  modelNumber: 'VS200-BARCODE',
                  productCode: 'VS-200',
                  machineSerialNo: 'SN-VS200-MILK-004',
                  barcode: 'BAR-VS200-MILK-04',
                  qrCode: 'QR-VS200-MILK-04',
                  brand: 'TruCode Vision',
                  installationDate: new Date('2024-03-20'),
                  warrantyExpiry: new Date('2025-03-20'),
                  currentStatus: 'Running',
                  engineerAssigned: 'Rohit Patil'
                }
              ]
            },
            {
              subSectionName: 'subsec-2 : curd',
              description: 'Fresh curd, yogurt tub packaging & thermal transfer coding line',
              installedProducts: [
                {
                  productId: 'PRINTER-CURD-01',
                  productName: 'Thermal Transfer Overprinter (TTO) Date Coder',
                  modelNumber: 'TTO-500-CURD',
                  productCode: 'TTO-500',
                  machineSerialNo: 'SN-TTO500-CURD-001',
                  barcode: 'BAR-TTO500-CURD-01',
                  qrCode: 'QR-TTO500-CURD-01',
                  brand: 'TruCode Thermal',
                  installationDate: new Date('2023-11-05'),
                  warrantyExpiry: new Date('2025-11-05'),
                  amcExpiry: new Date('2026-11-05'),
                  currentStatus: 'Running',
                  engineerAssigned: 'Ganesh More'
                },
                {
                  productId: 'PRINTER-CURD-02',
                  productName: 'UV Laser Coding Printer for Foil Lid',
                  modelNumber: 'UV-300-CURD-LASER',
                  productCode: 'UV-300',
                  machineSerialNo: 'SN-UV300-CURD-002',
                  barcode: 'BAR-UV300-CURD-02',
                  qrCode: 'QR-UV300-CURD-02',
                  brand: 'TruCode Laser',
                  installationDate: new Date('2024-01-20'),
                  warrantyExpiry: new Date('2026-01-20'),
                  currentStatus: 'Running',
                  engineerAssigned: 'Rohit Patil'
                },
                {
                  productId: 'MACHINE-CURD-03',
                  productName: 'Automatic High-Speed Pouch Sealing Machine',
                  modelNumber: 'PS-900-SEAL',
                  productCode: 'PS-900',
                  machineSerialNo: 'SN-PS900-CURD-003',
                  barcode: 'BAR-PS900-CURD-03',
                  qrCode: 'QR-PS900-CURD-03',
                  brand: 'TruCode Pack',
                  installationDate: new Date('2023-08-10'),
                  warrantyExpiry: new Date('2025-08-10'),
                  currentStatus: 'Running',
                  engineerAssigned: 'Ganesh More'
                }
              ]
            }
          ]
        },
        {
          sectionName: 'sec-2 : cheese',
          description: 'Cheese processing, block wrapping, labeling & butter packaging section',
          manager: 'Mahesh Pawar',
          location: 'Dairy Complex Bay 3 - First Floor',
          subSections: [
            {
              subSectionName: 'Cheese Block Wrapping & Labeling Line',
              description: 'Vacuum packaging and color graphic label printing cell',
              installedProducts: [
                {
                  productId: 'PRINTER-CHEESE-01',
                  productName: 'High-Res Industrial Color Graphic Label Printer',
                  modelNumber: 'CL900-CHEESE-COLOR',
                  productCode: 'CL-900',
                  machineSerialNo: 'SN-CL900-CHS-001',
                  barcode: 'BAR-CL900-CHS-01',
                  qrCode: 'QR-CL900-CHS-01',
                  brand: 'TruCode Color',
                  installationDate: new Date('2024-02-10'),
                  warrantyExpiry: new Date('2026-02-10'),
                  amcExpiry: new Date('2027-02-10'),
                  currentStatus: 'Running',
                  engineerAssigned: 'Vijay Lokhande'
                },
                {
                  productId: 'PRINTER-CHEESE-02',
                  productName: 'CO2 Laser Carton & Foil Coder',
                  modelNumber: 'CO2-LASER-CHEESE',
                  productCode: 'CO2-100',
                  machineSerialNo: 'SN-CO2L-CHS-002',
                  barcode: 'BAR-CO2L-CHS-02',
                  qrCode: 'QR-CO2L-CHS-02',
                  brand: 'TruCode Laser',
                  installationDate: new Date('2024-03-05'),
                  warrantyExpiry: new Date('2026-03-05'),
                  currentStatus: 'Running',
                  engineerAssigned: 'Rohit Patil'
                },
                {
                  productId: 'CAMERA-CHEESE-03',
                  productName: 'HD Vision Inspection Camera System',
                  modelNumber: 'VIS-CHEESE-HD',
                  productCode: 'VIS-HD',
                  machineSerialNo: 'SN-VIS-CHS-003',
                  barcode: 'BAR-VIS-CHS-03',
                  qrCode: 'QR-VIS-CHS-03',
                  brand: 'TruCode Vision',
                  installationDate: new Date('2024-01-15'),
                  warrantyExpiry: new Date('2025-01-15'),
                  currentStatus: 'Running',
                  engineerAssigned: 'Kiran Shinde'
                }
              ]
            },
            {
              subSectionName: 'Butter Tub Packaging & Date Coding Line',
              description: 'Butter tub filling and outer case inkjet jetting cell',
              installedProducts: [
                {
                  productId: 'PRINTER-BUTTER-01',
                  productName: 'Micro-Character Continuous Inkjet Date Printer',
                  modelNumber: 'CIJ-MINI-BUTTER',
                  productCode: 'CIJ-MINI',
                  machineSerialNo: 'SN-CIJ-BTR-001',
                  barcode: 'BAR-CIJ-BTR-01',
                  qrCode: 'QR-CIJ-BTR-01',
                  brand: 'TruCode Print',
                  installationDate: new Date('2023-12-01'),
                  warrantyExpiry: new Date('2025-12-01'),
                  currentStatus: 'Running',
                  engineerAssigned: 'Ganesh More'
                },
                {
                  productId: 'PRINTER-BUTTER-02',
                  productName: 'Automated Box Taper & Barcode Label Applicator',
                  modelNumber: 'AP-500-LABEL',
                  productCode: 'AP-500',
                  machineSerialNo: 'SN-AP500-BTR-002',
                  barcode: 'BAR-AP500-BTR-02',
                  qrCode: 'QR-AP500-BTR-02',
                  brand: 'TruCode Pack',
                  installationDate: new Date('2024-02-18'),
                  warrantyExpiry: new Date('2026-02-18'),
                  currentStatus: 'Running',
                  engineerAssigned: 'Vijay Lokhande'
                }
              ]
            }
          ]
        }
      ]
    },
    {
      customerCode: 'CUST-10002',
      customerName: 'Tata Motors Heavy Equipment Plant',
      industry: 'Automobile & Transport Engineering',
      email: 'procurement@tatamotors.com',
      phone: '+91 20 66112200',
      customerSince: new Date('2021-06-10'),
      remarks: 'Major commercial vehicle chassis assembly line equipped with VIN pin marking, fiber lasers & thermal transfer printers.',

      contactPerson: 'Vikram Joshi',
      mobile: '+91 9960123456',
      address: 'Pimpri Industrial Zone, Near Telco Circle, Pune, Maharashtra 411018',

      registeredOffice: {
        addressLine1: 'Pimpri Industrial Zone',
        addressLine2: 'Near Telco Main Gate',
        area: 'Pimpri Telco Complex',
        city: 'Pune',
        district: 'Pune',
        state: 'Maharashtra',
        country: 'India',
        pincode: '411018'
      },

      primaryContact: {
        contactPerson: 'Vikram Joshi',
        designation: 'Head - Tooling & Automation',
        mobileNumber: '+91 9960123456',
        email: 'v.joshi@tatamotors.com',
        landline: '+91 20 66112210',
        whatsApp: '+91 9960123456'
      },

      departmentContacts: {
        purchase: [{ name: 'Anand Shinde', designation: 'Sr Purchase Manager', mobile: '+91 9960999888', email: 'anand@tatamotors.com' }],
        accounts: [{ name: 'Deepak Merchant', designation: 'Account Manager', mobile: '+91 9960999777', email: 'deepak@tatamotors.com' }],
        production: [{ name: 'Sanjay Thorat', designation: 'Body Shop Incharge', mobile: '+91 9960999666', email: 'sanjay.t@tatamotors.com' }],
        maintenance: [{ name: 'Amit Kulkarni', designation: 'Robotic Cell Engineer', mobile: '+91 9960999555', email: 'amit.k@tatamotors.com' }]
      },

      financialInfo: {
        panNumber: 'AAACT0000A',
        gstNumber: '27AAACT0000A1Z2',
        dateOfIncorporation: new Date('1945-09-01'),
        msmeNumber: 'N/A',
        msmeStatus: 'None'
      },

      documents: [
        {
          docType: 'GST Certificate',
          docName: 'GST_Tata_Motors_Pimpri.pdf',
          fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/gst_sample.pdf',
          issueDate: new Date('2017-07-01'),
          uploadedBy: 'Admin User',
          uploadedOn: new Date('2024-01-10'),
          version: '1.0'
        },
        {
          docType: 'PAN Card',
          docName: 'PAN_Tata_Motors.png',
          fileUrl: 'https://res.cloudinary.com/dw00havv6/image/upload/v1700000000/hrms/customer_documents/pan_sample.png',
          issueDate: new Date('1945-09-01'),
          uploadedBy: 'Admin User',
          uploadedOn: new Date('2024-01-10'),
          version: '1.0'
        }
      ],

      bankDetails: {
        bankName: 'State Bank of India',
        accountNumber: '100200300400',
        ifscCode: 'SBIN0000300',
        branchName: 'Main Commercial Branch, Mumbai',
        accountType: 'Current'
      },

      productionSections: [
        {
          sectionName: 'Body & Chassis Shop',
          description: 'Automated Robotic Welding & VIN Pin Marking Cell',
          manager: 'Sanjay Thorat',
          location: 'Block C Telco',
          subSections: [
            {
              subSectionName: 'VIN Pin Marking Line',
              description: 'Chassis VIN deep pin stamping',
              installedProducts: [
                {
                  productId: 'PROD-104',
                  productName: 'Heavy Duty VIN Pin Marker PM300',
                  modelNumber: 'PM300-VIN',
                  productCode: 'PM-300',
                  machineSerialNo: 'PM300-88001',
                  barcode: 'PM30088001',
                  qrCode: 'QR-PM300-88001',
                  brand: 'TruCode Marking',
                  installationDate: new Date('2023-05-15'),
                  warrantyExpiry: new Date('2025-05-15'),
                  amcExpiry: new Date('2026-05-15'),
                  currentStatus: 'Running',
                  engineerAssigned: 'Amit Kulkarni'
                },
                {
                  productId: 'PRINTER-TATA-01',
                  productName: 'Industrial Laser Part Marking Station',
                  modelNumber: 'FL-100W-LASER',
                  productCode: 'FL-100W',
                  machineSerialNo: 'SN-FL100W-TATA-001',
                  barcode: 'BAR-FL100W-TATA-01',
                  qrCode: 'QR-FL100W-TATA-01',
                  brand: 'TruCode Laser',
                  installationDate: new Date('2024-01-10'),
                  warrantyExpiry: new Date('2026-01-10'),
                  currentStatus: 'Running',
                  engineerAssigned: 'Amit Kulkarni'
                }
              ]
            }
          ]
        }
      ]
    }
  ];
}

/**
 * Execution Runner for Standalone Script
 */
async function runSeedScript() {
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) {
    console.error('❌ MONGO_URI not defined in environment!');
    return;
  }

  console.log('Connecting to MongoDB Atlas...');
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB Atlas successfully!');

    const seedData = getEnterpriseSeedData();
    console.log(`Seeding ${seedData.length} enterprise customer records into MongoDB Atlas...`);

    for (const custData of seedData) {
      const customer = await Customer.findOneAndUpdate(
        { customerCode: custData.customerCode },
        custData,
        { upsert: true, new: true, runValidators: true }
      );

      console.log(`==================================================`);
      console.log(`✅ Enterprise Customer Created / Updated Successfully!`);
      console.log(`Customer Code: ${customer.customerCode}`);
      console.log(`Company Name : ${customer.customerName}`);
      console.log(`GST Number   : ${customer.financialInfo?.gstNumber || '—'}`);
      console.log(`Dept Contacts: ${Object.keys(customer.departmentContacts || {}).length} departments mapped`);
      console.log(`Sections     : ${customer.productionSections?.length || 0} section(s)`);
      console.log(`Documents    : ${customer.documents?.length || 0} document(s) attached`);
      console.log(`==================================================`);
    }

    // Search Query Verification
    const searchResult = await Customer.find({
      'productionSections.subSections.installedProducts.machineSerialNo': 'SN-LM500-MILK-001'
    });
    console.log(`\n🔍 Search Query Test: Found ${searchResult.length} customer(s) by printer machine serial number "SN-LM500-MILK-001"!`);

  } catch (error) {
    console.error('❌ Error seeding enterprise customers:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB Atlas.');
  }
}

// Export seed data provider for controller import
module.exports = {
  getEnterpriseSeedData,
  runSeedScript
};

// Execute if run directly via CLI (node scripts/test_customer_enterprise.js)
if (require.main === module) {
  runSeedScript();
}
