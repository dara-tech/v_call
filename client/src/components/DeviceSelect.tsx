import React, { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Video, Mic } from 'lucide-react';

interface DeviceSelectProps {
  onAudioChange: (deviceId: string) => void;
  onVideoChange: (deviceId: string) => void;
  selectedAudio: string;
  selectedVideo: string;
}

export const DeviceSelect: React.FC<DeviceSelectProps> = ({
  onAudioChange,
  onVideoChange,
  selectedAudio,
  selectedVideo,
}) => {
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    const getDevices = async () => {
      try {
        // Request permissions first to get device names
        await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const audios = allDevices.filter((d) => d.kind === 'audioinput');
        const videos = allDevices.filter((d) => d.kind === 'videoinput');
        
        setAudioDevices(audios);
        setVideoDevices(videos);

        // Auto-select first devices if not selected
        if (!selectedAudio && audios.length > 0) {
          onAudioChange(audios[0].deviceId);
        }
        if (!selectedVideo && videos.length > 0) {
          onVideoChange(videos[0].deviceId);
        }
      } catch (err) {
        console.error('Error listing hardware devices:', err);
      }
    };

    getDevices();

    // Listen for device changes (e.g. plugging in a headset)
    navigator.mediaDevices.addEventListener('devicechange', getDevices);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', getDevices);
    };
  }, [onAudioChange, onVideoChange, selectedAudio, selectedVideo]);

  return (
    <div className="space-y-4">
      {/* Camera selection */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
          <Video className="size-3.5" />
          Camera Input
        </label>
        <Select value={selectedVideo} onValueChange={onVideoChange}>
          <SelectTrigger className="w-full bg-zinc-900 border-zinc-800 text-zinc-200 h-9 text-xs">
            <SelectValue placeholder="Select Camera" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
            {videoDevices.map((device) => (
              <SelectItem key={device.deviceId} value={device.deviceId} className="text-xs">
                {device.label || `Camera ${device.deviceId.slice(0, 5)}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Microphone selection */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
          <Mic className="size-3.5" />
          Microphone Input
        </label>
        <Select value={selectedAudio} onValueChange={onAudioChange}>
          <SelectTrigger className="w-full bg-zinc-900 border-zinc-800 text-zinc-200 h-9 text-xs">
            <SelectValue placeholder="Select Microphone" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
            {audioDevices.map((device) => (
              <SelectItem key={device.deviceId} value={device.deviceId} className="text-xs">
                {device.label || `Microphone ${device.deviceId.slice(0, 5)}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};
