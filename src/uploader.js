import { CONFIG } from './config.js';

function requireUploadEnabled() {
  const cfg = CONFIG.assetUpload;
  if (!cfg?.enabled) {
    throw new Error('当前未启用素材上传功能，请联系管理员先完成配置。');
  }
  return cfg;
}

function isRetryableUploadError(error) {
  const msg = String(error?.message || '');
  if (!msg) return false;
  if (msg.includes('文件超过大小限制')) return false;
  if (msg.includes('上传配置不完整')) return false;
  if (msg.includes('暂不支持的上传服务')) return false;
  if (msg.includes('HTTP 501')) return false;
  return true;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildCloudinaryEndpoint(cloudName, mimeType = '') {
  const type = String(mimeType).toLowerCase();
  if (type.startsWith('image/')) return `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  if (type.startsWith('video/')) return `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`;
  return `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;
}

async function fetchWithTimeout(resource, options = {}, timeoutMs = 45000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(resource, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function uploadToLocal(file, cfg) {
  const endpoint = cfg.local?.apiUrl || '/api/upload';
  const maxSizeMb = Number(cfg.local?.maxSizeMb || 300);
  const maxBytes = maxSizeMb * 1024 * 1024;

  if (file.size > maxBytes) {
    throw new Error(`上传失败：文件超过大小限制（${maxSizeMb}MB）。`);
  }

  const formData = new FormData();
  formData.append('file', file);

  let resp;
  try {
    resp = await fetchWithTimeout(endpoint, {
      method: 'POST',
      body: formData
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('上传超时：请检查局域网连接后重试。');
    }
    throw new Error(
      [
        '上传失败：无法连接本地上传服务。',
        '请检查：',
        '1) 是否使用 node scripts/portal_server.mjs 启动服务；',
        '2) 当前访问地址与服务地址是否一致（建议同域访问）；',
        '3) 防火墙是否放行 8090 端口。'
      ].join('\n')
    );
  }

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || !json.ok) {
    if (resp.status === 501) {
      throw new Error(
        [
          '上传失败：服务返回 HTTP 501（当前服务不支持上传接口）。',
          '请使用一体化服务启动项目：',
          'node scripts/portal_server.mjs',
          '并通过 http://localhost:8090/src/collector.html 打开收集器。'
        ].join('\n')
      );
    }
    throw new Error(json?.message || `上传失败：HTTP ${resp.status}`);
  }

  return {
    url: json.url,
    mediaType: json.mediaType || (String(file.type).startsWith('video/') ? 'video' : 'image'),
    thumbnailUrl: json.thumbnailUrl || '',
    originalFilename: json.originalFilename || file.name,
    bytes: json.bytes || file.size || 0,
    width: 0,
    height: 0
  };
}

function htmlFolderRelativePath(file, rootName = '') {
  const raw = String(file.webkitRelativePath || file.name || '');
  const parts = raw.split('/').filter(Boolean);
  const rootIndex = rootName ? parts.findIndex((part) => part === rootName) : -1;
  const relParts = rootIndex >= 0 ? parts.slice(rootIndex + 1) : parts.slice(-1);
  return relParts.join('/') || file.name || 'index.html';
}

async function uploadHtmlFolderToLocal(files, cfg, extra = {}) {
  const endpoint = cfg.local?.htmlFolderApiUrl || '/api/upload-html-folder';
  const maxSizeMb = Number(cfg.local?.maxSizeMb || 300);
  const maxBytes = maxSizeMb * 1024 * 1024;
  const fileList = Array.from(files || []);
  const totalBytes = fileList.reduce((sum, file) => sum + Number(file.size || 0), 0);

  if (!fileList.length) {
    throw new Error('上传失败：未找到互动网页目录文件。');
  }
  if (totalBytes > maxBytes) {
    throw new Error(`上传失败：网页目录超过大小限制（${maxSizeMb}MB）。`);
  }

  const formData = new FormData();
  fileList.forEach((file) => {
    formData.append('file', file, htmlFolderRelativePath(file, extra.rootName));
  });

  let resp;
  try {
    resp = await fetchWithTimeout(endpoint, {
      method: 'POST',
      body: formData
    }, 120000);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('上传超时：互动网页文件较多，请检查局域网连接后重试。');
    }
    throw new Error('上传失败：无法连接互动网页目录上传服务，请确认一体化服务已启动。');
  }

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || !json.ok) {
    throw new Error(json?.message || `上传失败：HTTP ${resp.status}`);
  }

  return {
    url: json.url,
    mediaType: json.mediaType || 'html',
    thumbnailUrl: json.thumbnailUrl || '',
    originalFilename: json.entry || 'index.html',
    bytes: json.bytes || totalBytes,
    fileCount: json.fileCount || fileList.length
  };
}

async function uploadToCloudinary(file, cfg, extra) {
  const cloudName = cfg.cloudinary?.cloudName?.trim();
  const uploadPreset = cfg.cloudinary?.uploadPreset?.trim();
  if (!cloudName || !uploadPreset) {
    throw new Error('上传配置不完整：缺少 cloudName 或 uploadPreset。');
  }

  const endpoint = buildCloudinaryEndpoint(cloudName, file.type);
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);
  formData.append('folder', cfg.cloudinary?.folder?.trim() || 'tcsp');
  if (extra?.publicId) formData.append('public_id', extra.publicId);

  let resp;
  try {
    resp = await fetchWithTimeout(endpoint, { method: 'POST', body: formData });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('上传超时：请检查网络后重试（建议 45 秒内完成）。');
    }
    throw new Error(
      [
        '上传失败：浏览器无法连接 Cloudinary（Failed to fetch）。',
        '请检查：',
        '1) 当前页面是否通过 http://localhost 访问；',
        '2) 网络能否访问 api.cloudinary.com；',
        '3) cloudName / uploadPreset 是否正确且 preset 为 Unsigned。'
      ].join('\n')
    );
  }

  const json = await resp.json();
  if (!resp.ok) {
    const detail = json?.error?.message || `HTTP ${resp.status}`;
    throw new Error(`上传失败：${detail}`);
  }

  const mediaType = String(json.resource_type || '').toLowerCase();
  return {
    url: json.secure_url || '',
    mediaType: mediaType === 'video' ? 'video' : 'image',
    originalFilename: file.name,
    bytes: json.bytes || file.size || 0,
    width: json.width || 0,
    height: json.height || 0
  };
}

export async function uploadLocalFile(file, extra = {}) {
  if (!file) throw new Error('请先选择本地文件。');
  const cfg = requireUploadEnabled();
  const retryTimes = Math.max(0, Number(cfg?.local?.retryTimes ?? 2));
  const retryDelayMs = Math.max(100, Number(cfg?.local?.retryDelayMs ?? 400));

  let lastError;
  for (let attempt = 0; attempt <= retryTimes; attempt += 1) {
    try {
      if (cfg.provider === 'local') {
        return await uploadToLocal(file, cfg);
      }
      if (cfg.provider === 'cloudinary') {
        return await uploadToCloudinary(file, cfg, extra);
      }
      throw new Error(`暂不支持的上传服务：${cfg.provider}`);
    } catch (error) {
      lastError = error;
      const canRetry = attempt < retryTimes && isRetryableUploadError(error);
      if (!canRetry) break;
      await sleep(retryDelayMs * (attempt + 1));
    }
  }

  throw lastError;
}

export async function uploadHtmlFolder(files, extra = {}) {
  const cfg = requireUploadEnabled();
  if (cfg.provider !== 'local') {
    throw new Error('互动网页目录上传目前仅支持本地服务器存储。');
  }
  return uploadHtmlFolderToLocal(files, cfg, extra);
}
