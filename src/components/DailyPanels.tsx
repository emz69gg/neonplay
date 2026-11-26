import { Link } from 'react-router-dom';
import { GAME_MAP } from '../lib/games';
import { dailyChallenges, LOGIN_REWARDS, loginStatus } from '../lib/progression';
import { useStore } from '../store/AppStore';
import { Coin } from './ui';

function useCountdown() {
  const now = new Date();
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  const ms = end.getTime() - now.getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

export function DailyLogin() {
  const { data, claimLogin } = useStore();
  const st = loginStatus(data);
  const currentDay = st.claimedToday ? ((data.login.streak - 1) % 7) : st.dayIndex;
  const reset = useCountdown();
  return (
    <div className="card relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-neon-purple/20 blur-3xl" />
      <div className="relative mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold">🎁 Daily Login Reward</h3>
          <p className="text-xs text-muted">
            {st.claimedToday ? `Streak: ${data.login.streak} day${data.login.streak === 1 ? '' : 's'} 🔥 · next reward in ${reset}` : `Come back every day — rewards grow with your streak.`}
          </p>
        </div>
        <button className="btn-primary shrink-0" disabled={st.claimedToday} onClick={claimLogin}>
          {st.claimedToday ? 'Claimed ✓' : 'Claim'}
        </button>
      </div>
      <div className="relative grid grid-cols-7 gap-1.5">
        {LOGIN_REWARDS.map((r, i) => {
          const done = st.claimedToday ? i <= currentDay : i < currentDay;
          const isNext = !st.claimedToday && i === currentDay;
          return (
            <div
              key={i}
              className={`flex flex-col items-center rounded-xl border px-1 py-2 text-center transition ${
                isNext ? 'border-neon-purple bg-neon-purple/15 shadow-neon animate-glow' : done ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-line bg-surface2/50'
              }`}
            >
              <span className="text-[10px] font-bold text-muted">Day {i + 1}</span>
              <span className="my-1 text-lg">{done ? '✅' : i === 6 ? '💎' : '🪙'}</span>
              <span className="text-[11px] font-bold">{r.coins}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DailyChallengesPanel() {
  const { data, claimChallenge } = useStore();
  const list = dailyChallenges(data.daily.date);
  const reset = useCountdown();
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-lg font-bold">🎯 Daily Challenges</h3>
        <span className="chip">Resets in {reset}</span>
      </div>
      <ul className="space-y-3">
        {list.map((c) => {
          const v = data.daily.progress[c.id] ?? 0;
          const done = c.done(v);
          const claimed = data.daily.claimed.includes(c.id);
          const pct = c.target === 1 ? (done ? 100 : 0) : Math.min(100, (v / c.target) * 100);
          return (
            <li key={c.id} className="rounded-xl bg-surface2/60 p-3">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface text-xl">{c.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{c.title}</div>
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <span>{c.label(v)}</span>·
                    <span className="flex items-center gap-1"><Coin className="!h-3 !w-3" />{c.reward.coins}</span>·
                    <span>{c.reward.xp} XP</span>
                  </div>
                </div>
                {claimed ? (
                  <span className="chip !text-emerald-400">✓ Done</span>
                ) : done ? (
                  <button className="btn-primary !px-3 !py-1.5" onClick={() => claimChallenge(c.id)}>Claim</button>
                ) : c.game ? (
                  <Link to={`/game/${c.game}`} className="btn-ghost !px-3 !py-1.5" aria-label={`Play ${GAME_MAP[c.game].title}`}>Play</Link>
                ) : (
                  <Link to="/games" className="btn-ghost !px-3 !py-1.5">Play</Link>
                )}
              </div>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface">
                <div className={`h-full rounded-full transition-[width] duration-700 ${done ? 'bg-emerald-400' : 'bg-gradient-to-r from-neon-purple to-neon-blue'}`} style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
