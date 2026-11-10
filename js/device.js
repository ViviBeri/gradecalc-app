'use strict';

(function () {
  var tabButton;
  var panel;
  var battery = null;
  var batteryListener = null;
  var telemetryTimer = null;
  var statusTimer = null;
  var nativeMonitoringStarted = false;
  var deviceNameKey = 'gradecalc_device_name';
  var api = window.GradeCalcDeviceApi;

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function setStatus(message, isError) {
    var node = document.getElementById('device-pairing-status');
    if (!node) return;
    node.textContent = message;
    node.dataset.state = isError ? 'error' : 'ok';
  }

  function stopTimers() {
    if (telemetryTimer && typeof window.clearInterval === 'function') window.clearInterval(telemetryTimer);
    if (statusTimer && typeof window.clearInterval === 'function') window.clearInterval(statusTimer);
    telemetryTimer = null;
    statusTimer = null;
  }

  function stopBatteryListeners() {
    if (battery && batteryListener) {
      battery.removeEventListener('levelchange', batteryListener);
      battery.removeEventListener('chargingchange', batteryListener);
    }
    battery = null;
    batteryListener = null;
  }

  function stopBatteryPreview() {
    stopBatteryListeners();
    stopTimers();
  }

  function updateBattery() {
    var status = document.getElementById('device-battery-status');
    if (!status || !battery) return;
    status.textContent = Math.round(battery.level * 100) + '% · ' +
      (battery.charging ? 'Charging' : 'Not charging');
  }

  function startBatteryPreview() {
    if (!navigator.getBattery) {
      var unavailable = document.getElementById('device-battery-status');
      if (unavailable) unavailable.textContent = 'Not available in this browser';
      return;
    }
    navigator.getBattery().then(function (result) {
      stopBatteryListeners();
      battery = result;
      batteryListener = updateBattery;
      battery.addEventListener('levelchange', batteryListener);
      battery.addEventListener('chargingchange', batteryListener);
      updateBattery();
    }).catch(function () {
      var status = document.getElementById('device-battery-status');
      if (status) status.textContent = 'Battery status unavailable';
    });
  }

  function scopeDescription(scopes) {
    var labels = {
      battery: 'Battery level and charging state',
      device: 'Device platform and app version',
      permissionStatus: 'Camera and microphone permission status',
      appStatus: 'App activity heartbeat',
      media: 'Photos and audio shared manually'
    };
    return (scopes || []).map(function (scope) { return labels[scope] || scope; }).join(', ') || 'No sharing scopes';
  }

  function platformValue() {
    var platform = navigator.userAgentData && navigator.userAgentData.platform || navigator.platform || '';
    if (/android/i.test(platform) || /android/i.test(navigator.userAgent || '')) return 'android';
    if (/iphone|ipad|ios/i.test(platform) || /iphone|ipad/i.test(navigator.userAgent || '')) return 'ios';
    if (platform) return 'web';
    return 'unknown';
  }

  function permissionValue(name) {
    if (!navigator.permissions || !navigator.permissions.query) return Promise.resolve('unavailable');
    return navigator.permissions.query({ name: name }).then(function (result) {
      return result.state;
    }).catch(function () { return 'unavailable'; });
  }

  async function buildTelemetry(scopes) {
    var snapshot = {};
    if (scopes.includes('battery') && battery) {
      snapshot.battery = { level: battery.level, charging: battery.charging };
    }
    if (scopes.includes('device')) {
      snapshot.device = {
        platform: platformValue(),
        appVersion: String(window.GRADE_CALC_APP_VERSION || '1.0.0').slice(0, 32)
      };
    }
    if (scopes.includes('permissionStatus')) {
      var permissions = await Promise.all([
        permissionValue('camera'), permissionValue('microphone')
      ]);
      snapshot.permissionStatus = { camera: permissions[0], microphone: permissions[1] };
    }
    if (scopes.includes('appStatus')) snapshot.appStatus = { active: true };
    return snapshot;
  }

  async function startNativeMonitoring(settings) {
    var plugin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.GradeCalcMonitor;
    if (!plugin || nativeMonitoringStarted || !settings.apiUrl || !settings.deviceToken) return;
    if (!settings.deviceScopes.some(function (scope) {
      return ['battery', 'device', 'permissionStatus', 'appStatus'].includes(scope);
    })) return;
    try {
      await plugin.startMonitoring({
        apiUrl: settings.apiUrl,
        deviceToken: settings.deviceToken,
        scopes: settings.deviceScopes
      });
      nativeMonitoringStarted = true;
    } catch (error) {
      setStatus(error.message || 'Android background sharing could not start.', true);
    }
  }

  async function stopNativeMonitoring() {
    var plugin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.GradeCalcMonitor;
    if (!plugin) return;
    try { await plugin.stopMonitoring(); } catch (error) { setStatus(error.message, true); }
    nativeMonitoringStarted = false;
  }

  async function publishTelemetry() {
    if (!api || document.hidden) return;
    try {
      var settings = await api.getSettings();
      if (!settings.deviceToken || !settings.deviceScopes.length) return;
      var state = await api.getDeviceStatus();
      if (state.status !== 'active') return;
      var snapshot = await buildTelemetry(settings.deviceScopes);
      if (Object.keys(snapshot).length) await api.publishTelemetry(snapshot);
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  function startTelemetry() {
    if (telemetryTimer || typeof window.setInterval !== 'function') return;
    publishTelemetry();
    telemetryTimer = window.setInterval(publishTelemetry, 30000);
  }

  async function refreshDeviceState() {
    if (!api) return;
    var settings;
    try { settings = await api.getSettings(); } catch (error) {
      setStatus(error.message, true);
      return;
    }
    var form = document.getElementById('device-enroll-form');
    var controls = document.getElementById('device-sharing-controls');
    if (!settings.deviceToken) {
      if (form) form.hidden = false;
      if (controls) controls.hidden = true;
      setStatus('Enter the Worker URL and one-time invitation from your private dashboard.');
      return;
    }
    if (form) form.hidden = true;
    if (controls) controls.hidden = false;
    var scopesNode = document.getElementById('device-sharing-scopes');
    if (scopesNode) scopesNode.textContent = 'Requested sharing: ' + scopeDescription(settings.deviceScopes) + '. No location or network details are included.';
    try {
      var state = await api.getDeviceStatus();
      var name = document.getElementById('device-display-name');
      if (name) {
        try { name.textContent = localStorage.getItem(deviceNameKey) || 'Enrolled device'; }
        catch (error) { name.textContent = 'Enrolled device'; }
      }
      if (state.status === 'pending') {
        stopNativeMonitoring();
        if (!statusTimer && typeof window.setInterval === 'function') {
          statusTimer = window.setInterval(refreshDeviceState, 10000);
        }
        if (!state.deviceApprovedAt) {
          document.getElementById('device-approve').hidden = false;
          setStatus('Review the sharing scopes shown above. Approve this phone here; dashboard owner approval is also required.');
        } else {
          document.getElementById('device-approve').hidden = true;
          setStatus('Phone approval recorded. Waiting for the dashboard owner to approve this device.');
        }
        document.getElementById('device-stop-sharing').hidden = true;
        document.getElementById('device-resume-sharing').hidden = true;
        stopTimers();
      } else if (state.status === 'active') {
        startNativeMonitoring(settings);
        if (statusTimer && typeof window.clearInterval === 'function') window.clearInterval(statusTimer);
        statusTimer = null;
        document.getElementById('device-approve').hidden = true;
        document.getElementById('device-stop-sharing').hidden = false;
        document.getElementById('device-resume-sharing').hidden = true;
        setStatus('Device connected. Android background status sharing runs with a visible notification when supported.');
        startTelemetry();
      } else if (state.status === 'paused') {
        stopNativeMonitoring();
        if (statusTimer && typeof window.clearInterval === 'function') window.clearInterval(statusTimer);
        statusTimer = null;
        document.getElementById('device-approve').hidden = true;
        document.getElementById('device-stop-sharing').hidden = true;
        document.getElementById('device-resume-sharing').hidden = false;
        setStatus('Sharing is paused on this phone.');
        stopTimers();
      } else {
        stopNativeMonitoring();
        if (statusTimer && typeof window.clearInterval === 'function') window.clearInterval(statusTimer);
        statusTimer = null;
        setStatus('This device is no longer authorized.', true);
        stopTimers();
      }
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  function build() {
    var tabBar = document.querySelector('.tab-bar');
    var body = document.querySelector('.body');
    if (!tabBar || !body || document.getElementById('tab-devices')) return;

    tabButton = element('button', 'tab-btn', 'Devices');
    tabButton.type = 'button';
    tabButton.id = 'tab-devices';
    tabButton.setAttribute('role', 'tab');
    tabButton.setAttribute('aria-selected', 'false');
    tabButton.setAttribute('aria-controls', 'panel-devices');
    tabButton.addEventListener('click', function () {
      if (typeof window.switchTab === 'function') window.switchTab('devices', tabButton);
    });
    tabBar.appendChild(tabButton);

    panel = element('section', 'panel');
    panel.id = 'panel-devices';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', 'tab-devices');
    panel.tabIndex = 0;

    var deviceCard = element('div', 'card');
    deviceCard.appendChild(element('div', 'card-title', 'This device'));
    var deviceRow = element('div', '');
    deviceRow.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--border);border-radius:12px;margin-bottom:14px';
    var glyph = element('div', '');
    glyph.textContent = '▣';
    glyph.style.cssText = 'font-size:25px;color:var(--accent);width:38px;text-align:center';
    var identity = element('div', '');
    var deviceTitle = element('div', '', 'This device');
    deviceTitle.id = 'device-display-name';
    identity.appendChild(deviceTitle);
    identity.appendChild(element('div', 'target-intro', 'Private device companion'));
    deviceRow.appendChild(glyph);
    deviceRow.appendChild(identity);
    deviceCard.appendChild(deviceRow);

    var nameLabel = element('label', 'target-intro', 'Name this device');
    nameLabel.htmlFor = 'device-local-name';
    var nameInput = element('input', 'input');
    nameInput.id = 'device-local-name';
    nameInput.type = 'text';
    nameInput.maxLength = 60;
    nameInput.autocomplete = 'off';
    nameInput.setAttribute('aria-label', 'Device name');
    try { nameInput.value = localStorage.getItem(deviceNameKey) || 'This device'; }
    catch (error) { nameInput.value = 'This device'; }
    deviceTitle.textContent = nameInput.value;

    var saveName = element('button', 'btn-secondary', 'Save device name');
    saveName.type = 'button';
    saveName.id = 'device-save-name';
    saveName.style.cssText = 'width:100%;margin-top:8px';
    var nameStatus = element('p', 'projection-share-status', 'The name is stored locally on this device.');
    nameStatus.id = 'device-name-status';
    saveName.addEventListener('click', function () {
      var value = nameInput.value.trim();
      if (!value || value.length > 60) {
        nameStatus.textContent = 'Enter a device name between 1 and 60 characters.';
        return;
      }
      try {
        localStorage.setItem(deviceNameKey, value);
        deviceTitle.textContent = value;
        nameStatus.textContent = 'Device name saved on this device.';
      } catch (error) {
        nameStatus.textContent = 'This browser could not save the device name.';
      }
    });
    deviceCard.appendChild(nameLabel);
    deviceCard.appendChild(nameInput);
    deviceCard.appendChild(saveName);
    deviceCard.appendChild(nameStatus);

    var batteryCard = element('div', 'card');
    batteryCard.appendChild(element('div', 'card-title', 'Battery'));
    var batteryStatus = element('p', 'target-intro', 'Checking battery status…');
    batteryStatus.id = 'device-battery-status';
    batteryCard.appendChild(batteryStatus);

    var enrollmentCard = element('div', 'card');
    enrollmentCard.appendChild(element('div', 'card-title', 'Connect to your private dashboard'));
    enrollmentCard.appendChild(element('p', 'target-intro',
      'Paste the Worker URL and one-time invitation code. The phone and dashboard must both approve this enrollment.'));
    var enrollForm = element('form', '');
    enrollForm.id = 'device-enroll-form';
    var apiLabel = element('label', 'target-intro', 'Worker URL');
    apiLabel.htmlFor = 'device-api-url';
    var apiInput = element('input', 'input');
    apiInput.id = 'device-api-url';
    apiInput.type = 'url';
    apiInput.placeholder = 'https://your-worker.workers.dev';
    apiInput.required = true;
    var codeLabel = element('label', 'target-intro', 'One-time invitation code');
    codeLabel.htmlFor = 'device-invite-code';
    var codeInput = element('input', 'input');
    codeInput.id = 'device-invite-code';
    codeInput.autocomplete = 'off';
    codeInput.required = true;
    var enrollButton = element('button', 'btn-primary', 'Enroll this phone');
    enrollButton.id = 'device-enroll-button';
    enrollButton.type = 'submit';
    enrollForm.appendChild(apiLabel);
    enrollForm.appendChild(apiInput);
    enrollForm.appendChild(codeLabel);
    enrollForm.appendChild(codeInput);
    enrollForm.appendChild(enrollButton);
    enrollForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (!api) {
        setStatus('Device API client is not loaded.', true);
        return;
      }
      enrollButton.disabled = true;
      try {
        var result = await api.enrollDevice(
          apiInput.value, codeInput.value, nameInput.value.trim() || 'This device',
          platformValue(), String(window.GRADE_CALC_APP_VERSION || '1.0.0')
        );
        codeInput.value = '';
        setStatus('Invitation redeemed. Approve this phone below, then approve it from the dashboard.');
        await refreshDeviceState();
      } catch (error) {
        setStatus(error.message, true);
      } finally {
        enrollButton.disabled = false;
      }
    });
    enrollmentCard.appendChild(enrollForm);

    var sharingControls = element('div', '');
    sharingControls.id = 'device-sharing-controls';
    sharingControls.hidden = true;
    var approve = element('button', 'btn-primary', 'Approve this phone');
    approve.id = 'device-approve';
    approve.type = 'button';
    approve.hidden = true;
    approve.addEventListener('click', async function () {
      approve.disabled = true;
      try {
        await api.approveOnDevice();
        setStatus('Phone approval recorded. Waiting for dashboard approval.');
        await refreshDeviceState();
      } catch (error) {
        setStatus(error.message, true);
      } finally {
        approve.disabled = false;
      }
    });
    var stop = element('button', 'btn-secondary', 'Stop sharing');
    stop.id = 'device-stop-sharing';
    stop.type = 'button';
    stop.hidden = true;
    stop.addEventListener('click', async function () {
      stop.disabled = true;
      try {
        await api.stopSharing();
        stopTimers();
        await refreshDeviceState();
      } catch (error) {
        setStatus(error.message, true);
      } finally {
        stop.disabled = false;
      }
    });
    var resume = element('button', 'btn-primary', 'Resume sharing');
    resume.id = 'device-resume-sharing';
    resume.type = 'button';
    resume.hidden = true;
    resume.addEventListener('click', async function () {
      resume.disabled = true;
      try {
        await api.resumeSharing();
        await refreshDeviceState();
      } catch (error) {
        setStatus(error.message, true);
      } finally {
        resume.disabled = false;
      }
    });
    sharingControls.appendChild(approve);
    sharingControls.appendChild(stop);
    sharingControls.appendChild(resume);
    enrollmentCard.appendChild(sharingControls);

    var scopesStatus = element('p', 'target-intro', 'No sharing scopes selected yet.');
    scopesStatus.id = 'device-sharing-scopes';
    enrollmentCard.appendChild(scopesStatus);

    var pairingStatus = element('p', 'projection-share-status',
      'Remote connection is unavailable until the private Worker is deployed and configured.');
    pairingStatus.id = 'device-pairing-status';
    pairingStatus.setAttribute('role', 'status');
    pairingStatus.setAttribute('aria-live', 'polite');
    enrollmentCard.appendChild(pairingStatus);

    var privacy = element('div', 'card');
    privacy.appendChild(element('div', 'card-title', 'Privacy'));
    privacy.appendChild(element('p', 'target-intro',
      'No location or network data is collected. Camera and microphone are never activated by this screen. Any photo or audio upload must follow a visible capture and separate Share action. Telemetry currently updates only while the app is open.'));

    panel.appendChild(deviceCard);
    panel.appendChild(batteryCard);
    panel.appendChild(enrollmentCard);
    panel.appendChild(privacy);
    body.appendChild(panel);
    startBatteryPreview();
    refreshDeviceState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopBatteryPreview();
    else {
      startBatteryPreview();
      refreshDeviceState();
    }
  });
  window.addEventListener('pagehide', stopBatteryPreview);
  window.addEventListener('beforeunload', stopBatteryPreview);
  window.GradeCalcDeviceFeatures = { stopBatteryPreview: stopBatteryPreview, refreshDeviceState: refreshDeviceState };
})();
