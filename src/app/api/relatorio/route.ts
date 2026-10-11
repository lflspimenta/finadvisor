import { criarClienteAnthropic } from '@/lib/anthropic'
import { createClient } from '@/lib/supabase/server'
import { getSystemPrompt, PERFIS } from '@/lib/ai-profiles'
import { PerfilContabilista } from '@/types'

const client = criarClienteAnthropic()

export async function POST(req: Request) {
  try {
    const { perfil, contexto, empresaId, mes, ano } = await req.json()

    const perfilInfo = PERFIS[perfil as PerfilContabilista]
    const systemPrompt = getSystemPrompt(perfil as PerfilContabilista, contexto)

    const prompt = `Gera um relatório financeiro mensal completo para ${mes}/${ano}.

Estrutura o relatório assim:
1. **Resumo Executivo** (2-3 frases sobre a situação atual)
2. **Análise da Faturação** (evolução, tendências)
3. **Despesas e Custos** (principais rubricas, otimizações)
4. **Situação Fiscal** (obrigações próximas, estimativas)
5. **Fluxo de Caixa** (situação e projeção)
6. **Recomendações** (3 ações concretas e imediatas)

Sê específico com os dados da empresa. Usa os valores reais fornecidos.`

    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    })

    const conteudo = response.content[0].type === 'text' ? response.content[0].text : ''

    // Extrair recomendações (últimas linhas após "Recomendações")
    const recsMatch = conteudo.match(/Recomenda[çc][oõ]es[:\s]*([\s\S]+?)$/i)
    const recomendacoes: string[] = []
    if (recsMatch) {
      const lines = recsMatch[1].split('\n').filter(l => l.trim().match(/^[-•*\d]/))
      recomendacoes.push(...lines.slice(0, 5).map(l => l.replace(/^[-•*\d.)\s]+/, '').trim()))
    }

    // Guardar no Supabase
    const supabase = await createClient()
    const { data: relatorio, error } = await supabase
      .from('relatorios_ia')
      .insert({
        empresa_id: empresaId,
        ano,
        mes,
        perfil,
        conteudo,
        recomendacoes,
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return Response.json({ error: 'Erro ao guardar relatório' }, { status: 500 })
    }

    return Response.json({ relatorio, perfilNome: perfilInfo.nome })
  } catch (error) {
    console.error('Relatorio API error:', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
