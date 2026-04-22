import fs from 'node:fs/promises';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:18090';
const USERS = Number(process.env.USERS || 20);
const ITERATIONS = Number(process.env.ITERATIONS || 8);
const ADMIN_NAME = process.env.ADMIN_NAME || '科技组管理员';
const UPLOAD_KB = Number(process.env.UPLOAD_KB || 1);

const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2mQAAAAASUVORK5CYII=', 'base64');
const uploadPayload = UPLOAD_KB > 1
  ? Buffer.concat(Array.from({ length: Math.max(1, Math.floor((UPLOAD_KB * 1024) / tinyPng.length)) }, () => tinyPng)).subarray(0, UPLOAD_KB * 1024)
  : tinyPng;

function nowText() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

class Stats {
  constructor() {
    this.data = new Map();
  }

  add(name, ok, ms, status) {
    if (!this.data.has(name)) this.data.set(name, []);
    this.data.get(name).push({ ok, ms, status });
  }

  report() {
    const out = {};
    for (const [name, list] of this.data.entries()) {
      const times = list.map((x) => x.ms).sort((a, b) => a - b);
      const okCount = list.filter((x) => x.ok).length;
      const failCount = list.length - okCount;
      out[name] = {
        total: list.length,
        ok: okCount,
        fail: failCount,
        successRate: list.length ? Number(((okCount / list.length) * 100).toFixed(2)) : 0,
        avgMs: times.length ? Number((times.reduce((a, b) => a + b, 0) / times.length).toFixed(2)) : 0,
        p95Ms: Number(percentile(times, 95).toFixed(2)),
        maxMs: Number((times[times.length - 1] || 0).toFixed(2))
      };
    }
    return out;
  }
}

async function timed(name, stats, fn) {
  const start = Date.now();
  try {
    const res = await fn();
    const ms = Date.now() - start;
    stats.add(name, true, ms, res?.status || 200);
    return res;
  } catch (err) {
    const ms = Date.now() - start;
    stats.add(name, false, ms, err?.status || 0);
    throw err;
  }
}

async function loginAndGetCookie(stats) {
  const res = await timed('login', stats, async () => {
    const r = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: ADMIN_NAME })
    });
    if (!r.ok) {
      const t = await r.text();
      const e = new Error(`login failed: ${r.status} ${t}`);
      e.status = r.status;
      throw e;
    }
    return r;
  });
  const setCookie = res.headers.get('set-cookie') || '';
  const cookie = setCookie.split(';')[0];
  if (!cookie) throw new Error('missing session cookie');
  return cookie;
}

async function getBase(cookie, stats) {
  const res = await timed('collector_base', stats, async () => {
    const r = await fetch(`${BASE}/api/collector/base`, {
      headers: { Cookie: cookie }
    });
    if (!r.ok) {
      const t = await r.text();
      const e = new Error(`collector/base failed: ${r.status} ${t}`);
      e.status = r.status;
      throw e;
    }
    return r;
  });
  return res.json();
}

async function uploadTiny(cookie, userNo, iterNo, stats) {
  await timed('upload', stats, async () => {
    const fd = new FormData();
    fd.append('file', new Blob([uploadPayload], { type: 'image/png' }), `u${userNo}_i${iterNo}.png`);
    const r = await fetch(`${BASE}/api/upload`, {
      method: 'POST',
      headers: { Cookie: cookie },
      body: fd
    });
    if (!r.ok) {
      const t = await r.text();
      const e = new Error(`upload failed: ${r.status} ${t}`);
      e.status = r.status;
      throw e;
    }
    return r;
  });
}

async function publishArtifact(cookie, baseData, userNo, iterNo, stats) {
  const first = (baseData?.artifacts || [])[0];
  if (!first) return;
  const row = {
    ...first,
    updated_at: nowText(),
    teacher_comment: `${String(first.teacher_comment || '')} [压测U${userNo}I${iterNo}]`.trim()
  };
  await timed('publish', stats, async () => {
    const r = await fetch(`${BASE}/api/publish`, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        clubs: [],
        artifacts: [row],
        media: [],
        published_at: nowText(),
        full_sync: false
      })
    });
    if (!r.ok) {
      const t = await r.text();
      const e = new Error(`publish failed: ${r.status} ${t}`);
      e.status = r.status;
      throw e;
    }
    return r;
  });
}

async function worker(userNo, stats, errors) {
  try {
    const cookie = await loginAndGetCookie(stats);
    let baseData = await getBase(cookie, stats);
    for (let i = 1; i <= ITERATIONS; i += 1) {
      await getBase(cookie, stats);
      if (i % 2 === 0) await uploadTiny(cookie, userNo, i, stats);
      if (i % 3 === 0) {
        await publishArtifact(cookie, baseData, userNo, i, stats);
        baseData = await getBase(cookie, stats);
      }
    }
  } catch (err) {
    errors.push({ userNo, message: err.message });
  }
}

async function main() {
  const stats = new Stats();
  const errors = [];
  const startedAt = Date.now();
  await Promise.all(Array.from({ length: USERS }, (_, idx) => worker(idx + 1, stats, errors)));
  const durationMs = Date.now() - startedAt;
  const report = {
    baseUrl: BASE,
    users: USERS,
    iterationsPerUser: ITERATIONS,
    totalDurationMs: durationMs,
    totalDurationSec: Number((durationMs / 1000).toFixed(2)),
    uploadKB: UPLOAD_KB,
    endpointStats: stats.report(),
    workerErrors: errors
  };
  await fs.writeFile('/tmp/tcsp_load_test_report.json', JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
