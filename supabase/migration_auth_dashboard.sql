-- ═══════════════════════════════════════════════════════════
-- Migração: Auth Dashboard (user_id + plan_type)
-- Execute este script no SQL Editor do Supabase Console
-- ═══════════════════════════════════════════════════════════

-- 1. Adicionar colunas para vincular licença ao Supabase Auth
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS plan_type text DEFAULT 'Estudante';

-- 2. Atualizar plan_type de licenças existentes com base no ra_limit
UPDATE public.licenses SET plan_type = 'Agência' WHERE ra_limit > 1 AND plan_type = 'Estudante';

-- 3. Criar índice para busca por user_id (performance)
CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON public.licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_licenses_owner_email ON public.licenses(owner_email);

-- 4. Criar função segura para o Webhook poder buscar o UUID do usuário pelo e-mail
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(email_to_check text)
RETURNS uuid
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    found_id uuid;
BEGIN
    SELECT id INTO found_id FROM auth.users WHERE email = email_to_check LIMIT 1;
    RETURN found_id;
END;
$$ LANGUAGE plpgsql;
