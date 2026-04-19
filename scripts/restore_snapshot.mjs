import fs from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('用法: node scripts/restore_snapshot.mjs backup/snapshots/<timestamp>');
    process.exit(1);
  }

  const sourceDir = input;
  const files = ['club_profile.csv', 'student_artifact.csv', 'media_asset.csv'];
  await fs.mkdir('data', { recursive: true });

  for (const file of files) {
    const src = path.join(sourceDir, file);
    const dst = path.join('data', file);
    await fs.copyFile(src, dst);
  }

  console.log(`回滚完成: ${sourceDir} -> data/`);
}

await main();
