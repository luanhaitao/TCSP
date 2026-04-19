export const CONFIG = {
  appTitle: '普陀区科技社团互动云展',
  privacyMode: 'alias-grade',
  autoRefreshMs: 0,
  publish: {
    enabled: true,
    apiUrl: 'http://localhost:8090/api/publish',
    clearDraftsAfterPublish: true
  },
  assetUpload: {
    enabled: true,
    provider: 'local',
    local: {
      apiUrl: '/api/upload',
      maxSizeMb: 100
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
    imagePlaceholder: 'https://placehold.co/600x450/e9f2fa/5d7894?text=%E6%9A%82%E6%97%A0%E5%9B%BE%E7%89%87',
    maxTextLength: 140
  }
};
