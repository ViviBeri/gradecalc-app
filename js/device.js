'use strict';

(function () {
  var tabButton;
  var panel;
  var battery = null;
  var batteryListener = null;
  var deviceNameKey = 'gradecalc_device_name';

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function stopBatteryPreview() {
    if (battery && batteryListener) {
      battery.removeEventListener('levelchange', batteryListener);
      battery.removeEventListener('chargingchange', batteryListener);
    }
    battery = null;
    batteryListener = null;
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
      stopBatteryPreview();
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

    var card = element('div', 'card');
    card.appendChild(element('div', 'card-title', 'Your devices'));
    card.appendChild(element('p', 'target-intro',
      'Manage the phones and browsers connected to your private dashboard.'));

    var deviceRow = element('div', '');
    deviceRow.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--border);border-radius:12px;margin-bottom:14px';
    var glyph = element('div', '');
    glyph.textContent = '▣';
    glyph.style.cssText = 'font-size:25px;color:var(--accent);width:38px;text-align:center';
    var identity = element('div', '');
    var deviceTitle = element('div', '', 'This device');
    deviceTitle.id = 'device-display-name';
    identity.appendChild(deviceTitle);
    identity.appendChild(element('div', 'target-intro', 'Local browser preview'));
    deviceRow.appendChild(glyph);
    deviceRow.appendChild(identity);
    card.appendChild(deviceRow);

    var nameLabel = element('label', 'target-intro', 'Name this device');
    nameLabel.htmlFor = 'device-local-name';
    var nameInput = element('input', 'input');
    nameInput.id = 'device-local-name';
    nameInput.type = 'text';
    nameInput.maxLength = 60;
    nameInput.autocomplete = 'off';
    nameInput.setAttribute('aria-label', 'Device name on this device');
    try {
      nameInput.value = localStorage.getItem(deviceNameKey) || 'This device';
    } catch (error) {
      nameInput.value = 'This device';
    }
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
    card.appendChild(nameLabel);
    card.appendChild(nameInput);
    card.appendChild(saveName);
    card.appendChild(nameStatus);

    var batteryCard = element('div', 'card');
    batteryCard.appendChild(element('div', 'card-title', 'Battery'));
    var batteryStatus = element('p', 'target-intro', 'Checking battery status…');
    batteryStatus.id = 'device-battery-status';
    batteryCard.appendChild(batteryStatus);

    var pairingCard = element('div', 'card');
    pairingCard.appendChild(element('div', 'card-title', 'Add another device'));
    pairingCard.appendChild(element('p', 'target-intro',
      'Secure multi-device enrollment is being prepared. No phone is added until the private dashboard and one-time enrollment flow are connected.'));
    var addDevice = element('button', 'btn-secondary', 'Add device');
    addDevice.type = 'button';
    addDevice.id = 'device-add-device';
    addDevice.disabled = true;
    pairingCard.appendChild(addDevice);
    var pairingStatus = element('p', 'projection-share-status',
      'Pairing is not active yet. This screen does not register or monitor another device.');
    pairingStatus.id = 'device-pairing-status';
    pairingStatus.setAttribute('role', 'status');
    pairingStatus.setAttribute('aria-live', 'polite');
    pairingCard.appendChild(pairingStatus);

    var privacy = element('div', 'card');
    privacy.appendChild(element('div', 'card-title', 'Privacy'));
    privacy.appendChild(element('p', 'target-intro',
      'Location and network details are not collected. Camera and microphone are never activated by this screen. Any future media capture must be started visibly on the device itself.'));

    panel.appendChild(card);
    panel.appendChild(batteryCard);
    panel.appendChild(pairingCard);
    panel.appendChild(privacy);
    body.appendChild(panel);
    startBatteryPreview();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopBatteryPreview();
    else if (!battery) startBatteryPreview();
  });
  window.addEventListener('pagehide', stopBatteryPreview);
  window.addEventListener('beforeunload', stopBatteryPreview);
  window.GradeCalcDeviceFeatures = { stopBatteryPreview: stopBatteryPreview };
})();
