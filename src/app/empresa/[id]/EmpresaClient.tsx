'use client'

import { useState } from 'react'
import { Empresa, FaturacaoMensal, Despesa, ObrigacaoFiscal, SaldoCaixa, RelatorioIA } from '@/types'
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
  currentYear: number
}

const TABS = [
  { id: 'faturacao', label: '📊 Faturação' },
  { id: 'despesas', label: '💸 Despesas' },
  { id: 'fiscal', label: '📅 Calendário Fiscal' },
  { id: 'cashflow', label: '📈 Cashflow' },
  { id: 'ia', label: '🤖 Consultores IA' },
]

export default function EmpresaClient({
  empresa, userId, faturacao: initialFat, despesas: initialDesp,
  obrigacoes: initialObrig, saldos, relatorios: initialRel, currentYear
}: Props) {
  const [activeTab, setActiveTab] = useState('faturacao')
  const [faturacao, setFaturacao] = useState(initialFat)
  const [despesas, setDespesas] = useState(initialDesp)
  const [obrigacoes, setObrigacoes] = useState(initialObrig)
  const [relatorios, setRelatorios] = useState(initialRel)

  // Indicadores resumo
  const fatAno = faturacao.filter(f => f.ano === currentYear)
  const totalFat = fatAno.reduce((s, f) => s + f.valor_faturado, 0)
  const totalDesp = despesas.filter(d => d.ano === currentYear).reduce((s, d) => s + d.valor, 0)
  const obrigPendentes = obrigacoes.filter(o => o.estado === 'pendente').reduce((s, o) => s + o.valor_estimado, 0)
  const lucroEst = Math.max(0, totalFat - totalDesp)

  function fmt(v: number) {
    return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(v)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f0f' }}>
      {/* Header */}
      <header style={{
        background: '#1a1a1a', borderBottom: '1px solid #2a2a2a',
        padding: '0 24px', height: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/dashboard" style={{ color: '#888', textDecoration: 'none', fontSize: 20 }}>←</Link>
          <div>
            <span style={{ fontFamily: 'DM Serif Display, serif', fontSize: 18, color: '#f0f0f0' }}>
              {empresa.nome}
            </span>
            <span style={{ marginLeft: 10, fontSize: 12, color: '#888' }}>NIF {empresa.nif}</span>
          </div>
        </div>
        <span style={{
          background: '#c9f06a20', color: '#c9f06a',
          fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6
        }}>
          {empresa.tipo.toUpperCase()}
        </span>
      </header>

      {/* KPI Cards */}
      <div style={{ background: '#1a1a1a', borderBottom: '1px solid #2a2a2a', padding: '16px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {[
            { label: `Faturação ${currentYear}`, value: fmt(totalFat), color: '#c9f06a' },
            { label: 'Despesas totais', value: fmt(totalDesp), color: '#f59e0b' },
            { label: 'Resultado estimado', value: fmt(lucroEst), color: lucroEst > 0 ? '#34d399' : '#ef4444' },
            { label: 'Obrigações pendentes', value: fmt(obrigPendentes), color: '#f87171' },
          ].map(kpi => (
            <div key={kpi.label} style={{
              background: '#0f0f0f', border: '1px solid #2a2a2a',
              borderRadius: 10, padding: '12px 16px',
            }}>
              <p style={{ fontSize: 12, color: '#888', margin: '0 0 4px' }}>{kpi.label}</p>
              <p style={{ fontSize: 20, fontWeight: 600, color: kpi.color, margin: 0 }}>{kpi.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: '#1a1a1a', borderBottom: '1px solid #2a2a2a', padding: '0 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', gap: 4 }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '14px 16px', fontSize: 13, fontWeight: 500,
                color: activeTab === tab.id ? '#c9f06a' : '#888',
                borderBottom: activeTab === tab.id ? '2px solid #c9f06a' : '2px solid transparent',
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
        {activeTab === 'fiscal' && (
          <TabFiscal
            empresa={empresa}
            faturacao={faturacao}
            despesas={despesas}
            obrigacoes={obrigacoes}
            setObrigacoes={setObrigacoes}
            currentYear={currentYear}
          />
        )}
        {activeTab === 'cashflow' && (
          <TabCashflow
            empresa={empresa}
            faturacao={faturacao}
            despesas={despesas}
            obrigacoes={obrigacoes}
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
          />
        )}
      </main>
    </div>
  )
}
