const Message = require('../models/Message');
const Chat = require('../models/Chat');
const memoryManager = require('../services/memory.manager');
const aiService = require('../services/ai.service');

exports.getMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;
    
    const messages = await Message.find({ chatId: id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
      
    // Return chronological order
    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

exports.streamMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { content, model } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    // 1. Save user message
    await Message.create({
      chatId: id,
      role: 'user',
      content
    });

    // Update Chat's updatedAt
    await Chat.findByIdAndUpdate(id, { updatedAt: new Date() });

    // 2. Fetch context (short term + summaries + semantics)
    const contextMessages = await memoryManager.getContext(id);

    // 3. Auto-generate title from first user message (background, fire-and-forget)
    const messageCount = await Message.countDocuments({ chatId: id });
    if (messageCount === 1) {
      generateTitle(id, content);
    }

    // 4. Stream response to client
    const fullAssistantResponse = await aiService.streamChat(contextMessages, res, model);

    // 5. Save assistant response (after stream is done)
    if (fullAssistantResponse) {
      await Message.create({
        chatId: id,
        role: 'assistant',
        content: fullAssistantResponse
      });
    }

    // 6. Check for summarization threshold in background
    memoryManager.triggerSummarization(id).catch(console.error);

  } catch (err) {
    console.error('Error in streamMessage:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error' });
    } else if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: 'Internal error' })}\n\n`);
      res.end();
    }
  }
};

/**
 * Fire-and-forget title generation using a simple string prompt.
 * Tries to generate a short title from the user's first message.
 */
function generateTitle(chatId, firstMessage) {
  const prompt = `Generate a very short title (maximum 4 words) for this message. Respond with ONLY the title, no quotes, no punctuation at the end:\n\n${firstMessage}`;
  
  aiService.chat([
    { role: 'system', content: 'You generate very short chat titles. Respond with only 2-4 words. No quotes.' },
    { role: 'user', content: prompt }
  ]).then(title => {
    if (title && title.trim()) {
      const cleanTitle = title.trim().replace(/^["']|["']$/g, '').substring(0, 40);
      Chat.findByIdAndUpdate(chatId, { title: cleanTitle }).exec();
      console.log(`Generated title: "${cleanTitle}" for chat ${chatId}`);
    }
  }).catch(err => {
    console.error("Title generation failed:", err.message);
  });
}
