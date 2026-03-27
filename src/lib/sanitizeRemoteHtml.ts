import DOMPurify from 'dompurify'

const ALLOWED_TAGS = [
  'p',
  'a',
  'ul',
  'ol',
  'li',
  'pre',
  'code',
  'blockquote',
  'strong',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'img',
  'hr',
  'br',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
]

const ALLOWED_ATTR = [
  'href',
  'src',
  'alt',
  'title',
  'target',
  'rel',
]

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])
const URL_ATTRS = ['href', 'src']

function isSafeUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false

  if (
    trimmed.startsWith('#') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../')
  ) {
    return true
  }

  try {
    const parsed = new URL(trimmed, 'https://skillpilot.local')
    return SAFE_PROTOCOLS.has(parsed.protocol.toLowerCase())
  } catch {
    return false
  }
}

export function sanitizeRemoteHtml(html: string): string {
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['style'],
    KEEP_CONTENT: true,
  })

  const template = document.createElement('template')
  template.innerHTML = sanitized

  for (const element of template.content.querySelectorAll<HTMLElement>('*')) {
    for (const attr of URL_ATTRS) {
      const value = element.getAttribute(attr)
      if (value && !isSafeUrl(value)) {
        element.removeAttribute(attr)
      }
    }

    if (element.tagName === 'A' && element.getAttribute('href')) {
      element.setAttribute('rel', 'noopener noreferrer')
    }

    if (element.tagName === 'IMG' && !element.getAttribute('alt')) {
      element.setAttribute('alt', '')
    }
  }

  return template.innerHTML
}
