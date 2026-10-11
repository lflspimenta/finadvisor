'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Empresa, Pessoal } from '@/types'
import { formatCurrency, getMesNome } from '@/lib/fiscal'
import { ConfigPessoal, CONFIG_PESSOAL_PADRAO, custosPessoalMes, iasDoAno, TAXAS_GERENTE } from '@/lib/pessoal'

interface Props {
  empresa: Empresa
  setEmpresa: (e: Empresa) => void
  pessoal: Pessoal | null
  setPessoal: (p: Pessoal | null) => void
  currentYear: number
}

type Form = Omit<ConfigPessoal, 'taxa_tsu_empresa' | 'taxa_irs_trabalhadores' | 'outros_encargos_pct' | 'taxa_irs_gerente'> & {
  taxa_tsu_empresa: string; taxa_irs_trabalhadores: string; outros_encargos_pct: string; taxa_irs_gerente: string
  remuneracao_gerente: string; massa: string; alimentacao: string
}

const pct = (v: number) => String(Math.round(Number(v) * 10000) / 100)

export default function TabPessoal({ empresa, setEmpresa, pessoal, setPessoal, currentYear }: Props) {
  const supabase = createClient()
  const base = pessoal || CONFIG_PESSOAL_PADRAO
  const [form, setForm] = useState<Form>({
    ...base,
    massa: String(base.massa_salarial_mensal || ''),
    alimentacao: String(base.subsidio_alimentacao_mensal || ''),
    taxa_tsu_empresa: pct(base.taxa_tsu_empresa),
    taxa_irs_trabalhadores: pct(base.taxa_irs_trabalhadores),
    outros_encargos_pct: pct(base.outros_encargos_pct),
    taxa_irs_gerente: pct(base.taxa_irs_gerente),
    remuneracao_gerente: String(empresa.remuneracao_socio_mensal || ''),
  })
  const [aGravar, setAGravar] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  const n = (s: string) => { const v = parseFloat(String(s).replace(',', '.')); return Number.isFinite(v) ? v : 0 }
  const cfg: ConfigPessoal = {
    n_trabalhadores: Math.max(0, Math.round(Number(form.n_trabalhadores) || 0)),
    massa_salarial_mensal: n(form.massa),
    subsidio_alimentacao_mensal: n(form.alimentacao),
    subsidios_duodecimos: form.subsidios_duodecimos,
    mes_subsidio_ferias: Number(form.mes_subsidio_ferias),
    mes_subsidio_natal: Number(form.mes_subsidio_natal),
    taxa_tsu_empresa: n(form.taxa_tsu_empresa) / 100,
    taxa_irs_trabalhadores: n(form.taxa_irs_trabalhadores) / 100,
    outros_encargos_pct: n(form.outros_encargos_pct) / 100,
    gerente_regime: form.gerente_regime,
    gerente_14_meses: form.gerente_14_meses,
    taxa_irs_gerente: n(form.taxa_irs_gerente) / 100,
  }
  const remGer = n(form.remuneracao_gerente)
  const meses = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, ...custosPessoalMes(cfg, remGer, currentYear, i + 1) }))
  const tot = (k: keyof (typeof meses)[number]) => meses.reduce((s, m) => s + Number(m[k]), 0)

  async function gravar() {
    setAGravar(true); setMsg(null)
    const { data, error } = await supabase.from('pessoal')
      .upsert({ empresa_id: empresa.id, ...cfg, updated_at: new Date().toISOString() }, { onConflict: 'empresa_id' })
      .select().single()
    if (error) {
      setAGravar(false)
      setMsg({ tipo: 'erro', texto: error.message.includes('pessoal') ? `${error.message} — corre primeiro o ficheiro supabase-migration-pessoal.sql no Supabase.` : error.message })
      return
    }
    if (remGer !== Number(empresa.remuneracao_socio_mensal)) {
      const { data: e2, error: err2 } = await supabase.from('empresas').update({ remuneracao_socio_mensal: remGer }).eq('id', empresa.id).select().single()
      if (err2) { setAGravar(false); setMsg({ tipo: 'erro', texto: err2.message }); return }
      setEmpresa(e2)
    }
    setPessoal(data)
    setAGravar(false)
    setMsg({ tipo: 'ok', texto: 'Guardado. Gera de novo o Calendário Fiscal para atualizar a Segurança Social e as retenções de IRS.' })
  }

  async function remover() {
    if (!pessoal || !confirm('Remover a configuração de pessoal? Os salários voltam a ser lidos das despesas lançadas.')) return
    const { error } = await supabase.from('pessoal').delete().eq('id', pessoal.id)
    if (error) { setMsg({ tipo: 'erro', texto: error.message }); return }
    setPessoal(null)
    setMsg({ tipo: 'ok', texto: 'Configuração removida.' })
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }))
  const tg = TAXAS_GERENTE[form.gerente_regime]

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: 'DM Serif Display, serif', fontSize: 24, color: 'var(--text)', margin: '0 0 4px' }}>Pessoal</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
          Custos com trabalhadores e gerente — alimentam o calendário fiscal (SS e IRS), o cashflow e os consultores IA
        </p>
      </div>

      {!pessoal && (
        <div style={{ ...card, background: 'var(--hover-soft)', padding: '12px 16px', fontSize: 13, color: 'var(--text-2)' }}>
          Ainda sem configuração: a app usa os salários lançados nas Despesas e só calcula a SS do gerente.
          Ao guardar, os salários passam a ser calculados aqui e a categoria &quot;Salários&quot; das despesas deixa de contar (para não duplicar).
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
        {/* Trabalhadores */}
        <div style={card}>
          <h3 style={h3}>Trabalhadores</h3>
          <div style={grid2}>
            <Campo label="N.º de trabalhadores"><input type="number" min={0} value={form.n_trabalhadores} onChange={e => set('n_trabalhadores', Number(e.target.value))} /></Campo>
            <Campo label="Vencimentos base / mês (€)" ajuda="Soma dos vencimentos brutos de todos"><input type="number" step="0.01" value={form.massa} onChange={e => set('massa', e.target.value)} /></Campo>
            <Campo label="Subsídio de alimentação / mês (€)" ajuda="Total de todos; considerado isento de TSU"><input type="number" step="0.01" value={form.alimentacao} onChange={e => set('alimentacao', e.target.value)} /></Campo>
            <Campo label="TSU da empresa (%)"><input type="number" step="0.01" value={form.taxa_tsu_empresa} onChange={e => set('taxa_tsu_empresa', e.target.value)} /></Campo>
            <Campo label="Retenção IRS média (%)" ajuda="Taxa média dos recibos de vencimento"><input type="number" step="0.1" value={form.taxa_irs_trabalhadores} onChange={e => set('taxa_irs_trabalhadores', e.target.value)} /></Campo>
            <Campo label="Outros encargos (%)" ajuda="Seguro de acidentes de trabalho, FGCT, medicina no trabalho"><input type="number" step="0.01" value={form.outros_encargos_pct} onChange={e => set('outros_encargos_pct', e.target.value)} /></Campo>
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={chk}><input type="checkbox" checked={form.subsidios_duodecimos} onChange={e => set('subsidios_duodecimos', e.target.checked)} style={cb} /> Subsídios de férias e Natal pagos em duodécimos</label>
            {!form.subsidios_duodecimos && (
              <div style={{ ...grid2, marginTop: 10 }}>
                <Campo label="Mês do subsídio de férias">
                  <select value={form.mes_subsidio_ferias} onChange={e => set('mes_subsidio_ferias', Number(e.target.value))}>
                    {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{getMesNome(i + 1)}</option>)}
                  </select>
                </Campo>
                <Campo label="Mês do subsídio de Natal">
                  <select value={form.mes_subsidio_natal} onChange={e => set('mes_subsidio_natal', Number(e.target.value))}>
                    {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{getMesNome(i + 1)}</option>)}
                  </select>
                </Campo>
              </div>
            )}
          </div>
        </div>

        {/* Gerente */}
        <div style={card}>
          <h3 style={h3}>Sócio-gerente</h3>
          <div style={grid2}>
            <Campo label="Remuneração bruta / mês (€)" ajuda={`Base mínima de descontos: 1 IAS (${formatCurrency(iasDoAno(currentYear))})`}>
              <input type="number" step="0.01" value={form.remuneracao_gerente} onChange={e => set('remuneracao_gerente', e.target.value)} />
            </Campo>
            <Campo label="Retenção IRS (%)"><input type="number" step="0.1" value={form.taxa_irs_gerente} onChange={e => set('taxa_irs_gerente', e.target.value)} /></Campo>
          </div>
          <div style={{ marginTop: 12 }}>
            <Campo label="Regime de Segurança Social">
              <select value={form.gerente_regime} onChange={e => set('gerente_regime', e.target.value as Form['gerente_regime'])}>
                <option value="com_desemprego">Gerente com proteção no desemprego — 34,75% (23,75% + 11%)</option>
                <option value="outros">Restantes órgãos estatutários — 29,6% (20,3% + 9,3%)</option>
              </select>
            </Campo>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 0' }}>
              Empresa paga {(tg.entidade * 100).toFixed(2).replace('.', ',')}% · gerente desconta {(tg.membro * 100).toFixed(1).replace('.', ',')}%
            </p>
            <label style={{ ...chk, marginTop: 12 }}><input type="checkbox" checked={form.gerente_14_meses} onChange={e => set('gerente_14_meses', e.target.checked)} style={cb} /> O gerente também recebe subsídios de férias e Natal (14 meses)</label>
          </div>
        </div>
      </div>

      {msg && <div style={{ ...card, padding: '10px 14px', fontSize: 13, background: msg.tipo === 'ok' ? 'var(--accent-soft)' : 'var(--negative-soft)', color: msg.tipo === 'ok' ? 'var(--text-2)' : 'var(--negative)', borderColor: msg.tipo === 'ok' ? 'var(--border)' : 'var(--negative-border)' }}>{msg.texto}</div>}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginBottom: 24 }}>
        {pessoal && <button onClick={remover} style={btnSec}>Remover configuração</button>}
        <button onClick={gravar} disabled={aGravar} style={btnPri}>{aGravar ? 'A guardar…' : 'Guardar'}</button>
      </div>

      {/* Resumo anual */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { l: `Custo total da empresa ${currentYear}`, v: tot('custoEmpresa'), c: 'var(--negative)' },
          { l: 'Custo médio mensal', v: tot('custoEmpresa') / 12, c: 'var(--negative)' },
          { l: 'Segurança Social a entregar (ano)', v: tot('ssTotal'), c: 'var(--warning)' },
          { l: 'IRS retido a entregar (ano)', v: tot('irsRetido'), c: 'var(--warning)' },
        ].map(k => (
          <div key={k.l} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
            <p style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 4px' }}>{k.l}</p>
            <p style={{ color: k.c, fontSize: 18, fontWeight: 600, margin: 0 }}>{formatCurrency(k.v)}</p>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 760 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Mês', 'Remunerações', 'SS empresa', 'Alimentação + outros', 'Custo empresa', 'Pago no mês (líquidos)', 'SS a entregar*', 'IRS a entregar*'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Mês' ? 'left' : 'right', fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {meses.map(m => (
              <tr key={m.mes} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                <td style={{ padding: '8px 12px', color: 'var(--text)' }}>{getMesNome(m.mes)}</td>
                <td style={num}>{formatCurrency(m.remuneracoesTrabalhadores + m.remuneracaoGerente)}</td>
                <td style={num}>{formatCurrency(m.ssEntidade)}</td>
                <td style={num}>{formatCurrency(m.alimentacao + m.outrosEncargos)}</td>
                <td style={{ ...num, fontWeight: 600, color: 'var(--negative)' }}>{formatCurrency(m.custoEmpresa)}</td>
                <td style={num}>{formatCurrency(m.liquidoPago)}</td>
                <td style={{ ...num, color: 'var(--warning)' }}>{formatCurrency(m.ssTotal)}</td>
                <td style={{ ...num, color: 'var(--warning)' }}>{formatCurrency(m.irsRetido)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ color: 'var(--faint)', fontSize: 12, marginTop: 12, lineHeight: 1.6 }}>
        * Entregues no mês seguinte: Segurança Social entre os dias 1 e 25; retenções de IRS até dia 20.
        A SS a entregar inclui a parte da empresa e os descontos dos trabalhadores (11%) e do gerente.
        Estimativa para gestão — os recibos de vencimento continuam a ser processados pelo contabilista.
      </p>
    </div>
  )
}

function Campo({ label, ajuda, children }: { label: string; ajuda?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{label}</span>
      {children}
      {ajuda && <span style={{ display: 'block', fontSize: 11, color: 'var(--faint)', marginTop: 3 }}>{ajuda}</span>}
    </label>
  )
}

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }
const h3: React.CSSProperties = { color: 'var(--text)', fontSize: 15, fontWeight: 600, margin: '0 0 14px' }
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }
const chk: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }
const cb: React.CSSProperties = { width: 16, height: 16, padding: 0 }
const num: React.CSSProperties = { padding: '8px 12px', textAlign: 'right', color: 'var(--text-2)' }
const btnPri: React.CSSProperties = { background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }
const btnSec: React.CSSProperties = { background: 'var(--surface)', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 18px', fontSize: 14, cursor: 'pointer' }
