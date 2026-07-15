import React, { lazy, Suspense, useEffect, useRef, useState, useMemo } from 'react';
import { useWebRTC } from '../hooks/useWebRTC';
import type { PeerState } from '../hooks/useWebRTC';
import { Toolbar } from './Toolbar';
import { ChatPanel } from './ChatPanel';
import { DeviceSelect } from './DeviceSelect';
import { WatchPartyPlayer } from './WatchPartyPlayer';
import { TvGardenErrorBoundary } from './tvgarden/TvGardenErrorBoundary';

const TvGardenPanel = lazy(() =>
  import('./tvgarden/TvGardenPanel').then((m) => ({ default: m.TvGardenPanel })),
);
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MicOff, Users, Hand, Loader2, Languages, Popcorn, Globe2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { Toaster, toast } from 'sonner';
import { AiPersonaAvatar } from './AiPersonaAvatar';
import { AiPersonaBar } from './AiPersonaBar';
import { WaitingRoomHero } from './WaitingRoomHero';
import { PERSONAS } from '../lib/ai/personas';
import type { AIPersona } from '../lib/ai/types';
import { useLiveTranslate } from '../hooks/useLiveTranslate';
import { LiveTranslatePanel } from './LiveTranslatePanel';
import { useScreenRecorder } from '../hooks/useScreenRecorder';
import { LIVE_TRANSLATE_LANGUAGES } from '../lib/ai/liveConfig';

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
const RemotePeerVideo: React.FC<{ peer: PeerState; muteForTranslate?: boolean }> = ({ peer, muteForTranslate }) => {
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
          muted={isAI || muteForTranslate}
          className={`w-full h-full object-cover ${(!hasVideo && isAI) ? 'hidden' : ''}`}
        />
      )}
      {!hasVideo && isAI && (
        <AiPersonaAvatar name={peer.info.userName} />
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
  const [watchPartyAudioStream, setWatchPartyAudioStream] = useState<MediaStream | null>(null);

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
    patchVideoState,
    addToQueue,
    removeFromQueue,
    playQueueIndex,
    playNextInQueue,
    playPreviousInQueue,
    clearQueue,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    isHandRaised,
    leaveCall,
    initLocalMedia,
    summonAI,
    removeAI,
    localSocketId,
  } = useWebRTC(roomId, userName, userId, activeCall, watchPartyAudioStream);

  const {
    isTranslateActive,
    translateTargetLanguage,
    translateState,
    translateInputLanguageCode,
    translateInputLiveText,
    translateOutputLiveText,
    translateInputHistory,
    translateOutputHistory,
    startLiveTranslate,
    stopLiveTranslate,
  } = useLiveTranslate(peers, localStream, watchPartyAudioStream);

  // UI state toggles
  const [showWatchParty, setShowWatchParty] = useState(false);
  const [showTvGarden, setShowTvGarden] = useState(false);
  const mediaOpen = showWatchParty || showTvGarden;
  const [showStats, setShowStats] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isAIFeaturesEnabled, setIsAIFeaturesEnabled] = useState(false);
  const [activeAudioId, setActiveAudioId] = useState(initialAudioId);
  const [activeVideoId, setActiveVideoId] = useState(initialVideoId);

  const toggleWatchParty = () => {
    setShowWatchParty((v) => {
      if (!v) setShowTvGarden(false);
      return !v;
    });
  };

  const toggleTvGarden = () => {
    setShowTvGarden((v) => {
      if (!v) setShowWatchParty(false);
      return !v;
    });
  };

  useEffect(() => {
    onWatchPartyChange?.(showWatchParty);
  }, [showWatchParty, onWatchPartyChange]);

  const activePersonas = useMemo(() => {
    const map: Partial<Record<AIPersona, string>> = {};
    for (const [socketId, peer] of Object.entries(peers)) {
      for (const [key, config] of Object.entries(PERSONAS)) {
        if (peer.info.userName === config.name) {
          map[key as AIPersona] = socketId;
        }
      }
    }
    return map;
  }, [peers]);

  const userInitial = useMemo(
    () => userName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'ME',
    [userName],
  );

  // Video element references
  const localVideoRef = useRef<HTMLVideoElement>(null);

  // Initialize media devices once in call room
  const [isCopied, setIsCopied] = useState(false);
  const handleCopyInvite = async () => {
    try {
      const fullUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(fullUrl);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = fullUrl;
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
    initLocalMedia(activeAudioId, activeVideoId).catch((err) => {
      console.error('Failed to access camera/microphone:', err);
      toast.error('Could not access camera or microphone. Check browser permissions.');
    });
  }, [initLocalMedia, activeAudioId, activeVideoId]);

  // Bind local video stream to element
  useEffect(() => {
    const video = localVideoRef.current;
    if (video && localStream && !isCameraOff) {
      video.srcObject = localStream;
      video.play().catch((err) => {
        console.warn('[WebRTC] Local video autoplay prevented:', err);
      });
    } else if (video) {
      video.srcObject = null;
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

  const {
    isRecording: isScreenRecording,
    durationSec: recordingDurationSec,
    startRecording,
    stopRecording,
  } = useScreenRecorder(localStream, peerList);

  const handleToggleScreenRecording = () => {
    if (isScreenRecording) stopRecording();
    else startRecording();
  };

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
    <div className="relative z-20 flex h-dvh w-full flex-col overflow-hidden bg-[#0a0a0a] font-sans text-zinc-300">
      <Toaster theme="dark" position="top-center" />

      {isScreenRecording && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-brand-rose/50 bg-brand-rose/20 px-4 py-1.5 text-xs font-semibold text-brand-rose backdrop-blur-xl">
          <span className="size-2 animate-pulse rounded-full bg-brand-rose" />
          REC {String(Math.floor(recordingDurationSec / 60)).padStart(2, '0')}:{String(recordingDurationSec % 60).padStart(2, '0')}
        </div>
      )}



      {/* Main stage */}
      <div className={`relative flex min-h-0 flex-1 overflow-hidden ${mediaOpen ? 'flex-col sm:flex-row' : ''}`}>
        {showWatchParty && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <WatchPartyPlayer
              videoSyncState={videoSyncState}
              broadcastVideoState={broadcastVideoState}
              patchVideoState={patchVideoState}
              addToQueue={addToQueue}
              removeFromQueue={removeFromQueue}
              playQueueIndex={playQueueIndex}
              playNextInQueue={playNextInQueue}
              playPreviousInQueue={playPreviousInQueue}
              clearQueue={clearQueue}
              onClose={() => setShowWatchParty(false)}
              onAudioStreamChange={setWatchPartyAudioStream}
              onStartTranslate={startLiveTranslate}
              onStopTranslate={stopLiveTranslate}
              isTranslateActive={isTranslateActive}
              translateTargetLanguage={translateTargetLanguage}
              translateState={translateState}
              translateOutputLiveText={translateOutputLiveText}
              localSocketId={localSocketId}
            />
          </div>
        )}

        {showTvGarden && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <TvGardenErrorBoundary onClose={() => setShowTvGarden(false)}>
              <Suspense
                fallback={
                  <div className="flex flex-1 items-center justify-center bg-[#050810] text-zinc-400">
                    <Loader2 className="size-6 animate-spin text-brand-cyan" />
                  </div>
                }
              >
                <TvGardenPanel embedded onClose={() => setShowTvGarden(false)} />
              </Suspense>
            </TvGardenErrorBoundary>
          </div>
        )}

        {isTranslateActive && !mediaOpen ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <LiveTranslatePanel
              inputLanguageCode={translateInputLanguageCode}
              targetLanguageCode={translateTargetLanguage}
              inputLiveText={translateInputLiveText}
              outputLiveText={translateOutputLiveText}
              inputHistory={translateInputHistory}
              outputHistory={translateOutputHistory}
              translateState={translateState}
            />
          </div>
        ) : (
        <div
          className={`relative min-h-0 bg-[#0a0a0a] ${
            mediaOpen
              ? 'hidden min-w-0 sm:flex sm:h-full sm:w-72 sm:shrink-0 sm:flex-col sm:border-l sm:border-zinc-900 sm:p-2'
              : 'flex min-w-0 flex-1 flex-col'
          }`}
        >
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            {hasPeers ? (
              <div
                className={
                  mediaOpen
                    ? 'flex h-full flex-row gap-2 overflow-x-auto pb-2 sm:flex-col sm:overflow-x-hidden sm:overflow-y-auto sm:pb-0'
                    : `mx-auto grid h-full w-full max-w-7xl auto-rows-fr gap-2 px-2 py-2 sm:gap-4 sm:px-4 sm:py-4 ${gridLayoutClass}`
                }
              >
                {peerList.map((peer) => (
                  <div
                    key={peer.info.socketId}
                    className={
                      mediaOpen
                        ? 'aspect-video w-40 shrink-0 sm:w-full'
                        : 'min-h-[180px] w-full sm:min-h-0'
                    }
                  >
                    <RemotePeerVideo peer={peer} muteForTranslate={isTranslateActive && peer.aiState === undefined} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="relative flex h-full min-h-0 w-full flex-col items-center justify-center px-safe py-6">
                {localStream && !isCameraOff ? (
                  <div className="relative aspect-video w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl">
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="h-full w-full scale-x-[-1] object-cover"
                    />
                    <div className="absolute bottom-3 left-3 rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white backdrop-blur-xl">
                      You · waiting for others
                    </div>
                  </div>
                ) : (
                  <WaitingRoomHero
                    roomId={roomId}
                    onCopyInvite={handleCopyInvite}
                    isCopied={isCopied}
                  />
                )}
                {localStream && !isCameraOff && (
                  <div className="mt-6 w-full max-w-sm">
                    <WaitingRoomHero
                      roomId={roomId}
                      onCopyInvite={handleCopyInvite}
                      isCopied={isCopied}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Local PIP — hidden while alone (main preview shown instead) */}
          <div
            className={`absolute right-3 top-3 z-30 aspect-video w-20 overflow-hidden rounded-xl bg-zinc-950 shadow-lg ring-1 ring-white/15 sm:right-4 sm:top-4 sm:w-28 sm:rounded-2xl md:w-32 ${
              !hasPeers ? 'hidden' : ''
            } ${mediaOpen || isTranslateActive ? 'hidden sm:block' : ''} ${isTranslateActive ? 'hidden' : ''}`}
          >
            {localStream && !isCameraOff ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full scale-x-[-1] object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-950">
                <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/30 to-violet-500/30 text-[10px] font-bold text-white sm:size-10 sm:text-xs">
                  {userInitial}
                </div>
              </div>
            )}

            {isMuted && (
              <div className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-brand-rose text-white shadow-md sm:right-2 sm:top-2 sm:size-5">
                <MicOff className="size-2.5 sm:size-3" />
              </div>
            )}

            {isHandRaised && (
              <div className="absolute bottom-1.5 left-1.5 flex items-center justify-center rounded-full border border-white/10 bg-black/40 p-1 backdrop-blur-xl sm:bottom-2 sm:left-2 sm:p-1.5">
                <Hand className="size-2.5 animate-bounce text-amber-400 sm:size-3" />
              </div>
            )}
          </div>
        </div>
        )}

        {/* Chat panel — full-screen overlay on mobile */}
        {showStats && (
          <div className="absolute inset-0 z-40 flex bg-zinc-950 sm:static sm:inset-auto sm:z-20 sm:w-80 sm:shrink-0 sm:border-l sm:border-zinc-900/50 sm:bg-zinc-950/80 sm:backdrop-blur">
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

      {/* Fixed bottom toolbar — always in layout flow, safe-area aware */}
      <div className="shrink-0 border-t border-zinc-900/60 bg-[#0a0a0a]/95 px-safe pb-safe pt-2 backdrop-blur-xl">
        <div className="flex justify-center">
          <Toolbar
            isMuted={isMuted}
            isCameraOff={isCameraOff}
            isScreenSharing={isScreenSharing}
            showStats={showStats}
            showWatchParty={showWatchParty}
            showTvGarden={showTvGarden}
            isTranslateActive={isTranslateActive}
            translateTargetLanguage={translateTargetLanguage}
            translateState={translateState}
            onStartLiveTranslate={startLiveTranslate}
            onStopLiveTranslate={stopLiveTranslate}
            onToggleMute={toggleMute}
            onToggleCamera={toggleCamera}
            onToggleScreenShare={toggleScreenShare}
            onToggleStats={() => setShowStats(!showStats)}
            onToggleWatchParty={toggleWatchParty}
            onToggleTvGarden={toggleTvGarden}
            onLeaveCall={handleExitRoom}
            onCopyInvite={!mediaOpen ? handleCopyInvite : undefined}
            isCopied={isCopied}
            isScreenRecording={isScreenRecording}
            recordingDurationSec={recordingDurationSec}
            onToggleScreenRecording={handleToggleScreenRecording}
            onOpenSettings={() => setShowSettings(true)}
          />
        </div>
      </div>

      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="bg-zinc-950 border border-zinc-800 text-zinc-200 sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold uppercase tracking-wider text-zinc-300">Call Settings</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-6">
            <div>
              <h3 className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Devices</h3>
              <DeviceSelect
                onAudioChange={handleAudioSwap}
                onVideoChange={handleVideoSwap}
                selectedAudio={activeAudioId}
                selectedVideo={activeVideoId}
              />
            </div>
            
            <div className="border-t border-zinc-800 pt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">AI Features</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAIFeaturesEnabled(!isAIFeaturesEnabled)}
                  className={`h-7 px-3 text-[10px] uppercase font-bold tracking-wider rounded-full transition-colors ${
                    isAIFeaturesEnabled 
                      ? 'bg-brand-cyan/20 text-brand-cyan border-brand-cyan/30 hover:bg-brand-cyan/30' 
                      : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700'
                  }`}
                >
                  {isAIFeaturesEnabled ? 'Enabled' : 'Disabled'}
                </Button>
              </div>
              
              {isAIFeaturesEnabled && (
                <div className="mt-4 bg-black/30 rounded-xl p-2 border border-white/5">
                  <p className="text-[10px] text-zinc-500 mb-2 px-1">Select an AI persona to join the call:</p>
                  <AiPersonaBar
                    activePersonas={activePersonas}
                    onSummon={summonAI}
                    onRemove={removeAI}
                    className="pb-1 pt-1"
                  />
                </div>
              )}
            </div>

            <div className="border-t border-zinc-800 pt-4">
              <h3 className="text-xs font-semibold text-zinc-400 mb-4 uppercase tracking-wide">Media & Tools</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Popcorn className="size-4 text-brand-orange" />
                    <h4 className="text-sm font-medium">Watch Party</h4>
                  </div>
                  <p className="text-xs text-zinc-500">Sync YouTube videos with everyone in the call.</p>
                  <Button
                    variant={showWatchParty ? "secondary" : "outline"}
                    className={`w-full justify-start ${showWatchParty ? 'border-brand-orange/40 bg-brand-orange/20 text-brand-orange' : ''}`}
                    onClick={() => {
                      toggleWatchParty();
                      setShowSettings(false);
                    }}
                  >
                    {showWatchParty ? 'Close Watch Party' : 'Open Watch Party'}
                  </Button>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Globe2 className="size-4 text-brand-cyan" />
                    <h4 className="text-sm font-medium">TV Garden</h4>
                  </div>
                  <p className="text-xs text-zinc-500">Watch live global IPTV channels together.</p>
                  <Button
                    variant={showTvGarden ? "secondary" : "outline"}
                    className={`w-full justify-start ${showTvGarden ? 'border-brand-cyan/40 bg-brand-cyan/20 text-brand-cyan' : ''}`}
                    onClick={() => {
                      toggleTvGarden();
                      setShowSettings(false);
                    }}
                  >
                    {showTvGarden ? 'Close TV Garden' : 'Open TV Garden'}
                  </Button>
                </div>

                <div className="space-y-3 sm:col-span-2 pt-2">
                  <div className="flex items-center gap-2">
                    <Languages className="size-4 text-violet-400" />
                    <h4 className="text-sm font-medium">Live Translate</h4>
                  </div>
                  <p className="text-xs text-zinc-500">Real-time AI voice translation. Pick a target language below:</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {LIVE_TRANSLATE_LANGUAGES.map((lang) => {
                      const isActive = isTranslateActive && translateTargetLanguage === lang.code;
                      return (
                        <Button
                          key={lang.code}
                          variant={isActive ? "secondary" : "outline"}
                          className={`text-xs h-8 ${isActive ? 'border-violet-400/40 bg-violet-400/20 text-violet-300 shadow-[0_0_10px_rgba(167,139,250,0.2)]' : 'text-zinc-400 hover:text-zinc-200'}`}
                          onClick={() => {
                            if (isActive) stopLiveTranslate();
                            else startLiveTranslate(lang.code);
                          }}
                        >
                          {lang.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>

              </div>
            </div>
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
