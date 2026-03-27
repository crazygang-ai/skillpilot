import { useTranslation } from 'react-i18next'
import type { SkillMetadata } from '@/types'

interface MetadataFormProps {
  metadata: SkillMetadata
  onChange: (metadata: SkillMetadata) => void
}

const fields: { key: keyof SkillMetadata; i18nKey: string; placeholder: string }[] = [
  { key: 'name', i18nKey: 'editor.name', placeholder: 'skill-name' },
  { key: 'description', i18nKey: 'editor.description', placeholder: 'A brief description of this skill' },
  { key: 'author', i18nKey: 'editor.author', placeholder: 'your-name' },
  { key: 'version', i18nKey: 'editor.version', placeholder: '1.0.0' },
  { key: 'license', i18nKey: 'editor.license', placeholder: 'MIT' },
  { key: 'allowedTools', i18nKey: 'editor.allowedTools', placeholder: 'Bash(git*), Read, Write' },
]

const inputClassName =
  'w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors'

export default function MetadataForm({ metadata, onChange }: MetadataFormProps) {
  const { t } = useTranslation()

  function handleChange(key: keyof SkillMetadata, value: string) {
    onChange({ ...metadata, [key]: value || undefined })
  }

  return (
    <div className="space-y-4">
      {fields.map(({ key, i18nKey, placeholder }) => (
        <div key={key} className="space-y-1.5">
          <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide">
            {t(i18nKey)}
          </label>
          {key === 'description' ? (
            <textarea
              className={`${inputClassName} min-h-[72px] resize-y`}
              value={metadata[key] ?? ''}
              placeholder={placeholder}
              onChange={(e) => handleChange(key, e.target.value)}
            />
          ) : (
            <input
              type="text"
              className={inputClassName}
              value={metadata[key] ?? ''}
              placeholder={placeholder}
              onChange={(e) => handleChange(key, e.target.value)}
            />
          )}
        </div>
      ))}
    </div>
  )
}
