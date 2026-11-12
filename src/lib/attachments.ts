export const MAX_ATTACHMENT_BYTES = 600 * 1024
const MAX_SOURCE_BYTES = 20 * 1024 * 1024
const MAX_IMAGE_EDGE = 1600

export interface PreparedImageAttachment {
  fileName: string
  mimeType: string
  size: number
  width: number
  height: number
  dataUrl: string
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('无法读取图片数据'))
    reader.onerror = () => reject(reader.error ?? new Error('无法读取图片'))
    reader.readAsDataURL(blob)
  })
}

async function decodeImage(file: File) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('图片解码失败'))
      element.src = url
    })
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    }
  } catch (cause) {
    URL.revokeObjectURL(url)
    throw cause
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('图片压缩失败，请重试')),
      'image/webp',
      quality,
    )
  })
}

export async function prepareImageAttachment(
  file: File,
): Promise<PreparedImageAttachment> {
  if (!file.type.startsWith('image/')) {
    throw new Error('只能粘贴图片文件')
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('图片超过 20MB，请先裁剪或压缩')
  }

  const decoded = await decodeImage(file)
  try {
    let scale = Math.min(
      1,
      MAX_IMAGE_EDGE / Math.max(decoded.width, decoded.height),
    )
    let quality = 0.82

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const width = Math.max(1, Math.round(decoded.width * scale))
      const height = Math.max(1, Math.round(decoded.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('当前浏览器无法处理图片')
      context.drawImage(decoded.source, 0, 0, width, height)

      const blob = await canvasToBlob(canvas, quality)
      if (blob.size <= MAX_ATTACHMENT_BYTES) {
        return {
          fileName: file.name.replace(/\.[^.]+$/u, '') + '.webp',
          mimeType: 'image/webp',
          size: blob.size,
          width,
          height,
          dataUrl: await readAsDataUrl(blob),
        }
      }

      scale *= 0.82
      quality = Math.max(0.44, quality - 0.08)
    }
  } finally {
    decoded.close()
  }

  throw new Error('图片压缩后仍超过 600KB，请裁剪后重试')
}
