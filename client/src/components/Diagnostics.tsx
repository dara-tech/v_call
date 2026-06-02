import React from 'react';
import type { CallStats } from '../hooks/useWebRTC';
import { ShieldCheck, AlertTriangle, Activity } from 'lucide-react';

interface DiagnosticsProps {
  stats: CallStats;
}

export const Diagnostics: React.FC<DiagnosticsProps> = ({ stats }) => {
  const { latency, bitrateIn, bitrateOut, packetLoss, fps, resolution, connectionState } = stats;

  // Determine status color based on latency and state
  const getLatencyColor = (ms: number) => {
    if (ms === 0) return 'text-zinc-500';
    if (ms < 100) return 'text-brand-emerald';
    if (ms < 250) return 'text-amber-400';
    return 'text-brand-rose';
  };

  const getLatencyLabel = (ms: number) => {
    if (ms === 0) return 'Gathering...';
    if (ms < 100) return 'Excellent';
    if (ms < 250) return 'Fair';
    return 'Poor Connection';
  };

  const formatBitrate = (kbps: number) => {
    if (kbps < 1000) return `${kbps} kbps`;
    return `${(kbps / 1000).toFixed(1)} Mbps`;
  };

  const getConnectionStateColor = (state: string) => {
    switch (state) {
      case 'connected':
        return 'bg-brand-emerald';
      case 'checking':
      case 'connecting':
        return 'bg-amber-400 animate-pulse';
      case 'disconnected':
      case 'failed':
        return 'bg-brand-rose';
      default:
        return 'bg-zinc-500';
    }
  };

  return (
    <div className="bg-zinc-950/90 border border-zinc-800 rounded-lg p-4 w-72 text-zinc-300 font-sans shadow-xl backdrop-blur-md space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
          <Activity className="size-3.5" /> Call Diagnostics
        </span>
        <div className="flex items-center gap-1.5">
          <span className={`size-2 rounded-full ${getConnectionStateColor(connectionState)}`} />
          <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-tight">{connectionState}</span>
        </div>
      </div>

      {/* RTT / Latency */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">Latency (RTT)</span>
        <div className="text-right">
          <div className={`text-xs font-mono font-bold ${getLatencyColor(latency)}`}>
            {latency === 0 ? 'N/A' : `${latency}ms`}
          </div>
          <div className="text-[9px] text-zinc-500">{getLatencyLabel(latency)}</div>
        </div>
      </div>

      {/* Video Quality */}
      <div className="grid grid-cols-2 gap-4 border-y border-zinc-800/40 py-3">
        <div>
          <span className="text-[10px] text-zinc-500 block">Resolution</span>
          <span className="text-xs font-mono font-medium text-zinc-200">{resolution === '0x0' ? 'N/A' : resolution}</span>
        </div>
        <div>
          <span className="text-[10px] text-zinc-500 block">Framerate</span>
          <span className="text-xs font-mono font-medium text-zinc-200">{fps === 0 ? 'N/A' : `${fps} FPS`}</span>
        </div>
      </div>

      {/* Network Bandwidth */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-zinc-400">Incoming Bitrate</span>
          <span className="font-mono text-zinc-300">{formatBitrate(bitrateIn)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-zinc-400">Outgoing Bitrate</span>
          <span className="font-mono text-zinc-300">{formatBitrate(bitrateOut)}</span>
        </div>
      </div>

      {/* Integrity */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-800/40 text-[10px]">
        <span className="text-zinc-500">Packet Loss</span>
        <div className="flex items-center gap-1">
          {packetLoss > 0 ? (
            <>
              <AlertTriangle className="size-3 text-amber-400" />
              <span className="font-mono text-amber-400">{packetLoss} pkts</span>
            </>
          ) : (
            <>
              <ShieldCheck className="size-3 text-brand-emerald" />
              <span className="text-brand-emerald font-mono">0 lost</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
