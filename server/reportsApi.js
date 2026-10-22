import { configureReports, deleteReport, listReports, normalizeReport, saveReport } from './reportsDb.js'

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(Object.assign(new Error('This report is too large.'), { status: 413 }))
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

function reportId(pathname) {
  const prefix = '/api/reports/'
  if (!pathname.startsWith(prefix)) return ''
  try {
    return decodeURIComponent(pathname.slice(prefix.length))
  } catch {
    return ''
  }
}

function attach(middlewares) {
  middlewares.use(async (req, res, next) => {
    const pathname = req.url?.split('?')[0]
    if (pathname !== '/api/reports' && !pathname?.startsWith('/api/reports/')) return next()
    try {
      if (req.method === 'GET' && pathname === '/api/reports') {
        send(res, 200, await listReports())
        return
      }
      if (req.method === 'PUT') {
        const id = reportId(pathname)
        const raw = await readBody(req, 1024 * 1024)
        const payload = JSON.parse(raw.toString('utf8') || '{}')
        send(res, 200, await saveReport(normalizeReport(payload, id)))
        return
      }
      if (req.method === 'DELETE') {
        await deleteReport(reportId(pathname))
        send(res, 200, { ok: true })
        return
      }
      send(res, 405, { error: 'Method not allowed.' })
    } catch (error) {
      const status = error.status || (error instanceof SyntaxError ? 400 : 500)
      send(res, status, {
        error: error instanceof Error ? error.message : 'Could not save this report.',
      })
    }
  })
}

export function reportsApi(env) {
  configureReports(env)
  return {
    name: 'zeta-reports-api',
    configureServer(server) {
      attach(server.middlewares)
    },
    configurePreviewServer(server) {
      attach(server.middlewares)
    },
  }
}
