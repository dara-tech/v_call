import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, MediaStream } from 'react-native-webrtc';
import { useLocalMedia } from './useLocalMedia';
import { API_BASE_URL } from '../services/api';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:107.175.91.211:3478' },
  ],
};

export type PeerState = {
  socketId: string;
  userName: string;
  pc: RTCPeerConnection;
  stream: MediaStream | null;
};

export const useWebRTC = (roomId: string, userName: string, userId: string) => {
  const [peers, setPeers] = useState<Record<string, PeerState>>({});
  
  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef<Record<string, PeerState>>({});
  
  const { localStream, isMuted, isCameraOff, isMediaReady, toggleMute, toggleCamera } = useLocalMedia();

  const syncPeersState = useCallback(() => {
    setPeers({ ...peersRef.current });
  }, []);

  const createPeerConnection = useCallback((targetSocketId: string, targetUserName: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    
    peersRef.current[targetSocketId] = { socketId: targetSocketId, userName: targetUserName, pc, stream: null };
    syncPeersState();

    // @ts-expect-error: react-native-webrtc types are missing onicecandidate
    pc.onicecandidate = (event: any) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('relay-signal', { 
          targetSocketId, 
          signalData: { type: 'candidate', candidate: event.candidate } 
        });
      }
    };

    // @ts-expect-error: react-native-webrtc types are missing ontrack
    pc.ontrack = (event: any) => {
      const peer = peersRef.current[targetSocketId];
      if (peer && event.streams && event.streams[0]) {
        peer.stream = event.streams[0];
        syncPeersState();
      }
    };

    if (localStream) {
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
    }

    return pc;
  }, [localStream, syncPeersState]);

  const initiateCall = useCallback(async (targetSocketId: string, targetUserName: string) => {
    if (peersRef.current[targetSocketId]) return;

    const pc = createPeerConnection(targetSocketId, targetUserName);

    try {
      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);
      socketRef.current?.emit('relay-signal', { 
        targetSocketId, 
        signalData: { type: 'sdp-offer', sdp: offer } 
      });
    } catch (err) {
      console.error('Failed to initiate call:', err);
    }
  }, [createPeerConnection]);

  useEffect(() => {
    if (!roomId || !isMediaReady) return;

    const socket = io(API_BASE_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join-room', { roomId, userId, userName });
    });

    socket.on('all-users', (users: any[]) => {
      users.forEach((user) => {
        initiateCall(user.socketId, user.userName || 'Remote User');
      });
    });

    socket.on('signal-received', async ({ senderSocketId, signalData }) => {
      let peer = peersRef.current[senderSocketId];
      
      if (signalData.type === 'sdp-offer') {
        if (!peer) {
          createPeerConnection(senderSocketId, 'Remote User');
          peer = peersRef.current[senderSocketId];
        }
        try {
          await peer.pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          socket.emit('relay-signal', { 
            targetSocketId: senderSocketId, 
            signalData: { type: 'sdp-answer', sdp: answer } 
          });
        } catch (err) {
          console.error('Error handling offer:', err);
        }
      } else if (signalData.type === 'sdp-answer' && peer) {
        try {
          await peer.pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
        } catch (err) {
          console.error('Error handling answer:', err);
        }
      } else if (signalData.type === 'candidate' && peer) {
        try {
          await peer.pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
        } catch (err) {
          console.error('Error adding ICE candidate:', err);
        }
      }
    });

    socket.on('user-left', (leftSocketId: string) => {
      if (peersRef.current[leftSocketId]) {
        peersRef.current[leftSocketId].pc.close();
        delete peersRef.current[leftSocketId];
        syncPeersState();
      }
    });

    return () => {
      Object.values(peersRef.current).forEach((peer) => {
        peer.pc.close();
      });
      peersRef.current = {};
      socket.disconnect();
    };
  }, [roomId, userId, userName, isMediaReady, initiateCall, createPeerConnection, syncPeersState]);

  return {
    peers,
    localStream,
    isMuted,
    isCameraOff,
    isMediaReady,
    toggleMute,
    toggleCamera,
  };
};
