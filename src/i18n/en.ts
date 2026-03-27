const en = {
  // Common
  common: {
    loading: 'Loading...',
    cancel: 'Cancel',
    install: 'Install',
    installing: 'Installing...',
    refresh: 'Refresh',
    save: 'Save',
    delete: 'Delete',
    confirm: 'Confirm',
    search: 'Search',
  },

  // Sidebar
  sidebar: {
    dashboard: 'Dashboard',
    skillsSh: 'skills.sh',
    settings: 'Settings',
    allAgents: 'All Agents',
    checkAllUpdates: 'Check all skill updates',
    refresh: 'Refresh agents & skills',
  },

  // Skill list
  skillList: {
    searchPlaceholder: 'Search skills...',
    filterAll: 'All',
    filterUser: 'User',
    filterBuiltin: 'Builtin',
    noSkills: 'No skills found',
    noMatch: 'No skills match your search',
    skillCount: '{{count}} skill',
    skillCount_other: '{{count}} skills',
  },

  // Skill detail
  skillDetail: {
    emptyState: 'Select a skill to view details',
    assignToAgents: 'Assign to Agents',
    documentation: 'Documentation',
    noDocumentation: 'No SKILL.md documentation found for this skill',
    copyPath: 'Copy path',
    revealInFinder: 'Reveal in Finder',
    edit: 'Edit',
    delete: 'Delete',
    checkUpdate: 'Check for Update',
    update: 'Update',
    updateAvailable: 'Update available',
  },

  // Install
  install: {
    fromGit: 'From Git',
    fromLocal: 'From Local File',
    installTo: 'Install to',
    noAgentsDetected: 'No AI assistants detected',
    repoUrl: 'Repository URL',
    importSuccess: 'Successfully imported {{count}} skill(s)',
    importFailed: 'Import failed: {{error}}',
  },

  // Registry (skills.sh)
  registry: {
    allTime: 'All Time',
    trending: 'Trending',
    hot: 'Hot',
    installs: 'installs',
    searchPlaceholder: 'Search skills.sh...',
    noSkillsFound: 'No skills found',
    installToAgents: 'Install to Agents',
  },

  // Editor
  editor: {
    title: 'Skill Editor',
    metadata: 'Metadata',
    preview: 'Preview',
    name: 'Name',
    description: 'Description',
    license: 'License',
    author: 'Author',
    version: 'Version',
    allowedTools: 'Allowed Tools',
  },

  // Settings
  settings: {
    title: 'Settings',
    about: 'About',
    language: 'Language',
    proxy: 'Proxy',
    appVersion: 'Version',
    checkForUpdates: 'Check for Updates',
    proxyEnabled: 'Enable Proxy',
    proxyType: 'Proxy Type',
    proxyHost: 'Host',
    proxyPort: 'Port',
    proxyUsername: 'Username',
    proxyPassword: 'Password',
    proxyBypass: 'Bypass List',
  },
} as const

export default en
