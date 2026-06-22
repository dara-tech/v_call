import React, { useState } from 'react';
import { X, Check, Copy } from 'lucide-react';

interface RoomDetailsPanelProps {
  activeRoom: any;
  roomMembers: any[];
  totalUsers: number;
  currentUser: any;
  otherUser: any;
  onClose: () => void;
  onStartChat: (user: any) => Promise<void>;
}

export const RoomDetailsPanel: React.FC<RoomDetailsPanelProps> = ({
  activeRoom,
  roomMembers,
  totalUsers,
  currentUser,
  otherUser,
  onClose,
  onStartChat,
}) => {
  const [detailsTab, setDetailsTab] = useState<'members' | 'posts'>('members');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = async (text: string, field: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <div className="absolute inset-y-0 right-0 z-30 w-full md:w-[320px] lg:relative lg:flex lg:flex-col shrink-0 bg-[#0f0f0f] border-l border-[#2a2a2a] flex flex-col overflow-hidden h-full">
      {/* Top Header inside panel */}
      <div className="h-[60px] flex items-center justify-between px-5 border-b border-[#2a2a2a] shrink-0 bg-[#0f0f0f]">
        <span className="font-semibold text-[16px] text-white">Info</span>
        <button 
          onClick={onClose}
          className="text-[#aaaaaa] hover:text-white transition-colors p-1 cursor-pointer"
        >
          <X className="w-5 h-5" strokeWidth={1.5} />
        </button>
      </div>

      {/* Scrollable details content */}
      <div className="flex-1 flex flex-col overflow-y-auto min-h-0">
        {/* Avatar + Name */}
        <div className="flex flex-col items-center pt-8 pb-6 px-6 shrink-0">
          <div className="w-[90px] h-[90px] rounded-full bg-gradient-to-br from-[#5fe3c8] to-[#3390ec] flex items-center justify-center text-[36px] font-bold text-white mb-3 shadow-[0_4px_24px_rgba(51,144,236,0.4)]">
            {activeRoom.name[0]?.toUpperCase() || 'R'}
          </div>
          <div className="font-semibold text-[20px] text-white mb-1">{activeRoom.name}</div>
          <div className="text-[14px]">
            {activeRoom.type === 'global' ? (
              <span className="text-[#5fe3c8]">{totalUsers} members</span>
            ) : activeRoom.type === 'private' ? (
              <span className="text-[#5fe3c8]">online</span>
            ) : (
              <span className="text-[#aaaaaa]">group chat</span>
            )}
          </div>
        </div>

        {/* Room Info Fields */}
        <div className="px-5 space-y-[2px] mb-6 shrink-0">
          <div className="bg-[#1c1c1c] rounded-[14px] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#2a2a2a] flex items-center justify-between">
              <div>
                <div className="text-[12px] text-[#3390ec] mb-0.5">
                  {activeRoom.type === 'private' ? 'username' : 'link'}
                </div>
                <div className="text-[15px] text-white">
                  @{activeRoom.name.toLowerCase().replace(/\s+/g, '_')}
                </div>
              </div>
              <button
                onClick={() => copyToClipboard(`@${activeRoom.name.toLowerCase().replace(/\s+/g, '_')}`, 'link')}
                className="text-[#555555] hover:text-[#aaaaaa] transition-colors p-1 cursor-pointer"
              >
                {copiedField === 'link' ? <Check className="w-4 h-4 text-[#5fe3c8]" /> : <Copy className="w-4 h-4" strokeWidth={1.5} />}
              </button>
            </div>
            
            <div className={`px-4 py-3 flex items-center justify-between ${activeRoom.type === 'private' ? 'border-b border-[#2a2a2a]' : ''}`}>
              <div>
                <div className="text-[12px] text-[#3390ec] mb-0.5">
                  {activeRoom.type === 'private' ? 'bio' : 'description'}
                </div>
                <div className="text-[15px] text-white font-normal">
                  {activeRoom.type === 'private' ? 'VCall — Real-time messaging' : 'VCall — Real-time messaging group'}
                </div>
              </div>
              <button
                onClick={() => copyToClipboard(
                  activeRoom.type === 'private' ? 'VCall — Real-time messaging' : 'VCall — Real-time messaging group',
                  'description'
                )}
                className="text-[#555555] hover:text-[#aaaaaa] transition-colors p-1 cursor-pointer"
              >
                {copiedField === 'description' ? <Check className="w-4 h-4 text-[#5fe3c8]" /> : <Copy className="w-4 h-4" strokeWidth={1.5} />}
              </button>
            </div>

            {activeRoom.type === 'private' && (
              <div className="px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-[12px] text-[#3390ec] mb-0.5">email</div>
                  <div className="text-[15px] text-white font-normal">
                    {otherUser?.email || `${activeRoom.name.toLowerCase().replace(/\s+/g, '')}@gmail.com`}
                  </div>
                </div>
                <button
                  onClick={() => copyToClipboard(
                    otherUser?.email || `${activeRoom.name.toLowerCase().replace(/\s+/g, '')}@gmail.com`,
                    'email'
                  )}
                  className="text-[#555555] hover:text-[#aaaaaa] transition-colors p-1 cursor-pointer"
                >
                  {copiedField === 'email' ? <Check className="w-4 h-4 text-[#5fe3c8]" /> : <Copy className="w-4 h-4" strokeWidth={1.5} />}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="px-5 flex-1 flex flex-col min-h-0">
          <div className="flex gap-4 border-b border-[#2a2a2a] mb-3 shrink-0">
            {activeRoom.type === 'global' ? (
              <>
                <button 
                  onClick={() => setDetailsTab('members')}
                  className={`text-[15px] font-medium pb-2 border-b-2 transition-colors cursor-pointer ${detailsTab === 'members' ? 'text-[#3390ec] border-[#3390ec]' : 'text-[#777777] border-transparent'}`}
                >
                  Members
                </button>
                <button 
                  onClick={() => setDetailsTab('posts')}
                  className={`text-[15px] font-medium pb-2 border-b-2 transition-colors cursor-pointer ${detailsTab === 'posts' ? 'text-[#3390ec] border-[#3390ec]' : 'text-[#777777] border-transparent'}`}
                >
                  Posts
                </button>
              </>
            ) : (
              <>
                <button 
                  className="text-[15px] text-[#3390ec] font-medium pb-2 border-b-2 border-[#3390ec]"
                >
                  Posts
                </button>
                <button 
                  className="text-[15px] text-[#777777] pb-2 cursor-pointer"
                >
                  Archived Posts
                </button>
              </>
            )}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto pb-10">
            {activeRoom.type === 'global' && detailsTab === 'members' ? (
              <div className="space-y-[2px]">
                {roomMembers.map((member, i) => (
                  <div 
                    key={member._id}
                    onClick={() => {
                      if (member._id !== currentUser.id) {
                        onStartChat(member);
                        onClose();
                      }
                    }}
                    className="flex items-center gap-3 p-2 rounded-[10px] hover:bg-[#2c2c2c] transition-colors cursor-pointer"
                  >
                    <div className="w-[36px] h-[36px] rounded-full bg-gradient-to-br from-[#5fe3c8] to-[#3390ec] flex items-center justify-center font-bold text-sm text-white shrink-0">
                      {member.displayName[0]?.toUpperCase() || 'M'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-medium text-white truncate">{member.displayName}</div>
                      <div className="text-[12px] truncate">
                        {member._id === currentUser.id || i % 6 === 0 ? (
                          <span className="text-[#5fe3c8]">online</span>
                        ) : (
                          <span className="text-[#aaaaaa]">offline</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-[3px]">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded-[8px] bg-[#1c1c1c] flex items-center justify-center overflow-hidden relative group cursor-pointer">
                    <div className={`w-full h-full ${
                      i % 3 === 0 ? 'bg-gradient-to-br from-[#1a3a5c] to-[#0f2030]' :
                      i % 3 === 1 ? 'bg-gradient-to-br from-[#2d1b4e] to-[#1a0f2e]' :
                      'bg-gradient-to-br from-[#1a3a2a] to-[#0f2018]'
                    }`} />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
