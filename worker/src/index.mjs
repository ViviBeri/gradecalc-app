'use strict';

const ALLOWED_SCOPES = Object.freeze(['battery', 'device', 'permissionStatus', 'appStatus', 'media']);
const PLATFORMS = Object.freeze(['web', 'android', 'ios', 'unknown']);
const PERMISSION_STATES = Object.freeze(['granted', 'denied', 'prompt', 'unavailable']);
const INVITE_TTL_MS = 5 * 60 * 1000;
const TELEMETRY_TTL_MS = 90 * 1000;
const MAX_JSON_BYTES = 16 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  });
}

function constantTimeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    difference |= (left.charCodeAt(i % Math.max(left.length, 1)) || 0) ^
      (right.charCodeAt(i % Math.max(right.length, 1)) || 0);
  }
  return difference === 0;
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function randomToken(bytes = 32) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = '';
  data.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function normalizeScopes(scopes) {
  if (!Array.isArray(scopes) || scopes.length < 1 || scopes.length > ALLOWED_SCOPES.length) {
    throw new TypeError('Invalid scopes');
  }
  const unique = [...new Set(scopes)];
  if (unique.length !== scopes.length || unique.some(scope => !ALLOWED_SCOPES.includes(scope))) {
    throw new TypeError('Invalid scopes');
  }
  return unique;
}

function validateSnapshot(snapshot, scopes) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
  if (Object.keys(snapshot).some(key => !['battery', 'device', 'permissionStatus', 'appStatus'].includes(key) || !scopes.includes(key))) return false;
  if ('battery' in snapshot) {
    const value = snapshot.battery;
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !Number.isFinite(value.level) || value.level < 0 || value.level > 1 ||
      typeof value.charging !== 'boolean' ||
      Object.keys(value).some(key => !['level', 'charging'].includes(key))) return false;
  }
  if ('device' in snapshot) {
    const value = snapshot.device;
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !PLATFORMS.includes(value.platform) ||
      typeof value.appVersion !== 'string' || value.appVersion.length > 32 ||
      Object.keys(value).some(key => !['platform', 'appVersion'].includes(key))) return false;
  }
  if ('permissionStatus' in snapshot) {
    const value = snapshot.permissionStatus;
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !PERMISSION_STATES.includes(value.camera) ||
      !PERMISSION_STATES.includes(value.microphone) ||
      Object.keys(value).some(key => !['camera', 'microphone'].includes(key))) return false;
  }
  if ('appStatus' in snapshot) {
    const value = snapshot.appStatus;
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
      value.active !== true || Object.keys(value).some(key => key !== 'active')) return false;
  }
  return true;
}

function pathId(path, prefix, suffix = '') {
  if (!path.startsWith(prefix) || !path.endsWith(suffix)) return null;
  const end = suffix ? path.length - suffix.length : path.length;
  const id = path.slice(prefix.length, end);
  return /^[A-Za-z0-9_-]{20,32}$/.test(id) ? id : null;
}

async function readJson(request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_JSON_BYTES) throw new TypeError('Request body too large');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_JSON_BYTES) throw new TypeError('Request body too large');
  try { return JSON.parse(raw); } catch { throw new TypeError('Invalid JSON'); }
}

function bearer(request) {
  const value = request.headers.get('authorization') || '';
  const match = /^Bearer ([A-Za-z0-9_-]{40,128})$/.exec(value);
  return match ? match[1] : null;
}

function corsHeaders(request, env) {
  const origin = request.headers.get('origin');
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return null;
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    'access-control-allow-headers': 'Authorization, Content-Type, X-Setup-Secret, X-File-Name',
    'access-control-max-age': '86400',
    'vary': 'Origin'
  };
}

async function ownerFromRequest(request, env) {
  const token = bearer(request);
  if (!token) return null;
  const hash = await sha256Hex(token);
  return env.DB.prepare('SELECT id FROM owners WHERE token_hash = ? LIMIT 1').bind(hash).first();
}

async function deviceFromRequest(request, env) {
  const token = bearer(request);
  if (!token) return null;
  const hash = await sha256Hex(token);
  return env.DB.prepare(
    'SELECT id, owner_id, scopes_json, status FROM devices WHERE token_hash = ? LIMIT 1'
  ).bind(hash).first();
}

async function handle(request, env) {
  const cors = corsHeaders(request, env);
  if (request.headers.get('origin') && !cors) return json({ error: 'ORIGIN_NOT_ALLOWED' }, 403);
  if (request.method === 'OPTIONS') {
    if (!cors) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: cors });
  }
  const headers = cors || {};
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '') || '/';
  const now = Date.now();

  if (request.method === 'GET' && path === '/health') return json({ ok: true }, 200, headers);

  if (request.method === 'POST' && path === '/v1/setup') {
    if (!env.SETUP_SECRET || !constantTimeEqual(request.headers.get('x-setup-secret') || '', env.SETUP_SECRET)) {
      return json({ error: 'SETUP_UNAVAILABLE' }, 403, headers);
    }
    const body = await readJson(request);
    if (typeof body.ownerToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.ownerToken)) {
      return json({ error: 'INVALID_OWNER_TOKEN' }, 400, headers);
    }
    const existing = await env.DB.prepare('SELECT id FROM owners LIMIT 1').first();
    if (existing) return json({ error: 'ALREADY_INITIALIZED' }, 409, headers);
    const ownerId = randomToken(16);
    await env.DB.prepare(
      'INSERT INTO owners (id, token_hash, created_at, singleton) VALUES (?, ?, ?, 1)'
    ).bind(ownerId, await sha256Hex(body.ownerToken), now).run();
    return json({ ownerId, initialized: true }, 201, headers);
  }

  if (request.method === 'POST' && path === '/v1/invites') {
    const owner = await ownerFromRequest(request, env);
    if (!owner) return json({ error: 'UNAUTHORIZED' }, 401, headers);
    const body = await readJson(request);
    let scopes;
    try { scopes = normalizeScopes(body.scopes); } catch { return json({ error: 'INVALID_SCOPES' }, 400, headers); }
    const recent = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM invites WHERE owner_id = ? AND created_at > ?'
    ).bind(owner.id, now - 60 * 60 * 1000).first();
    if (recent && recent.count >= 10) return json({ error: 'INVITE_RATE_LIMIT' }, 429, headers);
    const inviteId = randomToken(16);
    const code = randomToken(32);
    await env.DB.prepare(
      'INSERT INTO invites (id, owner_id, secret_hash, scopes_json, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(inviteId, owner.id, await sha256Hex(code), JSON.stringify(scopes), now, now + INVITE_TTL_MS).run();
    return json({ inviteId, code, expiresAt: now + INVITE_TTL_MS, scopes }, 201, headers);
  }

  if (request.method === 'POST' && path === '/v1/enroll') {
    const body = await readJson(request);
    if (typeof body.code !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.code) ||
      typeof body.deviceName !== 'string' || !body.deviceName.trim() || body.deviceName.length > 60 ||
      !PLATFORMS.includes(body.platform) ||
      typeof body.appVersion !== 'string' || body.appVersion.length > 32) {
      return json({ error: 'INVALID_ENROLLMENT' }, 400, headers);
    }
    const codeHash = await sha256Hex(body.code);
    const invite = await env.DB.prepare(
      'SELECT id, owner_id, scopes_json, expires_at, redeemed_at FROM invites WHERE secret_hash = ? LIMIT 1'
    ).bind(codeHash).first();
    if (!invite || invite.redeemed_at !== null || invite.expires_at <= now) {
      return json({ error: 'INVITE_UNAVAILABLE' }, 400, headers);
    }
    const deviceId = randomToken(16);
    const deviceToken = randomToken(32);
    const scopes = normalizeScopes(JSON.parse(invite.scopes_json));
    try {
      await env.DB.batch([
        env.DB.prepare(
          'UPDATE invites SET redeemed_at = ? WHERE id = ? AND redeemed_at IS NULL AND expires_at > ?'
        ).bind(now, invite.id, now),
        env.DB.prepare(
          'INSERT INTO devices (id, owner_id, invite_id, name, platform, app_version, token_hash, scopes_json, status, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, \'pending\', ? WHERE EXISTS (SELECT 1 FROM invites WHERE id = ? AND redeemed_at = ?)'
        ).bind(deviceId, invite.owner_id, invite.id, body.deviceName.trim(), body.platform,
          body.appVersion, await sha256Hex(deviceToken), JSON.stringify(scopes), now, invite.id, now)
      ]);
    } catch {
      return json({ error: 'INVITE_UNAVAILABLE' }, 400, headers);
    }
    const inserted = await env.DB.prepare('SELECT id FROM devices WHERE id = ?').bind(deviceId).first();
    if (!inserted) return json({ error: 'INVITE_UNAVAILABLE' }, 400, headers);
    return json({ deviceId, deviceToken, status: 'pending', scopes }, 201, headers);
  }

  if (request.method === 'POST' && path === '/v1/devices/approve') {
    const device = await deviceFromRequest(request, env);
    if (!device || device.status !== 'pending') return json({ error: 'APPROVAL_UNAVAILABLE' }, 403, headers);
    await env.DB.prepare(
      'UPDATE devices SET device_approved_at = ?, status = CASE WHEN owner_approved_at IS NOT NULL THEN \'active\' ELSE \'pending\' END, last_seen_at = ? WHERE id = ? AND status = \'pending\''
    ).bind(now, now, device.id).run();
    const refreshed = await env.DB.prepare('SELECT status FROM devices WHERE id = ?').bind(device.id).first();
    return json({ deviceId: device.id, status: refreshed.status }, 200, headers);
  }

  if (request.method === 'GET' && path === '/v1/device/status') {
    const device = await deviceFromRequest(request, env);
    if (!device) return json({ error: 'UNAUTHORIZED' }, 401, headers);
    const state = await env.DB.prepare(
      'SELECT device_approved_at AS deviceApprovedAt, owner_approved_at AS ownerApprovedAt FROM devices WHERE id = ? LIMIT 1'
    ).bind(device.id).first();
    return json({
      deviceId: device.id, status: device.status,
      deviceApprovedAt: state.deviceApprovedAt, ownerApprovedAt: state.ownerApprovedAt
    }, 200, headers);
  }

  if (request.method === 'POST' && path === '/v1/telemetry') {
    const device = await deviceFromRequest(request, env);
    if (!device || device.status !== 'active') return json({ error: 'DEVICE_UNAVAILABLE' }, 403, headers);
    const body = await readJson(request);
    let scopes;
    try { scopes = normalizeScopes(JSON.parse(device.scopes_json)); } catch { return json({ error: 'DEVICE_UNAVAILABLE' }, 403, headers); }
    if (!validateSnapshot(body.snapshot, scopes)) return json({ error: 'INVALID_TELEMETRY' }, 400, headers);
    const updatedAt = now;
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO telemetry (device_id, snapshot_json, updated_at, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT(device_id) DO UPDATE SET snapshot_json = excluded.snapshot_json, updated_at = excluded.updated_at, expires_at = excluded.expires_at'
      ).bind(device.id, JSON.stringify(body.snapshot), updatedAt, updatedAt + TELEMETRY_TTL_MS),
      env.DB.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ? AND status = \'active\'').bind(updatedAt, device.id)
    ]);
    return json({ accepted: true, updatedAt, expiresAt: updatedAt + TELEMETRY_TTL_MS }, 202, headers);
  }

  if (request.method === 'GET' && path === '/v1/devices') {
    const owner = await ownerFromRequest(request, env);
    if (!owner) return json({ error: 'UNAUTHORIZED' }, 401, headers);
    const rows = await env.DB.prepare(
      'SELECT d.id, d.name, d.platform, d.app_version AS appVersion, d.status, d.scopes_json AS scopesJson, d.created_at AS createdAt, d.device_approved_at AS deviceApprovedAt, d.owner_approved_at AS ownerApprovedAt, d.last_seen_at AS lastSeenAt, t.snapshot_json AS snapshotJson, t.updated_at AS updatedAt, t.expires_at AS expiresAt FROM devices d LEFT JOIN telemetry t ON t.device_id = d.id AND t.expires_at > ? WHERE d.owner_id = ? AND d.status != \'revoked\' ORDER BY d.created_at DESC'
    ).bind(now, owner.id).all();
    return json({ devices: (rows.results || []).map(row => ({
      id: row.id, name: row.name, platform: row.platform, appVersion: row.appVersion,
      status: row.status, scopes: JSON.parse(row.scopesJson), createdAt: row.createdAt,
      deviceApprovedAt: row.deviceApprovedAt, ownerApprovedAt: row.ownerApprovedAt,
      lastSeenAt: row.lastSeenAt, online: row.status === 'active' &&
        typeof row.lastSeenAt === 'number' && row.lastSeenAt > now - TELEMETRY_TTL_MS,
      telemetry: row.snapshotJson ? JSON.parse(row.snapshotJson) : null,
      updatedAt: row.updatedAt, expiresAt: row.expiresAt
    })) }, 200, headers);
  }

  const ownerApprovalId = pathId(path, '/v1/devices/', '/approve');
  if (request.method === 'POST' && ownerApprovalId) {
    const owner = await ownerFromRequest(request, env);
    if (!owner) return json({ error: 'UNAUTHORIZED' }, 401, headers);
    const device = await env.DB.prepare(
      'SELECT id, status, device_approved_at FROM devices WHERE id = ? AND owner_id = ? LIMIT 1'
    ).bind(ownerApprovalId, owner.id).first();
    if (!device || device.status !== 'pending') return json({ error: 'APPROVAL_UNAVAILABLE' }, 404, headers);
    await env.DB.prepare(
      'UPDATE devices SET owner_approved_at = ?, status = CASE WHEN device_approved_at IS NOT NULL THEN \'active\' ELSE \'pending\' END WHERE id = ? AND owner_id = ? AND status = \'pending\''
    ).bind(now, ownerApprovalId, owner.id).run();
    const refreshed = await env.DB.prepare('SELECT status FROM devices WHERE id = ? AND owner_id = ?').bind(ownerApprovalId, owner.id).first();
    return json({ deviceId: ownerApprovalId, status: refreshed.status }, 200, headers);
  }

  const revokeId = pathId(path, '/v1/devices/');
  if (request.method === 'DELETE' && revokeId) {
    const owner = await ownerFromRequest(request, env);
    if (!owner) return json({ error: 'UNAUTHORIZED' }, 401, headers);
    await env.DB.batch([
      env.DB.prepare('UPDATE devices SET status = \'revoked\' WHERE id = ? AND owner_id = ?').bind(revokeId, owner.id),
      env.DB.prepare('DELETE FROM telemetry WHERE device_id = ? AND EXISTS (SELECT 1 FROM devices WHERE id = ? AND owner_id = ?)').bind(revokeId, revokeId, owner.id)
    ]);
    return json({ revoked: true }, 200, headers);
  }

  if (request.method === 'POST' && path === '/v1/media') {
    const device = await deviceFromRequest(request, env);
    if (!device || device.status !== 'active') return json({ error: 'DEVICE_UNAVAILABLE' }, 403, headers);
    let scopes;
    try { scopes = normalizeScopes(JSON.parse(device.scopes_json)); } catch { return json({ error: 'DEVICE_UNAVAILABLE' }, 403, headers); }
    if (!scopes.includes('media')) return json({ error: 'MEDIA_NOT_AUTHORIZED' }, 403, headers);
    if (!env.MEDIA) return json({ error: 'MEDIA_STORAGE_UNAVAILABLE' }, 503, headers);
    const contentType = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    const maxBytes = contentType.startsWith('image/') ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES;
    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (!allowedTypes.includes(contentType) || !Number.isSafeInteger(declaredLength) || declaredLength < 1 || declaredLength > maxBytes) {
      return json({ error: 'INVALID_MEDIA' }, 400, headers);
    }
    const data = await request.arrayBuffer();
    if (!data.byteLength || data.byteLength !== declaredLength || data.byteLength > maxBytes) return json({ error: 'INVALID_MEDIA' }, 400, headers);
    const mediaId = randomToken(16);
    const objectKey = device.owner_id + '/' + device.id + '/' + mediaId;
    const filename = (request.headers.get('x-file-name') || 'shared-media').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100);
    await env.MEDIA.put(objectKey, data, { httpMetadata: { contentType } });
    try {
      await env.DB.prepare(
        'INSERT INTO media_objects (id, owner_id, device_id, object_key, filename, content_type, byte_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(mediaId, device.owner_id, device.id, objectKey, filename, contentType, data.byteLength, now).run();
    } catch {
      await env.MEDIA.delete(objectKey);
      return json({ error: 'MEDIA_SAVE_FAILED' }, 503, headers);
    }
    return json({ mediaId, filename, contentType, bytes: data.byteLength, createdAt: now }, 201, headers);
  }

  if (request.method === 'GET' && path === '/v1/media') {
    const owner = await ownerFromRequest(request, env);
    if (!owner) return json({ error: 'UNAUTHORIZED' }, 401, headers);
    const rows = await env.DB.prepare(
      'SELECT id, device_id AS deviceId, filename, content_type AS contentType, byte_size AS bytes, created_at AS createdAt FROM media_objects WHERE owner_id = ? ORDER BY created_at DESC LIMIT 200'
    ).bind(owner.id).all();
    return json({ media: rows.results || [] }, 200, headers);
  }

  const mediaId = pathId(path, '/v1/media/');
  if (request.method === 'GET' && mediaId) {
    const owner = await ownerFromRequest(request, env);
    if (!owner) return json({ error: 'UNAUTHORIZED' }, 401, headers);
    const item = await env.DB.prepare(
      'SELECT object_key, filename, content_type, byte_size FROM media_objects WHERE id = ? AND owner_id = ? LIMIT 1'
    ).bind(mediaId, owner.id).first();
    if (!item) return json({ error: 'MEDIA_NOT_FOUND' }, 404, headers);
    const object = await env.MEDIA.get(item.object_key);
    if (!object) return json({ error: 'MEDIA_NOT_FOUND' }, 404, headers);
    const safeName = item.filename.replace(/[^A-Za-z0-9._-]/g, '_');
    return new Response(object.body, {
      status: 200,
      headers: {
        ...headers,
        'content-type': item.content_type,
        'content-length': String(item.byte_size),
        'content-disposition': 'attachment; filename="' + safeName + '"',
        'cache-control': 'private, no-store'
      }
    });
  }

  if (request.method === 'DELETE' && mediaId) {
    const owner = await ownerFromRequest(request, env);
    if (!owner) return json({ error: 'UNAUTHORIZED' }, 401, headers);
    const item = await env.DB.prepare(
      'SELECT object_key FROM media_objects WHERE id = ? AND owner_id = ? LIMIT 1'
    ).bind(mediaId, owner.id).first();
    if (!item) return json({ error: 'MEDIA_NOT_FOUND' }, 404, headers);
    await env.MEDIA.delete(item.object_key);
    await env.DB.prepare('DELETE FROM media_objects WHERE id = ? AND owner_id = ?').bind(mediaId, owner.id).run();
    return json({ deleted: true }, 200, headers);
  }

  if (request.method === 'POST' && path === '/v1/device/stop') {
    const device = await deviceFromRequest(request, env);
    if (!device || device.status !== 'active') return json({ error: 'DEVICE_UNAVAILABLE' }, 403, headers);
    await env.DB.batch([
      env.DB.prepare('UPDATE devices SET status = \'paused\' WHERE id = ? AND status = \'active\'').bind(device.id),
      env.DB.prepare('DELETE FROM telemetry WHERE device_id = ?').bind(device.id)
    ]);
    return json({ status: 'paused' }, 200, headers);
  }

  if (request.method === 'POST' && path === '/v1/device/resume') {
    const device = await deviceFromRequest(request, env);
    if (!device || device.status !== 'paused') return json({ error: 'DEVICE_UNAVAILABLE' }, 403, headers);
    await env.DB.prepare(
      'UPDATE devices SET status = \'active\', last_seen_at = ? WHERE id = ? AND status = \'paused\''
    ).bind(now, device.id).run();
    return json({ status: 'active' }, 200, headers);
  }

  return json({ error: 'NOT_FOUND' }, 404, headers);
}

export { ALLOWED_SCOPES, constantTimeEqual, normalizeScopes, pathId, randomToken, sha256Hex, validateSnapshot };
export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (error) {
      const headers = corsHeaders(request, env) || {};
      if (error instanceof TypeError) return json({ error: 'INVALID_REQUEST' }, 400, headers);
      return json({ error: 'SERVICE_UNAVAILABLE' }, 503, headers);
    }
  },
  async scheduled(event, env) {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM telemetry WHERE expires_at <= ?').bind(now),
      env.DB.prepare("DELETE FROM devices WHERE status = 'pending' AND created_at < ?").bind(now - 24 * 60 * 60 * 1000),
      env.DB.prepare('DELETE FROM invites WHERE expires_at < ? AND id NOT IN (SELECT invite_id FROM devices)').bind(now - 24 * 60 * 60 * 1000)
    ]);
  }
};
