'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Empresa } from '@/types'
import Link from 'next/link'

interface Props {
  empresas: Empresa[]
  userId: string
}

export default function DashboardClient({ empresas: initialEmpresas, userId }: Props) {
  const [empresas, setEmpresas] = useState<Empresa[]>(initialEmpresas)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const [form, setForm] = useState({
    nome: '',
    nif: '',
    tipo: 'lda' as Empresa['tipo'],
    regime_iva: 'trimestral' as Empresa['regime_iva'],
    regime_irc: 'normal' as Empresa['regime_irc'],
    data_inicio_atividade: '',
    setor: '',
    remuneracao_socio_mensal: 1000,
  })

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function handleCreateEmpresa(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const { data, error } = await supabase
      .from('empresas')
      .insert({ ...form, user_id: userId })
      .select()
      .single()

    if (!error && data) {
      setEmpresas(prev => [...prev, data])
      setShowForm(false)
      setForm({
        nome: '', nif: '', tipo: 'lda', regime_iva: 'trimestral',
        regime_irc: 'normal', data_inicio_atividade: '', setor: '',
        remuneracao_socio_mensal: 1000,
      })
      router.push(`/empresa/${data.id}`)
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '0 24px',
        height: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <h1 style={{ fontFamily: 'DM Serif Display, serif', fontSize: 22, color: 'var(--text)', margin: 0 }}>
          Fin<span style={{ color: 'var(--accent)' }}>Advisor</span>
        </h1>
        <button
          onClick={handleLogout}
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
            borderRadius: 8,
            padding: '6px 14px',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Sair
        </button>
      </header>

      {/* Main */}
      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <div>
            <h2 style={{ fontFamily: 'DM Serif Display, serif', fontSize: 28, color: 'var(--text)', margin: 0 }}>
              As minhas empresas
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
              Selecione uma empresa para gerir
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            style={{
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              border: 'none',
              borderRadius: 10,
              padding: '10px 20px',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            + Nova empresa
          </button>
        </div>

        {/* Modal nova empresa */}
        {showForm && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}>
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 16, padding: 32, width: '100%', maxWidth: 480,
              maxHeight: '90vh', overflowY: 'auto',
            }}>
              <h3 style={{ fontFamily: 'DM Serif Display, serif', fontSize: 22, color: 'var(--text)', marginTop: 0, marginBottom: 24 }}>
                Nova empresa
              </h3>
              <form onSubmit={handleCreateEmpresa} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 5 }}>Nome da empresa *</label>
                  <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} required placeholder="Empresa Lda." />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 5 }}>NIF *</label>
                  <input value={form.nif} onChange={e => setForm({ ...form, nif: e.target.value })} required placeholder="500000000" maxLength={9} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 5 }}>Tipo</label>
                    <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as Empresa['tipo'] })}>
                      <option value="lda">Lda.</option>
                      <option value="unipessoal">Unipessoal Lda.</option>
                      <option value="sa">S.A.</option>
                      <option value="eni">ENI</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 5 }}>Regime IVA</label>
                    <select value={form.regime_iva} onChange={e => setForm({ ...form, regime_iva: e.target.value as Empresa['regime_iva'] })}>
                      <option value="trimestral">Trimestral</option>
                      <option value="mensal">Mensal</option>
                      <option value="isento">Isento</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 5 }}>Regime IRC</label>
                    <select value={form.regime_irc} onChange={e => setForm({ ...form, regime_irc: e.target.value as Empresa['regime_irc'] })}>
                      <option value="normal">Geral</option>
                      <option value="simplificado">Simplificado</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 5 }}>Início atividade</label>
                    <input type="date" value={form.data_inicio_atividade} onChange={e => setForm({ ...form, data_inicio_atividade: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 5 }}>Setor de atividade</label>
                  <input value={form.setor} onChange={e => setForm({ ...form, setor: e.target.value })} placeholder="Prestação de serviços, Comércio..." />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 5 }}>Remuneração sócio/mês (€)</label>
                  <input type="number" value={form.remuneracao_socio_mensal} onChange={e => setForm({ ...form, remuneracao_socio_mensal: Number(e.target.value) })} min={0} />
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  <button type="button" onClick={() => setShowForm(false)} style={{
                    flex: 1, background: 'transparent', border: '1px solid var(--border)',
                    color: 'var(--muted)', borderRadius: 10, padding: '11px', fontSize: 14, cursor: 'pointer',
                  }}>
                    Cancelar
                  </button>
                  <button type="submit" disabled={loading} style={{
                    flex: 1, background: loading ? 'var(--faint)' : 'var(--accent)', color: 'var(--on-accent)',
                    border: 'none', borderRadius: 10, padding: '11px', fontWeight: 600,
                    fontSize: 14, cursor: 'pointer',
                  }}>
                    {loading ? 'A criar...' : 'Criar empresa'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Lista de empresas */}
        {empresas.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '80px 20px',
            border: '1px dashed var(--border)', borderRadius: 16, color: 'var(--muted)',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🏢</div>
            <p style={{ fontSize: 18, color: 'var(--text)', marginBottom: 8 }}>Nenhuma empresa ainda</p>
            <p style={{ fontSize: 14 }}>Crie a sua primeira empresa para começar</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {empresas.map(e => (
              <Link key={e.id} href={`/empresa/${e.id}`} style={{ textDecoration: 'none' }}>
                <div style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: 20, cursor: 'pointer',
                  transition: 'border-color 0.2s, transform 0.1s',
                }}
                  onMouseEnter={el => {
                    (el.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'
                    ;(el.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={el => {
                    (el.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
                    ;(el.currentTarget as HTMLElement).style.transform = 'translateY(0)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ color: 'var(--text)', fontSize: 16, fontWeight: 600, margin: '0 0 4px' }}>{e.nome}</h3>
                      <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>NIF: {e.nif}</p>
                    </div>
                    <span style={{
                      background: 'var(--accent-soft)', color: 'var(--accent)',
                      fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                    }}>
                      {e.tipo.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)', background: 'var(--hover)', padding: '3px 8px', borderRadius: 6 }}>
                      IVA {e.regime_iva}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--muted)', background: 'var(--hover)', padding: '3px 8px', borderRadius: 6 }}>
                      {e.setor || 'Setor não definido'}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
