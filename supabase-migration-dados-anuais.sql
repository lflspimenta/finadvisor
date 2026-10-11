-- FinAdvisor - Migração: dados anuais importados (IES / Balanço / DR)
-- Execute este SQL no Supabase > SQL Editor (uma única vez)

CREATE TABLE IF NOT EXISTS dados_anuais (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE NOT NULL,
  ano INTEGER NOT NULL,
  -- Demonstração de resultados
  volume_negocios NUMERIC(14,2) DEFAULT 0,
  cmvmc NUMERIC(14,2) DEFAULT 0,
  fse NUMERIC(14,2) DEFAULT 0,
  gastos_pessoal NUMERIC(14,2) DEFAULT 0,
  outros_gastos NUMERIC(14,2) DEFAULT 0,
  ebitda NUMERIC(14,2) DEFAULT 0,
  juros NUMERIC(14,2) DEFAULT 0,
  resultado_antes_impostos NUMERIC(14,2) DEFAULT 0,
  irc NUMERIC(14,2) DEFAULT 0,
  resultado_liquido NUMERIC(14,2) DEFAULT 0,
  -- Balanço
  ativo_corrente NUMERIC(14,2) DEFAULT 0,
  caixa NUMERIC(14,2) DEFAULT 0,
  inventarios NUMERIC(14,2) DEFAULT 0,
  ativo_total NUMERIC(14,2) DEFAULT 0,
  passivo_corrente NUMERIC(14,2) DEFAULT 0,
  passivo_total NUMERIC(14,2) DEFAULT 0,
  capital_proprio NUMERIC(14,2) DEFAULT 0,
  divida_financeira NUMERIC(14,2) DEFAULT 0,
  -- Origem
  fonte TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (empresa_id, ano)
);

ALTER TABLE dados_anuais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own dados_anuais" ON dados_anuais;
CREATE POLICY "Users can manage own dados_anuais" ON dados_anuais FOR ALL USING (
  empresa_id IN (SELECT id FROM empresas WHERE user_id = auth.uid())
);
