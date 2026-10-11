'use client'

import { Fragment, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Despesa, FaturaVenda, FaturacaoMensal } from '@/types'
import { CATEGORIAS_DESPESA } from '@/lib/faturas'
import { lerQRFatura, prepararFicheiro } from '@/lib/qr-browser'
import { BUCKET_FATURAS } from '@/lib/storage-faturas'
import { novoRegistoMes } from '@/lib/faturacao-sync'
import { formatCurrency } from '@/lib/fiscal'

const MAX_FICHEIROS = 10
const ACEITES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

type Tipo = 'compra' | 'venda'

interface Linha {
  id: string
  ficheiro: File
  estado: 'a_ler' | 'pronto' | 'erro' | 'gravado'
  erro?: string
  fonte?: 'qr' | 'ia'
  avisos: string[]
  incluir: boolean
  contraparte_nome: string
  contraparte_nif: string
  numero_documento: string
  data: string
  atcud: string
  categoria: string
  descricao: string
  base: number
  iva: number
  total: number
  deducao: number
}

interface Props {
  tipo: Tipo
  empresaId: string
  despesas?: Despesa[]
  faturasVenda?: FaturaVenda[]
  faturacao?: FaturacaoMensal[]
  onClose: () => void
  onDespesas?: (novas: Despesa[]) => void
  onVendas?: (r: { faturas: FaturaVenda[]; faturacao: FaturacaoMensal[]; apagadosFaturacao: string[] }) => void
}

const chave = (nif: string, num: string) => `${nif.trim()}|${num.trim().toUpperCase()}`

export default function AdicionarFaturas({ tipo, empresaId, despesas = [], faturasVenda = [], faturacao = [], onClose, onDespesas, onVendas }: Props) {
  const supabase = createClient()
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [aGravar, setAGravar] = useState(false)
  const [erroGeral, setErroGeral] = useState('')
  const compra = tipo === 'compra'

  const atualizar = (id: string, campos: Partial<Linha>) =>
    setLinhas(prev => prev.map(l => (l.id === id ? { ...l, ...campos } : l)))

  // Duplicados: já registados na app, ou repetidos neste lote
  const existentes = new Set(
    compra
      ? despesas.filter(d => d.fornecedor_nif && d.numero_documento).map(d => chave(d.fornecedor_nif!, d.numero_documento!))
      : faturasVenda.filter(f => f.numero_documento).map(f => chave('', f.numero_documento!))
  )
  function eDuplicado(l: Linha) {
    if (!l.numero_documento) return false
    const k = chave(compra ? l.contraparte_nif : '', l.numero_documento)
    if (existentes.has(k)) return true
    const primeira = linhas.find(o => o.estado !== 'erro' && o.numero_documento && chave(compra ? o.contraparte_nif : '', o.numero_documento) === k)
    return !!primeira && primeira.id !== l.id
  }

  async function lerUma(l: Linha) {
    try {
      const ficheiro = await prepararFicheiro(l.ficheiro)
      const qr = await lerQRFatura(ficheiro)
      const fd = new FormData()
      fd.append('file', ficheiro)
      fd.append('empresaId', empresaId)
      fd.append('tipo', tipo)
      if (qr) fd.append('qr', qr)
      const res = await fetch('/api/ler-fatura', { method: 'POST', body: fd })
      const j = await res.json().catch(() => ({ error: `Erro ${res.status}` }))
      if (!res.ok) throw new Error(j.error || `Erro ${res.status}`)
      atualizar(l.id, {
        ficheiro, estado: 'pronto', fonte: j.fonte, avisos: j.avisos || [],
        contraparte_nome: j.contraparte_nome || '', contraparte_nif: j.contraparte_nif || '',
        numero_documento: j.numero_documento || '', data: j.data || '', atcud: j.atcud || '',
        categoria: j.categoria || 'Outros', descricao: j.descricao || '',
        base: j.base || 0, iva: j.iva || 0, total: j.total || 0,
        deducao: j.ivaNaoDedutivel ? 0 : 1,
      })
    } catch (e) {
      atualizar(l.id, { estado: 'erro', erro: e instanceof Error ? e.message : 'Erro na leitura' })
    }
  }

  async function escolher(files: FileList | null) {
    setErroGeral('')
    const lista = Array.from(files || [])
    const invalidos = lista.filter(f => !ACEITES.includes(f.type))
    const validos = lista.filter(f => ACEITES.includes(f.type)).slice(0, MAX_FICHEIROS)
    const msgs: string[] = []
    if (invalidos.length) msgs.push(`${invalidos.length} ficheiro(s) ignorado(s): usa PDF, JPG, PNG ou WEBP (fotos HEIC do iPhone: exporta como JPG).`)
    if (lista.length - invalidos.length > MAX_FICHEIROS) msgs.push(`Só são lidos ${MAX_FICHEIROS} ficheiros de cada vez.`)
    setErroGeral(msgs.join(' '))
    const novas: Linha[] = validos.map(f => ({
      id: crypto.randomUUID(), ficheiro: f, estado: 'a_ler', avisos: [], incluir: true,
      contraparte_nome: '', contraparte_nif: '', numero_documento: '', data: '', atcud: '',
      categoria: 'Outros', descricao: '', base: 0, iva: 0, total: 0, deducao: 1,
    }))
    setLinhas(novas)
    // 3 em paralelo
    let i = 0
    await Promise.all(Array.from({ length: Math.min(3, novas.length) }, async () => {
      while (i < novas.length) await lerUma(novas[i++])
    }))
  }

  async function enviarFicheiro(l: Linha): Promise<string> {
    const ext = l.ficheiro.type === 'application/pdf' ? 'pdf' : l.ficheiro.type.split('/')[1].replace('jpeg', 'jpg')
    const path = `${empresaId}/${tipo}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from(BUCKET_FATURAS).upload(path, l.ficheiro, { contentType: l.ficheiro.type })
    if (error) throw new Error(`Upload da fatura falhou: ${error.message}`)
    return path
  }

  async function gravar() {
    setErroGeral('')
    const aGravarLinhas = linhas.filter(l => l.estado === 'pronto' && l.incluir && !eDuplicado(l))
    const semData = aGravarLinhas.filter(l => !/^\d{4}-\d{2}-\d{2}$/.test(l.data))
    if (semData.length) { setErroGeral('Preenche a data de todas as faturas selecionadas.'); return }
    if (aGravarLinhas.length === 0) { setErroGeral('Não há faturas selecionadas para gravar.'); return }
    setAGravar(true)

    const despesasNovas: Despesa[] = []
    const vendasNovas: FaturaVenda[] = []
    for (const l of aGravarLinhas) {
      let path: string | null = null
      try {
        path = await enviarFicheiro(l)
        const [ano, mes] = l.data.split('-').map(Number)
        if (compra) {
          const nome = l.contraparte_nome || 'Fornecedor'
          const { data, error } = await supabase.from('despesas').insert({
            empresa_id: empresaId, ano, mes, categoria: l.categoria,
            descricao: l.descricao ? `${nome} — ${l.descricao}` : nome,
            valor: l.total, recorrente: false,
            fornecedor_nome: l.contraparte_nome || null, fornecedor_nif: l.contraparte_nif || null,
            numero_documento: l.numero_documento || null, data_documento: l.data, atcud: l.atcud || null,
            valor_base: l.base, valor_iva: l.iva, deducao_iva: l.deducao, ficheiro_path: path,
          }).select().single()
          if (error) throw error
          despesasNovas.push(data)
        } else {
          const { data, error } = await supabase.from('faturas_venda').insert({
            empresa_id: empresaId, ano, mes,
            cliente_nome: l.contraparte_nome || null, cliente_nif: l.contraparte_nif || null,
            numero_documento: l.numero_documento || null, data_documento: l.data, atcud: l.atcud || null,
            valor_base: l.base, valor_iva: l.iva, valor_total: l.total, ficheiro_path: path,
          }).select().single()
          if (error) throw error
          vendasNovas.push(data)
        }
        atualizar(l.id, { estado: 'gravado' })
      } catch (e) {
        if (path) await supabase.storage.from(BUCKET_FATURAS).remove([path])
        const err = e as { code?: string; message?: string }
        const msg = err.code === '23505' ? 'Fatura já registada (duplicada).'
          : err.message?.includes('column') || err.message?.includes('faturas_venda') || err.message?.includes('Bucket')
            ? `${err.message} — corre primeiro o ficheiro supabase-migration-faturas.sql no Supabase.`
            : err.message || 'Erro ao gravar'
        atualizar(l.id, { estado: 'erro', erro: msg })
      }
    }

    if (compra) {
      if (despesasNovas.length) onDespesas?.(despesasNovas)
    } else if (vendasNovas.length) {
      // Atualizar a faturação dos meses afetados
      const todas = [...faturasVenda, ...vendasNovas]
      const meses = Array.from(new Set(vendasNovas.map(v => `${v.ano}-${v.mes}`)))
      const atualizados: FaturacaoMensal[] = []
      const apagados: string[] = []
      for (const m of meses) {
        const [ano, mes] = m.split('-').map(Number)
        const doMes = todas.filter(v => v.ano === ano && v.mes === mes)
        const novasMes = vendasNovas.filter(v => v.ano === ano && v.mes === mes)
        const existente = faturacao.find(f => f.ano === ano && f.mes === mes)
        const acao = novoRegistoMes(
          existente,
          { base: doMes.reduce((s, v) => s + Number(v.valor_base), 0), iva: doMes.reduce((s, v) => s + Number(v.valor_iva), 0), n: doMes.length },
          { base: novasMes.reduce((s, v) => s + Number(v.valor_base), 0), iva: novasMes.reduce((s, v) => s + Number(v.valor_iva), 0) }
        )
        if (acao.acao === 'upsert') {
          const { data, error } = await supabase.from('faturacao_mensal').upsert({
            empresa_id: empresaId, ano, mes,
            valor_faturado: acao.valor_faturado, valor_iva_cobrado: acao.valor_iva_cobrado, notas: acao.notas,
          }, { onConflict: 'empresa_id,ano,mes' }).select().single()
          if (error) setErroGeral(`Faturas gravadas, mas a faturação de ${mes}/${ano} não foi atualizada: ${error.message}`)
          else atualizados.push(data)
        } else if (acao.acao === 'apagar' && existente) {
          await supabase.from('faturacao_mensal').delete().eq('id', existente.id)
          apagados.push(existente.id)
        }
      }
      onVendas?.({ faturas: vendasNovas, faturacao: atualizados, apagadosFaturacao: apagados })
    }

    setAGravar(false)
  }

  const prontas = linhas.filter(l => l.estado === 'pronto')
  const aLer = linhas.some(l => l.estado === 'a_ler')
  const gravadas = linhas.filter(l => l.estado === 'gravado').length
  const titulo = compra ? 'Adicionar faturas de despesas' : 'Adicionar faturas de venda'

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, overflowY: 'auto', padding: '32px 12px' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 1100, padding: 24, boxShadow: '0 10px 40px rgba(15,23,42,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontFamily: 'DM Serif Display, serif', fontSize: 22, margin: 0, color: 'var(--text)' }}>{titulo}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--muted)', cursor: 'pointer' }}>×</button>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: '4px 0 16px' }}>
          PDF ou fotografia, até {MAX_FICHEIROS} de cada vez. Os valores são lidos do código QR da fatura; a IA identifica {compra ? 'o fornecedor e a categoria' : 'o cliente'} e lê as faturas sem QR.
          {!compra && ' As faturas somam-se à faturação do mês (se o mês só tiver a estimativa ÷12, é substituída).'}
        </p>

        {erroGeral && <div style={alerta}>{erroGeral}</div>}

        {linhas.length === 0 && (
          <label style={{ display: 'block', border: '2px dashed var(--border)', borderRadius: 12, padding: 36, textAlign: 'center', cursor: 'pointer', background: 'var(--bg)' }}>
            <input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={e => escolher(e.target.files)} />
            <div style={{ fontSize: 30 }}>🧾</div>
            <div style={{ color: 'var(--text)', fontWeight: 500, marginTop: 6 }}>Clica para escolher as faturas</div>
            <div style={{ color: 'var(--faint)', fontSize: 12, marginTop: 4 }}>No telemóvel podes fotografar diretamente</div>
          </label>
        )}

        {linhas.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', textAlign: 'left' }}>
                  {['', 'Ficheiro', 'Data', compra ? 'Fornecedor' : 'Cliente', 'NIF', 'N.º documento', ...(compra ? ['Categoria'] : []), 'Descrição', 'Base', 'IVA', 'Total', ...(compra ? ['IVA dedutível'] : [])].map(h => (
                    <th key={h} style={{ padding: '8px 6px', fontWeight: 500, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => {
                  const dup = l.estado === 'pronto' && eDuplicado(l)
                  const editavel = l.estado === 'pronto'
                  return (
                    <Fragment key={l.id}>
                      <tr style={{ borderBottom: l.avisos.length || l.erro || dup ? 'none' : '1px solid var(--border-soft)', opacity: l.estado === 'pronto' && (!l.incluir || dup) ? 0.5 : 1 }}>
                        <td style={td}>
                          {l.estado === 'a_ler' && <span title="A ler…">⏳</span>}
                          {l.estado === 'erro' && <span title={l.erro}>⚠️</span>}
                          {l.estado === 'gravado' && <span title="Gravada">✅</span>}
                          {l.estado === 'pronto' && <input type="checkbox" checked={l.incluir && !dup} disabled={dup} onChange={e => atualizar(l.id, { incluir: e.target.checked })} style={{ width: 16, height: 16, padding: 0 }} />}
                        </td>
                        <td style={{ ...td, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.ficheiro.name}>
                          {l.ficheiro.name}
                          {l.fonte && <div style={{ fontSize: 11, color: l.fonte === 'qr' ? 'var(--positive)' : 'var(--warning)' }}>{l.fonte === 'qr' ? 'lido do QR' : 'lido pela IA'}</div>}
                        </td>
                        <td style={td}><input type="date" disabled={!editavel} value={l.data} onChange={e => atualizar(l.id, { data: e.target.value })} style={{ ...inp, width: 135 }} /></td>
                        <td style={td}><input disabled={!editavel} value={l.contraparte_nome} onChange={e => atualizar(l.id, { contraparte_nome: e.target.value })} style={{ ...inp, width: 120 }} /></td>
                        <td style={td}><input disabled={!editavel} value={l.contraparte_nif} onChange={e => atualizar(l.id, { contraparte_nif: e.target.value.replace(/\D/g, '') })} style={{ ...inp, width: 95 }} /></td>
                        <td style={td}><input disabled={!editavel} value={l.numero_documento} onChange={e => atualizar(l.id, { numero_documento: e.target.value })} style={{ ...inp, width: 120 }} /></td>
                        {compra && (
                          <td style={td}>
                            <select disabled={!editavel} value={l.categoria} onChange={e => atualizar(l.id, { categoria: e.target.value })} style={{ ...inp, width: 118 }}>
                              {CATEGORIAS_DESPESA.map(c => <option key={c}>{c}</option>)}
                            </select>
                          </td>
                        )}
                        <td style={td}><input disabled={!editavel} value={l.descricao} onChange={e => atualizar(l.id, { descricao: e.target.value })} style={{ ...inp, width: 125 }} /></td>
                        {(['base', 'iva', 'total'] as const).map(k => (
                          <td key={k} style={td}>
                            <input type="number" step="0.01" disabled={!editavel} value={l[k] || ''} onChange={e => atualizar(l.id, { [k]: parseFloat(e.target.value) || 0 })} style={{ ...inp, width: 80, textAlign: 'right' }} />
                          </td>
                        ))}
                        {compra && (
                          <td style={td}>
                            <select disabled={!editavel} value={l.deducao} onChange={e => atualizar(l.id, { deducao: Number(e.target.value) })} style={{ ...inp, width: 90 }}>
                              <option value={1}>100%</option>
                              <option value={0.5}>50%</option>
                              <option value={0}>Não</option>
                            </select>
                          </td>
                        )}
                      </tr>
                      {(l.avisos.length > 0 || l.erro || dup) && (
                        <tr style={{ borderBottom: '1px solid var(--border-soft)' }}>
                          <td />
                          <td colSpan={compra ? 11 : 9} style={{ padding: '0 6px 8px', fontSize: 12 }}>
                            {dup && <div style={{ color: 'var(--negative)' }}>Duplicada: esta fatura já está registada{l.estado === 'pronto' ? ' e não será gravada' : ''}.</div>}
                            {l.erro && <div style={{ color: 'var(--negative)' }}>{l.erro}</div>}
                            {l.estado !== 'erro' && l.avisos.map(a => <div key={a} style={{ color: 'var(--warning)' }}>{a}</div>)}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {linhas.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              {aLer ? 'A ler as faturas…' : gravadas > 0
                ? `${gravadas} fatura(s) gravada(s).`
                : `${prontas.filter(l => l.incluir && !eDuplicado(l)).length} fatura(s) a gravar · total ${formatCurrency(prontas.filter(l => l.incluir && !eDuplicado(l)).reduce((s, l) => s + l.total, 0))}`}
            </span>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onClose} style={btnSec}>{gravadas > 0 ? 'Fechar' : 'Cancelar'}</button>
              {gravadas === 0 && (
                <button onClick={gravar} disabled={aLer || aGravar || prontas.length === 0} style={{ ...btnPri, opacity: aLer || aGravar || prontas.length === 0 ? 0.6 : 1 }}>
                  {aGravar ? '⏳ A gravar…' : 'Gravar faturas'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const td: React.CSSProperties = { padding: '6px', verticalAlign: 'top' }
const inp: React.CSSProperties = { padding: '6px 8px', fontSize: 13, borderRadius: 6 }
const alerta: React.CSSProperties = { background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', color: 'var(--negative)', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14 }
const btnPri: React.CSSProperties = { background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }
const btnSec: React.CSSProperties = { background: 'var(--surface)', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 18px', fontSize: 14, cursor: 'pointer' }
