import os from 'os'
import path from 'path'

const HOME = os.homedir()

export const SHARED_SKILLS_DIR = path.join(HOME, '.agents', 'skills')
export const LOCK_FILE_PATH = path.join(HOME, '.agents', '.skill-lock.json')
export const CACHE_FILE_PATH = path.join(HOME, '.agents', '.skillpilot-cache.json')
export const LOCK_FILE_VERSION = 3

export const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com'
export const GITHUB_API_BASE = 'https://api.github.com'

export const SKILLS_SH_BASE = 'https://skills.sh'

export const FILE_WATCHER_DEBOUNCE_MS = 500
export const REGISTRY_CACHE_TTL_MS = 5 * 60 * 1000
export const CONTENT_CACHE_TTL_MS = 10 * 60 * 1000
