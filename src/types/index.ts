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
