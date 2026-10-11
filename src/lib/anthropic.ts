import Anthropic from '@anthropic-ai/sdk'

/**
 * Cliente Anthropic partilhado.
 * Chaves ligadas a um utilizador (não a um workspace) exigem o header
 * `anthropic-workspace-id`: define ANTHROPIC_WORKSPACE_ID (wrkspc_...) no Vercel.
 */
export function criarClienteAnthropic() {
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim()
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    defaultHeaders: workspaceId ? { 'anthropic-workspace-id': workspaceId } : undefined,
  })
}
