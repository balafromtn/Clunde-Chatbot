const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Memory = require('../models/Memory');

exports.getChats = async (req, res) => {
  try {
    const chats = await Chat.find().sort({ updatedAt: -1 });
    res.json(chats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch chats' });
  }
};

exports.createChat = async (req, res) => {
  try {
    const { title } = req.body;
    const chat = await Chat.create({ title: title || 'New Chat' });
    res.status(201).json(chat);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create chat' });
  }
};

exports.renameChat = async (req, res) => {
  try {
    const { title } = req.body;
    const chat = await Chat.findByIdAndUpdate(req.params.id, { title }, { new: true });
    res.json(chat);
  } catch (err) {
    res.status(500).json({ error: 'Failed to rename chat' });
  }
};

exports.deleteChat = async (req, res) => {
  try {
    await Chat.findByIdAndDelete(req.params.id);
    await Message.deleteMany({ chatId: req.params.id });
    await Memory.deleteMany({ chatId: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete chat' });
  }
};
