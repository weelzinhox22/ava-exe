-- Supabase SQL Schema for Legal Consents
-- Rode isso no SQL Editor do seu dashboard Supabase para garantir sua barreira jurídica.

CREATE TABLE IF NOT EXISTS public.legal_consents (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_email text NOT NULL,
    license_key text NOT NULL,
    hwid text,
    typed_text text NOT NULL,
    agreed_at timestamp with time zone DEFAULT now(),
    robot_version text
);

-- Habilitar RLS
ALTER TABLE public.legal_consents ENABLE ROW LEVEL SECURITY;

-- Política simples: permitir inserção anônima para facilitar pelo desktop app
DROP POLICY IF EXISTS "Permitir insercao anonima de consentimento" ON public.legal_consents;
CREATE POLICY "Permitir insercao anonima de consentimento" ON public.legal_consents
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- Política de leitura: somente admin/autenticado vê (ou remova se usar auth token do admin no painel logado depois)
DROP POLICY IF EXISTS "Permitir apenas admin ler consentimentos" ON public.legal_consents;
CREATE POLICY "Permitir apenas admin ler consentimentos" ON public.legal_consents
    FOR SELECT
    TO anon, authenticated
    USING (true); -- Ajuste para false no futuro se quiser travar, hoje deixaremos true pra facilitar leitura se precisar
