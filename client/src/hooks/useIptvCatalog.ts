import { useCallback, useEffect, useMemo, useState } from 'react';
import type { IptvChannel, IptvCountry, IptvStream, LiveChannel, StreamSource } from '@/lib/tvgarden/types';

const API = {
  countries: 'https://iptv-org.github.io/api/countries.json',
  channels: 'https://iptv-org.github.io/api/channels.json',
  streams: 'https://iptv-org.github.io/api/streams.json',
};

function isHttpsStream(url: string) {
  return url.startsWith('https://') || url.startsWith('http://');
}

export function useIptvCatalog() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countries, setCountries] = useState<IptvCountry[]>([]);
  const [channels, setChannels] = useState<LiveChannel[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [countriesRes, channelsRes, streamsRes] = await Promise.all([
          fetch(API.countries),
          fetch(API.channels),
          fetch(API.streams),
        ]);

        if (!countriesRes.ok || !channelsRes.ok || !streamsRes.ok) {
          throw new Error('Failed to load IPTV catalog');
        }

        const countriesData = (await countriesRes.json()) as IptvCountry[];
        const channelsData = (await channelsRes.json()) as IptvChannel[];
        const streamsData = (await streamsRes.json()) as IptvStream[];

        const countryMap = new Map(countriesData.map((c) => [c.code, c]));
        const streamsByChannel = new Map<string, StreamSource[]>();

        for (const stream of streamsData) {
          if (!stream.channel || !isHttpsStream(stream.url)) continue;
          const list = streamsByChannel.get(stream.channel) ?? [];
          list.push({
            url: stream.url,
            userAgent: stream.user_agent,
            referrer: stream.referrer || (() => { try { return new URL(stream.url).origin; } catch { return undefined; } })(),
          });
          streamsByChannel.set(stream.channel, list);
        }

        const live: LiveChannel[] = [];
        for (const ch of channelsData) {
          const sources = streamsByChannel.get(ch.id);
          if (!sources?.length || !ch.country) continue;
          const sorted = [...sources].sort((a, b) => {
            const ah = a.url.startsWith('https://') ? 0 : 1;
            const bh = b.url.startsWith('https://') ? 0 : 1;
            return ah - bh;
          });
          const country = countryMap.get(ch.country);
          live.push({
            id: ch.id,
            name: ch.name,
            countryCode: ch.country,
            countryName: country?.name ?? ch.country,
            flag: country?.flag ?? '🏳️',
            categories: ch.categories ?? [],
            streamUrl: sorted[0].url,
            streams: sorted,
            logo: ch.logo,
          });
        }

        live.sort((a, b) => a.countryName.localeCompare(b.countryName) || a.name.localeCompare(b.name));

        if (!cancelled) {
          setCountries(countriesData);
          setChannels(live);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const countriesWithChannels = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ch of channels) {
      counts.set(ch.countryCode, (counts.get(ch.countryCode) ?? 0) + 1);
    }
    return countries
      .filter((c) => counts.has(c.code))
      .map((c) => ({ ...c, channelCount: counts.get(c.code) ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [countries, channels]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const ch of channels) {
      for (const cat of ch.categories) set.add(cat);
    }
    return [...set].sort();
  }, [channels]);

  const getChannelsByCountry = useCallback(
    (code: string) => channels.filter((c) => c.countryCode === code),
    [channels],
  );

  const pickRandom = useCallback(() => {
    if (channels.length === 0) return null;
    return channels[Math.floor(Math.random() * channels.length)];
  }, [channels]);

  return {
    loading,
    error,
    countriesWithChannels,
    channels,
    categories,
    getChannelsByCountry,
    pickRandom,
  };
}
