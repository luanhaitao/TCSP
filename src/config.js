export const CONFIG = {
  appTitle: '普陀区科技社团互动云展',
  privacyMode: 'alias-grade',
  autoRefreshMs: 0,
  publish: {
    enabled: true,
    apiUrl: '/api/publish',
    clearDraftsAfterPublish: true
  },
  auth: {
    enabled: true,
    adminNames: ['科技组管理员']
  },
  collector: {
    allowExternalHtmlUrl: true
  },
  assetUpload: {
    enabled: true,
    provider: 'local',
    local: {
      apiUrl: '/api/upload',
      htmlFolderApiUrl: '/api/upload-html-folder',
      maxSizeMb: 300,
      retryTimes: 2,
      retryDelayMs: 400,
      importConcurrency: 3
    },
    cloudinary: {
      cloudName: '',
      uploadPreset: '',
      folder: 'tcsp'
    }
  },
  datasource: {
    preferOnlineSheet: true,
    // 建议配置为在线表格“发布为 CSV”的公开链接
    // 不可用时自动降级为本地 data/*.csv
    clubProfileCsvUrl: '',
    studentArtifactCsvUrl: '',
    mediaAssetCsvUrl: '',
    localFallback: {
      clubProfile: '../data/club_profile.csv',
      studentArtifact: '../data/student_artifact.csv',
      mediaAsset: '../data/media_asset.csv'
    }
  },
  defaults: {
    imagePlaceholder: '/src/assets/image_placeholder.svg',
    maxTextLength: 140
  }
};
