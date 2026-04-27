import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('用法: node scripts/migrate_import.mjs <迁移包路径.tar.gz>');
    process.exit(1);
  }

  try {
    await fs.access(input);
  } catch {
    console.error(`文件不存在: ${input}`);
    process.exit(1);
  }

  execFileSync('tar', ['-xzf', input, '-C', '.'], { stdio: 'inherit' });
  console.log(`迁移包已恢复: ${input}`);
  console.log('已恢复目录: data/ 和 uploads/（若迁移包内存在）');
}

await main();
