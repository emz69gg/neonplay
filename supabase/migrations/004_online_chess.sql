-- NeonPlay migration 004: online 1v1 chess.
-- Run once in Supabase → SQL Editor. Safe to run more than once.
--
-- Players never write to the table directly: every change goes through the
-- security-definer functions below, which check whose turn it is and run the
-- chess clocks on the server (so nobody can move for their opponent or fake time).


create table if not exists public.chess_games (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  is_private boolean not null default false,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished', 'cancelled')),
  created_by uuid not null references auth.users (id) on delete cascade,
  white uuid references auth.users (id) on delete set null,
  black uuid references auth.users (id) on delete set null,
  white_name text,
  black_name text,
  white_avatar jsonb,
  black_avatar jsonb,
  time_ms integer not null check (time_ms between 60000 and 3600000),
  white_ms integer not null,
  black_ms integer not null,
  moves jsonb not null default '[]'::jsonb,
  last_move_at timestamptz,
  draw_offer text check (draw_offer in ('w', 'b')),
  winner text check (winner in ('w', 'b')),
  result_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chess_games_waiting_idx on public.chess_games (status, is_private, time_ms, created_at);
create index if not exists chess_games_white_idx on public.chess_games (white);
create index if not exists chess_games_black_idx on public.chess_games (black);

alter table public.chess_games enable row level security;
grant select on public.chess_games to authenticated;

drop policy if exists "chess players can read their games" on public.chess_games;
create policy "chess players can read their games" on public.chess_games
  for select to authenticated
  using (auth.uid() = white or auth.uid() = black or auth.uid() = created_by);

-- live updates
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chess_games') then
    alter publication supabase_realtime add table public.chess_games;
  end if;
end $$;

-- ---------------------------------------------------------------- helpers
create or replace function public.chess_color_of(g public.chess_games, uid uuid)
returns text language sql immutable as $$
  select case when g.white = uid then 'w' when g.black = uid then 'b' else null end
$$;

create or replace function public.chess_turn_of(g public.chess_games)
returns text language sql immutable as $$
  select case when jsonb_array_length(g.moves) % 2 = 0 then 'w' else 'b' end
$$;

-- ms the side to move has used since the last move (clocks only run once both sides have moved)
create or replace function public.chess_elapsed_ms(g public.chess_games)
returns integer language sql stable as $$
  select case
    when g.status <> 'active' or g.last_move_at is null or jsonb_array_length(g.moves) < 2 then 0
    else greatest(0, floor(extract(epoch from (now() - g.last_move_at)) * 1000))::integer
  end
$$;

-- ---------------------------------------------------------------- create / match / join
create or replace function public.chess_new_game(p_time_ms integer, p_private boolean, p_name text, p_avatar jsonb)
returns public.chess_games language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g public.chess_games;
  as_white boolean := random() < 0.5;
begin
  if uid is null then raise exception 'Log in to play online'; end if;
  insert into public.chess_games (code, is_private, created_by, white, black, white_name, black_name, white_avatar, black_avatar, time_ms, white_ms, black_ms)
  values (
    upper(substr(md5(gen_random_uuid()::text), 1, 6)), coalesce(p_private, false), uid,
    case when as_white then uid end, case when as_white then null else uid end,
    case when as_white then left(p_name, 16) end, case when as_white then null else left(p_name, 16) end,
    case when as_white then p_avatar end, case when as_white then null else p_avatar end,
    p_time_ms, p_time_ms, p_time_ms)
  returning * into g;
  return g;
end $$;

create or replace function public.chess_take_seat(g public.chess_games, uid uuid, p_name text, p_avatar jsonb)
returns public.chess_games language plpgsql security definer set search_path = public as $$
declare r public.chess_games;
begin
  update public.chess_games set
    white = coalesce(white, case when white is null then uid end),
    black = coalesce(black, case when black is null and white is not null then uid end),
    white_name = coalesce(white_name, case when white is null then left(p_name, 16) end),
    black_name = coalesce(black_name, case when black is null and white is not null then left(p_name, 16) end),
    white_avatar = coalesce(white_avatar, case when white is null then p_avatar end),
    black_avatar = coalesce(black_avatar, case when black is null and white is not null then p_avatar end),
    status = 'active', last_move_at = now(), updated_at = now()
  where id = g.id
  returning * into r;
  return r;
end $$;

create or replace function public.chess_find_match(p_time_ms integer, p_name text, p_avatar jsonb)
returns public.chess_games language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g public.chess_games;
begin
  if uid is null then raise exception 'Log in to play online'; end if;
  -- someone else waiting with the same time control?
  select * into g from public.chess_games
   where status = 'waiting' and not is_private and time_ms = p_time_ms and created_by <> uid
     and created_at > now() - interval '15 minutes'
   order by created_at
   limit 1
   for update skip locked;
  if found then
    return public.chess_take_seat(g, uid, p_name, p_avatar);
  end if;
  -- already waiting myself? reuse that seat
  select * into g from public.chess_games
   where status = 'waiting' and not is_private and time_ms = p_time_ms and created_by = uid
     and created_at > now() - interval '15 minutes'
   order by created_at desc limit 1;
  if found then return g; end if;
  return public.chess_new_game(p_time_ms, false, p_name, p_avatar);
end $$;

create or replace function public.chess_join(p_code text, p_name text, p_avatar jsonb)
returns public.chess_games language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g public.chess_games;
begin
  if uid is null then raise exception 'Log in to play online'; end if;
  select * into g from public.chess_games where code = upper(trim(p_code)) for update;
  if not found then raise exception 'Game not found — check the code'; end if;
  if g.white = uid or g.black = uid then return g; end if;
  if g.status <> 'waiting' then raise exception 'That game has already started or ended'; end if;
  return public.chess_take_seat(g, uid, p_name, p_avatar);
end $$;

-- ---------------------------------------------------------------- moves & results
create or replace function public.chess_finish(p_id uuid, p_winner text, p_reason text)
returns public.chess_games language plpgsql security definer set search_path = public as $$
declare r public.chess_games;
begin
  update public.chess_games set status = 'finished', winner = p_winner, result_reason = p_reason, draw_offer = null, updated_at = now()
   where id = p_id returning * into r;
  return r;
end $$;

create or replace function public.chess_move(p_id uuid, p_from integer, p_to integer, p_promo text, p_result text default null, p_winner text default null)
returns public.chess_games language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g public.chess_games;
  me text;
  used integer;
  left_ms integer;
begin
  select * into g from public.chess_games where id = p_id for update;
  if not found then raise exception 'Game not found'; end if;
  me := public.chess_color_of(g, uid);
  if me is null then raise exception 'You are not playing in this game'; end if;
  if g.status <> 'active' then raise exception 'This game is not in progress'; end if;
  if public.chess_turn_of(g) <> me then raise exception 'It is not your turn'; end if;
  if p_from not between 0 and 63 or p_to not between 0 and 63 then raise exception 'Bad move'; end if;
  if p_promo is not null and p_promo not in ('q', 'r', 'b', 'n') then raise exception 'Bad promotion'; end if;

  used := public.chess_elapsed_ms(g);
  left_ms := case when me = 'w' then g.white_ms else g.black_ms end - used;
  if left_ms <= 0 then
    update public.chess_games set white_ms = case when me = 'w' then 0 else white_ms end, black_ms = case when me = 'b' then 0 else black_ms end where id = p_id;
    return public.chess_finish(p_id, case when me = 'w' then 'b' else 'w' end, 'timeout');
  end if;

  update public.chess_games set
    moves = moves || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('from', p_from, 'to', p_to, 'promo', p_promo))),
    white_ms = case when me = 'w' then left_ms else white_ms end,
    black_ms = case when me = 'b' then left_ms else black_ms end,
    last_move_at = now(),
    draw_offer = null,
    updated_at = now()
  where id = p_id returning * into g;

  if p_result is not null then
    if p_result not in ('checkmate', 'stalemate', 'insufficient', 'fifty', 'repetition') then raise exception 'Bad result'; end if;
    -- only checkmate can have a winner, and only the player who just moved
    return public.chess_finish(p_id, case when p_result = 'checkmate' then me else null end, p_result);
  end if;
  return g;
end $$;

create or replace function public.chess_resign(p_id uuid)
returns public.chess_games language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.chess_games; me text;
begin
  select * into g from public.chess_games where id = p_id for update;
  me := public.chess_color_of(g, uid);
  if me is null or g.status <> 'active' then raise exception 'You cannot resign this game'; end if;
  return public.chess_finish(p_id, case when me = 'w' then 'b' else 'w' end, 'resign');
end $$;

create or replace function public.chess_offer_draw(p_id uuid)
returns public.chess_games language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.chess_games; me text;
begin
  select * into g from public.chess_games where id = p_id for update;
  me := public.chess_color_of(g, uid);
  if me is null or g.status <> 'active' then raise exception 'You cannot offer a draw now'; end if;
  update public.chess_games set draw_offer = me, updated_at = now() where id = p_id returning * into g;
  return g;
end $$;

create or replace function public.chess_answer_draw(p_id uuid, p_accept boolean)
returns public.chess_games language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.chess_games; me text;
begin
  select * into g from public.chess_games where id = p_id for update;
  me := public.chess_color_of(g, uid);
  if me is null or g.status <> 'active' or g.draw_offer is null or g.draw_offer = me then raise exception 'There is no draw offer to answer'; end if;
  if p_accept then return public.chess_finish(p_id, null, 'agreement'); end if;
  update public.chess_games set draw_offer = null, updated_at = now() where id = p_id returning * into g;
  return g;
end $$;

-- either player may call this; the server decides whether the clock really ran out
create or replace function public.chess_claim_timeout(p_id uuid)
returns public.chess_games language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.chess_games; turn text; left_ms integer;
begin
  select * into g from public.chess_games where id = p_id for update;
  if public.chess_color_of(g, uid) is null then raise exception 'You are not playing in this game'; end if;
  if g.status <> 'active' then return g; end if;
  turn := public.chess_turn_of(g);
  if jsonb_array_length(g.moves) < 2 then
    -- nobody's clock is running yet: abandon if the first moves never come (2 minutes)
    if now() - g.last_move_at > interval '2 minutes' then
      return public.chess_finish(p_id, case when turn = 'w' then 'b' else 'w' end, 'abandoned');
    end if;
    return g;
  end if;
  left_ms := case when turn = 'w' then g.white_ms else g.black_ms end - public.chess_elapsed_ms(g);
  if left_ms <= 0 then
    update public.chess_games set white_ms = case when turn = 'w' then 0 else white_ms end, black_ms = case when turn = 'b' then 0 else black_ms end where id = p_id;
    return public.chess_finish(p_id, case when turn = 'w' then 'b' else 'w' end, 'timeout');
  end if;
  return g;
end $$;

create or replace function public.chess_cancel(p_id uuid)
returns public.chess_games language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.chess_games;
begin
  update public.chess_games set status = 'cancelled', updated_at = now()
   where id = p_id and created_by = uid and status = 'waiting' returning * into r;
  return r;
end $$;

-- Only signed-in players may call the game functions; helpers stay private.
revoke all on function public.chess_take_seat(public.chess_games, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.chess_finish(uuid, text, text) from public, anon, authenticated;
revoke all on function public.chess_new_game(integer, boolean, text, jsonb) from public, anon;
revoke all on function public.chess_find_match(integer, text, jsonb) from public, anon;
revoke all on function public.chess_join(text, text, jsonb) from public, anon;
revoke all on function public.chess_move(uuid, integer, integer, text, text, text) from public, anon;
revoke all on function public.chess_resign(uuid) from public, anon;
revoke all on function public.chess_offer_draw(uuid) from public, anon;
revoke all on function public.chess_answer_draw(uuid, boolean) from public, anon;
revoke all on function public.chess_claim_timeout(uuid) from public, anon;
revoke all on function public.chess_cancel(uuid) from public, anon;
grant execute on function public.chess_new_game(integer, boolean, text, jsonb) to authenticated;
grant execute on function public.chess_find_match(integer, text, jsonb) to authenticated;
grant execute on function public.chess_join(text, text, jsonb) to authenticated;
grant execute on function public.chess_move(uuid, integer, integer, text, text, text) to authenticated;
grant execute on function public.chess_resign(uuid) to authenticated;
grant execute on function public.chess_offer_draw(uuid) to authenticated;
grant execute on function public.chess_answer_draw(uuid, boolean) to authenticated;
grant execute on function public.chess_claim_timeout(uuid) to authenticated;
grant execute on function public.chess_cancel(uuid) to authenticated;
