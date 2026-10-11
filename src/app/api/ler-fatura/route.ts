import Anthropic from '@anthropic-ai/sdk'
import { criarClienteAnthropic } from '@/lib/anthropic'
import { createClient } from '@/lib/supabase/server'
import { CATEGORIAS_DESPESA, parseQRFatura } from '@/lib/faturas'

export const maxDuration = 60

const client = criarClienteAnthropic()
const MAX_BYTES = 4 * 1024 * 1024
const IMAGENS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
type TipoImagem = (typeof IMAGENS)[number]

/**
 * Lê uma fatura (PDF ou imagem).
 * tipo=compra → fatura de fornecedor (despesa); tipo=venda → fatura emitida pela empresa (faturação).
 * Os valores do código QR (quando o browser o conseguiu ler) têm prioridade sobre a IA.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file')
  const empresaId = String(form.get('empresaId') || '')
  const qrTexto = String(form.get('qr') || '')
  const tipo = form.get('tipo') === 'venda' ? 'venda' : 'compra'

  if (!(file instanceof File)) return Response.json({ error: 'Ficheiro em falta' }, { status: 400 })
  const ePdf = file.type === 'application/pdf'
  if (!ePdf && !IMAGENS.includes(file.type as TipoImagem)) {
    return Response.json({ error: 'Formato não suportado (usa PDF, JPG, PNG ou WEBP)' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) return Response.json({ error: 'Ficheiro demasiado grande (máx. 4 MB)' }, { status: 413 })

  const { data: empresa } = await supabase
    .from('empresas').select('id, nif').eq('id', empresaId).eq('user_id', user.id).single()
  if (!empresa) return Response.json({ error: 'Empresa não encontrada' }, { status: 404 })
  const nifEmpresa = String(empresa.nif || '').replace(/\D/g, '')

  const qr = parseQRFatura(qrTexto)
  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
  const bloco = ePdf
    ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 } }
    : { type: 'image' as const, source: { type: 'base64' as const, media_type: file.type as TipoImagem, data: base64 } }

  const contexto = tipo === 'compra'
    ? `Esta é uma fatura de COMPRA (fatura, fatura-recibo, fatura simplificada ou nota de crédito) recebida por uma empresa portuguesa.
- contraparte_nome / contraparte_nif: o FORNECEDOR que emitiu a fatura (nome comercial curto, ex.: "EDP Comercial", "Galp", "Vodafone").
- categoria: a que melhor se aplica à despesa.`
    : `Esta é uma fatura de VENDA emitida por uma empresa portuguesa a um cliente.
- contraparte_nome / contraparte_nif: o CLIENTE (adquirente). Se for consumidor final sem NIF, usa "Consumidor final" e 999999990.
- categoria: usa "Outros".`

  const instrucoes = `${contexto}
- descricao: 2 a 6 palavras sobre o que foi faturado (ex.: "Eletricidade escritório setembro").
- numero_documento: identificação do documento (ex.: "FT 2026/123").
- Valores em euros com ponto decimal. base = total sem IVA; iva = total do IVA; total = total com IVA. Nas notas de crédito usa valores negativos.
- data no formato AAAA-MM-DD.
- Se um campo não for legível, devolve string vazia ou 0. Nunca inventes.${qr ? '\nOs valores numéricos já foram lidos do código QR; foca-te nos nomes, descrição e categoria.' : ''}
Chama a ferramenta "registar_fatura".`

  const pedir = (model: string) => client.messages.create({
    model,
    max_tokens: 800,
    tools: [{
      name: 'registar_fatura',
      description: 'Regista os dados extraídos de uma fatura',
      input_schema: {
        type: 'object',
        properties: {
          contraparte_nome: { type: 'string' },
          contraparte_nif: { type: 'string', description: 'NIF, 9 dígitos' },
          numero_documento: { type: 'string' },
          data: { type: 'string', description: 'AAAA-MM-DD' },
          base: { type: 'number' },
          iva: { type: 'number' },
          total: { type: 'number' },
          categoria: { type: 'string', enum: CATEGORIAS_DESPESA },
          descricao: { type: 'string' },
        },
        required: ['contraparte_nome', 'contraparte_nif', 'numero_documento', 'data', 'base', 'iva', 'total', 'categoria', 'descricao'],
      },
    }],
    tool_choice: { type: 'tool', name: 'registar_fatura' },
    messages: [{ role: 'user', content: [bloco, { type: 'text', text: instrucoes }] }],
  })

  let ia: Record<string, unknown> = {}
  try {
    // Com QR basta um modelo rápido (só nomes/categoria); sem QR usa o modelo mais preciso
    const modelo = qr ? 'claude-haiku-4-5' : (process.env.ANTHROPIC_PDF_MODEL || 'claude-sonnet-4-5')
    let resp
    try {
      resp = await pedir(modelo)
    } catch (e) {
      if (e instanceof Anthropic.NotFoundError && modelo !== 'claude-haiku-4-5') resp = await pedir('claude-haiku-4-5')
      else throw e
    }
    const tool = resp.content.find(b => b.type === 'tool_use')
    if (tool && tool.type === 'tool_use') ia = tool.input as Record<string, unknown>
  } catch (e) {
    // Com QR conseguimos continuar sem a IA (ficam só os nomes/categoria por preencher)
    if (!qr) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido'
      return Response.json({ error: `Erro na leitura: ${msg}` }, { status: 500 })
    }
  }

  const s = (k: string) => (typeof ia[k] === 'string' ? (ia[k] as string).trim() : '')
  const n = (k: string) => { const v = Number(ia[k]); return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0 }
  const categoria = CATEGORIAS_DESPESA.includes(s('categoria')) ? s('categoria') : 'Outros'

  const avisos: string[] = []
  let ivaNaoDedutivel = false
  if (qr?.anulado) avisos.push('O QR indica que este documento está anulado.')
  if (qr?.notaCredito) avisos.push('Nota de crédito: os valores ficam negativos.')
  if (!qr) avisos.push('Sem código QR legível: valores lidos pela IA, confirma-os.')

  if (tipo === 'compra' && qr && qr.nifAdquirente && qr.nifAdquirente !== nifEmpresa) {
    ivaNaoDedutivel = true
    avisos.push(qr.nifAdquirente === '999999990'
      ? 'Fatura emitida a consumidor final (sem NIF): o IVA não é dedutível.'
      : `Fatura emitida ao NIF ${qr.nifAdquirente}, não ao NIF da empresa (${nifEmpresa}): o IVA não é dedutível.`)
  }
  if (tipo === 'venda' && qr && qr.nifEmitente !== nifEmpresa) {
    avisos.push(`Esta fatura foi emitida pelo NIF ${qr.nifEmitente}, não pela empresa (${nifEmpresa}). Será uma fatura de compra?`)
  }

  // No QR: A = emitente, B = adquirente
  const nifQR = qr ? (tipo === 'compra' ? qr.nifEmitente : qr.nifAdquirente) : ''

  return Response.json({
    fonte: qr ? 'qr' : 'ia',
    contraparte_nome: s('contraparte_nome'),
    contraparte_nif: nifQR || s('contraparte_nif').replace(/\D/g, ''),
    numero_documento: qr?.numeroDocumento || s('numero_documento'),
    data: qr?.data || (/^\d{4}-\d{2}-\d{2}$/.test(s('data')) ? s('data') : ''),
    atcud: qr?.atcud || '',
    base: qr ? qr.base : n('base'),
    iva: qr ? qr.iva : n('iva'),
    total: qr ? qr.total : n('total'),
    categoria,
    descricao: s('descricao'),
    ivaNaoDedutivel,
    avisos,
  })
}
