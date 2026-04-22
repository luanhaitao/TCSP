import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs', 'ppt_assets', 'screenshots');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function shot(locator, file) {
  await locator.scrollIntoViewIfNeeded();
  await locator.screenshot({ path: file });
}

async function main() {
  await ensureDir(OUT_DIR);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1720, height: 1080 } });

  await page.goto('http://127.0.0.1:8090/src/index.html', { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(OUT_DIR, '01-首页总览.png'), fullPage: true });

  await page.goto('http://127.0.0.1:8090/src/collector.html', { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(OUT_DIR, '02-收集器登录.png'), fullPage: false });

  await page.fill('#loginName', '科技组管理员');
  await page.click('#loginBtn');
  await page.waitForTimeout(800);
  await page.click('#loadBtn');
  await page.waitForTimeout(1200);

  await shot(page.locator('#tab-club'), path.join(OUT_DIR, '03-社团信息维护.png'));

  await page.click('.tab[data-tab="artifact"]');
  await page.waitForTimeout(300);
  await shot(page.locator('#tab-artifact'), path.join(OUT_DIR, '04-学员成果维护与发布前准备.png'));

  await page.click('.tab[data-tab="media"]');
  await page.waitForTimeout(300);
  await shot(page.locator('#tab-media'), path.join(OUT_DIR, '05-素材绑定与目录导入.png'));

  await page.locator('#publishDrafts').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const toolbarBox = await page.locator('.toolbar').first().boundingBox();
  const draftBox = await page.locator('#clubDrafts').boundingBox();
  if (toolbarBox && draftBox) {
    const clip = {
      x: Math.max(0, Math.floor(Math.min(toolbarBox.x, draftBox.x) - 8)),
      y: Math.max(0, Math.floor(Math.min(toolbarBox.y, draftBox.y) - 8)),
      width: Math.ceil(Math.max(toolbarBox.x + toolbarBox.width, draftBox.x + draftBox.width) - Math.min(toolbarBox.x, draftBox.x) + 16),
      height: Math.ceil(Math.max(toolbarBox.y + toolbarBox.height, draftBox.y + draftBox.height) - Math.min(toolbarBox.y, draftBox.y) + 16)
    };
    await page.screenshot({ path: path.join(OUT_DIR, '06-草稿编辑删除与发布按钮.png'), clip });
  } else {
    await shot(page.locator('#publishDrafts').locator('xpath=ancestor::section[1]'), path.join(OUT_DIR, '06-草稿编辑删除与发布按钮.png'));
  }

  const firstEdit = page.locator('#clubDrafts button[data-edit]').first();
  if (await firstEdit.count()) {
    await firstEdit.click();
    await page.waitForTimeout(250);
  }
  await shot(page.locator('#tab-club'), path.join(OUT_DIR, '07-点击编辑后在社团表单中修改.png'));

  await browser.close();
  console.log(`screenshots saved to: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
