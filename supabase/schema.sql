-- Supabase Auto-Migration Schema: Licenses DRM
-- Execute este script no SQL Editor do Supabase Console

-- Habilitar a extensão de UUID (se ainda não estiver ativa)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Criar a tabela de licenças
CREATE TABLE IF NOT EXISTS public.licenses (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    key text UNIQUE NOT NULL,
    active boolean DEFAULT true,
    owner_email text NOT NULL,
    user_id uuid REFERENCES auth.users(id),
    hwid text,
    ra_limit integer DEFAULT 1,
    authorized_ras text[] DEFAULT '{}',
    plan_type text DEFAULT 'Estudante',
    payment_id text UNIQUE,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- Criar a tabela de Patch Notes (Lado Esquerdo do Launcher)
CREATE TABLE IF NOT EXISTS public.patch_notes (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    type text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    link_url text,
    created_at timestamp with time zone DEFAULT now()
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON public.licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_licenses_owner_email ON public.licenses(owner_email);

-- Habilitar Políticas RLS
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

-- Regra 1: Leitura
DROP POLICY IF EXISTS "Permitir leitura anonima da propria chave" ON public.licenses;
CREATE POLICY "Permitir leitura anonima da propria chave" ON public.licenses
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- Regra 2: Update de hwid e authorized_ras
DROP POLICY IF EXISTS "Permitir atualizacao de hwid e ras" ON public.licenses;
DROP POLICY IF EXISTS "Permitir injecao de hwid e ra no primeiro uso" ON public.licenses;
DROP POLICY IF EXISTS "Permitir injecao do hardware id no primeiro uso" ON public.licenses;
CREATE POLICY "Permitir atualizacao de hwid e ras" ON public.licenses
    FOR UPDATE
    TO anon, authenticated
    USING (true)
    WITH CHECK (hwid IS NOT NULL);

-- Aviso: Edge Functions terão acesso irrestrito por utilizarem a Service Role Key internamente.
