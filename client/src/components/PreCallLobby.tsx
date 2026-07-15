import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Video, Mic, MicOff, VideoOff, User, Hash } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { DeviceSelect } from './DeviceSelect';

interface PreCallLobbyProps {
  onJoin: (room: string, name: string, audioId: string, videoId: string) => void;
  defaultRoom: string;
  defaultName?: string;
}

const GENZ_NAMES = [
  'VibeCheck',
  'MainCharacter',
  'Bruh',
  'Ghosted',
  'SlayQueen',
  'CEOofYapping',
  'NoCap',
  'BratSummer',
  'Sigma',
  'RizzlyBear',
  'Skibidi',
  'W_Rizz',
  'Based',
  'TouchGrass',
  'Delulu',
];

const generateName = () =>
  `${GENZ_NAMES[Math.floor(Math.random() * GENZ_NAMES.length)]}_${Math.floor(Math.random() * 999)}`;

export const PreCallLobby: React.FC<PreCallLobbyProps> = ({
  onJoin,
  defaultRoom,
  defaultName = '',
}) => {
  const [name, setName] = useState(defaultName || generateName());
  const [room, setRoom] = useState(defaultRoom);

  const [audioId, setAudioId] = useState('');
  const [videoId, setVideoId] = useState('');
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isAudioOff, setIsAudioOff] = useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  React.useEffect(() => {
    let active = true;
    const startPreview = async () => {
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
        }
        
        if (isVideoOff) {
           if (videoRef.current) videoRef.current.srcObject = null;
           return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoId ? { deviceId: { exact: videoId } } : true,
          audio: audioId ? { deviceId: { exact: audioId } } : true,
        });

        if (!active) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(console.error);
        }
      } catch (err) {
        console.error('Failed to get preview stream', err);
      }
    };
    startPreview();
    return () => {
      active = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [videoId, audioId, isVideoOff]);

  const handleJoinCall = () => {
    // If they turned it off in pre-lobby, pass empty strings or a special token.
    // For now, if they turn it off, we just let them join and CallRoom will handle it,
    // though CallRoom will initialize with the device ID. 
    onJoin(room.trim().toLowerCase(), name.trim(), isAudioOff ? '' : audioId, isVideoOff ? '' : videoId);
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#070707] px-safe text-zinc-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 size-80 -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 size-64 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 flex w-full max-w-4xl flex-col items-center">

        <div className="w-full flex flex-col md:flex-row gap-8 items-center md:items-stretch bg-zinc-900/50 p-6 md:p-8 rounded-3xl border border-white/5 backdrop-blur-xl">
          
          {/* Video Preview */}
          <div className="relative aspect-video w-full max-w-[480px] overflow-hidden rounded-2xl bg-zinc-950 shadow-2xl border border-white/10 shrink-0">
            {isVideoOff ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 bg-zinc-900/40">
                <VideoOff className="size-8 mb-2" />
                <span className="text-xs">Camera is off</span>
              </div>
            ) : (
              <video
                ref={videoRef}
                muted
                playsInline
                className="w-full h-full object-cover scale-x-[-1]"
              />
            )}
            
            {/* Overlay Controls */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3">
              <Button
                variant={isAudioOff ? "destructive" : "secondary"}
                size="icon"
                className="rounded-full shadow-lg"
                onClick={() => setIsAudioOff(!isAudioOff)}
              >
                {isAudioOff ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              </Button>
              <Button
                variant={isVideoOff ? "destructive" : "secondary"}
                size="icon"
                className="rounded-full shadow-lg"
                onClick={() => setIsVideoOff(!isVideoOff)}
              >
                {isVideoOff ? <VideoOff className="size-4" /> : <Video className="size-4" />}
              </Button>
            </div>
            
            <div className="absolute top-4 left-4 bg-black/50 px-2 py-1 rounded text-xs text-white backdrop-blur-md">
              {name} (You)
            </div>
          </div>

          {/* Controls & Join */}
          <div className="flex-1 w-full flex flex-col justify-between space-y-6">
            
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-white">Ready to join?</h2>
              
              <div className="bg-black/40 p-5 rounded-2xl border border-white/5 space-y-4">
                <DeviceSelect
                  onAudioChange={setAudioId}
                  onVideoChange={setVideoId}
                  selectedAudio={audioId}
                  selectedVideo={videoId}
                />
                
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
                    <User className="size-3.5" />
                    Display Name
                  </label>
                  <Input 
                    type="text" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    placeholder="Enter your name"
                    className="bg-zinc-900 border-zinc-800 text-zinc-200 h-9 text-xs w-full"
                    maxLength={32}
                  />
                </div>
                
                <div className="space-y-1.5 pt-4 border-t border-white/5">
                  <label className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
                    <Hash className="size-3.5" />
                    Room Name
                  </label>
                  <Input 
                    type="text" 
                    value={room} 
                    onChange={(e) => setRoom(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))} 
                    placeholder="Enter room name"
                    className="bg-zinc-900 border-zinc-800 text-zinc-200 h-9 text-xs w-full"
                    maxLength={20}
                  />
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="button"
                onClick={handleJoinCall}
                className="w-full h-12 rounded-xl border-0 bg-brand-cyan hover:bg-brand-cyan/90 text-black font-bold shadow-[0_0_20px_rgba(34,211,238,0.2)] transition-all hover:shadow-[0_0_30px_rgba(34,211,238,0.4)]"
              >
                Join Room <span className="ml-1 opacity-75 font-mono">{room}</span>
              </Button>
            </div>

          </div>
        </div>




      </div>
    </div>
  );
};
