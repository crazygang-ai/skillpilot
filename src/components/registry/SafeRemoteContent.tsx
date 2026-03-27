import MarkdownPreview from '@/components/editor/MarkdownPreview'
import { sanitizeRemoteHtml } from '@/lib/sanitizeRemoteHtml'

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/
const HTML_PREFIX = '<!-- HTML -->'

interface SafeRemoteContentProps {
  content?: string | null
  emptyMessage?: string
}

function renderEmptyState(message: string) {
  return (
    <p className="px-6 py-12 text-center text-sm text-text-muted">
      {message}
    </p>
  )
}

function stripFrontmatter(content: string): string {
  return content.replace(FRONTMATTER_RE, '').trim()
}

export default function SafeRemoteContent({
  content,
  emptyMessage = 'No documentation available',
}: SafeRemoteContentProps) {
  const normalizedContent = content?.trim() ?? ''

  if (!normalizedContent) {
    return renderEmptyState(emptyMessage)
  }

  if (normalizedContent.startsWith(HTML_PREFIX)) {
    const sanitizedHtml = sanitizeRemoteHtml(normalizedContent.slice(HTML_PREFIX.length))

    if (!sanitizedHtml.trim()) {
      return renderEmptyState(emptyMessage)
    }

    return (
      <div
        className="markdown-body p-6"
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    )
  }

  const markdownContent = stripFrontmatter(normalizedContent)
  if (!markdownContent) {
    return renderEmptyState(emptyMessage)
  }

  return <MarkdownPreview content={markdownContent} />
}
