import React, { useState, useEffect, useRef } from 'react';
import { Send, Phone, User, MessageCircle, Hash, Search, X, MoreHorizontal, Paperclip, Smile, Mic, Edit, Settings, MessageSquare, UserCircle, ChevronLeft } from 'lucide-react';

import { Input } from './ui/input';
import { CallRoom } from './CallRoom';
import { SettingsPage } from './SettingsPage';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';

import { callSound } from '../lib/callSound';
import { OutgoingCallOverlay } from './OutgoingCallOverlay';
import { IncomingCallOverlay } from './IncomingCallOverlay';
import { RoomDetailsPanel } from './RoomDetailsPanel';

import { SIGNALING_SERVER as API_URL } from '../lib/serverConfig';

interface ChatLayoutProps {
  currentUser: any;
  token: string;
  onLogout: () => void;
}

interface Room {
  id: string;
  name: string;
  type: string;
  createdAt?: string;
}

interface Message {
  _id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
}

export const ChatLayout: React.FC<ChatLayoutProps> = ({ currentUser, token, onLogout }) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string>('global');
  const [showMobileSidebar, setShowMobileSidebar] = useState(true);
  const [activeTab, setActiveTab] = useState<'chats' | 'settings' | 'members'>('chats');
  const [totalUsers, setTotalUsers] = useState<number>(1);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isInCall, setIsInCall] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);

  interface ActiveCall {
    callId: string;
    role: 'caller' | 'receiver';
    partnerId: string;
    partnerName: string;
    status: 'calling' | 'ringing' | 'connected';
  }
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [allMembers, setAllMembers] = useState<any[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [showRoomDetails, setShowRoomDetails] = useState(false);
  const [roomMembers, setRoomMembers] = useState<any[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [roomMetadata, setRoomMetadata] = useState<Record<string, { lastMessage: string; lastMessageTime: string }>>({});

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };
  
  // PiP and Watch Party state
  const [isWatchParty, setIsWatchParty] = useState(false);
  
  // Dragging state for PiP
  const [pipPos, setPipPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, startX: 0, startY: 0 });

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startX: pipPos.x,
      startY: pipPos.y
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const newY = dragStartRef.current.startY + (e.clientY - dragStartRef.current.y);
    setPipPos({
      x: dragStartRef.current.startX + (e.clientX - dragStartRef.current.x),
      y: Math.max(-76, newY) // Prevent dragging off top edge
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const activeRoom = rooms.find(r => r.id === activeRoomId);
  const otherUser = activeRoom?.type === 'private' 
    ? roomMembers.find(m => m._id !== (currentUser.id || currentUser._id)) 
    : null;

  const fetchWithAuth = async (endpoint: string, options: RequestInit = {}) => {
    const res = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`
      }
    });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    const json = await res.json();
    
    // Automatically unwrap known backend response formats
    if (json && Array.isArray(json)) return json;
    if (json && json.data && Array.isArray(json.data)) return json.data;
    if (json && json.messages && Array.isArray(json.messages)) return json.messages;
    
    return json;
  };

  useEffect(() => {
    // Fetch contacts (which act as direct message rooms)
    fetchWithAuth(`/api/messages/users`)
      .then(data => {
        const mappedRooms = data.map((u: any) => ({
          id: u._id,
          name: u.fullname || u.displayName || 'Unknown',
          type: 'private',
          createdAt: u.createdAt
        }));
        setRooms(mappedRooms);
        const counts: Record<string, number> = {};
        const meta: Record<string, { lastMessage: string; lastMessageTime: string }> = {};
        mappedRooms.forEach((r: any) => {
          counts[r.id] = 0;
          meta[r.id] = {
            lastMessage: "No messages yet",
            lastMessageTime: r.createdAt
          };
        });
        setUnreadCounts(counts);
        setRoomMetadata(meta);
      })
      .catch(console.error);

    // Fetch total user count
    fetchWithAuth(`/api/messages/users/all`)
      .then(data => setTotalUsers(data.length))
      .catch(console.error);

    // Initialize socket connection for text chat
    const newSocket = io(API_URL, {
      query: { userId: currentUser.id || currentUser._id },
      auth: { token }
    });
    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
      callSound.stop();
    };
  }, []);

  useEffect(() => {
    if (activeRoomId && activeRoomId !== 'global') {
      // Fetch messages for active room (direct message history with user)
      fetchWithAuth(`/api/messages/${activeRoomId}`)
        .then(data => {
          const msgs = data.map((m: any) => ({
            _id: m._id,
            roomId: activeRoomId,
            senderId: m.senderId._id || m.senderId,
            senderName: m.senderId.fullname || m.senderId.displayName || 'User',
            text: m.text || '',
            createdAt: m.createdAt
          }));
          setMessages(msgs.reverse());
          scrollToBottom();
        })
        .catch(console.error);

      setTypingUsers([]); // Clear typing indicator when switching rooms
      
      // Clear badge for selected active room
      setUnreadCounts(prev => ({
        ...prev,
        [activeRoomId]: 0
      }));
    }
  }, [activeRoomId, socket]);

  useEffect(() => {
    if (activeRoomId && activeRoomId !== 'global') {
      fetchWithAuth(`/api/messages/users/all`)
        .then(data => {
          const member = data.find((u: any) => u._id === activeRoomId);
          if (member) setRoomMembers([currentUser, member]);
        })
        .catch(console.error);
    }
  }, [activeRoomId]);

  useEffect(() => {
    if (activeTab === 'members' && allMembers.length === 0) {
      fetchWithAuth(`/api/messages/users/all`)
        .then(data => setAllMembers(data))
        .catch(console.error);
    }
  }, [activeTab, allMembers.length]);

  useEffect(() => {
    if (socket) {
      socket.on('newMessage', (message: any) => {
        const myId = currentUser.id || currentUser._id;
        const msgSenderId = message.senderId._id || message.senderId;
        const msgReceiverId = message.receiverId ? (message.receiverId._id || message.receiverId) : message.groupId;
        
        const mappedRoomId = msgSenderId === myId ? msgReceiverId : msgSenderId;
        
        const mappedMsg: Message = {
          _id: message._id,
          roomId: mappedRoomId,
          senderId: msgSenderId,
          senderName: message.senderId.fullname || message.senderId.displayName || 'User',
          text: message.text || '',
          createdAt: message.createdAt
        };

        if (mappedRoomId === activeRoomId) {
          setMessages(prev => [...prev, mappedMsg]);
          scrollToBottom();
          setTypingUsers(prev => prev.filter(name => name !== mappedMsg.senderName));
        }

        // Update metadata for the room
        setRoomMetadata(prev => ({
          ...prev,
          [mappedRoomId]: {
            lastMessage: mappedMsg.text,
            lastMessageTime: mappedMsg.createdAt
          }
        }));

        // Increment unread counts if it is not the active room
        if (mappedRoomId !== activeRoomId && msgSenderId !== myId) {
          setUnreadCounts(prev => ({
            ...prev,
            [mappedRoomId]: (prev[mappedRoomId] || 0) + 1
          }));
        }
      });
      
      socket.on('typing', (data: { roomId: string; userName: string; isTyping: boolean }) => {
        if (data.roomId === activeRoomId) {
          setTypingUsers(prev => {
            if (data.isTyping) {
              if (!prev.includes(data.userName)) return [...prev, data.userName];
              return prev;
            } else {
              return prev.filter(name => name !== data.userName);
            }
          });
        }
      });

      socket.on('call:incoming', ({ callId, callerId, callerInfo }) => {
        if (activeCall || isInCall) {
          socket.emit('call:reject', { callId, reason: 'busy' });
          return;
        }
        
        setActiveCall({
          callId,
          role: 'receiver',
          partnerId: callerId,
          partnerName: callerInfo?.displayName || callerInfo?.fullname || 'Unknown Caller',
          status: 'ringing'
        });
        callSound.playIncomingRingtone();
      });

      socket.on('call:ringing', ({ callId }) => {
        setActiveCall(prev => {
          if (prev && prev.callId === callId) {
            return { ...prev, status: 'ringing' };
          }
          return prev;
        });
      });

      socket.on('call:answered', ({ callId }) => {
        callSound.stop();
        setActiveCall(prev => {
          if (prev && prev.callId === callId) {
            return { ...prev, status: 'connected' };
          }
          return prev;
        });
        setIsInCall(true);
      });

      socket.on('call:rejected', ({ callId, reason }) => {
        callSound.playEndCallTone();
        setActiveCall(prev => {
          if (prev && prev.callId === callId) {
            toast.error(`Call declined: ${reason || 'User declined the call'}`);
            return null;
          }
          return prev;
        });
        setIsInCall(false);
      });

      socket.on('call:busy', ({ callId }) => {
        callSound.playEndCallTone();
        setActiveCall(prev => {
          if (prev && prev.callId === callId) {
            toast.error('User is busy on another call');
            return null;
          }
          return prev;
        });
        setIsInCall(false);
      });

      socket.on('call:cancelled', ({ callId }) => {
        callSound.stop();
        setActiveCall(prev => {
          if (prev && prev.callId === callId) {
            toast.info('Incoming call cancelled');
            return null;
          }
          return prev;
        });
      });

      socket.on('call:ended', ({ callId }) => {
        callSound.playEndCallTone();
        setActiveCall(prev => {
          if (prev && prev.callId === callId) {
            toast.info('Call ended');
            return null;
          }
          return prev;
        });
        setIsInCall(false);
      });

      socket.on('call:failed', ({ callId, reason }) => {
        callSound.playEndCallTone();
        setActiveCall(prev => {
          if (prev && prev.callId === callId) {
            toast.error(`Call failed: ${reason || 'Unknown error'}`);
            return null;
          }
          return prev;
        });
        setIsInCall(false);
      });

      return () => {
        socket.off('newMessage');
        socket.off('typing');
        socket.off('call:incoming');
        socket.off('call:ringing');
        socket.off('call:answered');
        socket.off('call:rejected');
        socket.off('call:busy');
        socket.off('call:cancelled');
        socket.off('call:ended');
        socket.off('call:failed');
      };
    }
  }, [socket, activeRoomId, activeCall, isInCall]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      fetchWithAuth(`/api/users/search?q=${encodeURIComponent(searchQuery)}`)
        .then(data => setSearchResults(data.filter((u: any) => u._id !== (currentUser.id || currentUser._id))))
        .catch(console.error);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleStartChat = async (targetUser: any) => {
    try {
      const newRoom = {
        id: targetUser._id,
        name: targetUser.fullname || targetUser.displayName,
        type: 'private',
        createdAt: new Date().toISOString()
      };
      
      if (!rooms.find(r => r.id === newRoom.id)) {
        setRooms(prev => [newRoom as Room, ...prev]);
      }
      setActiveRoomId(newRoom.id);
      setSearchQuery('');
      setIsSearching(false);
      setActiveTab('chats');
    } catch (err) {
      console.error(err);
    }
  };

  const handleStartCall = () => {
    if (!socket) {
      toast.error('Socket not connected');
      return;
    }
    
    if (activeRoom && activeRoom.type === 'private') {
      if (!otherUser) {
        toast.error('Recipient not found');
        return;
      }
      const myId = currentUser.id || currentUser._id;
      const newCallId = `call_${myId}_${otherUser._id}_${Date.now()}`;
      setActiveCall({
        callId: newCallId,
        role: 'caller',
        partnerId: otherUser._id,
        partnerName: activeRoom.name,
        status: 'calling'
      });
      socket.emit('call:initiate', {
        callId: newCallId,
        receiverId: otherUser._id,
        callType: 'video',
        callerInfo: {
          id: myId,
          fullname: currentUser.fullname || currentUser.displayName || 'Web User',
          profilePic: currentUser.profilePic
        }
      });
      callSound.playOutgoingRing();
    } else {
      // Group call - join directly
      setIsInCall(true);
    }
  };

  const handleAcceptCall = () => {
    if (!activeCall || !socket) return;
    socket.emit('call:answer', { callId: activeCall.callId });
    setActiveCall(prev => prev ? { ...prev, status: 'connected' } : null);
    setIsInCall(true);
    callSound.stop();
  };

  const handleRejectCall = () => {
    if (!activeCall || !socket) return;
    socket.emit('call:reject', { callId: activeCall.callId, reason: 'declined' });
    setActiveCall(null);
    callSound.stop();
  };

  const handleCancelCall = () => {
    if (!activeCall || !socket) return;
    socket.emit('call:cancel', { callId: activeCall.callId });
    setActiveCall(null);
    callSound.stop();
  };

  const handleLeaveCall = () => {
    if (activeCall && socket) {
      socket.emit('call:end', { callId: activeCall.callId, reason: 'ended' });
    }
    setActiveCall(null);
    setIsInCall(false);
    callSound.stop();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    
    if (socket && activeRoomId) {
      socket.emit('typing', { roomId: activeRoomId, userName: currentUser.displayName, isTyping: true });
      
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing', { roomId: activeRoomId, userName: currentUser.displayName, isTyping: false });
      }, 2000);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !socket) return;
    
    const textToSend = newMessage.trim();
    setNewMessage(''); // optimistic clear
    
    try {
      await fetchWithAuth(`/api/messages/send/${activeRoomId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: textToSend })
      });
    } catch (err) {
      console.error('Failed to send message:', err);
      toast.error('Failed to send message');
    }

    setNewMessage('');
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socket.emit('typing', { roomId: activeRoomId, userName: currentUser.displayName, isTyping: false });
  };

  return (
    <div className="flex h-screen bg-[#212121] text-white overflow-hidden">
      {/* Left Sidebar */}
      <div className={`${showMobileSidebar ? 'flex' : 'hidden'} lg:flex absolute inset-0 lg:relative w-full lg:w-[320px] shrink-0 bg-[#1c1c1c] border-r border-[#1a1a1a] flex-col transition-all duration-300 z-50`}>
        <div className="h-[60px] relative flex items-center justify-center px-4 border-b border-[#1a1a1a] shrink-0 bg-[#1c1c1c]">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-[6px] shrink-0">
              <div className="w-[22px] h-[22px] rounded-full bg-[#5fe3c8] border-[1.5px] border-[#1c1c1c] flex items-center justify-center text-[9px] font-bold text-black">G</div>
              <div className="w-[22px] h-[22px] rounded-full bg-blue-500 border-[1.5px] border-[#1c1c1c] flex items-center justify-center text-[9px] font-bold text-white">U</div>
              <div className="w-[22px] h-[22px] rounded-full bg-purple-500 border-[1.5px] border-[#1c1c1c] flex items-center justify-center text-[9px] font-bold text-white">P</div>
            </div>
            <div className="font-semibold text-[15px] text-white">
              {activeTab === 'chats' ? 'Chats' : activeTab === 'members' ? 'Members' : 'Settings'}
            </div>
          </div>
          <button type="button" aria-label="New chat" className="absolute right-4 text-[#3390ec] hover:text-blue-400 transition-colors">
            <Edit className="w-[20px] h-[20px]" strokeWidth={1.5} />
          </button>
        </div>
        <div className="px-3 py-2 bg-[#1c1c1c] shrink-0">
          <div className="relative block">
            <Search className="w-[18px] h-[18px] absolute left-3 top-1/2 -translate-y-1/2 text-[#777777] pointer-events-none" strokeWidth={1.5} />
            <Input 
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearching(true);
              }}
              onFocus={() => setIsSearching(true)}
              placeholder="Search (⌘K)"
              className="w-full bg-[#121212] border border-[#2c2c2c] rounded-[10px] pl-9 h-8 text-[14px] focus-visible:ring-0 placeholder:text-[#777777] text-white"
            />
            {isSearching && (
              <button 
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setIsSearching(false);
                  setSearchQuery('');
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777777] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto px-2">
          {activeTab === 'members' ? (
            <div className="space-y-1">
              <div className="px-2 py-1 text-[12px] font-semibold text-[#aaaaaa] uppercase tracking-wider font-sans">Members</div>
              {allMembers.length === 0 && (
                <div className="p-3 text-[14px] text-[#777777] text-center font-sans">Loading members...</div>
              )}
              {allMembers.map(member => (
                <div 
                  key={member._id}
                  onClick={() => {
                    if (member._id !== currentUser.id) {
                      handleStartChat(member);
                    }
                  }}
                  className="flex items-center gap-3 p-2 rounded-[10px] hover:bg-[#2c2c2c] transition-colors cursor-pointer"
                >
                  <div className="w-[40px] h-[40px] rounded-full bg-gradient-to-br from-[#5fe3c8] to-[#3390ec] flex items-center justify-center font-bold text-sm text-white shrink-0 font-sans">
                    {member.displayName[0]?.toUpperCase() || 'M'}
                  </div>
                  <div className="flex-1 min-w-0 font-sans">
                    <div className="text-[14px] font-medium text-white truncate">{member.fullname || member.displayName}</div>
                    <div className="text-[12px] text-[#aaaaaa] truncate">{member.email}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : isSearching && searchQuery.trim() ? (
            <div className="space-y-1">
              <div className="px-2 py-1 text-[12px] font-semibold text-[#aaaaaa] uppercase tracking-wider">Search Results</div>
              {searchResults.length === 0 && (
                <div className="p-3 text-[14px] text-[#777777] text-center">No users found</div>
              )}
              {searchResults.map(user => (
                <div 
                  key={user._id}
                  onClick={() => handleStartChat(user)}
                  className="flex items-center justify-center lg:justify-start lg:gap-3 p-2 lg:p-3 rounded-xl cursor-pointer transition-colors hover:bg-[#2c2c2c]"
                >
                  <div className="w-[46px] h-[46px] rounded-full bg-[#3390ec] flex items-center justify-center font-bold text-lg shrink-0">
                    {user.displayName[0].toUpperCase()}
                  </div>
                  <div className="block overflow-hidden flex-1">
                    <div className="font-semibold text-[15px] truncate">{user.displayName}</div>
                    <div className="text-[14px] text-[#aaaaaa] truncate">{user.email}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            rooms.map(room => (
              <div 
                key={room.id}
                onClick={() => {
                  setActiveRoomId(room.id);
                  if (!activeCall) {
                    setIsInCall(false);
                  }
                  setShowMobileSidebar(false);
                }}
                className={`p-2 lg:p-2 cursor-pointer mb-[2px] rounded-[10px] transition-colors flex items-center gap-3 ${
                  activeRoomId === room.id 
                    ? 'bg-[#3390ec] text-white shadow-sm' 
                    : 'hover:bg-[#2c2c2c]'
                }`}
              >
                <div className={`w-[46px] h-[46px] rounded-full flex items-center justify-center shrink-0 ${activeRoomId === room.id ? 'bg-white/20' : 'bg-[#2a2a2a]'}`}>
                  {room.type === 'global' ? <Hash className="w-6 h-6" /> : <User className="w-6 h-6" />}
                </div>
                <div className="flex flex-col justify-center overflow-hidden flex-1 py-[2px]">
                  <div className="flex justify-between items-center w-full mb-0.5">
                    <div className="font-semibold text-[15px] truncate">{room.name}</div>
                    <div className={`text-[13px] whitespace-nowrap ml-2 ${activeRoomId === room.id ? 'text-white' : 'text-[#777777]'}`}>
                      {roomMetadata[room.id] ? formatTime(roomMetadata[room.id].lastMessageTime) : formatTime(room.createdAt)}
                    </div>
                  </div>
                  <div className="flex justify-between items-center w-full">
                    <div className={`text-[14px] truncate pr-2 ${activeRoomId === room.id ? 'text-white/80' : 'text-[#888888]'}`}>
                      {roomMetadata[room.id]?.lastMessage || "No messages yet"}
                    </div>
                    {unreadCounts[room.id] > 0 && (
                      <div className={`px-[6px] py-[2px] rounded-full text-[12px] font-medium min-w-[22px] text-center ${activeRoomId === room.id ? 'bg-white text-[#3390ec]' : 'bg-[#333333] text-white'}`}>
                        {unreadCounts[room.id]}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="h-[52px] border-t border-[#2a2a2a] shrink-0 bg-[#1c1c1c] flex items-center justify-around px-2">
          <button 
            type="button"
            aria-label="Members"
            onClick={() => {
              setActiveTab('members');
              setShowMobileSidebar(true);
            }}
            className={`flex flex-col items-center justify-center w-12 h-12 transition-colors outline-none ${activeTab === 'members' ? 'text-[#3390ec]' : 'text-[#777777] hover:text-white'}`}
          >
            <UserCircle className="w-6 h-6" strokeWidth={activeTab === 'members' ? 2 : 1.5} />
          </button>
          <button type="button" aria-label="Calls" className="flex flex-col items-center justify-center text-[#777777] hover:text-white transition-colors w-12 h-12 outline-none">
            <Phone className="w-6 h-6" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            aria-label="Chats"
            onClick={() => setActiveTab('chats')}
            className={`flex flex-col items-center justify-center w-12 h-12 transition-colors outline-none ${activeTab === 'chats' ? 'text-[#3390ec]' : 'text-[#777777] hover:text-white'}`}
          >
            <MessageSquare className="w-6 h-6" strokeWidth={activeTab === 'chats' ? 2 : 1.5} />
          </button>
          <button
            type="button"
            aria-label="Settings"
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center justify-center w-12 h-12 transition-colors outline-none ${activeTab === 'settings' ? 'text-[#3390ec]' : 'text-[#777777] hover:text-white'}`}
          >
            <Settings className="w-6 h-6" strokeWidth={activeTab === 'settings' ? 2 : 1.5} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'settings' ? (
        <div className={`${showMobileSidebar ? 'hidden' : 'flex'} lg:flex flex-1 w-full overflow-hidden`}>
          <SettingsPage currentUser={currentUser} onBack={() => setShowMobileSidebar(true)} onLogout={onLogout} />
        </div>
      ) : (
      <div className={`${showMobileSidebar ? 'hidden' : 'flex'} lg:flex flex-1 flex-col bg-[#0f0f0f] relative w-full`}>
        {activeRoom ? (
          <>
            {/* Content Area (Chat and PiP Video Call) */}
            <div className="flex-1 overflow-hidden relative flex flex-row w-full h-full">
              {/* Left Part: Chat Messages & Input */}
              <div className="flex-1 flex flex-col h-full relative overflow-hidden">
                {/* Header (nested inside left part) */}
                <div className="absolute top-3 left-4 right-4 flex items-center justify-between z-20 pointer-events-none">
                  <div 
                    onClick={() => setShowRoomDetails(!showRoomDetails)}
                    className="flex items-center gap-3 bg-[#1c1c1c]/90 backdrop-blur-md rounded-full pl-1.5 pr-5 py-1.5 pointer-events-auto shadow-[0_4px_20px_rgba(0,0,0,0.5)] cursor-pointer hover:bg-[#2c2c2c]/90 transition-colors"
                  >
                    <button 
                      type="button"
                      aria-label="Back to chat list"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMobileSidebar(true);
                      }}
                      className="lg:hidden w-[36px] h-[36px] rounded-full flex items-center justify-center hover:bg-[#2c2c2c] transition-colors -mr-1"
                    >
                      <ChevronLeft className="w-6 h-6 text-white" strokeWidth={1.5} />
                    </button>
                    <div className="w-[40px] h-[40px] shrink-0 rounded-full bg-[#5fe3c8] flex items-center justify-center font-bold text-sm text-[#0f0f0f]">
                      {activeRoom.name[0]?.toUpperCase() || 'R'}
                    </div>
                    <div className="flex flex-col justify-center">
                      <div className="font-medium text-[15px] leading-tight text-white mb-0.5">{activeRoom.name}</div>
                      <div className="text-[13px] text-[#aaaaaa] leading-tight">
                        {activeRoom.type === 'global' ? `${totalUsers} members` : 'last seen recently'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center bg-[#1c1c1c]/90 backdrop-blur-md rounded-full px-2 py-1 gap-1.5 pointer-events-auto shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                    <button 
                      type="button"
                      aria-label={isInCall ? 'Leave call' : 'Start video call'}
                      onClick={isInCall ? handleLeaveCall : handleStartCall}
                      title={isInCall ? 'Leave Call' : 'Video Call'}
                      className={`w-[40px] h-[40px] shrink-0 rounded-full flex items-center justify-center p-0 transition-colors ${isInCall ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'bg-transparent text-[#aaaaaa] hover:bg-[#2c2c2c] hover:text-white shadow-none'}`}
                    >
                      {isInCall ? <X className="w-5 h-5" strokeWidth={1.5} /> : <Phone className="w-5 h-5" strokeWidth={1.5} />}
                    </button>
                    <button 
                      type="button"
                      aria-label="Search in chat"
                      className="w-[40px] h-[40px] shrink-0 rounded-full flex items-center justify-center p-0 transition-colors bg-transparent text-[#aaaaaa] hover:bg-[#2c2c2c] hover:text-white shadow-none"
                    >
                      <Search className="w-5 h-5" strokeWidth={1.5} />
                    </button>
                    <button 
                      type="button"
                      aria-label="More options"
                      className="w-[40px] h-[40px] shrink-0 rounded-full flex items-center justify-center p-0 transition-colors bg-transparent text-[#aaaaaa] hover:bg-[#2c2c2c] hover:text-white shadow-none"
                    >
                      <MoreHorizontal className="w-5 h-5" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>

                {/* Messages Scroll Area */}
                <div className="flex-1 overflow-y-auto p-6 pt-24 pb-24 space-y-4">
                  {messages.map((msg, idx) => {
                    const isMe = msg.senderId === currentUser.id;
                    const showName = !isMe && (idx === 0 || messages[idx - 1].senderId !== msg.senderId);
                    
                    return (
                      <div key={msg._id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        {showName && <span className="text-[13px] font-medium text-[#5288c1] ml-3 mb-1">{msg.senderName}</span>}
                        <div className={`relative max-w-[70%] px-3.5 py-2 text-[15px] leading-relaxed shadow-[0_1px_2px_rgba(0,0,0,0.15)] ${isMe ? 'bg-[#3b719f] text-white rounded-[16px] rounded-br-none' : 'bg-[#182533] text-white rounded-[16px] rounded-bl-none'}`}>
                          {msg.text}
                          {isMe ? (
                            <svg viewBox="0 0 11 20" width="11" height="20" className="absolute -right-[10px] bottom-0 text-[#3b719f] fill-current">
                              <path d="M0,20 L11,20 C5.5,20 0.8,14.8 0,8.5 Z" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 11 20" width="11" height="20" className="absolute -left-[10px] bottom-0 text-[#182533] fill-current scale-x-[-1]">
                              <path d="M0,20 L11,20 C5.5,20 0.8,14.8 0,8.5 Z" />
                            </svg>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message Input Area */}
                <div className="absolute bottom-6 left-4 right-4 z-20 pointer-events-none">
                  <div className="relative w-full pointer-events-auto">
                    {typingUsers.length > 0 && (
                      <div className="absolute -top-6 left-4 text-[12px] text-[#aaaaaa] flex items-center gap-2">
                        <div className="flex gap-1 items-center">
                          <span className="w-1.5 h-1.5 bg-[#aaaaaa] rounded-full animate-bounce [animation-delay:0ms]" />
                          <span className="w-1.5 h-1.5 bg-[#aaaaaa] rounded-full animate-bounce [animation-delay:150ms]" />
                          <span className="w-1.5 h-1.5 bg-[#aaaaaa] rounded-full animate-bounce [animation-delay:300ms]" />
                        </div>
                        {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                      </div>
                    )}
                    <form onSubmit={handleSendMessage} className="w-full flex items-center gap-2">
                      <button 
                        type="button"
                        aria-label="Attach file"
                        className="w-[42px] h-[42px] rounded-full flex items-center justify-center shrink-0 text-[#aaaaaa] hover:text-white transition-colors p-0 shadow-[0_4px_20px_rgba(0,0,0,0.5)] bg-[#1c1c1c]/90 backdrop-blur-md hover:bg-[#2c2c2c]"
                      >
                        <Paperclip className="w-5 h-5" strokeWidth={1.5} />
                      </button>
                      
                      <div className="relative flex-1 bg-[#1c1c1c]/90 backdrop-blur-md rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                        <Input 
                          value={newMessage}
                          onChange={handleInputChange}
                          placeholder="Write a message..."
                          className="w-full h-[42px] bg-transparent border-0 rounded-full pl-4 pr-12 text-[15px] text-white focus-visible:ring-0 placeholder:text-[#777777] shadow-none"
                        />
                        <button 
                          type="button"
                          aria-label="Insert emoji"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777777] hover:text-[#aaaaaa] transition-colors"
                        >
                          <Smile className="w-6 h-6" strokeWidth={1.5} />
                        </button>
                      </div>

                      <button 
                        type={newMessage.trim() ? "submit" : "button"}
                        aria-label={newMessage.trim() ? 'Send message' : 'Record voice message'}
                        className={`w-[42px] h-[42px] rounded-full flex items-center justify-center shrink-0 transition-colors p-0 shadow-[0_4px_20px_rgba(0,0,0,0.5)] ${newMessage.trim() ? 'bg-[#3390ec] text-white hover:bg-[#2b7cb9]' : 'bg-[#1c1c1c]/90 backdrop-blur-md text-[#aaaaaa] hover:text-white hover:bg-[#2c2c2c]'}`}
                      >
                        {newMessage.trim() ? <Send className="w-5 h-5 ml-[-2px] mt-[1px]" strokeWidth={1.5} /> : <Mic className="w-5 h-5" strokeWidth={1.5} />}
                      </button>
                    </form>
                  </div>
                </div>
              </div>

              {/* Right Part: Room Details Panel */}
              {showRoomDetails && (
                <RoomDetailsPanel 
                  activeRoom={activeRoom}
                  roomMembers={roomMembers}
                  totalUsers={totalUsers}
                  currentUser={currentUser}
                  otherUser={otherUser}
                  onClose={() => setShowRoomDetails(false)}
                  onStartChat={handleStartChat}
                />
              )}
            </div>

            {/* PiP Video Call Window */}
            {isInCall && (
              <div 
                className={
                  isWatchParty
                    ? "fixed inset-0 z-[100] bg-black flex flex-col transition-all duration-300"
                    : `absolute top-[76px] right-4 w-[400px] h-[550px] bg-black rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] overflow-hidden z-50 border border-[#333333] flex flex-col ${isDragging ? '' : 'transition-all duration-300'}`
                }
                style={isWatchParty ? undefined : { transform: `translate(${pipPos.x}px, ${pipPos.y}px)` }}
              >
                {!isWatchParty && (
                  <div 
                    className="h-8 bg-[#1e1e1e] border-b border-[#333333] flex items-center justify-between px-3 shrink-0 cursor-move hover:bg-[#252525] active:cursor-grabbing"
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                  >
                    <span className="text-xs font-semibold text-[#aaaaaa] flex items-center gap-2 pointer-events-none">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                      Live Video Call
                    </span>
                    <button type="button" aria-label="Close video call" onClick={() => setIsInCall(false)} className="text-[#aaaaaa] hover:text-white transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <div className="flex-1 relative bg-zinc-950">
                  <CallRoom 
                    roomId={activeCall ? activeCall.callId : activeRoom.id} 
                    userName={currentUser.fullname || currentUser.displayName} 
                    userId={currentUser.id || currentUser._id}
                    activeCall={activeCall}
                    initialAudioId=""
                    initialVideoId=""
                    onLeave={handleLeaveCall}
                    onWatchPartyChange={setIsWatchParty}
                  />
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center flex-col text-[#aaaaaa]">
            <MessageCircle className="w-16 h-16 mb-4 opacity-50" />
            <div className="text-[15px]">Select a chat to start messaging</div>
          </div>
        )}
        {/* Outgoing Call Overlay */}
        {activeCall && activeCall.role === 'caller' && activeCall.status !== 'connected' && (
          <OutgoingCallOverlay 
            partnerName={activeCall.partnerName}
            status={activeCall.status}
            onCancel={handleCancelCall}
          />
        )}

        {/* Incoming Call Overlay */}
        {activeCall && activeCall.role === 'receiver' && activeCall.status !== 'connected' && (
          <IncomingCallOverlay 
            partnerName={activeCall.partnerName}
            onAccept={handleAcceptCall}
            onDecline={handleRejectCall}
          />
        )}
      </div>
      )}
    </div>
  );
};
