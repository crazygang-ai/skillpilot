#!/usr/bin/env node

/**
 * Release script — bumps version, commits, tags, and pushes.
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

function run(cmd) {
  console.log(`  $ ${cmd}`)
  return execSync(cmd, { stdio: 'inherit' })
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

const bump = process.argv[2]
if (!bump) {
  console.error('Usage: pnpm release <patch|minor|major|x.y.z>')
  process.exit(1)
}

const status = execSync('git status --porcelain', { encoding: 'utf-8' }).trim()
if (status) {
  console.error('Error: working directory is not clean. Commit or stash changes first.\n')
  console.error(status)
  process.exit(1)
}

const pkg = readPkg()
const oldVersion = pkg.version
const newVersion = bumpVersion(oldVersion, bump)
const tag = `v${newVersion}`

console.log(`\n  ${oldVersion} → ${newVersion}\n`)

pkg.version = newVersion
writePkg(pkg)
console.log(`  ✓ package.json updated`)

run(`git add package.json`)
run(`git commit -m "chore: release ${tag}"`)
run(`git tag -a ${tag} -m "${tag}"`)
run(`git push origin main`)
run(`git push origin ${tag}`)

console.log(`
  ✓ Released ${tag}

  What happens next:
  1. CI runs on main push (typecheck + test + build)
  2. Release workflow runs on tag push (test + build:mac)
  3. Draft release created automatically with .dmg/.zip artifacts
  4. Go to https://github.com/CrazyGang97/skillpilot/releases
     → Edit draft → Add release notes → Publish
`)
