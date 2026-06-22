import { useState } from 'react';
import { PreCallLobby } from './components/PreCallLobby';
import { CallRoom } from './components/CallRoom';

function App() {
  const [callParams, setCallParams] = useState<{
    room: string;
    name: string;
    audioId: string;
    videoId: string;
  } | null>(null);

  const handleJoin = (room: string, name: string, audioId: string, videoId: string) => {
    setCallParams({ room, name, audioId, videoId });
  };

  const handleLeave = () => {
    setCallParams(null);
  };

  if (callParams) {
    return (
      <CallRoom 
        roomId={callParams.room}
        userName={callParams.name}
        userId={`user_${Math.random().toString(36).substr(2, 9)}`}
        initialAudioId={callParams.audioId}
        initialVideoId={callParams.videoId}
        activeCall={null}
        onLeave={handleLeave}
      />
    );
  }

  return (
    <PreCallLobby 
      onJoin={handleJoin} 
      defaultRoom="lobby" 
    />
  );
}

export default App;
