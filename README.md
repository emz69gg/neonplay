# NeonPlay — online minigames platform

A browser minigames site built with React, TypeScript, Tailwind CSS and Supabase. It has 17 playable games, accounts, XP and levels, coins, achievements, daily rewards and challenges, and leaderboards.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production build → dist/
npm run build:single # one self-contained index.html → dist-single/
```

Everything works without any setup. When Supabase isn't configured:
- **Guests** keep their progress in localStorage.
- **Accounts** are stored in the browser (passwords are salted and SHA-256 hashed). Leaderboards show the players on that device.

## Turning on Supabase (cloud accounts, global leaderboards, online chess)

1. Create a project at supabase.com.
2. **SQL Editor → New query**: paste all of `supabase/schema.sql` and click **Run**. It sets up everything (profiles, scores, online chess) and is safe to run again after updates.
3. **Authentication → Sign In / Providers → Email**: switch **Confirm email** off, so players can log in straight after signing up. (The SQL also auto-confirms new accounts as a backup.)
4. **Authentication → URL Configuration**: set **Site URL** to your site's address (used by password-reset links).
5. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the publishable/anon key) to `.env.local`, or as GitHub Actions secrets for the Pages deploy.

> Scores are submitted by the client. Row-level security makes sure players can only write their own rows, but it can't stop cheated scores. For competitive play, validate scores in an Edge Function.

## Online chess

Players must be logged in. Every move goes through security-definer database functions that check turn order and run the chess clocks on the server; each browser checks that the opponent's moves are legal. The client stays in sync through Supabase Realtime plus polling, refetches when the tab wakes up or the network returns, retries moves after connection drops, resumes your game after a reload, and supports rematches. Waiting players send a heartbeat so matchmaking never pairs you with someone who already left.

For local testing without a server, set `localStorage['neonplay:mockOnline'] = '1'` in a dev build and open two tabs.

## Project structure

```
src/
  lib/          types, game catalog, progression (levels, achievements, daily challenges), sound engine, backend (Supabase or local)
  store/        AppStore context: user, progress, settings, toasts, all game events
  components/   layout, navbar, cards, modals, daily panels, leaderboard widgets
  games/        one component per game (lazy-loaded), plus shared input hooks
  pages/        Home, Browse, GamePage, Leaderboard, Profile, NotFound
supabase/schema.sql
```

### Adding a game
1. Add its metadata to `GAMES` in `src/lib/games.ts`.
2. Create `src/games/YourGame.tsx`. It receives `{ api, fresh }`. Call `api.setScore()` while playing and `api.finish(score, meta)` when a round ends.
3. Register it in `src/games/index.ts` and add cover art in `components/GameThumb.tsx`.

## Features
- **Games:** Reaction Test, 2048 (auto-saves), Snake, Tic Tac Toe (vs friend or minimax AI), Rock Paper Scissors, Memory Cards, Minesweeper (safe first click, chording, long-press flags), Clicker Simulator (saved, with offline earnings), Flappy Wings, Typing Speed Test, Brick Breaker, Block Stack, Word Guess (daily + unlimited), Connect Four (alpha-beta AI), Whack-a-Mole, Aim Trainer, Chess (full rules, AI in a web worker, and online 1v1 against real players with matchmaking, invite links and server-side clocks).
- **Every game page has:** live score, personal best, restart, fullscreen (with a fallback for iOS), description, instructions, controls, achievements, top players, and related games.
- **Mobile:** swipe controls (2048, Snake), D-pad, tap-to-flap, long-press to flag, and a bottom navigation bar.
- **Progression:** XP and levels, coins (spent in the avatar studio), 43 achievements, a 7-day login streak, 3 daily challenges, favorites, and recently played.
- **Extras:** synthesized sound effects (no audio files) with mute and volume, light and dark themes, reduced motion, a settings menu, toasts, and loading states.

## Deploying to GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds and publishes the site every time you push to `main`.

1. In the repository, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Push to `main`. The site appears at `https://<your-username>.github.io/<repo-name>/`.
3. Optional: to turn on cloud accounts, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under **Settings → Secrets and variables → Actions**.

The app uses relative asset paths and hash routing (`/#/game/snake`), so it works from any sub-path without extra configuration.
