import type { LiveChannel } from './types';

/** Topic → extra terms + IPTV-org category hints */
const TOPIC_INTENTS: Record<string, { terms: string[]; categories: string[] }> = {
  football: {
    terms: ['football', 'soccer', 'futbol', 'futebol', 'calcio', 'liga', 'premier', 'uefa', 'fifa', 'bundesliga', 'champions', 'serie a', 'la liga', 'foot', 'goal', 'match tv', 'bein sport', 'espn', 'sky sport'],
    categories: ['sports'],
  },
  sports: {
    terms: ['sport', 'sports', 'espn', 'fox sports', 'bein', 'sky sport', 'dazn', 'nba', 'nfl', 'mlb', 'nhl', 'tennis', 'golf', 'f1', 'formula', 'motorsport', 'cricket', 'rugby', 'ufc', 'boxing', 'olympic'],
    categories: ['sports'],
  },
  news: {
    terms: ['news', 'noticias', 'nachrichten', 'actualites', 'noticias', 'breaking', 'headline', 'cnn', 'bbc', 'al jazeera', 'sky news', 'fox news', 'msnbc', 'cnbc', 'euronews'],
    categories: ['news'],
  },
  movies: {
    terms: ['movie', 'movies', 'film', 'cinema', 'hbo', 'showtime', 'starz', 'cine', 'pelicula'],
    categories: ['movies', 'entertainment'],
  },
  music: {
    terms: ['music', 'mtv', 'vh1', 'radio', 'fm', 'hit', 'pop', 'rock', 'jazz', 'concert'],
    categories: ['music'],
  },
  kids: {
    terms: ['kids', 'children', 'cartoon', 'disney', 'nickelodeon', 'nick jr', 'cartoonito', 'baby'],
    categories: ['kids'],
  },
  cooking: {
    terms: ['cook', 'cooking', 'food', 'kitchen', 'chef', 'recipe', 'gourmet', 'tasty'],
    categories: ['cooking', 'entertainment', 'lifestyle'],
  },
  documentary: {
    terms: ['documentary', 'discovery', 'history', 'nat geo', 'national geographic', 'science', 'nature', 'wildlife'],
    categories: ['documentary', 'education'],
  },
  anime: {
    terms: ['anime', 'manga', 'otaku', 'crunchyroll'],
    categories: ['entertainment', 'animation'],
  },
  religious: {
    terms: ['god', 'church', 'christian', 'islam', 'muslim', 'catholic', 'gospel', 'bible', 'prayer', 'worship'],
    categories: ['religious'],
  },
};

const INTENT_KEYS = Object.keys(TOPIC_INTENTS);

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

function resolveIntent(query: string): string | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  if (TOPIC_INTENTS[q]) return q;
  for (const key of INTENT_KEYS) {
    if (q.includes(key) || key.includes(q)) return key;
    if (TOPIC_INTENTS[key].terms.some((t) => q.includes(t) || t.includes(q))) return key;
  }
  for (const key of INTENT_KEYS) {
    if (levenshtein(q, key) <= 2) return key;
  }
  return null;
}

export interface SearchAnalysis {
  terms: string[];
  intent: string | null;
  intentLabel: string | null;
  suggestedCategories: string[];
  isTopic: boolean;
}

export function analyzeSearchQuery(query: string): SearchAnalysis {
  const raw = query.trim().toLowerCase();
  if (!raw) {
    return { terms: [], intent: null, intentLabel: null, suggestedCategories: [], isTopic: false };
  }

  const intent = resolveIntent(raw);
  const words = raw.split(/\s+/).filter(Boolean);
  const terms = new Set<string>(words);

  if (intent) {
    terms.add(intent);
    for (const t of TOPIC_INTENTS[intent].terms) terms.add(t);
    return {
      terms: [...terms],
      intent,
      intentLabel: intent.charAt(0).toUpperCase() + intent.slice(1),
      suggestedCategories: TOPIC_INTENTS[intent].categories,
      isTopic: true,
    };
  }

  return {
    terms: words,
    intent: null,
    intentLabel: null,
    suggestedCategories: [],
    isTopic: words.length > 0 && raw.length >= 3,
  };
}

function scoreChannel(ch: LiveChannel, analysis: SearchAnalysis, activeCategory: string | null): number {
  const name = ch.name.toLowerCase();
  const id = ch.id.toLowerCase();
  const cats = ch.categories.map((c) => c.toLowerCase());
  const catStr = cats.join(' ');
  const country = ch.countryName.toLowerCase();

  let score = 0;

  if (activeCategory && cats.includes(activeCategory.toLowerCase())) {
    score += 25;
  }

  for (const cat of analysis.suggestedCategories) {
    if (cats.includes(cat)) score += 45;
  }

  for (const term of analysis.terms) {
    if (term.length < 2) continue;
    if (name === term) score += 120;
    else if (name.startsWith(term)) score += 70;
    else if (name.includes(term)) score += 45;
    if (id.includes(term)) score += 20;
    if (catStr.includes(term)) score += 50;
    if (country.includes(term)) score += 15;
  }

  if (analysis.intent === 'football' || analysis.intent === 'sports') {
    if (/\b(sport|football|soccer|liga|fifa|uefa|nfl|nba|bein)\b/i.test(ch.name)) score += 30;
  }

  return score;
}

export function searchChannels(
  channels: LiveChannel[],
  query: string,
  options: { category?: string | null; limit?: number } = {},
): LiveChannel[] {
  const analysis = analyzeSearchQuery(query);
  if (!query.trim() || analysis.terms.length === 0) return [];

  const scored = channels
    .map((ch) => ({ ch, score: scoreChannel(ch, analysis, options.category ?? null) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.ch.name.localeCompare(b.ch.name));

  const limit = options.limit ?? 500;
  return scored.slice(0, limit).map(({ ch }) => ch);
}

export function filterCountriesByQuery<T extends { name: string; code: string }>(
  countries: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return countries;
  return countries.filter(
    (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
  );
}

export const QUICK_SEARCHES = [
  { label: 'Football', query: 'football' },
  { label: 'Sports', query: 'sports' },
  { label: 'News', query: 'news' },
  { label: 'Movies', query: 'movies' },
  { label: 'Music', query: 'music' },
  { label: 'Kids', query: 'kids' },
] as const;
