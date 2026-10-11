import { FaturacaoMensal } from '@/types'

/** Linhas de faturação mensal geradas automaticamente (estimativa importada ou soma de faturas). */
export function eAutomatico(notas?: string | null): boolean {
  return !!notas && (notas.startsWith('Estimativa') || notas.startsWith('Calculado a partir'))
}

export type AcaoMes =
  | { acao: 'upsert'; valor_faturado: number; valor_iva_cobrado: number; notas: string | null }
  | { acao: 'apagar' }
  | { acao: 'nada' }

const r2 = (v: number) => Math.round(v * 100) / 100

/**
 * Decide o novo valor de um mês da faturação depois de adicionar/remover faturas de venda.
 * - Mês vazio ou automático: passa a ser a soma de todas as faturas do mês (substitui a estimativa ÷12).
 * - Mês introduzido à mão: soma/subtrai a diferença, mantendo o valor manual.
 */
export function novoRegistoMes(
  existente: Pick<FaturacaoMensal, 'valor_faturado' | 'valor_iva_cobrado' | 'notas'> | undefined,
  somaFaturasMes: { base: number; iva: number; n: number },
  delta: { base: number; iva: number }
): AcaoMes {
  if (!existente || eAutomatico(existente.notas)) {
    if (somaFaturasMes.n === 0) return existente ? { acao: 'apagar' } : { acao: 'nada' }
    return {
      acao: 'upsert',
      valor_faturado: r2(somaFaturasMes.base),
      valor_iva_cobrado: r2(somaFaturasMes.iva),
      notas: `Calculado a partir de ${somaFaturasMes.n} fatura${somaFaturasMes.n === 1 ? '' : 's'}`,
    }
  }
  return {
    acao: 'upsert',
    valor_faturado: r2(Number(existente.valor_faturado) + delta.base),
    valor_iva_cobrado: r2(Number(existente.valor_iva_cobrado) + delta.iva),
    notas: existente.notas ?? null,
  }
}
