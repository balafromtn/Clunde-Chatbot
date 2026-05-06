import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { api } from './api';
import {
  PanelLeft, MessageSquare, Trash2,
  Send, Loader2, ChevronDown, Bot, Check, Sun, Moon, User, Plus, ArrowDown
} from 'lucide-react';

const MODELS = [
  { id: 'claude-opus-4-7', label: 'Opus 4.7', desc: 'Most capable Claude model' },
  { id: 'gpt-5.5-pro', label: 'GPT-5.5 Pro', desc: 'OpenAI flagship model' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', desc: 'Google multimodal model' },
  { id: 'mistralai/ministral-14b-2512', label: 'Ministral 14B', desc: 'Lightweight and fast' },
];

function App() {
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedModel, setSelectedModel] = useState('claude-opus-4-7');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const messagesEndRef = useRef(null);
  const modelDropdownRef = useRef(null);
  const textareaRef = useRef(null);

  // ── Lifecycle ──
  useEffect(() => {
    loadChats();
    setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }, []);

  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); }, [theme]);
  useEffect(() => { activeChatId ? loadMessages(activeChatId) : setMessages([]); }, [activeChatId]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isStreaming]);

  // Close model dropdown on outside click
  useEffect(() => {
    const h = (e) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target)) setShowModelDropdown(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    setShowScrollButton(scrollHeight - scrollTop - clientHeight > 100);
  };

  // ── Data ──
  const loadChats = async () => {
    try {
      const d = await api.getChats();
      setChats(d);
      if (d.length > 0 && !activeChatId) setActiveChatId(d[0]._id);
    } catch (e) { console.error(e); }
  };

  const loadMessages = async (id) => {
    try { setMessages(await api.getMessages(id)); }
    catch (e) { console.error(e); }
  };

  const handleCreateChat = async () => {
    try {
      const c = await api.createChat();
      setChats(p => [c, ...p]);
      setActiveChatId(c._id);
      setMessages([]);
    } catch (e) { console.error(e); }
  };

  const handleDeleteChat = async (id) => {
    try {
      await api.deleteChat(id);
      const r = chats.filter(c => c._id !== id);
      setChats(r);
      if (activeChatId === id) setActiveChatId(r[0]?._id || null);
    } catch (e) { console.error(e); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    let tid = activeChatId;
    if (!tid) {
      const c = await api.createChat();
      setChats(p => [c, ...p]);
      setActiveChatId(c._id);
      tid = c._id;
    }

    const um = { role: 'user', content: input };
    setMessages(p => [...p, um]);
    setInput('');
    setIsStreaming(true);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setMessages(p => [...p, { role: 'assistant', content: '' }]);

    await api.streamMessage(
      tid, um.content, selectedModel,
      (chunk) => {
        setMessages(p => { const m = [...p]; m[m.length - 1].content += chunk; return [...m]; });
      },
      () => { setIsStreaming(false); setTimeout(loadChats, 2000); },
      () => { setIsStreaming(false); }
    );
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
  };

  const currentLabel = MODELS.find(m => m.id === selectedModel)?.label || 'Model';

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground font-comic">

      {/* ═══════════════════════════════════════
          SIDEBAR
          ═══════════════════════════════════════ */}
      <aside
        className={`${sidebarOpen ? 'w-[260px]' : 'w-0'} flex-shrink-0 bg-sidebar border-r-[2.5px] border-border/40 flex flex-col select-none paper-grain overflow-hidden transition-all duration-300`}
      >
        <div className="min-w-[260px] flex flex-col h-full">

          {/* Top — menu toggle */}
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <div className="pl-1 flex items-center">
              <img src="/clunde-icon.svg" alt="Clunde" className="w-[26px] h-[26px]" />
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="comic-btn comic-wobble ink-border-thin w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/30"
            >
              <PanelLeft size={18} />
            </button>
          </div>

          {/* New Chat */}
          <div className="px-4 pb-3">
            <button
              onClick={handleCreateChat}
              className="comic-btn ink-border w-full h-12 flex items-center gap-2 justify-center text-[16px] font-bold text-foreground hover:bg-accent/10 rounded-2xl"
            >
              <Plus size={18} strokeWidth={2.5} />
              <span>New Chat</span>
            </button>
          </div>

          {/* Chat List */}
          <div className="flex-1 overflow-y-auto px-3 space-y-1">
            {chats.map(chat => (
              <div
                key={chat._id}
                onClick={() => setActiveChatId(chat._id)}
                className={`group comic-btn flex items-center justify-between h-11 px-3 cursor-pointer rounded-xl ${
                  activeChatId === chat._id
                    ? 'bg-muted/50 text-foreground ink-border-thin'
                    : 'text-muted-foreground hover:bg-muted/25 hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <MessageSquare size={15} className="shrink-0 opacity-50" />
                  <span className="truncate text-[15px] font-bold">{chat.title}</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteChat(chat._id); }}
                  className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-1 hover:text-destructive"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {/* Bottom — Profile + Theme */}
          <div className="px-3 py-3 border-t-[2px] border-border/25">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center shrink-0 ink-border-thin">
                  <User size={14} className="text-muted-foreground" />
                </div>
                <span className="text-[15px] font-bold truncate">User</span>
              </div>
              <button
                onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
                className="comic-btn comic-wobble ink-border-thin w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/30"
                aria-label="Toggle theme"
              >
                {theme === 'dark'
                  ? <Sun size={16} />
                  : <Moon size={16} />
                }
              </button>
            </div>
          </div>

          <div className="grain-overlay" />
        </div>
      </aside>

      {/* ═══════════════════════════════════════
          MAIN CHAT
          ═══════════════════════════════════════ */}
      <main className="flex-1 flex flex-col h-full relative" style={{ background: 'var(--chat-bg-gradient)' }}>

        {/* Top bar — logo always visible */}
        <div className="h-14 flex items-center gap-3 px-5 border-b-[2.5px] border-border/20 shrink-0">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="comic-btn comic-wobble ink-border-thin w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/30"
            >
              <PanelLeft size={18} />
            </button>
          )}
          {!sidebarOpen && (
            <img src="/clunde-icon.svg" alt="Clunde" className="w-[22px] h-[22px] -mr-1" />
          )}
          <span
            className="font-logo text-[24px] font-bold text-foreground select-none"
            style={{ transform: 'rotate(-1deg)', display: 'inline-block' }}
          >
            Clunde
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto" onScroll={handleScroll}>
          <div className="max-w-[720px] mx-auto px-6 py-6 space-y-4 pb-48">

            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center mt-[20vh] space-y-4">
                <span
                  className="font-logo text-[44px] font-bold text-foreground"
                  style={{ transform: 'rotate(-1.5deg)', display: 'inline-block' }}
                >
                  Clunde
                </span>
                <p className="text-[17px] text-muted-foreground max-w-sm leading-relaxed mt-2 font-bold">
                  Your AI assistant! 💬<br />
                  Type something to start chatting.
                </p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex items-end gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >


                  <div className={msg.role === 'user' ? 'max-w-[85%] px-4 py-3 comic-bubble-user' : 'w-full py-2'}>
                    {msg.role === 'assistant' && msg.content === '' && isStreaming && i === messages.length - 1 ? (
                      <div className="flex items-center gap-2 h-6 py-0.5">
                        <div className="comic-typing-dot" />
                        <div className="comic-typing-dot" />
                        <div className="comic-typing-dot" />
                      </div>
                    ) : (
                      <div className={`prose dark:prose-invert max-w-none ${msg.role === 'assistant' ? 'text-justify' : ''}`}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>

                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Scroll to bottom button */}
        {showScrollButton && (
          <div className="absolute bottom-48 left-1/2 -translate-x-1/2 z-10 flex justify-center">
            <button
              onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="comic-btn rounded-full bg-card border-[2.5px] border-border/50 shadow-md w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-foreground"
            >
              <ArrowDown size={18} />
            </button>
          </div>
        )}

        {/* ── Input Area ── */}
        <div
          className="absolute bottom-0 left-0 right-0 px-6 pb-5 pt-14"
          style={{ background: `linear-gradient(to top, hsl(var(--chat-bg)) 55%, transparent)` }}
        >
          <div className="max-w-[720px] mx-auto">
            {/* Input box — textarea on top, toolbar on bottom */}
            <div
              className="ink-border flex flex-col p-3 relative"
              style={{ backgroundColor: 'hsl(var(--card))', borderRadius: '24px' }}
            >
              <textarea
                ref={textareaRef}
                rows="1"
                className="w-full bg-transparent resize-none outline-none text-[17px] font-comic text-foreground placeholder:text-muted-foreground/50 py-1 min-h-[42px] max-h-[160px] leading-relaxed"
                placeholder="Type a message..."
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
                }}
                onKeyDown={handleKeyDown}
                disabled={isStreaming}
              />

              <div className="flex items-center justify-between mt-2">
                {/* Left: Toolbar items */}
                <div className="flex items-center gap-1">


                  <div className="relative shrink-0" ref={modelDropdownRef}>
                    <button
                      onClick={() => setShowModelDropdown(!showModelDropdown)}
                      className="comic-btn flex items-center gap-1.5 px-3 py-1.5 text-[14px] font-bold text-foreground bg-muted/20 hover:bg-muted/40 rounded-full transition-all duration-150 active:scale-95"
                    >
                      <span>{currentLabel}</span>
                      <ChevronDown size={14} className={`transition-transform duration-150 ${showModelDropdown ? '' : 'rotate-180'}`} />
                    </button>

                  {showModelDropdown && (
                    <div className="absolute bottom-full left-0 mb-2 z-50">
                      <div
                        className="w-[280px] border-[2.5px] border-border rounded-2xl overflow-hidden py-2 flex flex-col gap-1"
                        style={{ backgroundColor: 'hsl(var(--card))', animation: 'pop-in 150ms ease-out' }}
                      >
                        {MODELS.map((m, i) => (
                          <div key={m.id} className="px-2">
                            <button
                              onClick={() => { setSelectedModel(m.id); setShowModelDropdown(false); }}
                              className={`comic-btn w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 transition-colors duration-150 rounded-full ${
                                selectedModel === m.id
                                  ? 'bg-accent/10 text-foreground'
                                  : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                              }`}
                            >
                              <div>
                                <div className="text-[14px] font-bold">{m.label}</div>
                                <div className="text-[11px] opacity-60 mt-0.5">{m.desc}</div>
                              </div>
                              {selectedModel === m.id && (
                                <Check size={14} className="text-accent shrink-0" strokeWidth={2.5} />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

                {/* Right: Send Button */}
                <button
                  onClick={handleSubmit}
                  disabled={!input.trim() || isStreaming}
                  className={`comic-send shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150 active:scale-95 border-[2px] ${
                    !input.trim() || isStreaming
                      ? 'bg-muted border-border/30 text-muted-foreground/30 cursor-not-allowed'
                      : 'bg-accent border-border text-accent-foreground'
                  }`}
                >
                  {isStreaming
                    ? <Loader2 size={15} className="animate-spin" />
                    : <Send size={15} className="ml-0.5" />
                  }
                </button>
              </div>
            </div>

            <p className="text-center text-[12px] mt-3 font-medium" style={{ color: 'hsl(0 0% 65%)' }}>
              Clunde can make mistakes. Verify important info.
            </p>
          </div>
        </div>

      </main>
    </div>
  );
}

export default App;
