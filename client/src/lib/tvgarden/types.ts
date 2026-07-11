export interface IptvCountry {
  name: string;
  code: string;
  languages: string[];
  flag: string;
}

export interface IptvChannel {
  id: string;
  name: string;
  country: string;
  categories?: string[];
  website?: string;
  logo?: string;
}

export interface IptvStream {
  channel: string;
  url: string;
  timeshift?: string;
  user_agent?: string;
  referrer?: string;
}

export interface StreamSource {
  url: string;
  userAgent?: string;
  referrer?: string;
}

export interface LiveChannel {
  id: string;
  name: string;
  countryCode: string;
  countryName: string;
  flag: string;
  categories: string[];
  /** Primary stream (first HTTPS URL). */
  streamUrl: string;
  /** All known sources — try next if one fails. */
  streams: StreamSource[];
  logo?: string;
}

export type ViewMode = 'explore' | 'favorites' | 'about';
