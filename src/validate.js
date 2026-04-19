import { isHttpUrl } from './utils.js';

const TYPES = new Set(['作品', '任务', '探究', '表达']);
const MEDIA_TYPES = new Set(['image', 'video']);

function required(row, key) {
  return String(row[key] ?? '').trim().length > 0;
}

export function validateData({ clubs, artifacts, media }, maxTextLength = 140) {
  const issues = [];
  const clubIds = new Set(clubs.map((club) => club.club_id));
  const artifactIds = new Set(artifacts.map((item) => item.artifact_id));

  clubs.forEach((club, idx) => {
    const rowTag = `club_profile#${idx + 2}`;
    ['club_id', 'club_name', 'teacher', 'status'].forEach((field) => {
      if (!required(club, field)) issues.push(`${rowTag}: 缺少必填字段 ${field}`);
    });
    if (club.cover_url && !isHttpUrl(club.cover_url)) {
      issues.push(`${rowTag}: cover_url 不是有效链接`);
    }
    ['intro', 'learned_topics', 'done_items', 'highlights', 'harvest'].forEach((field) => {
      if (String(club[field] ?? '').length > maxTextLength * 6) {
        issues.push(`${rowTag}: ${field} 过长，建议精简`);
      }
    });
  });

  artifacts.forEach((item, idx) => {
    const rowTag = `student_artifact#${idx + 2}`;
    ['artifact_id', 'student_alias', 'grade', 'club_id', 'artifact_name', 'artifact_type'].forEach((field) => {
      if (!required(item, field)) issues.push(`${rowTag}: 缺少必填字段 ${field}`);
    });
    if (!clubIds.has(item.club_id)) {
      issues.push(`${rowTag}: club_id 不存在 (${item.club_id})`);
    }
    if (!TYPES.has(item.artifact_type)) {
      issues.push(`${rowTag}: artifact_type 必须是 作品/任务/探究/表达`);
    }
    if (String(item.one_line_harvest ?? '').length > maxTextLength) {
      issues.push(`${rowTag}: one_line_harvest 超出长度限制`);
    }
  });

  media.forEach((item, idx) => {
    const rowTag = `media_asset#${idx + 2}`;
    ['media_id', 'owner_type', 'owner_id', 'media_type', 'url'].forEach((field) => {
      if (!required(item, field)) issues.push(`${rowTag}: 缺少必填字段 ${field}`);
    });
    if (item.owner_type !== 'club' && item.owner_type !== 'artifact') {
      issues.push(`${rowTag}: owner_type 必须是 club 或 artifact`);
    }
    if (item.owner_type === 'club' && !clubIds.has(item.owner_id)) {
      issues.push(`${rowTag}: owner_id 对应社团不存在 (${item.owner_id})`);
    }
    if (item.owner_type === 'artifact' && !artifactIds.has(item.owner_id)) {
      issues.push(`${rowTag}: owner_id 对应成果不存在 (${item.owner_id})`);
    }
    if (!MEDIA_TYPES.has(item.media_type)) {
      issues.push(`${rowTag}: media_type 必须是 image 或 video`);
    }
    if (!isHttpUrl(item.url)) {
      issues.push(`${rowTag}: url 不是有效链接`);
    }
    if (item.thumbnail_url && !isHttpUrl(item.thumbnail_url)) {
      issues.push(`${rowTag}: thumbnail_url 不是有效链接`);
    }
  });

  return issues;
}
