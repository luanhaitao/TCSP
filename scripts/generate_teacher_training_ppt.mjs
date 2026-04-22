import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';
import PptxGenJS from 'pptxgenjs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const IMG_DIR = path.join(ROOT, 'docs', 'ppt_assets', 'annotated');
const OUT_DIR = path.join(ROOT, 'docs');
const OUT_FILE = path.join(OUT_DIR, '教师数据收集器使用培训-演示稿.pptx');

function addTitle(slide, title, subtitle = '') {
  slide.addText(title, {
    x: 0.6, y: 0.42, w: 12.2, h: 0.7,
    fontFace: 'Microsoft YaHei', fontSize: 30, bold: true, color: '0F2A43'
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.6, y: 1.08, w: 12.2, h: 0.4,
      fontFace: 'Microsoft YaHei', fontSize: 14, color: '355B7A'
    });
  }
}

function addFooter(slide, text) {
  slide.addShape('line', { x: 0.6, y: 6.86, w: 12.1, h: 0, line: { color: 'D6E3F0', pt: 1 } });
  slide.addText(text, {
    x: 0.6, y: 6.9, w: 12.1, h: 0.3,
    fontFace: 'Microsoft YaHei', fontSize: 10, color: '5A7B99', align: 'right'
  });
}

function addImageSlide(pptx, idx, fileName, title, bullets = []) {
  const slide = pptx.addSlide();
  addTitle(slide, `${idx}. ${title}`);
  const imgPath = path.join(IMG_DIR, fileName);
  slide.addImage({ path: imgPath, sizing: { type: 'contain', x: 0.6, y: 1.35, w: 8.2, h: 5.3 } });
  slide.addShape('roundRect', {
    x: 9.05, y: 1.35, w: 3.65, h: 5.3,
    radius: 0.06,
    fill: { color: 'F6FAFF' },
    line: { color: 'C7DCEF', pt: 1.2 }
  });
  slide.addText('操作要点', {
    x: 9.3, y: 1.55, w: 3.1, h: 0.4,
    fontFace: 'Microsoft YaHei', fontSize: 18, bold: true, color: '0F2A43'
  });
  let y = 2.05;
  bullets.forEach((t) => {
    slide.addText(`• ${t}`, {
      x: 9.3, y, w: 3.15, h: 0.55,
      fontFace: 'Microsoft YaHei', fontSize: 13, color: '213A53'
    });
    y += 0.62;
  });
  addFooter(slide, '普陀区青少年教育活动中心 · 科技社团云展教师培训');
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'TCSP';
  pptx.company = '普陀区青少年教育活动中心';
  pptx.subject = '教师数据收集器培训';
  pptx.title = '教师数据收集器使用培训';
  pptx.lang = 'zh-CN';

  const cover = pptx.addSlide();
  cover.background = { color: 'EAF4FF' };
  cover.addShape('roundRect', {
    x: 0.55, y: 0.5, w: 12.2, h: 5.9,
    radius: 0.08,
    fill: { color: 'FFFFFF' },
    line: { color: 'D7E6F5', pt: 1.2 },
    shadow: { type: 'outer', color: 'CBDFF2', angle: 45, blur: 3, distance: 2, opacity: 0.2 }
  });
  cover.addText('科技社团云展', {
    x: 1, y: 1.2, w: 11.2, h: 0.8,
    fontFace: 'Microsoft YaHei', fontSize: 42, bold: true, color: '0E2B45', align: 'center'
  });
  cover.addText('教师数据收集器使用培训', {
    x: 1, y: 2.1, w: 11.2, h: 0.55,
    fontFace: 'Microsoft YaHei', fontSize: 24, bold: true, color: '1A4D74', align: 'center'
  });
  cover.addText('内容覆盖：修改社团信息、新增并发布学员成果、素材绑定与目录一键导入', {
    x: 1, y: 3.0, w: 11.2, h: 0.5,
    fontFace: 'Microsoft YaHei', fontSize: 14, color: '355B7A', align: 'center'
  });
  cover.addText(`版本日期：${new Date().toISOString().slice(0, 10)}`, {
    x: 1, y: 4.65, w: 11.2, h: 0.3,
    fontFace: 'Microsoft YaHei', fontSize: 12, color: '5A7B99', align: 'center'
  });
  addFooter(cover, '普陀区青少年教育活动中心 · 科技社团云展');

  const agenda = pptx.addSlide();
  addTitle(agenda, '培训目标与流程', '10分钟上手，教师可独立完成维护与发布');
  agenda.addShape('roundRect', { x: 0.8, y: 1.5, w: 12, h: 4.8, radius: 0.06, fill: { color: 'F8FBFF' }, line: { color: 'D4E4F4', pt: 1 } });
  const points = [
    '1) 登录收集器并读取当前基础数据',
    '2) 维护社团信息（支持模板导入或逐项修改）',
    '3) 新增学员成果（支持批量导入、权限范围校验）',
    '4) 绑定素材（单文件上传或目录一键导入）',
    '5) 在草稿库核对后一键发布，首页即时更新',
    '6) 教师仅维护本人社团；管理员可全量维护'
  ];
  let py = 1.85;
  for (const p of points) {
    agenda.addText(p, { x: 1.15, y: py, w: 11.3, h: 0.55, fontFace: 'Microsoft YaHei', fontSize: 18, color: '163958' });
    py += 0.72;
  }
  addFooter(agenda, '操作中若页面未更新：请先重启服务并强制刷新浏览器');

  addImageSlide(pptx, '步骤1', '02-收集器登录.png', '登录与读取基础数据', [
    '输入教师姓名或管理员姓名登录',
    '登录后点击“读取当前基础数据”',
    '教师账号只看到本人社团数据，管理员看到全量'
  ]);

  addImageSlide(pptx, '步骤2', '03-社团信息维护.png', '修改社团信息', [
    '可先下载社团模板（CSV）批量导入',
    '也可逐项填写/修改社团字段',
    '点击“保存到草稿库”后进入待发布区'
  ]);

  addImageSlide(pptx, '步骤3', '04-学员成果维护与发布前准备.png', '新增学员成果', [
    '先选择所属社团（教师仅显示本人社团）',
    '支持成果模板导入或手动新增',
    '可导出“素材目录结构”模板给教师填充素材'
  ]);

  addImageSlide(pptx, '步骤4', '05-素材绑定与目录导入.png', '绑定素材（重点）', [
    '目录命名：成果ID_成果名称',
    '支持选择总目录，系统自动识别子目录',
    '支持多次选目录后一次性导入'
  ]);

  addImageSlide(pptx, '步骤5', '06-草稿编辑删除与发布按钮.png', '草稿编辑/删除与发布入口', [
    '在草稿库每条记录都可点击“编辑 / 删除”',
    '编辑用于修改已有草稿；删除用于移除错误草稿',
    '发布前先完成草稿核对，再点击“一键自动发布”'
  ]);

  addImageSlide(pptx, '步骤6', '07-点击编辑后在社团表单中修改.png', '点击编辑后在哪里修改', [
    '点击草稿“编辑”后会自动跳转到对应表单页',
    '表单字段会自动回填当前草稿内容',
    '修改后点击“保存到草稿库”即可覆盖更新'
  ]);

  addImageSlide(pptx, '步骤7', '01-首页总览.png', '发布后展示效果', [
    '首页自动展示最新发布数据',
    '可按社团、类型、关键词筛选',
    '建议发布后快速抽查封面与素材是否正常'
  ]);

  const tips = pptx.addSlide();
  addTitle(tips, '操作提醒', '避免常见误操作');
  tips.addShape('roundRect', { x: 0.8, y: 1.35, w: 12, h: 5.25, radius: 0.06, fill: { color: 'F7FCFF' }, line: { color: 'CEE4F2', pt: 1 } });
  const tipLines = [
    '1) 编辑：在草稿库点“编辑”后，到对应上方表单修改，再点“保存到草稿库”。',
    '2) 删除：在草稿库点“删除”会直接从草稿移除，请先确认再删。',
    '3) 发布：建议先核对草稿，再点“一键自动发布（推荐）”。',
    '4) 教师账号只能维护本人社团；管理员可维护全量。',
    '5) 若功能更新后不生效：重启服务并强制刷新浏览器。'
  ];
  let ty = 1.8;
  for (const t of tipLines) {
    tips.addText(t, {
      x: 1.15, y: ty, w: 11.2, h: 0.7,
      fontFace: 'Microsoft YaHei', fontSize: 18, color: '1D4361'
    });
    ty += 0.9;
  }
  addFooter(tips, '普陀区青少年教育活动中心 · 科技社团云展教师培训');

  const faq = pptx.addSlide();
  addTitle(faq, '常见问题与处理', '教师培训建议直接照此页讲解');
  faq.addShape('roundRect', { x: 0.8, y: 1.35, w: 12, h: 5.25, radius: 0.06, fill: { color: 'FFFDF8' }, line: { color: 'F0DFC0', pt: 1 } });
  const faqLines = [
    'Q1：模板下载后无法导入？',
    'A：请使用系统下载模板，不要改表头；CSV 支持导入，填写说明在第20行后。',
    'Q2：素材目录导入提示不合规？',
    'A：检查目录名是否“成果ID_成果名称”，并确认不是空目录。',
    'Q3：教师看不到其他社团数据？',
    'A：这是权限设计，教师仅维护本人执教社团。',
    'Q4：按钮点击后功能没生效？',
    'A：后端改动后需重启 `node scripts/portal_server.mjs`，再强制刷新页面。'
  ];
  let y = 1.7;
  for (const line of faqLines) {
    faq.addText(line, {
      x: 1.15, y, w: 11.3, h: 0.52,
      fontFace: 'Microsoft YaHei', fontSize: line.startsWith('Q') ? 17 : 14,
      bold: line.startsWith('Q'),
      color: line.startsWith('Q') ? '7A4B00' : '4A3A22'
    });
    y += line.startsWith('Q') ? 0.58 : 0.5;
  }
  addFooter(faq, '建议培训时按“登录 → 录入 → 绑定素材 → 发布”顺序现场演示一次');

  await pptx.writeFile({ fileName: OUT_FILE });
  console.log(`PPT generated: ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
