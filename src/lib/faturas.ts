import { Despesa } from '@/types'

/**
 * Código QR das faturas portuguesas (Portaria n.º 195/2020).
 * Formato: campos "X:valor" separados por "*", ex.:
 * A:123456789*B:999999990*C:PT*D:FT*E:N*F:20260105*G:FT A/1*H:CSDF7T5H-1*I1:PT*I7:100.00*I8:23.00*N:23.00*O:123.00*Q:abcd*R:9999
 */
export interface DadosQR {
  nifEmitente: string
  nifAdquirente: string
  tipoDocumento: string
  data: string            // YYYY-MM-DD
  numeroDocumento: string
  atcud: string
  base: number            // soma das bases tributáveis (todas as taxas e regiões) + isento + não sujeito
  iva: number             // soma do IVA de todas as taxas e regiões
  total: number           // total do documento com impostos
  notaCredito: boolean
  anulado: boolean
}

const num = (v?: string) => {
  const n = parseFloat((v || '0').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
const r2 = (v: number) => Math.round(v * 100) / 100

export function parseQRFatura(texto: string): DadosQR | null {
  if (!texto || !texto.includes('A:') || !texto.includes('*')) return null
  const campos: Record<string, string> = {}
  for (const parte of texto.trim().split('*')) {
    const i = parte.indexOf(':')
    if (i > 0) campos[parte.slice(0, i).trim()] = parte.slice(i + 1).trim()
  }
  // Campos obrigatórios mínimos
  if (!campos.A || !campos.F || !campos.O) return null
  if (!/^\d{8}$/.test(campos.F)) return null

  // Bases e IVA por espaço fiscal: I (PT continente), J (Açores), K (Madeira)
  // x2 = isento, x3/x4 = reduzida, x5/x6 = intermédia, x7/x8 = normal
  let base = num(campos.L) // não sujeito / não tributável
  let iva = 0
  for (const r of ['I', 'J', 'K']) {
    base += num(campos[`${r}2`]) + num(campos[`${r}3`]) + num(campos[`${r}5`]) + num(campos[`${r}7`])
    iva += num(campos[`${r}4`]) + num(campos[`${r}6`]) + num(campos[`${r}8`])
  }

  const notaCredito = campos.D === 'NC'
  const sinal = notaCredito ? -1 : 1
  const f = campos.F
  return {
    nifEmitente: campos.A,
    nifAdquirente: campos.B || '',
    tipoDocumento: campos.D || '',
    data: `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6, 8)}`,
    numeroDocumento: campos.G || '',
    atcud: campos.H || '',
    base: r2(sinal * base),
    iva: r2(sinal * iva),
    total: r2(sinal * num(campos.O)),
    notaCredito,
    anulado: campos.E === 'A',
  }
}

/** Valida NIF português (dígito de controlo módulo 11). */
export function nifValido(nif: string): boolean {
  if (!/^\d{9}$/.test(nif)) return false
  const soma = nif.slice(0, 8).split('').reduce((s, d, i) => s + Number(d) * (9 - i), 0)
  const resto = soma % 11
  const controlo = resto < 2 ? 0 : 11 - resto
  return controlo === Number(nif[8])
}

/** IVA dedutível de uma despesa (0 para despesas sem dados de fatura). */
export function ivaDedutivel(d: Pick<Despesa, 'valor_iva' | 'deducao_iva'>): number {
  return Number(d.valor_iva || 0) * Number(d.deducao_iva ?? 1)
}

/** Custo para o resultado: total pago menos o IVA que é recuperável. */
export function custoDespesa(d: Pick<Despesa, 'valor' | 'valor_iva' | 'deducao_iva'>): number {
  return Number(d.valor) - ivaDedutivel(d)
}

export const CATEGORIAS_DESPESA = [
  'Fornecedores', 'Salários', 'Rendas', 'Comunicações',
  'Combustível', 'Manutenção', 'Marketing', 'Software',
  'Contabilidade', 'Seguros', 'Outros',
]
