import { DadosAnuaisInput } from '@/types'
import { TAXAS } from '@/lib/fiscal'
import { ssEntidadeGerenteAnual } from '@/lib/pessoal'

export type CampoAnual = keyof Omit<DadosAnuaisInput, 'ano' | 'fonte'>

export const CAMPOS_ANUAIS: { key: CampoAnual; label: string; descricao: string; grupo: 'dr' | 'balanco'; podeNegativo?: boolean }[] = [
  { key: 'volume_negocios', label: 'Volume de negócios', descricao: 'Vendas e serviços prestados', grupo: 'dr' },
  { key: 'cmvmc', label: 'CMVMC (mercadorias/matérias)', descricao: 'Custo das mercadorias vendidas e matérias consumidas', grupo: 'dr' },
  { key: 'fse', label: 'Fornecimentos e serviços externos', descricao: 'FSE', grupo: 'dr' },
  { key: 'gastos_pessoal', label: 'Gastos com o pessoal', descricao: 'Gastos com o pessoal (inclui remunerações e encargos sociais)', grupo: 'dr' },
  { key: 'outros_gastos', label: 'Outros gastos', descricao: 'Outros gastos e perdas operacionais', grupo: 'dr' },
  { key: 'ebitda', label: 'EBITDA', descricao: 'Resultado antes de depreciações, gastos de financiamento e impostos', grupo: 'dr', podeNegativo: true },
  { key: 'juros', label: 'Juros e gastos similares', descricao: 'Juros e gastos similares suportados', grupo: 'dr' },
  { key: 'resultado_antes_impostos', label: 'Resultado antes de impostos', descricao: 'Resultado antes de impostos', grupo: 'dr', podeNegativo: true },
  { key: 'irc', label: 'IRC do exercício', descricao: 'Imposto sobre o rendimento do período', grupo: 'dr' },
  { key: 'resultado_liquido', label: 'Resultado líquido', descricao: 'Resultado líquido do período', grupo: 'dr', podeNegativo: true },
  { key: 'ativo_corrente', label: 'Ativo corrente', descricao: 'Total do ativo corrente', grupo: 'balanco' },
  { key: 'caixa', label: 'Caixa e depósitos bancários', descricao: 'Caixa e depósitos bancários', grupo: 'balanco' },
  { key: 'inventarios', label: 'Inventários', descricao: 'Inventários / existências', grupo: 'balanco' },
  { key: 'ativo_total', label: 'Ativo total', descricao: 'Total do ativo', grupo: 'balanco' },
  { key: 'passivo_corrente', label: 'Passivo corrente', descricao: 'Total do passivo corrente', grupo: 'balanco' },
  { key: 'passivo_total', label: 'Passivo total', descricao: 'Total do passivo', grupo: 'balanco' },
  { key: 'capital_proprio', label: 'Capital próprio', descricao: 'Total do capital próprio', grupo: 'balanco', podeNegativo: true },
  { key: 'divida_financeira', label: 'Dívida financeira', descricao: 'Financiamentos obtidos (correntes e não correntes)', grupo: 'balanco' },
]

export const MARCA_IMPORTADO = '[Importado'

export interface PlanoImportacao {
  faturacaoMensal: number
  ivaMensal: number
  despesasMensais: { categoria: string; descricao: string; valorMensal: number; valorAnual: number }[]
  ssGerenteDescontado: number
  saldoDezembro: number | null
}

const r2 = (v: number) => Math.round(v * 100) / 100

/**
 * Converte os valores anuais em lançamentos mensais (÷12).
 * - Faturação: volume de negócios ÷ 12; IVA = faturação × taxa (0 se isento).
 * - Despesas: CMVMC → Fornecedores, Pessoal → Salários (sem o encargo da empresa com a SS do gerente, que a app soma à parte),
 *   FSE e Outros gastos → Outros.
 * - Caixa → saldo final de Dezembro.
 */
export function planearImportacao(
  d: Pick<DadosAnuaisInput, 'ano' | 'volume_negocios' | 'cmvmc' | 'fse' | 'gastos_pessoal' | 'outros_gastos' | 'caixa'>,
  opts: { taxaIva: number; regimeIva: string; remuneracaoSocioMensal: number }
): PlanoImportacao {
  const faturacaoMensal = r2(Math.max(0, d.volume_negocios) / 12)
  const ivaMensal = opts.regimeIva === 'isento' ? 0 : r2(faturacaoMensal * opts.taxaIva)

  const ssGerenteAnual = ssEntidadeGerenteAnual(opts.remuneracaoSocioMensal || 0, 'com_desemprego', d.ano)
  const pessoalSemSS = Math.max(0, d.gastos_pessoal - ssGerenteAnual)
  const ssGerenteDescontado = r2(d.gastos_pessoal - pessoalSemSS)

  const marca = `${MARCA_IMPORTADO} ${d.ano}]`
  const linhas = [
    { categoria: 'Fornecedores', descricao: `${marca} CMVMC`, valorAnual: d.cmvmc },
    { categoria: 'Salários', descricao: `${marca} Gastos com pessoal`, valorAnual: pessoalSemSS },
    { categoria: 'Outros', descricao: `${marca} Fornecimentos e serviços externos`, valorAnual: d.fse },
    { categoria: 'Outros', descricao: `${marca} Outros gastos`, valorAnual: d.outros_gastos },
  ]
    .filter(l => l.valorAnual > 0)
    .map(l => ({ ...l, valorAnual: r2(l.valorAnual), valorMensal: r2(l.valorAnual / 12) }))

  return {
    faturacaoMensal,
    ivaMensal,
    despesasMensais: linhas,
    ssGerenteDescontado,
    saldoDezembro: d.caixa > 0 ? r2(d.caixa) : null,
  }
}

export const TAXA_IVA_PADRAO = TAXAS.IVA_NORMAL
