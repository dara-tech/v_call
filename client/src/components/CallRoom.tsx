import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useWebRTC } from '../hooks/useWebRTC';
import type { PeerState } from '../hooks/useWebRTC';
import { Toolbar } from './Toolbar';
import { ChatPanel } from './ChatPanel';
import { DeviceSelect } from './DeviceSelect';
import { WatchPartyPlayer } from './WatchPartyPlayer';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MicOff, VideoOff, Users, Bot, Hand, X, Copy, Check } from 'lucide-react';
import confetti from 'canvas-confetti';
import { Toaster } from 'sonner';

interface CallRoomProps {
  roomId: string;
  userName: string;
  userId: string;
  initialAudioId: string;
  initialVideoId: string;
  activeCall: any;
  onLeave: () => void;
  onWatchPartyChange?: (isActive: boolean) => void;
}

// Sub-component for remote peer video to handle its own stream binding
const RemotePeerVideo: React.FC<{ peer: PeerState }> = ({ peer }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isActiveSpeaker, setIsActiveSpeaker] = useState(false);
  
  const hasVideo = peer.stream && peer.stream.getVideoTracks().length > 0;
  const isAI = peer.aiState !== undefined;

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
    <div className={`relative w-full h-full bg-zinc-900/40 flex items-center justify-center overflow-hidden border-2 sm:rounded-2xl transition-all duration-300 ${isActiveSpeaker ? 'border-brand-cyan shadow-[0_0_30px_rgba(34,211,238,0.3)] ring-2 ring-brand-cyan/50 scale-[1.02] z-10' : 'border-white/5 shadow-2xl'}`}>
      {peer.stream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isAI}
          className={`w-full h-full object-cover ${(!hasVideo && isAI) ? 'hidden' : ''}`}
        />
      )}
      {!hasVideo && isAI && (
        <img src={`/avatars/${peer.info.userName.toLowerCase()}.png`} className="w-full h-full object-cover" alt={peer.info.userName} />
      )}
      {(!peer.stream || (!hasVideo && !isAI)) && (
        <div className="flex flex-col items-center justify-center text-zinc-600 gap-2">
          <div className="size-16 rounded-full bg-zinc-950 flex items-center justify-center border border-zinc-800 shadow-xl overflow-hidden">
            <Users className="size-8 text-zinc-500" />
          </div>
          {!peer.stream && <span className="text-xs">Connecting...</span>}
        </div>
      )}
      <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/40 border border-white/10 px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-semibold text-white backdrop-blur-xl z-10 shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
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
  activeCall,
  onLeave,
  onWatchPartyChange,
}) => {
  // Instantiate WebRTC Hook
  const {
    localStream,
    peers,
    isMuted,
    isCameraOff,
    isScreenSharing,
    chatMessages,
    videoSyncState,
    sendChatMessage,
    broadcastVideoState,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    isHandRaised,
    leaveCall,
    initLocalMedia,
    summonAI,
    removeAI,
  } = useWebRTC(roomId, userName, userId, activeCall);

  // UI state toggles
  const [showWatchParty, setShowWatchParty] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeAudioId, setActiveAudioId] = useState(initialAudioId);
  const [activeVideoId, setActiveVideoId] = useState(initialVideoId);

  useEffect(() => {
    onWatchPartyChange?.(showWatchParty);
  }, [showWatchParty, onWatchPartyChange]);

  // Track if AIs are in the room
  const lilyPeerId = Object.entries(peers).find(([_, p]) => p.info.userName === 'Lily')?.[0];
  const daraPeerId = Object.entries(peers).find(([_, p]) => p.info.userName === 'Dara')?.[0];

  // Video element references
  const localVideoRef = useRef<HTMLVideoElement>(null);

  // Initialize media devices once in call room
  const [isCopied, setIsCopied] = useState(false);
  const handleCopyInvite = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(roomId);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = roomId;
        textArea.style.position = "fixed";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed', err);
    }
  };

  useEffect(() => {
    initLocalMedia(activeAudioId, activeVideoId);
  }, [initLocalMedia, activeAudioId, activeVideoId]);

  // Bind local video stream to element
  useEffect(() => {
    if (localVideoRef.current && localStream && !isCameraOff) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isCameraOff]);

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
    <div className="flex flex-col flex-1 h-[100dvh] w-full overflow-hidden bg-[#0a0a0a] font-sans text-zinc-300 relative z-20">
      <Toaster theme="dark" position="top-right" />

      {/* Main Container */}
      <div className={`w-full h-full flex overflow-hidden ${showWatchParty ? 'flex-col sm:flex-row' : ''}`}>
        
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
        <div className={`relative bg-[#0a0a0a] flex flex-col transition-all duration-300 ${
          showWatchParty
            ? 'w-full h-40 sm:h-full sm:w-72 border-t sm:border-t-0 sm:border-l border-zinc-900 shrink-0 p-2 overflow-y-auto overflow-x-auto sm:overflow-x-hidden'
            : 'w-full h-full p-0 sm:p-4 overflow-y-auto'
        }`}>
          
          {hasPeers ? (
             <div className={
               showWatchParty 
                 ? "flex flex-row sm:flex-col gap-2 w-max sm:w-full h-full pb-20 sm:pb-0"
                 : `w-full h-full max-w-7xl mx-auto grid gap-4 ${gridLayoutClass} auto-rows-fr pt-16 pb-24 px-4`
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

          {/* Top Center AI Controls */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 bg-black/60 backdrop-blur-xl border border-white/10 p-1.5 rounded-full shadow-2xl pointer-events-auto transition-all">
            {!lilyPeerId ? (
               <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 text-xs font-medium transition-colors" onClick={() => summonAI('lily')}>
                 <Bot className="size-3.5" /> Lily
               </button>
            ) : (
               <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-500/20 hover:bg-red-500/20 text-cyan-400 hover:text-red-400 text-xs font-medium transition-colors group" onClick={() => removeAI(lilyPeerId)}>
                 <Bot className="size-3.5 group-hover:hidden" />
                 <X className="size-3.5 hidden group-hover:block" />
                 Lily
               </button>
            )}
            
            <div className="w-px h-4 bg-white/10 mx-1" />

            {!daraPeerId ? (
               <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-medium transition-colors" onClick={() => summonAI('dara')}>
                 <Bot className="size-3.5" /> Dara
               </button>
            ) : (
               <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 hover:bg-red-500/20 text-emerald-400 hover:text-red-400 text-xs font-medium transition-colors group" onClick={() => removeAI(daraPeerId)}>
                 <Bot className="size-3.5 group-hover:hidden" />
                 <X className="size-3.5 hidden group-hover:block" />
                 Dara
               </button>
            )}
          </div>

          {/* Local Video Picture-in-Picture Frame (PIP) */}
          <div className={`absolute z-30 overflow-hidden rounded-2xl shadow-xl transition-all duration-300 ring-2 ring-white/10 bg-zinc-950 flex flex-col items-center justify-center top-4 right-4 w-24 sm:w-32 aspect-video hover:scale-105 hover:shadow-[0_8px_32px_rgba(34,211,238,0.2)]`}>
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

            {isHandRaised && (
              <div className="absolute bottom-2 left-2 bg-black/40 backdrop-blur-xl border border-white/10 p-1.5 rounded-full shadow-md flex items-center justify-center">
                <Hand className="size-3 text-amber-400 animate-bounce" />
              </div>
            )}
          </div>

          {/* Bottom Floating Control Bar (Normal Mode) */}
          {!showWatchParty && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 w-[95%] sm:w-auto flex justify-center">
              <Toolbar
                isMuted={isMuted}
                isCameraOff={isCameraOff}
                isScreenSharing={isScreenSharing}
                showStats={showStats}
                showWatchParty={showWatchParty}
                onToggleMute={toggleMute}
                onToggleCamera={toggleCamera}
                onToggleScreenShare={toggleScreenShare}
                onToggleStats={() => setShowStats(!showStats)}
                onToggleWatchParty={() => setShowWatchParty(!showWatchParty)}
                onLeaveCall={handleExitRoom}
                onCopyInvite={handleCopyInvite}
                isCopied={isCopied}
              />
            </div>
          )}

        </div>

        {/* Right Sidebar - Dynamic Sub-pane */}
        {showStats && (
          <div className="w-full sm:w-80 border-l border-zinc-900/50 bg-zinc-950/95 sm:bg-zinc-950/80 backdrop-blur flex flex-col z-20 shrink-0 pointer-events-auto shadow-[-20px_0_40px_rgba(0,0,0,0.5)]">
            <ChatPanel
              messages={chatMessages}
              peers={peerList}
              selfName={userName}
              onSendMessage={sendChatMessage}
              onClose={() => setShowStats(false)}
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
            showStats={showStats}
            showWatchParty={showWatchParty}
            onToggleMute={toggleMute}
            onToggleCamera={toggleCamera}
            onToggleScreenShare={toggleScreenShare}
            onToggleStats={() => setShowStats(!showStats)}
            onToggleWatchParty={() => setShowWatchParty(!showWatchParty)}
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
