'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const service = fs.readFileSync('android-native/GradeCalcMonitorService.java', 'utf8');
const plugin = fs.readFileSync('android-native/GradeCalcMonitorPlugin.java', 'utf8');
const secureStore = fs.readFileSync('android-native/GradeCalcSecureStore.java', 'utf8');
const workflow = fs.readFileSync('.github/workflows/android-apk.yml', 'utf8');
const deviceUi = fs.readFileSync('js/device.js', 'utf8');

test('Android sharing uses a visible foreground notification and explicit stop action', () => {
  assert.match(service, /startForeground\(/);
  assert.match(service, /GradeCalc device sharing is active/);
  assert.match(service, /addAction\([^\n]+Stop sharing/);
  assert.match(service, /ACTION_STOP_LOCAL/);
  assert.match(plugin, /POST_NOTIFICATIONS/);
  assert.match(plugin, /state == PermissionState.PROMPT/);
  assert.match(plugin, /Notification permission was denied/);
});

test('Android device credentials are encrypted with the Android Keystore', () => {
  assert.match(secureStore, /AndroidKeyStore/);
  assert.match(secureStore, /AES\/GCM\/NoPadding/);
  assert.match(secureStore, /GCMParameterSpec/);
  assert.doesNotMatch(secureStore, /MODE_WORLD_READABLE|MODE_WORLD_WRITEABLE/);
});

test('native telemetry sends only explicitly approved scopes', () => {
  assert.match(service, /scopesJson/);
  assert.match(service, /"battery"\.equals\(scope\)/);
  assert.match(service, /"device"\.equals\(scope\)/);
  assert.match(service, /"permissionStatus"\.equals\(scope\)/);
  assert.match(service, /"appStatus"\.equals\(scope\)/);
  assert.match(service, /\/v1\/telemetry/);
  assert.doesNotMatch(service, /latitude|longitude|geolocation|SSID|BSSID/i);
});

test('Android build registers the native plugin and foreground service', () => {
  assert.match(workflow, /cp android-native\/\*\.java/);
  assert.match(workflow, /FOREGROUND_SERVICE_DATA_SYNC/);
  assert.match(workflow, /foregroundServiceType=\\?"dataSync/);
  assert.match(workflow, /registerPlugin\(GradeCalcMonitorPlugin\.class\)/);
});

test('Android service receives no bearer token or API URL through Intent extras', () => {
  assert.match(plugin, /GradeCalcSecureStore\.put\(getContext\(\), "deviceToken", token\)/);
  assert.match(plugin, /GradeCalcSecureStore\.put\(getContext\(\), "apiUrl", apiUrl\)/);
  assert.match(service, /GradeCalcSecureStore\.get\(this, "deviceToken"\)/);
  assert.match(service, /GradeCalcSecureStore\.get\(this, "apiUrl"\)/);
  assert.doesNotMatch(plugin, /putExtra\("(?:deviceToken|apiUrl|scopesJson)"/);
  assert.doesNotMatch(service, /getStringExtra\("(?:deviceToken|apiUrl|scopesJson)"/);
  assert.match(plugin, /ALLOWED_SCOPES/);
  assert.match(plugin, /uri\.getUserInfo\(\) == null/);
});

test('device setup shows the requested sharing scopes before approval', () => {
  assert.match(deviceUi, /Requested sharing:/);
  assert.match(deviceUi, /Review the sharing scopes shown above/);
  assert.match(deviceUi, /No location or network details/);
});
