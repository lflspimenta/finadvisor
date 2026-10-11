import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { CAMPOS_ANUAIS } from '@/lib/importacao'

export const maxDuration = 60

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MAX_BYTES = 4 * 1024 * 1024 // limite do corpo de pedido no Vercel (~4,5 MB)

const INSTRUCOES = `Analisa este documento contabilístico de uma empresa portuguesa (IES, Balanço, Demonstração de Resultados ou balancete, possivelmente exportado do CentralGest) e extrai os valores do exercício mais recente que aparece no documento.

Regras:
- Usa sempre os valores do período mais recente (coluna do ano N, não N-1).
- Valores em euros. Gastos sempre como números positivos. Resultados e capital próprio podem ser negativos (prejuízo). Usa ponto como separador decimal.
- Se um valor não existir no documento, devolve 0. Nunca inventes nem estimes.
- "ebitda": usa o valor "Resultado antes de depreciações, gastos de financiamento e impostos" se existir.
- "irc": "Imposto sobre o rendimento do período".
- "divida_financeira": financiamentos obtidos (correntes + não correntes).
- "ano": ano do exercício a que os valores dizem respeito.
- Em "observacoes" indica o tipo de documento e qualquer dúvida relevante (ex.: valores não encontrados).
Chama a ferramenta "registar_dados" com os valores.`

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file')
  const empresaId = form.get('empresaId')

  if (!(file instanceof File)) return Response.json({ error: 'Ficheiro em falta' }, { status: 400 })
  if (file.type !== 'application/pdf') return Response.json({ error: 'O ficheiro tem de ser PDF' }, { status: 400 })
  if (file.size > MAX_BYTES) return Response.json({ error: 'PDF demasiado grande (máx. 4 MB). Exporta só as páginas do balanço e da demonstração de resultados.' }, { status: 413 })

  const { data: empresa } = await supabase
    .from('empresas').select('id').eq('id', String(empresaId)).eq('user_id', user.id).single()
  if (!empresa) return Response.json({ error: 'Empresa não encontrada' }, { status: 404 })

  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')

  const properties: Record<string, { type: string; description: string }> = {
    ano: { type: 'integer', description: 'Ano do exercício' },
    observacoes: { type: 'string', description: 'Tipo de documento e notas' },
  }
  for (const c of CAMPOS_ANUAIS) properties[c.key] = { type: 'number', description: c.descricao }

  const pedir = (model: string) => client.messages.create({
    model,
    max_tokens: 1500,
    tools: [{
      name: 'registar_dados',
      description: 'Regista os valores financeiros anuais extraídos do documento',
      input_schema: { type: 'object', properties, required: ['ano', ...CAMPOS_ANUAIS.map(c => c.key)] },
    }],
    tool_choice: { type: 'tool', name: 'registar_dados' },
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: INSTRUCOES },
      ],
    }],
  })

  try {
    let resp
    try {
      resp = await pedir(process.env.ANTHROPIC_PDF_MODEL || 'claude-sonnet-4-5')
    } catch (e) {
      if (e instanceof Anthropic.NotFoundError) resp = await pedir('claude-haiku-4-5')
      else throw e
    }
    const tool = resp.content.find(b => b.type === 'tool_use')
    if (!tool || tool.type !== 'tool_use') {
      return Response.json({ error: 'Não foi possível extrair dados do documento' }, { status: 422 })
    }
    const raw = tool.input as Record<string, unknown>
    const dados: Record<string, number> = {}
    for (const c of CAMPOS_ANUAIS) {
      const v = Number(raw[c.key])
      dados[c.key] = !Number.isFinite(v) ? 0 : c.podeNegativo ? v : Math.abs(v)
    }
    const ano = Number(raw.ano)
    return Response.json({
      ano: Number.isInteger(ano) && ano > 1990 && ano < 2100 ? ano : null,
      dados,
      observacoes: typeof raw.observacoes === 'string' ? raw.observacoes : '',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido'
    return Response.json({ error: `Erro na extração: ${msg}` }, { status: 500 })
  }
}
