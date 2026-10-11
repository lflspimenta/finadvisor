'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Despesa } from '@/types'
import { formatCurrency, getMesNome } from '@/lib/fiscal'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface Props {
  empresaId: string
  despesas: Despesa[]
  setDespesas: (d: Despesa[]) => void
  currentYear: number
}

const CATEGORIAS = [
  'Fornecedores', 'Salários', 'Rendas', 'Comunicações',
  'Combustível', 'Manutenção', 'Marketing', 'Software',
  'Contabilidade', 'Seguros', 'Outros',
]

const CORES = ['#3f7d20', '#2563eb', '#d97706', '#0d9488', '#dc2626', '#7c3aed', '#ea580c', '#0284c7', '#65a30d', '#ca8a04', '#c026d3']

export default function TabDespesas({ empresaId, despesas, setDespesas, currentYear }: Props) {
  const [year, setYear] = useState(currentYear)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    mes: new Date().getMonth() + 1,
    categoria: 'Outros',
    descricao: '',
    valor: '',
    recorrente: false,
  })
  const supabase = createClient()

  const despAno = despesas.filter(d => d.ano === year)
  const totalAno = despAno.reduce((s, d) => s + d.valor, 0)

  // Por categoria para gráfico
  const porCategoria = CATEGORIAS
    .map(cat => ({ name: cat, value: despAno.filter(d => d.categoria === cat).reduce((s, d) => s + d.valor, 0) }))
    .filter(c => c.value > 0)

  async function saveDespesa(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const payload = {
      empresa_id: empresaId,
      ano: year,
      mes: form.mes,
      categoria: form.categoria,
      descricao: form.descricao,
      valor: Number(form.valor),
      recorrente: form.recorrente,
    }

    const { data, error } = await supabase.from('despesas').insert(payload).select().single()
    if (!error && data) {
      setDespesas([...despesas, data])
      setForm({ mes: new Date().getMonth() + 1, categoria: 'Outros', descricao: '', valor: '', recorrente: false })
      setShowForm(false)
    }
    setLoading(false)
  }

  async function deleteDespesa(id: string) {
    await supabase.from('despesas').delete().eq('id', id)
    setDespesas(despesas.filter(d => d.id !== id))
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontFamily: 'DM Serif Display, serif', fontSize: 24, color: 'var(--text)', margin: 0 }}>Despesas</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>Registe e acompanhe as suas despesas</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setYear(y => y - 1)} style={btnStyle}>←</button>
            <span style={{ color: 'var(--text)', fontWeight: 600, minWidth: 50, textAlign: 'center', lineHeight: '34px' }}>{year}</span>
            <button onClick={() => setYear(y => y + 1)} style={btnStyle}>→</button>
          </div>
          <button onClick={() => setShowForm(true)} style={btnAccent}>+ Adicionar</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* KPI */}
        <div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', marginBottom: 12 }}>
            <p style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 4px' }}>Total despesas {year}</p>
            <p style={{ color: 'var(--negative)', fontSize: 24, fontWeight: 600, margin: 0 }}>{formatCurrency(totalAno)}</p>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px' }}>
            <p style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 4px' }}>Média mensal</p>
            <p style={{ color: 'var(--negative)', fontSize: 20, fontWeight: 600, margin: 0 }}>
              {formatCurrency(despAno.length > 0 ? totalAno / 12 : 0)}
            </p>
          </div>
        </div>
        {/* Gráfico categorias */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <h4 style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 8px', fontWeight: 500 }}>Por categoria</h4>
          {porCategoria.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={porCategoria} cx="50%" cy="50%" outerRadius={60} dataKey="value">
                  {porCategoria.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11, color: 'var(--muted)' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ color: 'var(--faint)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Sem despesas registadas</p>
          )}
        </div>
      </div>

      {/* Modal adicionar */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 32, width: '100%', maxWidth: 440 }}>
            <h3 style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--text)', marginTop: 0, marginBottom: 20 }}>Nova despesa</h3>
            <form onSubmit={saveDespesa} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 5 }}>Mês</label>
                  <select value={form.mes} onChange={e => setForm({ ...form, mes: Number(e.target.value) })}>
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>{getMesNome(i + 1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 5 }}>Categoria</label>
                  <select value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}>
                    {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 5 }}>Descrição</label>
                <input value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Ex: Fatura Internet" required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 5 }}>Valor (€)</label>
                <input type="number" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} placeholder="0.00" step="0.01" required />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.recorrente} onChange={e => setForm({ ...form, recorrente: e.target.checked })} style={{ width: 'auto' }} />
                Despesa recorrente mensal
              </label>
              <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                <button type="button" onClick={() => setShowForm(false)} style={{ flex: 1, ...btnStyle }}>Cancelar</button>
                <button type="submit" disabled={loading} style={{ flex: 1, ...btnAccent }}>
                  {loading ? 'A guardar...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lista despesas */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Mês', 'Categoria', 'Descrição', 'Valor', ''].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {despAno.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--faint)' }}>Sem despesas registadas em {year}</td></tr>
            ) : (
              despAno.sort((a, b) => b.mes - a.mes).map(d => (
                <tr key={d.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <td style={{ padding: '10px 16px', color: 'var(--muted)', fontSize: 13 }}>{getMesNome(d.mes)}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ background: 'var(--hover)', color: 'var(--accent)', fontSize: 11, padding: '2px 8px', borderRadius: 6 }}>{d.categoria}</span>
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--text)', fontSize: 14 }}>
                    {d.descricao}
                    {d.recorrente && <span style={{ marginLeft: 6, color: 'var(--info)', fontSize: 11 }}>↻</span>}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--negative)', fontWeight: 500 }}>{formatCurrency(d.valor)}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                    <button onClick={() => deleteDespesa(d.id)} style={{ ...btnStyle, color: 'var(--negative)', borderColor: 'var(--negative-border)', fontSize: 12 }}>✕</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const btnStyle = {
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)',
  borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer',
}
const btnAccent = {
  background: 'var(--accent)', color: 'var(--on-accent)', border: 'none',
  borderRadius: 8, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13,
}
