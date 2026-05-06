import axios from 'axios';

const API_BASE = 'http://localhost:5000/api';

export const api = {
  // Chat APIs
  getChats: async () => {
    const res = await axios.get(`${API_BASE}/chats`);
    return res.data;
  },
  createChat: async (title = 'New Chat') => {
    const res = await axios.post(`${API_BASE}/chats`, { title });
    return res.data;
  },
  renameChat: async (id, title) => {
    const res = await axios.put(`${API_BASE}/chats/${id}`, { title });
    return res.data;
  },
  deleteChat: async (id) => {
    const res = await axios.delete(`${API_BASE}/chats/${id}`);
    return res.data;
  },

  // Message APIs
  getMessages: async (chatId, page = 1) => {
    const res = await axios.get(`${API_BASE}/chats/${chatId}/messages?page=${page}&limit=50`);
    return res.data;
  },

  /**
   * Send a message and handle SSE stream.
   * Uses a proper line-buffering approach to handle partial chunks.
   */
  streamMessage: async (chatId, content, model, onChunk, onDone, onError) => {
    try {
      const response = await fetch(`${API_BASE}/chats/${chatId}/messages/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content, model }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      // Buffer for incomplete lines that get split across chunks
      let buffer = '';
      // Track all text we've seen to deduplicate
      let fullText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        // Append new data to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete lines only (lines end with \n)
        const lines = buffer.split('\n');
        
        // Keep the last element as buffer (it's either empty or an incomplete line)
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue; // Skip empty lines
          
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.substring(6);
            
            if (dataStr === '[DONE]') {
              onDone();
              return;
            }
            
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.error) {
                onError(parsed.error);
                return;
              }
              if (parsed.text) {
                fullText += parsed.text;
                onChunk(parsed.text);
              }
            } catch (e) {
              // Ignore unparseable fragments
            }
          }
        }
      }
      
      // Process any remaining buffer
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data: ') && trimmed.substring(6) === '[DONE]') {
          // done
        }
      }
      
      onDone();
    } catch (err) {
      onError(err.message);
    }
  }
};
