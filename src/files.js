export const MAX_ATTACHMENTS = 8
export const MAX_BYTES = 40 * 1024 * 1024

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv|ogg|mkv)$/i
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|heic|heif|bmp|svg)$/i

export function attachmentKind(file) {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type && file.type !== 'application/octet-stream') return null
  if (VIDEO_EXT.test(file.name)) return 'video'
  if (IMAGE_EXT.test(file.name)) return 'image'
  return null
}

function videoType(name) {
  if (/\.webm$/i.test(name)) return 'video/webm'
  if (/\.(ogv|ogg)$/i.test(name)) return 'video/ogg'
  if (/\.mov$/i.test(name)) return 'video/quicktime'
  return 'video/mp4'
}

function imageType(name) {
  if (/\.png$/i.test(name)) return 'image/png'
  if (/\.gif$/i.test(name)) return 'image/gif'
  if (/\.webp$/i.test(name)) return 'image/webp'
  if (/\.svg$/i.test(name)) return 'image/svg+xml'
  if (/\.avif$/i.test(name)) return 'image/avif'
  return 'image/jpeg'
}

function renamePasted(file) {
  const generic = !file.name || /^(image\.png|blob)$/i.test(file.name)
  if (!generic) return file
  const ext =
    file.type === 'image/jpeg'
      ? 'jpg'
      : file.type === 'image/svg+xml'
        ? 'svg'
        : (file.type.split('/')[1] || 'bin').replace('jpeg', 'jpg')
  const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '')
  return new File([file], `pasted-${stamp}.${ext}`, { type: file.type })
}

export function normalizeFile(file, { fromPaste = false } = {}) {
  const kind = attachmentKind(file)
  const label = file.name || 'A file'
  if (!kind) return { file: null, error: `${label} needs to be an image or a video.` }

  let next = file
  if (!next.type || next.type === 'application/octet-stream') {
    const type = kind === 'video' ? videoType(next.name) : imageType(next.name)
    next = new File([next], next.name || `attachment.${kind === 'video' ? 'mp4' : 'png'}`, { type })
  }
  if (fromPaste) next = renamePasted(next)
  if (next.size === 0) return { file: null, error: `${next.name} is empty.` }
  if (next.size > MAX_BYTES) return { file: null, error: `${next.name} is larger than 40 MB.` }
  return { file: next, error: null }
}
