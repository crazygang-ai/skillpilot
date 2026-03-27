import fsPromises from 'fs/promises'
import path from 'path'

export interface ResolvedLocalSkillImport {
  resolvedInputPath: string
  realPath: string
  directoryName: string
  skillMdPath: string
}

async function pathExists(p: string): Promise<boolean> {
  try { await fsPromises.access(p); return true } catch { return false }
}

export async function resolveLocalSkillImport(localPath: string): Promise<ResolvedLocalSkillImport> {
  const resolvedInputPath = path.resolve(localPath)

  if (!(await pathExists(resolvedInputPath))) {
    throw new Error(`Local skill path does not exist: ${resolvedInputPath}`)
  }

  const realPath = await fsPromises.realpath(resolvedInputPath)
  const stat = await fsPromises.stat(realPath)
  if (!stat.isDirectory()) {
    throw new Error(`Local skill path must be a directory: ${realPath}`)
  }

  const skillMdPath = path.join(realPath, 'SKILL.md')
  if (!(await pathExists(skillMdPath))) {
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

export async function copyDirectoryWithoutSymlinks(src: string, dest: string): Promise<void> {
  try {
    await copyDirectoryWithoutSymlinksImpl(src, dest)
  } catch (error) {
    if (await pathExists(dest)) {
      await fsPromises.rm(dest, { recursive: true, force: true })
    }
    throw error
  }
}

async function copyDirectoryWithoutSymlinksImpl(src: string, dest: string): Promise<void> {
  await fsPromises.mkdir(dest, { recursive: true })

  for (const entry of await fsPromises.readdir(src)) {
    const srcPath = path.join(src, entry)
    const destPath = path.join(dest, entry)
    const stat = await fsPromises.lstat(srcPath)

    if (stat.isSymbolicLink()) {
      throw new Error(`Local skill import does not allow symlinks: ${srcPath}`)
    }

    if (stat.isDirectory()) {
      await copyDirectoryWithoutSymlinksImpl(srcPath, destPath)
      continue
    }

    if (stat.isFile()) {
      await fsPromises.copyFile(srcPath, destPath)
    }
  }
}
