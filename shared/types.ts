// ============================================================
// SkillPilot — Shared Type Definitions
// ============================================================

// ---- Agent Types ----

export enum AgentType {
  CLAUDE = 'claude',
  CODEX = 'codex',
  GEMINI = 'gemini',
  COPILOT = 'copilot',
  OPENCODE = 'opencode',
  ANTIGRAVITY = 'antigravity',
  CURSOR = 'cursor',
  KIRO = 'kiro',
  CODEBUDDY = 'codebuddy',
  OPENCLAW = 'openclaw',
  TRAE = 'trae',
}

export interface Agent {
  type: AgentType
  displayName: string
  isInstalled: boolean
  configDirectoryExists: boolean
  skillsDirectoryExists: boolean
  skillCount: number
}

// ---- Skill Types ----

export type SkillScope =
  | { kind: 'sharedGlobal' }
  | { kind: 'agentLocal'; agentType: AgentType }
  | { kind: 'project'; projectPath: string }

export type SkillAgentStatus = 'linked' | 'installed' | 'builtin'

export interface SkillInstallation {
  agentType: AgentType
  path: string
  isSymlink: boolean
  isInherited: boolean
  inheritedFrom?: AgentType
}

export interface SkillMetadata {
  name: string
  description: string
  license?: string
  author?: string
  version?: string
  allowedTools?: string
}

export interface LockEntry {
  source: string          // e.g., "crossoverJie/skills"
  sourceType: string      // "github" | "local" | "clawhub"
  sourceUrl: string       // full git URL or local path
  skillPath: string       // relative path within repo
  skillFolderHash: string // git tree hash
  installedAt: string     // ISO 8601
  updatedAt: string       // ISO 8601
}

export interface LockFile {
  version: number         // currently 3
  skills: Record<string, LockEntry>
  dismissed?: Record<string, boolean>
  lastSelectedAgents?: string[]
}

export type SkillUpdateStatus = 'notChecked' | 'checking' | 'hasUpdate' | 'upToDate' | 'error'

export interface Skill {
  id: string                           // directory name (unique)
  canonicalPath: string                // real path after symlink resolution
  metadata: SkillMetadata
  markdownBody: string                 // content after YAML frontmatter
  scope: SkillScope
  installations: SkillInstallation[]
  lockEntry?: LockEntry
  hasUpdate: boolean
  updateStatus: SkillUpdateStatus
  remoteTreeHash?: string
  remoteCommitHash?: string
  localCommitHash?: string
}

// ---- Registry (skills.sh) ----

export interface RegistrySkill {
  id: string              // full path, e.g., "vercel-labs/agent-skills/react-best-practices"
  skillId: string         // basename
  name: string
  installs: number
  source: string          // repo owner/path
  installsYesterday?: number
  change?: number
}

export type LeaderboardCategory = 'allTime' | 'trending' | 'hot'

export interface LeaderboardResult {
  skills: RegistrySkill[]
  totalCount: number
}

// ---- ClawHub ----

export interface ClawHubSkill {
  slug: string
  displayName: string
  summary: string
  latestVersion?: string
  downloads: number
  stars: number
  versionCount?: number
  ownerHandle?: string
  ownerDisplayName?: string
  updatedAt?: string
  source: 'clawhub'
}

export interface ClawHubSkillDetail {
  skill: ClawHubSkill
  latestVersion?: string
  latestVersionCreatedAt?: string
  latestChangelog?: string
  license?: string
  moderationVerdict?: string
  moderationSummary?: string
}

// ---- Installation ----

export interface InstallInput {
  repoUrl: string
  agentTypes: AgentType[]
  source: 'github' | 'clawhub' | 'local'
  skillId?: string            // install only this specific skill from the repo
  slug?: string
  version?: string
}

export interface InstallResult {
  success: boolean
  error?: string
  skillCount?: number
  installedSkillIds?: string[]
}

// ---- Proxy ----

export type ProxyType = 'https' | 'socks5'

export interface ProxySettings {
  isEnabled: boolean
  type: ProxyType
  host: string
  port: number
  username?: string
  bypassList: string[]
}

// ---- App Update ----

export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface AppUpdateInfo {
  version?: string
  releaseNotes?: string
}

export interface AppUpdateProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

// ---- Views ----

export type ViewType = 'dashboard' | 'registry' | 'clawhub' | 'settings'
