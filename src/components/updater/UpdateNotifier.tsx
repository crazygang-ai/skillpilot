import { Download, RotateCcw } from 'lucide-react'
import { useUpdateStore } from '@/stores/updateStore'

export default function UpdateNotifier() {
  const { status, info, downloadUpdate, quitAndInstall } = useUpdateStore()

  if (status !== 'available' && status !== 'downloaded') return null

  return (
    <div className="mx-2 mb-2 px-3 py-2 bg-bg-tertiary border border-border rounded-lg flex items-center justify-between gap-2">
      <span className="text-xs text-text-secondary truncate">
        v{info?.version} available
      </span>
      {status === 'available' ? (
        <button
          onClick={() => downloadUpdate()}
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-accent hover:bg-accent-hover text-white rounded-md shrink-0"
        >
          <Download className="w-3 h-3" />
          Download
        </button>
      ) : (
        <button
          onClick={() => quitAndInstall()}
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-success hover:bg-success/90 text-white rounded-md shrink-0"
        >
          <RotateCcw className="w-3 h-3" />
          Restart
        </button>
      )}
    </div>
  )
}
