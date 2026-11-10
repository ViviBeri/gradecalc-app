'use strict';

(function (root) {
  var DB_NAME = 'gradecalc-device-api';
  var STORE_NAME = 'secrets';
  var dbPromise;

  function openDatabase() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!root.indexedDB) {
        reject(new Error('This browser does not support persistent private device storage.'));
        return;
      }
      var request = root.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = function () {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('Could not open device storage.')); };
    });
    return dbPromise;
  }

  async function readValue(key) {
    var db = await openDatabase();
    return new Promise(function (resolve, reject) {
      var request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('Could not read device storage.')); };
    });
  }

  async function writeValue(key, value) {
    var db = await openDatabase();
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(value, key);
      transaction.oncomplete = function () { resolve(); };
      transaction.onerror = function () { reject(transaction.error || new Error('Could not save device storage.')); };
      transaction.onabort = function () { reject(transaction.error || new Error('Device storage update was aborted.')); };
    });
  }

  async function deleteValue(key) {
    var db = await openDatabase();
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(key);
      transaction.oncomplete = function () { resolve(); };
      transaction.onerror = function () { reject(transaction.error || new Error('Could not clear device storage.')); };
    });
  }

  function normalizeApiUrl(value) {
    var url;
    try { url = new URL(String(value || '').trim()); } catch { throw new TypeError('Enter a valid Worker URL.'); }
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
      throw new TypeError('The Worker URL must use HTTPS.');
    }
    if (url.username || url.password || url.search || url.hash) {
      throw new TypeError('The Worker URL cannot contain credentials, query parameters, or fragments.');
    }
    return url.origin + url.pathname.replace(/\/$/, '');
  }

  function makeToken() {
    var bytes = root.crypto.getRandomValues(new Uint8Array(32));
    var binary = '';
    bytes.forEach(function (value) { binary += String.fromCharCode(value); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  async function getSettings() {
    var values = await Promise.all([
      readValue('apiUrl'), readValue('ownerId'), readValue('ownerToken'),
      readValue('deviceId'), readValue('deviceToken'), readValue('deviceScopes')
    ]);
    return {
      apiUrl: values[0] || '',
      ownerId: values[1] || '',
      ownerToken: values[2] || '',
      deviceId: values[3] || '',
      deviceToken: values[4] || '',
      deviceScopes: values[5] || []
    };
  }

  async function request(path, options, identity) {
    var settings = await getSettings();
    if (!settings.apiUrl) throw new Error('Configure the private device API URL first.');
    var token = identity === 'device' ? settings.deviceToken : settings.ownerToken;
    if (!token) throw new Error('This browser has not been enrolled for that action.');
    var headers = new Headers(options && options.headers ? options.headers : {});
    headers.set('Authorization', 'Bearer ' + token);
    var response = await fetch(settings.apiUrl + path, {
      method: options && options.method ? options.method : 'GET',
      headers: headers,
      body: options && options.body !== undefined ? options.body : undefined,
      cache: 'no-store'
    });
    var contentType = response.headers.get('content-type') || '';
    var payload = contentType.includes('application/json') ? await response.json() : await response.blob();
    if (!response.ok) {
      var error = new Error(payload && payload.error ? payload.error : 'Device API request failed.');
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  async function setupDashboard(apiUrl, setupSecret) {
    var normalized = normalizeApiUrl(apiUrl);
    if (typeof setupSecret !== 'string' || setupSecret.length < 32) {
      throw new TypeError('The setup secret must contain at least 32 characters.');
    }
    var ownerToken = makeToken();
    var response = await fetch(normalized + '/v1/setup', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-setup-secret': setupSecret },
      body: JSON.stringify({ ownerToken: ownerToken }),
      cache: 'no-store'
    });
    var payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Dashboard setup failed.');
    await writeValue('apiUrl', normalized);
    await writeValue('ownerId', payload.ownerId);
    await writeValue('ownerToken', ownerToken);
    return { ownerId: payload.ownerId };
  }

  async function saveApiUrl(apiUrl) {
    await writeValue('apiUrl', normalizeApiUrl(apiUrl));
  }

  async function createInvite(scopes) {
    return request('/v1/invites', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scopes: scopes })
    }, 'owner');
  }

  async function listDevices() {
    return request('/v1/devices', {}, 'owner');
  }

  async function approveDashboardDevice(deviceId) {
    return request('/v1/devices/' + encodeURIComponent(deviceId) + '/approve', { method: 'POST' }, 'owner');
  }

  async function revokeDevice(deviceId) {
    return request('/v1/devices/' + encodeURIComponent(deviceId), { method: 'DELETE' }, 'owner');
  }

  async function listMedia() {
    return request('/v1/media', {}, 'owner');
  }

  async function downloadMedia(mediaId) {
    return request('/v1/media/' + encodeURIComponent(mediaId), {}, 'owner');
  }

  async function deleteMedia(mediaId) {
    return request('/v1/media/' + encodeURIComponent(mediaId), { method: 'DELETE' }, 'owner');
  }

  async function enrollDevice(apiUrl, code, deviceName, platform, appVersion) {
    var normalized = normalizeApiUrl(apiUrl);
    var response = await fetch(normalized + '/v1/enroll', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code: String(code || '').trim(),
        deviceName: String(deviceName || '').trim(),
        platform: platform,
        appVersion: String(appVersion || '').slice(0, 32)
      }),
      cache: 'no-store'
    });
    var payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Device enrollment failed.');
    await writeValue('apiUrl', normalized);
    await writeValue('deviceId', payload.deviceId);
    await writeValue('deviceToken', payload.deviceToken);
    await writeValue('deviceScopes', payload.scopes || []);
    return payload;
  }

  async function approveOnDevice() {
    return request('/v1/devices/approve', { method: 'POST' }, 'device');
  }

  async function getDeviceStatus() {
    return request('/v1/device/status', {}, 'device');
  }

  async function publishTelemetry(snapshot) {
    return request('/v1/telemetry', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ snapshot: snapshot })
    }, 'device');
  }

  async function uploadMedia(file) {
    if (!file || typeof file.size !== 'number' || file.size < 1) {
      throw new TypeError('Select a photo or audio recording first.');
    }
    var type = String(file.type || '').toLowerCase();
    var max = type.startsWith('image/') ? 20 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > max) throw new TypeError('The selected file exceeds the upload limit.');
    return request('/v1/media', {
      method: 'POST',
      headers: {
        'content-type': type,
        'x-file-name': String(file.name || 'shared-media').slice(0, 100)
      },
      body: file
    }, 'device');
  }

  async function stopSharing() {
    return request('/v1/device/stop', { method: 'POST' }, 'device');
  }

  async function resumeSharing() {
    return request('/v1/device/resume', { method: 'POST' }, 'device');
  }

  async function clearDeviceCredentials() {
    await Promise.all([
      deleteValue('deviceId'), deleteValue('deviceToken'), deleteValue('deviceScopes')
    ]);
  }

  root.GradeCalcDeviceApi = Object.freeze({
    getSettings: getSettings,
    saveApiUrl: saveApiUrl,
    setupDashboard: setupDashboard,
    createInvite: createInvite,
    listDevices: listDevices,
    approveDashboardDevice: approveDashboardDevice,
    revokeDevice: revokeDevice,
    listMedia: listMedia,
    downloadMedia: downloadMedia,
    deleteMedia: deleteMedia,
    enrollDevice: enrollDevice,
    approveOnDevice: approveOnDevice,
    getDeviceStatus: getDeviceStatus,
    publishTelemetry: publishTelemetry,
    uploadMedia: uploadMedia,
    stopSharing: stopSharing,
    resumeSharing: resumeSharing,
    clearDeviceCredentials: clearDeviceCredentials
  });
})(window);
