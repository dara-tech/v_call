import type { AIPersona } from './types';
import { PERSONAS } from './personas';
import { VOICE_EMOTION_SYSTEM_PREFIX } from './voiceEmotion';

/** Gemini 3.1 Flash Live — low latency voice + video. */
export const GEMINI_LIVE_MODEL =
  import.meta.env.VITE_GEMINI_LIVE_MODEL ||
  'models/gemini-3.1-flash-live-preview';

/** Google docs: real-time voice-to-voice translation (separate from Live Agent personas). */
export const GEMINI_LIVE_TRANSLATE_DOCS_URL =
  'https://ai.google.dev/gemini-api/docs/live-api/live-translate';

/** Gemini Live Translate — audio in → translated audio out (70+ languages). */
export const GEMINI_LIVE_TRANSLATE_MODEL =
  import.meta.env.VITE_GEMINI_LIVE_TRANSLATE_MODEL ||
  'models/gemini-3.5-live-translate-preview';

export const LIVE_TRANSLATE_LANGUAGES: { code: string; label: string }[] = [
  { code: 'km', label: 'ខ្មែរ' },
  { code: 'en', label: 'English' },
  { code: 'th', label: 'ไทย' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'zh-Hans', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
];

const LANGUAGE_LABELS: Record<string, string> = Object.fromEntries(
  LIVE_TRANSLATE_LANGUAGES.map((l) => [l.code, l.label]),
);

export function getLanguageLabel(code: string | null | undefined): string {
  if (!code) return 'Detecting…';
  return LANGUAGE_LABELS[code] ?? code;
}

export function buildLiveTranslateSetupPayload(
  targetLanguageCode: string,
  sessionHandle: string | null,
) {
  const setupPayload: Record<string, unknown> = {
    model: GEMINI_LIVE_TRANSLATE_MODEL,
    // WebSocket API: transcription fields belong on setup root, not inside generationConfig.
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    generationConfig: {
      responseModalities: ['AUDIO'],
      translationConfig: {
        targetLanguageCode,
        echoTargetLanguage: true,
      },
    },
  };

  if (sessionHandle) {
    setupPayload.sessionResumption = { handle: sessionHandle };
  }

  return setupPayload;
}

export function buildLiveSetupPayload(personaId: AIPersona, sessionHandle: string | null) {
  const personaConfig = PERSONAS[personaId];

  const setupPayload: Record<string, unknown> = {
    model: GEMINI_LIVE_MODEL,
    tools: [{
      functionDeclarations: [
        {
          name: 'changeTheme',
          description: 'Changes the app theme to light or dark.',
          parameters: {
            type: 'OBJECT',
            properties: { theme: { type: 'STRING', enum: ['light', 'dark'] } },
            required: ['theme'],
          },
        },
        {
          name: 'shareScreen',
          description: "Starts sharing the user's screen.",
        },
        {
          name: 'raiseHand',
          description: 'Toggles raised hand in the call.',
          parameters: {
            type: 'OBJECT',
            properties: { raised: { type: 'BOOLEAN' } },
            required: ['raised'],
          },
        },
        {
          name: 'react',
          description: 'Sends an emoji reaction.',
          parameters: {
            type: 'OBJECT',
            properties: { emoji: { type: 'STRING' } },
            required: ['emoji'],
          },
        },
        {
          name: 'openBrowserUrl',
          description: 'Opens a hidden browser to a URL.',
          parameters: {
            type: 'OBJECT',
            properties: { url: { type: 'STRING' } },
            required: ['url'],
          },
        },
        {
          name: 'clickScreen',
          description: 'Clicks browser screen at x,y.',
          parameters: {
            type: 'OBJECT',
            properties: { x: { type: 'NUMBER' }, y: { type: 'NUMBER' } },
            required: ['x', 'y'],
          },
        },
        {
          name: 'scrollScreen',
          description: 'Scrolls the browser.',
          parameters: {
            type: 'OBJECT',
            properties: { deltaY: { type: 'NUMBER' } },
            required: ['deltaY'],
          },
        },
      ],
    }],
    systemInstruction: {
      parts: [{ text: VOICE_EMOTION_SYSTEM_PREFIX + personaConfig.prompt }],
    },
    generationConfig: {
      responseModalities: ['AUDIO'],
      thinkingConfig: { thinkingLevel: 'minimal' },
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: personaConfig.voice,
          },
        },
      },
    },
  };

  if (sessionHandle) {
    setupPayload.sessionResumption = { handle: sessionHandle };
  }

  return setupPayload;
}
