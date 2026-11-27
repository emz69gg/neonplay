-- NeonPlay migration 003: accept any well-formed game id (adds Chess, and
-- future games won't need another database change).
-- Run once in Supabase → SQL Editor. Safe to run more than once.
alter table public.scores drop constraint if exists scores_game_id_check;
alter table public.scores add constraint scores_game_id_check
  check (game_id ~ '^[a-z0-9]{2,20}$');
