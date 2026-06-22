import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DeviceSelect } from './DeviceSelect';
import { Mic, MicOff, Video, VideoOff, Settings, Keyboard, Dice5 } from 'lucide-react';

interface PreCallLobbyProps {
  onJoin: (room: string, name: string, audioId: string, videoId: string) => void;
  defaultRoom: string;
  defaultName?: string;
}

const GENZ_NAMES = ["VibeCheck", "MainCharacter", "Bruh", "Ghosted", "SlayQueen", "CEOofYapping", "NoCap", "BratSummer", "Sigma", "RizzlyBear", "Skibidi", "W_Rizz", "Based", "TouchGrass", "Delulu"];
const generateName = () => `${GENZ_NAMES[Math.floor(Math.random() * GENZ_NAMES.length)]}_${Math.floor(Math.random() * 999)}`;

export const PreCallLobby: React.FC<PreCallLobbyProps> = ({ onJoin, defaultRoom, defaultName = '' }) => {
  const [name, setName] = useState(defaultName || generateName());
  const [room, setRoom] = useState(defaultRoom);
  const [selectedAudio, setSelectedAudio] = useState('');
  const [selectedVideo, setSelectedVideo] = useState('');
  const [stream, setStream] = useState<MediaStream | null>(null);
  
  // Local media control states (before joining)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  // Sync prop defaultRoom to internal state room
  useEffect(() => {
    if (defaultRoom) {
      setRoom(defaultRoom);
    }
  }, [defaultRoom]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioMeterRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Initialize and update camera preview
  useEffect(() => {
    let activeStream: MediaStream | null = null;

    const setupPreview = async () => {
      try {
        if (activeStream) {
          activeStream.getTracks().forEach((t) => t.stop());
        }

        const constraints: MediaStreamConstraints = {
          audio: selectedAudio ? { deviceId: { exact: selectedAudio } } : true,
          video: selectedVideo ? { deviceId: { exact: selectedVideo }, width: 640, height: 360 } : { width: 640, height: 360 },
        };

        const localStream = await navigator.mediaDevices.getUserMedia(constraints);
        activeStream = localStream;
        setStream(localStream);

        // Bind video element
        if (videoRef.current) {
          videoRef.current.srcObject = localStream;
        }

        // Toggle initial track enabled states
        localStream.getAudioTracks().forEach((track) => {
          track.enabled = isAudioEnabled;
        });
        localStream.getVideoTracks().forEach((track) => {
          track.enabled = isVideoEnabled;
        });

        // Set up Audio Context and Analyser Node for the volume meter
        if (localStream.getAudioTracks().length > 0) {
          setupAudioMeter(localStream);
        }
      } catch (err) {
        console.error('Lobby camera preview setup failed:', err);
      }
    };

    setupPreview();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [selectedAudio, selectedVideo]);

  // Re-bind video element srcObject when it remounts due to isVideoEnabled toggling
  useEffect(() => {
    if (videoRef.current && stream && isVideoEnabled) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, isVideoEnabled]);

  // Audio level analyzer loop (direct DOM update for high performance)
  const setupAudioMeter = (stream: MediaStream) => {
    try {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const drawMeter = () => {
        if (!analyserRef.current || !audioMeterRef.current) return;
        
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Calculate average volume level
        let total = 0;
        for (let i = 0; i < bufferLength; i++) {
          total += dataArray[i];
        }
        const average = total / bufferLength;
        const percent = Math.min((average / 128) * 100, 100);

        // Apply width to progress element directly
        audioMeterRef.current.style.width = `${percent}%`;
        
        animationFrameRef.current = requestAnimationFrame(drawMeter);
      };

      drawMeter();
    } catch (err) {
      console.warn('Could not initialize audio visualizer in Lobby:', err);
    }
  };

  // Toggle Video track in preview
  const toggleVideo = () => {
    if (stream) {
      const track = stream.getVideoTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setIsVideoEnabled(track.enabled);
      }
    }
  };

  // Toggle Audio track in preview
  const toggleAudio = () => {
    if (stream) {
      const track = stream.getAudioTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setIsAudioEnabled(track.enabled);
      }
    }
  };

  // Generate simple random room code (Linear style clean IDs)
  const generateRoom = () => {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const segment = () => Array.from({ length: 3 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
    setRoom(`${segment()}-${segment()}-${segment()}`);
  };

  const handleJoinCall = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!room.trim()) return;

    // Stop lobby tracks before handing control over to call room hook
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    onJoin(room.trim().toLowerCase(), name.trim(), selectedAudio, selectedVideo);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] sm:min-h-[100vh] sm:px-4 bg-[#0a0a0a] text-zinc-100 relative overflow-hidden">
      
      {/* Container */}
      <div className="w-full h-[100dvh] sm:h-auto max-w-4xl bg-[#111] border border-zinc-800/50 sm:rounded-3xl overflow-hidden shadow-2xl grid grid-cols-1 md:grid-cols-12 relative z-10">
        
        {/* Left Side: Video Preview Panel (7 Columns) */}
        <div className="md:col-span-7 p-4 sm:p-6 border-b border-zinc-800/50 md:border-b-0 md:border-r md:border-zinc-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h2 className="text-xs sm:text-sm font-semibold tracking-wide uppercase text-zinc-400">Device Testing</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={`text-zinc-400 hover:text-white ${showSettings ? 'bg-zinc-800' : ''}`}
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings className="size-4" />
              </Button>
            </div>

            {/* Video Preview Frame */}
            <div className="relative aspect-video rounded-2xl overflow-hidden bg-black border border-zinc-800/80 flex items-center justify-center">
              {isVideoEnabled ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1]"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-zinc-500">
                  <VideoOff className="size-6 sm:size-8" />
                  <span className="text-[10px] sm:text-xs">Camera stream disabled</span>
                </div>
              )}

              {/* Float indicators */}
              <div className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 bg-black/60 backdrop-blur-sm px-2 py-0.5 sm:px-2.5 sm:py-1 rounded text-[9px] sm:text-[10px] text-zinc-400 font-mono flex items-center gap-1.5 border border-zinc-800/80">
                <span className={`size-1.5 rounded-full ${isVideoEnabled ? 'bg-brand-emerald animate-pulse' : 'bg-zinc-500'}`} />
                Lobby Preview
              </div>
            </div>

            {/* Audio meter */}
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-zinc-400">
                <span className="flex items-center gap-1">
                  <Mic className="size-3" /> Audio Level
                </span>
                <span className="font-mono">{isAudioEnabled ? 'Testing' : 'Muted'}</span>
              </div>
              <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
                <div
                  ref={audioMeterRef}
                  className="h-full bg-zinc-200 transition-all duration-75"
                  style={{ width: '0%' }}
                />
              </div>
            </div>
          </div>

          {/* Toggle buttons below preview */}
          <div className="flex gap-2 mt-4 sm:mt-5 justify-center">
            <Button
              type="button"
              variant={isAudioEnabled ? 'outline' : 'destructive'}
              size="sm"
              onClick={toggleAudio}
              className={`flex-1 sm:flex-none sm:w-28 gap-1.5 h-10 sm:h-9 text-xs sm:text-sm rounded-xl transition-all ${isAudioEnabled ? 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800 text-zinc-300' : 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20'}`}
            >
              {isAudioEnabled ? <Mic className="size-3.5" /> : <MicOff className="size-3.5" />}
              {isAudioEnabled ? 'Audio' : 'Muted'}
            </Button>
            <Button
              type="button"
              variant={isVideoEnabled ? 'outline' : 'destructive'}
              size="sm"
              onClick={toggleVideo}
              className={`flex-1 sm:flex-none sm:w-32 gap-1.5 h-10 sm:h-9 text-xs sm:text-sm rounded-xl transition-all ${isVideoEnabled ? 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800 text-zinc-300' : 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20'}`}
            >
              {isVideoEnabled ? <Video className="size-3.5" /> : <VideoOff className="size-3.5" />}
              {isVideoEnabled ? 'Camera' : 'Off'}
            </Button>
          </div>
        </div>

        {/* Right Side: Join Form Panel (5 Columns) */}
        <div className="md:col-span-5 p-4 sm:p-6 flex flex-col justify-between flex-1">
          <div className="space-y-6 sm:space-y-8">
            <div className="hidden sm:block space-y-1 sm:space-y-2">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2">
                V-Call
              </h1>
              <p className="text-xs sm:text-sm text-zinc-500 font-medium">minimal, fast, peer-to-peer.</p>
            </div>

            {showSettings ? (
              // Settings sub-view
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-zinc-300">Device Hardware</h3>
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    onClick={() => setShowSettings(false)}
                    className="text-brand-cyan hover:underline text-[11px] p-0"
                  >
                    Back to Entry
                  </Button>
                </div>
                <DeviceSelect
                  onAudioChange={setSelectedAudio}
                  onVideoChange={setSelectedVideo}
                  selectedAudio={selectedAudio}
                  selectedVideo={selectedVideo}
                />
              </div>
            ) : (
              // Form view
              <form onSubmit={handleJoinCall} className="space-y-4">
                {/* Username Input */}
                <div className="space-y-2">
                  <label htmlFor="nickname" className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    Your Name
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id="nickname"
                      type="text"
                      required
                      placeholder="Enter your name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="bg-[#0a0a0a] border-zinc-800/80 focus:border-zinc-600 focus:ring-0 text-white h-12 rounded-xl text-sm"
                      maxLength={20}
                    />
                    <Button 
                      type="button" 
                      variant="outline" 
                      className="size-12 shrink-0 rounded-xl bg-[#0a0a0a] border-zinc-800/80 hover:bg-zinc-900 transition-all text-zinc-400 hover:text-white"
                      onClick={() => setName(generateName())}
                      title="Re-roll Name"
                    >
                      <Dice5 className="size-5" />
                    </Button>
                  </div>
                </div>

                {/* Room ID Input */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label htmlFor="room-id" className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                      Room Code
                    </label>
                    <Button
                      type="button"
                      variant="link"
                      size="xs"
                      onClick={generateRoom}
                      className="text-zinc-400 hover:text-white text-[10px] p-0 font-medium uppercase tracking-widest"
                    >
                      Randomize
                    </Button>
                  </div>
                  <Input
                    id="room-id"
                    type="text"
                    required
                    placeholder="e.g. abc-def-ghi"
                    value={room}
                    onChange={(e) => setRoom(e.target.value)}
                    className="bg-[#0a0a0a] border-zinc-800/80 focus:border-zinc-600 focus:ring-0 text-white h-12 rounded-xl text-sm font-mono tracking-wider"
                  />
                </div>

                {/* Join Call button */}
                <Button
                  type="submit"
                  disabled={!name.trim() || !room.trim()}
                  className="w-full bg-white hover:bg-zinc-200 text-black font-semibold h-12 mt-6 text-sm transition-all rounded-xl border-0"
                >
                  Join Room
                </Button>
              </form>
            )}
          </div>

          {/* Quick tips / shortcuts hint */}
          <div className="hidden sm:flex mt-8 md:mt-0 pt-4 border-t border-zinc-800/60 items-start gap-2 text-[10px] text-zinc-500">
            <Keyboard className="size-3.5 shrink-0 mt-0.5" />
            <span>Shortcuts: Press <kbd className="bg-zinc-800 text-zinc-400 px-1 py-0.5 rounded text-[8px] font-mono">M</kbd> to mute audio, <kbd className="bg-zinc-800 text-zinc-400 px-1 py-0.5 rounded text-[8px] font-mono">V</kbd> to toggle camera inside a call.</span>
          </div>
        </div>

      </div>
    </div>
  );
};
