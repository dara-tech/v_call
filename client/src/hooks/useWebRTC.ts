import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { AIParticipant, PERSONAS, type AIPersona } from '../lib/AIParticipant';
import { toast } from 'sonner';

const SIGNALING_SERVER = import.meta.env.VITE_SIGNALING_SERVER || "http://localhost:5002";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:107.175.91.211:3478' }, // Custom STUN server
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

function preferOpusHd(sdp: string): string {
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

function applyBitrateLimits(pc: RTCPeerConnection, isScreenSharing: boolean = false) {
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

export interface PeerInfo {
  socketId: string;
  userId: string;
  userName: string;
}

export interface PeerState {
  info: PeerInfo;
  stream: MediaStream | null;
  pc: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  aiState?: string;
  handRaised?: boolean;
}

export interface ChatMessage {
  id: string;
  sender: 'self' | 'remote';
  senderName: string;
  text: string;
  timestamp: Date;
}

export interface VideoSyncState {
  url: string | null;
  playing: boolean;
  playedSeconds: number;
  timestamp: number;
}

export interface CallStats {
  latency: number;
  bitrateIn: number;
  bitrateOut: number;
  packetLoss: number;
  fps: number;
  resolution: string;
  connectionState: RTCIceConnectionState | 'disconnected';
}

export const useWebRTC = (roomId: string, userName: string, userId: string, activeCall?: any, socketProp?: any) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<Record<string, PeerState>>({});
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isMediaReady, setIsMediaReady] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [videoSyncState, setVideoSyncState] = useState<VideoSyncState>({ url: null, playing: false, playedSeconds: 0, timestamp: Date.now() });
  const [stats, setStats] = useState<CallStats>({
    latency: 0, bitrateIn: 0, bitrateOut: 0, packetLoss: 0, fps: 0, resolution: '0x0', connectionState: 'new',
  });

  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef<Record<string, PeerState>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const statsIntervalRef = useRef<number | null>(null);
  const iceServersRef = useRef<RTCConfiguration>(ICE_SERVERS);
  
  // Track Virtual AI Peers hosted by this client
  const hostedVirtualPeersRef = useRef<Record<string, {
    info: PeerInfo;
    stream: MediaStream;
    aiInstance: AIParticipant;
    pcs: Record<string, RTCPeerConnection>; // connection from virtual peer to remote peers
  }>>({});
  
  const prevBytesReceived = useRef<Record<string, number>>({});
  const prevBytesSent = useRef<Record<string, number>>({});
  const prevTimestamp = useRef<number>(0);

  const syncPeersState = useCallback(() => {
    setPeers({ ...peersRef.current });
  }, []);

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
  }, []);

  const setupDataChannel = (channel: RTCDataChannel, targetSocketId: string, remoteUserName: string) => {
    if (peersRef.current[targetSocketId]) {
      peersRef.current[targetSocketId].dataChannel = channel;
      syncPeersState();
    }

    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'chat') {
          setChatMessages((prev) => [
            ...prev,
            { id: data.id || Math.random().toString(36).substr(2, 9), sender: 'remote', senderName: remoteUserName || 'Remote', text: data.text, timestamp: new Date() },
          ]);
        } else if (data.type === 'video-sync') {
          setVideoSyncState(data.state);
        }
      } catch (err) {}
    };
  };

  const sendChatMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;
    const msgId = Math.random().toString(36).substr(2, 9);
    const messagePayload = { type: 'chat', id: msgId, text };

    setChatMessages((prev) => [...prev, { id: msgId, sender: 'self', senderName: userName, text, timestamp: new Date() }]);

    Object.values(peersRef.current).forEach((peer) => {
      if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
        peer.dataChannel.send(JSON.stringify(messagePayload));
      }
    });

    const aiPeers = Object.values(hostedVirtualPeersRef.current);
    const aiInCall = aiPeers.length > 0;

    if (aiInCall) {
      aiPeers.forEach((vp) => {
        if (vp.aiInstance && vp.aiInstance.getState() === 'connected') {
          vp.aiInstance.sendSystemContext(`[CHAT MESSAGE from ${userName}]: ${text}. Please reply naturally with your voice if appropriate.`);
        }
      });
    } else {
      // AI not in call, fetch text reply
      try {
        const res = await fetch(`http://localhost:5002/api/ai/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, userName })
        });
        const data = await res.json();
        
        if (data.error) {
          throw new Error(typeof data.error === 'string' ? data.error : data.error.message || 'API Error');
        }

        if (data.reply) {
          const aiMsgId = Math.random().toString(36).substr(2, 9);
          const aiPayload = { type: 'chat', id: aiMsgId, text: data.reply, senderName: 'Lily (AI)' };
          
          setChatMessages((prev) => [...prev, { id: aiMsgId, sender: 'remote', senderName: 'Lily (AI)', text: data.reply, timestamp: new Date() }]);
          
          Object.values(peersRef.current).forEach((peer) => {
            if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
              peer.dataChannel.send(JSON.stringify(aiPayload));
            }
          });
        }
      } catch (err: any) {
        console.error('Failed to get AI text reply:', err);
        const errMsg = err.message || 'Unknown error';
        const isRateLimit = errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('rate');
        
        const aiMsgId = Math.random().toString(36).substr(2, 9);
        setChatMessages((prev) => [...prev, { 
          id: aiMsgId, sender: 'remote', senderName: 'System', 
          text: isRateLimit ? "Lily is currently busy (API Rate Limit). Please wait a minute before texting her again." : `Failed to reach AI: ${errMsg}`, 
          timestamp: new Date() 
        }]);
      }
    }
  }, [userName]);

  const broadcastVideoState = useCallback((state: VideoSyncState) => {
    setVideoSyncState(state);
    const messagePayload = { type: 'video-sync', state };
    Object.values(peersRef.current).forEach((peer) => {
      if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
        peer.dataChannel.send(JSON.stringify(messagePayload));
      }
    });
  }, []);

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
        
        // Feed remote audio to AI if active
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
  }, [syncPeersState]);

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
  }, [createPeerConnection]);

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
    
    // Clean up virtual peers
    Object.values(hostedVirtualPeersRef.current).forEach(vp => {
      Object.values(vp.pcs).forEach(pc => pc.close());
      vp.aiInstance.disconnect();
    });

    peersRef.current = {};
    hostedVirtualPeersRef.current = {};
    syncPeersState();
    setChatMessages([]);
  }, [syncPeersState]);

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
  }, [cleanUpPC]);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, []);

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
  }, [isScreenSharing]);

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
    } catch (err) {}
  }, [isScreenSharing]);

  const toggleHand = useCallback(() => {
    setIsHandRaised((prev) => {
      const nextState = !prev;
      if (socketRef.current && roomId) {
        socketRef.current.emit('toggle-hand', { roomId, socketId: socketRef.current.id, handRaised: nextState });
      }
      if (nextState) {
        toast('You raised your hand', { icon: '✋' });
      }
      return nextState;
    });
  }, [roomId]);

  const sendReaction = useCallback((emoji: string) => {
    if (socketRef.current && roomId) {
      socketRef.current.emit('reaction', { roomId, socketId: socketRef.current.id, emoji });
      // Dispatch locally as well so we see our own reaction
      window.dispatchEvent(new CustomEvent('reaction-received', { detail: { socketId: 'local', emoji } }));
      toast(`You reacted`, { icon: emoji, duration: 2500 });
    }
  }, [roomId]);

  // AI Summoning Logic
  const summonAI = useCallback(async (persona: AIPersona = 'lily') => {
    if (!roomId) return;
    
    // Create virtual ID for AI
    const virtualId = `ai_${Math.random().toString(36).substr(2, 9)}`;
    const ai = new AIParticipant(persona);
    const personaConfig = PERSONAS[persona];
    
    ai.addEventListener('statechange', ((e: CustomEvent) => {
      if (peersRef.current[virtualId]) {
        peersRef.current[virtualId].aiState = e.detail;
        syncPeersState();
      }
    }) as EventListener);

    await ai.connect("ws://localhost:5002/ai-proxy");
    
    if (localStreamRef.current) ai.addStream(localStreamRef.current);
    
    // Feed existing remote peers and OTHER existing AIs to the new AI
    Object.values(peersRef.current).forEach(peer => {
      if (peer.stream) ai.addStream(peer.stream);
    });

    // CRITICAL: Feed this NEW AI's stream to ALL OTHER locally hosted AIs so they can hear each other!
    Object.values(hostedVirtualPeersRef.current).forEach(existingAi => {
      existingAi.aiInstance.addStream(ai.aiStream);
    });

    const info: PeerInfo = { socketId: virtualId, userId: virtualId, userName: personaConfig.name };
    hostedVirtualPeersRef.current[virtualId] = { info, stream: ai.aiStream, aiInstance: ai, pcs: {} };
    
    // Add visually to local peers list
    peersRef.current[virtualId] = { info, stream: ai.aiStream, pc: null as any, dataChannel: null, aiState: ai.getState() };
    syncPeersState();

    socketRef.current?.emit('add-virtual-user', { roomId, virtualId, userName: personaConfig.name });
    
    // We do NOT initiate calls for the virtual user directly here because `user-joined` will prompt others to call us!
  }, [roomId, syncPeersState]);

  const removeAI = useCallback((virtualId: string) => {
    if (!roomId || !socketRef.current) return;
    
    const hostedPeer = hostedVirtualPeersRef.current[virtualId];
    if (hostedPeer && hostedPeer.aiInstance) {
      hostedPeer.aiInstance.disconnect?.();
    }
    
    delete hostedVirtualPeersRef.current[virtualId];
    
    const peer = peersRef.current[virtualId];
    if (peer) {
      if (peer.pc) peer.pc.close();
      if (peer.dataChannel) peer.dataChannel.close();
      delete peersRef.current[virtualId];
    }
    
    socketRef.current.emit('remove-virtual-user', { roomId, virtualId });
    syncPeersState();
    toast.success("AI left the call");
  }, [roomId, syncPeersState]);

  useEffect(() => {
    // Fetch dynamic TURN credentials
    fetch(`${SIGNALING_SERVER}/api/calls/turn-credentials`)
      .then(res => res.json())
      .then(data => {
        if (data.iceServers && Array.isArray(data.iceServers)) {
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

    socket.on('user-joined', ({ userName: remoteName }) => {
      console.log('[Socket] Remote peer joined:', remoteName);
    });

    socket.on('signal-received', async ({ senderSocketId, signalData, targetVirtualId }) => {
      // INTERCEPT signals for virtual peers we host
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

    socket.on('toggle-hand', ({ socketId, handRaised }) => {
      const peer = peersRef.current[socketId];
      if (peer) {
        peer.handRaised = handRaised;
        syncPeersState();
        if (handRaised) {
          toast(`${peer.info.userName} raised their hand`, { icon: '✋' });
        }
      }
    });

    socket.on('reaction', ({ socketId, emoji }) => {
      const peer = peersRef.current[socketId];
      if (peer) {
        toast(`${peer.info.userName} reacted`, { icon: emoji, duration: 2500 });
      }
      window.dispatchEvent(new CustomEvent('reaction-received', { detail: { socketId, emoji } }));
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      cleanUpPC();
    };
  }, [roomId, isMediaReady, userId, userName, createPeerConnection, initiateCall, cleanUpPC, startDiagnostics, syncPeersState]);

  // Feed Watch Party context to AI
  useEffect(() => {
    if (!videoSyncState.url) return;
    Object.values(hostedVirtualPeersRef.current).forEach(vp => {
      if (vp.aiInstance && vp.aiInstance.getState() === 'connected') {
        const timeStr = Math.floor(videoSyncState.playedSeconds / 60) + ':' + Math.floor(videoSyncState.playedSeconds % 60).toString().padStart(2, '0');
        vp.aiInstance.sendSystemContext(`The group is currently having a Watch Party. We are watching the video at URL: ${videoSyncState.url}. The video is currently ${videoSyncState.playing ? 'playing' : 'paused'} at timestamp ${timeStr}.`);
      }
    });
  }, [videoSyncState.url, videoSyncState.playing, Math.floor(videoSyncState.playedSeconds / 10)]);

  return {
    localStream, peers, isMuted, isCameraOff, isScreenSharing, chatMessages, stats, videoSyncState,
    isHandRaised, sendChatMessage, broadcastVideoState, toggleMute, toggleCamera, toggleScreenShare, toggleHand, sendReaction, leaveCall, initLocalMedia,
    summonAI, removeAI
  };
};
