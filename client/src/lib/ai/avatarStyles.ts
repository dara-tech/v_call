import type { AIPersona } from './types';
import { PERSONAS } from './personas';

/** Visual fallback when avatar image fails to load. */
export const AI_AVATAR_STYLES: Record<string, { from: string; to: string; initial: string }> = {
  lily: { from: '#06b6d4', to: '#0891b2', initial: 'L' },
  dara: { from: '#10b981', to: '#059669', initial: 'D' },
  monk: { from: '#8b5cf6', to: '#6d28d9', initial: 'M' },
  sisamouth: { from: '#f97316', to: '#ea580c', initial: 'S' },
  developer: { from: '#3b82f6', to: '#2563eb', initial: 'Dev' },
  madai: { from: '#ec4899', to: '#7c3aed', initial: 'MAD' },
  terminator: { from: '#71717a', to: '#18181b', initial: 'T-800' },
  fifa2026: { from: '#16a34a', to: '#1d4ed8', initial: 'WC' },
  footballlegend: { from: '#f59e0b', to: '#b45309', initial: '⚽' },
  teacher: { from: '#eab308', to: '#ca8a04', initial: 'T' },
  questioner: { from: '#a78bfa', to: '#6d28d9', initial: '?' },
  priest: { from: '#6366f1', to: '#4338ca', initial: 'P' },
  imam: { from: '#14b8a6', to: '#0d9488', initial: 'I' },
  vishnu: { from: '#2563eb', to: '#1e3a8a', initial: 'Vi' },
  lucifer: { from: '#dc2626', to: '#7f1d1d', initial: 'Lu' },
  satan: { from: '#be123c', to: '#881337', initial: 'Sa' },
  baphomet: { from: '#d97706', to: '#78350f', initial: 'B' },
  god: { from: '#fde047', to: '#ca8a04', initial: 'G' },
  ganthy: { from: '#f5f5f4', to: '#78716c', initial: 'Ga' },
  genghis: { from: '#78716c', to: '#44403c', initial: 'GK' },
  newtorn: { from: '#64748b', to: '#1e293b', initial: 'N' },
  buddah: { from: '#fcd34d', to: '#b45309', initial: 'Bu' },
  angel: { from: '#e0f2fe', to: '#7dd3fc', initial: 'An' },
  hochiminh: { from: '#d4d4d8', to: '#52525b', initial: 'HCM' },
  hivsop: { from: '#dc2626', to: '#991b1b', initial: 'HIV' },
  polpot: { from: '#0f766e', to: '#115e59', initial: 'PP' },
};

const DISPLAY_NAME_TO_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(PERSONAS).map(([key, config]) => [config.name.toLowerCase(), key]),
);

DISPLAY_NAME_TO_KEY['senior dev'] = 'developer';
DISPLAY_NAME_TO_KEY['ho chi minh'] = 'hochiminh';
DISPLAY_NAME_TO_KEY['genghis khan'] = 'genghis';
DISPLAY_NAME_TO_KEY['mad ai'] = 'madai';
DISPLAY_NAME_TO_KEY['t-800'] = 'terminator';
DISPLAY_NAME_TO_KEY['fifa analyzer'] = 'fifa2026';
DISPLAY_NAME_TO_KEY['fifa 2026'] = 'fifa2026';
DISPLAY_NAME_TO_KEY['world cup 2026'] = 'fifa2026';
DISPLAY_NAME_TO_KEY['the questioner'] = 'questioner';
DISPLAY_NAME_TO_KEY['កំពូលអ្នកចាក់បាល់'] = 'footballlegend';
DISPLAY_NAME_TO_KEY['online pool'] = 'footballlegend';
DISPLAY_NAME_TO_KEY['pool legend'] = 'footballlegend';
DISPLAY_NAME_TO_KEY['hiv sop'] = 'hivsop';
DISPLAY_NAME_TO_KEY['hiv sop indicator'] = 'hivsop';
DISPLAY_NAME_TO_KEY['expert hiv sop indicator'] = 'hivsop';
DISPLAY_NAME_TO_KEY['hiv sop expert'] = 'hivsop';
DISPLAY_NAME_TO_KEY['pol pot'] = 'polpot';
DISPLAY_NAME_TO_KEY['saloth sar'] = 'polpot';

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
