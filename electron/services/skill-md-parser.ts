import yaml from 'js-yaml'
import fs from 'fs'
import { SkillMetadata } from '../../shared/types'

export interface ParseResult {
  metadata: SkillMetadata
  markdownBody: string
}

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

export function parse(content: string): ParseResult {
  const match = content.match(FRONTMATTER_REGEX)
  if (!match) {
    return {
      metadata: extractFromMarkdown(content),
      markdownBody: content,
    }
  }

  const yamlStr = match[1]
  const markdownBody = match[2].trim()

  try {
    const raw = yaml.load(yamlStr, { schema: yaml.JSON_SCHEMA }) as Record<string, unknown> | null
    if (!raw || typeof raw !== 'object') {
      return { metadata: extractFromMarkdown(content), markdownBody: content }
    }

    const metadata: SkillMetadata = {
      name: String(raw.name ?? ''),
      description: String(raw.description ?? ''),
      license: raw.license ? String(raw.license) : undefined,
      author: extractNested(raw, 'metadata', 'author') ?? (raw.author ? String(raw.author) : undefined),
      version: extractNested(raw, 'metadata', 'version') ?? (raw.version ? String(raw.version) : undefined),
      allowedTools: raw['allowed-tools'] ? String(raw['allowed-tools']) : undefined,
    }

    return { metadata, markdownBody }
  } catch {
    return { metadata: extractFromMarkdown(content), markdownBody: content }
  }
}

export function parseFile(filePath: string): ParseResult {
  const content = fs.readFileSync(filePath, 'utf-8')
  return parse(content)
}

export function serialize(metadata: SkillMetadata, markdownBody: string): string {
  const frontmatter: Record<string, unknown> = {}
  if (metadata.name) frontmatter.name = metadata.name
  if (metadata.description) frontmatter.description = metadata.description
  if (metadata.license) frontmatter.license = metadata.license
  if (metadata.allowedTools) frontmatter['allowed-tools'] = metadata.allowedTools

  const nested: Record<string, string> = {}
  if (metadata.author) nested.author = metadata.author
  if (metadata.version) nested.version = metadata.version
  if (Object.keys(nested).length > 0) {
    frontmatter.metadata = nested
  }

  const yamlStr = yaml.dump(frontmatter, { lineWidth: -1, noRefs: true }).trim()
  return `---\n${yamlStr}\n---\n\n${markdownBody}\n`
}

function extractNested(raw: Record<string, unknown>, parent: string, key: string): string | undefined {
  const p = raw[parent]
  if (p && typeof p === 'object' && !Array.isArray(p)) {
    const val = (p as Record<string, unknown>)[key]
    return val !== undefined ? String(val) : undefined
  }
  return undefined
}

function extractFromMarkdown(content: string): SkillMetadata {
  const lines = content.split('\n')
  let name = ''
  let description = ''

  for (const line of lines) {
    const trimmed = line.trim()
    if (!name && trimmed.startsWith('# ')) {
      name = trimmed.slice(2).trim()
    } else if (name && !description && trimmed && !trimmed.startsWith('#')) {
      description = trimmed
      break
    }
  }

  return { name, description }
}
