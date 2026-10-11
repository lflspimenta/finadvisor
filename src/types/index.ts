export interface Empresa {
  id: string
  user_id: string
  nome: string
  nif: string
  tipo: 'unipessoal' | 'lda' | 'sa' | 'eni'
  regime_iva: 'trimestral' | 'mensal' | 'isento'
  regime_irc: 'simplificado' | 'normal'
  data_inicio_atividade: string
  setor: string
  remuneracao_socio_mensal: number
  created_at: string
}

export interface FaturacaoMensal {
  id: string
  empresa_id: string
  ano: number
  mes: number
  valor_faturado: number
  valor_iva_cobrado: number
  notas?: string
  created_at: string
}

export interface Despesa {
  id: string
  empresa_id: string
  ano: number
  mes: number
  categoria: string
  descricao: string
  valor: number
  recorrente: boolean
  created_at: string
  // Dados da fatura (opcionais — só em despesas registadas a partir de faturas)
  fornecedor_nome?: string | null
  fornecedor_nif?: string | null
  numero_documento?: string | null
  data_documento?: string | null
  atcud?: string | null
  valor_base?: number | null
  valor_iva?: number | null
  deducao_iva?: number | null
  ficheiro_path?: string | null
}

export interface ObrigacaoFiscal {
  id: string
  empresa_id: string
  tipo: 'IVA' | 'IRC' | 'SS' | 'IRS' | 'DERRAMA' | 'PPC'
  ano: number
  trimestre?: number
  mes_pagamento: number
  valor_estimado: number
  valor_real?: number
  estado: 'pendente' | 'pago' | 'atrasado'
  data_limite: string
  data_pagamento?: string
  created_at: string
}

export interface SaldoCaixa {
  id: string
  empresa_id: string
  ano: number
  mes: number
  saldo_inicial: number
  saldo_final: number
  notas?: string
  created_at: string
}

export interface RelatorioIA {
  id: string
  empresa_id: string
  ano: number
  mes: number
  perfil: 'conservador' | 'crescimento' | 'fiscal'
  conteudo: string
  recomendacoes: string[]
  created_at: string
}

export interface ChatMensagem {
  id: string
  empresa_id: string
  user_id: string
  perfil: 'conservador' | 'crescimento' | 'fiscal'
  pergunta: string
  resposta: string
  created_at: string
}

export type PerfilContabilista = 'conservador' | 'crescimento' | 'fiscal'

export interface ProjecaoCashflow {
  mes: string
  ano: number
  mes_num: number
  receita_prevista: number
  despesas_previstas: number
  obrigacoes_fiscais: number
  saldo_previsto: number
  saldo_acumulado: number
}

export interface IndicadoresFinanceiros {
  faturacaoAnual: number
  faturacaoMensal: number
  ivaEstimado: number
  ircEstimado: number
  ssEstimado: number
  resultadoLiquido: number
  margemLiquida: number
}

export interface DadosAnuais {
  id: string
  empresa_id: string
  ano: number
  volume_negocios: number
  cmvmc: number
  fse: number
  gastos_pessoal: number
  outros_gastos: number
  ebitda: number
  juros: number
  resultado_antes_impostos: number
  irc: number
  resultado_liquido: number
  ativo_corrente: number
  caixa: number
  inventarios: number
  ativo_total: number
  passivo_corrente: number
  passivo_total: number
  capital_proprio: number
  divida_financeira: number
  fonte?: string
  created_at: string
}

export type DadosAnuaisInput = Omit<DadosAnuais, 'id' | 'empresa_id' | 'created_at'>

export interface FaturaVenda {
  id: string
  empresa_id: string
  ano: number
  mes: number
  cliente_nome: string | null
  cliente_nif: string | null
  numero_documento: string | null
  data_documento: string | null
  atcud: string | null
  valor_base: number
  valor_iva: number
  valor_total: number
  ficheiro_path: string | null
  created_at: string
}

export interface Pessoal {
  id: string
  empresa_id: string
  n_trabalhadores: number
  massa_salarial_mensal: number
  subsidio_alimentacao_mensal: number
  subsidios_duodecimos: boolean
  mes_subsidio_ferias: number
  mes_subsidio_natal: number
  taxa_tsu_empresa: number
  taxa_irs_trabalhadores: number
  outros_encargos_pct: number
  gerente_regime: 'com_desemprego' | 'outros'
  gerente_14_meses: boolean
  taxa_irs_gerente: number
  updated_at?: string
}
