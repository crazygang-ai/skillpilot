import { RefreshCw, Download, RotateCcw, Loader2 } from 'lucide-react'
import { useUpdateStore } from '@/stores/updateStore'

export default function AboutPanel() {
  const { currentVersion, status, info, progress, autoDownload, checkForUpdates, downloadUpdate, quitAndInstall, setAutoDownload } = useUpdateStore()

  return (
    <div className="space-y-6">
      {/* App info */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-accent/20 flex items-center justify-center text-accent text-2xl font-bold">
          SP
        </div>
        <div>
          <h3 className="text-lg font-semibold text-text-primary">SkillPilot</h3>
          <p className="text-sm text-text-muted">v{currentVersion}</p>
        </div>
      </div>

      {/* Update section */}
      <div className="space-y-3">
        {status === 'idle' || status === 'not-available' ? (
          <button
            onClick={() => checkForUpdates()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-bg-tertiary border border-border rounded-lg text-text-primary hover:border-border-light"
          >
            <RefreshCw className="w-4 h-4" />
            Check for Updates
          </button>
        ) : status === 'checking' ? (
          <button disabled className="flex items-center gap-2 px-4 py-2 text-sm text-text-muted bg-bg-tertiary border border-border rounded-lg">
            <Loader2 className="w-4 h-4 animate-spin" />
            Checking...
          </button>
        ) : status === 'available' ? (
          <div className="space-y-2">
            <p className="text-sm text-text-secondary">
              New version <span className="text-accent font-medium">v{info?.version}</span> is available.
            </p>
            <button
              onClick={() => downloadUpdate()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-lg"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
          </div>
        ) : status === 'downloading' ? (
          <div className="space-y-2">
            <p className="text-sm text-text-secondary">Downloading update...</p>
            <div className="h-2 bg-bg-tertiary rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all"
                style={{ width: `${progress?.percent ?? 0}%` }}
              />
            </div>
            <p className="text-xs text-text-muted">{Math.round(progress?.percent ?? 0)}%</p>
          </div>
        ) : status === 'downloaded' ? (
          <button
            onClick={() => quitAndInstall()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-success hover:bg-success/90 text-white rounded-lg"
          >
            <RotateCcw className="w-4 h-4" />
            Restart & Install
          </button>
        ) : status === 'error' ? (
          <p className="text-sm text-error">Update check failed. Please try again.</p>
        ) : null}
      </div>

      {/* Auto-download toggle */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={autoDownload}
          onChange={(e) => setAutoDownload(e.target.checked)}
          className="w-4 h-4 rounded accent-accent"
        />
        <span className="text-sm text-text-primary">Auto-download updates</span>
      </label>
    </div>
  )
}
