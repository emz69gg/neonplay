-- NeonPlay migration 002: allow scores for the 6 new games.
-- Run once in Supabase → SQL Editor. Safe to run more than once.
alter table public.scores drop constraint if exists scores_game_id_check;
alter table public.scores add constraint scores_game_id_check
  check (game_id in ('reaction','2048','snake','tictactoe','rps','memory','minesweeper','clicker','flappy','typing','bricks','blockstack','wordguess','connect4','whack','aim'));
