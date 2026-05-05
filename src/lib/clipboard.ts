// Build a paste-ready caption from the parts the user filled in.
export function buildCaption(parts: { hook?: string; content?: string; cta?: string }): string {
  return [parts.hook, parts.content, parts.cta]
    .map(p => (p || '').trim())
    .filter(Boolean)
    .join('\n\n')
}

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // fall through to legacy fallback (insecure-context phone over LAN)
    }
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  try { document.execCommand('copy') } finally { document.body.removeChild(ta) }
}

// iOS Safari accepts image/png in ClipboardItem and requires the Promise be
// passed synchronously inside the user gesture — so we hand ClipboardItem a
// pending Promise instead of awaiting first.
export async function copyImage(url: string, filename = 'image.png'): Promise<void> {
  const pngPromise = fetchAsPng(url)

  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngPromise })])
      return
    } catch {
      // fall through to share sheet
    }
  }

  // Mobile fallback: native share sheet with the image as a File.
  const blob = await pngPromise
  const file = new File([blob], filename.replace(/\.[^.]+$/, '') + '.png', { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] })
    return
  }

  throw new Error('Clipboard image write not supported in this browser context')
}

async function fetchAsPng(url: string): Promise<Blob> {
  const res = await fetch(url)
  const blob = await res.blob()
  if (blob.type === 'image/png') return blob

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(blob)
  })

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error('Image decode failed'))
    i.src = dataUrl
  })

  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2d context unavailable')
  ctx.drawImage(img, 0, 0)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))), 'image/png')
  })
}
