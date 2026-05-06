require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const aiService = require('./services/ai.service');

const chatController = require('./controllers/chat.controller');
const messageController = require('./controllers/message.controller');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Routes
app.get('/api/chats', chatController.getChats);
app.post('/api/chats', chatController.createChat);
app.put('/api/chats/:id', chatController.renameChat);
app.delete('/api/chats/:id', chatController.deleteChat);

app.get('/api/chats/:id/messages', messageController.getMessages);
app.post('/api/chats/:id/messages/stream', messageController.streamMessage);

// Connect to MongoDB and start server
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB');

    // Initialize AI Service
    try {
      await aiService.initialize();
    } catch (err) {
      console.error('Failed to initialize AI Service:', err.message);
      // We still start the server, but chat won't work
    }

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB', err);
  });
