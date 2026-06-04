import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const SIGNALING_SERVER = import.meta.env.VITE_SIGNALING_SERVER || 'http://localhost:5001';

// Public STUN/TURN servers for robust NAT traversal and connection reliability
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    // Self-hosted completely FREE Coturn server running on your VPS
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

// Helper to modify SDP to force high-fidelity HD Opus audio settings (stereo, 64kbps, Forward Error Correction)
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
      // Balanced 64kbps audio provides transparent voice quality while preventing network queue congestion
      if (!fmtp.includes('maxaveragebitrate=')) fmtp += ';maxaveragebitrate=64000';
      if (!fmtp.includes('useinbandfec=1')) fmtp += ';useinbandfec=1';
      
      // Low Latency / Real-Time settings
      if (!fmtp.includes('minptime=')) fmtp += ';minptime=10';
      if (!fmtp.includes('maxptime=')) fmtp += ';maxptime=20';
      
      lines[i] = fmtp;
      break;
    }
  }
  
  return lines.join('\r\n');
}

// Helper to limit video sender bitrate to prevent congestion on slower connections
function applyBitrateLimits(pc: RTCPeerConnection) {
  setTimeout(() => {
    pc.getSenders().forEach((sender) => {
      if (sender.track && sender.track.kind === 'video') {
        try {
          const parameters = sender.getParameters();
          if (!parameters.encodings) {
            parameters.encodings = [{}];
          }
          // Cap video bitrate at 500kbps to keep the stream highly fluid and responsive
          parameters.encodings[0].maxBitrate = 500000;
          sender.setParameters(parameters)
            .then(() => console.log('[WebRTC] Set video maxBitrate to 500kbps'))
            .catch((err) => console.warn('[WebRTC] Failed to set video bitrate parameter:', err));
        } catch (e) {
          console.warn('[WebRTC] Error setting bitrate parameters:', e);
        }
      }
    });
  }, 1000); // Small delay to ensure negotiation is completed
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
}

export interface ChatMessage {
  id: string;
  sender: 'self' | 'remote';
  senderName: string;
  text: string;
  timestamp: Date;
}

export interface CallStats {
  latency: number; // ms
  bitrateIn: number; // kbps
  bitrateOut: number; // kbps
  packetLoss: number; // count
  fps: number;
  resolution: string;
  connectionState: RTCIceConnectionState | 'disconnected';
}

export const useWebRTC = (roomId: string, userName: string, userId: string) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  
  // Replace single remoteStream with multiple peers
  const [peers, setPeers] = useState<Record<string, PeerState>>({});
  
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isMediaReady, setIsMediaReady] = useState(false);
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  
  // Real-time call quality diagnostics (aggregated or first peer)
  const [stats, setStats] = useState<CallStats>({
    latency: 0,
    bitrateIn: 0,
    bitrateOut: 0,
    packetLoss: 0,
    fps: 0,
    resolution: '0x0',
    connectionState: 'new',
  });

  // Refs to hold WebRTC/Socket state without triggering re-renders
  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef<Record<string, PeerState>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const statsIntervalRef = useRef<number | null>(null);
  
  // Track previous stat bytes to calculate bitrates (aggregate)
  const prevBytesReceived = useRef<Record<string, number>>({});
  const prevBytesSent = useRef<Record<string, number>>({});
  const prevTimestamp = useRef<number>(0);

  // Helper to safely update peers state from ref
  const syncPeersState = useCallback(() => {
    setPeers({ ...peersRef.current });
  }, []);

  // Initialize Local Media (Camera/Mic)
  const initLocalMedia = useCallback(async (audioId?: string, videoId?: string) => {
    try {
      // If we already have a local stream, stop it first to prevent lockups
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        audio: audioId 
          ? { deviceId: { exact: audioId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
          : { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: videoId 
          ? { deviceId: { exact: videoId }, width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15, max: 20 } } 
          : { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15, max: 20 } },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      setLocalStream(stream);

      // If peer connections exist, replace the tracks on all of them
      Object.values(peersRef.current).forEach((peer) => {
        const senders = peer.pc.getSenders();
        stream.getTracks().forEach((track) => {
          const sender = senders.find((s) => s.track?.kind === track.kind);
          if (sender) {
            sender.replaceTrack(track);
          } else {
            peer.pc.addTrack(track, stream);
          }
        });
      });
      
      setIsMediaReady(true);
      return stream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      throw error;
    }
  }, []);

  // Setup Data Channel for Chat & Reactions
  const setupDataChannel = (channel: RTCDataChannel, targetSocketId: string, remoteUserName: string) => {
    if (peersRef.current[targetSocketId]) {
      peersRef.current[targetSocketId].dataChannel = channel;
      syncPeersState();
    }

    channel.onopen = () => {
      console.log(`[DataChannel] Opened for ${remoteUserName}`);
    };

    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'chat') {
          setChatMessages((prev) => [
            ...prev,
            {
              id: data.id || Math.random().toString(36).substr(2, 9),
              sender: 'remote',
              senderName: remoteUserName || 'Remote',
              text: data.text,
              timestamp: new Date(),
            },
          ]);
        }
      } catch (err) {
        console.error('Error parsing data channel message:', err);
      }
    };

    channel.onclose = () => {
      console.log(`[DataChannel] Closed for ${remoteUserName}`);
    };
  };

  // Send a text message over WebRTC Data Channels to ALL peers
  const sendChatMessage = useCallback((text: string) => {
    if (!text.trim()) return;

    const msgId = Math.random().toString(36).substr(2, 9);
    const messagePayload = {
      type: 'chat',
      id: msgId,
      text,
    };

    // Add to local messages state instantly
    setChatMessages((prev) => [
      ...prev,
      {
        id: msgId,
        sender: 'self',
        senderName: userName,
        text,
        timestamp: new Date(),
      },
    ]);

    // Send via all open DataChannels
    Object.values(peersRef.current).forEach((peer) => {
      if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
        peer.dataChannel.send(JSON.stringify(messagePayload));
      } else {
        console.warn(`[WebRTC] DataChannel not open for ${peer.info.userName}, message not sent`);
      }
    });
  }, [userName]);

  // Create Peer Connection
  const createPeerConnection = useCallback((targetInfo: PeerInfo): RTCPeerConnection => {
    const { socketId: targetSocketId, userName: targetUserName } = targetInfo;
    console.log('[WebRTC] Creating Peer Connection for target:', targetSocketId);
    
    const pc = new RTCPeerConnection(ICE_SERVERS);
    
    // Create placeholder in peers map
    peersRef.current[targetSocketId] = {
      info: targetInfo,
      pc,
      stream: null,
      dataChannel: null
    };
    syncPeersState();

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection State with ${targetUserName} changed to:`, pc.connectionState);
      if (pc.connectionState === 'failed') {
        handleIceRestart(targetSocketId);
      }
    };

    pc.oniceconnectionstatechange = () => {
      // Just update stats for now, no need to force full state sync just for ICE state
    };

    // Handle remote tracks addition
    pc.ontrack = (event) => {
      console.log(`[WebRTC] Received remote track (${event.track.kind}) from ${targetUserName}`);
      
      const peer = peersRef.current[targetSocketId];
      if (peer) {
        const streams = event.streams;
        if (streams && streams[0]) {
          peer.stream = new MediaStream(streams[0].getTracks());
        } else {
          // Fallback for single track
          const stream = peer.stream || new MediaStream();
          stream.addTrack(event.track);
          peer.stream = new MediaStream(stream.getTracks());
        }
        syncPeersState();
      }
    };

    // Handle remote DataChannel negotiation
    pc.ondatachannel = (e) => {
      console.log(`[WebRTC] Received remote DataChannel from ${targetUserName}`);
      setupDataChannel(e.channel, targetSocketId, targetUserName);
    };

    // Send local ICE candidates to peer
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('relay-signal', {
          targetSocketId,
          signalData: {
            type: 'candidate',
            candidate: event.candidate,
          },
        });
      }
    };

    // Add local media tracks to peer connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Apply video bitrate limits to prevent congestion
    applyBitrateLimits(pc);

    return pc;
  }, [syncPeersState]);

  // Initiate a WebRTC connection (Offer)
  const initiateCall = useCallback(async (targetInfo: PeerInfo) => {
    try {
      const pc = createPeerConnection(targetInfo);

      // Setup local DataChannel
      const dataChannel = pc.createDataChannel('chat-channel');
      setupDataChannel(dataChannel, targetInfo.socketId, targetInfo.userName);

      const offer = await pc.createOffer();
      const hdOffer = { type: offer.type, sdp: preferOpusHd(offer.sdp || '') };
      await pc.setLocalDescription(hdOffer);

      console.log('[WebRTC] Sending SDP Offer to:', targetInfo.socketId);
      socketRef.current?.emit('relay-signal', {
        targetSocketId: targetInfo.socketId,
        signalData: {
          type: 'sdp-offer',
          sdp: hdOffer,
        },
      });
    } catch (error) {
      console.error('[WebRTC] Failed to initiate call:', error);
    }
  }, [createPeerConnection]);

  // Handle ICE Restart on connection failure
  const handleIceRestart = async (targetSocketId: string) => {
    const peer = peersRef.current[targetSocketId];
    if (!peer || !peer.pc) return;
    try {
      console.log(`[WebRTC] Connection failed with ${targetSocketId}, initiating ICE Restart...`);
      const offer = await peer.pc.createOffer({ iceRestart: true });
      const hdOffer = { type: offer.type, sdp: preferOpusHd(offer.sdp || '') };
      await peer.pc.setLocalDescription(hdOffer);

      socketRef.current?.emit('relay-signal', {
        targetSocketId,
        signalData: {
          type: 'sdp-offer',
          sdp: hdOffer,
        },
      });
    } catch (err) {
      console.error('[WebRTC] ICE Restart creation failed:', err);
    }
  };

  // Monitor WebRTC Quality stats (aggregate over all peers)
  const startDiagnostics = useCallback(() => {
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);

    statsIntervalRef.current = window.setInterval(async () => {
      const allPeers = Object.values(peersRef.current);
      if (allPeers.length === 0) return;

      let totalLatency = 0;
      let totalBitrateIn = 0;
      let totalBitrateOut = 0;
      let maxPacketLoss = 0;
      let minFps = 60;
      let resolution = '0x0';
      let activeConnections = 0;
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
            const now = report.timestamp;
            const delta = (now - prevTimestamp.current) / 1000; // in seconds

            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              if (report.currentRoundTripTime) {
                totalLatency += Math.round(report.currentRoundTripTime * 1000);
              }
            }

            if (report.type === 'inbound-rtp' && report.kind === 'video') {
              maxPacketLoss = Math.max(maxPacketLoss, report.packetsLost || 0);
              minFps = Math.min(minFps, Math.round(report.framesPerSecond || 60));
              resolution = `${report.frameWidth || 0}x${report.frameHeight || 0}`;

              if (delta > 0 && report.bytesReceived !== undefined) {
                const prevBytes = prevBytesReceived.current[targetSocketId] || 0;
                const bytes = report.bytesReceived - prevBytes;
                totalBitrateIn += Math.round((bytes * 8) / 1000 / delta);
                prevBytesReceived.current[targetSocketId] = report.bytesReceived;
              }
            }

            if (report.type === 'outbound-rtp' && report.kind === 'video') {
              if (delta > 0 && report.bytesSent !== undefined) {
                const prevBytes = prevBytesSent.current[targetSocketId] || 0;
                const bytes = report.bytesSent - prevBytes;
                totalBitrateOut += Math.round((bytes * 8) / 1000 / delta);
                prevBytesSent.current[targetSocketId] = report.bytesSent;
              }
            }
          });
        } catch (err) {
          console.error('Error fetching WebRTC diagnostics stats:', err);
        }
      }
      
      prevTimestamp.current = Date.now();

      if (activeConnections > 0) {
        setStats({
          latency: Math.round(totalLatency / activeConnections), // average latency
          bitrateIn: totalBitrateIn >= 0 ? totalBitrateIn : 0, // sum of all incoming
          bitrateOut: totalBitrateOut >= 0 ? totalBitrateOut : 0, // sum of all outgoing
          packetLoss: maxPacketLoss, // worst packet loss
          fps: minFps === 60 ? 0 : minFps, // worst fps
          resolution,
          connectionState: overallConnectionState as any,
        });
      }
    }, 1000);
  }, []);

  // Clean up all Peer Connections
  const cleanUpPC = useCallback(() => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }

    Object.values(peersRef.current).forEach((peer) => {
      if (peer.pc) peer.pc.close();
      if (peer.dataChannel) peer.dataChannel.close();
    });
    
    peersRef.current = {};
    syncPeersState();
    setChatMessages([]);
  }, [syncPeersState]);

  // Leave Call Room
  const leaveCall = useCallback(() => {
    console.log('[WebRTC] Leaving Call');
    
    // Stop local media
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }

    cleanUpPC();

    // Disconnect socket
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setIsMuted(false);
    setIsCameraOff(false);
    setIsScreenSharing(false);
  }, [cleanUpPC]);

  // Toggle Mute Audio
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, []);

  // Toggle Camera
  const toggleCamera = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        // If sharing screen, end screen share first
        if (isScreenSharing) {
          toggleScreenShare();
        } else {
          videoTrack.enabled = !videoTrack.enabled;
          setIsCameraOff(!videoTrack.enabled);
        }
      }
    }
  }, [isScreenSharing]);

  // Toggle Screen Share
  const toggleScreenShare = useCallback(async () => {
    if (!localStreamRef.current) return;

    try {
      if (isScreenSharing) {
        // Switch back to normal camera video track
        setIsScreenSharing(false);
        const originalStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 360 } },
        });

        const newVideoTrack = originalStream.getVideoTracks()[0];
        const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];

        if (oldVideoTrack) {
          localStreamRef.current.removeTrack(oldVideoTrack);
          oldVideoTrack.stop();
        }

        localStreamRef.current.addTrack(newVideoTrack);

        // Update sender on all peer connections
        Object.values(peersRef.current).forEach((peer) => {
          const videoSender = peer.pc.getSenders().find((s) => s.track?.kind === 'video');
          if (videoSender) {
            videoSender.replaceTrack(newVideoTrack);
          }
          applyBitrateLimits(peer.pc);
        });
        
        setIsCameraOff(false);
      } else {
        // Switch to display media
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
        });

        const screenTrack = screenStream.getVideoTracks()[0];
        const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];

        if (oldVideoTrack) {
          localStreamRef.current.removeTrack(oldVideoTrack);
          oldVideoTrack.stop();
        }

        localStreamRef.current.addTrack(screenTrack);

        // Replace track on all peer connections
        Object.values(peersRef.current).forEach((peer) => {
          const videoSender = peer.pc.getSenders().find((s) => s.track?.kind === 'video');
          if (videoSender) {
            videoSender.replaceTrack(screenTrack);
          }
          applyBitrateLimits(peer.pc);
        });

        setIsScreenSharing(true);

        // Listen for when user stops screen share from browser system overlay
        screenTrack.onended = () => {
          toggleScreenShare();
        };
      }
    } catch (err) {
      console.error('[WebRTC] Failed to toggle screen share:', err);
    }
  }, [isScreenSharing]);

  // Clean up local stream tracks on unmount
  useEffect(() => {
    return () => {
      console.log('[WebRTC] Hook unmounted, stopping camera tracks');
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // WebRTC socket logic setup
  useEffect(() => {
    if (!roomId || !isMediaReady) return;

    console.log('[WebRTC] Connecting to signaling server:', SIGNALING_SERVER);
    const socket = io(SIGNALING_SERVER);
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Socket] Connected, joining room:', roomId);
      socket.emit('join-room', { roomId, userId, userName });
    });

    // Handle receiving list of users already in room
    socket.on('all-users', (users: PeerInfo[]) => {
      console.log('[Socket] Room users list received:', users);
      users.forEach((user) => {
        initiateCall(user);
      });
    });

    // Handle another user joining (wait for them to call us)
    socket.on('user-joined', ({ userName: remoteName }) => {
      console.log('[Socket] Remote peer joined:', remoteName);
      // We don't initiate the call here, we let the joining user call us (to avoid glare)
    });

    // Handle receiving signals (Offer, Answer, Candidates)
    socket.on('signal-received', async ({ senderSocketId, signalData }) => {
      let peer = peersRef.current[senderSocketId];

      if (signalData.type === 'sdp-offer') {
        console.log('[WebRTC] Received SDP Offer from:', senderSocketId);
        
        if (!peer) {
          // It's possible we don't have this peer stored yet if they just joined and sent an offer immediately
          // Create the PeerConnection without initiating (which creates the answer)
          const targetInfo = { socketId: senderSocketId, userId: 'unknown', userName: 'Remote User' }; // Will be updated if we had real info
          createPeerConnection(targetInfo);
          peer = peersRef.current[senderSocketId];
        }

        try {
          await peer.pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
          const answer = await peer.pc.createAnswer();
          const hdAnswer = { type: answer.type, sdp: preferOpusHd(answer.sdp || '') };
          await peer.pc.setLocalDescription(hdAnswer);

          socket.emit('relay-signal', {
            targetSocketId: senderSocketId,
            signalData: {
              type: 'sdp-answer',
              sdp: hdAnswer,
            },
          });
          
          startDiagnostics();
        } catch (err) {
          console.error('[WebRTC] Error handling offer:', err);
        }
      } 
      
      else if (signalData.type === 'sdp-answer') {
        console.log('[WebRTC] Received SDP Answer from:', senderSocketId);
        if (peer && peer.pc) {
          if (peer.pc.signalingState !== 'stable') {
            try {
              await peer.pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
              startDiagnostics();
            } catch (err) {
              console.error('[WebRTC] Error setting remote answer:', err);
            }
          } else {
            console.warn('[WebRTC] Ignored SDP answer because signaling state is already stable.');
          }
        }
      } 
      
      else if (signalData.type === 'candidate') {
        if (peer && peer.pc) {
          try {
            await peer.pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
          } catch (err) {
            console.error('[WebRTC] Error adding ICE Candidate:', err);
          }
        }
      }
    });

    // Handle user leaving the room
    socket.on('user-left', ({ socketId }) => {
      console.log('[Socket] Remote peer left room:', socketId);
      const peer = peersRef.current[socketId];
      if (peer) {
        if (peer.pc) peer.pc.close();
        if (peer.dataChannel) peer.dataChannel.close();
        delete peersRef.current[socketId];
        syncPeersState();
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      cleanUpPC();
    };
  }, [roomId, isMediaReady, userId, userName, createPeerConnection, initiateCall, cleanUpPC, startDiagnostics, syncPeersState]);

  return {
    localStream,
    peers,
    isMuted,
    isCameraOff,
    isScreenSharing,
    chatMessages,
    stats,
    sendChatMessage,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    leaveCall,
    initLocalMedia,
  };
};
