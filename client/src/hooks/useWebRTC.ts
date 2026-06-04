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
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remotePeer, setRemotePeer] = useState<PeerInfo | null>(null);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isMediaReady, setIsMediaReady] = useState(false);
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  
  // Real-time call quality diagnostics
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
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const statsIntervalRef = useRef<number | null>(null);
  
  // Track previous stat bytes to calculate bitrates
  const prevBytesReceived = useRef<number>(0);
  const prevBytesSent = useRef<number>(0);
  const prevTimestamp = useRef<number>(0);

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

      // If peer connection exists, replace the tracks
      if (pcRef.current) {
        const senders = pcRef.current.getSenders();
        stream.getTracks().forEach((track) => {
          const sender = senders.find((s) => s.track?.kind === track.kind);
          if (sender) {
            sender.replaceTrack(track);
          } else {
            pcRef.current?.addTrack(track, stream);
          }
        });
      }
      setIsMediaReady(true);
      return stream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      throw error;
    }
  }, []);

  // Setup Data Channel for Chat & Reactions
  const setupDataChannel = (channel: RTCDataChannel) => {
    dataChannelRef.current = channel;

    channel.onopen = () => {
      console.log('[DataChannel] Opened');
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
              senderName: remotePeer?.userName || 'Remote',
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
      console.log('[DataChannel] Closed');
    };
  };

  // Send a text message over WebRTC Data Channel
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

    // Send via DataChannel if open
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      dataChannelRef.current.send(JSON.stringify(messagePayload));
    } else {
      console.warn('[WebRTC] DataChannel not open, message not sent to peer');
    }
  }, [userName]);

  // Create Peer Connection
  const createPeerConnection = useCallback((targetSocketId: string): RTCPeerConnection => {
    console.log('[WebRTC] Creating Peer Connection for target:', targetSocketId);
    
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection State changed to:', pc.connectionState);
      setConnectionState(pc.connectionState);
      
      if (pc.connectionState === 'failed') {
        handleIceRestart(targetSocketId);
      }
    };

    pc.oniceconnectionstatechange = () => {
      setStats((prev) => ({ ...prev, connectionState: pc.iceConnectionState }));
    };

    // Handle remote tracks addition
    pc.ontrack = (event) => {
      console.log('[WebRTC] Received remote track:', event.track.kind);
      setRemoteStream((prev) => {
        const streams = event.streams;
        if (streams && streams[0]) {
          // Creating a new MediaStream ensures React detects the state change 
          // when multiple tracks (audio then video) arrive at different times
          return new MediaStream(streams[0].getTracks());
        } else {
          // Fallback for single track
          const stream = prev || new MediaStream();
          stream.addTrack(event.track);
          return new MediaStream(stream.getTracks());
        }
      });
    };

    // Handle remote DataChannel negotiation
    pc.ondatachannel = (e) => {
      console.log('[WebRTC] Received remote DataChannel');
      setupDataChannel(e.channel);
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
  }, []);

  // Initiate a WebRTC connection (Offer)
  const initiateCall = useCallback(async (targetSocketId: string) => {
    try {
      const pc = createPeerConnection(targetSocketId);

      // Setup local DataChannel
      const dataChannel = pc.createDataChannel('chat-channel');
      setupDataChannel(dataChannel);

      const offer = await pc.createOffer();
      const hdOffer = { type: offer.type, sdp: preferOpusHd(offer.sdp || '') };
      await pc.setLocalDescription(hdOffer);

      console.log('[WebRTC] Sending SDP Offer to:', targetSocketId);
      socketRef.current?.emit('relay-signal', {
        targetSocketId,
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
    if (!pcRef.current) return;
    try {
      console.log('[WebRTC] Connection failed, initiating ICE Restart...');
      const offer = await pcRef.current.createOffer({ iceRestart: true });
      const hdOffer = { type: offer.type, sdp: preferOpusHd(offer.sdp || '') };
      await pcRef.current.setLocalDescription(hdOffer);

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

  // Monitor WebRTC Quality stats
  const startDiagnostics = useCallback(() => {
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);

    statsIntervalRef.current = window.setInterval(async () => {
      const pc = pcRef.current;
      if (!pc || pc.connectionState !== 'connected') return;

      try {
        const reports = await pc.getStats();
        let latency = 0;
        let bitrateIn = 0;
        let bitrateOut = 0;
        let packetLoss = 0;
        let fps = 0;
        let resolution = '0x0';

        reports.forEach((report) => {
          const now = report.timestamp;
          const delta = (now - prevTimestamp.current) / 1000; // in seconds

          // 1. Latency (Round Trip Time) from candidate-pair
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            if (report.currentRoundTripTime) {
              latency = Math.round(report.currentRoundTripTime * 1000); // convert to ms
            }
          }

          // 2. Incoming stream stats (Bitrate & Packet Loss & Resolution)
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            packetLoss = report.packetsLost || 0;
            fps = Math.round(report.framesPerSecond || 0);
            resolution = `${report.frameWidth || 0}x${report.frameHeight || 0}`;

            if (delta > 0 && report.bytesReceived !== undefined) {
              const bytes = report.bytesReceived - prevBytesReceived.current;
              bitrateIn = Math.round((bytes * 8) / 1000 / delta); // kbps
              prevBytesReceived.current = report.bytesReceived;
            }
          }

          // 3. Outgoing stream stats
          if (report.type === 'outbound-rtp' && report.kind === 'video') {
            if (delta > 0 && report.bytesSent !== undefined) {
              const bytes = report.bytesSent - prevBytesSent.current;
              bitrateOut = Math.round((bytes * 8) / 1000 / delta); // kbps
              prevBytesSent.current = report.bytesSent;
            }
          }
        });

        prevTimestamp.current = Date.now();

        setStats((prev) => ({
          latency: latency || prev.latency,
          bitrateIn: bitrateIn >= 0 ? bitrateIn : 0,
          bitrateOut: bitrateOut >= 0 ? bitrateOut : 0,
          packetLoss,
          fps,
          resolution,
          connectionState: pc.iceConnectionState,
        }));
      } catch (err) {
        console.error('Error fetching WebRTC diagnostics stats:', err);
      }
    }, 1000);
  }, []);

  // Clean up Peer Connection
  const cleanUpPC = useCallback(() => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }

    if (pcRef.current) {
      console.log('[WebRTC] Closing RTCPeerConnection');
      pcRef.current.close();
      pcRef.current = null;
    }

    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }

    setRemoteStream(null);
    setRemotePeer(null);
    setConnectionState('new');
    setChatMessages([]);
  }, []);

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
    const pc = pcRef.current;
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

        // Update sender on peer connection
        if (pc) {
          const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (videoSender) {
            videoSender.replaceTrack(newVideoTrack);
          }
          applyBitrateLimits(pc);
        }
        
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

        // Replace track on peer connection
        if (pc) {
          const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (videoSender) {
            videoSender.replaceTrack(screenTrack);
          }
          applyBitrateLimits(pc);
        }

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
      // Since it's a 1-on-1 call, we take the first user if present
      if (users.length > 0) {
        const peer = users[0];
        setRemotePeer(peer);
        initiateCall(peer.socketId);
      }
    });

    // Handle another user joining
    socket.on('user-joined', ({ socketId, userId: remoteId, userName: remoteName }) => {
      console.log('[Socket] Remote peer joined:', remoteName);
      setRemotePeer({ socketId, userId: remoteId, userName: remoteName });
    });

    // Handle receiving signals (Offer, Answer, Candidates)
    socket.on('signal-received', async ({ senderSocketId, signalData }) => {
      const pc = pcRef.current;

      if (signalData.type === 'sdp-offer') {
        console.log('[WebRTC] Received SDP Offer from:', senderSocketId);
        let activePc = pc;

        if (!activePc) {
          activePc = createPeerConnection(senderSocketId);
        }

        try {
          await activePc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
          const answer = await activePc.createAnswer();
          const hdAnswer = { type: answer.type, sdp: preferOpusHd(answer.sdp || '') };
          await activePc.setLocalDescription(hdAnswer);

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
        if (pc) {
          if (pc.signalingState !== 'stable') {
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
              startDiagnostics();
            } catch (err) {
              console.error('[WebRTC] Error setting remote answer:', err);
            }
          } else {
            console.warn('[WebRTC] Ignored SDP answer because signaling state is already stable. This is normal during simultaneous ICE restarts.');
          }
        }
      } 
      
      else if (signalData.type === 'candidate') {
        if (pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
          } catch (err) {
            console.error('[WebRTC] Error adding ICE Candidate:', err);
          }
        }
      }
    });

    // Handle user leaving the room
    socket.on('user-left', ({ socketId }) => {
      console.log('[Socket] Remote peer left room:', socketId);
      cleanUpPC();
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      cleanUpPC();
    };
  }, [roomId, isMediaReady, userId, userName, createPeerConnection, initiateCall, cleanUpPC, startDiagnostics]);

  return {
    localStream,
    remoteStream,
    remotePeer,
    connectionState,
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
