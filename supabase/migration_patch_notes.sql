-- ═══════════════════════════════════════════════════════════
-- Migração: Patch Notes / News System
-- Execute este script no SQL Editor do Supabase Console
-- ═══════════════════════════════════════════════════════════

-- 1. Criar a tabela de Patch Notes
CREATE TABLE IF NOT EXISTS public.patch_notes (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    type text NOT NULL,             -- (update, maintenance, news, alert)
    title text NOT NULL,
    content text NOT NULL,
    link_url text,                  -- Opcional (Link do YouTube, Tutorial, etc.)
    created_at timestamp with time zone DEFAULT now()
);

-- 2. Habilitar RLS (Segurança)
ALTER TABLE public.patch_notes ENABLE ROW LEVEL SECURITY;

-- 3. Criar política para Leitura Pública Anonimizada (Desktop App pode ler)
DROP POLICY IF EXISTS "Permitir leitura anonima das noticias" ON public.patch_notes;
CREATE POLICY "Permitir leitura anonima das noticias" ON public.patch_notes
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- 4. Inserir um card de boas-vindas / exemplo de patch notes para o sistema novo
INSERT INTO public.patch_notes (type, title, content, link_url)
VALUES (
    'update',
    '🎉 Novo Launcher Oryon Lançado!',
    'Seja bem-vindo a nova era da plataforma Studio Oryon com design premium. Mais estabilidade nas automações simultâneas de múltiplos alunos e conexão instantânea com o AVA Kroton.',
    'https://studiooryon.pro'
);
