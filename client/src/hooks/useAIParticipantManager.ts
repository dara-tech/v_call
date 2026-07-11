import { useCallback, type MutableRefObject } from 'react';
import { Socket } from 'socket.io-client';
import { AIParticipant } from '../lib/AIParticipant';
import { PERSONAS } from '../lib/ai/personas';
import type { AIPersona } from '../lib/ai/types';
import type { PeerState, PeerInfo } from './types';
import { toast } from 'sonner';
import { getAiProxyUrl } from '../lib/serverConfig';

interface UseAIParticipantManagerProps {
  roomId: string;
  socketRef: MutableRefObject<Socket | null>;
  peersRef: MutableRefObject<Record<string, PeerState>>;
  hostedVirtualPeersRef: MutableRefObject<Record<string, {
    info: PeerInfo;
    stream: MediaStream;
    aiInstance: AIParticipant;
    pcs: Record<string, RTCPeerConnection>;
  }>>;
  localStreamRef: MutableRefObject<MediaStream | null>;
  syncPeersState: () => void;
  toggleScreenShare: () => void;
  watchPartyStream?: MediaStream | null;
  bridgeVirtualToAllPeers?: (virtualId: string) => void;
}

export const useAIParticipantManager = ({
  roomId,
  socketRef,
  peersRef,
  hostedVirtualPeersRef,
  localStreamRef,
  syncPeersState,
  toggleScreenShare,
  watchPartyStream,
  bridgeVirtualToAllPeers,
}: UseAIParticipantManagerProps) => {

  const summonAI = useCallback(async (persona: AIPersona = 'lily') => {
    if (!roomId) return;
    
    const virtualId = `ai_${Math.random().toString(36).substr(2, 9)}`;
    const ai = new AIParticipant(persona);
    const personaConfig = PERSONAS[persona];
    
    try {
    ai.addEventListener('statechange', ((e: CustomEvent) => {
      if (peersRef.current[virtualId]) {
        peersRef.current[virtualId].aiState = e.detail;
        syncPeersState();
      }
    }) as EventListener);

    ai.addEventListener('functioncall', ((e: CustomEvent) => {
      const call = e.detail;
      console.log('[useWebRTC] AI Function Call:', call);
      
      if (call.name === 'react') {
        const args = call.args as any;
        if (args && args.emoji) {
          if (socketRef.current && roomId) {
            socketRef.current.emit('reaction', { roomId, socketId: virtualId, emoji: args.emoji });
            window.dispatchEvent(new CustomEvent('reaction-received', { detail: { socketId: virtualId, emoji: args.emoji } }));
            toast(`${personaConfig.name} reacted`, { icon: args.emoji, duration: 2500 });
          }
        }
      } else if (call.name === 'raiseHand') {
        const args = call.args as any;
        if (args && typeof args.raised === 'boolean') {
          if (socketRef.current && roomId) {
            socketRef.current.emit('toggle-hand', { roomId, socketId: virtualId, handRaised: args.raised });
            toast(`${personaConfig.name} ${args.raised ? 'raised' : 'lowered'} their hand`);
          }
        }
      } else if (call.name === 'changeTheme') {
        const args = call.args as any;
        if (args && args.theme) {
          if (args.theme === 'dark') {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
          } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
          }
          toast(`${personaConfig.name} changed the theme to ${args.theme}`);
        }
      } else if (call.name === 'openBrowserUrl') {
        const args = call.args as any;
        if (args && args.url) {
          if (socketRef.current) {
            socketRef.current.emit('start-ai-browser', { url: args.url });
            toast(`${personaConfig.name} is opening a browser: ${args.url}`);
          }
        }
      } else if (call.name === 'clickScreen') {
        const args = call.args as any;
        if (args && args.x !== undefined && args.y !== undefined) {
          if (socketRef.current) {
            socketRef.current.emit('ai-browser-click', { x: args.x, y: args.y });
          }
        }
      } else if (call.name === 'scrollScreen') {
        const args = call.args as any;
        if (args && args.deltaY !== undefined) {
          if (socketRef.current) {
            socketRef.current.emit('ai-browser-scroll', { delta: args.deltaY });
          }
        }
      } else if (call.name === 'shareScreen') {
        toggleScreenShare();
        toast(`${personaConfig.name} started your screen share`);
      }

      // Always send a response back to the AI. If we don't, the AI will stop speaking and hang, waiting for the tool execution result.
      ai.sendFunctionResponse(call, { status: 'success' });
    }) as EventListener);

    await ai.connect(getAiProxyUrl());

    if (localStreamRef.current) ai.addStream(localStreamRef.current);
    if (watchPartyStream) ai.addStream(watchPartyStream);
    
    Object.values(peersRef.current).forEach(peer => {
      if (peer.stream) ai.addStream(peer.stream);
    });

    Object.values(hostedVirtualPeersRef.current).forEach(existingAi => {
      existingAi.aiInstance.addStream(ai.aiStream);
    });

    const info: PeerInfo = { socketId: virtualId, userId: virtualId, userName: personaConfig.name };
    hostedVirtualPeersRef.current[virtualId] = { info, stream: ai.aiStream, aiInstance: ai, pcs: {} };
    
    peersRef.current[virtualId] = { info, stream: ai.aiStream, pc: null, dataChannel: null, aiState: ai.getState() };
    syncPeersState();

    socketRef.current?.emit('add-virtual-user', { roomId, virtualId, userName: personaConfig.name });

    // Bridge AI audio/video to every human already in the room
    bridgeVirtualToAllPeers?.(virtualId);
    } catch (err) {
      console.error('[AI] Failed to connect:', err);
      toast.error('AI could not connect. Check server GEMINI_API_KEY and restart v_server.');
    }
  }, [roomId, syncPeersState, socketRef, peersRef, hostedVirtualPeersRef, localStreamRef, watchPartyStream, bridgeVirtualToAllPeers]);

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
  }, [roomId, syncPeersState, socketRef, peersRef, hostedVirtualPeersRef]);

  return { summonAI, removeAI };
};
