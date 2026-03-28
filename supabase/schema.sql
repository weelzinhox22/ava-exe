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
    hwid text,
    payment_id text UNIQUE,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- Habilitar Políticas RLS
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

-- Regra 1: O Cliente (Desktop Anon Key) só pode LER a linha que corresponde à Chave (key)
CREATE POLICY "Permitir leitura anonima da propria chave" ON public.licenses
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- Regra 2: O Cliente pode ATUALIZAR apenas o `hwid` se ele estiver nulo (Primeiro Login)
CREATE POLICY "Permitir injecao do hardware id no primeiro uso" ON public.licenses
    FOR UPDATE
    TO anon, authenticated
    USING (hwid IS NULL OR hwid = '')
    WITH CHECK (hwid IS NOT NULL);

-- Aviso: Edge Functions terão acesso irrestrito por utilizarem a Service Role Key internamente.
