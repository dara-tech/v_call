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

// Dummy export to ensure Vite treats this as a valid module with runtime exports, preventing HMR/esbuild cache issues.
export const __types_dummy = true;
