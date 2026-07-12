import { lazy, Suspense, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PreCallLobby } from './components/PreCallLobby';
import { CallRoom } from './components/CallRoom';
import { TvGardenErrorBoundary } from './components/tvgarden/TvGardenErrorBoundary';

const TvGardenPanel = lazy(() =>
  import('./components/tvgarden/TvGardenPanel').then((m) => ({ default: m.TvGardenPanel })),
);

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
    return (
      <TvGardenErrorBoundary onClose={() => setScreen('lobby')}>
        <Suspense
          fallback={
            <div className="flex h-dvh min-h-screen items-center justify-center bg-[#050810] text-zinc-400">
              <Loader2 className="size-6 animate-spin text-brand-cyan" />
            </div>
          }
        >
          <TvGardenPanel onClose={() => setScreen('lobby')} />
        </Suspense>
      </TvGardenErrorBoundary>
    );
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
