import type { SkillMetadata } from '@/types'

interface MetadataFormProps {
  metadata: SkillMetadata
  onChange: (metadata: SkillMetadata) => void
}

const fields: { key: keyof SkillMetadata; label: string; placeholder: string }[] = [
  { key: 'name', label: 'Name', placeholder: 'skill-name' },
  { key: 'description', label: 'Description', placeholder: 'A brief description of this skill' },
  { key: 'author', label: 'Author', placeholder: 'your-name' },
  { key: 'version', label: 'Version', placeholder: '1.0.0' },
  { key: 'license', label: 'License', placeholder: 'MIT' },
  { key: 'allowedTools', label: 'Allowed Tools', placeholder: 'Bash(git*), Read, Write' },
]

const inputClassName =
  'w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors'

export default function MetadataForm({ metadata, onChange }: MetadataFormProps) {
  function handleChange(key: keyof SkillMetadata, value: string) {
    onChange({ ...metadata, [key]: value || undefined })
  }

  return (
    <div className="space-y-4">
      {fields.map(({ key, label, placeholder }) => (
        <div key={key} className="space-y-1.5">
          <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide">
            {label}
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
