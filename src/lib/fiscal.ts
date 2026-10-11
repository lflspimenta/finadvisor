import { FaturacaoMensal, Despesa, ObrigacaoFiscal, Empresa, DadosAnuais } from '@/types'
import { format } from 'date-fns'
import { custoDespesa, ivaDedutivel } from '@/lib/faturas'
import { ConfigPessoal, CONFIG_PESSOAL_PADRAO, custosPessoalMes, custoPessoalAno, ssEntidadeGerenteAnual } from '@/lib/pessoal'

// Taxas fiscais Portugal 2025/2026
export const TAXAS = {
  IVA_NORMAL: 0.23,
  IVA_INTERMEDIO: 0.13,
  IVA_REDUZIDO: 0.06,
  SS_TRABALHADORES: 0.2375,
  DERRAMA_MAX: 0.015, // até 1.5%
}

/**
 * Taxas de IRC por período de tributação.
 * 2025: OE2025 (geral 20%, PME 16% até 50.000 €).
 * 2026-2028: Lei n.º 64/2025 (geral 19% / 18% / 17%; PME 15% até 50.000 €).
 */
export function taxasIRC(ano: number): { pme: number; geral: number } {
  if (ano <= 2024) return { pme: 0.17, geral: 0.21 }
  if (ano === 2025) return { pme: 0.16, geral: 0.20 }
  if (ano === 2026) return { pme: 0.15, geral: 0.19 }
  if (ano === 2027) return { pme: 0.15, geral: 0.18 }
  return { pme: 0.15, geral: 0.17 }
}

export function calcularIRC(lucroTributavel: number, ano: number = new Date().getFullYear()): number {
  if (lucroTributavel <= 0) return 0
  const { pme, geral } = taxasIRC(ano)
  if (lucroTributavel <= 50000) return lucroTributavel * pme
  return 50000 * pme + (lucroTributavel - 50000) * geral
}

/** Encargo da empresa com a SS do gerente (parte da entidade, 23,75%; base mínima 1 IAS). */
export function calcularSS(remuneracaoMensal: number, meses: number = 12): number {
  return Math.round(ssEntidadeGerenteAnual(remuneracaoMensal) / 12 * meses * 100) / 100
}

/**
 * Custos operacionais do ano (sem IVA dedutível).
 * Com configuração de pessoal: despesas sem a categoria "Salários" + custo calculado do pessoal.
 * Sem configuração: despesas lançadas + encargo da empresa com a SS do gerente.
 */
export function custosOperacionais(
  empresa: Pick<Empresa, 'remuneracao_socio_mensal'>,
  despesas: Despesa[],
  ano: number,
  pessoal: ConfigPessoal | null,
  ateMes = 12
): number {
  const desp = despesas.filter(d => d.ano === ano && d.mes <= ateMes && (!pessoal || d.categoria !== 'Salários'))
  const base = desp.reduce((s, d) => s + custoDespesa(d), 0)
  const extra = pessoal
    ? custoPessoalAno(pessoal, empresa.remuneracao_socio_mensal, ano, ateMes)
    : ssEntidadeGerenteAnual(empresa.remuneracao_socio_mensal, 'com_desemprego', ano) * ateMes / 12
  return Math.round((base + extra) * 100) / 100
}

/** IVA a entregar no trimestre = IVA cobrado − IVA dedutível das faturas de compra (mínimo 0; o excesso é crédito a reportar). */
export function calcularIVATrimestral(
  faturacao: FaturacaoMensal[],
  trimestre: number,
  ano: number,
  despesas: Despesa[] = []
): number {
  const mesesTrimestre = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
    [10, 11, 12],
  ][trimestre - 1]

  const cobrado = faturacao
    .filter(f => f.ano === ano && mesesTrimestre.includes(f.mes))
    .reduce((sum, f) => sum + Number(f.valor_iva_cobrado), 0)
  const dedutivel = despesas
    .filter(d => d.ano === ano && mesesTrimestre.includes(d.mes))
    .reduce((sum, d) => sum + ivaDedutivel(d), 0)
  return Math.max(0, Math.round((cobrado - dedutivel) * 100) / 100)
}

/** IVA a entregar de um mês (regime mensal) = IVA cobrado − IVA dedutível (mínimo 0). */
export function calcularIVAMes(faturacao: FaturacaoMensal[], despesas: Despesa[], ano: number, mes: number): number {
  const cobrado = faturacao.filter(f => f.ano === ano && f.mes === mes).reduce((s, f) => s + Number(f.valor_iva_cobrado), 0)
  const dedutivel = despesas.filter(d => d.ano === ano && d.mes === mes).reduce((s, d) => s + ivaDedutivel(d), 0)
  return Math.max(0, Math.round((cobrado - dedutivel) * 100) / 100)
}

/**
 * IRC de um exercício: usa os dados anuais importados (IRC do período ou, na falta,
 * IRC calculado sobre o resultado antes de impostos); sem dados anuais, estima a partir
 * da faturação e despesas lançadas nesse ano. Devolve null se não houver dados.
 */
export function ircDoExercicio(
  empresa: Empresa,
  faturacao: FaturacaoMensal[],
  despesas: Despesa[],
  dadosAnuais: DadosAnuais[],
  ano: number,
  pessoal: ConfigPessoal | null = null
): { irc: number; volume: number } | null {
  const da = dadosAnuais.find(d => d.ano === ano)
  if (da) {
    const irc = Number(da.irc) > 0 ? Number(da.irc) : calcularIRC(Number(da.resultado_antes_impostos), ano)
    return { irc, volume: Number(da.volume_negocios) }
  }
  const fat = faturacao.filter(f => f.ano === ano)
  if (fat.length === 0) return null
  const volume = fat.reduce((s, f) => s + Number(f.valor_faturado), 0)
  const lucro = Math.max(0, volume - custosOperacionais(empresa, despesas, ano, pessoal))
  return { irc: calcularIRC(lucro, ano), volume }
}

/** Pagamentos por conta (art. 105.º CIRC): 80% do IRC do ano anterior (95% se volume > 500.000 €), em 3 prestações. */
export function calcularPPC(ircAnoAnterior: number, volumeAnoAnterior: number): number {
  if (ircAnoAnterior < 200) return 0
  return ircAnoAnterior * (volumeAnoAnterior > 500000 ? 0.95 : 0.8)
}

export function gerarObrigacoesFiscais(
  empresa: Empresa,
  faturacao: FaturacaoMensal[],
  despesas: Despesa[],
  ano: number,
  dadosAnuais: DadosAnuais[] = [],
  pessoal: ConfigPessoal | null = null
): Omit<ObrigacaoFiscal, 'id' | 'empresa_id' | 'created_at'>[] {
  const obrigacoes: Omit<ObrigacaoFiscal, 'id' | 'empresa_id' | 'created_at'>[] = []

  // IVA Trimestral (se regime trimestral)
  if (empresa.regime_iva === 'trimestral') {
    const datasLimiteIVA = [
      // Declaração até dia 20 e pagamento até dia 25 do 2.º mês seguinte ao trimestre
      { trimestre: 1, mes_pagamento: 5, data: `${ano}-05-25` },
      { trimestre: 2, mes_pagamento: 8, data: `${ano}-08-25` },
      { trimestre: 3, mes_pagamento: 11, data: `${ano}-11-25` },
      { trimestre: 4, mes_pagamento: 2, data: `${ano + 1}-02-25` },
    ]

    for (const d of datasLimiteIVA) {
      const valorIVA = calcularIVATrimestral(faturacao, d.trimestre, ano, despesas)
      obrigacoes.push({
        tipo: 'IVA',
        ano,
        trimestre: d.trimestre,
        mes_pagamento: d.mes_pagamento,
        valor_estimado: valorIVA,
        estado: 'pendente',
        data_limite: d.data,
      })
    }
  }

  // IVA Mensal: pagamento até dia 25 do 2.º mês seguinte
  if (empresa.regime_iva === 'mensal') {
    for (let mes = 1; mes <= 12; mes++) {
      const pag = new Date(ano, mes + 1, 25) // mês + 2 (Date usa meses 0-11)
      obrigacoes.push({
        tipo: 'IVA',
        ano,
        mes_pagamento: pag.getMonth() + 1,
        valor_estimado: calcularIVAMes(faturacao, despesas, ano, mes),
        estado: 'pendente',
        data_limite: format(pag, 'yyyy-MM-dd'),
      })
    }
  }

  // Segurança Social (dia 25 do mês seguinte) e retenções de IRS (dia 20 do mês seguinte)
  const cfg = pessoal || CONFIG_PESSOAL_PADRAO
  for (let mes = 1; mes <= 12; mes++) {
    const c = custosPessoalMes(cfg, empresa.remuneracao_socio_mensal, ano, mes)
    if (c.ssTotal > 0) {
      obrigacoes.push({
        tipo: 'SS',
        ano,
        mes_pagamento: mes,
        valor_estimado: c.ssTotal,
        estado: 'pendente',
        data_limite: format(new Date(ano, mes, 25), 'yyyy-MM-dd'),
      })
    }
    if (c.irsRetido > 0) {
      obrigacoes.push({
        tipo: 'IRS',
        ano,
        mes_pagamento: mes,
        valor_estimado: c.irsRetido,
        estado: 'pendente',
        data_limite: format(new Date(ano, mes, 20), 'yyyy-MM-dd'),
      })
    }
  }

  // IRC do ano anterior: liquidação em Maio (IRC N-1 menos os PPC pagos em N-1)
  const anterior = ircDoExercicio(empresa, faturacao, despesas, dadosAnuais, ano - 1, pessoal)
  if (anterior && anterior.irc > 0) {
    const doisAntes = ircDoExercicio(empresa, faturacao, despesas, dadosAnuais, ano - 2, pessoal)
    const ppcPagosAnoAnterior = doisAntes ? calcularPPC(doisAntes.irc, doisAntes.volume) : 0
    const liquidacao = Math.max(0, anterior.irc - ppcPagosAnoAnterior)
    if (liquidacao > 0) {
      obrigacoes.push({
        tipo: 'IRC',
        ano,
        mes_pagamento: 5,
        valor_estimado: Math.round(liquidacao * 100) / 100,
        estado: 'pendente',
        data_limite: `${ano}-05-31`,
      })
    }

    // PPC deste ano: Julho, Setembro e Dezembro
    const ppc = calcularPPC(anterior.irc, anterior.volume)
    if (ppc > 0) {
      const prestacao = Math.round((ppc / 3) * 100) / 100
      for (const [mes, data] of [[7, `${ano}-07-31`], [9, `${ano}-09-30`], [12, `${ano}-12-15`]] as const) {
        obrigacoes.push({
          tipo: 'PPC',
          ano,
          mes_pagamento: mes,
          valor_estimado: prestacao,
          estado: 'pendente',
          data_limite: data,
        })
      }
    }
  }

  return obrigacoes
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(value)
}

export function getMesNome(mes: number): string {
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return meses[mes - 1] || ''
}

export function getTipoObrigacaoLabel(tipo: string): string {
  const labels: Record<string, string> = {
    IVA: 'IVA',
    IRC: 'IRC (Liquidação)',
    SS: 'Segurança Social',
    IRS: 'IRS Retenções',
    DERRAMA: 'Derrama',
    PPC: 'Pagamento por Conta',
  }
  return labels[tipo] || tipo
}

/** Etiquetas do eixo Y: 750 → "750", 12 500 → "12,5k", 1 200 000 → "1,2M". */
export function eixoEuros(v: number): string {
  const a = Math.abs(v)
  const f = (x: number) => x.toLocaleString('pt-PT', { maximumFractionDigits: 1 })
  if (a >= 1_000_000) return `${f(v / 1_000_000)}M`
  if (a >= 1000) return `${f(v / 1000)}k`
  return f(v)
}
