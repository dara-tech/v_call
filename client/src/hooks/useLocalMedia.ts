import { useState, useCallback, type MutableRefObject } from 'react';
import { applyBitrateLimits } from './useWebRTC';
import type { PeerInfo, PeerState } from './types';
import { AIParticipant } from '../lib/AIParticipant';

interface UseLocalMediaProps {
  localStreamRef: MutableRefObject<MediaStream | null>;
  peersRef: MutableRefObject<Record<string, PeerState>>;
  hostedVirtualPeersRef: MutableRefObject<Record<string, {
    info: PeerInfo;
    stream: MediaStream;
    aiInstance: AIParticipant;
    pcs: Record<string, RTCPeerConnection>;
  }>>;
}

export const useLocalMedia = ({ localStreamRef, peersRef, hostedVirtualPeersRef }: UseLocalMediaProps) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isMediaReady, setIsMediaReady] = useState(false);

  const initLocalMedia = useCallback(async (audioId?: string, videoId?: string) => {
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        audio: audioId ? { deviceId: { exact: audioId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true } : { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: videoId ? { deviceId: { exact: videoId }, width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15, max: 20 } } : { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15, max: 20 } },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      setLocalStream(stream);

      Object.values(peersRef.current).forEach((peer) => {
        if (!peer.pc) return;
        const senders = peer.pc.getSenders();
        stream.getTracks().forEach((track) => {
          const sender = senders.find((s) => s.track?.kind === track.kind);
          if (sender) sender.replaceTrack(track);
          else peer.pc.addTrack(track, stream);
        });
      });
      
      // Feed mic to AI if active
      Object.values(hostedVirtualPeersRef.current).forEach(vp => {
        vp.aiInstance.addStream(stream);
      });
      
      setIsMediaReady(true);
      return stream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      throw error;
    }
  }, [localStreamRef, peersRef, hostedVirtualPeersRef]);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, [localStreamRef]);

  const toggleScreenShare = useCallback(async () => {
    if (!localStreamRef.current) return;
    try {
      if (isScreenSharing) {
        setIsScreenSharing(false);
        const originalStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 360 } } });
        const newVideoTrack = originalStream.getVideoTracks()[0];
        const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
        if (oldVideoTrack) { localStreamRef.current.removeTrack(oldVideoTrack); oldVideoTrack.stop(); }
        localStreamRef.current.addTrack(newVideoTrack);
        Object.values(peersRef.current).forEach((peer) => {
          if (!peer.pc) return;
          const videoSender = peer.pc.getSenders().find((s) => s.track?.kind === 'video');
          if (videoSender) {
            videoSender.replaceTrack(newVideoTrack);
            applyBitrateLimits(peer.pc, false);
          }
        });
        setIsCameraOff(false);
      } else {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
          video: { frameRate: { ideal: 30 } },
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          }
        });
        const screenTrack = screenStream.getVideoTracks()[0];
        const screenAudioTrack = screenStream.getAudioTracks()[0];
        
        const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
        if (oldVideoTrack) { localStreamRef.current.removeTrack(oldVideoTrack); oldVideoTrack.stop(); }
        localStreamRef.current.addTrack(screenTrack);
        
        // If system audio was captured, replace the mic track temporarily
        if (screenAudioTrack) {
          const oldAudioTrack = localStreamRef.current.getAudioTracks()[0];
          if (oldAudioTrack) { localStreamRef.current.removeTrack(oldAudioTrack); oldAudioTrack.stop(); }
          localStreamRef.current.addTrack(screenAudioTrack);
        }

        Object.values(peersRef.current).forEach((peer) => {
          if (!peer.pc) return;
          const videoSender = peer.pc.getSenders().find((s) => s.track?.kind === 'video');
          if (videoSender) {
            videoSender.replaceTrack(screenTrack);
            applyBitrateLimits(peer.pc, true);
          }
          if (screenAudioTrack) {
            const audioSender = peer.pc.getSenders().find((s) => s.track?.kind === 'audio');
            if (audioSender) audioSender.replaceTrack(screenAudioTrack);
          }
        });
        setIsScreenSharing(true);
        screenTrack.onended = () => toggleScreenShare();
      }
    } catch (err) {
      console.error('[WebRTC] Error sharing screen:', err);
    }
  }, [isScreenSharing, localStreamRef, peersRef]);

  const toggleCamera = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        if (isScreenSharing) toggleScreenShare();
        else {
          videoTrack.enabled = !videoTrack.enabled;
          setIsCameraOff(!videoTrack.enabled);
        }
      }
    }
  }, [isScreenSharing, toggleScreenShare, localStreamRef]);

  return {
    localStream,
    setLocalStream,
    isMuted,
    setIsMuted,
    isCameraOff,
    setIsCameraOff,
    isScreenSharing,
    setIsScreenSharing,
    isMediaReady,
    setIsMediaReady,
    initLocalMedia,
    toggleMute,
    toggleCamera,
    toggleScreenShare
  };
};
