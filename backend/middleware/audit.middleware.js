const AuditLog = require('../modules/material/models/AuditLog');

const createAuditLog = async ({ user, action, entity, entityId, oldData, newData, req }) => {
  try {
    await AuditLog.create({
      user: user._id || user,
      action,
      entity,
      entityId: entityId || '',
      oldData: oldData || null,
      newData: newData || null,
      ipAddress: req ? (req.ip || req.connection?.remoteAddress || '') : '',
      userAgent: req ? (req.headers['user-agent'] || '') : '',
    });
  } catch (error) {
    console.error('Audit log error:', error.message);
  }
};

module.exports = { createAuditLog };
