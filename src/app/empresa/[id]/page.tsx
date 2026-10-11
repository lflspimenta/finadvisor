import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import EmpresaClient from './EmpresaClient'

export default async function EmpresaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: empresa } = await supabase
    .from('empresas')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!empresa) notFound()

  const currentYear = new Date().getFullYear()

  const [faturacao, despesas, obrigacoes, saldos, relatorios] = await Promise.all([
    supabase.from('faturacao_mensal').select('*').eq('empresa_id', id).order('ano,mes'),
    supabase.from('despesas').select('*').eq('empresa_id', id).order('ano,mes'),
    supabase.from('obrigacoes_fiscais').select('*').eq('empresa_id', id).order('data_limite'),
    supabase.from('saldos_caixa').select('*').eq('empresa_id', id).order('ano,mes'),
    supabase.from('relatorios_ia').select('*').eq('empresa_id', id).order('created_at', { ascending: false }).limit(10),
  ])

  return (
    <EmpresaClient
      empresa={empresa}
      userId={user.id}
      faturacao={faturacao.data || []}
      despesas={despesas.data || []}
      obrigacoes={obrigacoes.data || []}
      saldos={saldos.data || []}
      relatorios={relatorios.data || []}
      currentYear={currentYear}
    />
  )
}
