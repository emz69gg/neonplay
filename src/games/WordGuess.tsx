import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { hashString, todayKey } from '../lib/games';
import { useKey, type GameProps } from './shared';
import { ANSWERS, isAllowed } from './words';

/* Word Guess — 5 letters, 6 tries, Daily + Unlimited modes. */

type Mode = 'daily' | 'unlimited';
type Mark = 'correct' | 'present' | 'absent';
interface Save {
  daily?: { date: string; guesses: string[]; done: boolean; win: boolean };
  streak: number;
  bestStreak: number;
  played: number;
  wins: number;
  dist: number[]; // wins by number of guesses (index 0 = 1 guess)
}

const TRIES = 6;
const LEN = 5;
const FLIP_MS = 300;
const COLOR: Record<Mark, string> = { correct: '#22c55e', present: '#eab308', absent: '#64748b' };
const ROWS_KB = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

export function evaluate(guess: string, answer: string): Mark[] {
  const res: Mark[] = Array(LEN).fill('absent');
  const left: Record<string, number> = {};
  for (let i = 0; i < LEN; i++) {
    if (guess[i] === answer[i]) res[i] = 'correct';
    else left[answer[i]] = (left[answer[i]] ?? 0) + 1;
  }
  for (let i = 0; i < LEN; i++) {
    if (res[i] === 'correct') continue;
    if (left[guess[i]]) {
      res[i] = 'present';
      left[guess[i]]--;
    }
  }
  return res;
}

const dailyAnswer = (date = todayKey()) => ANSWERS[hashString('wordguess:' + date) % ANSWERS.length];
const randomAnswer = () => ANSWERS[Math.floor(Math.random() * ANSWERS.length)];

function useMidnightCountdown() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  const ms = end.getTime() - now;
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function WordGuess({ api }: GameProps) {
  const initial = useMemo<Save>(() => ({ streak: 0, bestStreak: 0, played: 0, wins: 0, dist: [0, 0, 0, 0, 0, 0], ...(api.load<Save>() ?? {}) }), [api]);
  const [save, setSave] = useState<Save>(initial);
  const today = todayKey();
  const dailyState = save.daily && save.daily.date === today ? save.daily : undefined;

  const [mode, setMode] = useState<Mode>(dailyState?.done ? 'unlimited' : 'daily');
  const [answer, setAnswer] = useState(() => (mode === 'daily' ? dailyAnswer() : randomAnswer()));
  const [guesses, setGuesses] = useState<string[]>(() => (mode === 'daily' ? dailyState?.guesses ?? [] : []));
  const [input, setInput] = useState('');
  const [revealRow, setRevealRow] = useState<number | null>(null);
  const [shake, setShake] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [result, setResult] = useState<null | { win: boolean; score: number }>(() =>
    mode === 'daily' && dailyState?.done ? { win: dailyState.win, score: dailyState.win ? (7 - dailyState.guesses.length) * 100 : 0 } : null,
  );
  const busy = useRef(false);
  const countdown = useMidnightCountdown();

  const commitSave = (s: Save) => {
    setSave(s);
    api.save(s);
  };

  const flash = (text: string, ms = 1400) => {
    setMsg(text);
    window.setTimeout(() => setMsg((m) => (m === text ? null : m)), ms);
  };

  const switchMode = (m: Mode) => {
    if (busy.current) return;
    setMode(m);
    setInput('');
    setRevealRow(null);
    if (m === 'daily') {
      const d = save.daily && save.daily.date === today ? save.daily : undefined;
      setAnswer(dailyAnswer());
      setGuesses(d?.guesses ?? []);
      setResult(d?.done ? { win: d.win, score: d.win ? (7 - d.guesses.length) * 100 : 0 } : null);
    } else {
      setAnswer(randomAnswer());
      setGuesses([]);
      setResult(null);
    }
    api.setScore(0);
    api.sound('click');
  };

  const newUnlimited = () => {
    setAnswer(randomAnswer());
    setGuesses([]);
    setResult(null);
    setInput('');
    setRevealRow(null);
    api.setScore(0);
    api.sound('click');
  };

  const submit = () => {
    if (busy.current || result) return;
    if (input.length < LEN) {
      setShake((s) => s + 1);
      flash('Not enough letters');
      api.sound('error');
      return;
    }
    if (!isAllowed(input)) {
      setShake((s) => s + 1);
      flash('Not in word list');
      api.sound('error');
      return;
    }
    const next = [...guesses, input];
    const row = guesses.length;
    setGuesses(next);
    setInput('');
    setRevealRow(row);
    busy.current = true;
    for (let i = 0; i < LEN; i++) window.setTimeout(() => api.sound('flip'), i * FLIP_MS + FLIP_MS / 2);

    const win = input === answer;
    const done = win || next.length >= TRIES;
    if (mode === 'daily') {
      commitSave({ ...save, daily: { date: today, guesses: next, done, win } });
    }
    window.setTimeout(() => {
      busy.current = false;
      setRevealRow(null);
      if (!done) return;
      const score = win ? (7 - next.length) * 100 : 0;
      setResult({ win, score });
      api.setScore(score);
      api.sound(win ? 'win' : 'lose');
      flash(win ? ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'][next.length - 1] : answer.toUpperCase(), 2200);
      const base = mode === 'daily' ? { ...save, daily: { date: today, guesses: next, done, win } } : save;
      const dist = [...base.dist];
      if (win) dist[next.length - 1]++;
      const streak = win ? base.streak + 1 : 0;
      commitSave({ ...base, streak, bestStreak: Math.max(base.bestStreak, streak), played: base.played + 1, wins: base.wins + (win ? 1 : 0), dist });
      api.finish(score, { win, guesses: next.length, mode, streak });
    }, LEN * FLIP_MS + FLIP_MS);
  };

  const type = (k: string) => {
    if (busy.current || result) return;
    if (k === 'enter') return submit();
    if (k === 'back') {
      setInput((s) => s.slice(0, -1));
      return;
    }
    if (/^[a-z]$/.test(k) && input.length < LEN) {
      setInput((s) => (s.length < LEN ? s + k : s));
      api.sound('tick');
    }
  };

  useKey((e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      type('enter');
    } else if (e.key === 'Backspace') type('back');
    else if (/^[a-zA-Z]$/.test(e.key)) type(e.key.toLowerCase());
  });

  // letter states for the keyboard (only from fully revealed rows)
  const keyState = useMemo(() => {
    const st: Record<string, Mark> = {};
    const rank: Record<Mark, number> = { absent: 0, present: 1, correct: 2 };
    guesses.forEach((g, r) => {
      if (r === revealRow) return;
      evaluate(g, answer).forEach((m, i) => {
        const ch = g[i];
        if (!st[ch] || rank[m] > rank[st[ch]]) st[ch] = m;
      });
    });
    return st;
  }, [guesses, answer, revealRow]);

  const rows = Array.from({ length: TRIES }, (_, r) => (r < guesses.length ? guesses[r] : r === guesses.length ? input : ''));

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3">
      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <div className="grid grid-cols-2 rounded-xl bg-surface2 p-1 text-sm font-semibold">
          {(['daily', 'unlimited'] as Mode[]).map((m) => (
            <button key={m} onClick={() => switchMode(m)} className={`rounded-lg px-3 py-1.5 transition ${mode === m ? 'bg-surface shadow' : 'text-muted hover:text-fg'}`}>
              {m === 'daily' ? '📅 Daily' : '♾️ Unlimited'}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <span className="chip !text-sm" title="Current win streak">🔥 {save.streak}</span>
          <span className="chip !text-sm" title="Best streak">🏆 {save.bestStreak}</span>
        </div>
      </div>

      <div className="relative">
        {msg && (
          <div className="absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full animate-pop whitespace-nowrap rounded-lg bg-fg px-3 py-1.5 text-sm font-bold text-bg shadow-lg">
            {msg}
          </div>
        )}
        <div className="grid gap-1.5" style={{ gridTemplateRows: `repeat(${TRIES}, 1fr)` }}>
          {rows.map((word, r) => {
            const submitted = r < guesses.length;
            const marks = submitted ? evaluate(word, answer) : null;
            const current = r === guesses.length && !result;
            return (
              <div key={`${r}-${current ? shake : 0}`} className={`grid grid-cols-5 gap-1.5 ${current && shake ? 'animate-rowshake' : ''}`}>
                {Array.from({ length: LEN }, (_, i) => {
                  const ch = word[i] ?? '';
                  const reveal = r === revealRow;
                  const mark = marks?.[i];
                  const style: CSSProperties = {};
                  let cls = 'border-2 border-line bg-surface text-fg';
                  if (mark && reveal) {
                    Object.assign(style, {
                      '--pre': 'rgb(var(--surface))',
                      '--pre-border': 'rgb(var(--muted))',
                      '--pre-fg': 'rgb(var(--fg))',
                      '--post': COLOR[mark],
                      animation: `tileflip ${FLIP_MS * 2}ms ease ${i * FLIP_MS}ms both`,
                    });
                    cls = 'border-2';
                  } else if (mark) {
                    style.background = COLOR[mark];
                    style.borderColor = COLOR[mark];
                    cls = 'border-2 text-white';
                  } else if (ch) cls = 'border-2 border-muted bg-surface text-fg animate-tilebump';
                  return (
                    <div
                      key={`${i}-${ch}`}
                      className={`grid h-14 w-14 place-items-center rounded-lg font-display text-3xl font-bold uppercase sm:h-16 sm:w-16 ${cls}`}
                      style={style}
                    >
                      {ch}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {result ? (
        <div className="card w-full animate-pop p-4 text-center">
          <div className="font-display text-xl font-bold">{result.win ? `Solved in ${guesses.length}! 🎉` : 'Out of tries'}</div>
          <div className="mt-1 text-sm text-muted">
            The word was <b className="uppercase text-fg">{answer}</b>
            {result.win && <> · <b className="text-neon-purple">{result.score} pts</b></>}
          </div>
          <div className="mx-auto mt-3 max-w-xs space-y-1">
            {save.dist.map((n, i) => {
              const max = Math.max(1, ...save.dist);
              const mine = result.win && guesses.length === i + 1;
              return (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="w-3 font-mono">{i + 1}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded bg-surface2">
                    <div className={`flex h-full items-center justify-end rounded px-1 font-bold text-white ${mine ? 'bg-emerald-500' : 'bg-slate-500'}`} style={{ width: `${Math.max(8, (n / max) * 100)}%` }}>
                      {n}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-xs text-muted">Played {save.played} · Won {save.played ? Math.round((save.wins / save.played) * 100) : 0}%</div>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {mode === 'daily' ? (
              <>
                <span className="chip !text-sm">Next daily in {countdown}</span>
                <button className="btn-primary !py-2" onClick={() => switchMode('unlimited')}>Play Unlimited</button>
              </>
            ) : (
              <button className="btn-primary !py-2" onClick={newUnlimited}>New word</button>
            )}
          </div>
        </div>
      ) : (
        <div className="w-full select-none space-y-1.5">
          {ROWS_KB.map((row, ri) => (
            <div key={row} className="flex justify-center gap-1">
              {ri === 2 && (
                <button className="h-12 rounded-lg bg-surface2 px-2 text-xs font-bold hover:bg-line sm:px-3" onPointerDown={(e) => { e.preventDefault(); type('enter'); }}>
                  ENTER
                </button>
              )}
              {row.split('').map((k) => {
                const s = keyState[k];
                return (
                  <button
                    key={k}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      type(k);
                    }}
                    className={`h-12 min-w-0 flex-1 rounded-lg text-sm font-bold uppercase transition sm:max-w-[42px] ${s ? 'text-white' : 'bg-surface2 hover:bg-line'}`}
                    style={s ? { background: COLOR[s] } : undefined}
                    aria-label={k}
                  >
                    {k}
                  </button>
                );
              })}
              {ri === 2 && (
                <button className="h-12 rounded-lg bg-surface2 px-2 text-lg font-bold hover:bg-line sm:px-3" onPointerDown={(e) => { e.preventDefault(); type('back'); }} aria-label="Backspace">
                  ⌫
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
