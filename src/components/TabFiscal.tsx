'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Empresa, FaturacaoMensal, Despesa, ObrigacaoFiscal } from '@/types'
import { gerarObrigacoesFiscais, formatCurrency, getMesNome, getTipoObrigacaoLabel, calcularSS, TAXAS } from '@/lib/fiscal'

interface Props {
  empresa: Empresa
  faturacao: FaturacaoMensal[]
  despesas: Despesa[]
  obrigacoes: ObrigacaoFiscal[]
  setObrigacoes: (o: ObrigacaoFiscal[]) => void
  currentYear: number
}

const MESES_NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export default function TabFiscal({ empresa, faturacao, despesas, obrigacoes, setObrigacoes, currentYear }: Props) {
  const [year, setYear] = useState(currentYear)
  const [generating, setGenerating] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const supabase = createClient()

  const obrigAno = obrigacoes.filter(o => o.ano === year || (o.tipo !== 'IVA' && o.ano === year))

  async function gerarCalendario() {
    setGenerating(true)
    const novas = gerarObrigacoesFiscais(empresa, faturacao, despesas, year)

    const toInsert = novas.map(o => ({ ...o, empresa_id: empresa.id }))
    const { data, error } = await supabase
      .from('obrigacoes_fiscais')
      .upsert(toInsert, { onConflict: 'empresa_id,tipo,ano,mes_pagamento' })
      .select()

    if (!error && data) {
      const outrasAnos = obrigacoes.filter(o => o.ano !== year)
      setObrigacoes([...outrasAnos, ...data])
    }
    setGenerating(false)
  }

  async function marcarPago(id: string, valorReal?: number) {
    setUpdatingId(id)
    const { data, error } = await supabase
      .from('obrigacoes_fiscais')
      .update({
        estado: 'pago',
        data_pagamento: new Date().toISOString().split('T')[0],
        valor_real: valorReal,
      })
      .eq('id', id)
      .select()
      .single()

    if (!error && data) {
      setObrigacoes(obrigacoes.map(o => o.id === id ? data : o))
    }
    setUpdatingId(null)
  }

  // Estatísticas
  const totalPendente = obrigAno.filter(o => o.estado === 'pendente').reduce((s, o) => s + o.valor_estimado, 0)
  const totalPago = obrigAno.filter(o => o.estado === 'pago').reduce((s, o) => s + (o.valor_real || o.valor_estimado), 0)
  const totalAtrasado = obrigAno.filter(o => o.estado === 'atrasado').reduce((s, o) => s + o.valor_estimado, 0)

  // Agrupar por mês
  const porMes = MESES_NOMES.map((nome, i) => ({
    mes: i + 1,
    nome,
    obrig: obrigAno.filter(o => o.mes_pagamento === i + 1),
  })).filter(m => m.obrig.length > 0)

  function estadoColor(estado: string) {
    if (estado === 'pago') return '#34d399'
    if (estado === 'atrasado') return '#f87171'
    return '#f59e0b'
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontFamily: 'DM Serif Display, serif', fontSize: 24, color: '#f0f0f0', margin: 0 }}>
            Calendário Fiscal
          </h2>
          <p style={{ color: '#888', fontSize: 14, marginTop: 4 }}>
            IVA, IRC, Segurança Social e outros — gerados automaticamente
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setYear(y => y - 1)} style={btnStyle}>←</button>
            <span style={{ color: '#f0f0f0', fontWeight: 600, minWidth: 50, textAlign: 'center', lineHeight: '34px' }}>{year}</span>
            <button onClick={() => setYear(y => y + 1)} style={btnStyle}>→</button>
          </div>
          <button onClick={gerarCalendario} disabled={generating} style={btnAccent}>
            {generating ? 'A gerar...' : '⚡ Gerar calendário'}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Pendente', value: formatCurrency(totalPendente), color: '#f59e0b' },
          { label: 'Pago', value: formatCurrency(totalPago), color: '#34d399' },
          { label: 'Atrasado', value: formatCurrency(totalAtrasado), color: '#f87171' },
          { label: 'SS mensal estimado', value: formatCurrency(empresa.remuneracao_socio_mensal * TAXAS.SS_GERENTE), color: '#60a5fa' },
        ].map(k => (
          <div key={k.label} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: '12px 16px' }}>
            <p style={{ color: '#888', fontSize: 12, margin: '0 0 4px' }}>{k.label}</p>
            <p style={{ color: k.color, fontSize: 18, fontWeight: 600, margin: 0 }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Calendário */}
      {obrigAno.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px dashed #2a2a2a', borderRadius: 12, color: '#888' }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>📅</p>
          <p style={{ fontSize: 16, color: '#f0f0f0', marginBottom: 8 }}>Calendário fiscal vazio</p>
          <p style={{ fontSize: 13 }}>Clique em &quot;Gerar calendário&quot; para estimar as obrigações fiscais de {year}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {porMes.map(m => (
            <div key={m.mes} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ background: '#ffffff05', padding: '10px 16px', borderBottom: '1px solid #2a2a2a' }}>
                <span style={{ fontWeight: 600, color: '#f0f0f0', fontSize: 14 }}>{getMesNome(m.mes)} {year}</span>
                <span style={{ marginLeft: 12, color: '#888', fontSize: 12 }}>
                  {m.obrig.length} obrigação{m.obrig.length !== 1 ? 'ões' : ''}
                </span>
              </div>
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {m.obrig.map(o => (
                  <div key={o.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', background: '#0f0f0f', borderRadius: 8,
                    border: `1px solid ${o.estado === 'atrasado' ? '#ef444440' : '#2a2a2a'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: estadoColor(o.estado), display: 'inline-block', flexShrink: 0,
                      }} />
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: '#f0f0f0' }}>
                          {getTipoObrigacaoLabel(o.tipo)}
                          {o.trimestre && <span style={{ fontSize: 12, color: '#888', marginLeft: 6 }}>T{o.trimestre}</span>}
                        </p>
                        <p style={{ margin: 0, fontSize: 12, color: '#888' }}>Limite: {o.data_limite}</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ margin: 0, fontWeight: 600, color: estadoColor(o.estado) }}>
                          {formatCurrency(o.valor_real || o.valor_estimado)}
                        </p>
                        {!o.valor_real && <p style={{ margin: 0, fontSize: 11, color: '#555' }}>estimado</p>}
                      </div>
                      {o.estado === 'pendente' && (
                        <button
                          onClick={() => marcarPago(o.id, o.valor_estimado)}
                          disabled={updatingId === o.id}
                          style={{ ...btnStyle, fontSize: 12, color: '#34d399', borderColor: '#34d39940' }}
                        >
                          ✓ Pago
                        </button>
                      )}
                      {o.estado === 'pago' && (
                        <span style={{ fontSize: 12, color: '#34d399' }}>✓ Pago em {o.data_pagamento}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Notas fiscais */}
      <div style={{ marginTop: 24, background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, padding: 20 }}>
        <h4 style={{ color: '#888', fontSize: 13, fontWeight: 500, marginTop: 0, marginBottom: 12 }}>ℹ️ Taxas aplicadas (Portugal 2025/2026)</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, fontSize: 13, color: '#888' }}>
          <div>• IVA normal: 23%</div>
          <div>• IRC PMEs (≤50k€): 17%</div>
          <div>• IRC geral: 21%</div>
          <div>• SS gerente: 21,4%</div>
          <div>• IVA trimestral: Mar/Jun/Set/Dez</div>
          <div>• PPC: 75% do IRC estimado</div>
        </div>
        <p style={{ color: '#555', fontSize: 12, marginTop: 12, marginBottom: 0 }}>
          Os valores são estimativas baseadas nos dados introduzidos. Confirme sempre com o seu contabilista.
        </p>
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
  borderRadius: 8, padding: '8px 18px', fontWeight: 600, cursor: 'pointer', fontSize: 13,
}
