create table if not exists public.planner_tuber_producao_diaria (
  id uuid primary key default gen_random_uuid(),
  estagiario_id uuid not null references public.estagiarios(id) on delete cascade,
  evento_id text not null check (char_length(evento_id) between 1 and 160),
  data_referencia date not null,
  produto text not null check (produto in ('inss', 'op', 'ep', 'crediario', 'seguros', 'pic', 'combinaqui', 'engajamento', 'consorcio')),
  produto_origem text not null check (char_length(produto_origem) between 1 and 160),
  quantidade numeric not null check (quantidade >= 0 and quantidade <= 1000000000000),
  nome_origem text,
  recebido_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (evento_id, estagiario_id, produto)
);

create index if not exists planner_tuber_producao_diaria_student_date_idx
  on public.planner_tuber_producao_diaria (estagiario_id, data_referencia desc);

create index if not exists planner_tuber_producao_diaria_student_product_date_idx
  on public.planner_tuber_producao_diaria (estagiario_id, produto, data_referencia);

alter table public.planner_tuber_producao_diaria enable row level security;
revoke all on table public.planner_tuber_producao_diaria from anon, authenticated;
