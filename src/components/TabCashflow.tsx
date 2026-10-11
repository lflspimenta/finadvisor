'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Empresa, FaturacaoMensal, Despesa, ObrigacaoFiscal, SaldoCaixa } from '@/types'
import { formatCurrency, eixoEuros } from '@/lib/fiscal'
import { calcularProjecao, MARCA_SALDO_INDICADO } from '@/lib/cashflow'
import { ConfigPessoal } from '@/lib/pessoal'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'

interface Props {
  empresa: Empresa
  faturacao: FaturacaoMensal[]
  despesas: Despesa[]
  obrigacoes: ObrigacaoFiscal[]
  saldos: SaldoCaixa[]
  setSaldos: (s: SaldoCaixa[]) => void
  pessoal: ConfigPessoal | null
}

export default function TabCashflow({ empresa, faturacao, despesas, obrigacoes, saldos, setSaldos, pessoal }: Props) {
  const supabase = createClient()
  const [editarSaldo, setEditarSaldo] = useState(false)
  const [valorSaldo, setValorSaldo] = useState('')
  const [aGravar, setAGravar] = useState(false)
  const [erro, setErro] = useState('')

  const proj = calcularProjecao({ empresa, faturacao, despesas, obrigacoes, saldos, pessoal })
  const { meses, saldoPartida, primeiroMesNegativo } = proj

  const totalReceb = meses.reduce((s, m) => s + m.recebimentos, 0)
  const totalPag = meses.reduce((s, m) => s + m.despesasCorrentes + m.pessoal, 0)
  const totalImp = meses.reduce((s, m) => s + m.impostos, 0)
  const saldoFinal = meses.length ? meses[meses.length - 1].saldoAcumulado : saldoPartida.valor
  const minimo = meses.reduce((min, m) => (m.saldoAcumulado < min.saldoAcumulado ? m : min), meses[0])

  async function gravarSaldo() {
    const v = parseFloat(valorSaldo.replace(',', '.'))
    if (!Number.isFinite(v)) { setErro('Indica um valor válido.'); return }
    setAGravar(true); setErro('')
    const hoje = new Date()
    const dataISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`
    const { data, error } = await supabase.from('saldos_caixa').upsert({
      empresa_id: empresa.id, ano: hoje.getFullYear(), mes: hoje.getMonth() + 1,
      saldo_inicial: v, notas: `${MARCA_SALDO_INDICADO} ${dataISO}`,
    }, { onConflict: 'empresa_id,ano,mes' }).select().single()
    setAGravar(false)
    if (error) { setErro(error.message); return }
    setSaldos([...saldos.filter(s => !(s.ano === data.ano && s.mes === data.mes)), data])
    setEditarSaldo(false)
  }

  const chartData = meses.map(m => ({
    mes: m.rotulo,
    recebimentos: Math.round(m.recebimentos),
    pagamentos: Math.round(m.despesasCorrentes + m.pessoal),
    impostos: Math.round(m.impostos),
    saldo: Math.round(m.saldoAcumulado),
  }))

  const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 20 }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: 'DM Serif Display, serif', fontSize: 24, color: 'var(--text)', margin: '0 0 4px' }}>
          Projeção de tesouraria — 12 meses
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
          Dinheiro que entra e sai: recebimentos com IVA, despesas, pessoal e impostos nas datas de pagamento
        </p>
      </div>

      {/* Saldo de partida */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 4px' }}>Saldo bancário de partida</p>
          <p style={{ fontSize: 22, fontWeight: 600, margin: 0, color: saldoPartida.valor >= 0 ? 'var(--text)' : 'var(--negative)' }}>
            {formatCurrency(saldoPartida.valor)}
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>
              {saldoPartida.origem === 'indicado' && `indicado em ${new Date(saldoPartida.data).toLocaleDateString('pt-PT')}`}
              {saldoPartida.origem === 'importado' && `contas anuais (${new Date(saldoPartida.data).toLocaleDateString('pt-PT')})`}
              {saldoPartida.origem === 'nenhum' && 'não indicado'}
            </span>
          </p>
        </div>
        {editarSaldo ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="number" step="0.01" autoFocus placeholder="Saldo atual (€)" value={valorSaldo}
              onChange={e => setValorSaldo(e.target.value)} onKeyDown={e => e.key === 'Enter' && gravarSaldo()} style={{ width: 170 }} />
            <button onClick={() => setEditarSaldo(false)} style={btnSec}>Cancelar</button>
            <button onClick={gravarSaldo} disabled={aGravar} style={btnPri}>{aGravar ? 'A gravar…' : 'Gravar'}</button>
          </div>
        ) : (
          <button onClick={() => { setValorSaldo(''); setEditarSaldo(true) }} style={btnPri}>Atualizar saldo atual</button>
        )}
        {erro && <p style={{ color: 'var(--negative)', fontSize: 12, width: '100%', margin: 0 }}>{erro}</p>}
      </div>

      {/* Avisos */}
      {(proj.avisos.length > 0 || primeiroMesNegativo) && (
        <div style={{ ...card, background: primeiroMesNegativo ? 'var(--negative-soft)' : 'var(--hover-soft)', borderColor: primeiroMesNegativo ? 'var(--negative-border)' : 'var(--border)', padding: '12px 16px' }}>
          {primeiroMesNegativo && (
            <p style={{ margin: '0 0 6px', color: 'var(--negative)', fontWeight: 600, fontSize: 14 }}>
              ⚠️ O saldo fica negativo em {primeiroMesNegativo.rotulo} ({formatCurrency(primeiroMesNegativo.saldoAcumulado)}).
              {minimo && minimo.saldoAcumulado < 0 && ` Ponto mais baixo: ${minimo.rotulo} (${formatCurrency(minimo.saldoAcumulado)}).`}
            </p>
          )}
          {proj.avisos.map(a => <p key={a} style={{ margin: '2px 0', fontSize: 13, color: 'var(--text-2)' }}>• {a}</p>)}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Recebimentos (12m, c/ IVA)', value: formatCurrency(totalReceb), color: 'var(--accent)' },
          { label: 'Despesas e pessoal (12m)', value: formatCurrency(totalPag), color: 'var(--negative)' },
          { label: 'Impostos e SS (12m)', value: formatCurrency(totalImp), color: 'var(--warning)' },
          { label: 'Saldo previsto daqui a 12 meses', value: formatCurrency(saldoFinal), color: saldoFinal >= 0 ? 'var(--positive)' : 'var(--negative)' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
            <p style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 4px' }}>{k.label}</p>
            <p style={{ color: k.color, fontSize: 18, fontWeight: 600, margin: 0 }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Gráfico */}
      <div style={card}>
        <h3 style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600, marginTop: 0, marginBottom: 16 }}>Entradas, saídas e saldo em conta</h3>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 0, right: 0, left: -6, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="mes" tick={{ fill: 'var(--muted)', fontSize: 11 }} />
            <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={eixoEuros} />
            <Tooltip formatter={(v: number, name: string) => [formatCurrency(v), name]}
              contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} labelStyle={{ color: 'var(--text)' }} />
            <Legend wrapperStyle={{ fontSize: 12, color: 'var(--muted)' }} />
            <ReferenceLine y={0} stroke="var(--negative)" strokeDasharray="4 4" />
            <Bar dataKey="recebimentos" name="Recebimentos" fill="var(--accent)" opacity={0.85} radius={[3, 3, 0, 0]} />
            <Bar dataKey="pagamentos" name="Despesas + pessoal" fill="var(--negative)" opacity={0.7} radius={[3, 3, 0, 0]} />
            <Bar dataKey="impostos" name="Impostos e SS" fill="var(--warning)" opacity={0.75} radius={[3, 3, 0, 0]} />
            <Line dataKey="saldo" name="Saldo em conta" stroke="var(--info)" strokeWidth={2.5} dot={{ fill: 'var(--info)', r: 3 }} type="monotone" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Mês', 'Recebimentos', 'Despesas', 'Pessoal', 'Impostos e SS', 'Saldo do mês', 'Saldo em conta'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Mês' ? 'left' : 'right', fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {meses.map(m => (
              <tr key={m.rotulo} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                <td style={{ padding: '8px 14px', color: 'var(--text)' }}>
                  {m.rotulo}
                  {m.baseReceita === 'sazonal' && <span title="Receita baseada no mesmo mês do ano anterior" style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 6 }}>sazonal</span>}
                </td>
                <td style={{ ...num, color: 'var(--accent)' }}>{formatCurrency(m.recebimentos)}</td>
                <td style={{ ...num, color: 'var(--negative)' }}>{formatCurrency(m.despesasCorrentes)}</td>
                <td style={{ ...num, color: 'var(--negative)' }}>{m.pessoal ? formatCurrency(m.pessoal) : '—'}</td>
                <td style={{ ...num, color: 'var(--warning)' }} title={m.detalheImpostos.map(d => `${d.tipo}: ${formatCurrency(d.valor)}${d.estimado ? ' (estimado)' : ''}`).join('\n')}>
                  {m.impostos ? formatCurrency(m.impostos) : '—'}
                  {m.detalheImpostos.length > 0 && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{m.detalheImpostos.map(d => d.tipo).join(' + ')}</div>}
                </td>
                <td style={{ ...num, color: m.saldoMes >= 0 ? 'var(--positive)' : 'var(--negative)' }}>{formatCurrency(m.saldoMes)}</td>
                <td style={{ ...num, color: m.saldoAcumulado >= 0 ? 'var(--positive)' : 'var(--negative)', fontWeight: 600 }}>{formatCurrency(m.saldoAcumulado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ color: 'var(--faint)', fontSize: 12, marginTop: 14, lineHeight: 1.6 }}>
        Recebimentos: mesmo mês do ano anterior ajustado pela tendência recente{proj.tendencia !== 1 ? ` (${proj.tendencia > 1 ? '+' : ''}${Math.round((proj.tendencia - 1) * 100)}%)` : ''}; sem histórico desse mês, média dos últimos 3 meses.
        Despesas: média dos últimos 3 meses. IVA, SS e IRS na data de pagamento; IRC e PPC conforme o calendário fiscal gerado. Valores indicativos.
      </p>
    </div>
  )
}

const num: React.CSSProperties = { padding: '8px 14px', textAlign: 'right' }
const btnPri: React.CSSProperties = { background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }
const btnSec: React.CSSProperties = { background: 'var(--surface)', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 14px', fontSize: 13, cursor: 'pointer' }
