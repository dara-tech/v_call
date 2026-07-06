import React, { useEffect, useRef } from 'react';
import { getLanguageLabel } from '../lib/ai/liveConfig';
import type { TranslateTranscriptLine } from '../hooks/useLiveTranslate';

interface LiveTranslatePanelProps {
  inputLanguageCode: string | null;
  targetLanguageCode: string;
  inputLiveText: string;
  outputLiveText: string;
  inputHistory: TranslateTranscriptLine[];
  outputHistory: TranslateTranscriptLine[];
  translateState: string;
}

function TranscriptPane({
  label,
  languageCode,
  liveText,
  history,
  accent,
}: {
  label: string;
  languageCode: string | null;
  liveText: string;
  history: TranslateTranscriptLine[];
  accent: 'cyan' | 'violet';
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const accentText = accent === 'cyan' ? 'text-cyan-300/90' : 'text-violet-300/90';
  const liveTextClass = accent === 'cyan' ? 'text-zinc-200' : 'text-zinc-100';
  const dotClass = accent === 'cyan' ? 'bg-cyan-400' : 'bg-violet-400';

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [history, liveText]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden border-white/5 sm:border-r last:sm:border-r-0">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/5 px-3 py-2">
        <span className={`text-[10px] font-medium uppercase tracking-wide ${accentText}`}>
          {label}
        </span>
        <span className="text-[10px] text-zinc-600">·</span>
        <span className="truncate text-xs font-medium text-zinc-300">
          {getLanguageLabel(languageCode)}
        </span>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {history.length === 0 && !liveText && (
          <p className="text-xs text-zinc-600">…</p>
        )}

        <div className="space-y-2">
          {history.map((line) => (
            <p key={line.id} className="text-sm leading-snug text-zinc-500">
              {line.text}
            </p>
          ))}

          {liveText && (
            <p className={`text-sm leading-snug ${liveTextClass}`}>
              {liveText}
              <span className={`ml-1 inline-block size-1.5 animate-pulse rounded-full ${dotClass}`} />
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export const LiveTranslatePanel: React.FC<LiveTranslatePanelProps> = ({
  inputLanguageCode,
  targetLanguageCode,
  inputLiveText,
  outputLiveText,
  inputHistory,
  outputHistory,
  translateState,
}) => {
  const statusClass =
    translateState === 'connected'
      ? 'text-emerald-500/80'
      : translateState === 'reconnecting'
        ? 'text-amber-500/80 animate-pulse'
        : 'text-zinc-600';

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0a0a0a]">
      <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-3 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          Translate
        </span>
        <span className={`text-[10px] capitalize ${statusClass}`}>{translateState}</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col divide-y divide-white/5 sm:flex-row sm:divide-x sm:divide-y-0">
        <TranscriptPane
          label="In"
          languageCode={inputLanguageCode}
          liveText={inputLiveText}
          history={inputHistory}
          accent="cyan"
        />
        <TranscriptPane
          label="Out"
          languageCode={targetLanguageCode}
          liveText={outputLiveText}
          history={outputHistory}
          accent="violet"
        />
      </div>
    </div>
  );
};
