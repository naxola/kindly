/**
 * A readable device name from a User-Agent ("Chrome on Windows"). Plain patterns, no library: it
 * only labels a session in a list, so a wrong guess costs nothing.
 */
export function describeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return ''
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\/|Opera/.test(userAgent)
      ? 'Opera'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\/|CriOS/.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : null
  const system = /Windows/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : /iPhone|iPad|iOS/.test(userAgent)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : null
  return [browser, system].filter(Boolean).join(' · ')
}
