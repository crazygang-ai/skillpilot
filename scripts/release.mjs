#!/usr/bin/env node

/**
 * Release script — runs local checks, bumps version, commits, tags, and pushes.
 *
 * Usage:
 *   pnpm release patch    # 0.2.0 → 0.2.1
 *   pnpm release minor    # 0.2.0 → 0.3.0
 *   pnpm release major    # 0.2.0 → 1.0.0
 *   pnpm release 1.2.3    # explicit version
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const PKG_PATH = resolve(import.meta.dirname, '../package.json')

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`)
  return execSync(cmd, { stdio: 'inherit', ...opts })
}

function runCapture(cmd) {
  return execSync(cmd, { encoding: 'utf-8' }).trim()
}

function readPkg() {
  return JSON.parse(readFileSync(PKG_PATH, 'utf-8'))
}

function writePkg(pkg) {
  writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n')
}

function bumpVersion(current, bump) {
  const [major, minor, patch] = current.split('.').map(Number)
  switch (bump) {
    case 'patch': return `${major}.${minor}.${patch + 1}`
    case 'minor': return `${major}.${minor + 1}.0`
    case 'major': return `${major + 1}.0.0`
    default:
      if (/^\d+\.\d+\.\d+$/.test(bump)) return bump
      throw new Error(`Invalid version bump: "${bump}". Use patch, minor, major, or x.y.z`)
  }
}

function rollback(pkg, oldVersion, tag) {
  console.error('\n  ✗ Release failed, rolling back...\n')
  pkg.version = oldVersion
  writePkg(pkg)
  try { execSync(`git tag -d ${tag}`, { stdio: 'ignore' }) } catch { /* tag might not exist */ }
  try { execSync('git checkout -- package.json', { stdio: 'ignore' }) } catch { /* best effort */ }
}

// ── Argument check ──

const bump = process.argv[2]
if (!bump) {
  console.error('Usage: pnpm release <patch|minor|major|x.y.z>')
  process.exit(1)
}

// ── Pre-flight checks ──

console.log('\n  Pre-flight checks\n')

const status = runCapture('git status --porcelain')
if (status) {
  console.error('  ✗ Working directory is not clean. Commit or stash changes first.\n')
  console.error(status)
  process.exit(1)
}
console.log('  ✓ Working directory clean')

const branch = runCapture('git rev-parse --abbrev-ref HEAD')
if (branch !== 'main') {
  console.error(`  ✗ Must be on main branch (currently on "${branch}")`)
  process.exit(1)
}
console.log('  ✓ On main branch')

try {
  execSync('git fetch origin main --quiet', { stdio: 'ignore' })
  const behind = runCapture('git rev-list HEAD..origin/main --count')
  if (behind !== '0') {
    console.error(`  ✗ Local main is ${behind} commit(s) behind origin. Run: git pull`)
    process.exit(1)
  }
} catch {
  console.warn('  ⚠ Could not check remote (offline?), continuing anyway')
}
console.log('  ✓ Up to date with origin/main')

// ── Local verification (typecheck + test) ──

console.log('\n  Running local verification\n')

try {
  run('pnpm typecheck')
} catch {
  console.error('\n  ✗ Typecheck failed. Fix errors before releasing.')
  process.exit(1)
}
console.log('  ✓ Typecheck passed')

try {
  run('pnpm run preload:build', { stdio: 'ignore' })
  run('pnpm exec tsc -p tsconfig.electron.json', { stdio: 'ignore' })
  run('pnpm test')
} catch {
  console.error('\n  ✗ Tests failed. Fix errors before releasing.')
  process.exit(1)
}
console.log('  ✓ Tests passed')

// ── Bump, commit, tag, push ──

const pkg = readPkg()
const oldVersion = pkg.version
const newVersion = bumpVersion(oldVersion, bump)
const tag = `v${newVersion}`

console.log(`\n  Version: ${oldVersion} → ${newVersion}\n`)

pkg.version = newVersion
writePkg(pkg)
console.log('  ✓ package.json updated')

try {
  run('git add package.json')
  run(`git commit -m "chore: release ${tag}"`)
  run(`git tag -a ${tag} -m "${tag}"`)
} catch (err) {
  rollback(pkg, oldVersion, tag)
  console.error('  ✗ Git commit/tag failed:', err.message)
  process.exit(1)
}

try {
  run('git push origin main')
  run(`git push origin ${tag}`)
} catch (err) {
  console.error(`\n  ✗ Push failed: ${err.message}`)
  console.error(`  Local commit and tag (${tag}) are created but NOT pushed.`)
  console.error('  Fix the issue and run:')
  console.error(`    git push origin main && git push origin ${tag}`)
  process.exit(1)
}

console.log(`
  ✓ Released ${tag}

  What happens next:
  1. CI runs typecheck + test + build (main push)
  2. Release workflow builds .dmg/.zip and creates draft release (tag push)
  3. Go to https://github.com/CrazyGang97/skillpilot/releases
     → Edit draft → Write release notes → Publish
`)
