'use strict';

const crypto = require('node:crypto');

const INVITE_TTL_MS = 5 * 60 * 1000;
const ALLOWED_SCOPES = Object.freeze([
  'location',
  'battery',
  'network',
  'device',
  'permissionStatus',
  'appStatus'
]);
const PLATFORMS = Object.freeze(['web', 'android', 'ios', 'unknown']);
const NETWORK_TYPES = Object.freeze(['slow-2g', '2g', '3g', '4g', 'unknown']);
const PERMISSION_STATES = Object.freeze(['granted', 'denied', 'prompt', 'unavailable']);

function createInviteSecret() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashInviteSecret(secret) {
  if (typeof secret !== 'string' || !/^[A-Za-z0-9_-]{40,}$/.test(secret)) {
    throw new TypeError('Invalid pairing secret');
  }
  return crypto.createHash('sha256').update(secret, 'utf8').digest('hex');
}

function isInviteActive(invite, now = Date.now()) {
  return Boolean(
    invite &&
    typeof invite.secretHash === 'string' &&
    typeof invite.expiresAt === 'number' &&
    Number.isFinite(invite.expiresAt) &&
    invite.expiresAt > now &&
    invite.consumedAt == null &&
    invite.revokedAt == null
  );
}

function normalizeScopes(scopes) {
  if (!Array.isArray(scopes) || scopes.length < 1 || scopes.length > ALLOWED_SCOPES.length) {
    throw new TypeError('Invalid sharing scopes');
  }
  const unique = [...new Set(scopes)];
  if (unique.length !== scopes.length || unique.some(scope => !ALLOWED_SCOPES.includes(scope))) {
    throw new TypeError('Invalid sharing scopes');
  }
  return unique;
}

function validateTelemetry(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
  const allowed = new Set([
    'location', 'battery', 'network', 'device', 'permissionStatus', 'appStatus'
  ]);
  if (Object.keys(snapshot).some(key => !allowed.has(key))) return false;

  if ('location' in snapshot) {
    const v = snapshot.location;
    if (!v || typeof v !== 'object' ||
      !Number.isFinite(v.latitude) || v.latitude < -90 || v.latitude > 90 ||
      !Number.isFinite(v.longitude) || v.longitude < -180 || v.longitude > 180 ||
      !Number.isFinite(v.accuracy) || v.accuracy < 0 || Object.keys(v).some(key => !['latitude', 'longitude', 'accuracy'].includes(key))) return false;
  }
  if ('battery' in snapshot) {
    const v = snapshot.battery;
    if (!v || typeof v !== 'object' ||
      !Number.isFinite(v.level) || v.level < 0 || v.level > 1 ||
      typeof v.charging !== 'boolean' || Object.keys(v).some(key => !['level', 'charging'].includes(key))) return false;
  }
  if ('network' in snapshot) {
    const v = snapshot.network;
    if (!v || typeof v !== 'object' || typeof v.online !== 'boolean' ||
      !NETWORK_TYPES.includes(v.effectiveType) ||
      Object.keys(v).some(key => !['online', 'effectiveType'].includes(key))) return false;
  }
  if ('device' in snapshot) {
    const v = snapshot.device;
    if (!v || typeof v !== 'object' || !PLATFORMS.includes(v.platform) ||
      typeof v.appVersion !== 'string' || v.appVersion.length > 32 ||
      Object.keys(v).some(key => !['platform', 'appVersion'].includes(key))) return false;
  }
  if ('permissionStatus' in snapshot) {
    const v = snapshot.permissionStatus;
    if (!v || typeof v !== 'object' ||
      !PERMISSION_STATES.includes(v.camera) ||
      !PERMISSION_STATES.includes(v.microphone) ||
      Object.keys(v).some(key => !['camera', 'microphone'].includes(key))) return false;
  }
  if ('appStatus' in snapshot) {
    const v = snapshot.appStatus;
    if (!v || typeof v !== 'object' || v.active !== true ||
      Object.keys(v).some(key => key !== 'active')) return false;
  }
  return true;
}

module.exports = {
  ALLOWED_SCOPES,
  INVITE_TTL_MS,
  createInviteSecret,
  hashInviteSecret,
  isInviteActive,
  normalizeScopes,
  validateTelemetry
};
