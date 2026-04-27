import { readText, parseCsv, isAssetUrl } from './shared_csv.mjs';

const TYPES = new Set(['作品', '任务', '探究', '表达']);
const MEDIA_TYPES = new Set(['image', 'video', 'pdf', 'html']);

function required(row, key) {
  return String(row[key] ?? '').trim().length > 0;
}

function issue(list, msg) {
  list.push(msg);
}

async function main() {
  const clubSrc = process.env.CLUB_CSV || 'data/club_profile.csv';
  const artifactSrc = process.env.ARTIFACT_CSV || 'data/student_artifact.csv';
  const mediaSrc = process.env.MEDIA_CSV || 'data/media_asset.csv';

  const clubs = parseCsv(await readText(clubSrc));
  const artifacts = parseCsv(await readText(artifactSrc));
  const media = parseCsv(await readText(mediaSrc));

  const issues = [];
  const clubIds = new Set(clubs.map((club) => club.club_id));
  const artifactIds = new Set(artifacts.map((item) => item.artifact_id));

  clubs.forEach((club, idx) => {
    const row = `club_profile#${idx + 2}`;
    ['club_id', 'club_name', 'teacher', 'status'].forEach((field) => {
      if (!required(club, field)) issue(issues, `${row} 缺少 ${field}`);
    });
    if (club.cover_url && !isAssetUrl(club.cover_url)) issue(issues, `${row} cover_url 非法`);
  });

  artifacts.forEach((item, idx) => {
    const row = `student_artifact#${idx + 2}`;
    ['artifact_id', 'student_alias', 'grade', 'club_id', 'artifact_name', 'artifact_type'].forEach((field) => {
      if (!required(item, field)) issue(issues, `${row} 缺少 ${field}`);
    });
    if (!clubIds.has(item.club_id)) issue(issues, `${row} club_id 不存在`);
    if (!TYPES.has(item.artifact_type)) issue(issues, `${row} artifact_type 非法`);
  });

  media.forEach((item, idx) => {
    const row = `media_asset#${idx + 2}`;
    ['media_id', 'owner_type', 'owner_id', 'media_type', 'url'].forEach((field) => {
      if (!required(item, field)) issue(issues, `${row} 缺少 ${field}`);
    });
    if (!['club', 'artifact'].includes(item.owner_type)) issue(issues, `${row} owner_type 非法`);
    if (item.owner_type === 'club' && !clubIds.has(item.owner_id)) issue(issues, `${row} owner_id 社团不存在`);
    if (item.owner_type === 'artifact' && !artifactIds.has(item.owner_id)) issue(issues, `${row} owner_id 成果不存在`);
    if (!MEDIA_TYPES.has(item.media_type)) issue(issues, `${row} media_type 非法`);
    if (!isAssetUrl(item.url)) issue(issues, `${row} url 非法`);
    if (item.thumbnail_url && !isAssetUrl(item.thumbnail_url)) issue(issues, `${row} thumbnail_url 非法`);
  });

  if (issues.length) {
    console.error(`发现 ${issues.length} 项问题:`);
    issues.forEach((msg) => console.error(`- ${msg}`));
    process.exitCode = 1;
    return;
  }

  console.log('数据校验通过。');
}

await main();
