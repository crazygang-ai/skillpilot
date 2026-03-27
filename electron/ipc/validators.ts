import os from 'os'
import path from 'path'
import {
  AgentType,
  type InstallInput,
  type ProxySettings,
  type RemoveLocalInstallationInput,
  type SetProxySettingsInput,
  type SkillMetadata,
} from '../../shared/types'

const VALID_AGENT_TYPES = new Set(Object.values(AgentType))
const VALID_PROXY_TYPES = new Set(['https', 'socks5'])
const OWNER_REPO_RE = /^[\w.-]+\/[\w.-]+$/
const HOME = os.homedir()
const ALLOWED_PATH_ROOTS = [
  path.join(HOME, '.agents'),
  path.join(HOME, '.claude'),
  path.join(HOME, '.codex'),
  path.join(HOME, '.gemini'),
  path.join(HOME, '.copilot'),
  path.join(HOME, '.config', 'opencode'),
  path.join(HOME, '.cursor'),
  path.join(HOME, '.kiro'),
  path.join(HOME, '.codebuddy'),
  path.join(HOME, '.openclaw'),
  path.join(HOME, '.trae'),
]

function assertPlainObject(
  value: unknown,
  name: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`)
  }
}

export function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`)
  }
}

export function assertValidAgentType(value: unknown): asserts value is AgentType {
  if (typeof value !== 'string' || !VALID_AGENT_TYPES.has(value as AgentType)) {
    throw new Error(`Invalid agent type: ${String(value)}`)
  }
}

export function assertValidAgentTypes(values: unknown): asserts values is AgentType[] {
  if (!Array.isArray(values)) {
    throw new Error('agentTypes must be an array')
  }

  for (const value of values) {
    assertValidAgentType(value)
  }
}

export function assertAllowedPath(filePath: unknown): asserts filePath is string {
  if (typeof filePath !== 'string') {
    throw new Error('Path must be a string')
  }

  const resolved = path.resolve(filePath)
  if (!ALLOWED_PATH_ROOTS.some((root) => resolved.startsWith(root + path.sep) || resolved === root)) {
    throw new Error(`Path outside allowed directories: ${resolved}`)
  }
}

export function assertValidSource(source: unknown): asserts source is string {
  assertString(source, 'source')
  if (!OWNER_REPO_RE.test(source)) {
    throw new Error(`Invalid source format (expected owner/repo): ${String(source)}`)
  }
}

export function validateInstallInput(input: unknown): InstallInput {
  assertPlainObject(input, 'install input')

  const { repoUrl, agentTypes, source, skillId } = input
  assertString(repoUrl, 'repoUrl')
  assertValidAgentTypes(agentTypes)

  if (source !== 'github' && source !== 'local') {
    throw new Error(`Invalid install source: ${String(source)}`)
  }

  if (skillId !== undefined) {
    assertString(skillId, 'skillId')
  }

  return {
    repoUrl,
    agentTypes,
    source,
    ...(skillId ? { skillId } : {}),
  }
}

export function validateInstallFromLocalArgs(localPath: unknown, agentTypes: unknown): {
  localPath: string
  agentTypes: AgentType[]
} {
  assertString(localPath, 'localPath')
  assertValidAgentTypes(agentTypes)

  return { localPath, agentTypes }
}

export function validateRemoveLocalInstallationInput(
  input: unknown,
): RemoveLocalInstallationInput {
  assertPlainObject(input, 'remove local installation input')

  const { skillId, agentType } = input
  assertString(skillId, 'skillId')
  assertValidAgentType(agentType)

  return { skillId, agentType }
}

function validateSkillMetadata(metadata: unknown): SkillMetadata {
  assertPlainObject(metadata, 'metadata')

  const { name, description, license, author, version, allowedTools } = metadata

  assertString(name, 'metadata.name')
  assertString(description, 'metadata.description')

  for (const [field, value] of Object.entries({
    license,
    author,
    version,
    allowedTools,
  })) {
    if (value !== undefined && typeof value !== 'string') {
      throw new Error(`metadata.${field} must be a string`)
    }
  }

  const normalizedLicense = typeof license === 'string' ? license : undefined
  const normalizedAuthor = typeof author === 'string' ? author : undefined
  const normalizedVersion = typeof version === 'string' ? version : undefined
  const normalizedAllowedTools = typeof allowedTools === 'string' ? allowedTools : undefined

  return {
    name,
    description,
    ...(normalizedLicense !== undefined ? { license: normalizedLicense } : {}),
    ...(normalizedAuthor !== undefined ? { author: normalizedAuthor } : {}),
    ...(normalizedVersion !== undefined ? { version: normalizedVersion } : {}),
    ...(normalizedAllowedTools !== undefined ? { allowedTools: normalizedAllowedTools } : {}),
  }
}

export function validateSkillSaveArgs(
  skillId: unknown,
  metadata: unknown,
  body: unknown,
): {
  skillId: string
  metadata: SkillMetadata
  body: string
} {
  assertString(skillId, 'skillId')
  if (typeof body !== 'string') {
    throw new Error('body must be a string')
  }

  return {
    skillId,
    metadata: validateSkillMetadata(metadata),
    body,
  }
}

export function validateContentFetchArgs(source: unknown, skillId: unknown): {
  source: string
  skillId: string
} {
  assertValidSource(source)
  assertString(skillId, 'skillId')
  return { source, skillId }
}

export function validateProxySettings(settings: unknown): ProxySettings {
  assertPlainObject(settings, 'proxy settings')

  const { isEnabled, type, host, port, username, bypassList } = settings

  if (typeof isEnabled !== 'boolean') {
    throw new Error('proxy settings.isEnabled must be a boolean')
  }

  if (typeof type !== 'string' || !VALID_PROXY_TYPES.has(type)) {
    throw new Error(`Invalid proxy type: ${String(type)}`)
  }

  if (typeof host !== 'string') {
    throw new Error('proxy settings.host must be a string')
  }

  if (typeof port !== 'number' || !Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('proxy settings.port must be an integer between 0 and 65535')
  }

  if (username !== undefined && typeof username !== 'string') {
    throw new Error('proxy settings.username must be a string')
  }

  if (!Array.isArray(bypassList) || bypassList.some((value) => typeof value !== 'string')) {
    throw new Error('proxy settings.bypassList must be an array of strings')
  }

  const normalizedHost = host.trim()
  if (isEnabled && normalizedHost.length === 0) {
    throw new Error('proxy settings.host must be provided when proxy is enabled')
  }

  if (isEnabled && port === 0) {
    throw new Error('proxy settings.port must be provided when proxy is enabled')
  }

  return {
    isEnabled,
    type: type as ProxySettings['type'],
    host: normalizedHost,
    port,
    ...(username ? { username } : {}),
    bypassList: bypassList.map((value) => value.trim()).filter(Boolean),
  }
}

export function validateSetProxySettingsInput(input: unknown): SetProxySettingsInput {
  assertPlainObject(input, 'set proxy settings input')

  const { proxy, password } = input
  const validatedProxy = validateProxySettings(proxy)

  if (password !== undefined && typeof password !== 'string') {
    throw new Error('password must be a string when provided')
  }

  return {
    proxy: validatedProxy,
    ...(password !== undefined ? { password } : {}),
  }
}
