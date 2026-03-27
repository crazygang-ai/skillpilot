// KeychainService — macOS Keychain integration via keytar
// Stores proxy passwords securely

const SERVICE_NAME = 'SkillPilot'

let keytarModule: typeof import('keytar') | null = null

async function getKeytar(): Promise<typeof import('keytar')> {
  if (!keytarModule) {
    keytarModule = await import('keytar')
  }
  return keytarModule
}

export async function setPassword(key: string, password: string): Promise<void> {
  try {
    const keytar = await getKeytar()
    await keytar.setPassword(SERVICE_NAME, key, password)
  } catch (err) {
    console.error('Keychain setPassword failed:', err)
    throw err instanceof Error ? err : new Error('Keychain setPassword failed')
  }
}

export async function getPassword(key: string): Promise<string | null> {
  try {
    const keytar = await getKeytar()
    return await keytar.getPassword(SERVICE_NAME, key)
  } catch (err) {
    console.error('Keychain getPassword failed:', err)
    return null
  }
}

export async function deletePassword(key: string): Promise<void> {
  try {
    const keytar = await getKeytar()
    await keytar.deletePassword(SERVICE_NAME, key)
  } catch (err) {
    console.error('Keychain deletePassword failed:', err)
    throw err instanceof Error ? err : new Error('Keychain deletePassword failed')
  }
}
