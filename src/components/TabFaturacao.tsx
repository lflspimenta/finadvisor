'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FaturacaoMensal, FaturaVenda } from '@/types'
import AdicionarFaturas from '@/components/AdicionarFaturas'
import { abrirFatura, apagarFicheiroFatura } from '@/lib/storage-faturas'
import { novoRegistoMes } from '@/lib/faturacao-sync'
import { getMesNome, formatCurrency } from '@/lib/fiscal'
import { eixoEuros } from '@/lib/fiscal'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface Props {
  empresaId: string
  faturacao: FaturacaoMensal[]
  setFaturacao: (f: FaturacaoMensal[]) => void
  faturasVenda: FaturaVenda[]
  setFaturasVenda: (f: FaturaVenda[]) => void
  currentYear: number
}

const MESES = Array.from({ length: 12 }, (_, i) => ({ num: i + 1, nome: getMesNome(i + 1) }))

export default function TabFaturacao({ empresaId, faturacao, setFaturacao, faturasVenda, setFaturasVenda, currentYear }: Props) {
  const [showFaturas, setShowFaturas] = useState(false)
  const [year, setYear] = useState(currentYear)
  const [editingMes, setEditingMes] = useState<number | null>(null)
  const [editValues, setEditValues] = useState({ valor_faturado: '', valor_iva_cobrado: '', notas: '' })
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const fatAno = faturacao.filter(f => f.ano === year)
  const totalAno = fatAno.reduce((s, f) => s + f.valor_faturado, 0)
  const totalIVA = fatAno.reduce((s, f) => s + f.valor_iva_cobrado, 0)
  const mediaM = fatAno.length > 0 ? totalAno / fatAno.length : 0

  const vendasAno = faturasVenda
    .filter(v => v.ano === year)
    .sort((a, b) => (b.data_documento || '').localeCompare(a.data_documento || ''))

  async function apagarFaturaVenda(v: FaturaVenda) {
    if (!confirm(`Apagar a fatura ${v.numero_documento || ''}? O valor é retirado da faturação de ${getMesNome(v.mes)}.`)) return
    const { error } = await supabase.from('faturas_venda').delete().eq('id', v.id)
    if (error) { alert('Erro ao apagar: ' + error.message); return }
    await apagarFicheiroFatura(v.ficheiro_path)
    const restantes = faturasVenda.filter(x => x.id !== v.id)
    setFaturasVenda(restantes)

    // Atualizar o mês
    const existente = faturacao.find(f => f.ano === v.ano && f.mes === v.mes)
    const doMes = restantes.filter(x => x.ano === v.ano && x.mes === v.mes)
    const acao = novoRegistoMes(
      existente,
      { base: doMes.reduce((s, x) => s + Number(x.valor_base), 0), iva: doMes.reduce((s, x) => s + Number(x.valor_iva), 0), n: doMes.length },
      { base: -Number(v.valor_base), iva: -Number(v.valor_iva) }
    )
    if (acao.acao === 'upsert') {
      const { data } = await supabase.from('faturacao_mensal').upsert({
        empresa_id: empresaId, ano: v.ano, mes: v.mes,
        valor_faturado: acao.valor_faturado, valor_iva_cobrado: acao.valor_iva_cobrado, notas: acao.notas,
      }, { onConflict: 'empresa_id,ano,mes' }).select().single()
      if (data) setFaturacao(faturacao.filter(f => !(f.ano === v.ano && f.mes === v.mes)).concat(data))
    } else if (acao.acao === 'apagar' && existente) {
      await supabase.from('faturacao_mensal').delete().eq('id', existente.id)
      setFaturacao(faturacao.filter(f => f.id !== existente.id))
    }
  }

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
          <h2 style={{ fontFamily: 'DM Serif Display, serif', fontSize: 24, color: 'var(--text)', margin: 0 }}>
            Faturação mensal
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
            Registe a faturação e IVA cobrado mensalmente
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setYear(y => y - 1)} style={{ ...btnStyle }}>←</button>
          <span style={{ color: 'var(--text)', fontWeight: 600, minWidth: 50, textAlign: 'center' }}>{year}</span>
          <button onClick={() => setYear(y => y + 1)} style={{ ...btnStyle }}>→</button>
          <button onClick={() => setShowFaturas(true)} style={{ ...btnStyle, color: 'var(--text-2)', padding: '8px 14px', marginLeft: 8 }}>🧾 Adicionar faturas</button>
        </div>
      </div>

      {showFaturas && (
        <AdicionarFaturas
          tipo="venda"
          empresaId={empresaId}
          faturasVenda={faturasVenda}
          faturacao={faturacao}
          onClose={() => setShowFaturas(false)}
          onVendas={({ faturas, faturacao: atualizados, apagadosFaturacao }) => {
            setFaturasVenda([...faturasVenda, ...faturas])
            const chaves = new Set(atualizados.map(f => `${f.ano}-${f.mes}`))
            setFaturacao(faturacao
              .filter(f => !chaves.has(`${f.ano}-${f.mes}`) && !apagadosFaturacao.includes(f.id))
              .concat(atualizados))
          }}
        />
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total faturado', value: formatCurrency(totalAno) },
          { label: 'Total IVA cobrado', value: formatCurrency(totalIVA) },
          { label: 'Média mensal', value: formatCurrency(mediaM) },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px' }}>
            <p style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 4px' }}>{k.label}</p>
            <p style={{ color: 'var(--accent)', fontSize: 20, fontWeight: 600, margin: 0 }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Gráfico */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <h3 style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600, marginTop: 0, marginBottom: 16 }}>
          Evolução mensal {year}
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="mes" tick={{ fill: 'var(--muted)', fontSize: 12 }} />
            <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={eixoEuros} />
            <Tooltip
              formatter={(v: number) => formatCurrency(v)}
              contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}
              labelStyle={{ color: 'var(--text)' }}
            />
            <Bar dataKey="faturacao" name="Faturação" fill="var(--accent)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="iva" name="IVA" fill="var(--info)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela mensal */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Mês', 'Faturação (€)', 'IVA cobrado (€)', 'Notas', ''].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MESES.map(m => {
              const r = getRegistoMes(m.num)
              const isEditing = editingMes === m.num
              return (
                <tr key={m.num} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <td style={{ padding: '10px 16px', color: 'var(--text)', fontWeight: 500 }}>{m.nome}</td>
                  <td style={{ padding: '10px 16px' }}>
                    {isEditing ? (
                      <input type="number" value={editValues.valor_faturado} onChange={e => setEditValues({ ...editValues, valor_faturado: e.target.value })} style={{ width: 130 }} placeholder="0.00" step="0.01" />
                    ) : (
                      <span style={{ color: r ? 'var(--accent)' : 'var(--faint)' }}>{r ? formatCurrency(r.valor_faturado) : '—'}</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    {isEditing ? (
                      <input type="number" value={editValues.valor_iva_cobrado} onChange={e => setEditValues({ ...editValues, valor_iva_cobrado: e.target.value })} style={{ width: 130 }} placeholder="0.00" step="0.01" />
                    ) : (
                      <span style={{ color: r ? 'var(--info)' : 'var(--faint)' }}>{r ? formatCurrency(r.valor_iva_cobrado) : '—'}</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    {isEditing ? (
                      <input value={editValues.notas} onChange={e => setEditValues({ ...editValues, notas: e.target.value })} placeholder="Opcional" />
                    ) : (
                      <span style={{ color: 'var(--muted)', fontSize: 13 }}>{r?.notas || ''}</span>
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

      {/* Faturas emitidas */}
      {vendasAno.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginTop: 24 }}>
          <h3 style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600, margin: 0, padding: '16px 16px 8px' }}>
            Faturas emitidas {year} <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 13 }}>({vendasAno.length})</span>
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Data', 'Documento', 'Cliente', 'Base', 'IVA', 'Total', ''].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: ['Base', 'IVA', 'Total'].includes(h) ? 'right' : 'left', fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vendasAno.map(v => (
                <tr key={v.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <td style={{ padding: '8px 16px', color: 'var(--muted)' }}>{v.data_documento ? new Date(v.data_documento).toLocaleDateString('pt-PT') : getMesNome(v.mes)}</td>
                  <td style={{ padding: '8px 16px', color: 'var(--text)' }}>{v.numero_documento || '—'}</td>
                  <td style={{ padding: '8px 16px', color: 'var(--text)' }}>
                    {v.cliente_nome || '—'}
                    {v.cliente_nif && <span style={{ color: 'var(--muted)', fontSize: 11 }}> · NIF {v.cliente_nif}</span>}
                  </td>
                  <td style={{ padding: '8px 16px', textAlign: 'right', color: 'var(--accent)' }}>{formatCurrency(Number(v.valor_base))}</td>
                  <td style={{ padding: '8px 16px', textAlign: 'right', color: 'var(--info)' }}>{formatCurrency(Number(v.valor_iva))}</td>
                  <td style={{ padding: '8px 16px', textAlign: 'right', color: 'var(--text)', fontWeight: 500 }}>{formatCurrency(Number(v.valor_total))}</td>
                  <td style={{ padding: '8px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {v.ficheiro_path && <button onClick={() => abrirFatura(v.ficheiro_path!)} title="Ver fatura" style={{ ...btnStyle, fontSize: 12, marginRight: 6 }}>📎</button>}
                    <button onClick={() => apagarFaturaVenda(v)} style={{ ...btnStyle, color: 'var(--negative)', borderColor: 'var(--negative-border)', fontSize: 12 }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const btnStyle = {
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)',
  borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer',
}
const btnAccent = {
  background: 'var(--accent)', color: 'var(--on-accent)', border: 'none',
  borderRadius: 8, padding: '6px 12px', fontWeight: 600, cursor: 'pointer',
}
