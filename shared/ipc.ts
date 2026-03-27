// IPC Channel Constants

export const IPC_CHANNELS = {
  AGENT: {
    DETECT: 'agent:detect',
  },
  SKILL: {
    SCAN_ALL: 'skill:scanAll',
    ASSIGN: 'skill:assign',
    UNASSIGN: 'skill:unassign',
    REMOVE_LOCAL_INSTALLATION: 'skill:removeLocalInstallation',
    DELETE: 'skill:delete',
    INSTALL: 'skill:install',
    INSTALL_FROM_LOCAL: 'skill:installFromLocal',
    SAVE: 'skill:save',
    CHECK_UPDATE: 'skill:checkUpdate',
    CHECK_ALL_UPDATES: 'skill:checkAllUpdates',
    UPDATE_SKILL: 'skill:updateSkill',
  },
  REGISTRY: {
    LEADERBOARD: 'registry:leaderboard',
    SEARCH: 'registry:search',
  },
  CONTENT: {
    FETCH: 'content:fetch',
  },
  FS: {
    REVEAL_IN_FINDER: 'fs:revealInFinder',
  },
  DIALOG: {
    OPEN_DIRECTORY: 'dialog:openDirectory',
  },
  SETTINGS: {
    GET_PROXY: 'settings:getProxy',
    SET_PROXY: 'settings:setProxy',
  },
  UPDATER: {
    GET_STATE: 'updater:getState',
    GET_VERSION: 'updater:getCurrentVersion',
    CHECK_FOR_UPDATES: 'updater:checkForUpdates',
    DOWNLOAD_UPDATE: 'updater:downloadUpdate',
    QUIT_AND_INSTALL: 'updater:quitAndInstall',
    ON_STATE_CHANGED: 'updater:onStateChanged',
  },
  WATCHER: {
    ON_CHANGE: 'watcher:onChange',
  },
} as const
