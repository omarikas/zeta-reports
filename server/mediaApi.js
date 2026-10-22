import { createHash } from 'node:crypto'

const MAX_BYTES = 40 * 1024 * 1024
const FOLDER = 'zeta-reports'

function httpError(status, message) {
  return Object.assign(new Error(message), { status })
}

function credentials(env) {
  const cloudName = env.CLOUDINARY_CLOUD_NAME?.trim()
  const apiKey = env.CLOUDINARY_API_KEY?.trim()
  const apiSecret = env.CLOUDINARY_API_SECRET?.trim()
  if (!apiKey || !apiSecret) {
    throw httpError(500, 'Cloudinary API key or secret is missing from .env.')
  }
  if (!cloudName) {
    throw httpError(
      500,
      'Add CLOUDINARY_CLOUD_NAME to .env. It is the cloud name on the Cloudinary dashboard, next to the API key.',
    )
  }
  return { cloudName, apiKey, apiSecret }
}

function sign(params, apiSecret) {
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&')
  return createHash('sha1').update(payload + apiSecret).digest('hex')
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(httpError(413, 'This file is larger than 40 MB.'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function send(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function uploadToCloudinary(req, env) {
  const { cloudName, apiKey, apiSecret } = credentials(env)
  const buffer = await readBody(req, MAX_BYTES + 1024)
  if (!buffer.length) throw httpError(400, 'Choose an image or video to upload.')

  const rawName = String(req.headers['x-file-name'] || 'attachment')
  let filename = 'attachment'
  try {
    filename = decodeURIComponent(rawName)
  } catch {
    filename = rawName
  }
  filename = filename
    .replace(/[\\/"]/g, '_')
    .replaceAll('\0', '_')
    .slice(0, 180) || 'attachment'
  const type = String(req.headers['content-type'] || 'application/octet-stream')
  const timestamp = Math.floor(Date.now() / 1000)
  const params = { folder: FOLDER, timestamp }
  const form = new FormData()
  form.append('file', new Blob([buffer], { type }), filename)
  form.append('api_key', apiKey)
  form.append('timestamp', String(timestamp))
  form.append('folder', FOLDER)
  form.append('signature', sign(params, apiSecret))

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
    method: 'POST',
    body: form,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw httpError(response.status, payload?.error?.message || 'Cloudinary rejected this file.')
  }

  const resourceType = payload.resource_type === 'video' ? 'video' : 'image'
  return {
    url: payload.secure_url,
    publicId: payload.public_id,
    resourceType,
    kind: resourceType,
    bytes: payload.bytes,
  }
}

async function destroyAsset(asset, env) {
  const { cloudName, apiKey, apiSecret } = credentials(env)
  const resourceType = asset.resourceType === 'video' ? 'video' : 'image'
  const timestamp = Math.floor(Date.now() / 1000)
  const params = { public_id: asset.publicId, timestamp }
  const body = new URLSearchParams({
    public_id: asset.publicId,
    timestamp: String(timestamp),
    api_key: apiKey,
    signature: sign(params, apiSecret),
  })
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    },
  )
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw httpError(response.status, payload?.error?.message || 'Could not delete a Cloudinary file.')
  }
}

function attach(middlewares, env) {
  middlewares.use(async (req, res, next) => {
    const path = req.url?.split('?')[0]
    if (path !== '/api/media') return next()
    try {
      if (req.method === 'POST') {
        send(res, 200, await uploadToCloudinary(req, env))
        return
      }
      if (req.method === 'DELETE') {
        const buffer = await readBody(req, 1024 * 1024)
        const payload = JSON.parse(buffer.toString('utf8') || '{}')
        const assets = Array.isArray(payload.assets) ? payload.assets : []
        for (const asset of assets) {
          if (asset?.publicId) await destroyAsset(asset, env)
        }
        send(res, 200, { ok: true })
        return
      }
      send(res, 405, { error: 'Method not allowed.' })
    } catch (error) {
      send(res, error.status || 500, {
        error: error instanceof Error ? error.message : 'Upload failed.',
      })
    }
  })
}

export function mediaApi(env) {
  return {
    name: 'zeta-media-api',
    configureServer(server) {
      attach(server.middlewares, env)
    },
    configurePreviewServer(server) {
      attach(server.middlewares, env)
    },
  }
}
