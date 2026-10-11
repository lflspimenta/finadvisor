'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Empresa, FaturacaoMensal, Despesa, ObrigacaoFiscal, DadosAnuais } from '@/types'
import { gerarObrigacoesFiscais, formatCurrency, getMesNome, getTipoObrigacaoLabel, calcularSS, TAXAS, taxasIRC } from '@/lib/fiscal'

interface Props {
  empresa: Empresa
  faturacao: FaturacaoMensal[]
  despesas: Despesa[]
  obrigacoes: ObrigacaoFiscal[]
  setObrigacoes: (o: ObrigacaoFiscal[]) => void
  currentYear: number
  dadosAnuais: DadosAnuais[]
}

const MESES_NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export default function TabFiscal({ empresa, faturacao, despesas, obrigacoes, setObrigacoes, currentYear, dadosAnuais }: Props) {
  const [year, setYear] = useState(currentYear)
  const [generating, setGenerating] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const supabase = createClient()

  const obrigAno = obrigacoes.filter(o => o.ano === year || (o.tipo !== 'IVA' && o.ano === year))

  async function gerarCalendario() {
    setGenerating(true)
    const novas = gerarObrigacoesFiscais(empresa, faturacao, despesas, year, dadosAnuais)

    // Remover estimativas de IRC/PPC ainda pendentes deste ano (são recalculadas abaixo)
    await supabase
      .from('obrigacoes_fiscais')
      .delete()
      .eq('empresa_id', empresa.id)
      .eq('ano', year)
      .eq('estado', 'pendente')
      .in('tipo', ['IRC', 'PPC'])
    const mantidas = obrigacoes.filter(o => !(o.ano === year && o.estado === 'pendente' && (o.tipo === 'IRC' || o.tipo === 'PPC')))
    const pagas = new Set(mantidas.filter(o => o.ano === year && o.estado !== 'pendente').map(o => `${o.tipo}-${o.mes_pagamento}`))

    // Não sobrepor obrigações já marcadas como pagas
    const toInsert = novas
      .filter(o => !pagas.has(`${o.tipo}-${o.mes_pagamento}`))
      .map(o => ({ ...o, empresa_id: empresa.id }))
    const { data, error } = await supabase
      .from('obrigacoes_fiscais')
      .upsert(toInsert, { onConflict: 'empresa_id,tipo,ano,mes_pagamento' })
      .select()

    if (!error && data) {
      const idsNovos = new Set(data.map(o => o.id))
      setObrigacoes([...mantidas.filter(o => !idsNovos.has(o.id)), ...data])
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
    if (estado === 'pago') return 'var(--positive)'
    if (estado === 'atrasado') return 'var(--negative)'
    return 'var(--warning)'
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontFamily: 'DM Serif Display, serif', fontSize: 24, color: 'var(--text)', margin: 0 }}>
            Calendário Fiscal
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
            IVA, IRC, Segurança Social e outros — gerados automaticamente
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setYear(y => y - 1)} style={btnStyle}>←</button>
            <span style={{ color: 'var(--text)', fontWeight: 600, minWidth: 50, textAlign: 'center', lineHeight: '34px' }}>{year}</span>
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
          { label: 'Pendente', value: formatCurrency(totalPendente), color: 'var(--warning)' },
          { label: 'Pago', value: formatCurrency(totalPago), color: 'var(--positive)' },
          { label: 'Atrasado', value: formatCurrency(totalAtrasado), color: 'var(--negative)' },
          { label: 'SS mensal estimado', value: formatCurrency(empresa.remuneracao_socio_mensal * TAXAS.SS_GERENTE), color: 'var(--info)' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
            <p style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 4px' }}>{k.label}</p>
            <p style={{ color: k.color, fontSize: 18, fontWeight: 600, margin: 0 }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Calendário */}
      {obrigAno.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--muted)' }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>📅</p>
          <p style={{ fontSize: 16, color: 'var(--text)', marginBottom: 8 }}>Calendário fiscal vazio</p>
          <p style={{ fontSize: 13 }}>Clique em &quot;Gerar calendário&quot; para estimar as obrigações fiscais de {year}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {porMes.map(m => (
            <div key={m.mes} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ background: 'var(--hover-soft)', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: 14 }}>{getMesNome(m.mes)} {year}</span>
                <span style={{ marginLeft: 12, color: 'var(--muted)', fontSize: 12 }}>
                  {m.obrig.length} obrigação{m.obrig.length !== 1 ? 'ões' : ''}
                </span>
              </div>
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {m.obrig.map(o => (
                  <div key={o.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', background: 'var(--bg)', borderRadius: 8,
                    border: `1px solid ${o.estado === 'atrasado' ? 'var(--negative-border)' : 'var(--border)'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: estadoColor(o.estado), display: 'inline-block', flexShrink: 0,
                      }} />
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
                          {getTipoObrigacaoLabel(o.tipo)}
                          {o.trimestre && <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 6 }}>T{o.trimestre}</span>}
                        </p>
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Limite: {o.data_limite}</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ margin: 0, fontWeight: 600, color: estadoColor(o.estado) }}>
                          {formatCurrency(o.valor_real || o.valor_estimado)}
                        </p>
                        {!o.valor_real && <p style={{ margin: 0, fontSize: 11, color: 'var(--faint)' }}>estimado</p>}
                      </div>
                      {o.estado === 'pendente' && (
                        <button
                          onClick={() => marcarPago(o.id, o.valor_estimado)}
                          disabled={updatingId === o.id}
                          style={{ ...btnStyle, fontSize: 12, color: 'var(--positive)', borderColor: 'var(--positive-border)' }}
                        >
                          ✓ Pago
                        </button>
                      )}
                      {o.estado === 'pago' && (
                        <span style={{ fontSize: 12, color: 'var(--positive)' }}>✓ Pago em {o.data_pagamento}</span>
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
      <div style={{ marginTop: 24, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
        <h4 style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 500, marginTop: 0, marginBottom: 12 }}>ℹ️ Taxas aplicadas ({year})</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, fontSize: 13, color: 'var(--muted)' }}>
          <div>• IVA normal: 23%</div>
          <div>• IRC PMEs (≤50k€): {Math.round(taxasIRC(year).pme * 100)}%</div>
          <div>• IRC geral: {Math.round(taxasIRC(year).geral * 100)}%</div>
          <div>• SS gerente: 21,4%</div>
          <div>• IVA trimestral: pago Mai/Ago/Nov/Fev</div>
          <div>• PPC: 80% do IRC do ano anterior (Jul/Set/Dez)</div>
        </div>
        <p style={{ color: 'var(--faint)', fontSize: 12, marginTop: 12, marginBottom: 0 }}>
          Os valores são estimativas baseadas nos dados introduzidos. Confirme sempre com o seu contabilista.
        </p>
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
  borderRadius: 8, padding: '8px 18px', fontWeight: 600, cursor: 'pointer', fontSize: 13,
}
