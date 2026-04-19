import fs from 'node:fs/promises';
import path from 'node:path';
import { readText } from './shared_csv.mjs';

function ts() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function ensure(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function write(file, content) {
  await ensure(path.dirname(file));
  await fs.writeFile(file, content, 'utf8');
}

async function copySource(source, targetPath) {
  const text = await readText(source);
  await write(targetPath, text);
}

async function main() {
  const sources = {
    club_profile: process.env.CLUB_CSV || 'data/club_profile.csv',
    student_artifact: process.env.ARTIFACT_CSV || 'data/student_artifact.csv',
    media_asset: process.env.MEDIA_CSV || 'data/media_asset.csv'
  };

  const snapshotDir = path.join('backup', 'snapshots', ts());
  await ensure(snapshotDir);

  await copySource(sources.club_profile, path.join(snapshotDir, 'club_profile.csv'));
  await copySource(sources.student_artifact, path.join(snapshotDir, 'student_artifact.csv'));
  await copySource(sources.media_asset, path.join(snapshotDir, 'media_asset.csv'));

  const meta = {
    created_at: new Date().toISOString(),
    sources
  };

  await write(path.join(snapshotDir, 'meta.json'), JSON.stringify(meta, null, 2));
  console.log(`快照已创建: ${snapshotDir}`);
}

await main();
