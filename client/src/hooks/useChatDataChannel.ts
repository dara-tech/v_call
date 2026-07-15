import { useState, useCallback, useRef, type MutableRefObject } from 'react';
import type { ChatMessage, VideoSyncState, PeerState, PeerInfo, WatchPartyVideo } from './types';
import { createEmptyVideoSyncState, expectedPlayhead, getNextQueueIndex, getPreviousQueueIndex, playVideoAtIndex } from '../lib/watchPartyUtils';
import { AIParticipant } from '../lib/AIParticipant';

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
  localSocketIdRef: MutableRefObject<string | null>;
}

function stampOutgoing(state: VideoSyncState, hostSocketId: string | null): VideoSyncState {
  return {
    ...state,
    hostSocketId: hostSocketId ?? state.hostSocketId ?? null,
    timestamp: Date.now(),
  };
}

function relayVideoSync(
  peersRef: MutableRefObject<Record<string, PeerState>>,
  state: VideoSyncState,
) {
  const messagePayload = { type: 'video-sync', state };
  Object.values(peersRef.current).forEach((peer) => {
    if (peer.dataChannel?.readyState === 'open') {
      peer.dataChannel.send(JSON.stringify(messagePayload));
    }
  });
}

export const useChatDataChannel = ({
  userName,
  peersRef,
  hostedVirtualPeersRef,
  syncPeersState,
  localSocketIdRef,
}: UseChatDataChannelProps) => {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [videoSyncState, setVideoSyncState] = useState<VideoSyncState>(createEmptyVideoSyncState());
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

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
        } else if (data.type === 'video-sync' && data.state) {
          setVideoSyncState((prev) => {
            const incoming = data.state as VideoSyncState;
            if (typeof incoming.timestamp === 'number' && incoming.timestamp <= prev.timestamp) {
              return prev;
            }
            return incoming;
          });
        } else if (data.type === 'typing') {
          const remoteUser = data.userName || remoteUserName || 'Remote';
          if (data.isTyping) {
            setTypingUsers(prev => prev.includes(remoteUser) ? prev : [...prev, remoteUser]);
            if (typingTimeouts.current[remoteUser]) clearTimeout(typingTimeouts.current[remoteUser]);
            typingTimeouts.current[remoteUser] = setTimeout(() => {
              setTypingUsers(prev => prev.filter(u => u !== remoteUser));
            }, 3000);
          } else {
            if (typingTimeouts.current[remoteUser]) clearTimeout(typingTimeouts.current[remoteUser]);
            setTypingUsers(prev => prev.filter(u => u !== remoteUser));
          }
        } else if (data.type === 'seen') {
          const remoteUser = data.userName || remoteUserName || 'Remote';
          const msgIds = data.messageIds || [];
          setChatMessages(prev => prev.map(msg => {
            if (msgIds.includes(msg.id)) {
              const currentSeen = msg.seenBy || [];
              if (!currentSeen.includes(remoteUser)) {
                return { ...msg, seenBy: [...currentSeen, remoteUser] };
              }
            }
            return msg;
          }));
        }
      } catch { /* noop */ }
    };
  }, [peersRef, syncPeersState]);

  const sendChatMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;
    const msgId = Math.random().toString(36).substr(2, 9);
    const messagePayload = { type: 'chat', id: msgId, text };

    setChatMessages((prev) => [...prev, { id: msgId, sender: 'self', senderName: userName, text, timestamp: new Date() }]);

    Object.values(peersRef.current).forEach((peer) => {
      if (peer.dataChannel?.readyState === 'open') {
        peer.dataChannel.send(JSON.stringify(messagePayload));
      }
    });

    const aiPeers = Object.values(hostedVirtualPeersRef.current);
    const aiInCall = aiPeers.length > 0;

    if (aiInCall) {
      aiPeers.forEach((vp) => {
        if (vp.aiInstance?.getState() === 'connected') {
          vp.aiInstance.sendSystemContext(`[CHAT MESSAGE from ${userName}]: ${text}. Please reply naturally with your voice if appropriate.`);
        }
      });
    }
  }, [userName, peersRef, hostedVirtualPeersRef]);

  const broadcastVideoState = useCallback((state: VideoSyncState) => {
    const next = stampOutgoing(state, localSocketIdRef.current);
    setVideoSyncState(next);
    relayVideoSync(peersRef, next);
  }, [peersRef, localSocketIdRef]);

  const patchVideoState = useCallback((patch: Partial<VideoSyncState>) => {
    setVideoSyncState((prev) => {
      const next = stampOutgoing({ ...prev, ...patch }, localSocketIdRef.current);
      relayVideoSync(peersRef, next);
      return next;
    });
  }, [peersRef, localSocketIdRef]);

  const addToQueue = useCallback((video: WatchPartyVideo, playNow = false) => {
    setVideoSyncState((prev) => {
      const queue = [...(prev.queue ?? []), video];
      let next: VideoSyncState = { ...prev, queue };

      if (playNow || !prev.url) {
        next = playVideoAtIndex({ ...next, queue }, queue.length - 1);
      }

      next = stampOutgoing(next, localSocketIdRef.current);
      relayVideoSync(peersRef, next);
      return next;
    });
  }, [peersRef, localSocketIdRef]);

  const removeFromQueue = useCallback((videoId: string) => {
    setVideoSyncState((prev) => {
      const queue = (prev.queue ?? []).filter((v) => v.id !== videoId);
      const removedIndex = (prev.queue ?? []).findIndex((v) => v.id === videoId);
      const currentIndex = prev.queueIndex ?? -1;

      let next: VideoSyncState;
      if (removedIndex === currentIndex) {
        if (queue.length === 0) {
          next = {
            ...prev,
            queue: [],
            queueIndex: -1,
            url: null,
            title: null,
            thumbnail: null,
            author: null,
            playing: false,
            playedSeconds: 0,
          };
        } else {
          const newIndex = Math.min(currentIndex, queue.length - 1);
          next = playVideoAtIndex({ ...prev, queue }, newIndex);
        }
      } else {
        let queueIndex = currentIndex;
        if (removedIndex >= 0 && removedIndex < queueIndex) queueIndex -= 1;
        next = { ...prev, queue, queueIndex };
      }

      next = stampOutgoing(next, localSocketIdRef.current);
      relayVideoSync(peersRef, next);
      return next;
    });
  }, [peersRef, localSocketIdRef]);

  const playQueueIndex = useCallback((index: number) => {
    setVideoSyncState((prev) => {
      const next = stampOutgoing(playVideoAtIndex(prev, index), localSocketIdRef.current);
      relayVideoSync(peersRef, next);
      return next;
    });
  }, [peersRef, localSocketIdRef]);

  const playNextInQueue = useCallback(() => {
    setVideoSyncState((prev) => {
      const nextIndex = getNextQueueIndex(prev);
      let next: VideoSyncState;
      if (nextIndex === null) {
        next = {
          ...prev,
          playing: false,
          playedSeconds: expectedPlayhead(prev),
        };
      } else {
        next = playVideoAtIndex(prev, nextIndex);
      }
      next = stampOutgoing(next, localSocketIdRef.current);
      relayVideoSync(peersRef, next);
      return next;
    });
  }, [peersRef, localSocketIdRef]);

  const playPreviousInQueue = useCallback(() => {
    setVideoSyncState((prev) => {
      const prevIndex = getPreviousQueueIndex(prev);
      if (prevIndex === null) return prev;
      const next = stampOutgoing(playVideoAtIndex(prev, prevIndex), localSocketIdRef.current);
      relayVideoSync(peersRef, next);
      return next;
    });
  }, [peersRef, localSocketIdRef]);

  const clearQueue = useCallback(() => {
    patchVideoState({ queue: [], queueIndex: -1 });
  }, [patchVideoState]);

  const sendTypingState = useCallback((isTyping: boolean) => {
    const payload = { type: 'typing', userName, isTyping };
    Object.values(peersRef.current).forEach((peer) => {
      if (peer.dataChannel?.readyState === 'open') {
        peer.dataChannel.send(JSON.stringify(payload));
      }
    });
  }, [userName, peersRef]);

  const markMessagesSeen = useCallback((messageIds: string[]) => {
    if (messageIds.length === 0) return;
    const payload = { type: 'seen', userName, messageIds };
    Object.values(peersRef.current).forEach((peer) => {
      if (peer.dataChannel?.readyState === 'open') {
        peer.dataChannel.send(JSON.stringify(payload));
      }
    });
  }, [userName, peersRef]);

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
    typingUsers,
    sendTypingState,
    markMessagesSeen,
  };
};
