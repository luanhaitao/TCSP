import { CONFIG } from './config.js';
import { parseCsv } from './utils.js';

async function fetchCsv(url, label) {
  const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}_ts=${Date.now()}`);
  if (!res.ok) {
    throw new Error(`${label} 拉取失败: HTTP ${res.status}`);
  }
  const txt = await res.text();
  return parseCsv(txt);
}

async function loadTable(onlineUrl, fallbackUrl, label, preferOnline) {
  if (preferOnline && onlineUrl) {
    try {
      return { rows: await fetchCsv(onlineUrl, label), from: 'online' };
    } catch (error) {
      console.warn(`[${label}] 在线表格读取失败，降级本地`, error);
    }
  }
  return { rows: await fetchCsv(fallbackUrl, label), from: 'local' };
}

export async function loadAllTables() {
  const ds = CONFIG.datasource;
  const preferOnline = Boolean(ds.preferOnlineSheet);

  const [clubTable, artifactTable, mediaTable] = await Promise.all([
    loadTable(ds.clubProfileCsvUrl, ds.localFallback.clubProfile, 'club_profile', preferOnline),
    loadTable(ds.studentArtifactCsvUrl, ds.localFallback.studentArtifact, 'student_artifact', preferOnline),
    loadTable(ds.mediaAssetCsvUrl, ds.localFallback.mediaAsset, 'media_asset', preferOnline)
  ]);

  return {
    clubs: clubTable.rows,
    artifacts: artifactTable.rows,
    media: mediaTable.rows,
    sourceMode: [clubTable.from, artifactTable.from, mediaTable.from].includes('online') ? 'online' : 'local'
  };
}
