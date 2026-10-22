import { useState } from 'react'
import { useObjectUrl } from '../useObjectUrl'

export function MediaFrame({ blob, src, kind, label = '', className, controls = false }) {
  const objectUrl = useObjectUrl(blob)
  const url = src || objectUrl
  const sourceKey = src || blob || null
  const [failedSource, setFailedSource] = useState(null)
  const failed = failedSource === sourceKey && sourceKey != null

  const fallback = (
    <span className={className ? `media-fallback ${className}` : 'media-fallback'}>
      {kind === 'video' ? 'Video' : 'Image'}
    </span>
  )

  let visual = fallback
  if (url && !failed) {
    if (kind === 'video') {
      visual = (
        <video
          className={className}
          src={url}
          controls={controls}
          muted={!controls}
          playsInline
          preload="metadata"
          aria-label={label || undefined}
          onError={() => setFailedSource(sourceKey)}
          onLoadedMetadata={
            controls
              ? undefined
              : (event) => {
                  const video = event.currentTarget
                  if (Number.isFinite(video.duration) && video.duration > 0) {
                    video.currentTime = Math.min(0.2, video.duration / 3)
                  }
                }
          }
        />
      )
    } else {
      visual = (
        <img className={className} src={url} alt={label} onError={() => setFailedSource(sourceKey)} />
      )
    }
  }

  if (kind === 'video' && !controls) {
    return (
      <span className="video-cover">
        {visual}
        <span className="video-badge">Video</span>
      </span>
    )
  }

  return visual
}
