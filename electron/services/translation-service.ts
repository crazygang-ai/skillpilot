// TranslationService — Conditional Apple Translation API integration
// macOS 26+ only, provides English-to-Chinese translation

export async function translate(text: string, _from = 'en', _to = 'zh'): Promise<string> {
  // Apple Translation framework is available via native modules on macOS 26+
  // For now, return the original text as a no-op stub
  // TODO: Implement via Electron native module when macOS 26+ is targeted
  return text
}

export function isAvailable(): boolean {
  // Check if macOS version supports Translation framework
  const release = process.getBuiltinModule?.('os')?.release?.() ?? ''
  const majorVersion = parseInt(release.split('.')[0], 10)
  // macOS 26 corresponds to Darwin 27.x
  return majorVersion >= 27
}
