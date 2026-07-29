-- ============================================================
-- TURMA — esquema completo do banco (rodar no SQL Editor do Supabase)
-- Cria tabelas, segurança (RLS), funções e o bucket de mídia.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- PERFIS ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  avatar_url text,
  role text not null default 'aluno' check (role in ('admin', 'aluno')),
  approved boolean not null default false,   -- vira true ao resgatar um convite
  banned boolean not null default false,
  accepted_terms_at timestamptz,             -- aceite das regras/consentimento
  created_at timestamptz not null default now()
);

-- O PRIMEIRO usuário que se cadastrar vira admin automaticamente.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare n int;
begin
  select count(*) into n from public.profiles;
  insert into public.profiles (id, name, role, approved)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    case when n = 0 then 'admin' else 'aluno' end,
    n = 0
  );
  -- admin entra direto no canal Geral
  if n = 0 then
    insert into public.channel_members (channel_id, user_id)
    select id, new.id from public.channels where name = 'Geral' and kind = 'group';
  end if;
  return new;
end $$;

-- ---------- CANAIS E MENSAGENS ----------
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'group' check (kind in ('group', 'dm')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.channel_members (
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '',
  image_url text,
  status text not null default 'ok' check (status in ('ok', 'flagged')),
  flag_reason text,
  created_at timestamptz not null default now()
);
create index messages_channel_time on public.messages (channel_id, created_at);

-- ---------- CONVITES ----------
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_by uuid references public.profiles(id),
  expires_at timestamptz not null default now() + interval '48 hours',
  used_by uuid references public.profiles(id),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- SINALIZAÇÕES DA MODERAÇÃO ----------
create table public.strikes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  reason text,
  blocked boolean not null default false,  -- true = mensagem barrada antes de entrar
  excerpt text,                            -- trecho da mensagem barrada (p/ o admin)
  created_at timestamptz not null default now()
);

-- ---------- DENÚNCIAS (revisão humana — a IA não é perfeita) ----------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  reporter_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now()
);

-- canal padrão
insert into public.channels (name, kind) values ('Geral', 'group');

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------- FUNÇÕES AUXILIARES (security definer evita recursão de RLS) ----------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from profiles where id = auth.uid() and role = 'admin' and not banned) $$;

create or replace function public.is_member(c uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from channel_members where channel_id = c and user_id = auth.uid()) $$;

-- ---------- RPCs ----------

-- Resgatar um convite (aluno entra na comunidade)
create or replace function public.redeem_invite(invite_token text)
returns text language plpgsql security definer set search_path = public
as $$
declare inv record;
begin
  if auth.uid() is null then return 'nao_autenticado'; end if;
  select * into inv from invites where token = invite_token;
  if inv is null then return 'invalido'; end if;
  if inv.used_by is not null then return 'ja_usado'; end if;
  if inv.expires_at < now() then return 'expirado'; end if;

  update invites set used_by = auth.uid(), used_at = now() where id = inv.id;
  update profiles set approved = true where id = auth.uid();
  insert into channel_members (channel_id, user_id)
  select id, auth.uid() from channels where name = 'Geral' and kind = 'group'
  on conflict do nothing;
  return 'ok';
end $$;

-- Abrir (ou criar) uma conversa direta com outro membro
create or replace function public.get_or_create_dm(other_id uuid)
returns uuid language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid(); ch uuid;
begin
  if me is null or me = other_id then raise exception 'invalido'; end if;
  if not exists(select 1 from profiles where id = me and approved and not banned) then
    raise exception 'sem_permissao';
  end if;
  if not exists(select 1 from profiles where id = other_id and approved and not banned) then
    raise exception 'destinatario_indisponivel';
  end if;

  select c.id into ch
  from channels c
  join channel_members a on a.channel_id = c.id and a.user_id = me
  join channel_members b on b.channel_id = c.id and b.user_id = other_id
  where c.kind = 'dm'
  limit 1;

  if ch is null then
    insert into channels (name, kind, created_by) values ('dm', 'dm', me) returning id into ch;
    insert into channel_members (channel_id, user_id) values (ch, me), (ch, other_id);
  end if;
  return ch;
end $$;

-- Admin: banir / desbanir
create or replace function public.set_banned(target uuid, value boolean)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'apenas_admin'; end if;
  update profiles set banned = value where id = target;
end $$;

-- Excluir a própria conta e todos os dados (LGPD)
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- ---------- SEGURANÇA (RLS) ----------
alter table public.profiles enable row level security;
alter table public.channels enable row level security;
alter table public.channel_members enable row level security;
alter table public.messages enable row level security;
alter table public.invites enable row level security;
alter table public.strikes enable row level security;
alter table public.reports enable row level security;

-- perfis: qualquer usuário logado vê os perfis; cada um edita só campos seguros do próprio
create policy "ver perfis" on public.profiles for select to authenticated using (true);
create policy "editar proprio perfil" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- impede o usuário de se autopromover: só nome, avatar e aceite são editáveis
revoke update on public.profiles from authenticated;
grant update (name, avatar_url, accepted_terms_at) on public.profiles to authenticated;

-- canais: só membros (e admin) veem; só admin cria grupos
create policy "ver canais" on public.channels for select to authenticated
  using (public.is_member(id) or public.is_admin());
create policy "admin cria grupos" on public.channels for insert to authenticated
  with check (public.is_admin() and kind = 'group');
create policy "admin remove canais" on public.channels for delete to authenticated
  using (public.is_admin());

-- membros: visíveis dentro do canal; cada um atualiza seu last_read_at
create policy "ver membros" on public.channel_members for select to authenticated
  using (user_id = auth.uid() or public.is_member(channel_id) or public.is_admin());
create policy "marcar lido" on public.channel_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "admin adiciona membros" on public.channel_members for insert to authenticated
  with check (public.is_admin());
revoke update on public.channel_members from authenticated;
grant update (last_read_at) on public.channel_members to authenticated;

-- mensagens: só membros leem. NINGUÉM insere direto —
-- toda mensagem passa pela Edge Function de moderação (service role).
create policy "ler mensagens" on public.messages for select to authenticated
  using (public.is_member(channel_id) or public.is_admin());
create policy "admin apaga mensagens" on public.messages for delete to authenticated
  using (public.is_admin());

-- convites e sinalizações: só admin
create policy "admin convites" on public.invites for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "admin strikes" on public.strikes for select to authenticated
  using (public.is_admin());

-- denúncias: qualquer membro denuncia mensagens dos canais em que está; só admin lê
create policy "membro denuncia" on public.reports for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_id and public.is_member(m.channel_id)
    )
  );
create policy "admin le denuncias" on public.reports for select to authenticated
  using (public.is_admin());

-- ---------- TEMPO REAL ----------
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.channel_members;
alter publication supabase_realtime add table public.channels;

-- ---------- ARMAZENAMENTO (fotos) ----------
insert into storage.buckets (id, name, public) values ('media', 'media', true)
on conflict (id) do nothing;

create policy "membros enviam midia" on storage.objects for insert to authenticated
  with check (bucket_id = 'media');
create policy "midia publica" on storage.objects for select
  using (bucket_id = 'media');
