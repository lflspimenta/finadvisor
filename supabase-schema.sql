-- FinAdvisor - Schema SQL para Supabase
-- Execute este SQL no Supabase > SQL Editor

-- 1. Empresas
CREATE TABLE IF NOT EXISTS empresas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  nome TEXT NOT NULL,
  nif TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('unipessoal', 'lda', 'sa', 'eni')),
  regime_iva TEXT NOT NULL DEFAULT 'trimestral' CHECK (regime_iva IN ('trimestral', 'mensal', 'isento')),
  regime_irc TEXT NOT NULL DEFAULT 'normal' CHECK (regime_irc IN ('simplificado', 'normal')),
  data_inicio_atividade DATE,
  setor TEXT,
  remuneracao_socio_mensal NUMERIC(10,2) DEFAULT 1000,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Faturação Mensal
CREATE TABLE IF NOT EXISTS faturacao_mensal (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE NOT NULL,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  valor_faturado NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_iva_cobrado NUMERIC(12,2) NOT NULL DEFAULT 0,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (empresa_id, ano, mes)
);

-- 3. Despesas
CREATE TABLE IF NOT EXISTS despesas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE NOT NULL,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  categoria TEXT NOT NULL,
  descricao TEXT NOT NULL,
  valor NUMERIC(10,2) NOT NULL,
  recorrente BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Obrigações Fiscais
CREATE TABLE IF NOT EXISTS obrigacoes_fiscais (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('IVA', 'IRC', 'SS', 'IRS', 'DERRAMA', 'PPC')),
  ano INTEGER NOT NULL,
  trimestre INTEGER CHECK (trimestre BETWEEN 1 AND 4),
  mes_pagamento INTEGER NOT NULL CHECK (mes_pagamento BETWEEN 1 AND 12),
  valor_estimado NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_real NUMERIC(10,2),
  estado TEXT NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente', 'pago', 'atrasado')),
  data_limite DATE NOT NULL,
  data_pagamento DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (empresa_id, tipo, ano, mes_pagamento)
);

-- 5. Saldos de Caixa
CREATE TABLE IF NOT EXISTS saldos_caixa (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE NOT NULL,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  saldo_inicial NUMERIC(12,2) NOT NULL DEFAULT 0,
  saldo_final NUMERIC(12,2) NOT NULL DEFAULT 0,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (empresa_id, ano, mes)
);

-- 6. Relatórios IA
CREATE TABLE IF NOT EXISTS relatorios_ia (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE NOT NULL,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  perfil TEXT NOT NULL CHECK (perfil IN ('conservador', 'crescimento', 'fiscal')),
  conteudo TEXT NOT NULL,
  recomendacoes JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Histórico de Chat IA
CREATE TABLE IF NOT EXISTS chat_historico (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  perfil TEXT NOT NULL CHECK (perfil IN ('conservador', 'crescimento', 'fiscal')),
  pergunta TEXT NOT NULL,
  resposta TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Dados anuais (importados de IES / Balanço / DR)
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

-- RLS (Row Level Security) - cada utilizador só vê os seus dados
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE faturacao_mensal ENABLE ROW LEVEL SECURITY;
ALTER TABLE despesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE obrigacoes_fiscais ENABLE ROW LEVEL SECURITY;
ALTER TABLE saldos_caixa ENABLE ROW LEVEL SECURITY;
ALTER TABLE relatorios_ia ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE dados_anuais ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para empresas
CREATE POLICY "Users can view own empresas" ON empresas FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own empresas" ON empresas FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own empresas" ON empresas FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own empresas" ON empresas FOR DELETE USING (auth.uid() = user_id);

-- Políticas RLS para faturacao_mensal
CREATE POLICY "Users can manage own faturacao" ON faturacao_mensal FOR ALL USING (
  empresa_id IN (SELECT id FROM empresas WHERE user_id = auth.uid())
);

-- Políticas RLS para despesas
CREATE POLICY "Users can manage own despesas" ON despesas FOR ALL USING (
  empresa_id IN (SELECT id FROM empresas WHERE user_id = auth.uid())
);

-- Políticas RLS para obrigacoes_fiscais
CREATE POLICY "Users can manage own obrigacoes" ON obrigacoes_fiscais FOR ALL USING (
  empresa_id IN (SELECT id FROM empresas WHERE user_id = auth.uid())
);

-- Políticas RLS para saldos_caixa
CREATE POLICY "Users can manage own saldos" ON saldos_caixa FOR ALL USING (
  empresa_id IN (SELECT id FROM empresas WHERE user_id = auth.uid())
);

-- Políticas RLS para relatorios_ia
CREATE POLICY "Users can view own relatorios" ON relatorios_ia FOR SELECT USING (
  empresa_id IN (SELECT id FROM empresas WHERE user_id = auth.uid())
);
CREATE POLICY "Service can insert relatorios" ON relatorios_ia FOR INSERT WITH CHECK (
  empresa_id IN (SELECT id FROM empresas WHERE user_id = auth.uid())
);

-- Políticas RLS para chat_historico
CREATE POLICY "Users can manage own chat" ON chat_historico FOR ALL USING (
  auth.uid() = user_id
);

-- Políticas RLS para dados_anuais
CREATE POLICY "Users can manage own dados_anuais" ON dados_anuais FOR ALL USING (
  empresa_id IN (SELECT id FROM empresas WHERE user_id = auth.uid())
);

-- Índices para performance
CREATE INDEX idx_faturacao_empresa_ano ON faturacao_mensal(empresa_id, ano);
CREATE INDEX idx_despesas_empresa_ano ON despesas(empresa_id, ano);
CREATE INDEX idx_obrigacoes_empresa_estado ON obrigacoes_fiscais(empresa_id, estado);
CREATE INDEX idx_relatorios_empresa ON relatorios_ia(empresa_id, ano, mes);
