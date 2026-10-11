'use client'

import { createClient } from '@/lib/supabase/client'

export const BUCKET_FATURAS = 'faturas'

/** Abre a fatura digitalizada num separador novo (link temporário de 5 minutos). */
export async function abrirFatura(path: string) {
  // Abrir já a janela evita o bloqueio de pop-ups depois do pedido assíncrono
  const janela = window.open('', '_blank')
  const { data, error } = await createClient().storage.from(BUCKET_FATURAS).createSignedUrl(path, 300)
  if (error || !data) {
    janela?.close()
    alert('Não foi possível abrir a fatura: ' + (error?.message || 'erro desconhecido'))
    return
  }
  if (janela) janela.location.href = data.signedUrl
  else window.location.href = data.signedUrl
}

export async function apagarFicheiroFatura(path?: string | null) {
  if (!path) return
  await createClient().storage.from(BUCKET_FATURAS).remove([path])
}
