let io = null;

/**
 * Register the global Socket.IO instance initialized by server.js
 */
const setIO = (ioInstance) => {
  io = ioInstance;
};

/**
 * Get active Socket.IO instance
 */
const getIO = () => io;

/**
 * Emit event to a specific user room (supports both 'userId' and 'user:userId')
 */
const emitToUser = (userId, event, data) => {
  if (io && userId) {
    const uStr = userId.toString();
    io.to(uStr).emit(event, data);
    io.to(`user:${uStr}`).emit(event, data);
  }
};

/**
 * Emit event to a material transaction room ('txn:transactionId')
 */
const emitToTransaction = (transactionId, event, data) => {
  if (io && transactionId) {
    const tStr = transactionId.toString();
    io.to(`txn:${tStr}`).emit(event, data);
  }
};

/**
 * Broadcast event to all connected socket clients
 */
const emitToAll = (event, data) => {
  if (io) {
    io.emit(event, data);
  }
};

module.exports = {
  setIO,
  getIO,
  emitToUser,
  emitToTransaction,
  emitToAll
};
