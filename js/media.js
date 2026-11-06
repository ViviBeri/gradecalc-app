'use strict';

(function () {
  var cameraStream = null;
  var microphoneStream = null;
  var recorder = null;
  var recordedChunks = [];
  var audioUrl = null;
  var panel;
  var cameraRequest = 0;
  var micRequest = 0;
  var discardRecording = false;

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function status(id, message, isError) {
    var node = document.getElementById(id);
    if (!node) return;
    node.textContent = message;
    node.style.color = isError ? 'var(--red)' : 'var(--muted)';
  }

  function stopCamera() {
    cameraRequest += 1;
    if (cameraStream) cameraStream.getTracks().forEach(function (track) { track.stop(); });
    cameraStream = null;
    var video = document.getElementById('media-camera-preview');
    if (video) {
      video.pause();
      video.srcObject = null;
      video.hidden = true;
    }
    var start = document.getElementById('media-camera-start');
    var capture = document.getElementById('media-camera-capture');
    var stop = document.getElementById('media-camera-stop');
    if (start) start.disabled = false;
    if (capture) capture.disabled = true;
    if (stop) stop.disabled = true;
    status('media-camera-status', 'Camera is off.', false);
  }

  function startCamera() {
    if (cameraStream) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      status('media-camera-status', 'Camera access is unavailable in this browser or context.', true);
      return;
    }
    var start = document.getElementById('media-camera-start');
    if (start) start.disabled = true;
    status('media-camera-status', 'Starting camera…', false);
    var requestId = ++cameraRequest;
    navigator.mediaDevices.getUserMedia({ video: true, audio: false }).then(function (stream) {
      if (document.hidden || requestId !== cameraRequest) {
        stream.getTracks().forEach(function (track) { track.stop(); });
        if (start) start.disabled = false;
        if (requestId === cameraRequest) status('media-camera-status', 'Camera was not started because the app is not visible.', true);
        return;
      }
      cameraStream = stream;
      var video = document.getElementById('media-camera-preview');
      if (video) {
        video.srcObject = stream;
        video.hidden = false;
        var playback = video.play();
        if (playback && playback.catch) playback.catch(function () {});
      }
      var capture = document.getElementById('media-camera-capture');
      var stop = document.getElementById('media-camera-stop');
      if (capture) capture.disabled = false;
      if (stop) stop.disabled = false;
      status('media-camera-status', 'Camera is active on this device. Stop when finished.', false);
    }).catch(function () {
      if (requestId !== cameraRequest) return;
      if (start) start.disabled = false;
      status('media-camera-status', 'Camera could not start. Check the camera permission and try again.', true);
    });
  }

  function capturePhoto() {
    if (!cameraStream) return;
    var video = document.getElementById('media-camera-preview');
    var canvas = document.getElementById('media-photo-canvas');
    var output = document.getElementById('media-photo-preview');
    if (!video || !canvas || !output || !video.videoWidth || !video.videoHeight) {
      status('media-camera-status', 'The camera preview is not ready yet. Try again in a moment.', true);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    var context = canvas.getContext('2d');
    if (!context) {
      status('media-camera-status', 'Photo capture is unavailable in this browser.', true);
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    output.src = canvas.toDataURL('image/jpeg', 0.9);
    output.hidden = false;
    status('media-camera-status', 'Photo captured in this session only. It has not been uploaded or saved.', false);
  }

  function stopMicrophone() {
    micRequest += 1;
    if (recorder && recorder.state !== 'inactive') {
      if (discardRecording) recorder.__gradecalcDiscard = true;
      recorder.stop();
    }
    if (microphoneStream) microphoneStream.getTracks().forEach(function (track) { track.stop(); });
    microphoneStream = null;
    recorder = null;
    var start = document.getElementById('media-mic-start');
    var stop = document.getElementById('media-mic-stop');
    if (start) start.disabled = false;
    if (stop) stop.disabled = true;
    status('media-mic-status', 'Microphone is off.', false);
  }

  function startMicrophone() {
    if (microphoneStream) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      status('media-mic-status', 'Microphone recording is unavailable in this browser or context.', true);
      return;
    }
    var start = document.getElementById('media-mic-start');
    if (start) start.disabled = true;
    status('media-mic-status', 'Starting microphone…', false);
    var requestId = ++micRequest;
    navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(function (stream) {
      if (document.hidden || requestId !== micRequest) {
        stream.getTracks().forEach(function (track) { track.stop(); });
        if (start) start.disabled = false;
        if (requestId === micRequest) status('media-mic-status', 'Recording was not started because the app is not visible.', true);
        return;
      }
      microphoneStream = stream;
      recordedChunks = [];
      try {
        recorder = new MediaRecorder(stream);
        var currentRecorder = recorder;
        currentRecorder.__gradecalcDiscard = false;
        recorder.addEventListener('dataavailable', function (event) {
          if (event.data && event.data.size) recordedChunks.push(event.data);
        });
        recorder.addEventListener('stop', function () {
          if (audioUrl) URL.revokeObjectURL(audioUrl);
          audioUrl = null;
          var audio = document.getElementById('media-audio-playback');
          if (!currentRecorder.__gradecalcDiscard && recordedChunks.length && audio) {
            audioUrl = URL.createObjectURL(new Blob(recordedChunks, { type: currentRecorder.mimeType || 'audio/webm' }));
            audio.src = audioUrl;
            audio.hidden = false;
          }
          recordedChunks = [];
        });
        recorder.start();
      } catch (error) {
        stream.getTracks().forEach(function (track) { track.stop(); });
        microphoneStream = null;
        if (start) start.disabled = false;
        status('media-mic-status', 'Recording could not start in this browser.', true);
        return;
      }
      var stop = document.getElementById('media-mic-stop');
      if (stop) stop.disabled = false;
      status('media-mic-status', 'Microphone is recording on this device. Stop when finished.', false);
    }).catch(function () {
      if (requestId !== micRequest) return;
      if (start) start.disabled = false;
      status('media-mic-status', 'Microphone could not start. Check the microphone permission and try again.', true);
    });
  }

  function build() {
    var body = document.getElementById('panel-devices');
    if (!body || document.getElementById('media-controls')) return;
    panel = element('section', '');
    panel.id = 'media-controls';
    panel.setAttribute('aria-label', 'Camera and microphone');
    var camera = element('div', 'card');
    camera.appendChild(element('div', 'card-title', 'Camera'));
    camera.appendChild(element('p', 'target-intro', 'Camera access starts only when you tap Start camera. Photos stay in this session and are not uploaded.'));
    var cameraActions = element('div', 'target-actions');
    var cameraStart = element('button', 'btn-primary', 'Start camera');
    cameraStart.id = 'media-camera-start';
    cameraStart.type = 'button';
    cameraStart.addEventListener('click', startCamera);
    var cameraCapture = element('button', 'btn-secondary', 'Take photo');
    cameraCapture.id = 'media-camera-capture';
    cameraCapture.type = 'button';
    cameraCapture.disabled = true;
    cameraCapture.addEventListener('click', capturePhoto);
    var cameraStop = element('button', 'btn-secondary', 'Stop camera');
    cameraStop.id = 'media-camera-stop';
    cameraStop.type = 'button';
    cameraStop.disabled = true;
    cameraStop.addEventListener('click', stopCamera);
    cameraActions.appendChild(cameraStart);
    cameraActions.appendChild(cameraCapture);
    cameraActions.appendChild(cameraStop);
    camera.appendChild(cameraActions);
    var video = element('video', '');
    video.id = 'media-camera-preview';
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.hidden = true;
    video.style.cssText = 'width:100%;border-radius:12px;margin-top:10px;background:#000';
    camera.appendChild(video);
    var canvas = element('canvas', '');
    canvas.id = 'media-photo-canvas';
    canvas.hidden = true;
    camera.appendChild(canvas);
    var photo = element('img', '');
    photo.id = 'media-photo-preview';
    photo.alt = 'Photo captured in this session';
    photo.hidden = true;
    photo.style.cssText = 'width:100%;border-radius:12px;margin-top:10px';
    camera.appendChild(photo);
    var cameraStatus = element('p', 'projection-share-status', 'Camera is off.');
    cameraStatus.id = 'media-camera-status';
    cameraStatus.setAttribute('role', 'status');
    cameraStatus.setAttribute('aria-live', 'polite');
    camera.appendChild(cameraStatus);

    var mic = element('div', 'card');
    mic.appendChild(element('div', 'card-title', 'Microphone'));
    mic.appendChild(element('p', 'target-intro', 'Recording starts only when you tap Start recording. Audio stays in this session and is not uploaded.'));
    var micActions = element('div', 'target-actions');
    var micStart = element('button', 'btn-primary', 'Start recording');
    micStart.id = 'media-mic-start';
    micStart.type = 'button';
    micStart.addEventListener('click', startMicrophone);
    var micStop = element('button', 'btn-secondary', 'Stop recording');
    micStop.id = 'media-mic-stop';
    micStop.type = 'button';
    micStop.disabled = true;
    micStop.addEventListener('click', stopMicrophone);
    micActions.appendChild(micStart);
    micActions.appendChild(micStop);
    mic.appendChild(micActions);
    var audio = element('audio', '');
    audio.id = 'media-audio-playback';
    audio.controls = true;
    audio.hidden = true;
    audio.style.cssText = 'width:100%;margin-top:10px';
    mic.appendChild(audio);
    var micStatus = element('p', 'projection-share-status', 'Microphone is off.');
    micStatus.id = 'media-mic-status';
    micStatus.setAttribute('role', 'status');
    micStatus.setAttribute('aria-live', 'polite');
    mic.appendChild(micStatus);

    panel.appendChild(camera);
    panel.appendChild(mic);
    body.appendChild(panel);
  }

  function stopAll() {
    discardRecording = true;
    stopCamera();
    stopMicrophone();
    var photo = document.getElementById('media-photo-preview');
    if (photo) { photo.removeAttribute('src'); photo.hidden = true; }
    var canvas = document.getElementById('media-photo-canvas');
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    var audio = document.getElementById('media-audio-playback');
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); audio.hidden = true; }
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = null;
    recordedChunks = [];
    discardRecording = false;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopAll(); });
  window.addEventListener('pagehide', stopAll);
  window.addEventListener('beforeunload', stopAll);
  window.GradeCalcMedia = { stopAll: stopAll };
})();