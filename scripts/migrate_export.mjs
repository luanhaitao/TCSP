import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function ts() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const outputDir = process.env.MIGRATION_DIR || path.join('backup', 'migrations');
  const outputName = process.env.MIGRATION_FILE || `tcsp_migration_${ts()}.tar.gz`;
  const outputPath = path.join(outputDir, outputName);

  await ensureDir(outputDir);

  const include = ['data'];
  if (await exists('uploads')) include.push('uploads');

  execFileSync('tar', ['-czf', outputPath, ...include], { stdio: 'inherit' });
  console.log(`迁移包已生成: ${outputPath}`);
  console.log(`已包含目录: ${include.join(', ')}`);
}

await main();
