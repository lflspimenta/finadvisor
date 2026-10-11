import { Despesa, Empresa, FaturacaoMensal, ObrigacaoFiscal, SaldoCaixa } from '@/types'
import { ivaDedutivel } from '@/lib/faturas'
import { ConfigPessoal, CONFIG_PESSOAL_PADRAO, custosPessoalMes } from '@/lib/pessoal'

/**
 * Projeção de tesouraria (ótica de caixa) para os próximos N meses.
 *
 * Recebimentos  = faturação prevista + IVA cobrado (o cliente paga com IVA)
 *                 → mesmo mês do ano anterior × tendência; sem histórico desse mês, média dos últimos 3 meses.
 * Pagamentos    = despesas correntes (média dos últimos 3 meses, com IVA)
 *               + pessoal: salários líquidos + alimentação no mês; SS e IRS retido no mês seguinte
 *               + IVA a entregar (calendário, ou estimado para períodos ainda sem calendário)
 *               + outros impostos do calendário (IRC, PPC, derrama...).
 */

export interface MesProjecao {
  rotulo: string
  ano: number
  mes: number
  recebimentos: number
  despesasCorrentes: number
  pessoal: number            // salários líquidos + alimentação + outros encargos (no mês)
  impostos: number           // IVA + SS + IRS retido + IRC/PPC/outros
  detalheImpostos: { tipo: string; valor: number; estimado: boolean }[]
  saldoMes: number
  saldoAcumulado: number
  baseReceita: 'sazonal' | 'media'
}

export interface SaldoPartida {
  valor: number
  data: string            // AAAA-MM-DD a que o saldo se refere
  origem: 'indicado' | 'importado' | 'nenhum'
}

export interface ResultadoProjecao {
  meses: MesProjecao[]
  saldoPartida: SaldoPartida
  tendencia: number
  primeiroMesNegativo: MesProjecao | null
  avisos: string[]
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const r2 = (v: number) => Math.round(v * 100) / 100
const idx = (ano: number, mes: number) => ano * 12 + (mes - 1)
const deIdx = (i: number) => ({ ano: Math.floor(i / 12), mes: (i % 12) + 1 })
export const MARCA_SALDO_INDICADO = 'Saldo bancário indicado em'

/** Saldo de partida: o último saldo indicado na app; senão o último saldo final importado. */
export function saldoDePartida(saldos: SaldoCaixa[]): SaldoPartida {
  const indicados = saldos
    .filter(s => s.notas?.startsWith(MARCA_SALDO_INDICADO))
    .sort((a, b) => (b.notas || '').localeCompare(a.notas || ''))
  if (indicados.length) {
    const s = indicados[0]
    return { valor: Number(s.saldo_inicial), data: (s.notas || '').slice(MARCA_SALDO_INDICADO.length).trim(), origem: 'indicado' }
  }
  const finais = saldos.filter(s => Number(s.saldo_final) !== 0).sort((a, b) => idx(b.ano, b.mes) - idx(a.ano, a.mes))
  if (finais.length) {
    const s = finais[0]
    const ultimoDia = new Date(s.ano, s.mes, 0).getDate()
    return { valor: Number(s.saldo_final), data: `${s.ano}-${String(s.mes).padStart(2, '0')}-${ultimoDia}`, origem: 'importado' }
  }
  return { valor: 0, data: '', origem: 'nenhum' }
}

export function calcularProjecao(p: {
  empresa: Pick<Empresa, 'regime_iva' | 'remuneracao_socio_mensal'>
  faturacao: FaturacaoMensal[]
  despesas: Despesa[]
  obrigacoes: ObrigacaoFiscal[]
  saldos: SaldoCaixa[]
  pessoal: ConfigPessoal | null
  hoje?: Date
  meses?: number
}): ResultadoProjecao {
  const hoje = p.hoje || new Date()
  const N = p.meses || 12
  const inicio = idx(hoje.getFullYear(), hoje.getMonth() + 1)
  const avisos: string[] = []

  // ---------- Receita (sem IVA) por mês ----------
  const fatPorIdx = new Map<number, FaturacaoMensal>()
  for (const f of p.faturacao) fatPorIdx.set(idx(f.ano, f.mes), f)
  const historico = [...fatPorIdx.keys()].filter(i => i < inicio).sort((a, b) => b - a)
  const ultimos3 = historico.slice(0, 3)
  const media3 = ultimos3.length ? ultimos3.reduce((s, i) => s + Number(fatPorIdx.get(i)!.valor_faturado), 0) / ultimos3.length : 0

  // Tendência: últimos 3 meses vs os mesmos meses do ano anterior (limitada a ±50%)
  let tendencia = 1
  const pares = ultimos3.filter(i => fatPorIdx.has(i - 12))
  if (pares.length >= 2) {
    const agora = pares.reduce((s, i) => s + Number(fatPorIdx.get(i)!.valor_faturado), 0)
    const antes = pares.reduce((s, i) => s + Number(fatPorIdx.get(i - 12)!.valor_faturado), 0)
    if (antes > 0) tendencia = Math.min(1.5, Math.max(0.5, agora / antes))
  }

  // Taxa média de IVA cobrado sobre a faturação (últimos 12 meses com dados)
  const ult12 = historico.slice(0, 12)
  const baseIva = ult12.reduce((s, i) => s + Number(fatPorIdx.get(i)!.valor_faturado), 0)
  const ivaCob = ult12.reduce((s, i) => s + Number(fatPorIdx.get(i)!.valor_iva_cobrado), 0)
  const taxaIva = p.empresa.regime_iva === 'isento' ? 0 : baseIva > 0 ? ivaCob / baseIva : 0.23

  function receitaMes(i: number): { base: number; iva: number; fonte: 'real' | 'sazonal' | 'media' } {
    const real = fatPorIdx.get(i)
    if (real && i < inicio) return { base: Number(real.valor_faturado), iva: Number(real.valor_iva_cobrado), fonte: 'real' }
    const anoAnterior = fatPorIdx.get(i - 12)
    if (anoAnterior) {
      const base = Number(anoAnterior.valor_faturado) * tendencia
      return { base, iva: base * taxaIva, fonte: 'sazonal' }
    }
    return { base: media3, iva: media3 * taxaIva, fonte: 'media' }
  }

  // ---------- Despesas correntes (média dos 3 meses completos anteriores) ----------
  const excluirSalarios = !!p.pessoal
  const despUlt3 = p.despesas.filter(d => {
    const i = idx(d.ano, d.mes)
    return i >= inicio - 3 && i < inicio && !(excluirSalarios && d.categoria === 'Salários')
  })
  const mediaDespesas = despUlt3.reduce((s, d) => s + Number(d.valor), 0) / 3
  const mediaIvaDedutivel = despUlt3.reduce((s, d) => s + ivaDedutivel(d), 0) / 3
  function ivaDedutivelMes(i: number): number {
    const { ano, mes } = deIdx(i)
    if (i < inicio) return p.despesas.filter(d => d.ano === ano && d.mes === mes).reduce((s, d) => s + ivaDedutivel(d), 0)
    return mediaIvaDedutivel
  }

  // ---------- IVA a entregar por mês de pagamento ----------
  function ivaAPagar(iPag: number): { valor: number; estimado: boolean } | null {
    const { ano: aP, mes: mP } = deIdx(iPag)
    const prefixo = `${aP}-${String(mP).padStart(2, '0')}`
    const doCalendario = p.obrigacoes.find(o => o.tipo === 'IVA' && o.data_limite.startsWith(prefixo))
    if (doCalendario) return { valor: doCalendario.estado === 'pendente' ? Number(doCalendario.valor_real || doCalendario.valor_estimado) : 0, estimado: false }
    let periodo: number[] = []
    if (p.empresa.regime_iva === 'mensal') periodo = [iPag - 2]
    else if (p.empresa.regime_iva === 'trimestral' && [2, 5, 8, 11].includes(mP)) periodo = [iPag - 4, iPag - 3, iPag - 2]
    if (!periodo.length) return null
    const v = periodo.reduce((s, i) => s + receitaMes(i).iva - ivaDedutivelMes(i), 0)
    return { valor: Math.max(0, v), estimado: true }
  }

  // ---------- Pessoal ----------
  const cfg = p.pessoal || CONFIG_PESSOAL_PADRAO
  const rem = p.empresa.remuneracao_socio_mensal || 0
  const pessoalMes = (i: number) => { const { ano, mes } = deIdx(i); return custosPessoalMes(cfg, rem, ano, mes) }

  // ---------- Saldo de partida ----------
  const saldoPartida = saldoDePartida(p.saldos)
  if (saldoPartida.origem === 'nenhum') {
    avisos.push('Sem saldo bancário indicado: a projeção parte de 0 €. Indica o saldo atual para uma projeção real.')
  } else {
    const dias = (hoje.getTime() - new Date(saldoPartida.data).getTime()) / 86400000
    if (dias > 45) avisos.push(`O saldo de partida é de ${new Date(saldoPartida.data).toLocaleDateString('pt-PT')}. Atualiza o saldo bancário para uma projeção fiel.`)
  }
  if (!p.pessoal && rem > 0) avisos.push('Pessoal não configurado: só a SS do gerente entra na projeção (os salários vêm das despesas lançadas).')
  if (historico.length === 0) avisos.push('Sem faturação registada: os recebimentos previstos são 0 €.')

  // ---------- Meses ----------
  const meses: MesProjecao[] = []
  let acumulado = saldoPartida.valor
  for (let k = 0; k < N; k++) {
    const i = inicio + k
    const { ano, mes } = deIdx(i)
    const prefixo = `${ano}-${String(mes).padStart(2, '0')}`
    const rec = receitaMes(i)
    const detalhe: MesProjecao['detalheImpostos'] = []

    const iva = ivaAPagar(i)
    if (iva && iva.valor > 0) detalhe.push({ tipo: 'IVA', valor: r2(iva.valor), estimado: iva.estimado })

    // SS e IRS do mês anterior
    // Sem configuração de pessoal só conta a parte da empresa na SS do gerente: o salário bruto
    // (que já inclui os 11% do gerente) está nas despesas lançadas.
    const pAnt = pessoalMes(i - 1)
    const ss = excluirSalarios ? pAnt.ssTotal : pAnt.ssEntidade
    if (ss > 0) detalhe.push({ tipo: 'SS', valor: ss, estimado: true })
    if (excluirSalarios && pAnt.irsRetido > 0) detalhe.push({ tipo: 'IRS', valor: pAnt.irsRetido, estimado: true })

    // Restantes impostos do calendário (IRC, PPC, derrama...)
    for (const o of p.obrigacoes) {
      if (['IVA', 'SS', 'IRS'].includes(o.tipo) || o.estado !== 'pendente' || !o.data_limite.startsWith(prefixo)) continue
      detalhe.push({ tipo: o.tipo, valor: Number(o.valor_real || o.valor_estimado), estimado: false })
    }

    const pAtual = pessoalMes(i)
    const pessoal = excluirSalarios ? pAtual.liquidoPago + pAtual.outrosEncargos : 0
    // Sem configuração de pessoal, o salário do gerente já está nas despesas (categoria Salários);
    // a SS do gerente é paga à parte (detalhe acima).
    const impostos = detalhe.reduce((s, d) => s + d.valor, 0)
    const recebimentos = rec.base + rec.iva
    const saldoMes = recebimentos - mediaDespesas - pessoal - impostos
    acumulado += saldoMes
    meses.push({
      rotulo: `${MESES[mes - 1]} ${ano}`,
      ano, mes,
      recebimentos: r2(recebimentos),
      despesasCorrentes: r2(mediaDespesas),
      pessoal: r2(pessoal),
      impostos: r2(impostos),
      detalheImpostos: detalhe,
      saldoMes: r2(saldoMes),
      saldoAcumulado: r2(acumulado),
      baseReceita: rec.fonte === 'sazonal' ? 'sazonal' : 'media',
    })
  }

  return { meses, saldoPartida, tendencia: r2(tendencia), primeiroMesNegativo: meses.find(m => m.saldoAcumulado < 0) || null, avisos }
}
