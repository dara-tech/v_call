import { useState } from 'react';
import { PreCallLobby } from './components/PreCallLobby';
import { CallRoom } from './components/CallRoom';

function App() {
  const [step, setStep] = useState<'lobby' | 'call'>('lobby');
    const [roomId, setRoomId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room')?.toLowerCase() || '';
  });
  const [userName, setUserName] = useState('');
  const [userId] = useState(() => {
    // Generate persistent UUID for session
    const cached = sessionStorage.getItem('v_call_user_id');
    if (cached) return cached;
    const newId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem('v_call_user_id', newId);
    return newId;
  });
  
  // Selected device memory
  const [audioDeviceId, setAudioDeviceId] = useState('');
  const [videoDeviceId, setVideoDeviceId] = useState('');

  const handleJoinCall = (joinedRoom: string, name: string, audioId: string, videoId: string) => {
    setRoomId(joinedRoom);
    setUserName(name);
    setAudioDeviceId(audioId);
    setVideoDeviceId(videoId);
    
    // Update URL to match room ID so they can easily share link
    const newUrl = `${window.location.origin}${window.location.pathname}?room=${joinedRoom}`;
    window.history.pushState({ path: newUrl }, '', newUrl);
    
    setStep('call');
  };

  const handleLeaveCall = () => {
    setStep('lobby');
    // Clear the room query parameter from the URL when leaving
    const cleanUrl = `${window.location.origin}${window.location.pathname}`;
    window.history.pushState({ path: cleanUrl }, '', cleanUrl);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center">
      {step === 'lobby' ? (
        <PreCallLobby onJoin={handleJoinCall} defaultRoom={roomId} />
      ) : (
        <CallRoom
          roomId={roomId}
          userName={userName}
          userId={userId}
          initialAudioId={audioDeviceId}
          initialVideoId={videoDeviceId}
          onLeave={handleLeaveCall}
        />
      )}
    </div>
  );
}

export default App;
