const InternalReceipt = require('../models/InternalReceipt');
const ExternalReceipt = require('../models/ExternalReceipt');
const Transaction = require('../models/Transaction');
const Notification = require('../../../models/Notification');
const ActivityLog = require('../models/ActivityLog');
const { createAuditLog } = require('../../../middleware/audit.middleware');
const { emitToUser } = require('../../../config/socket');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

// GET /api/receiving/internal
const getInternalReceipts = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const query = { companyId: req.tenant.companyId };

    if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
      query.receiver = req.user._id;
    }

    const receipts = await InternalReceipt.find(query)
      .populate({
        path: 'transaction',
        populate: [
          { path: 'sender', select: 'fullName employeeId', populate: { path: 'department', select: 'name' } },
          { path: 'receiver', select: 'fullName employeeId' },
        ],
      })
      .populate('receiver', 'fullName employeeId')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await InternalReceipt.countDocuments(query);

    res.json({
      data: receipts,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// POST /api/receiving/internal
const createInternalReceipt = async (req, res) => {
  try {
    const {
      transactionId,
      receiverPhoto,
      receiverDocumentPhotos,
      receiverMaterialPhotos,
      materialCondition,
      remarks,
      receiverGeo
    } = req.body;

    const transaction = await Transaction.findOne({ _id: transactionId, companyId: req.tenant.companyId });
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found.' });
    }

    if (transaction.status !== 'accepted') {
      return res.status(400).json({ message: 'Only accepted transactions can be received.' });
    }

    if (transaction.receiver.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the assigned receiver can create this receipt.' });
    }

    const receipt = await InternalReceipt.create({ companyId: req.tenant.companyId,
      transaction: transaction._id,
      receiver: req.user._id,
      receiverPhoto,
      receiverDocumentPhotos: receiverDocumentPhotos || [],
      receiverMaterialPhotos: receiverMaterialPhotos || [],
      materialCondition,
      remarks,
      receiverGeo,
    });

    // Update transaction status to completed
    const oldData = transaction.toObject();
    transaction.status = 'completed';
    transaction.versions.push({
      data: oldData,
      modifiedBy: req.user._id,
      action: 'receive',
    });
    await transaction.save();

    // Notify sender
    const notification = await Notification.create({ companyId: req.tenant.companyId,
      recipient: transaction.sender,
      type: 'completed',
      title: 'Material Received',
      message: `${req.user.fullName} has received materials for transaction ${transaction.transactionId}`,
      relatedTransaction: transaction._id,
    });

    emitToUser(transaction.sender.toString(), 'notification:new', notification);

    await ActivityLog.create({ companyId: req.tenant.companyId,
      user: req.user._id,
      action: 'Internal receipt created',
      details: `Receipt for transaction ${transaction.transactionId}`,
      entityType: 'InternalReceipt',
      entityId: receipt._id.toString(),
    });

    await createAuditLog({
      user: req.user._id,
      action: 'receive',
      entity: 'InternalReceipt',
      entityId: receipt._id.toString(),
      newData: receipt.toObject(),
      req,
    });

    res.status(201).json({ data: receipt, message: 'Internal receipt created. Transaction completed.' });
  } catch (error) {
    console.error('Create internal receipt error:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// GET /api/receiving/external
const getExternalReceipts = async (req, res) => {
  try {
    const { page = 1, limit = 20, type, search } = req.query;
    const query = { companyId: req.tenant.companyId };

    if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
      query.receiver = req.user._id;
    }

    if (type) query.type = type;
    if (search) {
      query.$or = [
        { receiptId: { $regex: search, $options: 'i' } },
        { vendorName: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { prNumber: { $regex: search, $options: 'i' } },
        { poNumber: { $regex: search, $options: 'i' } },
      ];
    }

    const receipts = await ExternalReceipt.find(query)
      .populate('orderedBy', 'fullName employeeId')
      .populate('receiver', 'fullName employeeId')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await ExternalReceipt.countDocuments(query);

    res.json({
      data: receipts,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// POST /api/receiving/external
const createExternalReceipt = async (req, res) => {
  try {
    const {
      type, vendorName, vendorAddress, prNumber, poNumber,
      customerName, customerAddress, documentNumber, documentDescription,
      orderedBy, materials, photos, remarks, receiverGeo,
    } = req.body;

    const processedMaterials = (materials || []).map((m) => ({
      ...m,
      quantity: Number(m.quantity || m.qty || 0),
      qty: Number(m.quantity || m.qty || 0),
      total: Number(m.price || 0) * Number(m.quantity || m.qty || 0),
    }));

    for (let i = 0; i < processedMaterials.length; i++) {
      if (!processedMaterials[i].barcode || !processedMaterials[i].barcode.trim()) {
        return res.status(400).json({ message: `Material ${i + 1} barcode is required.` });
      }
    }

    const grandTotal = processedMaterials.reduce((sum, m) => sum + m.total, 0);

    const receipt = new ExternalReceipt({
      companyId: req.tenant.companyId,
      type,
      vendorName, vendorAddress, prNumber, poNumber,
      customerName, customerAddress, documentNumber, documentDescription,
      orderedBy,
      receiver: req.user._id,
      materials: processedMaterials,
      photos: photos || [],
      remarks,
      receiverGeo,
      grandTotal,
    });

    await receipt.save();

    await ActivityLog.create({ companyId: req.tenant.companyId,
      user: req.user._id,
      action: 'External receipt created',
      details: `${type === 'vendor' ? 'Vendor' : 'Customer'} receipt ${receipt.receiptId}`,
      entityType: 'ExternalReceipt',
      entityId: receipt.receiptId,
    });

    await createAuditLog({
      user: req.user._id,
      action: 'create',
      entity: 'ExternalReceipt',
      entityId: receipt.receiptId,
      newData: receipt.toObject(),
      req,
    });

    res.status(201).json({ data: receipt, message: 'External receipt created successfully.' });
  } catch (error) {
    console.error('Create external receipt error:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// GET /api/receiving/:id
const getReceipt = async (req, res) => {
  try {
    let receipt = await InternalReceipt.findOne({ _id: req.params.id, companyId: req.tenant.companyId })
      .populate({
        path: 'transaction',
        populate: [
          { path: 'sender', populate: [{ path: 'department', select: 'name' }, { path: 'designation', select: 'name' }] },
          { path: 'receiver', populate: [{ path: 'department', select: 'name' }] },
        ],
      })
      .populate('receiver', 'fullName employeeId');

    if (!receipt) {
      receipt = await ExternalReceipt.findOne({ _id: req.params.id, companyId: req.tenant.companyId })
        .populate('orderedBy', 'fullName employeeId')
        .populate('receiver', 'fullName employeeId');
    }

    if (!receipt) {
      return res.status(404).json({ message: 'Receipt not found.' });
    }

    res.json({ data: receipt });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// GET /api/receiving/:id/export/excel
const exportReceiptToExcel = async (req, res) => {
  try {
    let receipt = await InternalReceipt.findOne({ _id: req.params.id, companyId: req.tenant.companyId })
      .populate({
        path: 'transaction',
        populate: [
          { path: 'sender', select: 'fullName employeeId', populate: { path: 'department', select: 'name' } },
          { path: 'receiver', select: 'fullName employeeId' },
        ],
      })
      .populate('receiver', 'fullName employeeId');

    let isInternal = true;
    if (!receipt) {
      isInternal = false;
      receipt = await ExternalReceipt.findOne({ _id: req.params.id, companyId: req.tenant.companyId })
        .populate('orderedBy', 'fullName employeeId')
        .populate('receiver', 'fullName employeeId');
    }

    if (!receipt) {
      return res.status(404).json({ message: 'Receipt not found.' });
    }

    // Check permission
    if (!['super_admin', 'admin', 'department_admin'].includes(req.user.role)) {
      const receiverId = receipt.receiver?._id || receipt.receiver;
      if (receiverId && receiverId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'You do not have permission to export this receipt.' });
      }
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Inventory Management System';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet(`Receipt_${isInternal ? receipt.transaction?.transactionId : receipt.receiptId}`, {
      headerFooter: { firstHeader: `Receipt - ${isInternal ? receipt.transaction?.transactionId : receipt.receiptId}` },
    });

    // Style header
    worksheet.columns = [
      { header: 'Field', key: 'field', width: 20 },
      { header: 'Value', key: 'value', width: 50 },
    ];

    // Header row styling
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });

    if (isInternal) {
      // Internal receipt details
      worksheet.addRow({ field: 'Receipt ID', value: receipt._id });
      worksheet.addRow({ field: 'Date', value: new Date(receipt.createdAt).toLocaleDateString('en-IN') });
      worksheet.addRow({ field: 'Time', value: new Date(receipt.createdAt).toLocaleTimeString('en-IN') });
      worksheet.addRow({ field: 'Transaction ID', value: receipt.transaction?.transactionId });
      worksheet.addRow({ field: 'Material Condition', value: receipt.materialCondition });
      worksheet.addRow({ field: 'Remarks', value: receipt.remarks || '-' });

      // Sender details
      worksheet.addRow({ field: '--- Sender Details ---', value: '' });
      worksheet.addRow({ field: 'Name', value: receipt.transaction?.sender?.fullName || '-' });
      worksheet.addRow({ field: 'Employee ID', value: receipt.transaction?.sender?.employeeId || '-' });
      worksheet.addRow({ field: 'Department', value: receipt.transaction?.sender?.department?.name || '-' });

      // Receiver details
      worksheet.addRow({ field: '--- Receiver Details ---', value: '' });
      worksheet.addRow({ field: 'Name', value: receipt.receiver?.fullName || '-' });
      worksheet.addRow({ field: 'Employee ID', value: receipt.receiver?.employeeId || '-' });

      // Materials
      worksheet.addRow({ field: '--- Materials ---', value: '' });
      receipt.transaction?.materials.forEach((mat, index) => {
        const matTotal = (mat.price * mat.quantity) || 0;
        worksheet.addRow({
          field: `Material ${index + 1}`,
          value: `${mat.name} - ${mat.quantity} ${mat.unit} - ₹${matTotal}`
        });
        worksheet.addRow({ field: '  Description', value: mat.description || '-' });
        worksheet.addRow({ field: '  Barcode', value: mat.barcode || '-' });
        const materialPhotos = (mat.photos || []).map(p => p.url).join('; ');
        if (materialPhotos) {
          worksheet.addRow({ field: '  Photos', value: materialPhotos });
        }
      });

      // Photos
      worksheet.addRow({ field: '--- Photos ---', value: '' });
      if (receipt.receiverPhoto?.url) {
        worksheet.addRow({ field: 'Receiver Photo', value: receipt.receiverPhoto.url });
      }
      if (receipt.receiverDocumentPhotos && receipt.receiverDocumentPhotos.length > 0) {
        const docPhotos = receipt.receiverDocumentPhotos.map(p => p.url).join('; ');
        worksheet.addRow({ field: 'Receiver Document Photos', value: docPhotos });
      }
      if (receipt.receiverMaterialPhotos && receipt.receiverMaterialPhotos.length > 0) {
        receipt.receiverMaterialPhotos.forEach((matPhoto, index) => {
          const material = receipt.transaction?.materials[matPhoto.materialIndex];
          const photos = matPhoto.photos.map(p => p.url).join('; ');
          worksheet.addRow({
            field: `Receiver Material Photos - ${material?.name || `Material ${matPhoto.materialIndex + 1}`}`,
            value: photos
          });
        });
      }
    } else {
      // External receipt details
      worksheet.addRow({ field: 'Receipt ID', value: receipt.receiptId });
      worksheet.addRow({ field: 'Date', value: new Date(receipt.createdAt).toLocaleDateString('en-IN') });
      worksheet.addRow({ field: 'Time', value: new Date(receipt.createdAt).toLocaleTimeString('en-IN') });
      worksheet.addRow({ field: 'Type', value: receipt.type });

      if (receipt.type === 'vendor') {
        worksheet.addRow({ field: 'Vendor Name', value: receipt.vendorName || '-' });
        worksheet.addRow({ field: 'Vendor Address', value: receipt.vendorAddress || '-' });
        worksheet.addRow({ field: 'PR Number', value: receipt.prNumber || '-' });
        worksheet.addRow({ field: 'PO Number', value: receipt.poNumber || '-' });
      } else {
        worksheet.addRow({ field: 'Customer Name', value: receipt.customerName || '-' });
        worksheet.addRow({ field: 'Customer Address', value: receipt.customerAddress || '-' });
        worksheet.addRow({ field: 'Document Number', value: receipt.documentNumber || '-' });
        worksheet.addRow({ field: 'Document Description', value: receipt.documentDescription || '-' });
      }

      worksheet.addRow({ field: 'Remarks', value: receipt.remarks || '-' });

      // Receiver details
      worksheet.addRow({ field: '--- Receiver Details ---', value: '' });
      worksheet.addRow({ field: 'Name', value: receipt.receiver?.fullName || '-' });
      worksheet.addRow({ field: 'Employee ID', value: receipt.receiver?.employeeId || '-' });

      // Materials
      worksheet.addRow({ field: '--- Materials ---', value: '' });
      receipt.materials.forEach((mat, index) => {
        const matTotal = (mat.price * mat.quantity) || mat.total || 0;
        worksheet.addRow({
          field: `Material ${index + 1}`,
          value: `${mat.name} - ${mat.quantity} ${mat.unit} - ₹${matTotal}`
        });
        worksheet.addRow({ field: '  Description', value: mat.description || '-' });
        worksheet.addRow({ field: '  Barcode', value: mat.barcode || '-' });
        const materialPhotos = (mat.photos || []).map(p => p.url).join('; ');
        if (materialPhotos) {
          worksheet.addRow({ field: '  Photos', value: materialPhotos });
        }
      });

      // Photos
      worksheet.addRow({ field: '--- Photos ---', value: '' });
      const receiptPhotos = (receipt.photos || []).map(p => p.url).join('; ');
      if (receiptPhotos) {
        worksheet.addRow({ field: 'Receipt Photos', value: receiptPhotos });
      }
    }

    // Grand total
    if (!isInternal || receipt.transaction) {
      worksheet.addRow({ field: 'Grand Total', value: `₹${(isInternal ? receipt.transaction?.grandTotal : receipt.grandTotal || 0).toLocaleString()}` });
    }

    // Style data rows
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.eachCell((cell) => {
          cell.border = { top: { style: 'thin', color: { argb: 'FFD1D5DB' } }, bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } }, left: { style: 'thin', color: { argb: 'FFD1D5DB' } }, right: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
          cell.alignment = { vertical: 'middle' };
        });
      }
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Receipt_${isInternal ? receipt.transaction?.transactionId : receipt.receiptId}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export receipt to excel error:', error);
    res.status(500).json({ message: 'Failed to export receipt.', error: error.message });
  }
};

// GET /api/receiving/:id/export/pdf
const exportReceiptToPDF = async (req, res) => {
  try {
    let receipt = await InternalReceipt.findOne({ _id: req.params.id, companyId: req.tenant.companyId })
      .populate({
        path: 'transaction',
        populate: [
          { path: 'sender', select: 'fullName employeeId', populate: { path: 'department', select: 'name' } },
          { path: 'receiver', select: 'fullName employeeId' },
        ],
      })
      .populate('receiver', 'fullName employeeId');

    let isInternal = true;
    if (!receipt) {
      isInternal = false;
      receipt = await ExternalReceipt.findOne({ _id: req.params.id, companyId: req.tenant.companyId })
        .populate('orderedBy', 'fullName employeeId')
        .populate('receiver', 'fullName employeeId');
    }

    if (!receipt) {
      return res.status(404).json({ message: 'Receipt not found.' });
    }

    // Check permission
    if (!['super_admin', 'admin'].includes(req.user.role)) {
      if (receipt.receiver._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'You do not have permission to export this receipt.' });
      }
    }

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Receipt_${isInternal ? receipt.transaction?.transactionId : receipt.receiptId}_${new Date().toISOString().slice(0, 10)}.pdf`);

    doc.pipe(res);

    // Header
    doc
      .fontSize(20)
      .text(isInternal ? 'Internal Material Receipt' : 'External Material Receipt', { align: 'center' })
      .moveDown();

    // Date and Time
    doc.fontSize(12).text(`Date: ${new Date(receipt.createdAt).toLocaleDateString('en-IN')}`, { align: 'left' });
    doc.text(`Time: ${new Date(receipt.createdAt).toLocaleTimeString('en-IN')}`, { align: 'left' });
    doc.moveDown();

    if (isInternal) {
      // Internal receipt details
      doc.fontSize(14).text('Receipt Details', { underline: true });
      doc.fontSize(12).moveDown();
      doc.text(`Receipt ID: ${receipt._id}`);
      doc.text(`Transaction ID: ${receipt.transaction?.transactionId}`);
      doc.text(`Material Condition: ${receipt.materialCondition}`);
      doc.text(`Remarks: ${receipt.remarks || '-'}`);
      doc.moveDown();

      // Sender details
      doc.fontSize(14).text('Sender Details', { underline: true });
      doc.fontSize(12).moveDown();
      doc.text(`Name: ${receipt.transaction?.sender?.fullName || '-'}`);
      doc.text(`Employee ID: ${receipt.transaction?.sender?.employeeId || '-'}`);
      doc.text(`Department: ${receipt.transaction?.sender?.department?.name || '-'}`);
      doc.moveDown();

      // Receiver details
      doc.fontSize(14).text('Receiver Details', { underline: true });
      doc.fontSize(12).moveDown();
      doc.text(`Name: ${receipt.receiver?.fullName || '-'}`);
      doc.text(`Employee ID: ${receipt.receiver?.employeeId || '-'}`);
      doc.moveDown();

      // Materials
      doc.fontSize(14).text('Materials', { underline: true });
      doc.fontSize(12).moveDown();
      if (receipt.transaction?.materials.length > 0) {
        receipt.transaction.materials.forEach((mat, index) => {
          doc.text(`Material ${index + 1}:`, { continued: true });
          const matTotal = (mat.price * mat.quantity) || 0;
          doc.text(` ${mat.name} - ${mat.quantity} ${mat.unit} - ₹${matTotal}`);
          if (mat.description) doc.text(`Description: ${mat.description}`);
          if (mat.barcode) doc.text(`Barcode: ${mat.barcode}`);
          doc.moveDown();
        });
        doc.moveDown();
        doc.fontSize(14).text(`Grand Total: ₹${receipt.transaction?.grandTotal?.toLocaleString() || 0}`, { align: 'right' });
      } else {
        doc.text('No materials listed.');
      }
    } else {
      // External receipt details
      doc.fontSize(14).text('Receipt Details', { underline: true });
      doc.fontSize(12).moveDown();
      doc.text(`Receipt ID: ${receipt.receiptId}`);
      doc.text(`Type: ${receipt.type}`);

      if (receipt.type === 'vendor') {
        doc.text(`Vendor Name: ${receipt.vendorName || '-'}`);
        doc.text(`Vendor Address: ${receipt.vendorAddress || '-'}`);
        doc.text(`PR Number: ${receipt.prNumber || '-'}`);
        doc.text(`PO Number: ${receipt.poNumber || '-'}`);
      } else {
        doc.text(`Customer Name: ${receipt.customerName || '-'}`);
        doc.text(`Customer Address: ${receipt.customerAddress || '-'}`);
        doc.text(`Document Number: ${receipt.documentNumber || '-'}`);
        doc.text(`Document Description: ${receipt.documentDescription || '-'}`);
      }

      doc.text(`Remarks: ${receipt.remarks || '-'}`);
      doc.moveDown();

      // Receiver details
      doc.fontSize(14).text('Receiver Details', { underline: true });
      doc.fontSize(12).moveDown();
      doc.text(`Name: ${receipt.receiver?.fullName || '-'}`);
      doc.text(`Employee ID: ${receipt.receiver?.employeeId || '-'}`);
      doc.moveDown();

      // Materials
      doc.fontSize(14).text('Materials', { underline: true });
      doc.fontSize(12).moveDown();
      if (receipt.materials.length > 0) {
        receipt.materials.forEach((mat, index) => {
          doc.text(`Material ${index + 1}:`, { continued: true });
          const matTotal = (mat.price * mat.quantity) || mat.total || 0;
          doc.text(` ${mat.name} - ${mat.quantity} ${mat.unit} - ₹${matTotal}`);
          if (mat.description) doc.text(`Description: ${mat.description}`);
          if (mat.barcode) doc.text(`Barcode: ${mat.barcode}`);
          doc.moveDown();
        });
        doc.moveDown();
        doc.fontSize(14).text(`Grand Total: ₹${receipt.grandTotal?.toLocaleString() || 0}`, { align: 'right' });
      } else {
        doc.text('No materials listed.');
      }
    }

    doc.end();
  } catch (error) {
    console.error('Export receipt to pdf error:', error);
    res.status(500).json({ message: 'Failed to export receipt.', error: error.message });
  }
};

module.exports = {
  getInternalReceipts,
  createInternalReceipt,
  getExternalReceipts,
  createExternalReceipt,
  getReceipt,
  exportReceiptToExcel,
  exportReceiptToPDF,
};
