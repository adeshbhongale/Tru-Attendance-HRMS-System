const Barcode = require('../models/Barcode');
const Transfer = require('../models/Transfer');
const Return = require('../models/Return');

exports.exportBarcodeToExcel = async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const { barcode } = req.params;
    const normalizedBarcode = barcode ? barcode.trim().toUpperCase() : '';
    const bc = await Barcode.findOne({ barcode: normalizedBarcode })
      .populate('owner', 'fullName employeeId department designation')
      .populate('ownerDepartment', 'name')
      .populate({
        path: 'transaction',
        populate: [
          { path: 'requester', select: 'fullName employeeId' },
          { path: 'teamLead', select: 'fullName employeeId' },
          { path: 'managementApprover', select: 'fullName employeeId' }
        ]
      });

    if (!bc) {
      return res.status(404).json({ message: 'Barcode not found.' });
    }

    // Find barcode price from transaction materials
    const material = bc.transaction?.materials?.find(m =>
      m.barcodes?.some(b => (b.barcode || b) === normalizedBarcode)
    );
    const price = material?.price || 0;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Inventory Management System';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet(`Barcode_${bc.barcode}`);
    worksheet.columns = [
      { header: 'Field', key: 'field', width: 25 },
      { header: 'Value', key: 'value', width: 55 }
    ];

    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    worksheet.addRow({ field: 'Barcode Serial ID', value: bc.barcode });
    worksheet.addRow({ field: 'Material Name', value: bc.materialName });
    worksheet.addRow({ field: 'Status', value: bc.status.toUpperCase() });
    worksheet.addRow({ field: 'Price (Valuation)', value: `₹${price.toLocaleString('en-IN')}` });
    worksheet.addRow({ field: 'Transaction ID', value: bc.transactionId });
    worksheet.addRow({ field: 'Initial Challan Date', value: new Date(bc.createdAt).toLocaleDateString('en-IN') });
    
    // Parties details
    worksheet.addRow({ field: '--- Parties Details ---', value: '' });
    worksheet.addRow({ field: 'Requester / Sender', value: bc.transaction?.requester ? `${bc.transaction.requester.fullName} (${bc.transaction.requester.employeeId})` : 'N/A' });
    worksheet.addRow({ field: 'Team Lead', value: bc.transaction?.teamLead ? `${bc.transaction.teamLead.fullName} (${bc.transaction.teamLead.employeeId})` : 'N/A' });
    worksheet.addRow({ field: 'Management Approver', value: bc.transaction?.managementApprover ? `${bc.transaction.managementApprover.fullName} (${bc.transaction.managementApprover.employeeId})` : 'N/A' });
    worksheet.addRow({ field: 'Current Owner', value: bc.owner ? `${bc.owner.fullName} (${bc.owner.employeeId})` : 'N/A' });
    worksheet.addRow({ field: 'Current Department', value: bc.ownerDepartment?.name || 'N/A' });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.eachCell((cell) => {
          cell.border = { top: { style: 'thin', color: { argb: 'FFD1D5DB' } }, bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } }, left: { style: 'thin', color: { argb: 'FFD1D5DB' } }, right: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
          cell.alignment = { vertical: 'middle' };
        });
      }
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Barcode_${bc.barcode}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export barcode to excel error:', error);
    res.status(500).json({ message: 'Failed to export barcode to Excel.', error: error.message });
  }
};

exports.exportBarcodeToPDF = async (req, res) => {
  try {
    const PDFDocument = require('pdfkit');
    const { barcode } = req.params;
    const normalizedBarcode = barcode ? barcode.trim().toUpperCase() : '';
    const bc = await Barcode.findOne({ barcode: normalizedBarcode })
      .populate('owner', 'fullName employeeId department designation')
      .populate('ownerDepartment', 'name')
      .populate({
        path: 'transaction',
        populate: [
          { path: 'requester', select: 'fullName employeeId' },
          { path: 'teamLead', select: 'fullName employeeId' },
          { path: 'managementApprover', select: 'fullName employeeId' }
        ]
      });

    if (!bc) {
      return res.status(404).json({ message: 'Barcode not found.' });
    }

    // Find barcode price from transaction materials
    const material = bc.transaction?.materials?.find(m =>
      m.barcodes?.some(b => (b.barcode || b) === normalizedBarcode)
    );
    const price = material?.price || 0;

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Barcode_${bc.barcode}.pdf`);

    doc.pipe(res);

    // Title
    doc
      .fontSize(20)
      .text('Barcode Details Report', { align: 'center' })
      .moveDown();

    // General Details
    doc.fontSize(14).text('Barcode General Details', { underline: true });
    doc.fontSize(11).moveDown(0.5);
    doc.text(`Barcode Serial ID: ${bc.barcode}`);
    doc.text(`Material Name: ${bc.materialName}`);
    doc.text(`Status: ${bc.status.toUpperCase()}`);
    doc.text(`Price (Valuation): ₹${price.toLocaleString('en-IN')}`);
    doc.text(`Transaction ID: ${bc.transactionId}`);
    doc.text(`Initial Challan Date: ${new Date(bc.createdAt).toLocaleDateString('en-IN')}`);
    doc.moveDown();

    // Parties Details
    doc.fontSize(14).text('Parties Details', { underline: true });
    doc.fontSize(11).moveDown(0.5);
    doc.text(`Requester / Sender: ${bc.transaction?.requester ? `${bc.transaction.requester.fullName} (Emp ID: ${bc.transaction.requester.employeeId})` : 'N/A'}`);
    doc.text(`Team Lead: ${bc.transaction?.teamLead ? `${bc.transaction.teamLead.fullName} (Emp ID: ${bc.transaction.teamLead.employeeId})` : 'N/A'}`);
    doc.text(`Management Approver: ${bc.transaction?.managementApprover ? `${bc.transaction.managementApprover.fullName} (Emp ID: ${bc.transaction.managementApprover.employeeId})` : 'N/A'}`);
    doc.text(`Current Owner: ${bc.owner ? `${bc.owner.fullName} (Emp ID: ${bc.owner.employeeId})` : 'N/A'}`);
    doc.text(`Current Department: ${bc.ownerDepartment?.name || 'N/A'}`);
    doc.moveDown();

    doc.end();
  } catch (error) {
    console.error('Export barcode to pdf error:', error);
    res.status(500).json({ message: 'Failed to export barcode to PDF.', error: error.message });
  }
};
