import React, { useMemo, useState } from 'react';
import { Bot } from 'lucide-react';
import { getAvatarAssetPaths, getAvatarFallbackStyle } from '../lib/ai/avatarStyles';

interface AiPersonaAvatarProps {
  name: string;
  className?: string;
}

export const AiPersonaAvatar: React.FC<AiPersonaAvatarProps> = ({
  name,
  className = 'h-full w-full object-cover',
}) => {
  const paths = useMemo(() => getAvatarAssetPaths(name), [name]);
  const fallback = useMemo(() => getAvatarFallbackStyle(name), [name]);
  const [pathIndex, setPathIndex] = useState(0);
  const [showFallback, setShowFallback] = useState(false);

  if (showFallback || pathIndex >= paths.length) {
    return (
      <div
        className={`${className} flex flex-col items-center justify-center gap-2`}
        style={{
          background: `linear-gradient(135deg, ${fallback.from}, ${fallback.to})`,
        }}
      >
        <Bot className="size-10 text-white/40" />
        <span className="text-2xl font-bold tracking-tight text-white/90">
          {fallback.initial}
        </span>
      </div>
    );
  }

  return (
    <img
      src={paths[pathIndex]}
      className={className}
      alt={name}
      draggable={false}
      onError={() => {
        if (pathIndex + 1 < paths.length) {
          setPathIndex((i) => i + 1);
        } else {
          setShowFallback(true);
        }
      }}
    />
  );
};
