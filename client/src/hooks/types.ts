export interface PeerInfo {
  socketId: string;
  userId: string;
  userName: string;
}

export interface PeerState {
  info: PeerInfo;
  stream: MediaStream | null;
  pc: RTCPeerConnection | null;
  dataChannel: RTCDataChannel | null;
  aiState?: string;
  handRaised?: boolean;
  /** Real socket id of the participant hosting this virtual AI (remote viewers only). */
  aiHostSocketId?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'self' | 'remote';
  senderName: string;
  text: string;
  timestamp: Date;
  seenBy?: string[];
}

export interface WatchPartyVideo {
  id: string;
  url: string;
  title: string;
  thumbnail?: string;
  author?: string;
  source?: string;
  duration?: string;
}

export interface VideoSyncState {
  url: string | null;
  playing: boolean;
  playedSeconds: number;
  timestamp: number;
  playbackRate?: number;
  title?: string | null;
  thumbnail?: string | null;
  author?: string | null;
  queue?: WatchPartyVideo[];
  queueIndex?: number;
  loopQueue?: boolean;
  shuffle?: boolean;
  /** Socket id of the peer driving playback (heartbeats + transport). */
  hostSocketId?: string | null;
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

// Dummy export to ensure Vite treats this as a valid module with runtime exports, preventing HMR/esbuild cache issues.
export const __types_dummy = true;
