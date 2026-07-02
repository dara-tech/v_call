import type { AIPersona } from './types';
import { PERSONAS } from './personas';

/** Visual fallback when avatar image fails to load. */
export const AI_AVATAR_STYLES: Record<string, { from: string; to: string; initial: string }> = {
  lily: { from: '#06b6d4', to: '#0891b2', initial: 'L' },
  dara: { from: '#10b981', to: '#059669', initial: 'D' },
  monk: { from: '#8b5cf6', to: '#6d28d9', initial: 'M' },
  sisamouth: { from: '#f97316', to: '#ea580c', initial: 'S' },
  developer: { from: '#3b82f6', to: '#2563eb', initial: 'Dev' },
  teacher: { from: '#eab308', to: '#ca8a04', initial: 'T' },
  priest: { from: '#6366f1', to: '#4338ca', initial: 'P' },
  imam: { from: '#14b8a6', to: '#0d9488', initial: 'I' },
  lucifer: { from: '#dc2626', to: '#7f1d1d', initial: 'Lu' },
  satan: { from: '#be123c', to: '#881337', initial: 'Sa' },
  baphomet: { from: '#d97706', to: '#78350f', initial: 'B' },
  god: { from: '#fde047', to: '#ca8a04', initial: 'G' },
  ganthy: { from: '#f5f5f4', to: '#78716c', initial: 'Ga' },
  newtorn: { from: '#64748b', to: '#1e293b', initial: 'N' },
  buddah: { from: '#fcd34d', to: '#b45309', initial: 'Bu' },
  angel: { from: '#e0f2fe', to: '#7dd3fc', initial: 'An' },
  hochiminh: { from: '#d4d4d8', to: '#52525b', initial: 'HCM' },
};

const DISPLAY_NAME_TO_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(PERSONAS).map(([key, config]) => [config.name.toLowerCase(), key]),
);

DISPLAY_NAME_TO_KEY['senior dev'] = 'developer';
DISPLAY_NAME_TO_KEY['ho chi minh'] = 'hochiminh';

export function resolvePersonaKey(displayName: string): string {
  const normalized = displayName.trim().toLowerCase();
  return DISPLAY_NAME_TO_KEY[normalized] ?? normalized;
}

export function getPersonaAvatarUrl(personaOrName: string): string {
  const key = resolvePersonaKey(personaOrName);
  return `/avatars/${key}.png`;
}

export function getAvatarAssetPaths(displayName: string): string[] {
  const key = resolvePersonaKey(displayName);
  return [`/avatars/${key}.png`, `/avatars/${key}.svg`];
}

export function getAvatarFallbackStyle(displayName: string) {
  const key = resolvePersonaKey(displayName);
  return AI_AVATAR_STYLES[key] ?? {
    from: '#52525b',
    to: '#18181b',
    initial: displayName.charAt(0).toUpperCase(),
  };
}

export function getPersonaAvatarUrlFromKey(key: AIPersona): string {
  return `/avatars/${key}.png`;
}
