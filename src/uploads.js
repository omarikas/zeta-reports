const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

function uploadViaServer(file, onProgress) {
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

function uploadToCloudinary(file, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)
    form.append('upload_preset', uploadPreset)
    const request = new XMLHttpRequest()
    request.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`)
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
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(payload.error?.message || 'Could not upload this file.'))
        return
      }
      const resourceType = payload.resource_type === 'video' ? 'video' : 'image'
      resolve({
        url: payload.secure_url,
        publicId: payload.public_id,
        resourceType,
        kind: resourceType,
        bytes: payload.bytes,
      })
    }
    request.onerror = () => reject(new Error('Could not reach Cloudinary.'))
    request.send(form)
  })
}

export function uploadMedia(file, onProgress) {
  if (cloudName && uploadPreset) return uploadToCloudinary(file, onProgress)
  return uploadViaServer(file, onProgress)
}

export async function removeMedia(assets) {
  const files = (assets || []).filter((asset) => asset?.publicId)
  if (!files.length || (cloudName && uploadPreset)) return
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
