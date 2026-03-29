-- ═══════════════════════════════════════════════════════════
-- Migração: Multi-RA (de ra TEXT único → authorized_ras TEXT[] + ra_limit)
-- Execute este script no SQL Editor do Supabase Console
-- ═══════════════════════════════════════════════════════════

-- 1. Adicionar novas colunas
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS ra_limit integer DEFAULT 1;
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS authorized_ras text[] DEFAULT '{}';

-- 2. Migrar dados existentes: se a coluna "ra" tinha um valor, mover para o array
UPDATE public.licenses 
SET authorized_ras = ARRAY[ra] 
WHERE ra IS NOT NULL AND ra != '' AND (authorized_ras IS NULL OR authorized_ras = '{}');

-- 3. Remover a coluna legada "ra" (agora substituída por authorized_ras)
ALTER TABLE public.licenses DROP COLUMN IF EXISTS ra;

-- 4. Atualizar política RLS para permitir updates de authorized_ras
DROP POLICY IF EXISTS "Permitir injecao de hwid e ra no primeiro uso" ON public.licenses;
DROP POLICY IF EXISTS "Permitir injecao do hardware id no primeiro uso" ON public.licenses;
DROP POLICY IF EXISTS "Permitir atualizacao de hwid e ras" ON public.licenses;
CREATE POLICY "Permitir atualizacao de hwid e ras" ON public.licenses
    FOR UPDATE
    TO anon, authenticated
    USING (true)
    WITH CHECK (hwid IS NOT NULL);
