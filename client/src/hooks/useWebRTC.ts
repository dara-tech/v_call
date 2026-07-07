import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { AIParticipant } from '../lib/AIParticipant';
import { toast } from 'sonner';
import { useLocalMedia } from './useLocalMedia';
import { useChatDataChannel } from './useChatDataChannel';
import { useAIParticipantManager } from './useAIParticipantManager';

import { apiUrl, SIGNALING_SERVER } from '../lib/serverConfig';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:107.175.91.211:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    {
      urls: [
        'turn:107.175.91.211:3478',
        'turn:107.175.91.211:3478?transport=tcp'
      ],
      username: 'vcall_user',
      credential: 'vcall_password'
    }
  ],
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

export function preferOpusHd(sdp: string): string {
  const lines = sdp.split('\r\n');
  let opusPayloadType: string | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('opus/48000/2')) {
      const match = lines[i].match(/a=rtpmap:(\d+) opus/);
      if (match) {
        opusPayloadType = match[1];
        break;
      }
    }
  }
  
  if (!opusPayloadType) return sdp;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(`a=fmtp:${opusPayloadType}`)) {
      let fmtp = lines[i];
      if (!fmtp.includes('stereo=1')) fmtp += ';stereo=1';
      if (!fmtp.includes('sprop-stereo=1')) fmtp += ';sprop-stereo=1';
      if (!fmtp.includes('maxaveragebitrate=')) fmtp += ';maxaveragebitrate=64000';
      if (!fmtp.includes('useinbandfec=1')) fmtp += ';useinbandfec=1';
      if (!fmtp.includes('minptime=')) fmtp += ';minptime=10';
      if (!fmtp.includes('maxptime=')) fmtp += ';maxptime=20';
      
      lines[i] = fmtp;
      break;
    }
  }
  
  return lines.join('\r\n');
}

export function applyBitrateLimits(pc: RTCPeerConnection, isScreenSharing: boolean = false) {
  setTimeout(() => {
    pc.getSenders().forEach((sender) => {
      if (sender.track && sender.track.kind === 'video') {
        try {
          const parameters = sender.getParameters();
          if (!parameters.encodings) {
            parameters.encodings = [{}];
          }
          parameters.encodings[0].maxBitrate = isScreenSharing ? 3000000 : 500000;
          sender.setParameters(parameters).catch(() => {});
        } catch (e) {}
      }
    });
  }, 1000);
}

import type { PeerInfo, PeerState, CallStats } from './types';
export type { PeerInfo, PeerState, ChatMessage, VideoSyncState, CallStats } from './types';

export const useWebRTC = (roomId: string, userName: string, userId: string, activeCall?: any, watchPartyStream: MediaStream | null = null) => {
  const [peers, setPeers] = useState<Record<string, PeerState>>({});
  const [isHandRaised, setIsHandRaised] = useState(false);
  
  const [stats, setStats] = useState<CallStats>({
    latency: 0, bitrateIn: 0, bitrateOut: 0, packetLoss: 0, fps: 0, resolution: '0x0', connectionState: 'new',
  });

  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef<Record<string, PeerState>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const statsIntervalRef = useRef<number | null>(null);
  const iceServersRef = useRef<RTCConfiguration>(ICE_SERVERS);
  
  const hostedVirtualPeersRef = useRef<Record<string, {
    info: PeerInfo;
    stream: MediaStream;
    aiInstance: AIParticipant;
    pcs: Record<string, RTCPeerConnection>;
  }>>({});
  
  const prevBytesReceived = useRef<Record<string, number>>({});
  const prevBytesSent = useRef<Record<string, number>>({});
  const prevTimestamp = useRef<number>(0);

  const syncPeersState = useCallback(() => {
    setPeers({ ...peersRef.current });
  }, []);

  // Use separated hooks
  const { 
    localStream, isMuted, isCameraOff, isScreenSharing, isMediaReady,
    initLocalMedia, toggleMute, toggleCamera, toggleScreenShare, setLocalStream, setIsMuted, setIsCameraOff, setIsScreenSharing
  } = useLocalMedia({ localStreamRef, peersRef, hostedVirtualPeersRef });

  const {
    chatMessages, setChatMessages, videoSyncState,
    setupDataChannel, sendChatMessage, broadcastVideoState
  } = useChatDataChannel({ userName, peersRef, hostedVirtualPeersRef, syncPeersState });

  const { summonAI, removeAI } = useAIParticipantManager({
    roomId, socketRef, peersRef, hostedVirtualPeersRef, localStreamRef, syncPeersState, toggleScreenShare, watchPartyStream
  });

  const createPeerConnection = useCallback((targetInfo: PeerInfo): RTCPeerConnection => {
    const { socketId: targetSocketId, userName: targetUserName } = targetInfo;
    const pc = new RTCPeerConnection(iceServersRef.current);
    
    peersRef.current[targetSocketId] = { info: targetInfo, pc, stream: null, dataChannel: null };
    syncPeersState();

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') handleIceRestart(targetSocketId);
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') handleIceRestart(targetSocketId);
    };

    pc.ontrack = (event) => {
      const peer = peersRef.current[targetSocketId];
      if (peer) {
        const streams = event.streams;
        if (streams && streams[0]) {
          peer.stream = new MediaStream(streams[0].getTracks());
        } else {
          const stream = peer.stream || new MediaStream();
          stream.addTrack(event.track);
          peer.stream = new MediaStream(stream.getTracks());
        }
        syncPeersState();
        
        Object.values(hostedVirtualPeersRef.current).forEach(vp => {
          if (peer.stream) vp.aiInstance.addStream(peer.stream);
        });
      }
    };

    pc.ondatachannel = (e) => setupDataChannel(e.channel, targetSocketId, targetUserName);

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('relay-signal', { targetSocketId, signalData: { type: 'candidate', candidate: event.candidate } });
      }
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current!));
    }

    applyBitrateLimits(pc);
    return pc;
  }, [syncPeersState, setupDataChannel]);

  const initiateCall = useCallback(async (targetInfo: PeerInfo) => {
    try {
      if (peersRef.current[targetInfo.socketId]) return;

      const pc = createPeerConnection(targetInfo);
      const dataChannel = pc.createDataChannel('chat-channel');
      setupDataChannel(dataChannel, targetInfo.socketId, targetInfo.userName);

      const offer = await pc.createOffer();
      const hdOffer = { type: offer.type, sdp: preferOpusHd(offer.sdp || '') };
      await pc.setLocalDescription(hdOffer);

      socketRef.current?.emit('relay-signal', { targetSocketId: targetInfo.socketId, signalData: { type: 'sdp-offer', sdp: hdOffer } });
    } catch (error) {}
  }, [createPeerConnection, setupDataChannel]);

  const handleIceRestart = async (targetSocketId: string) => {
    const peer = peersRef.current[targetSocketId];
    if (!peer || !peer.pc) return;
    try {
      const offer = await peer.pc.createOffer({ iceRestart: true });
      const hdOffer = { type: offer.type, sdp: preferOpusHd(offer.sdp || '') };
      await peer.pc.setLocalDescription(hdOffer);
      socketRef.current?.emit('relay-signal', { targetSocketId, signalData: { type: 'sdp-offer', sdp: hdOffer } });
    } catch (err) {}
  };

  const startDiagnostics = useCallback(() => {
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    statsIntervalRef.current = window.setInterval(async () => {
      const allPeers = Object.values(peersRef.current);
      if (allPeers.length === 0) return;
      let totalLatency = 0, totalBitrateIn = 0, totalBitrateOut = 0, maxPacketLoss = 0, minFps = 60, resolution = '0x0', activeConnections = 0;
      let overallConnectionState = 'new';

      for (const peer of allPeers) {
        const pc = peer.pc;
        if (!pc || pc.connectionState !== 'connected') continue;
        overallConnectionState = pc.iceConnectionState;
        activeConnections++;
        const targetSocketId = peer.info.socketId;

        try {
          const reports = await pc.getStats();
          reports.forEach((report) => {
            const delta = (report.timestamp - prevTimestamp.current) / 1000;
            if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.currentRoundTripTime) totalLatency += Math.round(report.currentRoundTripTime * 1000);
            if (report.type === 'inbound-rtp' && report.kind === 'video') {
              maxPacketLoss = Math.max(maxPacketLoss, report.packetsLost || 0);
              minFps = Math.min(minFps, Math.round(report.framesPerSecond || 60));
              resolution = `${report.frameWidth || 0}x${report.frameHeight || 0}`;
              if (delta > 0 && report.bytesReceived !== undefined) {
                totalBitrateIn += Math.round(((report.bytesReceived - (prevBytesReceived.current[targetSocketId] || 0)) * 8) / 1000 / delta);
                prevBytesReceived.current[targetSocketId] = report.bytesReceived;
              }
            }
            if (report.type === 'outbound-rtp' && report.kind === 'video') {
              if (delta > 0 && report.bytesSent !== undefined) {
                totalBitrateOut += Math.round(((report.bytesSent - (prevBytesSent.current[targetSocketId] || 0)) * 8) / 1000 / delta);
                prevBytesSent.current[targetSocketId] = report.bytesSent;
              }
            }
          });
        } catch (err) {}
      }
      prevTimestamp.current = Date.now();
      if (activeConnections > 0) {
        setStats({ latency: Math.round(totalLatency / activeConnections), bitrateIn: totalBitrateIn >= 0 ? totalBitrateIn : 0, bitrateOut: totalBitrateOut >= 0 ? totalBitrateOut : 0, packetLoss: maxPacketLoss, fps: minFps === 60 ? 0 : minFps, resolution, connectionState: overallConnectionState as any });
      }
    }, 1000);
  }, []);

  const cleanUpPC = useCallback(() => {
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    statsIntervalRef.current = null;

    Object.values(peersRef.current).forEach((peer) => {
      if (peer.pc) peer.pc.close();
      if (peer.dataChannel) peer.dataChannel.close();
    });
    
    Object.values(hostedVirtualPeersRef.current).forEach(vp => {
      Object.values(vp.pcs).forEach(pc => pc.close());
      vp.aiInstance.disconnect();
    });

    peersRef.current = {};
    hostedVirtualPeersRef.current = {};
    syncPeersState();
    setChatMessages([]);
  }, [syncPeersState, setChatMessages]);

  const leaveCall = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }
    cleanUpPC();
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setIsMuted(false);
    setIsCameraOff(false);
    setIsScreenSharing(false);
  }, [cleanUpPC, setLocalStream, setIsMuted, setIsCameraOff, setIsScreenSharing]);

  const toggleHand = useCallback(() => {
    setIsHandRaised((prev) => {
      const nextState = !prev;
      if (socketRef.current && roomId) {
        socketRef.current.emit('toggle-hand', { roomId, socketId: socketRef.current.id, handRaised: nextState });
      }
      if (nextState) toast('You raised your hand', { icon: '✋' });
      return nextState;
    });
  }, [roomId]);

  const sendReaction = useCallback((emoji: string) => {
    if (socketRef.current && roomId) {
      socketRef.current.emit('reaction', { roomId, socketId: socketRef.current.id, emoji });
      window.dispatchEvent(new CustomEvent('reaction-received', { detail: { socketId: 'local', emoji } }));
      toast(`You reacted`, { icon: emoji, duration: 2500 });
    }
  }, [roomId]);

  useEffect(() => {
    fetch(apiUrl('/api/calls/turn-credentials'))
      .then(async (res) => {
        if (!res.ok) {
          console.warn(`TURN credentials unavailable (${res.status}); using default ICE servers`);
          return null;
        }
        return res.json();
      })
      .then(data => {
        if (data?.iceServers && Array.isArray(data.iceServers)) {
          iceServersRef.current = {
            iceServers: [...(ICE_SERVERS.iceServers || []), ...data.iceServers],
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require'
          };
        }
      })
      .catch(err => console.error("Failed to fetch dynamic TURN credentials", err));

    return () => {
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!roomId || !isMediaReady) return;

    const socket = io(SIGNALING_SERVER);
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join-room', { roomId, userId, userName });

      if (activeCall && activeCall.role === 'caller' && activeCall.partnerId) {
        setTimeout(() => {
          const partnerId = activeCall.partnerId;
          const isAlreadyPeer = Object.keys(peersRef.current).includes(partnerId) || 
                                Object.values(peersRef.current).some(p => p.info.userId === partnerId);
          if (!isAlreadyPeer) {
            initiateCall({
              socketId: partnerId,
              userId: partnerId,
              userName: activeCall.partnerName || 'Remote User'
            });
          }
        }, 1000);
      }
    });

    socket.on('all-users', (users: PeerInfo[]) => {
      users.forEach((user) => initiateCall(user));
    });

    socket.on('signal-received', async ({ senderSocketId, signalData, targetVirtualId }) => {
      if (targetVirtualId) {
        const vp = hostedVirtualPeersRef.current[targetVirtualId];
        if (!vp) return;

        let pc = vp.pcs[senderSocketId];
        if (signalData.type === 'sdp-offer') {
          if (!pc) {
            pc = new RTCPeerConnection(iceServersRef.current);
            vp.pcs[senderSocketId] = pc;
            vp.stream.getTracks().forEach(track => pc.addTrack(track, vp.stream));
            pc.onicecandidate = (event) => {
              if (event.candidate) {
                socket.emit('relay-signal', { targetSocketId: senderSocketId, virtualSenderId: targetVirtualId, signalData: { type: 'candidate', candidate: event.candidate } });
              }
            };
          }
          await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('relay-signal', { targetSocketId: senderSocketId, virtualSenderId: targetVirtualId, signalData: { type: 'sdp-answer', sdp: answer } });
        } else if (signalData.type === 'candidate' && pc) {
          await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
        }
        return;
      }

      let peer = peersRef.current[senderSocketId];
      if (signalData.type === 'sdp-offer') {
        if (!peer) {
          const targetInfo = { socketId: senderSocketId, userId: senderSocketId, userName: 'Remote User' };
          createPeerConnection(targetInfo);
          peer = peersRef.current[senderSocketId];
        }
        try {
          await peer.pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
          const answer = await peer.pc.createAnswer();
          const hdAnswer = { type: answer.type, sdp: preferOpusHd(answer.sdp || '') };
          await peer.pc.setLocalDescription(hdAnswer);
          socket.emit('relay-signal', { targetSocketId: senderSocketId, signalData: { type: 'sdp-answer', sdp: hdAnswer } });
          startDiagnostics();
        } catch (err) {}
      } else if (signalData.type === 'sdp-answer' && peer?.pc && peer.pc.signalingState !== 'stable') {
        try {
          await peer.pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
          startDiagnostics();
        } catch (err) {}
      } else if (signalData.type === 'candidate' && peer?.pc) {
        try { await peer.pc.addIceCandidate(new RTCIceCandidate(signalData.candidate)); } catch (err) {}
      }
    });

    socket.on('user-left', ({ socketId }) => {
      const peer = peersRef.current[socketId];
      if (peer) {
        if (peer.pc) peer.pc.close();
        if (peer.dataChannel) peer.dataChannel.close();
        delete peersRef.current[socketId];
        syncPeersState();
      }
    });

    socket.on('user-joined', (user: PeerInfo) => {
      if (user.socketId && user.socketId !== socket.id) {
        initiateCall(user);
      }
    });

    socket.on('toggle-hand', ({ socketId, handRaised }) => {
      const peer = peersRef.current[socketId];
      if (peer) {
        peer.handRaised = handRaised;
        syncPeersState();
        if (handRaised) toast(`${peer.info.userName} raised their hand`, { icon: '✋' });
      }
    });

    socket.on('reaction', ({ socketId, emoji }) => {
      const peer = peersRef.current[socketId];
      if (peer) toast(`${peer.info.userName} reacted`, { icon: emoji, duration: 2500 });
      window.dispatchEvent(new CustomEvent('reaction-received', { detail: { socketId, emoji } }));
    });

    let aiCanvasCtx: CanvasRenderingContext2D | null = null;
    socket.on('ai-browser-frame', ({ base64Data }) => {
      const screenId = `ai_screen_browser`;
      
      if (!peersRef.current[screenId]) {
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        aiCanvasCtx = canvas.getContext('2d');
        const stream = canvas.captureStream(30);
        
        const info = { socketId: screenId, userId: screenId, userName: "AI's Browser" };
        peersRef.current[screenId] = { info, stream, pc: null as any, dataChannel: null, aiState: 'connected' };
        syncPeersState();
      }
      
      if (aiCanvasCtx) {
        const img = new Image();
        img.onload = () => aiCanvasCtx!.drawImage(img, 0, 0, 1280, 720);
        img.src = 'data:image/jpeg;base64,' + base64Data;
      }
      
      Object.values(hostedVirtualPeersRef.current).forEach(vp => {
        if (peersRef.current[screenId] && peersRef.current[screenId].stream) {
          vp.aiInstance.addStream(peersRef.current[screenId].stream);
        }
      });
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      cleanUpPC();
    };
  }, [roomId, isMediaReady, userId, userName, createPeerConnection, initiateCall, cleanUpPC, startDiagnostics, syncPeersState]);

  useEffect(() => {
    if (!videoSyncState.url) return;
    Object.values(hostedVirtualPeersRef.current).forEach(vp => {
      if (vp.aiInstance && vp.aiInstance.getState() === 'connected') {
        const timeStr = Math.floor(videoSyncState.playedSeconds / 60) + ':' + Math.floor(videoSyncState.playedSeconds % 60).toString().padStart(2, '0');
        vp.aiInstance.sendSystemContext(`The group is currently having a Watch Party. We are watching the video at URL: ${videoSyncState.url}. The video is currently ${videoSyncState.playing ? 'playing' : 'paused'} at timestamp ${timeStr}.`);
      }
    });
  }, [videoSyncState.url, videoSyncState.playing, Math.floor(videoSyncState.playedSeconds / 10)]);

  // Dynamically feed/remove Watch Party stream from all running AIs
  useEffect(() => {
    Object.values(hostedVirtualPeersRef.current).forEach(vp => {
      if (vp.aiInstance) {
        if (watchPartyStream) {
          vp.aiInstance.addStream(watchPartyStream);
        }
      }
    });

    return () => {
      if (watchPartyStream) {
        Object.values(hostedVirtualPeersRef.current).forEach(vp => {
          if (vp.aiInstance) {
            vp.aiInstance.removeStream(watchPartyStream);
          }
        });
      }
    };
  }, [watchPartyStream]);

  return {
    localStream, peers, isMuted, isCameraOff, isScreenSharing, chatMessages, stats, videoSyncState,
    isHandRaised, sendChatMessage, broadcastVideoState, toggleMute, toggleCamera, toggleScreenShare, toggleHand, sendReaction, leaveCall, initLocalMedia,
    summonAI, removeAI
  };
};
