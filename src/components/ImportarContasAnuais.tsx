'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Empresa, FaturacaoMensal, Despesa, SaldoCaixa, DadosAnuais, DadosAnuaisInput } from '@/types'
import { CAMPOS_ANUAIS, CampoAnual, MARCA_IMPORTADO, TAXA_IVA_PADRAO, planearImportacao } from '@/lib/importacao'
import { formatCurrency } from '@/lib/fiscal'

interface Props {
  empresa: Empresa
  faturacao: FaturacaoMensal[]
  onClose: () => void
  onImportado: (r: {
    dadosAnuais: DadosAnuais
    faturacao: FaturacaoMensal[]
    despesas: Despesa[]
    removerDespesasAno: number
    saldo: SaldoCaixa | null
  }) => void
}

type Etapa = 'upload' | 'a_extrair' | 'rever' | 'a_gravar'

const vazio = Object.fromEntries(CAMPOS_ANUAIS.map(c => [c.key, 0])) as Record<CampoAnual, number>

export default function ImportarContasAnuais({ empresa, faturacao, onClose, onImportado }: Props) {
  const supabase = createClient()
  const [etapa, setEtapa] = useState<Etapa>('upload')
  const [erro, setErro] = useState('')
  const [ficheiro, setFicheiro] = useState<File | null>(null)
  const [ano, setAno] = useState(new Date().getFullYear() - 1)
  const [valores, setValores] = useState<Record<CampoAnual, number>>(vazio)
  const [observacoes, setObservacoes] = useState('')
  const [taxaIva, setTaxaIva] = useState(TAXA_IVA_PADRAO * 100)
  const [substituirMeses, setSubstituirMeses] = useState(false)

  const plano = useMemo(() => planearImportacao(
    { ano, ...valores },
    { taxaIva: taxaIva / 100, regimeIva: empresa.regime_iva, remuneracaoSocioMensal: empresa.remuneracao_socio_mensal }
  ), [ano, valores, taxaIva, empresa.regime_iva, empresa.remuneracao_socio_mensal])

  const mesesExistentes = faturacao.filter(f => f.ano === ano).length

  async function extrair() {
    if (!ficheiro) return
    setErro('')
    setEtapa('a_extrair')
    try {
      const fd = new FormData()
      fd.append('file', ficheiro)
      fd.append('empresaId', empresa.id)
      const res = await fetch('/api/importar-pdf', { method: 'POST', body: fd })
      const json = await res.json().catch(() => ({ error: `Erro ${res.status}` }))
      if (!res.ok) throw new Error(json.error || `Erro ${res.status}`)
      setValores({ ...vazio, ...json.dados })
      if (json.ano) setAno(json.ano)
      setObservacoes(json.observacoes || '')
      setEtapa('rever')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro na extração')
      setEtapa('upload')
    }
  }

  async function gravar() {
    setErro('')
    setEtapa('a_gravar')
    try {
      // 1. Dados anuais
      const registo: DadosAnuaisInput & { empresa_id: string } = {
        empresa_id: empresa.id, ano, ...valores, fonte: ficheiro?.name || 'PDF',
      }
      const { data: da, error: e1 } = await supabase
        .from('dados_anuais').upsert(registo, { onConflict: 'empresa_id,ano' }).select().single()
      if (e1) throw new Error(e1.message.includes('dados_anuais')
        ? 'A tabela dados_anuais não existe. Corre primeiro o ficheiro supabase-migration-dados-anuais.sql no Supabase.'
        : e1.message)

      // 2. Faturação mensal (÷12)
      const linhasFat = Array.from({ length: 12 }, (_, i) => ({
        empresa_id: empresa.id, ano, mes: i + 1,
        valor_faturado: plano.faturacaoMensal, valor_iva_cobrado: plano.ivaMensal,
        notas: `Estimativa: contas anuais ${ano} ÷ 12`,
      }))
      let fatGravada: FaturacaoMensal[] = []
      if (plano.faturacaoMensal > 0) {
        const { data, error } = await supabase.from('faturacao_mensal')
          .upsert(linhasFat, { onConflict: 'empresa_id,ano,mes', ignoreDuplicates: !substituirMeses })
          .select()
        if (error) throw new Error(error.message)
        fatGravada = data || []
      }

      // 3. Despesas (substitui importações anteriores do mesmo ano)
      const { error: eDel } = await supabase.from('despesas').delete()
        .eq('empresa_id', empresa.id).eq('ano', ano).like('descricao', `${MARCA_IMPORTADO}%`)
      if (eDel) throw new Error(eDel.message)
      const linhasDesp = plano.despesasMensais.flatMap(l => Array.from({ length: 12 }, (_, i) => ({
        empresa_id: empresa.id, ano, mes: i + 1,
        categoria: l.categoria, descricao: l.descricao, valor: l.valorMensal, recorrente: false,
      })))
      let despGravadas: Despesa[] = []
      if (linhasDesp.length > 0) {
        const { data, error } = await supabase.from('despesas').insert(linhasDesp).select()
        if (error) throw new Error(error.message)
        despGravadas = data || []
      }

      // 4. Caixa → saldo final de Dezembro
      let saldo: SaldoCaixa | null = null
      if (plano.saldoDezembro !== null) {
        const { data, error } = await supabase.from('saldos_caixa')
          .upsert({ empresa_id: empresa.id, ano, mes: 12, saldo_final: plano.saldoDezembro, notas: `Contas anuais ${ano}` },
            { onConflict: 'empresa_id,ano,mes', ignoreDuplicates: !substituirMeses })
          .select()
        if (error) throw new Error(error.message)
        saldo = data?.[0] || null
      }

      onImportado({ dadosAnuais: da, faturacao: fatGravada, despesas: despGravadas, removerDespesasAno: ano, saldo })
      onClose()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao gravar')
      setEtapa('rever')
    }
  }

  const campo = (c: (typeof CAMPOS_ANUAIS)[number]) => (
    <label key={c.key} style={{ display: 'block' }}>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{c.label}</span>
      <input
        type="number" step="0.01" value={valores[c.key] || ''}
        onChange={e => setValores(v => ({ ...v, [c.key]: parseFloat(e.target.value) || 0 }))}
        style={{ marginTop: 4, padding: '8px 10px', fontSize: 13 }}
      />
    </label>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, overflowY: 'auto', padding: '40px 16px' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 760, padding: 24, boxShadow: '0 10px 40px rgba(15,23,42,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ fontFamily: 'DM Serif Display, serif', fontSize: 22, margin: 0, color: 'var(--text)' }}>Importar contas anuais</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--muted)', cursor: 'pointer' }}>×</button>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>
          IES, Balanço ou Demonstração de Resultados (ex.: exportados do CentralGest). A IA extrai os valores e podes revê-los antes de gravar.
        </p>

        {erro && (
          <div style={{ background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', color: 'var(--negative)', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>{erro}</div>
        )}

        {(etapa === 'upload' || etapa === 'a_extrair') && (
          <div>
            <label style={{ display: 'block', border: '2px dashed var(--border)', borderRadius: 12, padding: 32, textAlign: 'center', cursor: 'pointer', background: 'var(--bg)' }}>
              <input type="file" accept="application/pdf" style={{ display: 'none' }}
                onChange={e => setFicheiro(e.target.files?.[0] || null)} />
              <div style={{ fontSize: 30 }}>📄</div>
              <div style={{ color: 'var(--text)', fontWeight: 500, marginTop: 6 }}>{ficheiro ? ficheiro.name : 'Clica para escolher o PDF'}</div>
              <div style={{ color: 'var(--faint)', fontSize: 12, marginTop: 4 }}>Máximo 4 MB</div>
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button onClick={onClose} style={btnSec}>Cancelar</button>
              <button onClick={extrair} disabled={!ficheiro || etapa === 'a_extrair'} style={{ ...btnPri, opacity: !ficheiro || etapa === 'a_extrair' ? 0.6 : 1 }}>
                {etapa === 'a_extrair' ? '⏳ A analisar o documento…' : 'Extrair dados'}
              </button>
            </div>
          </div>
        )}

        {(etapa === 'rever' || etapa === 'a_gravar') && (
          <div>
            {observacoes && <p style={{ fontSize: 12, color: 'var(--muted)', background: 'var(--bg)', borderRadius: 8, padding: '8px 12px' }}>🤖 {observacoes}</p>}

            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginBottom: 16 }}>
              <label style={{ width: 120 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Exercício</span>
                <input type="number" value={ano} onChange={e => setAno(parseInt(e.target.value) || ano)} style={{ marginTop: 4, padding: '8px 10px' }} />
              </label>
              {empresa.regime_iva !== 'isento' && (
                <label style={{ width: 140 }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Taxa de IVA (%)</span>
                  <input type="number" value={taxaIva} onChange={e => setTaxaIva(parseFloat(e.target.value) || 0)} style={{ marginTop: 4, padding: '8px 10px' }} />
                </label>
              )}
            </div>

            <h4 style={secTitle}>Demonstração de resultados</h4>
            <div style={grid}>{CAMPOS_ANUAIS.filter(c => c.grupo === 'dr').map(campo)}</div>
            <h4 style={secTitle}>Balanço</h4>
            <div style={grid}>{CAMPOS_ANUAIS.filter(c => c.grupo === 'balanco').map(campo)}</div>

            <div style={{ background: 'var(--accent-soft)', borderRadius: 10, padding: 16, marginTop: 18, fontSize: 13, color: 'var(--text-2)' }}>
              <strong style={{ color: 'var(--text)' }}>O que vai ser gravado em {ano}:</strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
                <li>Faturação: 12 meses × {formatCurrency(plano.faturacaoMensal)}{empresa.regime_iva !== 'isento' && <> + IVA {formatCurrency(plano.ivaMensal)}/mês</>}</li>
                {plano.despesasMensais.map(l => (
                  <li key={l.descricao}>{l.categoria} — {l.descricao.replace(/^\[.*?\]\s*/, '')}: 12 × {formatCurrency(l.valorMensal)}</li>
                ))}
                {plano.ssGerenteDescontado > 0 && (
                  <li>Aos gastos com pessoal foram retirados {formatCurrency(plano.ssGerenteDescontado)} de SS do gerente, que a app já calcula à parte.</li>
                )}
                {plano.saldoDezembro !== null && <li>Saldo de caixa em Dezembro: {formatCurrency(plano.saldoDezembro)}</li>}
                <li>Contas anuais completas guardadas para os consultores IA e para o cálculo do IRC/PPC de {ano + 1}.</li>
              </ul>
              <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                Os valores mensais são uma média (÷12) e não refletem a sazonalidade. Podes corrigir cada mês depois.
              </p>
            </div>

            {mesesExistentes > 0 && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>
                <input type="checkbox" checked={substituirMeses} onChange={e => setSubstituirMeses(e.target.checked)} style={{ width: 16, height: 16, padding: 0 }} />
                Já existem {mesesExistentes} mês(es) de faturação em {ano}. Substituir pelos valores médios?
                {!substituirMeses && <span style={{ color: 'var(--muted)' }}> (só preenche os meses vazios)</span>}
              </label>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button onClick={() => setEtapa('upload')} style={btnSec} disabled={etapa === 'a_gravar'}>← Outro PDF</button>
              <button onClick={gravar} disabled={etapa === 'a_gravar'} style={{ ...btnPri, opacity: etapa === 'a_gravar' ? 0.6 : 1 }}>
                {etapa === 'a_gravar' ? '⏳ A gravar…' : 'Confirmar e gravar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }
const secTitle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '16px 0 10px' }
const btnPri: React.CSSProperties = { background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }
const btnSec: React.CSSProperties = { background: 'var(--surface)', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 18px', fontSize: 14, cursor: 'pointer' }
