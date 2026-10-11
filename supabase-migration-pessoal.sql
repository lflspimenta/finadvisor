-- FinAdvisor - Migração: custos com pessoal (total mensal) e saldo bancário
-- Execute este SQL no Supabase > SQL Editor (uma única vez)

CREATE TABLE IF NOT EXISTS pessoal (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE NOT NULL UNIQUE,
  -- Trabalhadores por conta de outrem (sem o gerente)
  n_trabalhadores INTEGER NOT NULL DEFAULT 0 CHECK (n_trabalhadores >= 0),
  massa_salarial_mensal NUMERIC(12,2) NOT NULL DEFAULT 0,        -- vencimentos base brutos / mês
  subsidio_alimentacao_mensal NUMERIC(12,2) NOT NULL DEFAULT 0,  -- total / mês
  subsidios_duodecimos BOOLEAN NOT NULL DEFAULT FALSE,
  mes_subsidio_ferias INTEGER NOT NULL DEFAULT 6 CHECK (mes_subsidio_ferias BETWEEN 1 AND 12),
  mes_subsidio_natal INTEGER NOT NULL DEFAULT 12 CHECK (mes_subsidio_natal BETWEEN 1 AND 12),
  taxa_tsu_empresa NUMERIC(5,4) NOT NULL DEFAULT 0.2375,
  taxa_irs_trabalhadores NUMERIC(5,4) NOT NULL DEFAULT 0,        -- taxa média de retenção
  outros_encargos_pct NUMERIC(5,4) NOT NULL DEFAULT 0,           -- seguro AT, FGCT, medicina no trabalho...
  -- Sócio-gerente (a remuneração mensal está em empresas.remuneracao_socio_mensal)
  gerente_regime TEXT NOT NULL DEFAULT 'com_desemprego' CHECK (gerente_regime IN ('com_desemprego', 'outros')),
  gerente_14_meses BOOLEAN NOT NULL DEFAULT FALSE,
  taxa_irs_gerente NUMERIC(5,4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pessoal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own pessoal" ON pessoal;
CREATE POLICY "Users can manage own pessoal" ON pessoal FOR ALL USING (
  empresa_id IN (SELECT id FROM empresas WHERE user_id = auth.uid())
);

-- O saldo bancário indicado na app é guardado em saldos_caixa (já existente).
-- As obrigações de IRS (retenções) passam a ser geradas no calendário: o tipo 'IRS' já é permitido.
