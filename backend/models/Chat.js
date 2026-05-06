const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      default: 'New Chat',
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
  }
);

module.exports = mongoose.model('Chat', chatSchema);
