import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ChatMessage } from '../hooks/useWebRTC';
import { Send, MessageSquare, Check, CheckCheck } from 'lucide-react';

interface ChatPanelProps {
  messages: ChatMessage[];
  selfName: string;
  onSendMessage: (text: string) => void;
  typingUsers?: string[];
  onTyping?: (isTyping: boolean) => void;
  onMessagesSeen?: (messageIds: string[]) => void;
}

export const ChatPanel: React.FC<ChatPanelProps & { onClose?: () => void }> = ({
  messages,
  selfName,
  onSendMessage,
  onClose,
  typingUsers = [],
  onTyping,
  onMessagesSeen,
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-mark messages as seen (chat is always visible now)
  useEffect(() => {
    if (onMessagesSeen) {
      const unseenRemote = messages.filter(m => m.sender === 'remote' && !m.seenBy?.includes(selfName)).map(m => m.id);
      if (unseenRemote.length > 0) {
        onMessagesSeen(unseenRemote);
      }
    }
  }, [messages, onMessagesSeen, selfName]);

  // Auto scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText);
    setInputText('');
    if (onTyping) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      onTyping(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    if (onTyping) {
      onTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => onTyping(false), 2000);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950/60 backdrop-blur-3xl border-l border-white/5 w-full text-zinc-300">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <MessageSquare className="size-3.5 text-brand-violet" />
          Chat
        </div>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-white transition-colors text-xl leading-none sm:hidden"
        >
          &times;
        </button>
      </div>

      {/* Chat Thread + Input — always shown */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
        <>
          {/* Chat Thread */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
                {messages.length === 0 ? (
                  <div className="h-[50vh] flex flex-col items-center justify-center text-zinc-500 text-center px-4">
                    <MessageSquare className="size-6 text-zinc-600 mb-2" />
                    <p className="text-xs font-medium">No messages yet</p>
                    <p className="text-[10px] text-zinc-600 mt-1">Start chatting using WebRTC</p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col max-w-[85%] ${msg.sender === 'self' ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                    >
                      {msg.sender === 'remote' && (
                        <span className="text-[11px] font-medium text-brand-violet mb-0.5 ml-1">
                          {msg.senderName}
                        </span>
                      )}
                      <div
                        className={`relative px-2.5 py-1.5 text-[13px] leading-relaxed break-words shadow-sm ${
                          msg.sender === 'self' 
                            ? 'bg-brand-violet text-white rounded-2xl rounded-br-sm' 
                            : 'bg-zinc-800 text-zinc-100 rounded-2xl rounded-bl-sm'
                        }`}
                      >
                        <span className="whitespace-pre-wrap align-top">{msg.text}</span>
                        <span className={`float-right inline-flex items-center gap-0.5 ml-3 mt-1.5 ${msg.sender === 'self' ? 'text-white/70' : 'text-zinc-400'}`}>
                          <span className="text-[9px] font-medium tracking-wide">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {msg.sender === 'self' && (
                            <span className="ml-0.5">
                              {msg.seenBy && msg.seenBy.length > 0 ? (
                                <CheckCheck className="size-3 text-white/90" />
                              ) : (
                                <Check className="size-3 text-white/70" />
                              )}
                            </span>
                          )}
                        </span>
                        <div className="clear-both" />
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
            <div className="p-3 border-t border-white/5 bg-zinc-950/40 shrink-0 relative">
            {typingUsers.length > 0 && (
              <div className="absolute -top-7 left-3 text-[10px] text-zinc-400 font-medium italic flex items-center gap-1.5 bg-zinc-950/80 px-3 py-1.5 rounded-t-lg backdrop-blur-md border-t border-x border-white/10">
                <span className="flex gap-0.5">
                  <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                </span>
                {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing
              </div>
            )}
            <form onSubmit={handleSubmit} className="flex gap-2 relative">
              <Input
                autoFocus
                placeholder="Message room..."
                value={inputText}
                onChange={handleInputChange}
                className="pr-10 h-10 bg-zinc-900/50 border-white/5 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-white/10"
              />
              <Button type="submit" size="icon" className="bg-brand-violet hover:bg-brand-violet/90 size-10 shrink-0 text-white rounded-full">
                <Send className="size-4 -ml-0.5" />
              </Button>
            </form>
            </div>
          </>
      </div>
    </div>
  );
};
