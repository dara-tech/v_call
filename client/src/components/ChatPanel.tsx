import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ChatMessage, PeerState } from '../hooks/useWebRTC';
import { Send, Users, MessageSquare } from 'lucide-react';

interface ChatPanelProps {
  messages: ChatMessage[];
  peers: PeerState[];
  selfName: string;
  onSendMessage: (text: string) => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  peers,
  selfName,
  onSendMessage,
}) => {
  const [inputText, setInputText] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'users'>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText);
    setInputText('');
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 border-l border-zinc-800 w-80 text-zinc-300">
      
      {/* Sidebar Tabs */}
      <div className="flex border-b border-zinc-800">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-all ${activeTab === 'chat' ? 'border-brand-violet text-white bg-zinc-900/40' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
        >
          <MessageSquare className="size-3.5" />
          Chat
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-all ${activeTab === 'users' ? 'border-brand-violet text-white bg-zinc-900/40' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
        >
          <Users className="size-3.5" />
          Participants ({peers.length + 1})
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {activeTab === 'chat' ? (
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
                      <span className="text-[9px] font-semibold text-zinc-500 mb-0.5">
                        {msg.sender === 'self' ? 'You' : msg.senderName}
                      </span>
                      <div
                        className={`px-3 py-2 rounded-lg text-xs leading-relaxed break-words ${msg.sender === 'self' ? 'bg-brand-violet/20 border border-brand-violet/30 text-white rounded-br-none' : 'bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-bl-none'}`}
                      >
                        {msg.text}
                      </div>
                      <span className="text-[8px] text-zinc-600 font-mono mt-0.5">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Chat Input */}
            <form onSubmit={handleSubmit} className="p-3 border-t border-zinc-800 flex gap-1.5 bg-zinc-950">
              <Input
                type="text"
                placeholder="Type a message..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="bg-zinc-900 border-zinc-800 focus:border-zinc-700 text-xs h-8 text-zinc-200"
              />
              <Button type="submit" size="icon-sm" className="bg-brand-violet hover:bg-brand-violet/90 size-8 text-white">
                <Send className="size-3.5" />
              </Button>
            </form>
          </>
        ) : (
          // Users list
          <div className="p-4 space-y-3">
            {/* User Row (Self) */}
            <div className="flex items-center justify-between p-2.5 rounded-md border border-zinc-800/60 bg-zinc-900/30">
              <div className="flex items-center gap-2">
                <span className="size-2 bg-brand-emerald rounded-full" />
                <span className="text-xs font-medium text-zinc-200">{selfName}</span>
              </div>
              <span className="text-[9px] font-mono bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">You</span>
            </div>

            {/* User Row (Remote Peer) */}
            {peers.length > 0 ? (
              peers.map((peer) => (
                <div key={peer.info.socketId} className="flex items-center justify-between p-2.5 rounded-md border border-zinc-800/60 bg-zinc-900/30">
                  <div className="flex items-center gap-2">
                    <span className="size-2 bg-brand-emerald rounded-full" />
                    <span className="text-xs font-medium text-zinc-200">{peer.info.userName}</span>
                  </div>
                  <span className="text-[9px] font-mono bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">Peer</span>
                </div>
              ))
            ) : (
              <div className="p-4 rounded-md border border-dashed border-zinc-800 text-center text-zinc-500 text-xs">
                Waiting for remote peers to connect...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
