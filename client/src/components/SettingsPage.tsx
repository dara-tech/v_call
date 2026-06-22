import React, { useState } from 'react';
import {
  Search, ChevronRight, Copy, Bell, Shield, Database, Zap, Monitor,
  Globe, Smile, FolderOpen, RefreshCw, Palette, User, LogOut, ChevronLeft, Check
} from 'lucide-react';
import { Input } from './ui/input';

interface SettingsPageProps {
  currentUser: any;
  onBack?: () => void;
  onLogout: () => void;
}

const settingsItems = [
  { icon: <div className="w-8 h-8 rounded-xl bg-[#6c6c6c] flex items-center justify-center"><Monitor className="w-[18px] h-[18px] text-white" strokeWidth={1.5} /></div>, label: 'General', shortcut: '' },
  { icon: <div className="w-8 h-8 rounded-xl bg-[#e53935] flex items-center justify-center"><Bell className="w-[18px] h-[18px] text-white" strokeWidth={1.5} /></div>, label: 'Notifications and Sounds', badge: '!' },
  { icon: <div className="w-8 h-8 rounded-xl bg-[#1e88e5] flex items-center justify-center"><Shield className="w-[18px] h-[18px] text-white" strokeWidth={1.5} /></div>, label: 'Privacy and Security', shortcut: '' },
  { icon: <div className="w-8 h-8 rounded-xl bg-[#43a047] flex items-center justify-center"><Database className="w-[18px] h-[18px] text-white" strokeWidth={1.5} /></div>, label: 'Data and Storage', shortcut: '' },
  { icon: <div className="w-8 h-8 rounded-xl bg-[#fb8c00] flex items-center justify-center"><Zap className="w-[18px] h-[18px] text-white" strokeWidth={1.5} /></div>, label: 'Active Sessions', count: '3' },
  { icon: <div className="w-8 h-8 rounded-xl bg-[#1565c0] flex items-center justify-center"><Palette className="w-[18px] h-[18px] text-white" strokeWidth={1.5} /></div>, label: 'Appearance', shortcut: '' },
  { icon: <div className="w-8 h-8 rounded-xl bg-[#8e24aa] flex items-center justify-center"><Globe className="w-[18px] h-[18px] text-white" strokeWidth={1.5} /></div>, label: 'Language', value: 'English' },
  { icon: <div className="w-8 h-8 rounded-xl bg-[#f4511e] flex items-center justify-center"><Smile className="w-[18px] h-[18px] text-white" strokeWidth={1.5} /></div>, label: 'Stickers and Emoji', shortcut: '' },
  { icon: <div className="w-8 h-8 rounded-xl bg-[#6f42c1] flex items-center justify-center"><FolderOpen className="w-[18px] h-[18px] text-white" strokeWidth={1.5} /></div>, label: 'Chat Folders', shortcut: '' },
  { icon: <div className="w-8 h-8 rounded-xl bg-[#00897b] flex items-center justify-center"><RefreshCw className="w-[18px] h-[18px] text-white" strokeWidth={1.5} /></div>, label: 'Update', shortcut: '' },
];

export const SettingsPage: React.FC<SettingsPageProps> = ({ currentUser,  onLogout }) => {
  const [activeSection, setActiveSection] = useState<'profile' | null>('profile');
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

  const displayName = currentUser?.displayName || 'User';
  const email = currentUser?.email || '';
  const username = '@' + displayName.toLowerCase().replace(/\s+/g, '_');

  return (
    <div className="flex w-full h-full">
      {/* Left Panel */}
      <div className={`${activeSection ? 'hidden lg:flex' : 'flex'} w-full lg:w-[320px] shrink-0 bg-[#1c1c1c] flex-col border-r border-[#2a2a2a]`}>
        {/* Header */}
        <div className="h-[60px] relative flex items-center justify-center px-4 border-b border-[#2a2a2a] shrink-0">
          <div className="font-semibold text-[15px] text-white">Settings</div>
          <button className="absolute right-4 text-[#3390ec] text-[15px] font-medium hover:text-blue-400 transition-colors">
            Edit
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#777777] pointer-events-none" strokeWidth={1.5} />
            <Input
              placeholder="Search"
              className="w-full bg-[#121212] border border-[#2c2c2c] rounded-[10px] pl-8 h-8 text-[14px] focus-visible:ring-0 placeholder:text-[#777777] text-white"
            />
          </div>
        </div>

        {/* Profile Card */}
        <div className="px-3 mb-2">
          <button
            onClick={() => setActiveSection('profile')}
            className={`w-full flex items-center gap-3 p-3 rounded-[12px] transition-colors cursor-pointer ${activeSection === 'profile' ? 'bg-[#3390ec]' : 'hover:bg-[#2c2c2c]'}`}
          >
            <div className="w-[46px] h-[46px] rounded-full bg-gradient-to-br from-[#5fe3c8] to-[#3390ec] flex items-center justify-center text-[18px] font-bold text-white shrink-0">
              {displayName[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 overflow-hidden text-left">
              <div className={`font-semibold text-[15px] truncate ${activeSection === 'profile' ? 'text-white' : 'text-white'}`}>{displayName}</div>
              <div className={`text-[13px] truncate ${activeSection === 'profile' ? 'text-white/80' : 'text-[#aaaaaa]'}`}>{email}</div>
            </div>
            <ChevronRight className={`w-4 h-4 shrink-0 ${activeSection === 'profile' ? 'text-white/60' : 'text-[#555555]'}`} strokeWidth={1.5} />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="px-3 mb-4 flex flex-col gap-1">
          <button className="flex items-center gap-3 px-3 py-2 rounded-[10px] hover:bg-[#2c2c2c] transition-colors">
            <div className="w-8 h-8 rounded-xl bg-[#3390ec] flex items-center justify-center">
              <Palette className="w-[18px] h-[18px] text-white" strokeWidth={1.5} />
            </div>
            <span className="text-[#3390ec] text-[15px]">Set Profile Color</span>
          </button>
          <button className="flex items-center gap-3 px-3 py-2 rounded-[10px] hover:bg-[#2c2c2c] transition-colors">
            <div className="w-8 h-8 rounded-xl border border-[#3390ec] flex items-center justify-center">
              <User className="w-[18px] h-[18px] text-[#3390ec]" strokeWidth={1.5} />
            </div>
            <span className="text-[#3390ec] text-[15px]">Add Account</span>
          </button>
        </div>

        {/* My Profile Button */}
        <div className="px-3 mb-4">
          <button
            onClick={() => setActiveSection('profile')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] transition-colors ${activeSection === 'profile' ? 'bg-[#3390ec] text-white' : 'bg-[#3390ec] text-white'}`}
          >
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
              <User className="w-[18px] h-[18px] text-white" strokeWidth={1.5} />
            </div>
            <span className="font-medium text-[15px]">My Profile</span>
          </button>
        </div>

        {/* Settings Items */}
        <div className="flex-1 overflow-y-auto px-3 space-y-[2px]">
          {settingsItems.map((item) => (
            <button
              key={item.label}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-[10px] hover:bg-[#2c2c2c] transition-colors"
            >
              {item.icon}
              <span className="flex-1 text-left text-[15px] text-white truncate">{item.label}</span>
              {item.badge && (
                <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-[11px] font-bold text-white">!</div>
              )}
              {item.count && (
                <span className="text-[14px] text-[#777777]">{item.count}</span>
              )}
              {item.value && (
                <span className="text-[14px] text-[#777777]">{item.value}</span>
              )}
              <ChevronRight className="w-4 h-4 shrink-0 text-[#444444]" strokeWidth={1.5} />
            </button>
          ))}
        </div>

        {/* Bottom: Log Out */}
        <div className="h-[52px] px-2 flex items-center border-t border-[#2a2a2a] shrink-0">
          <button 
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 h-10 rounded-[10px] hover:bg-[#2c2c2c] transition-colors text-red-400 outline-none cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0">
              <LogOut className="w-[18px] h-[18px] text-red-400" strokeWidth={1.5} />
            </div>
            <span className="text-[15px]">Log Out</span>
          </button>
        </div>
      </div>

      {/* Right Panel - Profile View */}
      {activeSection === 'profile' && (
        <div className="flex-1 bg-[#0f0f0f] flex flex-col overflow-y-auto">
          {/* Top bar */}
          <div className="h-[60px] flex items-center justify-between px-5 border-b border-[#2a2a2a] shrink-0">
            <button
              onClick={() => setActiveSection(null)}
              className="lg:hidden flex items-center gap-1 text-[#3390ec] hover:text-blue-400 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" strokeWidth={1.5} />
            </button>
            <div className="flex-1" />
            <button className="text-[#3390ec] text-[15px] font-medium hover:text-blue-400 transition-colors">Edit</button>
          </div>

          {/* Avatar + Name */}
          <div className="flex flex-col items-center pt-8 pb-6 px-6">
            <div className="w-[90px] h-[90px] rounded-full bg-gradient-to-br from-[#5fe3c8] to-[#3390ec] flex items-center justify-center text-[36px] font-bold text-white mb-3 shadow-[0_4px_24px_rgba(51,144,236,0.4)]">
              {displayName[0]?.toUpperCase() || 'U'}
            </div>
            <div className="font-semibold text-[20px] text-white mb-1">{displayName}</div>
            <div className="text-[14px] text-[#5fe3c8]">online</div>
          </div>

          {/* Info Fields */}
          <div className="px-5 space-y-[2px] mb-6">
            <div className="bg-[#1c1c1c] rounded-[14px] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#2a2a2a] flex items-center justify-between">
                <div>
                  <div className="text-[12px] text-[#3390ec] mb-0.5">username</div>
                  <div className="text-[15px] text-white">{username}</div>
                </div>
                <button
                  onClick={() => copyToClipboard(username, 'username')}
                  className="text-[#555555] hover:text-[#aaaaaa] transition-colors p-1"
                >
                  {copiedField === 'username' ? <Check className="w-4 h-4 text-[#5fe3c8]" /> : <Copy className="w-4 h-4" strokeWidth={1.5} />}
                </button>
              </div>
              <div className="px-4 py-3 border-b border-[#2a2a2a] flex items-center justify-between">
                <div>
                  <div className="text-[12px] text-[#3390ec] mb-0.5">bio</div>
                  <div className="text-[15px] text-[#3390ec]">VCall — Real-time messaging</div>
                </div>
                <button
                  onClick={() => copyToClipboard('VCall', 'bio')}
                  className="text-[#555555] hover:text-[#aaaaaa] transition-colors p-1"
                >
                  {copiedField === 'bio' ? <Check className="w-4 h-4 text-[#5fe3c8]" /> : <Copy className="w-4 h-4" strokeWidth={1.5} />}
                </button>
              </div>
              <div className="px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-[12px] text-[#3390ec] mb-0.5">email</div>
                  <div className="text-[15px] text-white">{email || 'Not set'}</div>
                </div>
                <button
                  onClick={() => copyToClipboard(email, 'email')}
                  className="text-[#555555] hover:text-[#aaaaaa] transition-colors p-1"
                >
                  {copiedField === 'email' ? <Check className="w-4 h-4 text-[#5fe3c8]" /> : <Copy className="w-4 h-4" strokeWidth={1.5} />}
                </button>
              </div>
            </div>
          </div>

          {/* Posts Grid */}
          <div className="px-5">
            <div className="flex gap-4 border-b border-[#2a2a2a] mb-3">
              <button className="text-[15px] text-[#3390ec] font-medium pb-2 border-b-2 border-[#3390ec]">Posts</button>
              <button className="text-[15px] text-[#777777] pb-2">Archived Posts</button>
            </div>
            <div className="grid grid-cols-3 gap-[3px] pb-10">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-[8px] bg-[#1c1c1c] flex items-center justify-center overflow-hidden relative group cursor-pointer">
                  <div className={`w-full h-full ${
                    i % 5 === 0 ? 'bg-gradient-to-br from-[#1a3a5c] to-[#0f2030]' :
                    i % 5 === 1 ? 'bg-gradient-to-br from-[#2d1b4e] to-[#1a0f2e]' :
                    i % 5 === 2 ? 'bg-gradient-to-br from-[#1a3a2a] to-[#0f2018]' :
                    i % 5 === 3 ? 'bg-gradient-to-br from-[#3a2a1a] to-[#2a1a0f]' :
                    'bg-gradient-to-br from-[#2a1a3a] to-[#1a0f2a]'
                  }`} />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  <div className="absolute bottom-1.5 left-2 flex items-center gap-1 text-white/80 text-[11px]">
                    <span>👁</span>
                    <span>{12 + i * 7}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Empty state when no section selected on desktop */}
      {!activeSection && (
        <div className="hidden lg:flex flex-1 bg-[#0f0f0f] items-center justify-center">
          <div className="text-[#444444] text-[15px]">Select a setting</div>
        </div>
      )}
    </div>
  );
};
