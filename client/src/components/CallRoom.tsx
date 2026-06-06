import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useWebRTC } from '../hooks/useWebRTC';
import type { PeerState } from '../hooks/useWebRTC';
import { Toolbar } from './Toolbar';
import { ChatPanel } from './ChatPanel';
import { DeviceSelect } from './DeviceSelect';
import { WatchPartyPlayer } from './WatchPartyPlayer';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MicOff, VideoOff, Settings, Link, Users, Sparkles, Hand } from 'lucide-react';
import confetti from 'canvas-confetti';
import { Toaster } from 'sonner';

interface CallRoomProps {
  roomId: string;
  userName: string;
  userId: string;
  initialAudioId: string;
  initialVideoId: string;
  onLeave: () => void;
}

// Sub-component for remote peer video to handle its own stream binding
const RemotePeerVideo: React.FC<{ peer: PeerState }> = ({ peer }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isActiveSpeaker, setIsActiveSpeaker] = useState(false);

  useEffect(() => {
    if (videoRef.current && peer.stream) {
      videoRef.current.srcObject = peer.stream;
      videoRef.current.play().catch((err) => {
        console.warn('[WebRTC] Auto-play was prevented by the browser:', err);
      });

      // Active Speaker Detection
      let audioCtx: AudioContext;
      let interval: number;
      try {
        audioCtx = new window.AudioContext();
        const analyser = audioCtx.createAnalyser();
        const source = audioCtx.createMediaStreamSource(peer.stream);
        source.connect(analyser);
        analyser.fftSize = 256;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        interval = window.setInterval(() => {
          analyser.getByteFrequencyData(dataArray);
          const sum = dataArray.reduce((a, b) => a + b, 0);
          const average = sum / dataArray.length;
          setIsActiveSpeaker(average > 15);
        }, 100);
      } catch (err) {}

      return () => {
        if (interval) clearInterval(interval);
        if (audioCtx && audioCtx.state !== 'closed') audioCtx.close();
      };
    }
  }, [peer.stream]);

  return (
    <div className={`relative w-full h-full bg-zinc-900/40 flex items-center justify-center overflow-hidden border-2 sm:rounded-lg shadow-lg transition-colors duration-300 ${isActiveSpeaker ? 'border-brand-emerald shadow-brand-emerald/20' : 'border-zinc-900'}`}>
      {peer.stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center justify-center text-zinc-600 gap-2">
          <div className="size-10 rounded-full bg-zinc-950 flex items-center justify-center border border-zinc-800">
            <Users className="size-5 text-zinc-500" />
          </div>
          <span className="text-xs">Connecting...</span>
        </div>
      )}
      <div className="absolute top-4 left-4 flex items-center gap-2 bg-zinc-950/70 border border-zinc-800/80 px-2.5 py-1 rounded text-xs font-medium text-zinc-300 backdrop-blur-sm z-10 shadow-sm">
        <span>{peer.info.userName}</span>
        {peer.handRaised && (
          <span className="bg-amber-400 text-black px-1.5 py-0.5 rounded ml-1 animate-bounce">
            <Hand className="size-3" />
          </span>
        )}
        {peer.aiState && (
          <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold ${
            peer.aiState === 'connected' ? 'bg-brand-emerald/20 text-brand-emerald' :
            peer.aiState === 'reconnecting' ? 'bg-amber-500/20 text-amber-500 animate-pulse' :
            peer.aiState === 'disconnected' ? 'bg-brand-rose/20 text-brand-rose' :
            'bg-brand-cyan/20 text-brand-cyan animate-pulse'
          }`}>
            {peer.aiState}
          </span>
        )}
      </div>
    </div>
  );
};

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
    peers,
    isMuted,
    isCameraOff,
    isScreenSharing,
    chatMessages,
    stats,
    videoSyncState,
    sendChatMessage,
    broadcastVideoState,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    isHandRaised,
    toggleHand,
    sendReaction,
    leaveCall,
    initLocalMedia,
    summonAI,
  } = useWebRTC(roomId, userName, userId);

  // UI state toggles
  const [showChat, setShowChat] = useState(false);
  const [showWatchParty, setShowWatchParty] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeAudioId, setActiveAudioId] = useState(initialAudioId);
  const [activeVideoId, setActiveVideoId] = useState(initialVideoId);
  const [unreadCount, setUnreadCount] = useState(0);
  const [copiedLink, setCopiedLink] = useState(false);

  // Video element references
  const localVideoRef = useRef<HTMLVideoElement>(null);

  // Initialize media devices once in call room
  useEffect(() => {
    initLocalMedia(activeAudioId, activeVideoId);
  }, [initLocalMedia, activeAudioId, activeVideoId]);

  // Bind local video stream to element
  useEffect(() => {
    if (localVideoRef.current && localStream && !isCameraOff) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isCameraOff]);

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

  // Auto-open Watch Party
  useEffect(() => {
    if (videoSyncState.url && videoSyncState.playing) {
      setShowWatchParty(true);
    }
  }, [videoSyncState.url, videoSyncState.playing]);

  // Handle Reactions via custom event
  useEffect(() => {
    const handleReaction = (e: any) => {
      const { emoji } = e.detail;
      const scalar = 2;
      const defaults = {
        spread: 360,
        ticks: 60,
        gravity: 0,
        decay: 0.96,
        startVelocity: 20,
        shapes: [confetti.shapeFromText({ text: emoji, scalar })],
        scalar
      };

      const shoot = () => {
        confetti({
          ...defaults,
          particleCount: 15,
        });
      };
      
      setTimeout(shoot, 0);
      setTimeout(shoot, 100);
      setTimeout(shoot, 200);
    };

    window.addEventListener('reaction-received', handleReaction);
    return () => window.removeEventListener('reaction-received', handleReaction);
  }, []);

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

  const peerList = Object.values(peers);
  const hasPeers = peerList.length > 0;

  // Calculate dynamic grid columns based on participant count
  const gridLayoutClass = useMemo(() => {
    const totalCount = peerList.length; 
    if (totalCount === 1) return "grid-cols-1";
    if (totalCount === 2) return "grid-cols-1 sm:grid-cols-2";
    if (totalCount <= 4) return "grid-cols-2";
    if (totalCount <= 6) return "grid-cols-2 sm:grid-cols-3";
    return "grid-cols-3 sm:grid-cols-4";
  }, [peerList.length]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-zinc-950 font-sans text-zinc-300 relative">
      <Toaster theme="dark" position="top-right" />
      
      {/* Header Bar */}
      <header className="absolute top-0 inset-x-0 h-14 border-b border-zinc-900/50 bg-gradient-to-b from-zinc-950/80 to-transparent px-4 sm:px-6 flex items-center justify-between z-30 shrink-0 pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
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
            <span className={`size-1.5 rounded-full ${stats.connectionState === 'connected' ? 'bg-brand-emerald animate-pulse' : 'bg-amber-500'}`} />
            <span className="font-mono text-zinc-400 uppercase">{hasPeers ? stats.connectionState : 'WAITING'}</span>
          </div>
          {stats.latency > 0 && (
            <div className="text-[10px] text-zinc-400">
              Latency: <span className="font-mono text-brand-emerald">{stats.latency}ms</span>
            </div>
          )}
        </div>

        {/* Header Right Controls */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={summonAI}
            className="text-brand-cyan hover:bg-brand-cyan/20 border-brand-cyan/50 bg-brand-cyan/10 gap-1.5 h-7 text-[10px] font-semibold tracking-wide uppercase px-3"
          >
            <Sparkles className="size-3" />
            Summon AI
          </Button>
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
      <div className={`flex-1 flex overflow-hidden pt-14 ${showWatchParty ? 'flex-col sm:flex-row' : ''}`}>
        
        {/* Watch Party Main Presentation Area */}
        {showWatchParty && (
          <div className="flex-1 bg-black relative z-10 flex pointer-events-auto">
            <WatchPartyPlayer 
              videoSyncState={videoSyncState}
              broadcastVideoState={broadcastVideoState}
              onClose={() => setShowWatchParty(false)}
            />
          </div>
        )}

        {/* Video Area (Grid or Sidebar) */}
        <div className={`relative bg-zinc-950 flex flex-col transition-all duration-300 ${
          showWatchParty
            ? 'w-full h-40 sm:h-full sm:w-72 border-t sm:border-t-0 sm:border-l border-zinc-900 shrink-0 p-2 overflow-y-auto overflow-x-auto sm:overflow-x-hidden'
            : 'flex-1 p-0 sm:p-4 overflow-y-auto'
        }`}>
          
          {hasPeers ? (
             <div className={
               showWatchParty 
                 ? "flex flex-row sm:flex-col gap-2 w-max sm:w-full h-full pb-20 sm:pb-0"
                 : `w-full h-full max-w-7xl mx-auto grid gap-4 ${gridLayoutClass} auto-rows-fr`
             }>
                {peerList.map((peer) => (
                  <div key={peer.info.socketId} className={showWatchParty ? "w-48 sm:w-full shrink-0 aspect-video" : "w-full h-full"}>
                    <RemotePeerVideo peer={peer} />
                  </div>
                ))}
             </div>
          ) : (
            // Lobby placeholder when waiting
            <div className={`w-full h-full flex flex-col items-center justify-center ${showWatchParty ? 'opacity-50 scale-75' : ''}`}>
              <div className="flex flex-col items-center gap-4 text-center p-8 max-w-sm">
                <div className="size-12 rounded-full border border-dashed border-zinc-700 flex items-center justify-center animate-spin border-t-zinc-400" />
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-zinc-200">Waiting for participants...</h3>
                  <p className="text-xs text-zinc-500 leading-normal">
                    Share your room code <span className="font-mono bg-zinc-900 px-1 py-0.5 border border-zinc-800 rounded">{roomId}</span> with someone to start the group call.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Local Video Picture-in-Picture Frame (PIP) */}
          <div className={`absolute z-30 bg-zinc-950 border border-zinc-800 rounded-md overflow-hidden shadow-2xl pointer-events-auto transition-all ${
            showWatchParty
              ? 'bottom-2 right-2 w-32 aspect-video hidden sm:block' // smaller PIP in sidebar mode
              : 'bottom-20 sm:bottom-24 right-4 w-24 sm:w-48 aspect-video hover:scale-105'
          }`}>
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

            <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded text-[8px] text-zinc-400 font-mono flex items-center gap-1">
              You ({userName})
              {isHandRaised && <Hand className="size-2 text-amber-400 animate-bounce" />}
            </div>
          </div>

          {/* Bottom Floating Control Bar (Normal Mode) */}
          {!showWatchParty && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40">
              <Toolbar
                isMuted={isMuted}
                isCameraOff={isCameraOff}
                isScreenSharing={isScreenSharing}
                showChat={showChat}
                showStats={showStats}
                showWatchParty={showWatchParty}
                unreadCount={unreadCount}
                isHandRaised={isHandRaised}
                onToggleMute={toggleMute}
                onToggleCamera={toggleCamera}
                onToggleScreenShare={toggleScreenShare}
                onToggleChat={() => setShowChat(!showChat)}
                onToggleStats={() => setShowStats(!showStats)}
                onToggleWatchParty={() => setShowWatchParty(!showWatchParty)}
                onToggleHand={toggleHand}
                onSendReaction={sendReaction}
                onLeaveCall={handleExitRoom}
              />
            </div>
          )}

        </div>

        {/* Collapsible Chat & Participants Sidebar */}
        {showChat && (
          <div className="absolute inset-0 sm:relative z-50 sm:z-20 h-full w-full sm:w-[360px] shrink-0 flex pointer-events-auto border-l border-zinc-900">
            <ChatPanel
              messages={chatMessages}
              peers={peerList}
              selfName={userName}
              onSendMessage={sendChatMessage}
              onClose={() => setShowChat(false)}
            />
          </div>
        )}

      </div>

      {/* Floating Control Bar (Presentation Mode - Anchored to entire screen) */}
      {showWatchParty && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 sm:-translate-x-[calc(50%+9rem)] z-50 pointer-events-auto transition-all">
          <Toolbar
            isMuted={isMuted}
            isCameraOff={isCameraOff}
            isScreenSharing={isScreenSharing}
            showChat={showChat}
            showStats={showStats}
            showWatchParty={showWatchParty}
            unreadCount={unreadCount}
            isHandRaised={isHandRaised}
            onToggleMute={toggleMute}
            onToggleCamera={toggleCamera}
            onToggleScreenShare={toggleScreenShare}
            onToggleChat={() => setShowChat(!showChat)}
            onToggleStats={() => setShowStats(!showStats)}
            onToggleWatchParty={() => setShowWatchParty(!showWatchParty)}
            onToggleHand={toggleHand}
            onSendReaction={sendReaction}
            onLeaveCall={handleExitRoom}
          />
        </div>
      )}

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
