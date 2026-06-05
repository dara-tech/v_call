import React, { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, Mic, MicOff, PhoneOff, Activity, Loader2 } from 'lucide-react';
import { useAILiveCall } from '../hooks/useAILiveCall';

export const AIPanel: React.FC = () => {
  const {
    state,
    transcript,
    error,
    startCall,
    stopCall,
    isMuted,
    toggleMute,
    volume,
  } = useAILiveCall();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  return (
    <div className="flex flex-col h-full bg-zinc-950 border-l border-zinc-800 w-80 text-zinc-300">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-zinc-800 bg-zinc-900/40">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-brand-emerald" />
          <span className="text-xs font-semibold text-zinc-200">AI Live Assistant</span>
        </div>
        <div className="flex items-center gap-2">
          {state === 'connected' && (
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-emerald opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-emerald"></span>
            </span>
          )}
          {state === 'error' && (
            <span className="h-2 w-2 rounded-full bg-brand-rose"></span>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {state === 'idle' && (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center">
            <Sparkles className="size-8 text-zinc-600 mb-3" />
            <p className="text-sm font-medium text-zinc-300">Gemini Live</p>
            <p className="text-xs text-zinc-500 mt-2 mb-6">
              Start a real-time voice call with the AI assistant. It will only listen to your microphone.
            </p>
            <Button
              onClick={startCall}
              className="bg-brand-emerald hover:bg-brand-emerald/90 text-white text-xs w-full"
            >
              Start AI Call
            </Button>
            {error && <p className="text-xs text-brand-rose mt-4">{error}</p>}
          </div>
        )}

        {state === 'connecting' && (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center">
            <Loader2 className="size-8 text-brand-emerald animate-spin mb-3" />
            <p className="text-xs font-medium text-zinc-400">Connecting to Gemini...</p>
          </div>
        )}

        {state === 'connected' && (
          <>
            {/* Visualizer */}
            <div className="p-4 border-b border-zinc-800 flex flex-col items-center gap-3">
              <div className="relative size-16 flex items-center justify-center bg-zinc-900 rounded-full border border-zinc-800 shadow-inner">
                <Activity className={`size-6 transition-colors ${volume > 0.1 ? 'text-brand-emerald' : 'text-zinc-600'}`} />
                {volume > 0 && (
                  <div 
                    className="absolute inset-0 bg-brand-emerald/20 rounded-full animate-ping pointer-events-none transition-all duration-75"
                    style={{ transform: `scale(${1 + volume * 2})`, opacity: Math.max(0.1, volume) }}
                  />
                )}
              </div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Listening</p>
            </div>

            {/* Transcript */}
            <ScrollArea className="flex-1 p-4 bg-zinc-900/10">
              <div className="space-y-4">
                {!transcript ? (
                  <div className="text-center text-xs text-zinc-500 mt-4 italic">
                    AI response will appear here...
                  </div>
                ) : (
                  <div className="flex flex-col items-start max-w-[90%]">
                    <span className="text-[9px] font-semibold text-brand-emerald mb-0.5">Gemini</span>
                    <div className="px-3 py-2 rounded-lg text-xs leading-relaxed break-words bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-tl-none">
                      {transcript}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Controls */}
            <div className="p-3 border-t border-zinc-800 flex items-center justify-center gap-3 bg-zinc-950">
              <Button
                variant={isMuted ? 'destructive' : 'outline'}
                size="icon"
                onClick={toggleMute}
                className={`size-10 rounded-full border-zinc-800 ${isMuted ? 'bg-brand-rose' : 'bg-zinc-900 hover:bg-zinc-800'}`}
              >
                {isMuted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              </Button>
              <Button
                variant="destructive"
                size="icon"
                onClick={stopCall}
                className="size-10 rounded-full bg-brand-rose hover:bg-brand-rose/90"
              >
                <PhoneOff className="size-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
