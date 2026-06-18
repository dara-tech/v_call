import React from 'react';
import { X } from 'lucide-react';

interface OutgoingCallOverlayProps {
  partnerName: string;
  status: 'calling' | 'ringing';
  onCancel: () => void;
}

export const OutgoingCallOverlay: React.FC<OutgoingCallOverlayProps> = ({
  partnerName,
  status,
  onCancel,
}) => {
  return (
    <div className="absolute inset-0 bg-[#0f0f0f]/95 z-[60] flex flex-col items-center justify-center backdrop-blur-md">
      <div className="flex flex-col items-center max-w-sm text-center px-6">
        {/* Pulsing Avatar */}
        <div className="relative mb-8">
          <div className="absolute inset-0 rounded-full bg-[#3390ec]/20 animate-ping" style={{ animationDuration: '2s' }} />
          <div className="absolute -inset-4 rounded-full border border-[#3390ec]/30 animate-pulse" />
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#3390ec] to-[#2b7cb9] flex items-center justify-center text-white text-3xl font-bold shadow-2xl relative z-10 font-sans">
            {partnerName[0]?.toUpperCase() || 'C'}
          </div>
        </div>
        
        <h2 className="text-2xl font-bold text-white mb-2 font-sans">{partnerName}</h2>
        <p className="text-[#aaaaaa] text-base mb-12 animate-pulse font-sans">
          {status === 'ringing' ? 'Ringing...' : 'Calling...'}
        </p>
        
        <button
          onClick={onCancel}
          className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 active:scale-95 text-white flex items-center justify-center transition-all shadow-[0_4px_24px_rgba(239,68,68,0.4)] cursor-pointer"
        >
          <X className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};
