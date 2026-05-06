const aiService = require('./ai.service');
const Message = require('../models/Message');
const Memory = require('../models/Memory');

const ROLLING_CONTEXT_LIMIT = 12;
const SUMMARIZE_THRESHOLD = 20;

// For real-time web search
let ddgSearch = null;
try {
  ddgSearch = require('duck-duck-scrape').search;
} catch (e) {
  console.warn('duck-duck-scrape not available, web search disabled');
}

class MemoryManager {
  /**
   * Retrieves context for the prompt (short term, memory, semantic)
   */
  async getContext(chatId) {
    // 1. Get recent messages (short-term memory)
    const recentMessages = await Message.find({ chatId })
      .sort({ createdAt: -1 })
      .limit(ROLLING_CONTEXT_LIMIT)
      .lean();
    
    recentMessages.reverse();

    // 2. Get summarized long-term memory
    const memories = await Memory.find({ chatId }).sort({ createdAt: 1 }).lean();
    let combinedSummary = memories.map(m => m.summary).join("\n");

    // 3. Semantic Memory (RAG)
    let semanticRetrieval = "";
    const lastUserMessage = recentMessages.filter(m => m.role === 'user').pop();
    
    if (lastUserMessage && memories.length > 0) {
      try {
        const queryEmbedding = await aiService.generateEmbedding(lastUserMessage.content);
        
        const scoredMemories = memories.map(mem => ({
          ...mem,
          score: aiService.cosineSimilarity(queryEmbedding, mem.embeddings)
        }));

        scoredMemories.sort((a, b) => b.score - a.score);
        const topMemories = scoredMemories.slice(0, 3).filter(m => m.score > 0.5);

        if (topMemories.length > 0) {
          semanticRetrieval = topMemories.map(m => m.summary).join("\n");
        }
      } catch (err) {
        console.error("Embedding/similarity error:", err.message);
      }
    }

    // 4. Real-time context injection
    const currentDate = new Date();
    const timeStr = currentDate.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    });
    let realTimeContext = `Current Date and Time: ${timeStr}\n`;

    // 5. Web search for real-time questions
    if (ddgSearch && lastUserMessage) {
      const query = lastUserMessage.content.toLowerCase();
      const needsWebSearch = /(latest|news|today|current|happen|now|recent|update|score|weather|price|who won|what is|stock|live|event)/i.test(query);

      if (needsWebSearch) {
        try {
          const searchResults = await ddgSearch(lastUserMessage.content, { safeSearch: 0 });
          if (searchResults && searchResults.results && searchResults.results.length > 0) {
            const topResults = searchResults.results.slice(0, 5)
              .map(r => `- ${r.title}: ${r.description}`)
              .join('\n');
            realTimeContext += `\nWeb Search Results for "${lastUserMessage.content}":\n${topResults}\n`;
          }
        } catch (err) {
          console.error("Web search failed:", err.message);
        }
      }
    }

    // 6. Construct System Prompt
    const systemPromptText = `You are Clunde, an AI assistant! 

A helpful and knowledgeable AI designed to assist with a wide range of tasks — from answering questions, to providing real-time information, to having friendly conversations.

Here's a quick summary:
Name: Clunde
Type: Multi Large Language Model (LLM) supported AI Assistant
Capabilities: Answering questions, real-time info, general knowledge, coding help, writing, and much more!

You have access to real-time information.

${realTimeContext}

Memory Summaries:
${combinedSummary || "No previous summaries."}

Relevant Past Context:
${semanticRetrieval || "None"}

Important instructions:
- Use the Current Date and Time above when the user asks about the time or date.
- Use the Web Search Results above when the user asks about current events, news, or real-time data.
- Be concise, helpful, and friendly.`;

    const formattedMessages = [
      { role: 'system', content: systemPromptText },
      ...recentMessages.map(msg => ({ role: msg.role, content: msg.content }))
    ];

    return formattedMessages;
  }

  /**
   * Check if we need to summarize old messages.
   */
  async triggerSummarization(chatId) {
    const messageCount = await Message.countDocuments({ chatId });
    
    if (messageCount > SUMMARIZE_THRESHOLD) {
      const unsummarizedOldMessages = await Message.find({ 
        chatId, 
        role: { $in: ['user', 'assistant'] },
      })
      .sort({ createdAt: 1 })
      .skip(0)
      .limit(messageCount - ROLLING_CONTEXT_LIMIT)
      .lean();

      if (unsummarizedOldMessages.length > 5) {
        console.log(`Triggering summarization for ${unsummarizedOldMessages.length} messages.`);
        
        const textToSummarize = unsummarizedOldMessages
          .map(m => `${m.role}: ${m.content}`)
          .join('\n');

        const prompt = [
          { role: 'system', content: 'You are an assistant that creates concise summaries of conversations. Extract the key facts, decisions, and topics discussed.' },
          { role: 'user', content: `Please summarize the following conversation:\n\n${textToSummarize}` }
        ];

        try {
          const summary = await aiService.chat(prompt);
          const embeddings = await aiService.generateEmbedding(summary);

          await Memory.create({ chatId, summary, embeddings });

          const msgIds = unsummarizedOldMessages.map(m => m._id);
          await Message.deleteMany({ _id: { $in: msgIds } });
          
          console.log(`Summarized and archived ${msgIds.length} messages.`);
        } catch (error) {
          console.error("Error during summarization:", error.message);
        }
      }
    }
  }
}

module.exports = new MemoryManager();
