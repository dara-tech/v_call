import React, { useEffect, useRef, useState } from 'react';
import { useWebRTC } from '../hooks/useWebRTC';
import { Toolbar } from './Toolbar';
import { Diagnostics } from './Diagnostics';
import { ChatPanel } from './ChatPanel';
import { DeviceSelect } from './DeviceSelect';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MicOff, VideoOff, Settings, Link } from 'lucide-react';

interface CallRoomProps {
  roomId: string;
  userName: string;
  userId: string;
  initialAudioId: string;
  initialVideoId: string;
  onLeave: () => void;
}

export const CallRoom: React.FC<CallRoomProps> = ({
  roomId,
  userName,
  userId,
  initialAudioId,
  initialVideoId,
  onLeave,
}) => {
  // Instantiate WebRTC Hook
  const {
    localStream,
    remoteStream,
    remotePeer,
    connectionState,
    isMuted,
    isCameraOff,
    isScreenSharing,
    chatMessages,
    stats,
    sendChatMessage,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    leaveCall,
    initLocalMedia,
  } = useWebRTC(roomId, userName, userId);

  // UI state toggles
  const [showChat, setShowChat] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeAudioId, setActiveAudioId] = useState(initialAudioId);
  const [activeVideoId, setActiveVideoId] = useState(initialVideoId);
  const [unreadCount, setUnreadCount] = useState(0);
  const [copiedLink, setCopiedLink] = useState(false);

  // Video element references
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // Initialize media devices once in call room
  useEffect(() => {
    initLocalMedia(activeAudioId, activeVideoId);
  }, [initLocalMedia, activeAudioId, activeVideoId]);

  // Bind local video stream to element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Bind remote video stream to element
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      // Explicitly call play to ensure video isn't stuck on black frame
      remoteVideoRef.current.play().catch((err) => {
        console.warn('[WebRTC] Auto-play was prevented by the browser:', err);
      });
    }
  }, [remoteStream]);

  // Handle unread messages count
  useEffect(() => {
    if (showChat) {
      setUnreadCount(0);
    } else if (chatMessages.length > 0) {
      // If last message was from remote user, increment
      const lastMsg = chatMessages[chatMessages.length - 1];
      if (lastMsg.sender === 'remote') {
        setUnreadCount((prev) => prev + 1);
      }
    }
  }, [chatMessages, showChat]);

  // Handle hardware device swaps in-call
  const handleAudioSwap = (deviceId: string) => {
    setActiveAudioId(deviceId);
    initLocalMedia(deviceId, activeVideoId);
  };

  const handleVideoSwap = (deviceId: string) => {
    setActiveVideoId(deviceId);
    initLocalMedia(activeAudioId, deviceId);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleExitRoom = () => {
    leaveCall();
    onLeave();
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-zinc-950 font-sans text-zinc-300 relative">
      
      {/* Header Bar */}
      <header className="h-14 border-b border-zinc-900 bg-zinc-950/60 px-6 flex items-center justify-between backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-bold text-white tracking-wide text-xs uppercase">V-Call</span>
          <div className="h-4 w-px bg-zinc-800" />
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono bg-zinc-900 px-2 py-0.5 border border-zinc-800 rounded text-zinc-300">
              {roomId}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleCopyLink}
              className="text-zinc-400 hover:text-white"
            >
              <Link className="size-3" />
            </Button>
            {copiedLink && <span className="text-[10px] text-brand-emerald animate-fade-in">Copied!</span>}
          </div>
        </div>

        {/* Central State / Latency Tag */}
        <div className="hidden sm:flex items-center gap-4">
          <div className="flex items-center gap-2 bg-zinc-900/60 border border-zinc-800/80 px-2.5 py-1 rounded text-[10px]">
            <span className={`size-1.5 rounded-full ${connectionState === 'connected' ? 'bg-brand-emerald animate-pulse' : 'bg-amber-500'}`} />
            <span className="font-mono text-zinc-400 uppercase">{connectionState}</span>
          </div>
          {stats.latency > 0 && (
            <div className="text-[10px] text-zinc-400">
              Latency: <span className="font-mono text-brand-emerald">{stats.latency}ms</span>
            </div>
          )}
        </div>

        {/* Header Right Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowSettings(true)}
            className="text-zinc-400 hover:text-white border border-zinc-900 bg-zinc-950"
          >
            <Settings className="size-4" />
          </Button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Video Area Grid */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 relative bg-zinc-950">
          
          {/* Main Video Panel */}
          <div className="relative w-full h-full max-w-5xl max-h-[80vh] bg-zinc-900/40 border border-zinc-900 rounded-lg overflow-hidden flex items-center justify-center">
            
            {/* Remote Stream Video */}
            {remoteStream ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              // Lobby placeholder when waiting
              <div className="flex flex-col items-center gap-4 text-center p-8 max-w-sm">
                <div className="size-12 rounded-full border border-dashed border-zinc-700 flex items-center justify-center animate-spin border-t-zinc-400" />
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-zinc-200">Waiting for peer...</h3>
                  <p className="text-xs text-zinc-500 leading-normal">
                    Share your room code <span className="font-mono bg-zinc-900 px-1 py-0.5 border border-zinc-800 rounded">{roomId}</span> with someone to start the call.
                  </p>
                </div>
              </div>
            )}

            {/* Video Overlays */}
            <div className="absolute top-4 left-4 bg-zinc-950/70 border border-zinc-800/80 px-2.5 py-1 rounded text-xs font-medium text-zinc-300 backdrop-blur-sm">
              {remotePeer ? remotePeer.userName : 'Remote User'}
            </div>

            {/* Local Video Picture-in-Picture Frame (PIP) */}
            <div className="absolute bottom-4 right-4 w-40 sm:w-48 aspect-video bg-zinc-950 border border-zinc-800 rounded-md overflow-hidden shadow-2xl transition-transform hover:scale-105 group">
              {localStream && !isCameraOff ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1]"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-zinc-600 bg-zinc-950">
                  <VideoOff className="size-5" />
                  <span className="text-[9px]">Camera disabled</span>
                </div>
              )}

              {/* Local mute icons indicators */}
              {isMuted && (
                <div className="absolute top-2 right-2 size-5 bg-brand-rose text-white flex items-center justify-center rounded-full shadow-md">
                  <MicOff className="size-3" />
                </div>
              )}

              <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded text-[8px] text-zinc-400 font-mono">
                You ({userName})
              </div>
            </div>

          </div>

          {/* Floating Call Quality Diagnostics display */}
          {showStats && (
            <div className="absolute top-6 right-6 z-20">
              <Diagnostics stats={stats} />
            </div>
          )}

          {/* Bottom Floating Control Bar */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
            <Toolbar
              isMuted={isMuted}
              isCameraOff={isCameraOff}
              isScreenSharing={isScreenSharing}
              showChat={showChat}
              showStats={showStats}
              unreadCount={unreadCount}
              onToggleMute={toggleMute}
              onToggleCamera={toggleCamera}
              onToggleScreenShare={toggleScreenShare}
              onToggleChat={() => setShowChat(!showChat)}
              onToggleStats={() => setShowStats(!showStats)}
              onLeaveCall={handleExitRoom}
            />
          </div>

        </div>

        {/* Collapsible Chat & Participants Sidebar */}
        {showChat && (
          <div className="h-full shrink-0 flex">
            <ChatPanel
              messages={chatMessages}
              remotePeer={remotePeer}
              selfName={userName}
              onSendMessage={sendChatMessage}
            />
          </div>
        )}

      </div>

      {/* Hardware Device Swapping Dialog modal */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="bg-zinc-950 border border-zinc-800 text-zinc-200 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold uppercase tracking-wider text-zinc-300">Call Settings</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <DeviceSelect
              onAudioChange={handleAudioSwap}
              onVideoChange={handleVideoSwap}
              selectedAudio={activeAudioId}
              selectedVideo={activeVideoId}
            />
          </div>
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              onClick={() => setShowSettings(false)}
              className="bg-white hover:bg-zinc-200 text-black font-semibold text-xs h-8 px-4"
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};
