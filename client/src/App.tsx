import { useState } from 'react';
import { PreCallLobby } from './components/PreCallLobby';
import { CallRoom } from './components/CallRoom';
import { TvGardenPanel } from './components/tvgarden/TvGardenPanel';

type AppScreen = 'lobby' | 'call' | 'tvgarden';

function App() {
  const [screen, setScreen] = useState<AppScreen>('lobby');
  const [callParams, setCallParams] = useState<{
    room: string;
    name: string;
    audioId: string;
    videoId: string;
  } | null>(null);

  const handleJoin = (room: string, name: string, audioId: string, videoId: string) => {
    setCallParams({ room, name, audioId, videoId });
    setScreen('call');
  };

  const handleLeave = () => {
    setCallParams(null);
    setScreen('lobby');
  };

  if (screen === 'tvgarden') {
    return <TvGardenPanel onClose={() => setScreen('lobby')} />;
  }

  if (screen === 'call' && callParams) {
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
      onOpenTvGarden={() => setScreen('tvgarden')}
      defaultRoom="lobby"
    />
  );
}

export default App;
