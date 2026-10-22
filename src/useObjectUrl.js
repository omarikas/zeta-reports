import { useEffect, useState } from 'react'

export function useObjectUrl(blob) {
  const [entry, setEntry] = useState(null)

  useEffect(() => {
    if (!blob) return undefined
    const url = URL.createObjectURL(blob)
    // Publishing a browser-owned object URL into React state is the point of this effect.
    // oxlint-disable-next-line react/set-state-in-effect
    setEntry({ blob, url })
    return () => URL.revokeObjectURL(url)
  }, [blob])

  return entry && entry.blob === blob ? entry.url : null
}
