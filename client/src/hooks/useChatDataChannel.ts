import { useState, useCallback, type MutableRefObject } from 'react';
import type { ChatMessage, VideoSyncState, PeerState, PeerInfo, WatchPartyVideo } from './types';
import { createEmptyVideoSyncState, getNextQueueIndex, getPreviousQueueIndex, playVideoAtIndex } from '../lib/watchPartyUtils';
import { AIParticipant } from '../lib/AIParticipant';
import { apiUrl } from '../lib/serverConfig';

interface UseChatDataChannelProps {
  userName: string;
  peersRef: MutableRefObject<Record<string, PeerState>>;
  hostedVirtualPeersRef: MutableRefObject<Record<string, {
    info: PeerInfo;
    stream: MediaStream;
    aiInstance: AIParticipant;
    pcs: Record<string, RTCPeerConnection>;
  }>>;
  syncPeersState: () => void;
}

export const useChatDataChannel = ({ userName, peersRef, hostedVirtualPeersRef, syncPeersState }: UseChatDataChannelProps) => {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [videoSyncState, setVideoSyncState] = useState<VideoSyncState>(createEmptyVideoSyncState());

  const setupDataChannel = useCallback((channel: RTCDataChannel, targetSocketId: string, remoteUserName: string) => {
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
  }, [peersRef, syncPeersState]);

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
        const res = await fetch(apiUrl('/api/ai/chat'), {
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
  }, [userName, peersRef, hostedVirtualPeersRef]);

  const broadcastVideoState = useCallback((state: VideoSyncState) => {
    setVideoSyncState(state);
    const messagePayload = { type: 'video-sync', state };
    Object.values(peersRef.current).forEach((peer) => {
      if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
        peer.dataChannel.send(JSON.stringify(messagePayload));
      }
    });
  }, [peersRef]);

  const patchVideoState = useCallback((patch: Partial<VideoSyncState>) => {
    setVideoSyncState((prev) => {
      const next = { ...prev, ...patch, timestamp: patch.timestamp ?? Date.now() };
      const messagePayload = { type: 'video-sync', state: next };
      Object.values(peersRef.current).forEach((peer) => {
        if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
          peer.dataChannel.send(JSON.stringify(messagePayload));
        }
      });
      return next;
    });
  }, [peersRef]);

  const addToQueue = useCallback((video: WatchPartyVideo, playNow = false) => {
    setVideoSyncState((prev) => {
      const queue = [...(prev.queue ?? []), video];
      let next: VideoSyncState = { ...prev, queue };

      if (playNow || !prev.url) {
        next = playVideoAtIndex({ ...next, queue }, queue.length - 1);
      }

      const messagePayload = { type: 'video-sync', state: next };
      Object.values(peersRef.current).forEach((peer) => {
        if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
          peer.dataChannel.send(JSON.stringify(messagePayload));
        }
      });
      return next;
    });
  }, [peersRef]);

  const removeFromQueue = useCallback((videoId: string) => {
    setVideoSyncState((prev) => {
      const queue = (prev.queue ?? []).filter((v) => v.id !== videoId);
      let queueIndex = prev.queueIndex ?? -1;
      const removedIndex = (prev.queue ?? []).findIndex((v) => v.id === videoId);
      if (removedIndex >= 0 && removedIndex < queueIndex) queueIndex -= 1;
      if (removedIndex === queueIndex) queueIndex = Math.min(queueIndex, queue.length - 1);

      const next = { ...prev, queue, queueIndex };
      const messagePayload = { type: 'video-sync', state: next };
      Object.values(peersRef.current).forEach((peer) => {
        if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
          peer.dataChannel.send(JSON.stringify(messagePayload));
        }
      });
      return next;
    });
  }, [peersRef]);

  const playQueueIndex = useCallback((index: number) => {
    setVideoSyncState((prev) => {
      const next = playVideoAtIndex(prev, index);
      const messagePayload = { type: 'video-sync', state: next };
      Object.values(peersRef.current).forEach((peer) => {
        if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
          peer.dataChannel.send(JSON.stringify(messagePayload));
        }
      });
      return next;
    });
  }, [peersRef]);

  const playNextInQueue = useCallback(() => {
    setVideoSyncState((prev) => {
      const nextIndex = getNextQueueIndex(prev);
      if (nextIndex === null) {
        const paused = { ...prev, playing: false, playedSeconds: expectedSeconds(prev), timestamp: Date.now() };
        const messagePayload = { type: 'video-sync', state: paused };
        Object.values(peersRef.current).forEach((peer) => {
          if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
            peer.dataChannel.send(JSON.stringify(messagePayload));
          }
        });
        return paused;
      }
      const next = playVideoAtIndex(prev, nextIndex);
      const messagePayload = { type: 'video-sync', state: next };
      Object.values(peersRef.current).forEach((peer) => {
        if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
          peer.dataChannel.send(JSON.stringify(messagePayload));
        }
      });
      return next;
    });
  }, [peersRef]);

  const playPreviousInQueue = useCallback(() => {
    setVideoSyncState((prev) => {
      const prevIndex = getPreviousQueueIndex(prev);
      if (prevIndex === null) return prev;
      const next = playVideoAtIndex(prev, prevIndex);
      const messagePayload = { type: 'video-sync', state: next };
      Object.values(peersRef.current).forEach((peer) => {
        if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
          peer.dataChannel.send(JSON.stringify(messagePayload));
        }
      });
      return next;
    });
  }, [peersRef]);

  const clearQueue = useCallback(() => {
    patchVideoState({ queue: [], queueIndex: -1 });
  }, [patchVideoState]);

  return {
    chatMessages,
    setChatMessages,
    videoSyncState,
    setVideoSyncState,
    setupDataChannel,
    sendChatMessage,
    broadcastVideoState,
    patchVideoState,
    addToQueue,
    removeFromQueue,
    playQueueIndex,
    playNextInQueue,
    playPreviousInQueue,
    clearQueue,
  };
};

function expectedSeconds(state: VideoSyncState): number {
  if (!state.playing) return state.playedSeconds;
  return state.playedSeconds + (Date.now() - state.timestamp) / 1000;
}
