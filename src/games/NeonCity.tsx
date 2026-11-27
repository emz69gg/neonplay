import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/AppStore';
import { destroyGame, initGame, type CityController, type CitySave } from './neoncity/engine';
import type { GameProps } from './shared';

/* Neon City — wraps the canvas engine and connects it to NeonPlay rewards. */

export default function NeonCity({ api, fresh }: GameProps) {
  const host = useRef<HTMLDivElement>(null);
  const ctl = useRef<CityController | null>(null);
  const { settings } = useStore();
  const [fs, setFs] = useState(false);

  useEffect(() => {
    const el = host.current!;
    const saved = fresh ? null : api.load<CitySave>();
    api.setScore(saved?.earned ?? 0);
    ctl.current = initGame(el, {
      save: saved,
      muted: settings.muted,
      volume: settings.volume,
      reducedMotion: settings.reducedMotion,
      onEvent: (e, save) => {
        // save first so achievements that read the save see the new state
        api.save({ ...save, shards: [...save.shards], best: { ...save.best }, medals: { ...save.medals } });
        api.setScore(save.earned);
        if (e.type === 'shard') {
          api.reward({ xp: 20, coins: 10 }, `Data shard ${e.count}/25`);
          api.reportScore(save.earned);
        } else if (e.type === 'delivery') {
          api.finish(save.earned, { win: e.onTime, activity: 'delivery', deliveries: e.deliveries, credits: e.reward });
        } else if (e.type === 'race') {
          api.finish(save.earned, { win: e.medal !== null, activity: 'race', medal: e.medal, route: e.route, time: e.time });
        }
      },
    });
    // keep the save in sync when leaving mid-session
    return () => {
      if (ctl.current) api.save(ctl.current.getSave());
      destroyGame();
      ctl.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    ctl.current?.setMuted(settings.muted, settings.volume);
  }, [settings.muted, settings.volume]);

  // taller stage in fullscreen
  useEffect(() => {
    const check = () => setFs(api.isFullscreen);
    const t = window.setInterval(check, 400);
    document.addEventListener('fullscreenchange', check);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('fullscreenchange', check);
    };
  }, [api]);

  return (
    <div className="w-full">
      <div
        ref={host}
        className="w-full overflow-hidden rounded-2xl border border-neon-purple/40 bg-[#05030c] shadow-neon"
        // phones: leave room for the page header and the bottom navigation bar
        style={{ height: fs ? 'calc(100vh - 120px)' : window.innerWidth < 640 ? 'max(380px, calc(100svh - 320px))' : 'min(78vh, 720px)', minHeight: 360 }}
      />
    </div>
  );
}
