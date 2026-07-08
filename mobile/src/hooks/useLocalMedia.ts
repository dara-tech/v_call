import { useState, useEffect } from 'react';
import { mediaDevices, MediaStream } from 'react-native-webrtc';

export const useLocalMedia = () => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isMediaReady, setIsMediaReady] = useState(false);

  useEffect(() => {
    let stream: MediaStream;
    const initMedia = async () => {
      try {
        stream = await mediaDevices.getUserMedia({
          audio: true,
          video: {
            width: 1280,
            height: 720,
            frameRate: 30,
            facingMode: 'user',
          },
        });
        setLocalStream(stream);
        setIsMediaReady(true);
      } catch (err) {
        console.error('Failed to get local media', err);
      }
    };
    initMedia();
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
        setIsMuted(!track.enabled);
      });
    }
  };

  const toggleCamera = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
        setIsCameraOff(!track.enabled);
      });
    }
  };

  return {
    localStream,
    isMuted,
    isCameraOff,
    isMediaReady,
    toggleMute,
    toggleCamera,
  };
};
