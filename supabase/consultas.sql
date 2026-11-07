-- Cohen Tech: tabla de consultas de clientes.
-- Pégalo en Supabase > SQL Editor > New query > Run.

create table if not exists public.consultas (
  id                 uuid primary key default gen_random_uuid(),
  creada_en          timestamptz not null default now(),

  -- Datos del cliente
  nombre             text not null check (char_length(nombre) between 2 and 80),
  correo             text not null check (char_length(correo) between 5 and 120),
  telefono           text not null check (char_length(telefono) between 8 and 30),

  -- Equipo y servicio
  es_notebook        boolean not null,  -- true = notebook, false = PC de escritorio
  tipo_equipo        text generated always as (case when es_notebook then 'Notebook' else 'PC de escritorio' end) stored,
  modelo             text not null check (char_length(modelo) between 2 and 120),
  detalle            text not null check (char_length(detalle) between 10 and 2000),

  -- Hora agendada (hora de Chile en fecha_cita y hora_cita; inicio/fin en UTC)
  fecha_cita         date not null,
  hora_cita          time not null,
  inicio_cita        timestamptz not null,
  fin_cita           timestamptz not null,

  -- Seguimiento tuyo
  estado             text not null default 'agendada'
                       check (estado in ('agendada', 'en_revision', 'en_reparacion', 'lista', 'entregada', 'cancelada')),
  evento_calendar_id text,
  notas              text
);

create index if not exists consultas_inicio_idx on public.consultas (inicio_cita desc);
create index if not exists consultas_estado_idx on public.consultas (estado);

-- Seguridad: con RLS activado y SIN políticas, nadie puede leer ni escribir desde el navegador
-- con la clave pública. Solo el Apps Script, que usa la clave secreta, puede insertar filas.
alter table public.consultas enable row level security;
