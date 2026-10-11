'use client'

import { useState } from 'react'
import { Empresa, FaturacaoMensal, Despesa, ObrigacaoFiscal, SaldoCaixa, RelatorioIA, DadosAnuais, FaturaVenda, Pessoal } from '@/types'
import { MARCA_IMPORTADO } from '@/lib/importacao'
import { custosOperacionais } from '@/lib/fiscal'
import TabPessoal from '@/components/TabPessoal'
import ImportarContasAnuais from '@/components/ImportarContasAnuais'
import Link from 'next/link'
import TabFaturacao from '@/components/TabFaturacao'
import TabDespesas from '@/components/TabDespesas'
import TabFiscal from '@/components/TabFiscal'
import TabCashflow from '@/components/TabCashflow'
import TabIA from '@/components/TabIA'

interface Props {
  empresa: Empresa
  userId: string
  faturacao: FaturacaoMensal[]
  despesas: Despesa[]
  obrigacoes: ObrigacaoFiscal[]
  saldos: SaldoCaixa[]
  relatorios: RelatorioIA[]
  dadosAnuais: DadosAnuais[]
  faturasVenda: FaturaVenda[]
  pessoal: Pessoal | null
  currentYear: number
}

const TABS = [
  { id: 'faturacao', label: '📊 Faturação' },
  { id: 'despesas', label: '💸 Despesas' },
  { id: 'pessoal', label: '👥 Pessoal' },
  { id: 'fiscal', label: '📅 Calendário Fiscal' },
  { id: 'cashflow', label: '📈 Cashflow' },
  { id: 'ia', label: '🤖 Consultores IA' },
]

export default function EmpresaClient({
  empresa: initialEmpresa, userId, faturacao: initialFat, despesas: initialDesp,
  obrigacoes: initialObrig, saldos: initialSaldos, relatorios: initialRel, dadosAnuais: initialAnuais, faturasVenda: initialVendas, pessoal: initialPessoal, currentYear
}: Props) {
  const [empresa, setEmpresa] = useState(initialEmpresa)
  const [pessoal, setPessoal] = useState(initialPessoal)
  const [activeTab, setActiveTab] = useState('faturacao')
  const [faturacao, setFaturacao] = useState(initialFat)
  const [despesas, setDespesas] = useState(initialDesp)
  const [obrigacoes, setObrigacoes] = useState(initialObrig)
  const [relatorios, setRelatorios] = useState(initialRel)
  const [dadosAnuais, setDadosAnuais] = useState(initialAnuais)
  const [faturasVenda, setFaturasVenda] = useState(initialVendas)
  const [saldos, setSaldos] = useState<SaldoCaixa[]>(initialSaldos)
  const [importarAberto, setImportarAberto] = useState(false)
  const [avisoImport, setAvisoImport] = useState('')

  function aplicarImportacao(r: { dadosAnuais: DadosAnuais; faturacao: FaturacaoMensal[]; despesas: Despesa[]; removerDespesasAno: number; saldo: SaldoCaixa | null }) {
    setDadosAnuais(prev => [...prev.filter(d => d.ano !== r.dadosAnuais.ano), r.dadosAnuais].sort((a, b) => a.ano - b.ano))
    const chaves = new Set(r.faturacao.map(f => `${f.ano}-${f.mes}`))
    setFaturacao(prev => [...prev.filter(f => !chaves.has(`${f.ano}-${f.mes}`)), ...r.faturacao])
    setDespesas(prev => [...prev.filter(d => !(d.ano === r.removerDespesasAno && d.descricao.startsWith(MARCA_IMPORTADO))), ...r.despesas])
    if (r.saldo) setSaldos(prev => [...prev.filter(s => !(s.ano === r.saldo!.ano && s.mes === r.saldo!.mes)), r.saldo!])
    setAvisoImport(`Contas de ${r.dadosAnuais.ano} importadas. Vai ao Calendário Fiscal e carrega em gerar para recalcular o IRC e os PPC de ${r.dadosAnuais.ano + 1}.`)
  }

  // Indicadores resumo
  const fatAno = faturacao.filter(f => f.ano === currentYear)
  // Comparar só meses completos (até ao mês anterior), para faturação e custos cobrirem o mesmo período
  const ateMes = Math.max(1, new Date().getFullYear() === currentYear ? new Date().getMonth() : 12)
  const MESES_ABR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  const periodoKpi = ateMes === 1 ? 'jan' : `jan–${MESES_ABR[ateMes - 1]}`
  const totalFat = fatAno.filter(f => f.mes <= ateMes).reduce((s, f) => s + Number(f.valor_faturado), 0)
  const totalDesp = custosOperacionais(empresa, despesas, currentYear, pessoal, ateMes)
  const obrigPendentes = obrigacoes.filter(o => o.estado === 'pendente').reduce((s, o) => s + o.valor_estimado, 0)
  const lucroEst = totalFat - totalDesp

  function fmt(v: number) {
    return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '8px 16px', minHeight: 60, gap: 8, flexWrap: 'wrap',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/dashboard" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: 20 }}>←</Link>
          <div>
            <span style={{ fontFamily: 'DM Serif Display, serif', fontSize: 18, color: 'var(--text)' }}>
              {empresa.nome}
            </span>
            <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--muted)' }}>NIF {empresa.nif}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setImportarAberto(true)} style={{
            background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)',
            borderRadius: 8, padding: '7px 12px', fontSize: 13, cursor: 'pointer',
          }}>
            📄 Importar contas anuais
          </button>
          <span style={{
            background: 'var(--accent-soft)', color: 'var(--accent)',
            fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6
          }}>
            {empresa.tipo.toUpperCase()}
          </span>
        </div>
      </header>

      {importarAberto && (
        <ImportarContasAnuais
          empresa={empresa}
          faturacao={faturacao}
          onClose={() => setImportarAberto(false)}
          onImportado={aplicarImportacao}
        />
      )}

      {avisoImport && (
        <div style={{ background: 'var(--accent-soft)', borderBottom: '1px solid var(--border)', padding: '10px 24px', fontSize: 13, color: 'var(--text-2)', display: 'flex', justifyContent: 'space-between' }}>
          <span>✓ {avisoImport}</span>
          <button onClick={() => setAvisoImport('')} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>×</button>
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '16px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          {[
            { label: `Faturação ${currentYear} (${periodoKpi})`, value: fmt(totalFat), color: 'var(--accent)' },
            { label: `Custos (${periodoKpi}, s/ IVA dedutível)`, value: fmt(totalDesp), color: 'var(--warning)' },
            { label: `Resultado (${periodoKpi})`, value: fmt(lucroEst), color: lucroEst >= 0 ? 'var(--positive)' : 'var(--negative)' },
            { label: 'Obrigações pendentes', value: fmt(obrigPendentes), color: 'var(--negative)' },
          ].map(kpi => (
            <div key={kpi.label} style={{
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '12px 16px',
            }}>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 4px' }}>{kpi.label}</p>
              <p style={{ fontSize: 20, fontWeight: 600, color: kpi.color, margin: 0 }}>{kpi.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', gap: 4, overflowX: 'auto', whiteSpace: 'nowrap' }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '14px 16px', fontSize: 13, fontWeight: 500,
                color: activeTab === tab.id ? 'var(--accent)' : 'var(--muted)',
                borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'color 0.2s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px' }}>
        {activeTab === 'faturacao' && (
          <TabFaturacao
            empresaId={empresa.id}
            faturacao={faturacao}
            setFaturacao={setFaturacao}
            faturasVenda={faturasVenda}
            setFaturasVenda={setFaturasVenda}
            currentYear={currentYear}
          />
        )}
        {activeTab === 'despesas' && (
          <TabDespesas
            empresaId={empresa.id}
            despesas={despesas}
            setDespesas={setDespesas}
            currentYear={currentYear}
          />
        )}
        {activeTab === 'pessoal' && (
          <TabPessoal
            empresa={empresa}
            setEmpresa={setEmpresa}
            pessoal={pessoal}
            setPessoal={setPessoal}
            currentYear={currentYear}
          />
        )}
        {activeTab === 'fiscal' && (
          <TabFiscal
            empresa={empresa}
            faturacao={faturacao}
            despesas={despesas}
            obrigacoes={obrigacoes}
            setObrigacoes={setObrigacoes}
            currentYear={currentYear}
            dadosAnuais={dadosAnuais}
            pessoal={pessoal}
          />
        )}
        {activeTab === 'cashflow' && (
          <TabCashflow
            empresa={empresa}
            faturacao={faturacao}
            despesas={despesas}
            obrigacoes={obrigacoes}
            saldos={saldos}
            setSaldos={setSaldos}
            pessoal={pessoal}
          />
        )}
        {activeTab === 'ia' && (
          <TabIA
            empresa={empresa}
            faturacao={faturacao}
            despesas={despesas}
            obrigacoes={obrigacoes}
            relatorios={relatorios}
            setRelatorios={setRelatorios}
            userId={userId}
            dadosAnuais={dadosAnuais}
            pessoal={pessoal}
            saldos={saldos}
          />
        )}
      </main>
    </div>
  )
}
