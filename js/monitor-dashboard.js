'use strict';

(function () {
  var api = window.GradeCalcDeviceApi;
  var refreshHandle = null;

  function byId(id) { return document.getElementById(id); }
  function setStatus(message, isError) {
    var status = byId('dashboard-status');
    if (!status) return;
    status.textContent = message;
    status.dataset.state = isError ? 'error' : 'ok';
  }
  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function bytesLabel(value) {
    if (value < 1024) return value + ' B';
    if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KB';
    return (value / (1024 * 1024)).toFixed(1) + ' MB';
  }
  function dateLabel(value) {
    return value ? new Date(value).toLocaleString() : 'Not yet';
  }
  function scopeLabel(scope) {
    var labels = {
      battery: 'Battery level and charging state',
      device: 'Device platform and app version',
      permissionStatus: 'Camera and microphone permission status',
      appStatus: 'App activity heartbeat',
      media: 'Manual photo/audio sharing'
    };
    return labels[scope] || scope;
  }

  function batteryLabel(snapshot) {
    if (!snapshot || !snapshot.battery) return 'No recent battery reading';
    return Math.round(snapshot.battery.level * 100) + '% · ' +
      (snapshot.battery.charging ? 'Charging' : 'Not charging');
  }

  function renderDevices(devices) {
    var list = byId('remote-devices');
    if (!list) return;
    list.replaceChildren();
    if (!devices.length) {
      list.appendChild(make('p', 'muted', 'No enrolled devices yet. Create an invitation to add a phone.'));
      return;
    }
    devices.forEach(function (device) {
      var card = make('article', 'remote-device-card');
      var top = make('div', 'remote-device-top');
      var title = make('h3', '', device.name || 'Unnamed device');
      var displayStatus = device.status === 'active' ? (device.online ? 'Online' : 'Offline') : device.status;
      var status = make('span', 'device-state', displayStatus);
      status.dataset.state = device.status;
      top.appendChild(title);
      top.appendChild(status);
      card.appendChild(top);
      card.appendChild(make('p', 'muted', device.platform + ' · App ' + (device.appVersion || 'unknown')));
      card.appendChild(make('p', 'muted', 'Requested sharing: ' + (device.scopes || []).map(scopeLabel).join(', ')));
      card.appendChild(make('p', 'device-reading', batteryLabel(device.telemetry)));
      card.appendChild(make('p', 'muted', 'Last update: ' + dateLabel(device.updatedAt || device.lastSeenAt)));
      card.appendChild(make('p', 'muted', 'Approved on phone: ' + (device.deviceApprovedAt ? 'Yes' : 'Waiting')));
      card.appendChild(make('p', 'muted', 'Approved on dashboard: ' + (device.ownerApprovedAt ? 'Yes' : 'Waiting')));
      var actions = make('div', 'device-actions');
      if (device.status === 'pending' && !device.ownerApprovedAt) {
        var approve = make('button', 'secondary', 'Approve this device');
        approve.type = 'button';
        approve.addEventListener('click', async function () {
          approve.disabled = true;
          try {
            await api.approveDashboardDevice(device.id);
            setStatus('Dashboard approval recorded. The device becomes active after on-device approval too.');
            await loadDashboard();
          } catch (error) {
            setStatus(error.message, true);
            approve.disabled = false;
          }
        });
        actions.appendChild(approve);
      }
      if (device.status === 'active') {
        var pause = make('button', 'secondary', 'Pause sharing');
        pause.type = 'button';
        pause.addEventListener('click', async function () {
          pause.disabled = true;
          try {
            await api.pauseDevice(device.id);
            setStatus('Sharing paused. The phone can resume it from the Devices tab.');
            await loadDashboard();
          } catch (error) {
            setStatus(error.message, true);
            pause.disabled = false;
          }
        });
        actions.appendChild(pause);
      }
      if (device.status !== 'revoked') {
        var revoke = make('button', 'danger', 'Revoke device');
        revoke.type = 'button';
        revoke.addEventListener('click', async function () {
          if (!window.confirm('Revoke ' + (device.name || 'this device') + '?')) return;
          revoke.disabled = true;
          try {
            await api.revokeDevice(device.id);
            setStatus('Device access revoked.');
            await loadDashboard();
          } catch (error) {
            setStatus(error.message, true);
            revoke.disabled = false;
          }
        });
        actions.appendChild(revoke);
      }
      card.appendChild(actions);
      list.appendChild(card);
    });
  }

  function renderMedia(items) {
    var list = byId('remote-media');
    if (!list) return;
    list.replaceChildren();
    if (!items.length) {
      list.appendChild(make('p', 'muted', 'No shared media stored.'));
      return;
    }
    items.forEach(function (item) {
      var card = make('article', 'media-item');
      var title = make('strong', '', item.filename || 'Shared file');
      card.appendChild(title);
      card.appendChild(make('p', 'muted', item.contentType + ' · ' + bytesLabel(item.bytes)));
      card.appendChild(make('p', 'muted', dateLabel(item.createdAt)));
      var actions = make('div', 'device-actions');
      var download = make('button', 'secondary', 'Download');
      download.type = 'button';
      download.addEventListener('click', async function () {
        download.disabled = true;
        try {
          var blob = await api.downloadMedia(item.id);
          var objectUrl = URL.createObjectURL(blob);
          var anchor = make('a');
          anchor.href = objectUrl;
          anchor.download = item.filename || 'shared-media';
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          URL.revokeObjectURL(objectUrl);
        } catch (error) {
          setStatus(error.message, true);
        } finally {
          download.disabled = false;
        }
      });
      var remove = make('button', 'danger', 'Delete permanently');
      remove.type = 'button';
      remove.addEventListener('click', async function () {
        if (!window.confirm('Permanently delete this media file?')) return;
        remove.disabled = true;
        try {
          await api.deleteMedia(item.id);
          setStatus('Media file permanently deleted.');
          await loadDashboard();
        } catch (error) {
          setStatus(error.message, true);
          remove.disabled = false;
        }
      });
      actions.appendChild(download);
      actions.appendChild(remove);
      card.appendChild(actions);
      list.appendChild(card);
    });
  }

  async function loadDashboard() {
    if (!api) return;
    try {
      var results = await Promise.all([api.listDevices(), api.listMedia()]);
      renderDevices(results[0].devices || []);
      renderMedia(results[1].media || []);
      setStatus('Dashboard connected. Device and media data are private to this owner token.');
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  function showDashboard(settings) {
    byId('setup-panel').hidden = true;
    byId('dashboard-panel').hidden = false;
    byId('owner-id').textContent = settings.ownerId;
    byId('api-url-label').textContent = settings.apiUrl;
    loadDashboard();
    if (refreshHandle) clearInterval(refreshHandle);
    refreshHandle = setInterval(function () {
      if (!document.hidden) loadDashboard();
    }, 20000);
  }

  async function initialize() {
    if (!api) {
      setStatus('Device API client is not available.', true);
      return;
    }
    var settings = await api.getSettings();
    if (settings.ownerToken && settings.ownerId) {
      showDashboard(settings);
    } else {
      byId('setup-panel').hidden = false;
      byId('dashboard-panel').hidden = true;
      if (settings.apiUrl) byId('api-url').value = settings.apiUrl;
      setStatus('Set up this browser as the private dashboard owner.');
    }
  }

  byId('setup-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    var button = byId('setup-button');
    button.disabled = true;
    try {
      var result = await api.setupDashboard(byId('api-url').value, byId('setup-secret').value);
      byId('setup-secret').value = '';
      var settings = await api.getSettings();
      setStatus('Private dashboard initialized. Save your browser data; the owner token has no recovery flow.');
      showDashboard(settings);
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  byId('save-api-url').addEventListener('click', async function () {
    try {
      await api.saveApiUrl(byId('api-url').value);
      setStatus('Worker URL saved locally.');
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  byId('create-invite').addEventListener('click', async function () {
    var scopes = Array.from(document.querySelectorAll('[data-device-scope]:checked'))
      .map(function (input) { return input.value; });
    if (!scopes.length) {
      setStatus('Select at least one device scope.', true);
      return;
    }
    var button = byId('create-invite');
    button.disabled = true;
    try {
      var invite = await api.createInvite(scopes);
      byId('invite-code').textContent = invite.code;
      byId('invite-expires').textContent = 'Expires: ' + dateLabel(invite.expiresAt);
      byId('invite-result').hidden = false;
      setStatus('One-time invitation created. Transfer it only to your own phone.');
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  byId('copy-invite').addEventListener('click', async function () {
    try {
      await navigator.clipboard.writeText(byId('invite-code').textContent);
      setStatus('Invitation copied. It expires after five minutes and can be used once.');
    } catch (error) {
      setStatus('Copy is unavailable. Select and copy the invitation code manually.', true);
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && byId('dashboard-panel') && !byId('dashboard-panel').hidden) loadDashboard();
  });
  window.addEventListener('pagehide', function () {
    if (refreshHandle) clearInterval(refreshHandle);
  });

  initialize().catch(function (error) { setStatus(error.message, true); });
})();
