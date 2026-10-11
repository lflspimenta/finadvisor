'use client'

import { Empresa, FaturacaoMensal, Despesa, ObrigacaoFiscal } from '@/types'
import { calcularProjecaoCashflow, formatCurrency } from '@/lib/fiscal'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'

interface Props {
  empresa: Empresa
  faturacao: FaturacaoMensal[]
  despesas: Despesa[]
  obrigacoes: ObrigacaoFiscal[]
}

export default function TabCashflow({ empresa, faturacao, despesas, obrigacoes }: Props) {
  const projecoes = calcularProjecaoCashflow(empresa, faturacao, despesas, obrigacoes, 12)

  const totalReceita = projecoes.reduce((s, p) => s + p.receita_prevista, 0)
  const totalDespesas = projecoes.reduce((s, p) => s + p.despesas_previstas, 0)
  const totalFiscal = projecoes.reduce((s, p) => s + p.obrigacoes_fiscais, 0)
  const saldoFinal = projecoes.length > 0 ? projecoes[projecoes.length - 1].saldo_acumulado : 0

  const chartData = projecoes.map(p => ({
    mes: p.mes,
    receita: Math.round(p.receita_prevista),
    despesas: Math.round(p.despesas_previstas),
    fiscal: Math.round(p.obrigacoes_fiscais),
    saldo: Math.round(p.saldo_previsto),
    saldoAcum: Math.round(p.saldo_acumulado),
  }))

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: 'DM Serif Display, serif', fontSize: 24, color: '#f0f0f0', margin: '0 0 4px' }}>
          Projeção Cashflow — 12 meses
        </h2>
        <p style={{ color: '#888', fontSize: 14, margin: 0 }}>
          Estimativa baseada na média da faturação e despesas recentes
        </p>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Receita prevista (12m)', value: formatCurrency(totalReceita), color: '#c9f06a' },
          { label: 'Despesas previstas (12m)', value: formatCurrency(totalDespesas), color: '#f87171' },
          { label: 'Carga fiscal (12m)', value: formatCurrency(totalFiscal), color: '#f59e0b' },
          { label: 'Saldo acumulado', value: formatCurrency(saldoFinal), color: saldoFinal >= 0 ? '#34d399' : '#ef4444' },
        ].map(k => (
          <div key={k.label} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: '12px 16px' }}>
            <p style={{ color: '#888', fontSize: 12, margin: '0 0 4px' }}>{k.label}</p>
            <p style={{ color: k.color, fontSize: 18, fontWeight: 600, margin: 0 }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Gráfico barras + linha */}
      <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <h3 style={{ color: '#f0f0f0', fontSize: 15, fontWeight: 600, marginTop: 0, marginBottom: 16 }}>
          Receita vs Despesas vs Saldo mensal
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
            <XAxis dataKey="mes" tick={{ fill: '#888', fontSize: 11 }} />
            <YAxis tick={{ fill: '#888', fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              formatter={(v: number, name: string) => [formatCurrency(v), name]}
              contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8 }}
              labelStyle={{ color: '#f0f0f0' }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: '#888' }} />
            <ReferenceLine y={0} stroke="#444" />
            <Bar dataKey="receita" name="Receita" fill="#c9f06a" opacity={0.8} radius={[3, 3, 0, 0]} />
            <Bar dataKey="despesas" name="Despesas" fill="#f87171" opacity={0.7} radius={[3, 3, 0, 0]} />
            <Bar dataKey="fiscal" name="Fiscal" fill="#f59e0b" opacity={0.7} radius={[3, 3, 0, 0]} />
            <Line dataKey="saldo" name="Saldo mensal" stroke="#60a5fa" strokeWidth={2} dot={{ fill: '#60a5fa', r: 3 }} type="monotone" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Saldo acumulado */}
      <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <h3 style={{ color: '#f0f0f0', fontSize: 15, fontWeight: 600, marginTop: 0, marginBottom: 16 }}>
          Saldo acumulado previsto
        </h3>
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={chartData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
            <XAxis dataKey="mes" tick={{ fill: '#888', fontSize: 11 }} />
            <YAxis tick={{ fill: '#888', fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              formatter={(v: number) => [formatCurrency(v), 'Saldo acumulado']}
              contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8 }}
              labelStyle={{ color: '#f0f0f0' }}
            />
            <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" />
            <Line
              dataKey="saldoAcum"
              name="Saldo acumulado"
              stroke="#c9f06a"
              strokeWidth={2.5}
              dot={{ fill: '#c9f06a', r: 3 }}
              type="monotone"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela detalhada */}
      <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #2a2a2a' }}>
              {['Mês', 'Receita', 'Despesas', 'Fiscal', 'Saldo', 'Acumulado'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'right', fontSize: 12, color: '#888', fontWeight: 500, ':first-child': { textAlign: 'left' } }}>
                  <span style={{ textAlign: h === 'Mês' ? 'left' : 'right', display: 'block' }}>{h}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {projecoes.map((p, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #1f1f1f' }}>
                <td style={{ padding: '8px 14px', color: '#f0f0f0' }}>{p.mes}</td>
                <td style={{ padding: '8px 14px', textAlign: 'right', color: '#c9f06a' }}>{formatCurrency(p.receita_prevista)}</td>
                <td style={{ padding: '8px 14px', textAlign: 'right', color: '#f87171' }}>{formatCurrency(p.despesas_previstas)}</td>
                <td style={{ padding: '8px 14px', textAlign: 'right', color: '#f59e0b' }}>{formatCurrency(p.obrigacoes_fiscais)}</td>
                <td style={{ padding: '8px 14px', textAlign: 'right', color: p.saldo_previsto >= 0 ? '#34d399' : '#ef4444' }}>
                  {formatCurrency(p.saldo_previsto)}
                </td>
                <td style={{ padding: '8px 14px', textAlign: 'right', color: p.saldo_acumulado >= 0 ? '#34d399' : '#ef4444', fontWeight: 600 }}>
                  {formatCurrency(p.saldo_acumulado)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ color: '#555', fontSize: 12, marginTop: 14 }}>
        ℹ️ Projeção baseada na média dos últimos 3 meses registados. Valores meramente indicativos.
      </p>
    </div>
  )
}
