import { CONFIG } from './config.js';
import { loadAllTables } from './data-source.js';
import { uploadLocalFile } from './uploader.js';

const STORAGE_KEY = 'tcsp_collector_drafts_v1';

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

const state = {
  base: { clubs: [], artifacts: [], media: [] },
  drafts: loadDrafts()
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
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function required(v) {
  return String(v ?? '').trim().length > 0;
}

function isUrl(v) {
  if (!v) return true;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function allClubs() {
  return [...state.base.clubs, ...state.drafts.clubs];
}

function allArtifacts() {
  return [...state.base.artifacts, ...state.drafts.artifacts];
}

function refreshSelectOptions() {
  const clubSelect = byId('artifact_club_id');
  const ownerId = byId('owner_id');

  const clubs = allClubs();
  clubSelect.innerHTML = clubs.length
    ? clubs.map((c) => `<option value="${c.club_id}">${c.club_id} - ${c.club_name}</option>`).join('')
    : '<option value="">请先新增社团</option>';

  const ownerType = byId('owner_type').value;
  if (ownerType === 'club') {
    ownerId.innerHTML = clubs.length
      ? clubs.map((c) => `<option value="${c.club_id}">${c.club_id} - ${c.club_name}</option>`).join('')
      : '<option value="">请先新增社团</option>';
  } else {
    const artifacts = allArtifacts();
    ownerId.innerHTML = artifacts.length
      ? artifacts.map((a) => `<option value="${a.artifact_id}">${a.artifact_id} - ${a.artifact_name}</option>`).join('')
      : '<option value="">请先新增成果</option>';
  }
}

function renderTable(containerId, headers, rows, type) {
  const container = byId(containerId);
  if (!rows.length) {
    container.innerHTML = '<p class="small">暂无草稿数据</p>';
    return;
  }

  const head = headers.map((h) => `<th>${h}</th>`).join('');
  const body = rows
    .map((row, idx) => {
      const tds = headers.map((h) => `<td>${String(row[h] ?? '')}</td>`).join('');
      return `<tr><td><button data-del="${type}" data-idx="${idx}">删除</button></td>${tds}</tr>`;
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
      if (key === 'student_alias') byId('student_alias').value = `小创者${String(Math.floor(Math.random() * 99) + 1).padStart(2, '0')}`;
      if (key === 'updated_at') byId('updated_at').value = nowText();
    });
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
      setStatus('社团信息保存失败：请先填写所有必填项（红星项）', true);
      return;
    }
    if (!isUrl(row.cover_url)) {
      setStatus('社团信息保存失败：封面图链接不是有效的 http/https 地址', true);
      return;
    }

    state.drafts.clubs.push(row);
    saveDrafts();
    renderDrafts();
    refreshSelectOptions();
    setStatus(`社团信息已保存：${row.club_name}`);
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
      setStatus('成果保存失败：请先填写所有必填项（红星项）', true);
      return;
    }

    state.drafts.artifacts.push(row);
    saveDrafts();
    renderDrafts();
    refreshSelectOptions();
    setStatus(`成果信息已保存：${row.artifact_name}`);
  });

  byId('saveMedia').addEventListener('click', () => {
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

    if (!required(row.media_id) || !required(row.owner_type) || !required(row.owner_id) || !required(row.media_type) || !required(row.url)) {
      setStatus('素材保存失败：请先填写所有必填项（红星项）', true);
      return;
    }
    if (!isUrl(row.url) || !isUrl(row.thumbnail_url)) {
      setStatus('素材保存失败：链接不是有效的 http/https 地址', true);
      return;
    }

    state.drafts.media.push(row);
    saveDrafts();
    renderDrafts();
    setStatus(`素材信息已保存：${row.media_id}`);
  });
}

function bindClearActions() {
  byId('clearClub').addEventListener('click', () => clearForm('club_'));
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
  });
  byId('clearMedia').addEventListener('click', () => {
    byId('media_id').value = '';
    byId('media_url').value = '';
    byId('thumbnail_url').value = '';
    byId('copyright_status').value = '';
    byId('notes').value = '';
  });

  byId('clearDrafts').addEventListener('click', () => {
    if (!window.confirm('确认清空全部草稿吗？此操作不可撤销。')) return;
    state.drafts = { clubs: [], artifacts: [], media: [] };
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
    setStatus('CSV 导出完成（共 3 个文件）');
  });
}

function bindOwnerTypeChange() {
  byId('owner_type').addEventListener('change', refreshSelectOptions);
}

async function uploadCoverFile() {
  const file = byId('cover_file').files?.[0];
  if (!file) {
    setStatus('请先选择封面图片文件', true);
    return;
  }
  setStatus('封面上传中，请稍候...');
  try {
    const result = await uploadLocalFile(file, { publicId: `club_cover_${Date.now()}` });
    if (result.mediaType !== 'image') {
      setStatus('封面上传失败：请选择图片文件', true);
      return;
    }
    byId('cover_url').value = result.url;
    setStatus('封面上传成功，已自动填入封面链接');
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function uploadMediaFile() {
  const file = byId('media_file').files?.[0];
  if (!file) {
    setStatus('请先选择素材文件（图片或视频）', true);
    return;
  }
  setStatus('素材上传中，请稍候...');
  try {
    const result = await uploadLocalFile(file, { publicId: `media_${Date.now()}` });
    byId('media_url').value = result.url;
    byId('media_type').value = result.mediaType;
    if (result.mediaType === 'video' && !byId('thumbnail_url').value.trim()) {
      setStatus('视频上传成功，已填入素材链接。建议再补一张视频缩略图链接。');
      return;
    }
    setStatus('素材上传成功，已自动填入素材链接');
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function loadBaseData() {
  try {
    const raw = await loadAllTables();
    state.base = raw;
    refreshSelectOptions();
    setStatus(`基础数据读取成功（来源：${raw.sourceMode}）`);
  } catch (error) {
    setStatus(`基础数据读取失败，将只使用草稿库：${error.message}`, true);
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

function bindUploadActions() {
  byId('uploadCoverBtn').addEventListener('click', uploadCoverFile);
  byId('uploadMediaBtn').addEventListener('click', uploadMediaFile);
  if (!CONFIG.assetUpload?.enabled) {
    byId('uploadCoverBtn').disabled = true;
    byId('uploadMediaBtn').disabled = true;
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
  bindUploadActions();
  setDefaults();
  renderDrafts();
  loadBaseData();
  byId('updated_at').value = nowText();
  byId('student_alias').value = `小创者${String(Math.floor(Math.random() * 99) + 1).padStart(2, '0')}`;
  byId('club_id').value = nextId('C', state.base.clubs, state.drafts.clubs, 'club_id');
  byId('artifact_id').value = nextId('A', state.base.artifacts, state.drafts.artifacts, 'artifact_id');
  byId('media_id').value = nextId('M', state.base.media, state.drafts.media, 'media_id');

  if (CONFIG.privacyMode !== 'alias-grade') {
    setStatus('提醒：当前系统隐私模式非化名模式，请确认配置。', true);
    return;
  }
  if (!CONFIG.assetUpload?.enabled) {
    setStatus('提醒：素材上传功能未启用。可继续手动粘贴 URL。');
  }
}

init();
