const mongoose = require('mongoose');

const transactionChatSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    attachments: [
      {
        url: String,
        type: String, // 'image', 'document'
        name: String,
      },
    ],
    readBy: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        readAt: { type: Date, default: Date.now },
      },
    ],
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('TransactionChat', transactionChatSchema);
