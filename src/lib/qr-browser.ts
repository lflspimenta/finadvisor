'use client'

/**
 * Leitura do código QR das faturas no browser (imagens e PDFs, incluindo digitalizados).
 * Devolve o texto do QR que pareça um QR de fatura portuguesa, ou null.
 */

type Canvas = HTMLCanvasElement

async function carregarImagem(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    // libertado depois de desenhar
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }
}

function canvasDeImagem(img: HTMLImageElement, maxLado: number): Canvas {
  const escala = Math.min(1, maxLado / Math.max(img.naturalWidth, img.naturalHeight))
  const c = document.createElement('canvas')
  c.width = Math.round(img.naturalWidth * escala)
  c.height = Math.round(img.naturalHeight * escala)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return c
}

async function paginasPDF(file: File, maxPaginas: number, escala: number): Promise<Canvas[]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const canvases: Canvas[] = []
  for (let i = 1; i <= Math.min(pdf.numPages, maxPaginas); i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: escala })
    const c = document.createElement('canvas')
    c.width = Math.round(viewport.width)
    c.height = Math.round(viewport.height)
    await page.render({ canvasContext: c.getContext('2d')!, viewport }).promise
    canvases.push(c)
  }
  await pdf.destroy()
  return canvases
}

/** Procura o QR na imagem inteira e, se falhar, em quadrantes ampliados (QR pequenos em páginas grandes). */
async function procurarQR(c: Canvas): Promise<string | null> {
  const jsQR = (await import('jsqr')).default
  const ctx = c.getContext('2d')!
  const tentar = (x: number, y: number, w: number, h: number) => {
    const d = ctx.getImageData(x, y, w, h)
    const r = jsQR(d.data, d.width, d.height, { inversionAttempts: 'attemptBoth' })
    return r?.data && r.data.includes('A:') && r.data.includes('*') ? r.data : null
  }
  const inteiro = tentar(0, 0, c.width, c.height)
  if (inteiro) return inteiro
  const w = Math.floor(c.width / 2), h = Math.floor(c.height / 2)
  // quadrantes com sobreposição (o QR pode estar no meio)
  const regioes: [number, number][] = [[0, 0], [w, 0], [0, h], [w, h], [Math.floor(w / 2), Math.floor(h / 2)]]
  for (const [x, y] of regioes) {
    const sub = document.createElement('canvas')
    sub.width = w * 2; sub.height = h * 2
    sub.getContext('2d')!.drawImage(c, x, y, w, h, 0, 0, w * 2, h * 2)
    const sctx = sub.getContext('2d')!
    const d = sctx.getImageData(0, 0, sub.width, sub.height)
    const jsQRr = jsQR(d.data, d.width, d.height, { inversionAttempts: 'attemptBoth' })
    if (jsQRr?.data && jsQRr.data.includes('A:') && jsQRr.data.includes('*')) return jsQRr.data
  }
  return null
}

export async function lerQRFatura(file: File): Promise<string | null> {
  try {
    if (file.type === 'application/pdf') {
      for (const c of await paginasPDF(file, 3, 2.5)) {
        const qr = await procurarQR(c)
        if (qr) return qr
      }
      return null
    }
    if (file.type.startsWith('image/')) {
      return await procurarQR(canvasDeImagem(await carregarImagem(file), 2400))
    }
  } catch (e) {
    console.warn('Leitura do QR falhou:', e)
  }
  return null
}

/**
 * Reduz fotografias grandes (telemóvel) para JPEG ≤ 2000 px, para caberem no limite
 * de envio do Vercel (~4,5 MB) e ocuparem menos espaço no arquivo.
 */
export async function prepararFicheiro(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < 1_500_000) return file
  const c = canvasDeImagem(await carregarImagem(file), 2000)
  const blob: Blob | null = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.85))
  if (!blob) return file
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
}
