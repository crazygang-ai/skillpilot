import fs from 'fs'
import path from 'path'

export interface ResolvedLocalSkillImport {
  resolvedInputPath: string
  realPath: string
  directoryName: string
  skillMdPath: string
}

export function resolveLocalSkillImport(localPath: string): ResolvedLocalSkillImport {
  const resolvedInputPath = path.resolve(localPath)

  if (!fs.existsSync(resolvedInputPath)) {
    throw new Error(`Local skill path does not exist: ${resolvedInputPath}`)
  }

  const realPath = fs.realpathSync(resolvedInputPath)
  const stat = fs.statSync(realPath)
  if (!stat.isDirectory()) {
    throw new Error(`Local skill path must be a directory: ${realPath}`)
  }

  const skillMdPath = path.join(realPath, 'SKILL.md')
  if (!fs.existsSync(skillMdPath)) {
    throw new Error(`Local skill directory must contain SKILL.md: ${realPath}`)
  }

  const directoryName = path.basename(realPath)
  if (!directoryName || directoryName === '.' || directoryName === '..') {
    throw new Error(`Invalid skill directory name: ${realPath}`)
  }

  return {
    resolvedInputPath,
    realPath,
    directoryName,
    skillMdPath,
  }
}

export function copyDirectoryWithoutSymlinks(src: string, dest: string): void {
  try {
    copyDirectoryWithoutSymlinksImpl(src, dest)
  } catch (error) {
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true })
    }
    throw error
  }
}

function copyDirectoryWithoutSymlinksImpl(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true })

  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry)
    const destPath = path.join(dest, entry)
    const stat = fs.lstatSync(srcPath)

    if (stat.isSymbolicLink()) {
      throw new Error(`Local skill import does not allow symlinks: ${srcPath}`)
    }

    if (stat.isDirectory()) {
      copyDirectoryWithoutSymlinksImpl(srcPath, destPath)
      continue
    }

    if (stat.isFile()) {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}
