import { FaturacaoMensal, Despesa, ObrigacaoFiscal, ProjecaoCashflow, Empresa, DadosAnuais } from '@/types'
import { addMonths, format, getMonth, getYear } from 'date-fns'

// Taxas fiscais Portugal 2025/2026
export const TAXAS = {
  IVA_NORMAL: 0.23,
  IVA_INTERMEDIO: 0.13,
  IVA_REDUZIDO: 0.06,
  SS_GERENTE: 0.214,  // 21.4% sobre remuneração
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

export function calcularSS(remuneracaoMensal: number, meses: number = 12): number {
  return remuneracaoMensal * TAXAS.SS_GERENTE * meses
}

export function calcularIVATrimestral(
  faturacao: FaturacaoMensal[],
  trimestre: number,
  ano: number
): number {
  const mesesTrimestre = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
    [10, 11, 12],
  ][trimestre - 1]

  return faturacao
    .filter(f => f.ano === ano && mesesTrimestre.includes(f.mes))
    .reduce((sum, f) => sum + f.valor_iva_cobrado, 0)
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
  ano: number
): { irc: number; volume: number } | null {
  const da = dadosAnuais.find(d => d.ano === ano)
  if (da) {
    const irc = Number(da.irc) > 0 ? Number(da.irc) : calcularIRC(Number(da.resultado_antes_impostos), ano)
    return { irc, volume: Number(da.volume_negocios) }
  }
  const fat = faturacao.filter(f => f.ano === ano)
  if (fat.length === 0) return null
  const volume = fat.reduce((s, f) => s + Number(f.valor_faturado), 0)
  const gastos = despesas.filter(d => d.ano === ano).reduce((s, d) => s + Number(d.valor), 0)
  const lucro = Math.max(0, volume - gastos - calcularSS(empresa.remuneracao_socio_mensal))
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
  dadosAnuais: DadosAnuais[] = []
): Omit<ObrigacaoFiscal, 'id' | 'empresa_id' | 'created_at'>[] {
  const obrigacoes: Omit<ObrigacaoFiscal, 'id' | 'empresa_id' | 'created_at'>[] = []

  // IVA Trimestral (se regime trimestral)
  if (empresa.regime_iva === 'trimestral') {
    const datasLimiteIVA = [
      { trimestre: 1, mes_pagamento: 5, data: `${ano}-05-20` },
      { trimestre: 2, mes_pagamento: 8, data: `${ano}-08-20` },
      { trimestre: 3, mes_pagamento: 11, data: `${ano}-11-20` },
      { trimestre: 4, mes_pagamento: 2, data: `${ano + 1}-02-20` },
    ]

    for (const d of datasLimiteIVA) {
      const valorIVA = calcularIVATrimestral(faturacao, d.trimestre, ano)
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

  // SS Mensal (gerente/sócio)
  for (let mes = 1; mes <= 12; mes++) {
    const valorSS = empresa.remuneracao_socio_mensal * TAXAS.SS_GERENTE
    const dataMes = new Date(ano, mes, 20) // dia 20 do mês seguinte
    obrigacoes.push({
      tipo: 'SS',
      ano,
      mes_pagamento: mes,
      valor_estimado: valorSS,
      estado: 'pendente',
      data_limite: format(dataMes, 'yyyy-MM-dd'),
    })
  }

  // IRC do ano anterior: liquidação em Maio (IRC N-1 menos os PPC pagos em N-1)
  const anterior = ircDoExercicio(empresa, faturacao, despesas, dadosAnuais, ano - 1)
  if (anterior && anterior.irc > 0) {
    const doisAntes = ircDoExercicio(empresa, faturacao, despesas, dadosAnuais, ano - 2)
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

export function calcularProjecaoCashflow(
  empresa: Empresa,
  faturacao: FaturacaoMensal[],
  despesas: Despesa[],
  obrigacoes: ObrigacaoFiscal[],
  mesesAfrente: number = 12
): ProjecaoCashflow[] {
  const hoje = new Date()
  const projecoes: ProjecaoCashflow[] = []

  // Calcular média de faturação dos últimos 3 meses
  const ultimos3Meses = faturacao
    .sort((a, b) => (a.ano * 12 + a.mes) - (b.ano * 12 + b.mes))
    .slice(-3)

  const mediaFaturacao = ultimos3Meses.length > 0
    ? ultimos3Meses.reduce((s, f) => s + f.valor_faturado, 0) / ultimos3Meses.length
    : 0

  // Calcular média de despesas mensais
  const ultimos3MesesDespesas = despesas
    .filter(d => {
      const dataD = new Date(d.ano, d.mes - 1)
      const diff = (hoje.getFullYear() * 12 + hoje.getMonth()) - (dataD.getFullYear() * 12 + dataD.getMonth())
      return diff >= 0 && diff < 3
    })

  const mediaDespesas = ultimos3MesesDespesas.length > 0
    ? ultimos3MesesDespesas.reduce((s, d) => s + d.valor, 0) / 3
    : 0

  let saldoAcumulado = 0

  for (let i = 0; i < mesesAfrente; i++) {
    const data = addMonths(hoje, i)
    const mes = getMonth(data) + 1
    const ano = getYear(data)
    const mesStr = format(data, 'MMM yyyy')

    // Obrigações fiscais neste mês
    const obrigacoesMes = obrigacoes
      .filter(o => o.mes_pagamento === mes && o.ano === ano && o.estado === 'pendente')
      .reduce((s, o) => s + (o.valor_real || o.valor_estimado), 0)

    // SS mensal
    const ssMensal = empresa.remuneracao_socio_mensal * TAXAS.SS_GERENTE

    const receitaPrevista = mediaFaturacao
    const despesasPrevistas = mediaDespesas + ssMensal
    const saldoPrevisto = receitaPrevista - despesasPrevistas - obrigacoesMes
    saldoAcumulado += saldoPrevisto

    projecoes.push({
      mes: mesStr,
      ano,
      mes_num: mes,
      receita_prevista: receitaPrevista,
      despesas_previstas: despesasPrevistas,
      obrigacoes_fiscais: obrigacoesMes,
      saldo_previsto: saldoPrevisto,
      saldo_acumulado: saldoAcumulado,
    })
  }

  return projecoes
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
