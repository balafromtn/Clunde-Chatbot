require('dotenv').config();
const { init } = require('@heyputer/puter.js/src/init.cjs');
const { pipeline } = require('@xenova/transformers');

class AIService {
  constructor() {
    this.puter = null;
    this.embedder = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // 1. Init Puter
      const token = process.env.PUTER_AUTH_TOKEN;
      if (!token) {
        console.warn('No PUTER_AUTH_TOKEN found in .env.');
      } else {
        this.puter = init(token);
        console.log('Puter.js initialized.');
      }

      // 2. Init Transformers embedder (all-MiniLM-L6-v2)
      console.log('Loading embedding model...');
      this.embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      console.log('Embedding model loaded.');

      this.initialized = true;
    } catch (error) {
      console.error('Error initializing AIService:', error);
      throw error;
    }
  }

  /**
   * Generates embeddings for a given text.
   */
  async generateEmbedding(text) {
    if (!this.embedder) throw new Error('Embedder not initialized');
    const result = await this.embedder(text, { pooling: 'mean', normalize: true });
    return Array.from(result.data);
  }

  /**
   * Calculates cosine similarity between two vectors.
   */
  cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Non-streaming chat (for summaries/titles).
   * Uses a simple string prompt for maximum compatibility.
   */
  async chat(messages, model) {
    if (!this.puter) throw new Error('Puter not initialized.');

    // For simple tasks like title generation, use a string prompt
    // which is the most reliable puter.ai.chat signature
    const lastUserMsg = messages.filter(m => m.role === 'user').pop();
    const systemMsg = messages.filter(m => m.role === 'system').pop();
    
    const combinedPrompt = (systemMsg ? systemMsg.content + '\n\n' : '') + (lastUserMsg ? lastUserMsg.content : '');
    
    const options = {};
    if (model) options.model = model;

    const response = await this.puter.ai.chat(combinedPrompt, options);

    // Handle different response shapes
    if (response && response.message && response.message.content) {
      const content = response.message.content;
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) return content.map(c => c.text || '').join('');
    }
    if (typeof response === 'string') return response;
    return '';
  }

  /**
   * Stream chat using Puter, pipes to Express response object via SSE.
   * Passes messages array as first arg for multi-turn context.
   */
  async streamChat(messages, res, model) {
    if (!this.puter) throw new Error('Puter not initialized.');

    // Set SSE headers FIRST, before any async work
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      const options = { stream: true };
      if (model) options.model = model;

      const responseStream = await this.puter.ai.chat(messages, options);

      // Check if puter returned an error object instead of a stream
      if (responseStream && responseStream.error) {
        console.error('Puter error:', responseStream.error);
        res.write(`data: ${JSON.stringify({ text: `Error: ${responseStream.message || responseStream.error}` })}\n\n`);
        res.write(`data: [DONE]\n\n`);
        res.end();
        return '';
      }

      let fullResponse = '';

      for await (const part of responseStream) {
        if (part && part.text) {
          fullResponse += part.text;
          res.write(`data: ${JSON.stringify({ text: part.text })}\n\n`);
        }
      }

      res.write(`data: [DONE]\n\n`);
      res.end();
      return fullResponse;
    } catch (error) {
      console.error('Error in streamChat:', error);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ text: 'Sorry, I encountered an error generating the response. Please try again.' })}\n\n`);
        res.write(`data: [DONE]\n\n`);
        res.end();
      }
      return '';
    }
  }
}

module.exports = new AIService();
