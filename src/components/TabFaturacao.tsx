'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FaturacaoMensal } from '@/types'
import { getMesNome, formatCurrency } from '@/lib/fiscal'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface Props {
  empresaId: string
  faturacao: FaturacaoMensal[]
  setFaturacao: (f: FaturacaoMensal[]) => void
  currentYear: number
}

const MESES = Array.from({ length: 12 }, (_, i) => ({ num: i + 1, nome: getMesNome(i + 1) }))

export default function TabFaturacao({ empresaId, faturacao, setFaturacao, currentYear }: Props) {
  const [year, setYear] = useState(currentYear)
  const [editingMes, setEditingMes] = useState<number | null>(null)
  const [editValues, setEditValues] = useState({ valor_faturado: '', valor_iva_cobrado: '', notas: '' })
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const fatAno = faturacao.filter(f => f.ano === year)
  const totalAno = fatAno.reduce((s, f) => s + f.valor_faturado, 0)
  const totalIVA = fatAno.reduce((s, f) => s + f.valor_iva_cobrado, 0)
  const mediaM = fatAno.length > 0 ? totalAno / fatAno.length : 0

  function getRegistoMes(mes: number) {
    return fatAno.find(f => f.mes === mes)
  }

  function startEdit(mes: number) {
    const registo = getRegistoMes(mes)
    setEditingMes(mes)
    setEditValues({
      valor_faturado: registo ? String(registo.valor_faturado) : '',
      valor_iva_cobrado: registo ? String(registo.valor_iva_cobrado) : '',
      notas: registo?.notas || '',
    })
  }

  async function saveEdit() {
    if (!editValues.valor_faturado || editingMes === null) return
    setLoading(true)

    const existing = getRegistoMes(editingMes)
    const payload = {
      empresa_id: empresaId,
      ano: year,
      mes: editingMes,
      valor_faturado: Number(editValues.valor_faturado),
      valor_iva_cobrado: Number(editValues.valor_iva_cobrado) || 0,
      notas: editValues.notas || null,
    }

    let data, error
    if (existing) {
      ({ data, error } = await supabase.from('faturacao_mensal').update(payload).eq('id', existing.id).select().single())
    } else {
      ({ data, error } = await supabase.from('faturacao_mensal').insert(payload).select().single())
    }

    if (!error && data) {
      setFaturacao(faturacao.filter(f => !(f.ano === year && f.mes === editingMes)).concat(data))
    }

    setEditingMes(null)
    setLoading(false)
  }

  const chartData = MESES.map(m => {
    const r = getRegistoMes(m.num)
    return { mes: m.nome, faturacao: r?.valor_faturado || 0, iva: r?.valor_iva_cobrado || 0 }
  })

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontFamily: 'DM Serif Display, serif', fontSize: 24, color: '#f0f0f0', margin: 0 }}>
            Faturação mensal
          </h2>
          <p style={{ color: '#888', fontSize: 14, marginTop: 4 }}>
            Registe a faturação e IVA cobrado mensalmente
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setYear(y => y - 1)} style={{ ...btnStyle }}>←</button>
          <span style={{ color: '#f0f0f0', fontWeight: 600, minWidth: 50, textAlign: 'center' }}>{year}</span>
          <button onClick={() => setYear(y => y + 1)} style={{ ...btnStyle }}>→</button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total faturado', value: formatCurrency(totalAno) },
          { label: 'Total IVA cobrado', value: formatCurrency(totalIVA) },
          { label: 'Média mensal', value: formatCurrency(mediaM) },
        ].map(k => (
          <div key={k.label} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: '14px 18px' }}>
            <p style={{ color: '#888', fontSize: 12, margin: '0 0 4px' }}>{k.label}</p>
            <p style={{ color: '#c9f06a', fontSize: 20, fontWeight: 600, margin: 0 }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Gráfico */}
      <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <h3 style={{ color: '#f0f0f0', fontSize: 15, fontWeight: 600, marginTop: 0, marginBottom: 16 }}>
          Evolução mensal {year}
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
            <XAxis dataKey="mes" tick={{ fill: '#888', fontSize: 12 }} />
            <YAxis tick={{ fill: '#888', fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
            <Tooltip
              formatter={(v: number) => formatCurrency(v)}
              contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8 }}
              labelStyle={{ color: '#f0f0f0' }}
            />
            <Bar dataKey="faturacao" name="Faturação" fill="#c9f06a" radius={[4, 4, 0, 0]} />
            <Bar dataKey="iva" name="IVA" fill="#60a5fa" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela mensal */}
      <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #2a2a2a' }}>
              {['Mês', 'Faturação (€)', 'IVA cobrado (€)', 'Notas', ''].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: '#888', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MESES.map(m => {
              const r = getRegistoMes(m.num)
              const isEditing = editingMes === m.num
              return (
                <tr key={m.num} style={{ borderBottom: '1px solid #1f1f1f' }}>
                  <td style={{ padding: '10px 16px', color: '#f0f0f0', fontWeight: 500 }}>{m.nome}</td>
                  <td style={{ padding: '10px 16px' }}>
                    {isEditing ? (
                      <input type="number" value={editValues.valor_faturado} onChange={e => setEditValues({ ...editValues, valor_faturado: e.target.value })} style={{ width: 130 }} placeholder="0.00" step="0.01" />
                    ) : (
                      <span style={{ color: r ? '#c9f06a' : '#444' }}>{r ? formatCurrency(r.valor_faturado) : '—'}</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    {isEditing ? (
                      <input type="number" value={editValues.valor_iva_cobrado} onChange={e => setEditValues({ ...editValues, valor_iva_cobrado: e.target.value })} style={{ width: 130 }} placeholder="0.00" step="0.01" />
                    ) : (
                      <span style={{ color: r ? '#60a5fa' : '#444' }}>{r ? formatCurrency(r.valor_iva_cobrado) : '—'}</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    {isEditing ? (
                      <input value={editValues.notas} onChange={e => setEditValues({ ...editValues, notas: e.target.value })} placeholder="Opcional" />
                    ) : (
                      <span style={{ color: '#888', fontSize: 13 }}>{r?.notas || ''}</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => setEditingMes(null)} style={{ ...btnStyle, fontSize: 12 }}>✕</button>
                        <button onClick={saveEdit} disabled={loading} style={{ ...btnAccent, fontSize: 12 }}>✓ Guardar</button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(m.num)} style={{ ...btnStyle, fontSize: 12 }}>
                        {r ? 'Editar' : '+ Adicionar'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const btnStyle = {
  background: 'transparent', border: '1px solid #2a2a2a', color: '#888',
  borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer',
}
const btnAccent = {
  background: '#c9f06a', color: '#0f0f0f', border: 'none',
  borderRadius: 8, padding: '6px 12px', fontWeight: 600, cursor: 'pointer',
}
