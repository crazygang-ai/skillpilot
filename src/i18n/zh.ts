const zh = {
  // Common
  common: {
    loading: '加载中...',
    cancel: '取消',
    install: '安装',
    installing: '安装中...',
    refresh: '刷新',
    save: '保存',
    delete: '删除',
    confirm: '确认',
    search: '搜索',
  },

  // Sidebar
  sidebar: {
    dashboard: '仪表盘',
    skillsSh: 'skills.sh',
    clawHub: 'ClawHub',
    settings: '设置',
    allAgents: '全部助手',
    checkAllUpdates: '检查所有技能更新',
    refresh: '刷新助手与技能',
  },

  // Skill list
  skillList: {
    searchPlaceholder: '搜索技能...',
    filterAll: '全部',
    filterUser: '用户',
    filterBuiltin: '内置',
    noSkills: '未找到技能',
    noMatch: '没有匹配的技能',
    skillCount: '{{count}} 个技能',
    skillCount_other: '{{count}} 个技能',
  },

  // Skill detail
  skillDetail: {
    emptyState: '选择一个技能查看详情',
    assignToAgents: '分配给助手',
    documentation: '文档',
    noDocumentation: '未找到此技能的 SKILL.md 文档',
    copyPath: '复制路径',
    revealInFinder: '在 Finder 中显示',
    edit: '编辑',
    delete: '删除',
    checkUpdate: '检查更新',
    update: '更新',
    updateAvailable: '有可用更新',
  },

  // Install
  install: {
    fromGit: '从 Git 导入',
    fromLocal: '从本地文件',
    installTo: '安装到',
    noAgentsDetected: '未检测到已安装的 AI 助手',
    repoUrl: '仓库地址',
    importSuccess: '成功导入 {{count}} 个技能',
    importFailed: '导入失败: {{error}}',
  },

  // Registry (skills.sh)
  registry: {
    allTime: '全部时间',
    trending: '趋势',
    hot: '热门',
    installs: '安装量',
    searchPlaceholder: '搜索 skills.sh...',
    noSkillsFound: '未找到技能',
    installToAgents: '安装到助手',
  },

  // ClawHub
  clawHub: {
    searchPlaceholder: '搜索 ClawHub...',
    downloads: '下载量',
    stars: '星标',
    relevance: '相关度',
    noSkillsFound: '未找到 "{{query}}" 相关技能',
    viewOnClawHub: '在 ClawHub 查看',
  },

  // Editor
  editor: {
    title: '技能编辑器',
    metadata: '元数据',
    preview: '预览',
    name: '名称',
    description: '描述',
    license: '许可证',
    author: '作者',
    version: '版本',
    allowedTools: '允许的工具',
  },

  // Settings
  settings: {
    title: '设置',
    about: '关于',
    language: '语言',
    proxy: '代理',
    appVersion: '版本',
    checkForUpdates: '检查更新',
    proxyEnabled: '启用代理',
    proxyType: '代理类型',
    proxyHost: '主机',
    proxyPort: '端口',
    proxyUsername: '用户名',
    proxyPassword: '密码',
    proxyBypass: '绕过列表',
  },
} as const

export default zh
