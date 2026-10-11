-- FinAdvisor - Migração: faturas de despesas (dados da fatura + ficheiro digitalizado)
-- Execute este SQL no Supabase > SQL Editor (uma única vez)

-- 1. Novos campos nas despesas
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS fornecedor_nome TEXT;
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS fornecedor_nif TEXT;
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS numero_documento TEXT;
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS data_documento DATE;
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS atcud TEXT;
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS valor_base NUMERIC(12,2);
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS valor_iva NUMERIC(12,2) DEFAULT 0;
-- Fração do IVA que é dedutível: 1 = 100%, 0.5 = 50%, 0 = não dedutível
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS deducao_iva NUMERIC(3,2) DEFAULT 1 CHECK (deducao_iva BETWEEN 0 AND 1);
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS ficheiro_path TEXT;

-- Impede a mesma fatura (mesmo fornecedor + mesmo número) duas vezes na mesma empresa
CREATE UNIQUE INDEX IF NOT EXISTS idx_despesas_fatura_unica
  ON despesas (empresa_id, fornecedor_nif, numero_documento)
  WHERE fornecedor_nif IS NOT NULL AND numero_documento IS NOT NULL;

-- 2. Bucket privado para as faturas digitalizadas (máx. 10 MB por ficheiro)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('faturas', 'faturas', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Os ficheiros ficam em  faturas/<empresa_id>/<ficheiro>
-- Cada utilizador só acede às pastas das suas empresas
DROP POLICY IF EXISTS "faturas_select_proprias" ON storage.objects;
CREATE POLICY "faturas_select_proprias" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'faturas'
  AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.empresas WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "faturas_insert_proprias" ON storage.objects;
CREATE POLICY "faturas_insert_proprias" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'faturas'
  AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.empresas WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "faturas_delete_proprias" ON storage.objects;
CREATE POLICY "faturas_delete_proprias" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'faturas'
  AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.empresas WHERE user_id = auth.uid())
);

-- 3. Faturas de venda (emitidas pela empresa)
CREATE TABLE IF NOT EXISTS faturas_venda (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE NOT NULL,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  cliente_nome TEXT,
  cliente_nif TEXT,
  numero_documento TEXT,
  data_documento DATE,
  atcud TEXT,
  valor_base NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_iva NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  ficheiro_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_faturas_venda_unica
  ON faturas_venda (empresa_id, numero_documento)
  WHERE numero_documento IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_faturas_venda_mes ON faturas_venda (empresa_id, ano, mes);

ALTER TABLE faturas_venda ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own faturas_venda" ON faturas_venda;
CREATE POLICY "Users can manage own faturas_venda" ON faturas_venda FOR ALL USING (
  empresa_id IN (SELECT id FROM empresas WHERE user_id = auth.uid())
);
