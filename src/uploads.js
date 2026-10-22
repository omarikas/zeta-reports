export function uploadMedia(file, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', '/api/media')
    request.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    request.setRequestHeader('X-File-Name', encodeURIComponent(file.name || 'attachment'))
    request.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable) return
      onProgress(event.loaded / event.total)
    }
    request.onload = () => {
      let payload = {}
      try {
        payload = JSON.parse(request.responseText || '{}')
      } catch {
        payload = {}
      }
      if (request.status >= 200 && request.status < 300) resolve(payload)
      else reject(new Error(payload.error || 'Could not upload this file.'))
    }
    request.onerror = () => reject(new Error('Could not reach Cloudinary.'))
    request.send(file)
  })
}

export async function removeMedia(assets) {
  const files = (assets || []).filter((asset) => asset?.publicId)
  if (!files.length) return
  await fetch('/api/media', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assets: files.map((asset) => ({
        publicId: asset.publicId,
        resourceType: asset.resourceType,
      })),
    }),
  })
}
