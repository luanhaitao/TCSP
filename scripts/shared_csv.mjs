import fs from 'node:fs/promises';

export async function readText(source) {
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(`${source}${source.includes('?') ? '&' : '?'}_ts=${Date.now()}`);
    if (!res.ok) throw new Error(`拉取失败 ${source} HTTP ${res.status}`);
    return await res.text();
  }
  return await fs.readFile(source, 'utf8');
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(field.trim());
      field = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(field.trim());
      field = '';
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field.trim());
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }

  if (!rows.length) return [];
  const headers = rows[0];
  return rows.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((header, idx) => {
      obj[header] = cells[idx] ?? '';
    });
    return obj;
  });
}

export function isHttpUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isAssetUrl(value) {
  if (!value) return false;
  const text = String(value).trim();
  if (!text) return false;
  if (text.startsWith('/')) return true;
  return isHttpUrl(text);
}
