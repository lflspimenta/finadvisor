'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Email ou password incorretos.')
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <h1 className="text-3xl mb-1" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--text)' }}>
            FinAdvisor
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>Gestão financeira inteligente</p>
        </div>

        {/* Card */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 32 }}>
          <h2 style={{ fontFamily: 'DM Serif Display, serif', fontSize: 22, marginBottom: 24, color: 'var(--text)' }}>
            Entrar
          </h2>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="email@empresa.pt"
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <p style={{ color: 'var(--negative)', fontSize: 13, padding: '8px 12px', background: 'var(--negative-soft)', borderRadius: 8 }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading ? 'var(--faint)' : 'var(--accent)',
                color: 'var(--on-accent)',
                border: 'none',
                borderRadius: 10,
                padding: '12px 24px',
                fontWeight: 600,
                fontSize: 15,
                cursor: loading ? 'not-allowed' : 'pointer',
                marginTop: 8,
                transition: 'background 0.2s',
              }}
            >
              {loading ? 'A entrar...' : 'Entrar'}
            </button>
          </form>

          <p style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
            Não tem conta?{' '}
            <Link href="/register" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
              Registar
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
