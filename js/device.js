'use strict';

(function () {
  var watchId = null;
  var lastPosition = null;
  var tabButton;
  var panel;
  var deviceNameKey = 'gradecalc_device_name';

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function setStatus(message, isError) {
    var status = document.getElementById('device-location-status');
    if (!status) return;
    status.textContent = message;
    status.style.color = isError ? 'var(--red)' : 'var(--muted)';
  }

  function stopSharing() {
    if (watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
    }
    watchId = null;
    lastPosition = null;
    var start = document.getElementById('device-start-location');
    var stop = document.getElementById('device-stop-location');
    if (start) start.disabled = false;
    if (stop) stop.disabled = true;
    var state = document.getElementById('device-sharing-state');
    if (state) state.textContent = 'Location sharing is off';
    setStatus('Location access has stopped. No location was uploaded or saved.', false);
    var details = document.getElementById('device-location-details');
    if (details) details.textContent = 'Your location will appear here only while you actively share it.';
    var map = document.getElementById('device-open-map');
    if (map) map.hidden = true;
  }

  function showPosition(position) {
    lastPosition = position;
    var lat = position.coords.latitude;
    var lon = position.coords.longitude;
    var accuracy = Math.round(position.coords.accuracy);
    var details = document.getElementById('device-location-details');
    var state = document.getElementById('device-sharing-state');
    var map = document.getElementById('device-open-map');
    if (details) {
      details.textContent = 'Latitude ' + lat.toFixed(5) + ' · Longitude ' + lon.toFixed(5) +
        ' · Accuracy about ' + accuracy + ' m · Updated ' + new Date(position.timestamp).toLocaleTimeString();
    }
    if (state) state.textContent = 'Sharing on this device';
    if (map) {
      map.href = 'https://www.openstreetmap.org/?mlat=' + encodeURIComponent(lat) +
        '&mlon=' + encodeURIComponent(lon) + '#map=17/' + encodeURIComponent(lat) + '/' + encodeURIComponent(lon);
      map.hidden = false;
    }
    setStatus('Location is being accessed on this device only. Stop sharing whenever you like.', false);
  }

  function startSharing() {
    if (!window.isSecureContext) {
      setStatus('Location requires a secure HTTPS connection. Open the installed app or its HTTPS website.', true);
      return;
    }
    if (!navigator.geolocation) {
      setStatus('This browser does not support location access.', true);
      return;
    }
    var start = document.getElementById('device-start-location');
    var stop = document.getElementById('device-stop-location');
    if (start) start.disabled = true;
    setStatus('Waiting for your device location permission…', false);
    watchId = navigator.geolocation.watchPosition(showPosition, function (error) {
      stopSharing();
      var messages = {
        1: 'Location permission was denied. You can enable it in your device settings.',
        2: 'Your device could not determine its location. Check GPS and try again.',
        3: 'Location request timed out. Try again in an area with a clearer GPS signal.'
      };
      setStatus(messages[error.code] || 'Unable to access location. Please try again.', true);
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
    if (stop) stop.disabled = false;
    var state = document.getElementById('device-sharing-state');
    if (state) state.textContent = 'Waiting for location…';
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
      'Manage location access for this device. Sharing starts only when you choose it.'));
    var deviceRow = element('div', '');
    deviceRow.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--border);border-radius:12px;margin-bottom:14px';
    var glyph = element('div', '');
    glyph.textContent = '▣';
    glyph.style.cssText = 'font-size:25px;color:var(--accent);width:38px;text-align:center';
    var identity = element('div', '');
    identity.appendChild(element('div', '', 'This device'));
    identity.appendChild(element('div', 'target-intro', 'Current browser or installed app'));
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
      nameInput.value = localStorage.getItem(deviceNameKey) || 'My device';
    } catch (error) {
      nameInput.value = 'My device';
    }
    var saveName = element('button', 'btn-secondary', 'Save device name');
    saveName.type = 'button';
    saveName.style.cssText = 'width:100%;margin-top:8px';
    var nameStatus = element('p', 'projection-share-status', 'This name is stored only in this browser.');
    nameStatus.id = 'device-name-status';
    saveName.addEventListener('click', function () {
      var value = nameInput.value.trim();
      if (!value || value.length > 60) {
        nameStatus.textContent = 'Enter a device name between 1 and 60 characters.';
        return;
      }
      try {
        localStorage.setItem(deviceNameKey, value);
        nameStatus.textContent = 'Device name saved on this device.';
      } catch (error) {
        nameStatus.textContent = 'This browser could not save the device name.';
      }
    });
    card.appendChild(nameLabel);
    card.appendChild(nameInput);
    card.appendChild(saveName);
    card.appendChild(nameStatus);
    card.appendChild(element('p', 'target-intro',
      'Account sync and remote device pairing are not enabled yet. This local label does not register or pair a remote device.'));

    var state = element('div', 'target-status', 'Location sharing is off');
    state.id = 'device-sharing-state';
    card.appendChild(state);

    var actions = element('div', 'target-actions');
    var start = element('button', 'btn-primary', 'Share my location');
    start.type = 'button';
    start.id = 'device-start-location';
    start.addEventListener('click', startSharing);
    var stop = element('button', 'btn-secondary', 'Stop sharing');
    stop.type = 'button';
    stop.id = 'device-stop-location';
    stop.disabled = true;
    stop.addEventListener('click', stopSharing);
    actions.appendChild(start);
    actions.appendChild(stop);
    card.appendChild(actions);

    var detailsCard = element('div', 'card');
    detailsCard.appendChild(element('div', 'card-title', 'Current location'));
    var details = element('p', 'target-intro',
      'Your location will appear here only while you actively share it.');
    details.id = 'device-location-details';
    details.style.overflowWrap = 'anywhere';
    detailsCard.appendChild(details);
    var map = element('a', 'btn-secondary', 'View on map');
    map.id = 'device-open-map';
    map.href = '#';
    map.target = '_blank';
    map.rel = 'noopener noreferrer';
    map.hidden = true;
    map.style.cssText = 'display:block;text-align:center;text-decoration:none;padding:12px;margin-top:10px';
    detailsCard.appendChild(map);

    var privacy = element('div', 'card');
    privacy.appendChild(element('div', 'card-title', 'Privacy'));
    privacy.appendChild(element('p', 'target-intro',
      'In this first version, location stays on this device. It is not sent to a server, shared with another person, or saved as history. Your browser may show its own location indicator while access is active.'));
    var status = element('p', 'projection-share-status',
      'Location permission has not been requested.');
    status.id = 'device-location-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    privacy.appendChild(status);

    panel.appendChild(card);
    panel.appendChild(detailsCard);
    panel.appendChild(privacy);
    body.appendChild(panel);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
  window.addEventListener('pagehide', stopSharing);
  window.addEventListener('beforeunload', stopSharing);
  window.GradeCalcDeviceFeatures = { stopSharing: stopSharing };
})();
