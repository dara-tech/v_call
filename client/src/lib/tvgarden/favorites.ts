const KEY = 'tvgarden:favorites';

export function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveFavorites(ids: string[]) {
  localStorage.setItem(KEY, JSON.stringify(ids));
}

export function toggleFavorite(id: string): string[] {
  const current = loadFavorites();
  const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
  saveFavorites(next);
  return next;
}

export function isFavorite(id: string): boolean {
  return loadFavorites().includes(id);
}
