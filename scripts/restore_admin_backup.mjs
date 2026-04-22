import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.resolve(process.env.TCSP_DATA_DIR || path.join(ROOT, 'data'));
const UPLOADS_DIR = path.resolve(process.env.TCSP_UPLOADS_DIR || path.join(ROOT, 'uploads'));
const BACKUP_DIR = path.resolve(process.env.TCSP_BACKUP_DIR || path.join(ROOT, 'backup'));

function ts() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function backupCurrentData() {
  const dir = path.join(BACKUP_DIR, `manual_before_admin_restore_${ts()}`);
  await fs.mkdir(dir, { recursive: true });

  if (await pathExists(DATA_DIR)) {
    await fs.cp(DATA_DIR, path.join(dir, 'data'), { recursive: true });
  }
  if (await pathExists(UPLOADS_DIR)) {
    await fs.cp(UPLOADS_DIR, path.join(dir, 'uploads'), { recursive: true });
  }
  return dir;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('用法: node scripts/restore_admin_backup.mjs <备份包路径.tar.gz>');
    process.exit(1);
  }
  const backupFile = path.resolve(file);
  if (!(await pathExists(backupFile))) {
    console.error(`备份包不存在：${backupFile}`);
    process.exit(1);
  }

  const safety = await backupCurrentData();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tcsp-restore-'));
  try {
    execFileSync('tar', ['-xzf', backupFile, '-C', tempDir], { stdio: 'inherit' });
    const dataFrom = path.join(tempDir, 'data');
    const uploadsFrom = path.join(tempDir, 'uploads');

    if (!(await pathExists(dataFrom))) {
      throw new Error('备份包缺少 data/ 目录，无法恢复。');
    }

    await fs.rm(DATA_DIR, { recursive: true, force: true });
    await fs.mkdir(path.dirname(DATA_DIR), { recursive: true });
    await fs.cp(dataFrom, DATA_DIR, { recursive: true });

    if (await pathExists(uploadsFrom)) {
      await fs.rm(UPLOADS_DIR, { recursive: true, force: true });
      await fs.mkdir(path.dirname(UPLOADS_DIR), { recursive: true });
      await fs.cp(uploadsFrom, UPLOADS_DIR, { recursive: true });
    }

    console.log(`恢复成功：${backupFile}`);
    console.log(`恢复目录：${DATA_DIR}，${UPLOADS_DIR}`);
    console.log(`恢复前安全备份：${safety}`);
    console.log('请重启 portal 服务使变更立即生效。');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`恢复失败：${err.message}`);
  process.exit(1);
});

