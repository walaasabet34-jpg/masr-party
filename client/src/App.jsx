import { useEffect, useState } from 'react';
import { api, useStore } from './net.js';
import { T } from './copy.js';
import { useIsBig, ConnBanner, Blobs, Btn } from './ui/kit.jsx';
import { HomeDesktop, HomePhone, PickGamePhone } from './screens/Home.jsx';
import { SetupDesktop, VibePhone, BoatSetupPhone, JoinCode, Profile } from './screens/Setup.jsx';
import { RoomView } from './screens/Room.jsx';
import { sfx } from './sound.js';

const inviteCode = () => new URLSearchParams(location.search).get('join')?.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || null;

export default function App() {
  const { snap, session, resuming, closed, error, noDrinks } = useStore();
  const big = useIsBig();
  const [route, setRoute] = useState(() => (inviteCode() ? { name: 'join', code: inviteCode() } : { name: 'home' }));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.boot();
  }, []);
  // A QR link is consumed once we are inside a room.
  useEffect(() => {
    if (snap && location.search) history.replaceState(null, '', '/');
  }, [!!snap]);

  if (snap) return (
    <>
      <ConnBanner />
      <RoomView snap={snap} />
    </>
  );
  if (resuming && session)
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Blobs />
        <div className="relative font-display font-black text-2xl">{T.reconnecting}</div>
      </div>
    );

  if (closed)
    return (
      <div className="relative flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
        <Blobs color="red" />
        <div className="relative text-7xl">🚪</div>
        <h1 className="relative font-display font-black text-3xl">{T.errors[closed] ?? T.errors.party_gone}</h1>
        <Btn
          color="lime"
          size="lg"
          onClick={() => {
            api.clearError();
            setRoute({ name: 'home' });
          }}
        >
          {T.newParty}
        </Btn>
      </div>
    );

  const go = (name, extra = {}) => {
    api.clearError();
    setRoute({ ...route, ...extra, name });
  };
  const pickGame = (game) => {
    if (big) return go('setup', { game });
    go(game === 'party' ? 'vibe' : 'boatSetup', { game, mode: route.mode ?? 'medium' });
  };

  switch (route.name) {
    case 'setup':
      return <SetupDesktop game={route.game} onBack={() => go('home')} />;
    case 'pick':
      return <PickGamePhone onBack={() => go('home')} onPick={pickGame} />;
    case 'vibe':
      return <VibePhone mode={route.mode ?? 'medium'} setMode={(mode) => setRoute({ ...route, mode })} onBack={() => go('pick')} onNext={() => go('profile', { purpose: 'host' })} />;
    case 'boatSetup':
      return <BoatSetupPhone onBack={() => go('pick')} onNext={() => go('profile', { purpose: 'host', game: 'boat' })} />;
    case 'join':
      return <JoinCode initial={route.code ?? ''} onBack={() => go('home', { code: null })} onHost={() => go(big ? 'home' : 'pick')} onFound={(room) => go('profile', { purpose: 'join', room, code: room.code })} />;
    case 'profile':
      return (
        <Profile
          title={route.purpose === 'host' ? T.youHostTitle : T.youTitle}
          room={route.purpose === 'join' ? route.room : null}
          busy={busy}
          onBack={() => go(route.purpose === 'host' ? (route.game === 'boat' ? 'boatSetup' : 'vibe') : 'join')}
          onDone={async () => {
            setBusy(true);
            try {
              if (route.purpose === 'host') await api.hostOnPhone({ mode: route.mode ?? 'medium', format: route.game ?? 'party', noDrinks: route.game !== 'boat' && noDrinks });
              else await api.join(route.code);
              sfx.win();
            } catch {
              sfx.buzz();
            }
            setBusy(false);
          }}
        />
      );
    default:
      return big ? <HomeDesktop onPick={pickGame} /> : <HomePhone onJoin={() => go('join')} onHost={() => go('pick')} onPick={pickGame} />;
  }
}
