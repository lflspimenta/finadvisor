'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (password.length < 6) {
      setError('A password deve ter pelo menos 6 caracteres.')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signUp({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setTimeout(() => router.push('/login'), 3000)
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontFamily: 'DM Serif Display, serif', fontSize: 24, color: 'var(--text)', marginBottom: 8 }}>
            Conta criada!
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>
            Verifique o seu email para confirmar a conta. A redirecionar...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-3xl mb-1" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--text)' }}>
            FinAdvisor
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>Gestão financeira inteligente</p>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 32 }}>
          <h2 style={{ fontFamily: 'DM Serif Display, serif', fontSize: 22, marginBottom: 24, color: 'var(--text)' }}>
            Criar conta
          </h2>

          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                placeholder="Mínimo 6 caracteres"
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
              }}
            >
              {loading ? 'A criar conta...' : 'Criar conta'}
            </button>
          </form>

          <p style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
            Já tem conta?{' '}
            <Link href="/login" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
