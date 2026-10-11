import { criarClienteAnthropic } from '@/lib/anthropic'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getSystemPrompt } from '@/lib/ai-profiles'
import { PerfilContabilista, Despesa } from '@/types'
import { custoDespesa, ivaDedutivel } from '@/lib/faturas'
import { gerarContextoEmpresa } from '@/lib/ai-profiles'
import { calcularIRC, calcularSS } from '@/lib/fiscal'

// Este endpoint é chamado pelo Vercel Cron uma vez por mês
export async function GET(req: Request) {
  // Verificar secret para segurança
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // A service role key ignora o RLS (necessário para ler as empresas de todos os utilizadores)
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const client = criarClienteAnthropic()

  const mes = new Date().getMonth() + 1
  const ano = new Date().getFullYear()

  // Buscar todas as empresas
  const { data: empresas } = await supabase.from('empresas').select('*')
  if (!empresas) return Response.json({ done: true, count: 0 })

  let count = 0

  for (const empresa of empresas) {
    try {
      // Buscar dados da empresa
      const [{ data: faturacao }, { data: despesas }, { data: obrigacoes }, { data: dadosAnuais }] = await Promise.all([
        supabase.from('faturacao_mensal').select('*').eq('empresa_id', empresa.id),
        supabase.from('despesas').select('*').eq('empresa_id', empresa.id),
        supabase.from('obrigacoes_fiscais').select('*').eq('empresa_id', empresa.id).eq('estado', 'pendente'),
        supabase.from('dados_anuais').select('*').eq('empresa_id', empresa.id),
      ])

      const currentYear = ano
      const fatAno = (faturacao || []).filter((f: { ano: number }) => f.ano === currentYear)
      const totalFat = fatAno.reduce((s: number, f: { valor_faturado: number }) => s + f.valor_faturado, 0)
      const despAno = (despesas || []).filter((d: Despesa) => d.ano === currentYear)
      const totalDesp = despAno.reduce((s: number, d: Despesa) => s + custoDespesa(d), 0)
      const faturacaoMensal = fatAno.length > 0 ? totalFat / fatAno.length : 0
      const ssMensal = calcularSS(empresa.remuneracao_socio_mensal, 1)
      const lucro = Math.max(0, totalFat - totalDesp)
      const ivaEst = Math.max(0, fatAno.reduce((s: number, f: { valor_iva_cobrado: number }) => s + f.valor_iva_cobrado, 0) - despAno.reduce((s: number, d: Despesa) => s + ivaDedutivel(d), 0))
      const ircEst = calcularIRC(lucro)
      const obrigPend = (obrigacoes || []).reduce((s: number, o: { valor_estimado: number }) => s + o.valor_estimado, 0)

      const contexto = gerarContextoEmpresa({
        empresa,
        faturacaoTotal: totalFat,
        faturacaoMensal,
        despesasTotal: totalDesp,
        ssMensal,
        ivaEstimado: ivaEst,
        ircEstimado: ircEst,
        obrigacoesPendentes: obrigPend,
        dadosAnuais: dadosAnuais || [],
      })

      // Gerar relatório para cada perfil
      for (const perfil of ['conservador', 'crescimento', 'fiscal'] as PerfilContabilista[]) {
        const systemPrompt = getSystemPrompt(perfil, contexto)
        const response = await client.messages.create({
          model: 'claude-haiku-4-5',
          max_tokens: 1500,
          system: systemPrompt,
          messages: [{
            role: 'user',
            content: `Gera um relatório financeiro mensal para ${mes}/${ano} com: Resumo, Análise Faturação, Situação Fiscal, e 3 Recomendações concretas.`
          }],
        })

        const conteudo = response.content[0].type === 'text' ? response.content[0].text : ''
        const recsMatch = conteudo.match(/Recomenda[çc][oõ]es[:\s]*([\s\S]+?)$/i)
        const recomendacoes: string[] = []
        if (recsMatch) {
          const lines = recsMatch[1].split('\n').filter((l: string) => l.trim().match(/^[-•*\d]/))
          recomendacoes.push(...lines.slice(0, 5).map((l: string) => l.replace(/^[-•*\d.)\s]+/, '').trim()))
        }

        await supabase.from('relatorios_ia').insert({
          empresa_id: empresa.id,
          ano, mes, perfil, conteudo, recomendacoes,
        })
      }

      count++
    } catch (err) {
      console.error(`Erro ao gerar relatório para empresa ${empresa.id}:`, err)
    }
  }

  return Response.json({ done: true, count, mes, ano })
}
