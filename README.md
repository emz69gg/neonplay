# NeonPlay — online minigames platform

A browser minigames site built with React, TypeScript, Tailwind CSS and Supabase. It has 16 playable games, accounts, XP and levels, coins, achievements, daily rewards and challenges, and leaderboards.

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

## Turning on Supabase (cloud accounts and global leaderboards)

1. Create a project at supabase.com.
2. Open **SQL Editor**, then paste and run `supabase/schema.sql`. (Upgrading an existing project? Run the files in `supabase/migrations/` instead.)
3. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from Project Settings → API.
4. Restart `npm run dev`. Signing up now uses email and password. Progress syncs to `profiles.data`, and best scores go to `scores`, which feeds the global leaderboards.

If email confirmation is turned on in Supabase Auth, new players see a "check your inbox" message before they can log in.

> Scores are submitted by the client. Row-level security makes sure players can only write their own rows, but it can't stop cheated scores. For competitive play, validate scores in an Edge Function.

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
- **Games:** Reaction Test, 2048 (auto-saves), Snake, Tic Tac Toe (vs friend or minimax AI), Rock Paper Scissors, Memory Cards, Minesweeper (safe first click, chording, long-press flags), Clicker Simulator (saved, with offline earnings), Flappy Wings, Typing Speed Test, Brick Breaker, Block Stack, Word Guess (daily + unlimited), Connect Four (alpha-beta AI), Whack-a-Mole, Aim Trainer.
- **Every game page has:** live score, personal best, restart, fullscreen (with a fallback for iOS), description, instructions, controls, achievements, top players, and related games.
- **Mobile:** swipe controls (2048, Snake), D-pad, tap-to-flap, long-press to flag, and a bottom navigation bar.
- **Progression:** XP and levels, coins (spent in the avatar studio), 40 achievements, a 7-day login streak, 3 daily challenges, favorites, and recently played.
- **Extras:** synthesized sound effects (no audio files) with mute and volume, light and dark themes, reduced motion, a settings menu, toasts, and loading states.

## Deploying to GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds and publishes the site every time you push to `main`.

1. In the repository, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Push to `main`. The site appears at `https://<your-username>.github.io/<repo-name>/`.
3. Optional: to turn on cloud accounts, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under **Settings → Secrets and variables → Actions**.

The app uses relative asset paths and hash routing (`/#/game/snake`), so it works from any sub-path without extra configuration.
