import { CONFIG } from './config.js';
import { loadAllTables } from './data-source.js';
import { validateData } from './validate.js';
import { isAssetUrl, nowLabel, safeText } from './utils.js';

const statsEl = document.getElementById('stats');
const clubListEl = document.getElementById('clubList');
const artifactListEl = document.getElementById('artifactList');
const filterClubEl = document.getElementById('filterClub');
const filterTypeEl = document.getElementById('filterType');
const filterKeywordEl = document.getElementById('filterKeyword');
const clubSearchEl = document.getElementById('clubSearch');
const dialogEl = document.getElementById('artifactDialog');
const dialogBodyEl = document.getElementById('dialogBody');
const syncMetaEl = document.getElementById('syncMeta');
const refreshBtn = document.getElementById('refreshBtn');
const heroBgEl = document.querySelector('.hero-bg');

const state = {
  clubs: [],
  artifacts: [],
  media: [],
  filteredClubs: [],
  filteredArtifacts: []
};

function normalizeClub(row) {
  return {
    club_id: row.club_id,
    club_name: row.club_name,
    teacher: row.teacher,
    grade_range: row.grade_range,
    student_count: Number(row.student_count || 0),
    club_category: row.club_category,
    intro: row.intro || '',
    learned_topics: row.learned_topics || '',
    done_items: row.done_items || '',
    highlights: row.highlights || '',
    harvest: row.harvest || '',
    cover_url: row.cover_url || '',
    status: row.status || 'active'
  };
}

function normalizeArtifact(row) {
  return {
    artifact_id: row.artifact_id,
    student_alias: row.student_alias,
    grade: row.grade,
    club_id: row.club_id,
    artifact_name: row.artifact_name,
    artifact_type: row.artifact_type,
    keywords: row.keywords || '',
    participation: row.participation || '',
    artifact_intro: row.artifact_intro || '',
    one_line_harvest: row.one_line_harvest || '',
    growth_evidence: row.growth_evidence || '',
    teacher_comment: row.teacher_comment || '',
    updated_at: row.updated_at || ''
  };
}

function normalizeMedia(row) {
  return {
    media_id: row.media_id,
    owner_type: row.owner_type,
    owner_id: row.owner_id,
    media_type: row.media_type,
    url: row.url,
    thumbnail_url: row.thumbnail_url || '',
    copyright_status: row.copyright_status || '',
    notes: row.notes || ''
  };
}

function getMediaForArtifact(artifactId) {
  return state.media.filter((m) => m.owner_type === 'artifact' && m.owner_id === artifactId);
}

function getMediaForClub(clubId) {
  return state.media.filter((m) => m.owner_type === 'club' && m.owner_id === clubId);
}

function renderHeroBackdrop() {
  if (!heroBgEl) return;
  const imageUrls = state.media
    .filter((m) => m.media_type === 'image' && isAssetUrl(m.url))
    .map((m) => m.url);

  if (!imageUrls.length) {
    heroBgEl.innerHTML = '';
    return;
  }

  const maxTiles = Math.min(16, imageUrls.length);
  const shuffled = [...imageUrls].sort(() => Math.random() - 0.5).slice(0, maxTiles);
  const tiles = shuffled
    .map((url, idx) => {
      const safeUrl = String(url).replaceAll('"', '%22').replaceAll("'", '%27');
      return `<span class="hero-tile hero-tile-${(idx % 4) + 1}" style="background-image:url(&quot;${safeUrl}&quot;)"></span>`;
    })
    .join('');
  heroBgEl.innerHTML = `<div class="hero-wall">${tiles}</div>`;
}

function renderStats() {
  const clubCount = state.clubs.length;
  const studentCount = new Set(state.artifacts.map((item) => `${item.club_id}-${item.student_alias}`)).size;
  const artifactCount = state.artifacts.length;
  const mediaCount = state.media.length;

  const stats = [
    ['社团数量', clubCount],
    ['参与学员数', studentCount],
    ['成果卡总数', artifactCount],
    ['图视频资料数', mediaCount]
  ];

  statsEl.innerHTML = stats
    .map(([label, value]) => `<article class="stat-item"><span class="muted">${label}</span><strong>${value}</strong></article>`)
    .join('');
}

function renderClubs() {
  if (!state.filteredClubs.length) {
    clubListEl.innerHTML = '<p class="muted">未匹配到社团，请调整搜索词。</p>';
    return;
  }

  clubListEl.innerHTML = state.filteredClubs
    .map((club) => {
      const mediaCover = getMediaForClub(club.club_id).find((m) => m.media_type === 'image');
      const cover = isAssetUrl(club.cover_url)
        ? club.cover_url
        : isAssetUrl(mediaCover?.url)
          ? mediaCover.url
          : CONFIG.defaults.imagePlaceholder;
      const artifacts = state.artifacts.filter((item) => item.club_id === club.club_id).length;
      return `
        <article class="club-card">
          <img class="media-preview" src="${cover}" alt="${club.club_name} 封面" loading="lazy" />
          <div class="club-head">
            <h3>${club.club_name}</h3>
            <span class="badge">${club.club_category || '未分类'}</span>
          </div>
          <p class="muted">教师：${club.teacher}｜年级：${club.grade_range || '未填写'}</p>
          <p>${safeText(club.intro, CONFIG.defaults.maxTextLength)}</p>
          <p class="muted">成果卡：${artifacts} 张</p>
        </article>
      `;
    })
    .join('');
}

function artifactCardMedia(artifact) {
  const first = getMediaForArtifact(artifact.artifact_id)[0];
  if (!first) return { kind: 'empty', src: '' };
  if (first.media_type === 'video') {
    if (first.thumbnail_url && isAssetUrl(first.thumbnail_url)) return { kind: 'image', src: first.thumbnail_url };
    return { kind: 'video', src: '' };
  }
  if (first.media_type === 'pdf') return { kind: 'pdf', src: '' };
  if (isAssetUrl(first.url)) return { kind: 'image', src: first.url };
  return { kind: 'empty', src: '' };
}

function renderArtifactCover(artifact) {
  const media = artifactCardMedia(artifact);
  if (media.kind === 'image') {
    return `<img src="${media.src}" alt="${artifact.artifact_name}" loading="lazy" />`;
  }
  if (media.kind === 'pdf') {
    return '<div class="artifact-cover artifact-cover-pdf"><span>PDF成果</span></div>';
  }
  if (media.kind === 'video') {
    return '<div class="artifact-cover artifact-cover-video"><span>视频成果</span></div>';
  }
  return '<div class="artifact-cover artifact-cover-empty"><span>暂无封面</span></div>';
}

function renderArtifacts() {
  if (!state.filteredArtifacts.length) {
    artifactListEl.innerHTML = '<p class="muted">当前筛选条件下暂无成果卡。</p>';
    return;
  }

  artifactListEl.innerHTML = state.filteredArtifacts
    .map((item) => {
      const club = state.clubs.find((c) => c.club_id === item.club_id);
      return `
        <article class="artifact-card">
          ${renderArtifactCover(item)}
          <h3>${item.artifact_name}</h3>
          <p class="muted">${item.student_alias}（${item.grade}）｜${club?.club_name || '未知社团'}</p>
          <span class="badge">${item.artifact_type}</span>
          <p>${safeText(item.one_line_harvest || item.artifact_intro, CONFIG.defaults.maxTextLength)}</p>
          <button class="btn" type="button" data-artifact-id="${item.artifact_id}">查看详情</button>
        </article>
      `;
    })
    .join('');

  artifactListEl.querySelectorAll('button[data-artifact-id]').forEach((btn) => {
    btn.addEventListener('click', () => openDetail(btn.dataset.artifactId));
  });
}

function buildFilters() {
  const clubOptions = ['<option value="">全部社团</option>']
    .concat(state.clubs.map((club) => `<option value="${club.club_id}">${club.club_name}</option>`))
    .join('');

  filterClubEl.innerHTML = clubOptions;
  filterTypeEl.innerHTML = ['<option value="">全部类型</option>', '<option value="作品">作品</option>', '<option value="任务">任务</option>', '<option value="探究">探究</option>', '<option value="表达">表达</option>'].join('');
}

function applyFilters() {
  const selectedClub = filterClubEl.value;
  const selectedType = filterTypeEl.value;
  const keyword = filterKeywordEl.value.trim().toLowerCase();

  state.filteredArtifacts = state.artifacts.filter((item) => {
    if (selectedClub && item.club_id !== selectedClub) return false;
    if (selectedType && item.artifact_type !== selectedType) return false;

    if (keyword) {
      const combined = [item.artifact_name, item.artifact_intro, item.one_line_harvest, item.keywords, item.student_alias].join(' ').toLowerCase();
      if (!combined.includes(keyword)) return false;
    }

    return true;
  });

  const clubTerm = clubSearchEl.value.trim().toLowerCase();
  state.filteredClubs = state.clubs.filter((club) => {
    if (!clubTerm) return true;
    return [club.club_name, club.teacher, club.club_category].join(' ').toLowerCase().includes(clubTerm);
  });

  renderClubs();
  renderArtifacts();
}

function openDetail(artifactId) {
  const item = state.artifacts.find((artifact) => artifact.artifact_id === artifactId);
  if (!item) return;

  const club = state.clubs.find((c) => c.club_id === item.club_id);
  const medias = getMediaForArtifact(artifactId);

  const mediaHtml = medias
    .map((media) => {
      if (media.media_type === 'video') {
        if (!isAssetUrl(media.url)) {
          return '<p class="warning">视频链接无效，已隐藏播放按钮。</p>';
        }
        return `<p><a class="btn btn-light" href="${media.url}" target="_blank" rel="noreferrer">打开视频</a></p>`;
      }
      if (media.media_type === 'pdf') {
        if (!isAssetUrl(media.url)) {
          return '<p class="warning">PDF链接无效，已隐藏打开按钮。</p>';
        }
        return `
          <div class="pdf-preview-wrap">
            <object data="${media.url}" type="application/pdf" class="pdf-preview">
              <p class="muted">当前浏览器无法直接预览PDF，可使用下方按钮打开。</p>
            </object>
          </div>
          <p><a class="btn btn-light" href="${media.url}" target="_blank" rel="noreferrer">打开成果PDF</a></p>
        `;
      }
      if (!isAssetUrl(media.url)) {
        return '<p class="warning">图片链接无效，已使用默认占位图。</p>';
      }
      return `<img class="media-preview" src="${media.url}" alt="${item.artifact_name}" />`;
    })
    .join('');

  dialogBodyEl.innerHTML = `
    <h3>${item.artifact_name}</h3>
    <p class="muted">${item.student_alias}（${item.grade}）｜${club?.club_name || '未知社团'}</p>
    <p><strong>我的参与内容：</strong>${safeText(item.participation, CONFIG.defaults.maxTextLength * 2) || '未填写'}</p>
    <p><strong>我的成果简介：</strong>${safeText(item.artifact_intro, CONFIG.defaults.maxTextLength * 2) || '未填写'}</p>
    <p><strong>我的收获：</strong>${safeText(item.one_line_harvest, CONFIG.defaults.maxTextLength) || '未填写'}</p>
    <p><strong>成长证据：</strong>${safeText(item.growth_evidence, CONFIG.defaults.maxTextLength * 2) || '未填写'}</p>
    <p><strong>教师简评：</strong>${safeText(item.teacher_comment, CONFIG.defaults.maxTextLength * 2) || '未填写'}</p>
    ${mediaHtml || '<p class="muted">暂无素材</p>'}
  `;

  dialogEl.showModal();
}

async function boot() {
  try {
    const raw = await loadAllTables();
    state.clubs = raw.clubs.map(normalizeClub).filter((club) => club.status !== 'archived');
    state.artifacts = raw.artifacts.map(normalizeArtifact);
    state.media = raw.media.map(normalizeMedia);

    const issues = validateData(
      { clubs: state.clubs, artifacts: state.artifacts, media: state.media },
      CONFIG.defaults.maxTextLength
    );

    buildFilters();
    state.filteredArtifacts = [...state.artifacts];
    state.filteredClubs = [...state.clubs];
    renderHeroBackdrop();
    renderStats();
    renderClubs();
    renderArtifacts();

    if (issues.length) {
      syncMetaEl.innerHTML = `最近同步：${nowLabel()} ｜ 来源：${raw.sourceMode} ｜ <span class="error">发现 ${issues.length} 项数据问题（请尽快修复表格）</span>`;
      console.warn('数据校验问题：', issues);
    } else {
      syncMetaEl.textContent = `最近同步：${nowLabel()} ｜ 来源：${raw.sourceMode} ｜ 数据状态正常`;
    }
  } catch (error) {
    syncMetaEl.innerHTML = `<span class="error">数据载入失败：${error.message}</span>`;
    console.error(error);
  }
}

refreshBtn.addEventListener('click', boot);
filterClubEl.addEventListener('change', applyFilters);
filterTypeEl.addEventListener('change', applyFilters);
filterKeywordEl.addEventListener('input', applyFilters);
clubSearchEl.addEventListener('input', applyFilters);

if (CONFIG.autoRefreshMs > 0) {
  setInterval(boot, CONFIG.autoRefreshMs);
}

boot();
