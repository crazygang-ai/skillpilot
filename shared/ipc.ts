// IPC Channel Constants

export const IPC_CHANNELS = {
  AGENT: {
    DETECT: 'agent:detect',
  },
  SKILL: {
    SCAN_ALL: 'skill:scanAll',
    ASSIGN: 'skill:assign',
    UNASSIGN: 'skill:unassign',
    DELETE: 'skill:delete',
    INSTALL: 'skill:install',
    INSTALL_FROM_LOCAL: 'skill:installFromLocal',
    SAVE: 'skill:save',
    CHECK_UPDATE: 'skill:checkUpdate',
    CHECK_ALL_UPDATES: 'skill:checkAllUpdates',
    UPDATE_SKILL: 'skill:updateSkill',
    EXPORT_TO_DESKTOP: 'fs:exportToDesktop',
  },
  REGISTRY: {
    LEADERBOARD: 'registry:leaderboard',
    SEARCH: 'registry:search',
  },
  CLAWHUB: {
    SEARCH: 'clawhub:search',
    DETAIL: 'clawhub:detail',
    CONTENT: 'clawhub:content',
  },
  CONTENT: {
    FETCH: 'content:fetch',
  },
  FS: {
    REVEAL_IN_FINDER: 'fs:revealInFinder',
    EXPORT_TO_DESKTOP: 'fs:exportToDesktop',
  },
  DIALOG: {
    OPEN_FILE_OR_FOLDER: 'dialog:openFileOrFolder',
  },
  SETTINGS: {
    GET_PROXY: 'settings:getProxy',
    SET_PROXY: 'settings:setProxy',
  },
  UPDATER: {
    CHECK: 'updater:checkForUpdates',
    DOWNLOAD: 'updater:downloadUpdate',
    QUIT_AND_INSTALL: 'updater:quitAndInstall',
    GET_VERSION: 'updater:getCurrentVersion',
    SET_AUTO_DOWNLOAD: 'updater:setAutoDownload',
    STATUS: 'updater:status',
  },
  WATCHER: {
    ON_CHANGE: 'watcher:onChange',
  },
} as const
