const GEOJSON_URL =
  'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_admin_0_countries.geojson';

export interface CountryShape {
  code: string;
  name: string;
  /** Each entry is one polygon part (GeoJSON rings: [outer, ...holes]). */
  parts: number[][][][];
}

let loadPromise: Promise<CountryShape[]> | null = null;

/** Map Natural Earth ISO fields to IPTV-org country codes. */
export function geoPropsToIptvCode(props: Record<string, string>): string | null {
  let code =
    props.ISO_A2_EH && props.ISO_A2_EH !== '-99'
      ? props.ISO_A2_EH
      : props.ISO_A2;

  if (!code || code === '-99') {
    if (props.ADM0_A3 === 'KOS') return 'XK';
    if (props.ADM0_A3 === 'PSX') return 'PS';
    return null;
  }

  if (code === 'GB') return 'UK';
  if (code.includes('-')) code = code.split('-').pop() ?? code;

  return code;
}

function featureParts(geometry: { type: string; coordinates: number[][][][] | number[][][] }): number[][][][] {
  if (geometry.type === 'Polygon') return [geometry.coordinates as number[][][]];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates as number[][][][];
  return [];
}

export function loadCountryShapes(): Promise<CountryShape[]> {
  if (!loadPromise) {
    loadPromise = fetch(GEOJSON_URL)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load country map');
        return res.json();
      })
      .then((geojson: {
        features: Array<{
          properties: Record<string, string>;
          geometry: { type: string; coordinates: number[][][][] | number[][][] };
        }>;
      }) => {
        const byCode = new Map<string, CountryShape>();

        for (const feature of geojson.features) {
          const code = geoPropsToIptvCode(feature.properties);
          if (!code || code === 'AQ') continue;

          const parts = featureParts(feature.geometry);
          if (!parts.length) continue;

          const name = feature.properties.ADMIN ?? feature.properties.NAME ?? code;
          const existing = byCode.get(code);

          if (existing) {
            existing.parts.push(...parts);
          } else {
            byCode.set(code, { code, name, parts: [...parts] });
          }
        }

        return Array.from(byCode.values());
      });
  }

  return loadPromise;
}

/** Stable hue per country code (0–360). */
export function countryHue(code: string): number {
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = code.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

export function hslColor(h: number, s: number, l: number): number {
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return light - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  const r = Math.round(f(0) * 255);
  const g = Math.round(f(8) * 255);
  const b = Math.round(f(4) * 255);
  return (r << 16) | (g << 8) | b;
}

export function countryFillColor(code: string, _selected: boolean, hasChannels: boolean): number {
  const hue = countryHue(code);
  if (hasChannels) return hslColor(hue, 58, 48);
  return hslColor(hue, 22, 32);
}
