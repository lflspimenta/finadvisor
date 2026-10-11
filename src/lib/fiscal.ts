import { FaturacaoMensal, Despesa, ObrigacaoFiscal, ProjecaoCashflow, Empresa } from '@/types'
import { addMonths, format, getMonth, getYear } from 'date-fns'

// Taxas fiscais Portugal 2025/2026
export const TAXAS = {
  IVA_NORMAL: 0.23,
  IVA_INTERMEDIO: 0.13,
  IVA_REDUZIDO: 0.06,
  IRC_PME: 0.17,      // 1ª tranche até 50.000€
  IRC_NORMAL: 0.21,   // acima de 50.000€
  SS_GERENTE: 0.214,  // 21.4% sobre remuneração
  SS_TRABALHADORES: 0.2375,
  DERRAMA_MAX: 0.015, // até 1.5%
}

export function calcularIRC(lucroTributavel: number): number {
  if (lucroTributavel <= 0) return 0
  if (lucroTributavel <= 50000) {
    return lucroTributavel * TAXAS.IRC_PME
  }
  return 50000 * TAXAS.IRC_PME + (lucroTributavel - 50000) * TAXAS.IRC_NORMAL
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

export function gerarObrigacoesFiscais(
  empresa: Empresa,
  faturacao: FaturacaoMensal[],
  despesas: Despesa[],
  ano: number
): Omit<ObrigacaoFiscal, 'id' | 'empresa_id' | 'created_at'>[] {
  const obrigacoes: Omit<ObrigacaoFiscal, 'id' | 'empresa_id' | 'created_at'>[] = []

  const faturacaoAno = faturacao.filter(f => f.ano === ano)
  const totalFaturado = faturacaoAno.reduce((s, f) => s + f.valor_faturado, 0)
  const totalDespesas = despesas
    .filter(d => d.ano === ano)
    .reduce((s, d) => s + d.valor, 0)
  const lucroEstimado = Math.max(0, totalFaturado - totalDespesas - calcularSS(empresa.remuneracao_socio_mensal))

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

  // IRC Estimado (pagamento especial por conta - Março e Outubro)
  const ircEstimado = calcularIRC(lucroEstimado)
  if (ircEstimado > 0) {
    obrigacoes.push({
      tipo: 'IRC',
      ano,
      mes_pagamento: 5, // Maio - liquidação do ano anterior
      valor_estimado: ircEstimado,
      estado: 'pendente',
      data_limite: `${ano}-05-31`,
    })

    // PPC - Pagamento por Conta (Julho e Setembro)
    const ppc = ircEstimado * 0.75 // 75% do IRC estimado
    obrigacoes.push({
      tipo: 'PPC',
      ano,
      mes_pagamento: 7,
      valor_estimado: ppc / 2,
      estado: 'pendente',
      data_limite: `${ano}-07-31`,
    })
    obrigacoes.push({
      tipo: 'PPC',
      ano,
      mes_pagamento: 9,
      valor_estimado: ppc / 2,
      estado: 'pendente',
      data_limite: `${ano}-09-30`,
    })
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
