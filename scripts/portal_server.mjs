import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';
import { parseCsv } from './shared_csv.mjs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8090);
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB || 300) * 1024 * 1024;

const CLUB_HEADERS = [
  'club_id', 'club_name', 'teacher', 'grade_range', 'student_count', 'club_category', 'intro',
  'learned_topics', 'done_items', 'highlights', 'harvest', 'cover_url', 'status'
];
const ARTIFACT_HEADERS = [
  'artifact_id', 'student_alias', 'grade', 'club_id', 'artifact_name', 'artifact_type', 'keywords',
  'participation', 'artifact_intro', 'one_line_harvest', 'growth_evidence', 'teacher_comment', 'updated_at'
];
const MEDIA_HEADERS = [
  'media_id', 'owner_type', 'owner_id', 'media_type', 'url', 'thumbnail_url', 'copyright_status', 'notes'
];
const CLUB_TEMPLATE_CN_HEADERS = [
  '社团ID', '社团名称', '执教教师', '面向年级', '学员人数', '展馆类别', '社团简介',
  '本学期学了什么', '我们做了什么', '过程亮点', '整体收获', '封面图链接', '展示状态'
];
const ARTIFACT_TEMPLATE_CN_HEADERS = [
  '成果ID', '学员姓名', '年级', '所属社团', '成果名称', '成果类型',
  '关键词', '我的参与内容', '成果简介', '一句话收获', '成长证据', '教师简评'
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm'
};

const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm'
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map((h) => csvEscape(row[h] ?? '')).join(','));
  return `${lines.join('\n')}\n`;
}

async function readCsvFile(filePath) {
  try {
    const txt = await fs.readFile(filePath, 'utf8');
    return parseCsv(txt);
  } catch {
    return [];
  }
}

function sanitizeRows(rows, headers) {
  return rows.map((row) => {
    const out = {};
    for (const h of headers) out[h] = String(row[h] ?? '').trim();
    return out;
  });
}

function upsertById(existingRows, incomingRows, idKey, headers) {
  const existingMap = new Map();
  const order = [];

  for (const row of existingRows) {
    const id = String(row[idKey] ?? '').trim();
    if (!id) continue;
    existingMap.set(id, sanitizeRows([row], headers)[0]);
    order.push(id);
  }

  const cleanIncoming = sanitizeRows(incomingRows, headers);
  for (const row of cleanIncoming) {
    const id = String(row[idKey] ?? '').trim();
    if (!id) continue;
    if (!existingMap.has(id)) order.push(id);
    existingMap.set(id, row);
  }

  return order.map((id) => existingMap.get(id)).filter(Boolean);
}

async function backupBeforeWrite() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(ROOT, 'backup', 'auto_publish', ts);
  await fs.mkdir(dir, { recursive: true });

  const files = ['club_profile.csv', 'student_artifact.csv', 'media_asset.csv'];
  for (const file of files) {
    const src = path.join(ROOT, 'data', file);
    const dst = path.join(dir, file);
    try {
      await fs.copyFile(src, dst);
    } catch {
      await fs.writeFile(dst, '', 'utf8');
    }
  }

  await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify({ created_at: new Date().toISOString() }, null, 2), 'utf8');
  return dir;
}

function json(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders()
  });
  res.end(JSON.stringify(data));
}

function todayLabel() {
  return new Date().toISOString().slice(0, 10);
}

function downloadCsvResponse(res, filename, headers, rows) {
  const payload = `\uFEFF${toCsv(headers, rows)}`;
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    ...corsHeaders()
  });
  res.end(payload);
}

function handleTemplateDownload(req, res, pathname) {
  if (pathname === '/api/template/club.csv') {
    const row = {
      社团ID: '',
      社团名称: '智能编程社',
      执教教师: '张老师',
      面向年级: '四-六年级',
      学员人数: '36',
      展馆类别: '智能编程馆',
      社团简介: '围绕编程思维开展项目实践',
      本学期学了什么: '逻辑;调试;建模',
      我们做了什么: '完成循迹挑战和红绿灯任务',
      过程亮点: '两轮迭代优化',
      整体收获: '协作与表达能力提升',
      封面图链接: '/uploads/2026-04/example_cover.jpg',
      展示状态: 'active'
    };
    return downloadCsvResponse(res, `club_template_${todayLabel()}.csv`, CLUB_TEMPLATE_CN_HEADERS, [row]);
  }

  if (pathname === '/api/template/artifact.csv') {
    const row = {
      成果ID: '',
      学员姓名: '张三、李四',
      年级: '五年级',
      所属社团: '智能编程社',
      成果名称: '示例成果名称',
      成果类型: '作品',
      关键词: '编程 调试',
      我的参与内容: '负责核心功能实现',
      成果简介: '完成了一个可展示的成果',
      一句话收获: '我学会了拆解复杂任务',
      成长证据: '经过两轮迭代优化',
      教师简评: '表达清晰，过程完整'
    };
    return downloadCsvResponse(res, `artifact_template_${todayLabel()}.csv`, ARTIFACT_TEMPLATE_CN_HEADERS, [row]);
  }

  return false;
}

async function parseJsonBody(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 5 * 1024 * 1024) throw new Error('请求体过大，超过 5MB。');
  }
  return JSON.parse(data || '{}');
}

async function collectRawBody(req, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new Error(`上传文件过大，超过 ${Math.floor(maxBytes / 1024 / 1024)}MB 限制。`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function splitMultipart(buffer, boundary) {
  const delimiter = Buffer.from(`--${boundary}`);
  const ending = Buffer.from(`--${boundary}--`);

  const parts = [];
  let start = buffer.indexOf(delimiter);
  if (start === -1) return parts;

  while (start !== -1) {
    start += delimiter.length;

    if (buffer.slice(start, start + 2).toString() === '--') break;
    if (buffer.slice(start, start + 2).toString() === '\r\n') start += 2;

    let end = buffer.indexOf(delimiter, start);
    if (end === -1) {
      end = buffer.indexOf(ending, start);
      if (end === -1) break;
    }

    let part = buffer.slice(start, end);
    if (part.slice(-2).toString() === '\r\n') part = part.slice(0, -2);
    parts.push(part);

    start = buffer.indexOf(delimiter, end);
  }

  return parts;
}

function parsePart(part) {
  const sep = Buffer.from('\r\n\r\n');
  const idx = part.indexOf(sep);
  if (idx === -1) return null;

  const headerText = part.slice(0, idx).toString('utf8');
  const content = part.slice(idx + sep.length);

  const headers = {};
  for (const line of headerText.split('\r\n')) {
    const p = line.indexOf(':');
    if (p === -1) continue;
    headers[line.slice(0, p).trim().toLowerCase()] = line.slice(p + 1).trim();
  }

  const disp = headers['content-disposition'] || '';
  const nameMatch = disp.match(/name="([^"]+)"/i);
  const fileMatch = disp.match(/filename="([^"]*)"/i);

  return {
    fieldName: nameMatch ? nameMatch[1] : '',
    filename: fileMatch ? fileMatch[1] : '',
    contentType: headers['content-type'] || 'application/octet-stream',
    content
  };
}

function sanitizeFilename(name) {
  const base = path.basename(name || 'upload');
  const safe = base.replace(/[^a-zA-Z0-9._-]+/g, '_');
  return safe || 'upload';
}

function extFromFilenameOrMime(filename, mime) {
  const ext = path.extname(filename || '').toLowerCase();
  if (ext) return ext;
  return EXT_BY_MIME[String(mime || '').toLowerCase()] || '';
}

function detectMediaType(filename, mime) {
  const m = String(mime || '').toLowerCase();
  const ext = path.extname(filename || '').toLowerCase();
  const imageExt = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
  const videoExt = new Set(['.mp4', '.mov', '.webm']);
  const pdfExt = new Set(['.pdf']);
  if (m.startsWith('image/') || imageExt.has(ext)) return 'image';
  if (m.startsWith('video/') || videoExt.has(ext)) return 'video';
  if (m === 'application/pdf' || pdfExt.has(ext)) return 'pdf';
  return '';
}

async function handleUpload(req, res) {
  try {
    const contentType = req.headers['content-type'] || '';
    const match = String(contentType).match(/multipart\/form-data;\s*boundary=(.+)$/i);
    if (!match) {
      return json(res, 400, { ok: false, message: '上传失败：请求格式应为 multipart/form-data。' });
    }

    const boundary = match[1].replace(/^"|"$/g, '');
    const body = await collectRawBody(req, MAX_UPLOAD_BYTES);
    const parts = splitMultipart(body, boundary).map(parsePart).filter(Boolean);
    const filePart = parts.find((p) => p.fieldName === 'file' && p.filename);

    if (!filePart) {
      return json(res, 400, { ok: false, message: '上传失败：未找到文件字段 file。' });
    }

    const mediaType = detectMediaType(filePart.filename, filePart.contentType);
    if (!mediaType) {
      return json(res, 400, { ok: false, message: '上传失败：仅支持图片、视频或PDF文件。' });
    }

    const now = new Date();
    const dateDir = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const uploadDir = path.join(ROOT, 'uploads', dateDir);
    await fs.mkdir(uploadDir, { recursive: true });

    const safeName = sanitizeFilename(filePart.filename);
    const ext = extFromFilenameOrMime(safeName, filePart.contentType);
    const stem = path.basename(safeName, path.extname(safeName));
    const targetName = `${stem}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    const targetPath = path.join(uploadDir, targetName);

    await fs.writeFile(targetPath, filePart.content);

    const relUrl = `/uploads/${dateDir}/${targetName}`;
    const host = req.headers.host || `localhost:${PORT}`;
    const absoluteUrl = `http://${host}${relUrl}`;

    return json(res, 200, {
      ok: true,
      message: '上传成功',
      url: relUrl,
      relativeUrl: relUrl,
      absoluteUrl,
      mediaType,
      originalFilename: safeName,
      bytes: filePart.content.length
    });
  } catch (error) {
    return json(res, 500, { ok: false, message: `上传失败：${error.message}` });
  }
}

async function handlePublish(req, res) {
  try {
    const body = await parseJsonBody(req);

    const clubs = Array.isArray(body.clubs) ? body.clubs : [];
    const artifacts = Array.isArray(body.artifacts) ? body.artifacts : [];
    const media = Array.isArray(body.media) ? body.media : [];

    if (!clubs.length && !artifacts.length && !media.length) {
      return json(res, 400, { ok: false, message: '草稿为空，暂无可发布数据。' });
    }

    const backupDir = await backupBeforeWrite();

    const clubFile = path.join(ROOT, 'data', 'club_profile.csv');
    const artifactFile = path.join(ROOT, 'data', 'student_artifact.csv');
    const mediaFile = path.join(ROOT, 'data', 'media_asset.csv');

    const existingClubs = await readCsvFile(clubFile);
    const existingArtifacts = await readCsvFile(artifactFile);
    const existingMedia = await readCsvFile(mediaFile);

    const mergedClubs = clubs.length ? upsertById(existingClubs, clubs, 'club_id', CLUB_HEADERS) : existingClubs;
    const mergedArtifacts = artifacts.length ? upsertById(existingArtifacts, artifacts, 'artifact_id', ARTIFACT_HEADERS) : existingArtifacts;
    const mergedMedia = media.length ? upsertById(existingMedia, media, 'media_id', MEDIA_HEADERS) : existingMedia;

    await fs.writeFile(clubFile, toCsv(CLUB_HEADERS, mergedClubs), 'utf8');
    await fs.writeFile(artifactFile, toCsv(ARTIFACT_HEADERS, mergedArtifacts), 'utf8');
    await fs.writeFile(mediaFile, toCsv(MEDIA_HEADERS, mergedMedia), 'utf8');

    return json(res, 200, {
      ok: true,
      message: '自动发布成功',
      backupDir: path.relative(ROOT, backupDir),
      stats: {
        clubs_published: clubs.length,
        artifacts_published: artifacts.length,
        media_published: media.length,
        clubs_total: mergedClubs.length,
        artifacts_total: mergedArtifacts.length,
        media_total: mergedMedia.length
      }
    });
  } catch (error) {
    return json(res, 500, { ok: false, message: `发布失败：${error.message}` });
  }
}

async function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/src/index.html' : pathname;
  if (rel === '/collector') rel = '/src/collector.html';
  if (rel === '/src' || rel === '/src/') rel = '/src/index.html';

  const safePath = path.normalize(rel).replace(/^\.\.(\/|\\|$)+/, '');
  const full = path.join(ROOT, safePath);

  if (!full.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    let target = full;
    const stat = await fs.stat(full);
    if (stat.isDirectory()) {
      target = path.join(full, 'index.html');
    }

    const ext = path.extname(target).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    const content = await fs.readFile(target);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsed.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  if (pathname === '/api/health') {
    return json(res, 200, { ok: true, now: new Date().toISOString() });
  }

  if (pathname === '/api/upload' && req.method === 'POST') {
    return handleUpload(req, res);
  }

  if (pathname === '/api/publish' && req.method === 'POST') {
    return handlePublish(req, res);
  }

  if (req.method === 'GET' && handleTemplateDownload(req, res, pathname) !== false) {
    return;
  }

  return serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`Portal server running at http://localhost:${PORT}`);
  console.log(`- 首页: http://localhost:${PORT}/src/index.html`);
  console.log(`- 收集器: http://localhost:${PORT}/src/collector.html`);
  console.log(`- 上传API: http://localhost:${PORT}/api/upload`);
  console.log(`- 发布API: http://localhost:${PORT}/api/publish`);
});
