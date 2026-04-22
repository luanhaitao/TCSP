import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { parseCsv } from './shared_csv.mjs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8090);
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB || 300) * 1024 * 1024;
const DATA_DIR = path.resolve(process.env.TCSP_DATA_DIR || path.join(ROOT, 'data'));
const UPLOADS_DIR = path.resolve(process.env.TCSP_UPLOADS_DIR || path.join(ROOT, 'uploads'));
const BACKUP_DIR = path.resolve(process.env.TCSP_BACKUP_DIR || path.join(ROOT, 'backup'));
const SESSION_COOKIE = 'tcsp_sid';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const sessions = new Map();

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
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true'
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
  const dir = path.join(BACKUP_DIR, 'auto_publish', ts);
  await fs.mkdir(dir, { recursive: true });

  const files = ['club_profile.csv', 'student_artifact.csv', 'media_asset.csv'];
  for (const file of files) {
    const src = path.join(DATA_DIR, file);
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

async function ensureRuntimeDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function parseCookies(req) {
  const raw = String(req.headers.cookie || '');
  const out = {};
  raw.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) return;
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function makeCookie(name, value, maxAgeSec) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

function clearCookie(name) {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [sid, session] of sessions.entries()) {
    if (!session?.expiresAt || session.expiresAt <= now) sessions.delete(sid);
  }
}

function createSession(payload) {
  cleanupExpiredSessions();
  const sid = crypto.randomUUID();
  sessions.set(sid, {
    ...payload,
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return sid;
}

function getSession(req) {
  cleanupExpiredSessions();
  const sid = parseCookies(req)[SESSION_COOKIE];
  if (!sid) return null;
  const session = sessions.get(sid);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(sid);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return { sid, ...session };
}

async function getAdminNames() {
  try {
    const cfg = await fs.readFile(path.join(ROOT, 'src', 'config.js'), 'utf8');
    const authBlock = cfg.match(/auth\s*:\s*\{[\s\S]*?\}/m)?.[0] || '';
    const listBody = authBlock.match(/adminNames\s*:\s*\[([\s\S]*?)\]/m)?.[1] || '';
    const list = [...listBody.matchAll(/['"]([^'"]+)['"]/g)].map((m) => String(m[1]).trim()).filter(Boolean);
    return list;
  } catch {
    return [];
  }
}

async function resolveLoginByName(name) {
  const displayName = String(name || '').trim();
  if (!displayName) return { ok: false, message: '姓名不能为空。' };

  const adminNames = await getAdminNames();
  if (adminNames.includes(displayName)) {
    return { ok: true, role: 'admin', displayName, clubIds: [] };
  }

  const clubs = await readCsvFile(path.join(DATA_DIR, 'club_profile.csv'));
  const clubIds = clubs
    .filter((c) => String(c.teacher || '').trim() === displayName)
    .map((c) => String(c.club_id || '').trim())
    .filter(Boolean);

  if (!clubIds.length) {
    return { ok: false, message: '登录失败：你不是当前社团执教教师，无法进入收集器。' };
  }
  return { ok: true, role: 'teacher', displayName, clubIds: [...new Set(clubIds)] };
}

function unauthorized(res, message = '未登录或登录已失效，请先登录。') {
  return json(res, 401, { ok: false, message });
}

function forbidden(res, message = '无权限执行该操作。') {
  return json(res, 403, { ok: false, message });
}

function isTeacherSession(session) {
  return session?.role === 'teacher';
}

function isAdminSession(session) {
  return session?.role === 'admin';
}

async function loadAllBaseTables() {
  const clubs = await readCsvFile(path.join(DATA_DIR, 'club_profile.csv'));
  const artifacts = await readCsvFile(path.join(DATA_DIR, 'student_artifact.csv'));
  const media = await readCsvFile(path.join(DATA_DIR, 'media_asset.csv'));
  return { clubs, artifacts, media };
}

function filterBaseByScope(base, clubIds) {
  const clubSet = new Set((clubIds || []).map((v) => String(v)));
  const clubs = base.clubs.filter((c) => clubSet.has(String(c.club_id || '')));
  const artifacts = base.artifacts.filter((a) => clubSet.has(String(a.club_id || '')));
  const artifactSet = new Set(artifacts.map((a) => String(a.artifact_id || '')));
  const media = base.media.filter((m) => {
    const ownerType = String(m.owner_type || '');
    const ownerId = String(m.owner_id || '');
    if (ownerType === 'club') return clubSet.has(ownerId);
    if (ownerType === 'artifact') return artifactSet.has(ownerId);
    return false;
  });
  return { clubs, artifacts, media };
}

function scopeFilterIncomingDrafts(session, incoming, existingArtifacts) {
  if (isAdminSession(session)) {
    return {
      clubs: incoming.clubs,
      artifacts: incoming.artifacts,
      media: incoming.media,
      blocked: { clubs: 0, artifacts: 0, media: 0 }
    };
  }

  const clubSet = new Set((session.clubIds || []).map((v) => String(v)));
  const clubs = incoming.clubs.filter((row) => clubSet.has(String(row.club_id || '').trim()));
  const artifacts = incoming.artifacts.filter((row) => clubSet.has(String(row.club_id || '').trim()));
  const allowedArtifactSet = new Set([
    ...existingArtifacts
      .filter((a) => clubSet.has(String(a.club_id || '').trim()))
      .map((a) => String(a.artifact_id || '').trim()),
    ...artifacts.map((a) => String(a.artifact_id || '').trim())
  ].filter(Boolean));
  const media = incoming.media.filter((row) => {
    const ownerType = String(row.owner_type || '').trim();
    const ownerId = String(row.owner_id || '').trim();
    if (ownerType === 'club') return clubSet.has(ownerId);
    if (ownerType === 'artifact') return allowedArtifactSet.has(ownerId);
    return false;
  });

  return {
    clubs,
    artifacts,
    media,
    blocked: {
      clubs: incoming.clubs.length - clubs.length,
      artifacts: incoming.artifacts.length - artifacts.length,
      media: incoming.media.length - media.length
    }
  };
}

async function appendJsonLine(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
}

async function backupUploadedFile(targetPath, dateDir, targetName, meta) {
  const backupUploadDir = path.join(BACKUP_DIR, 'uploads', dateDir);
  await fs.mkdir(backupUploadDir, { recursive: true });
  const backupPath = path.join(backupUploadDir, targetName);
  await fs.copyFile(targetPath, backupPath);
  const logPath = path.join(BACKUP_DIR, 'uploads', 'upload_log.jsonl');
  await appendJsonLine(logPath, {
    backed_up_at: new Date().toISOString(),
    source_path: targetPath,
    backup_path: backupPath,
    ...meta
  });
  return backupPath;
}

function json(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders()
  });
  res.end(JSON.stringify(data));
}

function jsonWithCookie(res, statusCode, data, cookieValue) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Set-Cookie': cookieValue,
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
  if (pathname === '/api/template/club_guide.csv') {
    const rows = [
      { 项目: '社团类别（展馆类别）推荐值', 说明: '建议使用以下统一类别，便于首页分馆展示与筛选。' },
      { 项目: '可选类别1', 说明: '智能编程馆' },
      { 项目: '可选类别2', 说明: '工程设计馆' },
      { 项目: '可选类别3', 说明: '科学探究馆' },
      { 项目: '可选类别4', 说明: '数字创意馆' },
      { 项目: '可选类别5', 说明: '科学普及馆' },
      { 项目: '可选类别6', 说明: '工程制造馆' },
      { 项目: '展示状态可选值', 说明: 'active（展示中）或 archived（暂不展示）' },
      { 项目: '展示状态填写建议', 说明: '默认建议填写 active；仅需下线社团时填写 archived。' },
      { 项目: '填写建议', 说明: '尽量从上述类别中选择，不建议自由发挥写法。' }
    ];
    return downloadCsvResponse(res, `club_template_guide_${todayLabel()}.csv`, ['项目', '说明'], rows);
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
  if (pathname === '/api/template/artifact_guide.csv') {
    const rows = [
      { 项目: '学员姓名字段填写规则', 说明: '可填写多人姓名（用“、”分隔）或直接填写小组名称。' },
      { 项目: '多人示例', 说明: '学员姓名 = 张三、李四、王五' },
      { 项目: '小组示例', 说明: '学员姓名 = 未来创客队' },
      { 项目: '成果类型可选值', 说明: '仅可填写：作品、任务、探究、表达。' },
      { 项目: '所属社团字段填写规则', 说明: '优先填写“社团名称”；若存在同名社团，请填写社团ID（如 C001）。' },
      { 项目: '推荐写法', 说明: '所属社团 = 智能编程社' },
      { 项目: '重名写法', 说明: '所属社团 = C001' }
    ];
    return downloadCsvResponse(res, `artifact_template_guide_${todayLabel()}.csv`, ['项目', '说明'], rows);
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

async function runCommand(cmd, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'ignore' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

async function extractGifFirstFrame(gifPath, outputPath) {
  const strategies = [];
  if (process.platform === 'darwin') {
    strategies.push(['sips', ['-s', 'format', 'png', gifPath, '--out', outputPath]]);
  }
  strategies.push(['ffmpeg', ['-y', '-i', gifPath, '-frames:v', '1', outputPath]]);
  strategies.push(['magick', ['convert', `${gifPath}[0]`, outputPath]]);
  strategies.push(['convert', [`${gifPath}[0]`, outputPath]]);

  for (const [cmd, args] of strategies) {
    try {
      await runCommand(cmd, args);
      const stat = await fs.stat(outputPath);
      if (stat.size > 0) return true;
    } catch {
      // try next strategy
    }
  }
  return false;
}

async function extractVideoFirstFrame(videoPath, outputPath) {
  const strategies = [
    ['ffmpeg', ['-y', '-i', videoPath, '-frames:v', '1', outputPath]]
  ];
  for (const [cmd, args] of strategies) {
    try {
      await runCommand(cmd, args);
      const stat = await fs.stat(outputPath);
      if (stat.size > 0) return true;
    } catch {
      // try next strategy
    }
  }
  return false;
}

async function handleUpload(req, res) {
  try {
    const session = getSession(req);
    if (!session) return unauthorized(res);
    await ensureRuntimeDirs();
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
    const uploadDir = path.join(UPLOADS_DIR, dateDir);
    await fs.mkdir(uploadDir, { recursive: true });

    const safeName = sanitizeFilename(filePart.filename);
    const ext = extFromFilenameOrMime(safeName, filePart.contentType);
    const stem = path.basename(safeName, path.extname(safeName));
    const targetName = `${stem}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    const targetPath = path.join(uploadDir, targetName);

    await fs.writeFile(targetPath, filePart.content);

    let thumbnailRelUrl = '';
    let thumbnailBackupPath = '';
    if (mediaType === 'image' && path.extname(targetName).toLowerCase() === '.gif') {
      const thumbName = `${path.basename(targetName, '.gif')}_firstframe.png`;
      const thumbPath = path.join(uploadDir, thumbName);
      const ok = await extractGifFirstFrame(targetPath, thumbPath);
      if (ok) {
        thumbnailRelUrl = `/uploads/${dateDir}/${thumbName}`;
        thumbnailBackupPath = await backupUploadedFile(thumbPath, dateDir, thumbName, {
          media_type: 'image',
          derived_from: targetPath,
          is_gif_first_frame: true
        });
      }
    }
    if (mediaType === 'video') {
      const thumbName = `${path.basename(targetName, path.extname(targetName))}_firstframe.png`;
      const thumbPath = path.join(uploadDir, thumbName);
      const ok = await extractVideoFirstFrame(targetPath, thumbPath);
      if (ok) {
        thumbnailRelUrl = `/uploads/${dateDir}/${thumbName}`;
        thumbnailBackupPath = await backupUploadedFile(thumbPath, dateDir, thumbName, {
          media_type: 'image',
          derived_from: targetPath,
          is_video_first_frame: true
        });
      }
    }

    const backupPath = await backupUploadedFile(targetPath, dateDir, targetName, {
      media_type: mediaType,
      original_filename: safeName,
      bytes: filePart.content.length
    });

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
      bytes: filePart.content.length,
      backupPath: path.relative(ROOT, backupPath),
      thumbnailUrl: thumbnailRelUrl,
      thumbnailBackupPath: thumbnailBackupPath ? path.relative(ROOT, thumbnailBackupPath) : ''
    });
  } catch (error) {
    return json(res, 500, { ok: false, message: `上传失败：${error.message}` });
  }
}

async function handlePublish(req, res) {
  try {
    const session = getSession(req);
    if (!session) return unauthorized(res);
    await ensureRuntimeDirs();
    const body = await parseJsonBody(req);

    const clubs = Array.isArray(body.clubs) ? body.clubs : [];
    const artifacts = Array.isArray(body.artifacts) ? body.artifacts : [];
    const media = Array.isArray(body.media) ? body.media : [];
    const deleteArtifactIds = Array.isArray(body.delete_artifact_ids) ? body.delete_artifact_ids.map((v) => String(v || '').trim()).filter(Boolean) : [];
    const deleteMediaIds = Array.isArray(body.delete_media_ids) ? body.delete_media_ids.map((v) => String(v || '').trim()).filter(Boolean) : [];
    const adminFullSync = isAdminSession(session) && body?.full_sync === true;

    if (!clubs.length && !artifacts.length && !media.length) {
      return json(res, 400, { ok: false, message: '草稿为空，暂无可发布数据。' });
    }

    const clubFile = path.join(DATA_DIR, 'club_profile.csv');
    const artifactFile = path.join(DATA_DIR, 'student_artifact.csv');
    const mediaFile = path.join(DATA_DIR, 'media_asset.csv');

    const existingClubs = await readCsvFile(clubFile);
    const existingArtifacts = await readCsvFile(artifactFile);
    const existingMedia = await readCsvFile(mediaFile);

    const scoped = scopeFilterIncomingDrafts(session, { clubs, artifacts, media }, existingArtifacts);
    if (!scoped.clubs.length && !scoped.artifacts.length && !scoped.media.length) {
      const blockedTotal = scoped.blocked.clubs + scoped.blocked.artifacts + scoped.blocked.media;
      return forbidden(res, blockedTotal > 0 ? `发布失败：无可发布数据，已拦截 ${blockedTotal} 条越权草稿。` : '发布失败：当前账号无可发布数据。');
    }

    const backupDir = await backupBeforeWrite();

    const mergedClubs = adminFullSync
      ? sanitizeRows(scoped.clubs, CLUB_HEADERS)
      : (scoped.clubs.length ? upsertById(existingClubs, scoped.clubs, 'club_id', CLUB_HEADERS) : existingClubs);
    let mergedArtifacts = adminFullSync
      ? sanitizeRows(scoped.artifacts, ARTIFACT_HEADERS)
      : (scoped.artifacts.length ? upsertById(existingArtifacts, scoped.artifacts, 'artifact_id', ARTIFACT_HEADERS) : existingArtifacts);
    let mergedMedia = adminFullSync
      ? sanitizeRows(scoped.media, MEDIA_HEADERS)
      : (scoped.media.length ? upsertById(existingMedia, scoped.media, 'media_id', MEDIA_HEADERS) : existingMedia);

    let artifactsDeleted = 0;
    let mediaDeleted = 0;
    let blockedArtifactDelete = 0;
    let blockedMediaDelete = 0;
    if (!adminFullSync && (deleteArtifactIds.length || deleteMediaIds.length)) {
      const teacherClubSet = new Set((session.clubIds || []).map((v) => String(v)));
      const mergedArtifactMap = new Map(mergedArtifacts.map((r) => [String(r.artifact_id || '').trim(), r]));
      const allowedDeleteArtifactIdSet = new Set();
      for (const aid of deleteArtifactIds) {
        const row = mergedArtifactMap.get(aid);
        if (row && teacherClubSet.has(String(row.club_id || '').trim())) {
          allowedDeleteArtifactIdSet.add(aid);
        } else {
          blockedArtifactDelete += 1;
        }
      }
      if (allowedDeleteArtifactIdSet.size) {
        const before = mergedArtifacts.length;
        mergedArtifacts = mergedArtifacts.filter((r) => !allowedDeleteArtifactIdSet.has(String(r.artifact_id || '').trim()));
        artifactsDeleted += before - mergedArtifacts.length;
      }

      const allowedDeleteMediaIdSet = new Set();
      const mergedArtifactIdSetAfterDelete = new Set(mergedArtifacts.map((r) => String(r.artifact_id || '').trim()));
      for (const mid of deleteMediaIds) {
        const row = mergedMedia.find((m) => String(m.media_id || '').trim() === mid);
        if (!row) continue;
        const ownerType = String(row.owner_type || '').trim();
        const ownerId = String(row.owner_id || '').trim();
        const allowed = (ownerType === 'club' && teacherClubSet.has(ownerId))
          || (ownerType === 'artifact' && (mergedArtifactIdSetAfterDelete.has(ownerId) || allowedDeleteArtifactIdSet.has(ownerId)));
        if (allowed) allowedDeleteMediaIdSet.add(mid);
        else blockedMediaDelete += 1;
      }
      if (allowedDeleteMediaIdSet.size) {
        const before = mergedMedia.length;
        mergedMedia = mergedMedia.filter((r) => !allowedDeleteMediaIdSet.has(String(r.media_id || '').trim()));
        mediaDeleted += before - mergedMedia.length;
      }

      if (allowedDeleteArtifactIdSet.size) {
        const beforeCascade = mergedMedia.length;
        mergedMedia = mergedMedia.filter((r) => {
          const ownerType = String(r.owner_type || '').trim();
          const ownerId = String(r.owner_id || '').trim();
          if (ownerType === 'artifact' && allowedDeleteArtifactIdSet.has(ownerId)) return false;
          return true;
        });
        mediaDeleted += beforeCascade - mergedMedia.length;
      }
    }

    await fs.writeFile(clubFile, toCsv(CLUB_HEADERS, mergedClubs), 'utf8');
    await fs.writeFile(artifactFile, toCsv(ARTIFACT_HEADERS, mergedArtifacts), 'utf8');
    await fs.writeFile(mediaFile, toCsv(MEDIA_HEADERS, mergedMedia), 'utf8');

    return json(res, 200, {
      ok: true,
      message: '自动发布成功',
      backupDir: path.relative(ROOT, backupDir),
      blocked: scoped.blocked,
      mode: adminFullSync ? 'admin_full_sync' : 'upsert',
      stats: {
        clubs_published: scoped.clubs.length,
        artifacts_published: scoped.artifacts.length,
        media_published: scoped.media.length,
        artifacts_deleted: artifactsDeleted,
        media_deleted: mediaDeleted,
        delete_blocked_artifacts: blockedArtifactDelete,
        delete_blocked_media: blockedMediaDelete,
        clubs_total: mergedClubs.length,
        artifacts_total: mergedArtifacts.length,
        media_total: mergedMedia.length
      }
    });
  } catch (error) {
    return json(res, 500, { ok: false, message: `发布失败：${error.message}` });
  }
}

async function handleAuthLogin(req, res) {
  try {
    await ensureRuntimeDirs();
    const body = await parseJsonBody(req);
    const result = await resolveLoginByName(body?.name);
    if (!result.ok) return forbidden(res, result.message);
    const sid = createSession({
      role: result.role,
      displayName: result.displayName,
      clubIds: result.clubIds || []
    });
    return jsonWithCookie(
      res,
      200,
      {
        ok: true,
        role: result.role,
        displayName: result.displayName,
        clubIds: result.role === 'teacher' ? result.clubIds : []
      },
      makeCookie(SESSION_COOKIE, sid, Math.floor(SESSION_TTL_MS / 1000))
    );
  } catch (error) {
    return json(res, 500, { ok: false, message: `登录失败：${error.message}` });
  }
}

function handleAuthMe(req, res) {
  const session = getSession(req);
  if (!session) return json(res, 200, { ok: true, authenticated: false });
  return json(res, 200, {
    ok: true,
    authenticated: true,
    role: session.role,
    displayName: session.displayName,
    clubIds: isTeacherSession(session) ? session.clubIds : []
  });
}

function handleAuthLogout(req, res) {
  const sid = parseCookies(req)[SESSION_COOKIE];
  if (sid) sessions.delete(sid);
  return jsonWithCookie(res, 200, { ok: true }, clearCookie(SESSION_COOKIE));
}

async function handleCollectorBase(req, res) {
  const session = getSession(req);
  if (!session) return unauthorized(res);
  const base = await loadAllBaseTables();
  const scoped = isAdminSession(session) ? base : filterBaseByScope(base, session.clubIds || []);
  return json(res, 200, {
    ok: true,
    clubs: sanitizeRows(scoped.clubs, CLUB_HEADERS),
    artifacts: sanitizeRows(scoped.artifacts, ARTIFACT_HEADERS),
    media: sanitizeRows(scoped.media, MEDIA_HEADERS),
    sourceMode: 'local',
    scope: isAdminSession(session)
      ? { role: 'admin', clubIds: [] }
      : { role: 'teacher', clubIds: session.clubIds || [] }
  });
}

function runTar(args, cwd = undefined) {
  return new Promise((resolve, reject) => {
    const proc = spawn('tar', args, cwd ? { cwd } : undefined);
    let stderr = '';
    proc.stderr.on('data', (buf) => { stderr += String(buf || ''); });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `tar 退出码 ${code}`));
    });
  });
}

function backupFileLabel() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function createAdminBackupArchive() {
  await ensureRuntimeDirs();
  const outputDir = path.join(BACKUP_DIR, 'migrations');
  await fs.mkdir(outputDir, { recursive: true });
  const fileName = `tcsp_full_backup_${backupFileLabel()}.tar.gz`;
  const outputPath = path.join(outputDir, fileName);

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tcsp-admin-backup-'));
  const dataLink = path.join(tempDir, 'data');
  const uploadLink = path.join(tempDir, 'uploads');
  const metaFile = path.join(tempDir, 'meta.json');

  try {
    await fs.symlink(DATA_DIR, dataLink, 'dir');
    if (await pathExists(UPLOADS_DIR)) {
      await fs.symlink(UPLOADS_DIR, uploadLink, 'dir');
    } else {
      await fs.mkdir(uploadLink, { recursive: true });
    }
    await fs.writeFile(metaFile, JSON.stringify({
      created_at: new Date().toISOString(),
      source_data_dir: DATA_DIR,
      source_uploads_dir: UPLOADS_DIR
    }, null, 2), 'utf8');

    await runTar(['-czhf', outputPath, '-C', tempDir, 'data', 'uploads', 'meta.json']);
    return { fileName, outputPath };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function handleAdminBackup(req, res) {
  const session = getSession(req);
  if (!session) return unauthorized(res);
  if (!isAdminSession(session)) return forbidden(res, '仅超级管理员可执行此操作。');

  try {
    const backup = await createAdminBackupArchive();
    return json(res, 200, {
      ok: true,
      file: path.relative(ROOT, backup.outputPath),
      absoluteFile: backup.outputPath,
      message: '备份成功',
      restoreCommand: `node scripts/restore_admin_backup.mjs \"${backup.outputPath}\"`
    });
  } catch (error) {
    return json(res, 500, { ok: false, message: `备份失败：${error.message}` });
  }
}

function safeFolderPart(text, fallback = '未命名成果') {
  const normalized = String(text || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || fallback;
}

async function handleArtifactFoldersExport(req, res) {
  const session = getSession(req);
  if (!session) return unauthorized(res);

  const base = await loadAllBaseTables();
  const scoped = isAdminSession(session) ? base : filterBaseByScope(base, session.clubIds || []);
  const artifacts = sanitizeRows(scoped.artifacts, ARTIFACT_HEADERS);
  if (!artifacts.length) {
    return json(res, 400, { ok: false, message: '当前权限范围内暂无成果，无法导出目录结构。' });
  }

  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const rootDirName = `素材目录模板_${stamp}`;
  const tempBase = await fs.mkdtemp(path.join(os.tmpdir(), 'tcsp-artifact-folders-'));
  const exportRoot = path.join(tempBase, rootDirName);

  try {
    await fs.mkdir(exportRoot, { recursive: true });
    for (const row of artifacts) {
      const artifactId = String(row.artifact_id || '').trim();
      if (!artifactId) continue;
      const artifactName = safeFolderPart(row.artifact_name || '');
      const folderName = `${artifactId}_${artifactName}`;
      const folderPath = path.join(exportRoot, folderName);
      await fs.mkdir(folderPath, { recursive: true });
      await fs.writeFile(
        path.join(folderPath, '请将素材放在此目录.txt'),
        '请将该成果的图片/视频/PDF放在当前目录，然后在收集器里执行目录一键导入。\n',
        'utf8'
      );
    }

    const zipFilename = `artifact_folders_template_${stamp}.zip`;
    const zip = spawn('zip', ['-r', '-', rootDirName], { cwd: tempBase });
    let stderr = '';
    zip.stderr.on('data', (buf) => { stderr += String(buf || ''); });
    zip.on('error', async (err) => {
      await fs.rm(tempBase, { recursive: true, force: true });
      if (!res.headersSent) {
        const msg = err?.code === 'ENOENT'
          ? '服务器缺少 zip 命令，无法导出目录压缩包。'
          : `导出失败：${err.message}`;
        json(res, 500, { ok: false, message: msg });
      } else {
        res.destroy();
      }
    });

    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipFilename}"; filename*=UTF-8''${encodeURIComponent(zipFilename)}`,
      'Cache-Control': 'no-store',
      ...corsHeaders()
    });
    zip.stdout.pipe(res);
    zip.on('close', async (code) => {
      await fs.rm(tempBase, { recursive: true, force: true });
      if (code !== 0 && !res.writableEnded) {
        res.end();
      }
      if (code !== 0) {
        console.error(`导出素材目录模板失败: zip exit ${code}. ${stderr.trim()}`);
      }
    });
  } catch (error) {
    await fs.rm(tempBase, { recursive: true, force: true });
    return json(res, 500, { ok: false, message: `导出目录结构失败：${error.message}` });
  }
}

async function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/src/index.html' : pathname;
  if (rel === '/collector') rel = '/src/collector.html';
  if (rel === '/src' || rel === '/src/') rel = '/src/index.html';

  const safePath = path.normalize(rel).replace(/^\.\.(\/|\\|$)+/, '');
  let baseDir = ROOT;
  let suffix = safePath;
  if (safePath.startsWith('/data/')) {
    baseDir = DATA_DIR;
    suffix = safePath.slice('/data/'.length);
  } else if (safePath.startsWith('/uploads/')) {
    baseDir = UPLOADS_DIR;
    suffix = safePath.slice('/uploads/'.length);
  }
  const full = path.join(baseDir, suffix);

  if (!full.startsWith(baseDir)) {
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
    const headers = { 'Content-Type': mime };
    if (safePath.startsWith('/src/')) {
      headers['Cache-Control'] = 'no-store, no-cache, must-revalidate';
      headers.Pragma = 'no-cache';
      headers.Expires = '0';
    }
    if (safePath.startsWith('/data/')) {
      headers['Cache-Control'] = 'no-store';
    }
    res.writeHead(200, headers);
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

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    return handleAuthLogin(req, res);
  }

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    return handleAuthMe(req, res);
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    return handleAuthLogout(req, res);
  }

  if (pathname === '/api/collector/base' && req.method === 'GET') {
    return handleCollectorBase(req, res);
  }

  if (pathname === '/api/admin/backup' && req.method === 'POST') {
    return handleAdminBackup(req, res);
  }

  if (pathname === '/api/artifact-folders/export' && req.method === 'GET') {
    return handleArtifactFoldersExport(req, res);
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

ensureRuntimeDirs()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Portal server running at http://localhost:${PORT}`);
      console.log(`- 首页: http://localhost:${PORT}/src/index.html`);
      console.log(`- 收集器: http://localhost:${PORT}/src/collector.html`);
      console.log(`- 上传API: http://localhost:${PORT}/api/upload`);
      console.log(`- 发布API: http://localhost:${PORT}/api/publish`);
      console.log(`- 数据目录: ${DATA_DIR}`);
      console.log(`- 上传目录: ${UPLOADS_DIR}`);
      console.log(`- 备份目录: ${BACKUP_DIR}`);
    });
  })
  .catch((error) => {
    console.error(`启动失败：${error.message}`);
    process.exit(1);
  });
