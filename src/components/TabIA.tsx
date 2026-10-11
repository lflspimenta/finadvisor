'use client'

import { useState, useRef, useEffect } from 'react'
import { Empresa, FaturacaoMensal, Despesa, ObrigacaoFiscal, RelatorioIA, PerfilContabilista, DadosAnuais } from '@/types'
import { PERFIS, gerarContextoEmpresa, contextoDetalhado } from '@/lib/ai-profiles'
import { calcularIRC, calcularSS, TAXAS, formatCurrency } from '@/lib/fiscal'
import { custoDespesa, ivaDedutivel } from '@/lib/faturas'

interface Props {
  empresa: Empresa
  faturacao: FaturacaoMensal[]
  despesas: Despesa[]
  obrigacoes: ObrigacaoFiscal[]
  relatorios: RelatorioIA[]
  setRelatorios: (r: RelatorioIA[]) => void
  userId: string
  dadosAnuais: DadosAnuais[]
}

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

export default function TabIA({ empresa, faturacao, despesas, obrigacoes, relatorios, setRelatorios, userId, dadosAnuais }: Props) {
  const [perfilAtivo, setPerfilAtivo] = useState<PerfilContabilista>('conservador')
  const [mode, setMode] = useState<'chat' | 'relatorio'>('chat')
  const [mensagens, setMensagens] = useState<ChatMsg[]>([])
  const [inputMsg, setInputMsg] = useState('')
  const [streamText, setStreamText] = useState('')
  const [loading, setLoading] = useState(false)
  const [gerandoRel, setGerandoRel] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens, streamText])

  // Calcular contexto da empresa
  const currentYear = new Date().getFullYear()
  const fatAno = faturacao.filter(f => f.ano === currentYear)
  const totalFat = fatAno.reduce((s, f) => s + f.valor_faturado, 0)
  const totalDesp = despesas.filter(d => d.ano === currentYear).reduce((s, d) => s + custoDespesa(d), 0)
  const faturacaoMensal = fatAno.length > 0 ? totalFat / fatAno.length : 0
  const ssMensal = calcularSS(empresa.remuneracao_socio_mensal, 1)
  const lucro = Math.max(0, totalFat - totalDesp - calcularSS(empresa.remuneracao_socio_mensal))
  const ivaEst = Math.max(0, fatAno.reduce((s, f) => s + f.valor_iva_cobrado, 0) - despesas.filter(d => d.ano === currentYear).reduce((s, d) => s + ivaDedutivel(d), 0))
  const ircEst = calcularIRC(lucro)
  const obrigPend = obrigacoes.filter(o => o.estado === 'pendente').reduce((s, o) => s + o.valor_estimado, 0)

  const contexto = gerarContextoEmpresa({
    empresa,
    faturacaoTotal: totalFat,
    faturacaoMensal,
    despesasTotal: totalDesp,
    ssMensal,
    ivaEstimado: ivaEst,
    ircEstimado: ircEst,
    obrigacoesPendentes: obrigPend,
    dadosAnuais,
  }) + contextoDetalhado({ faturacao, despesas, obrigacoes })

  async function enviarMensagem() {
    if (!inputMsg.trim() || loading) return
    const userMsg = inputMsg.trim()
    setInputMsg('')
    setMensagens(prev => [...prev, { role: 'user', content: userMsg }])
    setLoading(true)
    setStreamText('')

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          perfil: perfilAtivo,
          mensagens: [...mensagens, { role: 'user', content: userMsg }],
          contexto,
          empresaId: empresa.id,
          userId,
        }),
      })

      if (!res.ok) throw new Error('Erro na API')
      const reader = res.body?.getReader()
      if (!reader) throw new Error('Sem stream')

      let fullText = ''
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        fullText += chunk
        setStreamText(fullText)
      }

      setMensagens(prev => [...prev, { role: 'assistant', content: fullText }])
      setStreamText('')
    } catch (err) {
      console.error(err)
      setMensagens(prev => [...prev, { role: 'assistant', content: 'Erro ao obter resposta. Verifique a chave API.' }])
      setStreamText('')
    }

    setLoading(false)
  }

  async function gerarRelatorio() {
    setGerandoRel(true)
    const mes = new Date().getMonth() + 1
    const ano = new Date().getFullYear()

    try {
      const res = await fetch('/api/relatorio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ perfil: perfilAtivo, contexto, empresaId: empresa.id, mes, ano }),
      })

      const data = await res.json()
      if (data.relatorio) {
        setRelatorios([data.relatorio, ...relatorios])
        setMode('relatorio')
      }
    } catch (err) {
      console.error(err)
    }

    setGerandoRel(false)
  }

  const perfilInfo = PERFIS[perfilAtivo]
  const relAtivosPerfil = relatorios.filter(r => r.perfil === perfilAtivo)

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: 'DM Serif Display, serif', fontSize: 24, color: 'var(--text)', margin: '0 0 4px' }}>
          Consultores IA
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
          3 perspetivas financeiras para a sua empresa
        </p>
      </div>

      {/* Seletor de perfil */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {Object.values(PERFIS).map(p => (
          <button
            key={p.id}
            onClick={() => setPerfilAtivo(p.id)}
            style={{
              background: perfilAtivo === p.id ? `${p.cor}15` : 'var(--surface)',
              border: `1px solid ${perfilAtivo === p.id ? p.cor : 'var(--border)'}`,
              borderRadius: 12, padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ fontSize: 22, marginBottom: 6 }}>{p.avatar}</div>
            <div style={{ fontWeight: 600, fontSize: 14, color: perfilAtivo === p.id ? p.cor : 'var(--text)' }}>{p.nome}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{p.titulo}</div>
          </button>
        ))}
      </div>

      {/* Perfil info */}
      <div style={{ background: 'var(--surface)', border: `1px solid ${perfilInfo.cor}30`, borderRadius: 12, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ fontSize: 32 }}>{perfilInfo.avatar}</span>
        <div>
          <p style={{ margin: 0, fontWeight: 600, color: perfilInfo.cor, fontSize: 15 }}>{perfilInfo.nome}</p>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>{perfilInfo.descricao}</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => setMode('chat')} style={{ ...tabBtn, background: mode === 'chat' ? 'var(--hover-strong)' : 'transparent', color: mode === 'chat' ? 'var(--text)' : 'var(--muted)' }}>💬 Chat</button>
          <button onClick={() => setMode('relatorio')} style={{ ...tabBtn, background: mode === 'relatorio' ? 'var(--hover-strong)' : 'transparent', color: mode === 'relatorio' ? 'var(--text)' : 'var(--muted)' }}>📋 Relatórios</button>
        </div>
      </div>

      {/* CHAT */}
      {mode === 'chat' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {/* Mensagens */}
          <div style={{ height: 420, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {mensagens.length === 0 && !streamText && (
              <div style={{ textAlign: 'center', color: 'var(--faint)', marginTop: 80 }}>
                <span style={{ fontSize: 36 }}>{perfilInfo.avatar}</span>
                <p style={{ fontSize: 14, marginTop: 12 }}>Pergunte ao {perfilInfo.nome} sobre as finanças da sua empresa</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 20, maxWidth: 400, margin: '16px auto 0' }}>
                  {[
                    'Como está a saúde financeira?',
                    'Quanto vou pagar de IRC?',
                    'Devo constituir reservas?',
                    'Posso obter financiamento?',
                  ].map(q => (
                    <button key={q} onClick={() => { setInputMsg(q) }} style={{
                      background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--muted)',
                      borderRadius: 8, padding: '8px 12px', fontSize: 12, cursor: 'pointer', textAlign: 'left',
                    }}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {mensagens.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {m.role === 'assistant' && (
                  <span style={{ fontSize: 22, marginRight: 10, flexShrink: 0, marginTop: 2 }}>{perfilInfo.avatar}</span>
                )}
                <div style={{
                  maxWidth: '75%', padding: '12px 16px', borderRadius: 12, fontSize: 14, lineHeight: 1.6,
                  background: m.role === 'user' ? perfilInfo.cor : 'var(--bg)',
                  color: m.role === 'user' ? 'var(--on-accent)' : 'var(--text)',
                  border: m.role === 'assistant' ? '1px solid var(--border)' : 'none',
                  whiteSpace: 'pre-wrap',
                }}>
                  {m.content}
                </div>
              </div>
            ))}
            {streamText && (
              <div style={{ display: 'flex' }}>
                <span style={{ fontSize: 22, marginRight: 10, flexShrink: 0 }}>{perfilInfo.avatar}</span>
                <div style={{ maxWidth: '75%', padding: '12px 16px', borderRadius: 12, fontSize: 14, lineHeight: 1.6, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', whiteSpace: 'pre-wrap' }}>
                  {streamText}<span style={{ opacity: 0.5 }}>▊</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
            <input
              value={inputMsg}
              onChange={e => setInputMsg(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviarMensagem()}
              placeholder={`Pergunte ao ${perfilInfo.nome}...`}
              disabled={loading}
              style={{ flex: 1 }}
            />
            <button
              onClick={gerarRelatorio}
              disabled={gerandoRel || loading}
              style={{ ...btnStyle, fontSize: 13, whiteSpace: 'nowrap' }}
            >
              {gerandoRel ? '...' : '📋 Relatório'}
            </button>
            <button
              onClick={enviarMensagem}
              disabled={loading || !inputMsg.trim()}
              style={{ ...btnAccent, padding: '10px 20px' }}
            >
              {loading ? '...' : 'Enviar'}
            </button>
          </div>
        </div>
      )}

      {/* RELATÓRIOS */}
      {mode === 'relatorio' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ color: 'var(--text)', fontSize: 16, margin: 0 }}>Relatórios do {perfilInfo.nome}</h3>
            <button onClick={gerarRelatorio} disabled={gerandoRel} style={btnAccent}>
              {gerandoRel ? 'A gerar...' : '+ Gerar relatório'}
            </button>
          </div>

          {relAtivosPerfil.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--muted)' }}>
              <p style={{ fontSize: 32 }}>📋</p>
              <p>Nenhum relatório ainda. Clique em &quot;Gerar relatório&quot; para criar o primeiro.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {relAtivosPerfil.map(r => (
                <div key={r.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ background: 'var(--hover-soft)', padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                      Relatório {r.mes}/{r.ano}
                    </span>
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString('pt-PT')}</span>
                  </div>
                  <div style={{ padding: 20 }}>
                    <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--text-2)', fontSize: 14, lineHeight: 1.7, fontFamily: 'DM Sans, sans-serif', margin: 0 }}>
                      {r.conteudo}
                    </pre>
                    {r.recomendacoes?.length > 0 && (
                      <div style={{ marginTop: 16, background: 'var(--bg)', borderRadius: 8, padding: 14 }}>
                        <p style={{ color: perfilInfo.cor, fontSize: 13, fontWeight: 600, margin: '0 0 8px' }}>✅ Recomendações</p>
                        <ul style={{ margin: 0, paddingLeft: 20 }}>
                          {r.recomendacoes.map((rec: string, i: number) => (
                            <li key={i} style={{ color: 'var(--text-2)', fontSize: 13, lineHeight: 1.6 }}>{rec}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const btnStyle = {
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)',
  borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer',
}
const btnAccent = {
  background: 'var(--accent)', color: 'var(--on-accent)', border: 'none',
  borderRadius: 8, padding: '8px 18px', fontWeight: 600, cursor: 'pointer', fontSize: 13,
}
const tabBtn = {
  border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px',
  fontSize: 13, cursor: 'pointer', fontWeight: 500,
}
