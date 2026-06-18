import React from 'react';
import { Phone, X } from 'lucide-react';

interface IncomingCallOverlayProps {
  partnerName: string;
  onAccept: () => void;
  onDecline: () => void;
}

export const IncomingCallOverlay: React.FC<IncomingCallOverlayProps> = ({
  partnerName,
  onAccept,
  onDecline,
}) => {
  return (
    <div className="absolute inset-0 bg-[#0f0f0f]/85 z-[60] flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-[#1c1c1c]/90 border border-white/10 backdrop-blur-xl rounded-2xl w-full max-w-[360px] p-6 text-center shadow-[0_12px_40px_rgba(0,0,0,0.6)] flex flex-col items-center">
        <span className="text-[12px] uppercase tracking-wider text-[#3390ec] font-bold mb-4 font-sans">Incoming Video Call</span>
        
        <div className="relative mb-6">
          <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping" style={{ animationDuration: '3s' }} />
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#5fe3c8] to-[#3390ec] flex items-center justify-center text-white text-2xl font-bold shadow-xl font-sans">
            {partnerName?.[0]?.toUpperCase() || 'C'}
          </div>
        </div>
        
        <h3 className="text-xl font-semibold text-white mb-1 font-sans">{partnerName}</h3>
        <p className="text-[#aaaaaa] text-sm mb-8 font-sans">is inviting you to a video call...</p>
        
        <div className="flex items-center justify-center gap-6 w-full font-sans">
          <button
            onClick={onDecline}
            className="flex-1 h-12 rounded-xl bg-red-500/10 hover:bg-red-500/20 active:scale-95 text-red-500 border border-red-500/20 flex items-center justify-center gap-2 font-medium transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
            Decline
          </button>
          
          <button
            onClick={onAccept}
            className="flex-1 h-12 rounded-xl bg-green-500 hover:bg-green-600 active:scale-95 text-white flex items-center justify-center gap-2 font-semibold transition-all shadow-[0_4px_16px_rgba(34,197,94,0.3)] animate-pulse cursor-pointer"
          >
            <Phone className="w-5 h-5" />
            Accept
          </button>
        </div>
      </div>
    </div>
  );
};
