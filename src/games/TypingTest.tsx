import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GameProps } from './shared';

const WORDS = (
  'the be to of and a in that have it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us great between need large often hand high place hold turn where real life few north open seem together next white children begin got walk example ease paper group always music those both mark book letter until mile river car feet care second enough plain girl usual young ready above ever red list though feel talk bird soon body dog family direct pose leave song measure door product black short numeral class wind question happen complete ship area half rock order fire south problem piece told knew pass since top whole king space heard best hour better true during hundred five remember step early west ground interest reach fast verb sing listen six table travel less morning ten simple several vowel toward war lay against pattern slow center love person money serve appear road map rain rule govern pull cold notice voice unit power town fine certain fly fall lead cry dark machine note wait plan figure star box noun field rest correct able pound done beauty drive stood contain front teach week final gave green oh quick develop ocean warm free minute strong special mind behind clear tail produce fact street inch multiply nothing course stay wheel full force blue object decide surface deep moon island foot system busy test record boat common gold possible plane stead dry wonder laugh thousand ago ran check game shape equate hot miss brought heat snow tire bring yes distant fill east paint language among'
).split(' ');

const genWords = (n: number) => Array.from({ length: n }, () => WORDS[Math.floor(Math.random() * WORDS.length)]);
const DURATIONS = [15, 30, 60] as const;

export default function TypingTest({ api }: GameProps) {
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]>(30);
  const [words, setWords] = useState(() => genWords(200));
  const [typed, setTyped] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [done, setDone] = useState<null | { wpm: number; raw: number; acc: number; correctWords: number; wrongWords: number }>(null);
  const [keys, setKeys] = useState({ total: 0, correct: 0 });
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLSpanElement>(null);
  const [offset, setOffset] = useState(0);

  const elapsed = startedAt ? Math.min(duration, (now - startedAt) / 1000) : 0;
  const remaining = Math.max(0, Math.ceil(duration - elapsed));

  // stats
  const correctChars = typed.reduce((a, w, i) => a + (w === words[i] ? w.length + 1 : 0), 0) + (input && words[typed.length].startsWith(input) ? input.length : 0);
  const liveWpm = elapsed > 1 ? Math.round(correctChars / 5 / (elapsed / 60)) : 0;
  const liveAcc = keys.total ? Math.round((keys.correct / keys.total) * 100) : 100;

  useEffect(() => {
    if (!startedAt || done) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [startedAt, done]);

  useEffect(() => {
    if (!startedAt || done || elapsed < duration) return;
    const correctWords = typed.filter((w, i) => w === words[i]).length;
    const wrongWords = typed.length - correctWords;
    const allChars = typed.reduce((a, w) => a + w.length + 1, 0) + input.length;
    const wpm = Math.round(correctChars / 5 / (duration / 60));
    const raw = Math.round(allChars / 5 / (duration / 60));
    const acc = keys.total ? Math.round((keys.correct / keys.total) * 100) : 0;
    setDone({ wpm, raw, acc, correctWords, wrongWords });
    api.setScore(wpm);
    api.sound('win');
    api.finish(wpm, { accuracy: acc });
    inputRef.current?.blur();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed]);

  useEffect(() => {
    if (startedAt && !done) api.setScore(liveWpm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveWpm]);

  // keep active word on 2nd line
  useLayoutEffect(() => {
    const el = activeRef.current;
    if (!el) return;
    const lineH = el.offsetHeight + 8;
    const top = el.offsetTop;
    setOffset(Math.max(0, top - lineH));
  }, [typed.length]);

  const reset = (d = duration) => {
    setDuration(d);
    setWords(genWords(200));
    setTyped([]);
    setInput('');
    setStartedAt(null);
    setDone(null);
    setKeys({ total: 0, correct: 0 });
    setOffset(0);
    api.setScore(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const onChange = (val: string) => {
    if (done) return;
    if (!startedAt && val.trim()) setStartedAt(Date.now());
    const target = words[typed.length];
    if (val.endsWith(' ')) {
      const w = val.trim();
      if (!w) return;
      setKeys((k) => ({ total: k.total + 1, correct: k.correct + (w === target ? 1 : 0) }));
      setTyped((t) => [...t, w]);
      setInput('');
      api.sound(w === target ? 'tick' : 'error');
      return;
    }
    if (val.length > input.length) {
      const added = val.slice(input.length);
      let correct = 0;
      for (let i = 0; i < added.length; i++) if (target[input.length + i] === added[i]) correct++;
      setKeys((k) => ({ total: k.total + added.length, correct: k.correct + correct }));
    }
    setInput(val.replace(/\s/g, ''));
  };

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid grid-cols-3 rounded-xl bg-surface2 p-1 text-sm font-semibold">
          {DURATIONS.map((d) => (
            <button key={d} onClick={() => reset(d)} className={`rounded-lg px-3 py-1.5 transition ${duration === d ? 'bg-surface shadow' : 'text-muted'}`}>
              {d}s
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <span className="chip !text-sm">⏱ {remaining}s</span>
          <span className="chip !text-sm">⚡ {liveWpm} WPM</span>
          <span className="chip !text-sm">🎯 {liveAcc}%</span>
        </div>
      </div>

      <div className="relative">
        <div
          ref={boxRef}
          onClick={() => inputRef.current?.focus()}
          className={`card relative h-[150px] cursor-text overflow-hidden px-5 py-4 font-mono text-xl leading-[2.4rem] sm:h-[164px] sm:text-2xl sm:leading-[2.6rem] ${focused ? 'border-neon-purple/60 shadow-neon' : ''}`}
        >
          <div className="flex flex-wrap gap-x-3 transition-transform duration-200" style={{ transform: `translateY(-${offset}px)` }}>
            {words.map((w, i) => {
              if (i < typed.length) {
                const ok = typed[i] === w;
                return (
                  <span key={i} className={ok ? 'text-muted/60' : 'text-rose-400 underline decoration-rose-400/60'}>
                    {w}
                  </span>
                );
              }
              if (i === typed.length) {
                return (
                  <span key={i} ref={activeRef} className="relative rounded bg-neon-purple/10 px-0.5">
                    {w.split('').map((ch, k) => {
                      const t = input[k];
                      const cls = t === undefined ? 'text-fg' : t === ch ? 'text-neon-cyan' : 'text-rose-400 bg-rose-500/20';
                      return (
                        <span key={k} className={`relative ${cls}`}>
                          {k === input.length && focused && <span className="absolute -left-px top-1 h-[1.6em] w-0.5 animate-pulse bg-neon-purple" />}
                          {ch}
                        </span>
                      );
                    })}
                    {input.length > w.length && <span className="bg-rose-500/20 text-rose-400">{input.slice(w.length)}</span>}
                    {input.length >= w.length && focused && <span className="inline-block h-[1.2em] w-0.5 animate-pulse bg-neon-purple align-middle" />}
                  </span>
                );
              }
              return (
                <span key={i} className="text-fg/80">
                  {w}
                </span>
              );
            })}
          </div>
          {!focused && !done && (
            <div className="absolute inset-0 grid place-items-center bg-surface/70 backdrop-blur-[2px]">
              <span className="font-sans text-base font-semibold text-muted">👆 Click or tap here to start typing</span>
            </div>
          )}
        </div>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && input === '' && typed.length && typed[typed.length - 1] !== words[typed.length - 1]) {
              // allow fixing the previous wrong word
              e.preventDefault();
              const prev = typed[typed.length - 1];
              setTyped((t) => t.slice(0, -1));
              setInput(prev);
            }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="absolute left-0 top-0 h-px w-px text-base opacity-0"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-label="Type here"
          disabled={!!done}
        />
      </div>

      {done ? (
        <div className="card grid animate-pop grid-cols-2 gap-4 p-5 text-center sm:grid-cols-4">
          <div>
            <div className="text-xs text-muted">Net WPM</div>
            <div className="font-mono text-4xl font-black gradient-text">{done.wpm}</div>
          </div>
          <div>
            <div className="text-xs text-muted">Accuracy</div>
            <div className="font-mono text-3xl font-bold">{done.acc}%</div>
          </div>
          <div>
            <div className="text-xs text-muted">Raw WPM</div>
            <div className="font-mono text-3xl font-bold">{done.raw}</div>
          </div>
          <div>
            <div className="text-xs text-muted">Words ✓ / ✗</div>
            <div className="font-mono text-3xl font-bold">
              <span className="text-emerald-400">{done.correctWords}</span>/<span className="text-rose-400">{done.wrongWords}</span>
            </div>
          </div>
          <div className="col-span-2 sm:col-span-4">
            <button className="btn-primary" onClick={() => reset()}>Try again</button>
          </div>
        </div>
      ) : (
        <p className="text-center text-xs text-muted">The timer starts with your first keystroke. Press Space to submit each word. Backspace on an empty word to fix the previous mistake.</p>
      )}
    </div>
  );
}
