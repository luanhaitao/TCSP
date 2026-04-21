import { CONFIG } from './config.js';
import { loadAllTables } from './data-source.js';
import { uploadLocalFile } from './uploader.js';

const STORAGE_KEY = 'tcsp_collector_drafts_v1';

const CLUB_HEADERS = [
  'club_id', 'club_name', 'teacher', 'grade_range', 'student_count', 'club_category', 'intro',
  'learned_topics', 'done_items', 'highlights', 'harvest', 'cover_url', 'status'
];
const CLUB_CN_HEADERS = [
  '社团ID',
  '社团名称',
  '执教教师',
  '面向年级',
  '学员人数',
  '展馆类别',
  '社团简介',
  '本学期学了什么',
  '我们做了什么',
  '过程亮点',
  '整体收获',
  '封面图链接',
  '展示状态'
];
const CLUB_CN_TO_KEY = {
  社团ID: 'club_id',
  社团名称: 'club_name',
  执教教师: 'teacher',
  面向年级: 'grade_range',
  学员人数: 'student_count',
  展馆类别: 'club_category',
  社团简介: 'intro',
  本学期学了什么: 'learned_topics',
  我们做了什么: 'done_items',
  过程亮点: 'highlights',
  整体收获: 'harvest',
  封面图链接: 'cover_url',
  展示状态: 'status'
};
const ARTIFACT_HEADERS = [
  'artifact_id', 'student_alias', 'grade', 'club_id', 'artifact_name', 'artifact_type', 'keywords',
  'participation', 'artifact_intro', 'one_line_harvest', 'growth_evidence', 'teacher_comment', 'updated_at'
];
const MEDIA_HEADERS = [
  'media_id', 'owner_type', 'owner_id', 'media_type', 'url', 'thumbnail_url', 'copyright_status', 'notes'
];
const ARTIFACT_CN_HEADERS = [
  '成果ID',
  '学员姓名',
  '年级',
  '所属社团',
  '成果名称',
  '成果类型',
  '关键词',
  '我的参与内容',
  '成果简介',
  '一句话收获',
  '成长证据',
  '教师简评'
];
const ARTIFACT_CN_TO_KEY = {
  成果ID: 'artifact_id',
  学员姓名: 'student_alias',
  年级: 'grade',
  所属社团: 'club_id',
  成果名称: 'artifact_name',
  成果类型: 'artifact_type',
  关键词: 'keywords',
  我的参与内容: 'participation',
  成果简介: 'artifact_intro',
  一句话收获: 'one_line_harvest',
  成长证据: 'growth_evidence',
  教师简评: 'teacher_comment'
};
const ARTIFACT_TYPES = new Set(['作品', '任务', '探究', '表达']);
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
const VIDEO_EXTS = new Set(['mp4', 'mov', 'webm']);
const DOC_EXTS = new Set(['pdf']);
const MEDIA_FOLDER_PATTERN = /^([A-Za-z]\\d+)_/;
const TABLE_HEADER_LABELS = {
  clubs: {
    club_id: '社团ID',
    club_name: '社团名称',
    teacher: '执教教师',
    grade_range: '面向年级',
    student_count: '学员人数',
    club_category: '展馆类别',
    intro: '社团简介',
    learned_topics: '本学期学了什么',
    done_items: '我们做了什么',
    highlights: '过程亮点',
    harvest: '整体收获',
    cover_url: '封面图链接',
    status: '展示状态'
  },
  artifacts: {
    artifact_id: '成果ID',
    student_alias: '学员姓名',
    grade: '年级',
    club_id: '所属社团',
    artifact_name: '成果名称',
    artifact_type: '成果类型',
    keywords: '关键词',
    participation: '我的参与内容',
    artifact_intro: '成果简介',
    one_line_harvest: '一句话收获',
    growth_evidence: '成长证据',
    teacher_comment: '教师简评',
    updated_at: '更新时间'
  },
  media: {
    media_id: '素材ID',
    owner_type: '归属类型',
    owner_id: '归属ID',
    media_type: '素材类型',
    url: '素材URL',
    thumbnail_url: '视频缩略图URL',
    copyright_status: '版权状态',
    notes: '备注'
  }
};

const state = {
  base: { clubs: [], artifacts: [], media: [] },
  drafts: loadDrafts(),
  editing: {
    clubs: null,
    artifacts: null,
    media: null
  }
};

function byId(id) {
  return document.getElementById(id);
}

function loadDrafts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { clubs: [], artifacts: [], media: [] };
    const parsed = JSON.parse(raw);
    return {
      clubs: Array.isArray(parsed.clubs) ? parsed.clubs : [],
      artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts : [],
      media: Array.isArray(parsed.media) ? parsed.media : []
    };
  } catch {
    return { clubs: [], artifacts: [], media: [] };
  }
}

function saveDrafts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.drafts));
}

function setStatus(text, isWarn = false) {
  const el = byId('status');
  el.textContent = text;
  el.className = isWarn ? 'status warn' : 'status';
}

function setActionStatus(id, text, isWarn = false) {
  const el = byId(id);
  if (!el) return;
  el.textContent = text;
  el.className = isWarn ? 'action-status warn' : 'action-status';
}

function setButtonBusy(buttonId, busyText, fn) {
  const btn = byId(buttonId);
  const oldText = btn.textContent;
  const wasDisabled = btn.disabled;
  btn.disabled = true;
  btn.textContent = busyText;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      btn.disabled = wasDisabled;
      btn.textContent = oldText;
    });
}

function getXlsx() {
  const xlsx = globalThis.XLSX;
  if (!xlsx) {
    throw new Error('未加载 Excel 解析组件，请检查网络后刷新页面再试。');
  }
  return xlsx;
}

function tryGetXlsx() {
  return globalThis.XLSX || null;
}

function nowText() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function parseIdNumber(id, prefix) {
  if (!id || !id.startsWith(prefix)) return 0;
  const n = Number(id.slice(prefix.length));
  return Number.isFinite(n) ? n : 0;
}

function nextId(prefix, baseList, draftList, keyName) {
  const maxBase = baseList.reduce((max, item) => Math.max(max, parseIdNumber(item[keyName], prefix)), 0);
  const maxDraft = draftList.reduce((max, item) => Math.max(max, parseIdNumber(item[keyName], prefix)), 0);
  const next = Math.max(maxBase, maxDraft) + 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(headers, rows) {
  const lines = [headers.join(',')];
  rows.forEach((row) => {
    lines.push(headers.map((h) => csvEscape(row[h] ?? '')).join(','));
  });
  return lines.join('\n');
}

function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(filename, blob);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadXlsxWorkbook(wb, filename) {
  const XLSX = getXlsx();
  const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  downloadBlob(filename, blob);
}

function triggerServerDownload(url) {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadCsvTemplatePair(baseName, headers, sampleRow, guideRows = []) {
  const date = new Date().toISOString().slice(0, 10);
  const templateName = `${baseName}_${date}.csv`;
  const guideName = `${baseName}_guide_${date}.csv`;
  downloadCsv(templateName, toCsv(headers, [sampleRow]));
  if (guideRows.length) {
    downloadCsv(guideName, toCsv(['项目', '说明'], guideRows));
  }
}

function required(v) {
  return String(v ?? '').trim().length > 0;
}

function isUrl(v) {
  if (!v) return true;
  if (String(v).trim().startsWith('/')) return true;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function isLocalUploadMode() {
  return Boolean(CONFIG.assetUpload?.enabled) && CONFIG.assetUpload?.provider === 'local';
}

function getFileExt(name) {
  const raw = String(name || '').toLowerCase();
  const idx = raw.lastIndexOf('.');
  if (idx === -1) return '';
  return raw.slice(idx + 1);
}

function getBaseName(name) {
  const raw = String(name || '');
  const idx = raw.lastIndexOf('.');
  if (idx === -1) return raw;
  return raw.slice(0, idx);
}

function detectMediaTypeFromFile(file) {
  const ext = getFileExt(file?.name);
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (DOC_EXTS.has(ext)) return 'pdf';
  return '';
}

function getArtifactFolderNameFromRelativePath(relativePath) {
  const parts = String(relativePath || '').split('/').filter(Boolean);
  if (parts.length < 2) return '';
  if (parts.length === 2) return parts[0];
  return parts[1];
}

function parseOwnerIdFromFolder(folderName) {
  const m = String(folderName || '').match(MEDIA_FOLDER_PATTERN);
  if (!m) return '';
  return m[1].toUpperCase();
}

function setActiveTab(tabName) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('is-active'));
  document.querySelectorAll('.panel').forEach((p) => p.classList.remove('is-active'));
  const tab = document.querySelector(`.tab[data-tab="${tabName}"]`);
  const panel = byId(`tab-${tabName}`);
  if (tab) tab.classList.add('is-active');
  if (panel) panel.classList.add('is-active');
}

function allClubs() {
  const map = new Map();
  const order = [];
  [...state.base.clubs, ...state.drafts.clubs].forEach((club) => {
    const id = String(club.club_id || '').trim();
    if (!id) return;
    if (!map.has(id)) order.push(id);
    map.set(id, club);
  });
  return order.map((id) => map.get(id)).filter(Boolean);
}

function allArtifacts() {
  const map = new Map();
  const order = [];
  [...state.base.artifacts, ...state.drafts.artifacts].forEach((artifact) => {
    const id = String(artifact.artifact_id || '').trim();
    if (!id) return;
    if (!map.has(id)) order.push(id);
    map.set(id, artifact);
  });
  return order.map((id) => map.get(id)).filter(Boolean);
}

function allMedia() {
  const map = new Map();
  const order = [];
  [...state.base.media, ...state.drafts.media].forEach((item) => {
    const id = String(item.media_id || '').trim();
    if (!id) return;
    if (!map.has(id)) order.push(id);
    map.set(id, item);
  });
  return order.map((id) => map.get(id)).filter(Boolean);
}

function hasAnyDraft() {
  return state.drafts.clubs.length > 0 || state.drafts.artifacts.length > 0 || state.drafts.media.length > 0;
}

function buildClubNameCountMap(clubs) {
  const map = new Map();
  clubs.forEach((club) => {
    const name = String(club.club_name || '').trim();
    if (!name) return;
    map.set(name, (map.get(name) || 0) + 1);
  });
  return map;
}

function getClubOptionLabel(club, nameCountMap) {
  const name = String(club.club_name || '').trim();
  const id = String(club.club_id || '').trim();
  if (!name) return id || '未命名社团';
  const count = nameCountMap.get(name) || 0;
  if (count > 1 && id) return `${name}（${id}）`;
  return name;
}

function resolveClubInputToId(rawValue, clubs) {
  const value = String(rawValue || '').trim();
  if (!value) return { clubId: '', reason: 'empty' };

  const byId = clubs.find((c) => String(c.club_id || '').trim() === value);
  if (byId) return { clubId: byId.club_id, reason: 'id' };

  const byName = clubs.filter((c) => String(c.club_name || '').trim() === value);
  if (byName.length === 1) return { clubId: byName[0].club_id, reason: 'name' };
  if (byName.length > 1) return { clubId: '', reason: 'ambiguous' };

  return { clubId: '', reason: 'not_found' };
}

function refreshSelectOptions() {
  const clubSelect = byId('artifact_club_id');
  const ownerId = byId('owner_id');
  const currentClubId = clubSelect.value;
  const currentOwnerType = byId('owner_type').value || 'artifact';
  const currentOwnerId = ownerId.value;

  const clubs = allClubs();
  const nameCountMap = buildClubNameCountMap(clubs);
  clubSelect.innerHTML = clubs.length
    ? clubs.map((c) => `<option value="${c.club_id}">${getClubOptionLabel(c, nameCountMap)}</option>`).join('')
    : '<option value="">请先新增社团</option>';
  if (currentClubId && clubs.some((c) => c.club_id === currentClubId)) {
    clubSelect.value = currentClubId;
  }

  if (currentOwnerType === 'club') {
    ownerId.innerHTML = clubs.length
      ? clubs.map((c) => `<option value="${c.club_id}">${getClubOptionLabel(c, nameCountMap)}</option>`).join('')
      : '<option value="">请先新增社团</option>';
  } else {
    const artifacts = allArtifacts();
    ownerId.innerHTML = artifacts.length
      ? artifacts.map((a) => `<option value="${a.artifact_id}">${a.artifact_id} - ${a.artifact_name}</option>`).join('')
      : '<option value="">请先新增成果</option>';
  }
  if ([...ownerId.options].some((o) => o.value === currentOwnerId)) {
    ownerId.value = currentOwnerId;
  }
}

function loadDraftRowToForm(type, idx) {
  const row = state.drafts[type]?.[idx];
  if (!row) return;

  if (type === 'clubs') {
    byId('club_id').value = row.club_id || '';
    byId('club_name').value = row.club_name || '';
    byId('teacher').value = row.teacher || '';
    byId('grade_range').value = row.grade_range || '';
    byId('student_count').value = row.student_count || '';
    byId('club_category').value = row.club_category || '';
    byId('intro').value = row.intro || '';
    byId('learned_topics').value = row.learned_topics || '';
    byId('done_items').value = row.done_items || '';
    byId('highlights').value = row.highlights || '';
    byId('harvest').value = row.harvest || '';
    byId('cover_url').value = row.cover_url || '';
    byId('status_field').value = row.status || 'active';
    state.editing.clubs = idx;
    setActiveTab('club');
    setStatus(`已载入社团草稿进行编辑：${row.club_name || row.club_id}`);
    return;
  }

  if (type === 'artifacts') {
    byId('artifact_id').value = row.artifact_id || '';
    byId('student_alias').value = row.student_alias || '';
    byId('grade').value = row.grade || '';
    refreshSelectOptions();
    byId('artifact_club_id').value = row.club_id || '';
    byId('artifact_name').value = row.artifact_name || '';
    byId('artifact_type').value = row.artifact_type || '作品';
    byId('keywords').value = row.keywords || '';
    byId('participation').value = row.participation || '';
    byId('artifact_intro').value = row.artifact_intro || '';
    byId('one_line_harvest').value = row.one_line_harvest || '';
    byId('growth_evidence').value = row.growth_evidence || '';
    byId('teacher_comment').value = row.teacher_comment || '';
    byId('updated_at').value = row.updated_at || nowText();
    state.editing.artifacts = idx;
    setActiveTab('artifact');
    setStatus(`已载入成果草稿进行编辑：${row.artifact_name || row.artifact_id}`);
    return;
  }

  if (type === 'media') {
    byId('media_id').value = row.media_id || '';
    byId('owner_type').value = row.owner_type || 'artifact';
    refreshSelectOptions();
    byId('owner_id').value = row.owner_id || '';
    byId('media_type').value = row.media_type || 'image';
    byId('media_url').value = row.url || '';
    byId('thumbnail_url').value = row.thumbnail_url || '';
    byId('copyright_status').value = row.copyright_status || '';
    byId('notes').value = row.notes || '';
    state.editing.media = idx;
    setActiveTab('media');
    setStatus(`已载入素材草稿进行编辑：${row.media_id}`);
  }
}

function renderTable(containerId, headers, rows, type) {
  const container = byId(containerId);
  if (!rows.length) {
    container.innerHTML = '<p class="small">暂无草稿数据</p>';
    return;
  }

  const labelMap = TABLE_HEADER_LABELS[type] || {};
  const head = headers.map((h) => `<th>${labelMap[h] || h}</th>`).join('');
  const body = rows
    .map((row, idx) => {
      const tds = headers.map((h) => `<td>${formatTableCell(type, h, row[h])}</td>`).join('');
      return `<tr><td><button data-edit="${type}" data-idx="${idx}">编辑</button> <button data-del="${type}" data-idx="${idx}">删除</button></td>${tds}</tr>`;
    })
    .join('');

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>操作</th>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('button[data-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const list = state.drafts[btn.dataset.del];
      list.splice(Number(btn.dataset.idx), 1);
      saveDrafts();
      renderDrafts();
      refreshSelectOptions();
      setStatus('已删除 1 条草稿记录');
    });
  });

  container.querySelectorAll('button[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      loadDraftRowToForm(btn.dataset.edit, Number(btn.dataset.idx));
    });
  });
}

function formatTableCell(type, key, rawValue) {
  const value = String(rawValue ?? '');
  if (type === 'clubs' && key === 'status') {
    if (value === 'active') return '展示中';
    if (value === 'archived') return '暂不展示';
  }
  if (type === 'media' && key === 'owner_type') {
    if (value === 'artifact') return '成果';
    if (value === 'club') return '社团';
  }
  if (type === 'media' && key === 'media_type') {
    if (value === 'image') return '图片';
    if (value === 'video') return '视频';
    if (value === 'pdf') return '文档';
  }
  return value;
}

function renderDrafts() {
  renderTable('clubDrafts', CLUB_HEADERS, state.drafts.clubs, 'clubs');
  renderTable('artifactDrafts', ARTIFACT_HEADERS, state.drafts.artifacts, 'artifacts');
  renderTable('mediaDrafts', MEDIA_HEADERS, state.drafts.media, 'media');
}

function clearForm(prefix) {
  const fields = document.querySelectorAll(`[id^="${prefix}"]`);
  fields.forEach((f) => {
    if (f.tagName === 'SELECT') return;
    f.value = '';
  });
}

function bindTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('is-active'));
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('is-active'));
      tab.classList.add('is-active');
      byId(`tab-${tab.dataset.tab}`).classList.add('is-active');
    });
  });
}

function bindGenerators() {
  document.querySelectorAll('button[data-gen]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.gen;
      if (key === 'club_id') byId('club_id').value = nextId('C', state.base.clubs, state.drafts.clubs, 'club_id');
      if (key === 'artifact_id') byId('artifact_id').value = nextId('A', state.base.artifacts, state.drafts.artifacts, 'artifact_id');
      if (key === 'media_id') byId('media_id').value = nextId('M', state.base.media, state.drafts.media, 'media_id');
      if (key === 'updated_at') byId('updated_at').value = nowText();
    });
  });
}

function getNextArtifactId() {
  return nextId('A', state.base.artifacts, state.drafts.artifacts, 'artifact_id');
}

function getNextClubId() {
  return nextId('C', state.base.clubs, state.drafts.clubs, 'club_id');
}

function createClubRowFromChinese(sourceRow) {
  const row = {};
  for (const key of CLUB_HEADERS) row[key] = '';

  for (const [cn, internal] of Object.entries(CLUB_CN_TO_KEY)) {
    row[internal] = String(sourceRow[cn] ?? '').trim();
  }

  if (!row.club_id) row.club_id = getNextClubId();
  if (!row.status || !['active', 'archived'].includes(row.status)) row.status = 'active';
  return row;
}

function upsertClubDraft(row) {
  const idx = state.drafts.clubs.findIndex((item) => item.club_id === row.club_id);
  if (idx === -1) {
    state.drafts.clubs.push(row);
    return 'insert';
  }
  state.drafts.clubs[idx] = row;
  return 'update';
}

function downloadClubTemplate() {
  try {
    if (location.protocol.startsWith('http')) {
      triggerServerDownload('/api/template/club.csv');
      setActionStatus('clubImportStatus', '模板下载已开始（CSV）。');
      setStatus('模板下载已开始。');
      return;
    }

    const XLSX = tryGetXlsx();
    const sample = {
      社团ID: '',
      社团名称: '智能编程社',
      执教教师: '张老师',
      面向年级: '四-六年级',
      学员人数: '36',
      展馆类别: '智能编程馆（推荐选项见填写说明页）',
      社团简介: '围绕编程思维开展项目实践',
      本学期学了什么: '逻辑;调试;建模',
      我们做了什么: '完成循迹挑战和红绿灯任务',
      过程亮点: '两轮迭代优化',
      整体收获: '协作与表达能力提升',
      封面图链接: '/uploads/2026-04/example_cover.jpg',
      展示状态: 'active'
    };
    const guideRows = [
      { 项目: '社团类别（展馆类别）推荐值', 说明: '建议使用以下统一类别，便于首页分馆展示与筛选。' },
      { 项目: '可选类别1', 说明: '智能编程馆' },
      { 项目: '可选类别2', 说明: '工程设计馆' },
      { 项目: '可选类别3', 说明: '科学探究馆' },
      { 项目: '可选类别4', 说明: '数字创意馆' },
      { 项目: '填写建议', 说明: '尽量从上述类别中选择，不建议自由发挥写法。' }
    ];
    if (XLSX) {
      const ws = XLSX.utils.json_to_sheet([sample], { header: CLUB_CN_HEADERS });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '社团信息导入模板');
      const guideWs = XLSX.utils.json_to_sheet(guideRows, { header: ['项目', '说明'] });
      XLSX.utils.book_append_sheet(wb, guideWs, '填写说明');
      downloadXlsxWorkbook(wb, `club_template_${new Date().toISOString().slice(0, 10)}.xlsx`);
      setActionStatus('clubImportStatus', '社团模板下载成功，可直接填写后导入。');
      setStatus('社团模板下载成功，可直接填写后导入。');
      return;
    }

    downloadCsvTemplatePair('club_template', CLUB_CN_HEADERS, sample, guideRows);
    setActionStatus('clubImportStatus', 'Excel组件不可用，已自动下载 CSV 模板与填写说明。');
    setStatus('已下载 CSV 模板（离线模式）。');
  } catch (error) {
    setActionStatus('clubImportStatus', `社团模板下载失败：${error.message}`, true);
    setStatus(`社团模板下载失败：${error.message}`, true);
  }
}

async function importClubExcel() {
  const file = byId('clubImportFile').files?.[0];
  if (!file) {
    setActionStatus('clubImportStatus', '请先选择要导入的社团 Excel 文件。', true);
    setStatus('请先选择要导入的社团 Excel 文件。', true);
    return;
  }

  setActionStatus('clubImportStatus', '正在导入社团数据，请稍候...');
  await setButtonBusy('importClubBtn', '正在导入...', async () => {
    try {
      const XLSX = getXlsx();
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const firstName = wb.SheetNames[0];
      if (!firstName) throw new Error('Excel 文件没有可读取的工作表。');

      const ws = wb.Sheets[firstName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!rows.length) throw new Error('导入失败：Excel 没有数据行。');

      if (!('社团名称' in rows[0]) || !('执教教师' in rows[0])) {
        throw new Error('导入失败：缺少必要字段“社团名称”或“执教教师”。');
      }

      let inserted = 0;
      let updated = 0;
      let skipped = 0;

      for (const raw of rows) {
        const row = createClubRowFromChinese(raw);
        if (!required(row.club_name) || !required(row.teacher)) {
          skipped += 1;
          continue;
        }
        if (row.cover_url && !isUrl(row.cover_url)) {
          skipped += 1;
          continue;
        }

        const result = upsertClubDraft(row);
        if (result === 'insert') inserted += 1;
        if (result === 'update') updated += 1;
      }

      saveDrafts();
      renderDrafts();
      refreshSelectOptions();
      setActionStatus('clubImportStatus', `社团导入完成：新增 ${inserted} 条，更新 ${updated} 条，跳过 ${skipped} 条。`);
      setStatus(`社团导入完成：新增 ${inserted} 条，更新 ${updated} 条，跳过 ${skipped} 条。`);
    } catch (error) {
      setActionStatus('clubImportStatus', `社团导入失败：${error.message}`, true);
      setStatus(`社团导入失败：${error.message}`, true);
    }
  });
}

function createArtifactRowFromChinese(sourceRow) {
  const row = {};
  for (const key of ARTIFACT_HEADERS) row[key] = '';

  for (const [cn, internal] of Object.entries(ARTIFACT_CN_TO_KEY)) {
    row[internal] = String(sourceRow[cn] ?? '').trim();
  }
  // 兼容旧模板字段“学员化名”
  if (!row.student_alias) {
    row.student_alias = String(sourceRow['学员化名'] ?? '').trim();
  }

  // 兼容旧模板字段“所属社团ID”
  if (!row.club_id) {
    row.club_id = String(sourceRow['所属社团ID'] ?? '').trim();
  }

  if (!row.artifact_id) row.artifact_id = getNextArtifactId();
  row.updated_at = nowText();
  if (!row.artifact_type) row.artifact_type = '作品';

  return row;
}

function upsertArtifactDraft(row) {
  const idx = state.drafts.artifacts.findIndex((item) => item.artifact_id === row.artifact_id);
  if (idx === -1) {
    state.drafts.artifacts.push(row);
    return 'insert';
  }
  state.drafts.artifacts[idx] = row;
  return 'update';
}

function downloadArtifactTemplate() {
  try {
    if (location.protocol.startsWith('http')) {
      triggerServerDownload('/api/template/artifact.csv');
      setActionStatus('artifactImportStatus', '模板下载已开始（CSV）。');
      setStatus('模板下载已开始。');
      return;
    }

    const XLSX = tryGetXlsx();
    const sample = {
      成果ID: '',
      学员姓名: '张三',
      年级: '五年级',
      所属社团: allClubs()[0]?.club_name || '智能编程社',
      成果名称: '示例成果名称',
      成果类型: '作品',
      关键词: '编程 调试',
      我的参与内容: '负责核心功能实现',
      成果简介: '完成了一个可展示的成果',
      一句话收获: '我学会了拆解复杂任务',
      成长证据: '经过两轮迭代优化',
      教师简评: '表达清晰，过程完整',
    };
    const guideRows = [
      { 项目: '学员姓名字段填写规则', 说明: '可填写多人姓名（用“、”分隔）或直接填写小组名称。' },
      { 项目: '多人示例', 说明: '学员姓名 = 张三、李四、王五' },
      { 项目: '小组示例', 说明: '学员姓名 = 未来创客队' },
      { 项目: '所属社团字段填写规则', 说明: '优先填写“社团名称”；若存在同名社团，请填写社团ID（如 C001）。' },
      { 项目: '推荐写法', 说明: '所属社团 = 智能编程社' },
      { 项目: '重名写法', 说明: '所属社团 = C001' }
    ];
    if (XLSX) {
      const ws = XLSX.utils.json_to_sheet([sample], { header: ARTIFACT_CN_HEADERS });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '学员成果导入模板');
      const guideWs = XLSX.utils.json_to_sheet(guideRows, { header: ['项目', '说明'] });
      XLSX.utils.book_append_sheet(wb, guideWs, '填写说明');
      downloadXlsxWorkbook(wb, `artifact_template_${new Date().toISOString().slice(0, 10)}.xlsx`);
      setActionStatus('artifactImportStatus', '成果模板下载成功，可直接填写后导入。');
      setStatus('模板下载成功，可直接填写后导入。');
      return;
    }

    downloadCsvTemplatePair('artifact_template', ARTIFACT_CN_HEADERS, sample, guideRows);
    setActionStatus('artifactImportStatus', 'Excel组件不可用，已自动下载 CSV 模板与填写说明。');
    setStatus('已下载 CSV 模板（离线模式）。');
  } catch (error) {
    setActionStatus('artifactImportStatus', `成果模板下载失败：${error.message}`, true);
    setStatus(`模板下载失败：${error.message}`, true);
  }
}

async function importArtifactExcel() {
  const file = byId('artifactImportFile').files?.[0];
  if (!file) {
    setActionStatus('artifactImportStatus', '请先选择要导入的 Excel 文件。', true);
    setStatus('请先选择要导入的 Excel 文件。', true);
    return;
  }

  setActionStatus('artifactImportStatus', '正在导入成果数据，请稍候...');
  await setButtonBusy('importArtifactBtn', '正在导入...', async () => {
    try {
      const XLSX = getXlsx();
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const firstName = wb.SheetNames[0];
      if (!firstName) throw new Error('Excel 文件没有可读取的工作表。');

      const ws = wb.Sheets[firstName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!rows.length) throw new Error('导入失败：Excel 没有数据行。');

      const missingHeaders = ARTIFACT_CN_HEADERS.filter((h) => !(h in rows[0]));
      if (missingHeaders.length) {
        throw new Error(`导入失败：缺少字段 ${missingHeaders.join('、')}`);
      }

      let inserted = 0;
      let updated = 0;
      let skipped = 0;
      let ambiguousClub = 0;
      let notFoundClub = 0;
      const clubs = allClubs();

      for (const raw of rows) {
        const row = createArtifactRowFromChinese(raw);

        const resolved = resolveClubInputToId(row.club_id, clubs);
        if (resolved.reason === 'ambiguous') {
          ambiguousClub += 1;
          skipped += 1;
          continue;
        }
        if (resolved.reason === 'not_found') {
          notFoundClub += 1;
          skipped += 1;
          continue;
        }
        row.club_id = resolved.clubId;

        if (!required(row.grade) || !required(row.club_id) || !required(row.artifact_name)) {
          skipped += 1;
          continue;
        }
        if (!ARTIFACT_TYPES.has(row.artifact_type)) {
          skipped += 1;
          continue;
        }

        const result = upsertArtifactDraft(row);
        if (result === 'insert') inserted += 1;
        if (result === 'update') updated += 1;
      }

      saveDrafts();
      renderDrafts();
      refreshSelectOptions();
      const extra = [];
      if (ambiguousClub) extra.push(`同名社团无法判定 ${ambiguousClub} 条（请改填社团ID）`);
      if (notFoundClub) extra.push(`未匹配到社团 ${notFoundClub} 条`);
      setActionStatus('artifactImportStatus', `导入完成：新增 ${inserted} 条，更新 ${updated} 条，跳过 ${skipped} 条。${extra.join('；')}`);
      setStatus(`导入完成：新增 ${inserted} 条，更新 ${updated} 条，跳过 ${skipped} 条。${extra.join('；')}`);
    } catch (error) {
      setActionStatus('artifactImportStatus', `导入失败：${error.message}`, true);
      setStatus(`导入失败：${error.message}`, true);
    }
  });
}

function bindSaves() {
  byId('saveClub').addEventListener('click', () => {
    const row = {
      club_id: byId('club_id').value.trim(),
      club_name: byId('club_name').value.trim(),
      teacher: byId('teacher').value.trim(),
      grade_range: byId('grade_range').value.trim(),
      student_count: byId('student_count').value.trim(),
      club_category: byId('club_category').value.trim(),
      intro: byId('intro').value.trim(),
      learned_topics: byId('learned_topics').value.trim(),
      done_items: byId('done_items').value.trim(),
      highlights: byId('highlights').value.trim(),
      harvest: byId('harvest').value.trim(),
      cover_url: byId('cover_url').value.trim(),
      status: byId('status_field').value
    };

    if (!required(row.club_id) || !required(row.club_name) || !required(row.teacher) || !required(row.status)) {
      setActionStatus('clubSaveStatus', '社团信息保存失败：请先填写所有必填项（红星项）。', true);
      setStatus('社团信息保存失败：请先填写所有必填项（红星项）', true);
      return;
    }
    if (!isUrl(row.cover_url)) {
      setActionStatus('clubSaveStatus', '社团信息保存失败：封面图链接不是有效地址。', true);
      setStatus('社团信息保存失败：封面图链接不是有效的 http/https 地址', true);
      return;
    }

    const sameIdClubIdx = state.drafts.clubs.findIndex((item) => item.club_id === row.club_id);
    if (state.editing.clubs !== null && state.drafts.clubs[state.editing.clubs]) {
      state.drafts.clubs[state.editing.clubs] = row;
      state.editing.clubs = null;
      setActionStatus('clubSaveStatus', `社团信息已更新并保存到草稿库：${row.club_name}`);
      setStatus(`社团信息已更新：${row.club_name}`);
    } else if (sameIdClubIdx !== -1) {
      state.drafts.clubs[sameIdClubIdx] = row;
      setActionStatus('clubSaveStatus', `社团信息已按ID覆盖并保存到草稿库：${row.club_name}`);
      setStatus(`社团信息已按ID覆盖更新：${row.club_name}`);
    } else {
      state.drafts.clubs.push(row);
      setActionStatus('clubSaveStatus', `社团信息保存成功：${row.club_name}`);
      setStatus(`社团信息已保存：${row.club_name}`);
    }
    saveDrafts();
    renderDrafts();
    refreshSelectOptions();
  });

  byId('saveArtifact').addEventListener('click', () => {
    const row = {
      artifact_id: byId('artifact_id').value.trim(),
      student_alias: byId('student_alias').value.trim(),
      grade: byId('grade').value.trim(),
      club_id: byId('artifact_club_id').value,
      artifact_name: byId('artifact_name').value.trim(),
      artifact_type: byId('artifact_type').value,
      keywords: byId('keywords').value.trim(),
      participation: byId('participation').value.trim(),
      artifact_intro: byId('artifact_intro').value.trim(),
      one_line_harvest: byId('one_line_harvest').value.trim(),
      growth_evidence: byId('growth_evidence').value.trim(),
      teacher_comment: byId('teacher_comment').value.trim(),
      updated_at: byId('updated_at').value.trim() || nowText()
    };

    if (!required(row.artifact_id) || !required(row.student_alias) || !required(row.grade) || !required(row.club_id)
      || !required(row.artifact_name) || !required(row.artifact_type)) {
      setActionStatus('artifactSaveStatus', '成果保存失败：请先填写所有必填项（红星项）。', true);
      setStatus('成果保存失败：请先填写所有必填项（红星项）', true);
      return;
    }

    const sameIdArtifactIdx = state.drafts.artifacts.findIndex((item) => item.artifact_id === row.artifact_id);
    if (state.editing.artifacts !== null && state.drafts.artifacts[state.editing.artifacts]) {
      state.drafts.artifacts[state.editing.artifacts] = row;
      state.editing.artifacts = null;
      setActionStatus('artifactSaveStatus', `成果信息已更新并保存到草稿库：${row.artifact_name}`);
      setStatus(`成果信息已更新：${row.artifact_name}`);
    } else if (sameIdArtifactIdx !== -1) {
      state.drafts.artifacts[sameIdArtifactIdx] = row;
      setActionStatus('artifactSaveStatus', `成果信息已按ID覆盖并保存到草稿库：${row.artifact_name}`);
      setStatus(`成果信息已按ID覆盖更新：${row.artifact_name}`);
    } else {
      state.drafts.artifacts.push(row);
      setActionStatus('artifactSaveStatus', `成果信息保存成功：${row.artifact_name}`);
      setStatus(`成果信息已保存：${row.artifact_name}`);
    }
    saveDrafts();
    renderDrafts();
    refreshSelectOptions();
  });

  byId('saveMedia').addEventListener('click', async () => {
    const row = {
      media_id: byId('media_id').value.trim(),
      owner_type: byId('owner_type').value,
      owner_id: byId('owner_id').value,
      media_type: byId('media_type').value,
      url: byId('media_url').value.trim(),
      thumbnail_url: byId('thumbnail_url').value.trim(),
      copyright_status: byId('copyright_status').value.trim(),
      notes: byId('notes').value.trim()
    };

    if (!required(row.media_id) || !required(row.owner_type) || !required(row.owner_id) || !required(row.media_type)) {
      setActionStatus('mediaSaveStatus', '素材保存失败：请先填写所有必填项（红星项）。', true);
      setStatus('素材保存失败：请先填写所有必填项（红星项）', true);
      return;
    }

    if (!row.url) {
      const file = byId('media_file').files?.[0];
      if (file && CONFIG.assetUpload?.enabled) {
        setActionStatus('mediaSaveStatus', '未填写素材URL，正在自动上传本地文件...');
        setStatus('未填写素材URL，正在自动上传本地文件...');
        try {
          const result = await uploadLocalFile(file, { publicId: `media_${Date.now()}` });
          row.url = result.url;
          row.media_type = result.mediaType;
          byId('media_url').value = row.url;
          byId('media_type').value = row.media_type;
        } catch (error) {
          setActionStatus('mediaSaveStatus', `素材保存失败：自动上传失败。${error.message}`, true);
          setStatus(`素材保存失败：自动上传失败。${error.message}`, true);
          return;
        }
      } else {
        setActionStatus('mediaSaveStatus', '素材保存失败：请填写素材URL或先上传文件。', true);
        setStatus('素材保存失败：请填写素材URL，或先选择本地素材文件上传。', true);
        return;
      }
    }

    if (!isUrl(row.url) || !isUrl(row.thumbnail_url)) {
      setActionStatus('mediaSaveStatus', '素材保存失败：链接不是有效的 http/https 地址。', true);
      setStatus('素材保存失败：链接不是有效的 http/https 地址', true);
      return;
    }

    const sameIdMediaIdx = state.drafts.media.findIndex((item) => item.media_id === row.media_id);
    if (state.editing.media !== null && state.drafts.media[state.editing.media]) {
      state.drafts.media[state.editing.media] = row;
      state.editing.media = null;
      setActionStatus('mediaSaveStatus', `素材信息已更新并保存到草稿库：${row.media_id}`);
      setStatus(`素材信息已更新：${row.media_id}`);
    } else if (sameIdMediaIdx !== -1) {
      state.drafts.media[sameIdMediaIdx] = row;
      setActionStatus('mediaSaveStatus', `素材信息已按ID覆盖并保存到草稿库：${row.media_id}`);
      setStatus(`素材信息已按ID覆盖更新：${row.media_id}`);
    } else {
      state.drafts.media.push(row);
      setActionStatus('mediaSaveStatus', `素材信息保存成功：${row.media_id}`);
      setStatus(`素材信息已保存：${row.media_id}`);
    }
    saveDrafts();
    renderDrafts();
    refreshSelectOptions();
  });
}

function bindClearActions() {
  byId('clearClub').addEventListener('click', () => {
    clearForm('club_');
    byId('cover_file').value = '';
    state.editing.clubs = null;
    setStatus('社团表单已清空，可继续新增');
  });
  byId('clearArtifact').addEventListener('click', () => {
    clearForm('artifact_');
    byId('student_alias').value = '';
    byId('grade').value = '';
    byId('keywords').value = '';
    byId('participation').value = '';
    byId('one_line_harvest').value = '';
    byId('growth_evidence').value = '';
    byId('teacher_comment').value = '';
    byId('updated_at').value = '';
    state.editing.artifacts = null;
    setStatus('成果表单已清空，可继续新增');
  });
  byId('clearMedia').addEventListener('click', () => {
    byId('media_id').value = '';
    byId('media_url').value = '';
    byId('media_file').value = '';
    byId('thumbnail_url').value = '';
    byId('copyright_status').value = '';
    byId('notes').value = '';
    state.editing.media = null;
    setStatus('素材表单已清空，可继续新增');
  });

  byId('clearDrafts').addEventListener('click', () => {
    if (!window.confirm('确认清空全部草稿吗？此操作不可撤销。')) return;
    state.drafts = { clubs: [], artifacts: [], media: [] };
    state.editing = { clubs: null, artifacts: null, media: null };
    saveDrafts();
    renderDrafts();
    refreshSelectOptions();
    setStatus('全部草稿已清空');
  });
}

function bindExports() {
  byId('exportAllCsv').addEventListener('click', () => {
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadCsv(`club_profile_draft_${ts}.csv`, toCsv(CLUB_HEADERS, state.drafts.clubs));
    downloadCsv(`student_artifact_draft_${ts}.csv`, toCsv(ARTIFACT_HEADERS, state.drafts.artifacts));
    downloadCsv(`media_asset_draft_${ts}.csv`, toCsv(MEDIA_HEADERS, state.drafts.media));
    setActionStatus('exportStatus', 'CSV 导出完成（共 3 个文件）。');
    setStatus('CSV 导出完成（共 3 个文件）');
  });
}

async function publishDrafts() {
  if (!CONFIG.publish?.enabled) {
    setActionStatus('publishStatus', '自动发布未启用，请联系管理员开启。', true);
    setStatus('自动发布未启用，请联系管理员在 config.js 开启 publish.enabled', true);
    return;
  }

  const clubs = state.drafts.clubs;
  const artifacts = state.drafts.artifacts;
  const media = state.drafts.media;

  if (!clubs.length && !artifacts.length && !media.length) {
    setActionStatus('publishStatus', '暂无可发布草稿，请先保存草稿。', true);
    setStatus('暂无可发布草稿，请先录入数据并保存到草稿库', true);
    return;
  }

  setActionStatus('publishStatus', '正在自动发布，请稍候...');
  setStatus('正在自动发布，请稍候...');

  try {
    const resp = await fetch(CONFIG.publish.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clubs,
        artifacts,
        media,
        published_at: nowText()
      })
    });

    const result = await resp.json();
    if (!resp.ok || !result.ok) {
      throw new Error(result?.message || `HTTP ${resp.status}`);
    }

    if (CONFIG.publish.clearDraftsAfterPublish) {
      state.drafts = { clubs: [], artifacts: [], media: [] };
      state.editing = { clubs: null, artifacts: null, media: null };
      saveDrafts();
      renderDrafts();
    }

    await loadBaseData();
    setActionStatus(
      'publishStatus',
      `发布成功：社团 ${result.stats?.clubs_published ?? 0} 条，成果 ${result.stats?.artifacts_published ?? 0} 条，素材 ${result.stats?.media_published ?? 0} 条。`
    );
    setStatus(
      `发布成功：社团 ${result.stats?.clubs_published ?? 0} 条，成果 ${result.stats?.artifacts_published ?? 0} 条，素材 ${result.stats?.media_published ?? 0} 条。` +
      `（已自动备份：${result.backupDir || 'N/A'}）`
    );
  } catch (error) {
    setActionStatus('publishStatus', `自动发布失败：${error.message}`, true);
    setStatus(
      `自动发布失败：${error.message}。如你暂时无法接入发布服务，可先用“导出三张 CSV”作为备用流程。`,
      true
    );
  }
}

function bindOwnerTypeChange() {
  byId('owner_type').addEventListener('change', refreshSelectOptions);
}

async function uploadCoverFile() {
  const file = byId('cover_file').files?.[0];
  if (!file) {
    setActionStatus('coverUploadStatus', '请先选择封面图片文件。', true);
    setStatus('请先选择封面图片文件', true);
    return;
  }
  setActionStatus('coverUploadStatus', '正在上传封面图片，请稍候...');
  setStatus('正在上传封面图片，请稍候...');
  await setButtonBusy('uploadCoverBtn', '正在上传...', async () => {
    try {
      const result = await uploadLocalFile(file, { publicId: `club_cover_${Date.now()}` });
      if (result.mediaType !== 'image') {
        setActionStatus('coverUploadStatus', '封面上传失败：请选择图片文件。', true);
        setStatus('封面上传失败：请选择图片文件', true);
        return;
      }
      byId('cover_url').value = result.url;
      setActionStatus('coverUploadStatus', '封面上传成功，已自动填入封面链接。');
      setStatus('封面上传成功，已自动填入封面链接');
    } catch (error) {
      setActionStatus('coverUploadStatus', error.message, true);
      setStatus(error.message, true);
    }
  });
}

async function uploadMediaFile() {
  const file = byId('media_file').files?.[0];
  if (!file) {
    setActionStatus('mediaUploadStatus', '请先选择素材文件（图片、视频或PDF）。', true);
    setStatus('请先选择素材文件（图片或视频）', true);
    return;
  }
  setActionStatus('mediaUploadStatus', '正在上传素材文件，请稍候...');
  setStatus('正在上传素材文件，请稍候...');
  await setButtonBusy('uploadMediaBtn', '正在上传...', async () => {
    try {
      const result = await uploadLocalFile(file, { publicId: `media_${Date.now()}` });
      byId('media_url').value = result.url;
      byId('media_type').value = result.mediaType;
      if (result.mediaType === 'video' && !byId('thumbnail_url').value.trim()) {
        setActionStatus('mediaUploadStatus', '视频上传成功，已填入素材链接。建议再补一张视频缩略图链接。');
        setStatus('视频上传成功，已填入素材链接。建议再补一张视频缩略图链接。');
        return;
      }
      setActionStatus('mediaUploadStatus', '素材上传成功，已自动填入素材链接。');
      setStatus('素材上传成功，已自动填入素材链接');
    } catch (error) {
      setActionStatus('mediaUploadStatus', error.message, true);
      setStatus(error.message, true);
    }
  });
}

async function loadBaseData() {
  try {
    const raw = await loadAllTables();
    state.base = raw;
    if (!hasAnyDraft()) {
      // 教师首次使用时，自动把已发布数据加载到草稿库，便于直接编辑维护
      state.drafts = {
        clubs: [...raw.clubs],
        artifacts: [...raw.artifacts],
        media: [...raw.media]
      };
      saveDrafts();
      renderDrafts();
    }
    refreshSelectOptions();
    setActionStatus(
      'loadStatus',
      `基础数据读取成功（来源：${raw.sourceMode}）。` + (hasAnyDraft() ? '草稿库已可编辑。' : '')
    );
    setStatus('');
  } catch (error) {
    setActionStatus('loadStatus', `基础数据读取失败：${error.message}`, true);
    setStatus('');
    refreshSelectOptions();
  }
}

function setDefaults() {
  byId('status_field').value = 'active';
  byId('artifact_type').value = '作品';
  byId('owner_type').value = 'artifact';
  byId('media_type').value = 'image';
}

function bindLoadButton() {
  byId('loadBtn').addEventListener('click', loadBaseData);
}

function bindClubImportActions() {
  byId('downloadClubTemplate').addEventListener('click', downloadClubTemplate);
  byId('importClubBtn').addEventListener('click', importClubExcel);
}

function bindArtifactImportActions() {
  byId('downloadArtifactTemplate').addEventListener('click', downloadArtifactTemplate);
  byId('importArtifactBtn').addEventListener('click', importArtifactExcel);
}

function createMediaIdGenerator() {
  const maxId = allMedia().reduce((max, item) => {
    const n = parseIdNumber(String(item.media_id || ''), 'M');
    return Math.max(max, n);
  }, 0);
  let current = maxId;
  return () => `M${String(++current).padStart(3, '0')}`;
}

function buildArtifactIdMap() {
  const map = new Map();
  allArtifacts().forEach((item) => {
    const id = String(item.artifact_id || '').trim();
    if (!id) return;
    map.set(id.toUpperCase(), id);
  });
  return map;
}

function analyzeMediaFolderFiles(files) {
  const artifactIdMap = buildArtifactIdMap();
  const entries = [];
  const issues = {
    invalidFolder: 0,
    missingArtifact: 0,
    unsupportedType: 0
  };

  files.forEach((file) => {
    const rel = String(file.webkitRelativePath || file.name || '');
    const folderName = getArtifactFolderNameFromRelativePath(rel);
    const ownerCandidate = parseOwnerIdFromFolder(folderName);
    if (!ownerCandidate) {
      issues.invalidFolder += 1;
      return;
    }

    const ownerId = artifactIdMap.get(ownerCandidate);
    if (!ownerId) {
      issues.missingArtifact += 1;
      return;
    }

    const mediaType = detectMediaTypeFromFile(file);
    if (!mediaType) {
      issues.unsupportedType += 1;
      return;
    }

    entries.push({
      file,
      ownerId,
      mediaType,
      baseName: getBaseName(file.name).toLowerCase()
    });
  });

  const hasIssue = issues.invalidFolder || issues.missingArtifact || issues.unsupportedType;
  return { entries, issues, ok: !hasIssue };
}

function issueSummaryText(issues) {
  const chunks = [];
  if (issues.invalidFolder) chunks.push(`目录名不合规 ${issues.invalidFolder} 个文件`);
  if (issues.missingArtifact) chunks.push(`成果ID不存在 ${issues.missingArtifact} 个文件`);
  if (issues.unsupportedType) chunks.push(`不支持文件类型 ${issues.unsupportedType} 个文件`);
  return chunks.join('；');
}

function pushMediaDraftRows(rows) {
  if (!rows.length) return;
  state.drafts.media.push(...rows);
  saveDrafts();
  renderDrafts();
  refreshSelectOptions();
}

async function importMediaFromFolder() {
  const input = byId('mediaFolderInput');
  const files = Array.from(input.files || []);
  setActionStatus('mediaImportResult', '');

  if (!files.length) {
    setActionStatus('mediaImportResult', '请先选择素材根目录。', true);
    setStatus('请先选择素材根目录。', true);
    return;
  }

  if (!CONFIG.assetUpload?.enabled) {
    setActionStatus('mediaImportResult', '未启用上传功能，无法执行目录导入。', true);
    setStatus('未启用上传功能，无法执行目录导入。', true);
    return;
  }

  const analyzed = analyzeMediaFolderFiles(files);
  if (!analyzed.ok) {
    const summary = issueSummaryText(analyzed.issues);
    setActionStatus('mediaImportResult', `预检未通过：${summary}`, true);
    setStatus(`目录预检失败：${summary}。请先按命名规则修正后再导入。`, true);
    return;
  }

  setActionStatus('mediaImportResult', '目录预检通过，正在导入并上传...');
  await setButtonBusy('importMediaFolderBtn', '正在导入...', async () => {
    const total = analyzed.entries.length;
    const images = analyzed.entries.filter((e) => e.mediaType === 'image');
    const videos = analyzed.entries.filter((e) => e.mediaType === 'video');
    const docs = analyzed.entries.filter((e) => e.mediaType === 'pdf');
    const nextMediaId = createMediaIdGenerator();

    const rowsToAppend = [];
    const imageUrlMap = new Map();
    const stats = {
      success: 0,
      failedUpload: 0
    };

    let done = 0;
    const updateProgress = () => {
      setActionStatus('mediaImportResult', `正在上传：${done}/${total}`);
    };
    updateProgress();

    for (const item of images) {
      try {
        const uploaded = await uploadLocalFile(item.file, { publicId: `media_${Date.now()}` });
        rowsToAppend.push({
          media_id: nextMediaId(),
          owner_type: 'artifact',
          owner_id: item.ownerId,
          media_type: 'image',
          url: uploaded.url,
          thumbnail_url: '',
          copyright_status: '',
          notes: `目录导入：${item.file.name}`
        });
        imageUrlMap.set(`${item.ownerId}::${item.baseName}`, uploaded.url);
        stats.success += 1;
      } catch {
        stats.failedUpload += 1;
      } finally {
        done += 1;
        updateProgress();
      }
    }

    for (const item of videos) {
      try {
        const uploaded = await uploadLocalFile(item.file, { publicId: `media_${Date.now()}` });
        rowsToAppend.push({
          media_id: nextMediaId(),
          owner_type: 'artifact',
          owner_id: item.ownerId,
          media_type: 'video',
          url: uploaded.url,
          thumbnail_url: imageUrlMap.get(`${item.ownerId}::${item.baseName}`) || '',
          copyright_status: '',
          notes: `目录导入：${item.file.name}`
        });
        stats.success += 1;
      } catch {
        stats.failedUpload += 1;
      } finally {
        done += 1;
        updateProgress();
      }
    }

    for (const item of docs) {
      try {
        const uploaded = await uploadLocalFile(item.file, { publicId: `media_${Date.now()}` });
        rowsToAppend.push({
          media_id: nextMediaId(),
          owner_type: 'artifact',
          owner_id: item.ownerId,
          media_type: 'pdf',
          url: uploaded.url,
          thumbnail_url: '',
          copyright_status: '',
          notes: `目录导入：${item.file.name}`
        });
        stats.success += 1;
      } catch {
        stats.failedUpload += 1;
      } finally {
        done += 1;
        updateProgress();
      }
    }

    pushMediaDraftRows(rowsToAppend);
    const skipCount = stats.failedUpload;
    const summary = `导入完成：成功 ${stats.success} 条，跳过 ${skipCount} 条，上传失败 ${stats.failedUpload} 条。`;
    setActionStatus('mediaImportResult', summary);
    setStatus(summary);
  });
}

function bindMediaFolderImportActions() {
  byId('pickMediaFolderBtn').addEventListener('click', () => {
    byId('mediaFolderInput').click();
  });

  byId('mediaFolderInput').addEventListener('change', (event) => {
    const files = Array.from(event.target.files || []);
    const pickedEl = byId('mediaFolderPicked');
    if (!files.length) {
      pickedEl.textContent = '未选择目录';
      return;
    }
    const firstPath = String(files[0].webkitRelativePath || '');
    const rootName = firstPath.split('/').filter(Boolean)[0] || '已选目录';
    pickedEl.textContent = `已选择目录：${rootName}（共 ${files.length} 个文件）`;
  });

  byId('importMediaFolderBtn').addEventListener('click', importMediaFromFolder);
}

function bindUploadActions() {
  byId('uploadCoverBtn').addEventListener('click', uploadCoverFile);
  byId('uploadMediaBtn').addEventListener('click', uploadMediaFile);
  if (!CONFIG.assetUpload?.enabled) {
    byId('uploadCoverBtn').disabled = true;
    byId('uploadMediaBtn').disabled = true;
  }
}

function tuneMediaUrlFieldByMode() {
  const req = byId('mediaUrlReq');
  const input = byId('media_url');
  if (isLocalUploadMode()) {
    req.textContent = '';
    input.placeholder = '可留空：选本地文件后系统会自动上传并填入';
  } else {
    req.textContent = '*';
    input.placeholder = 'https://...';
  }
}

function bindPublishAction() {
  byId('publishDrafts').addEventListener('click', publishDrafts);
  if (!CONFIG.publish?.enabled) {
    byId('publishDrafts').disabled = true;
  }
}

function init() {
  bindTabs();
  bindGenerators();
  bindSaves();
  bindClearActions();
  bindExports();
  bindOwnerTypeChange();
  bindLoadButton();
  bindClubImportActions();
  bindArtifactImportActions();
  bindMediaFolderImportActions();
  bindUploadActions();
  bindPublishAction();
  tuneMediaUrlFieldByMode();
  setDefaults();
  renderDrafts();
  loadBaseData();
  byId('updated_at').value = nowText();
  byId('club_id').value = nextId('C', state.base.clubs, state.drafts.clubs, 'club_id');
  byId('artifact_id').value = nextId('A', state.base.artifacts, state.drafts.artifacts, 'artifact_id');
  byId('media_id').value = nextId('M', state.base.media, state.drafts.media, 'media_id');

  if (CONFIG.privacyMode !== 'alias-grade') {
    setStatus('提醒：当前隐私模式与当前收集字段设置不一致，请确认配置。', true);
    return;
  }
  if (!CONFIG.assetUpload?.enabled) {
    setStatus('提醒：素材上传功能未启用。可继续手动粘贴 URL。');
  }
}

init();
