import { CONFIG } from './config.js';

function ensureUploadConfig() {
  const cfg = CONFIG.assetUpload;
  if (!cfg?.enabled) {
    throw new Error('当前未启用素材上传功能，请联系管理员先完成配置。');
  }

  if (cfg.provider !== 'cloudinary') {
    throw new Error(`暂不支持的上传服务：${cfg.provider}`);
  }

  const cloudName = cfg.cloudinary?.cloudName?.trim();
  const uploadPreset = cfg.cloudinary?.uploadPreset?.trim();

  if (!cloudName || !uploadPreset) {
    throw new Error('上传配置不完整：缺少 cloudName 或 uploadPreset。');
  }

  return {
    cloudName,
    uploadPreset,
    folder: cfg.cloudinary?.folder?.trim() || 'tcsp'
  };
}

export async function uploadLocalFile(file, extra = {}) {
  if (!file) throw new Error('请先选择本地文件。');

  const cfg = ensureUploadConfig();
  const endpoint = `https://api.cloudinary.com/v1_1/${cfg.cloudName}/auto/upload`;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', cfg.uploadPreset);
  formData.append('folder', cfg.folder);

  if (extra.publicId) formData.append('public_id', extra.publicId);

  const resp = await fetch(endpoint, {
    method: 'POST',
    body: formData
  });

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
