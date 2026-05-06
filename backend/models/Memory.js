const mongoose = require('mongoose');

const memorySchema = new mongoose.Schema(
  {
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat',
      required: true,
      index: true,
    },
    summary: {
      type: String,
      required: true,
    },
    embeddings: {
      type: [Number], // Array of floats
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Memory', memorySchema);
