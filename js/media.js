'use strict';

(function () {
  var cameraStream = null;
  var microphoneStream = null;
  var recorder = null;
  var recordedChunks = [];
  var audioUrl = null;
  var galleryUrl = null;
  var galleryFile = null;
  var capturedPhotoBlob = null;
  var recordedAudioBlob = null;
  var recordingTimer = null;
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

  async function shareMediaFile(file, statusId, successMessage) {
    if (!file || !window.GradeCalcDeviceApi) {
      status(statusId, 'Private media sharing is not configured on this device yet.', true);
      return;
    }
    try {
      await window.GradeCalcDeviceApi.uploadMedia(file);
      status(statusId, successMessage + ' It remains in the private dashboard until you delete it there.', false);
    } catch (error) {
      status(statusId, error.message || 'Media upload failed.', true);
    }
  }

  function clearGalleryPhoto() {
    var preview = document.getElementById('media-gallery-preview');
    if (preview) {
      preview.removeAttribute('src');
      preview.hidden = true;
    }
    if (galleryUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(galleryUrl);
    }
    galleryUrl = null;
    galleryFile = null;
    var share = document.getElementById('media-gallery-share');
    if (share) share.hidden = true;
    var input = document.getElementById('media-gallery-input');
    if (input) input.value = '';
    status('media-gallery-status', 'No gallery photo selected.', false);
  }

  function selectGalleryPhoto(event) {
    var input = event && event.target;
    var file = input && input.files && input.files[0];
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) {
      status('media-gallery-status', 'Choose an image file.', true);
      input.value = '';
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      status('media-gallery-status', 'Choose an image smaller than 20 MB.', true);
      input.value = '';
      return;
    }
    if (galleryUrl) URL.revokeObjectURL(galleryUrl);
    galleryFile = file;
    galleryUrl = URL.createObjectURL(file);
    var share = document.getElementById('media-gallery-share');
    if (share) share.hidden = false;
    var preview = document.getElementById('media-gallery-preview');
    if (preview) {
      preview.src = galleryUrl;
      preview.hidden = false;
    }
    status('media-gallery-status', 'Photo selected for this session only. It has not been uploaded or saved.', false);
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
    capturedPhotoBlob = null;
    var share = document.getElementById('media-camera-share');
    if (share) share.hidden = true;
    canvas.toBlob(function (blob) {
      capturedPhotoBlob = blob;
      if (share) share.hidden = !blob;
    }, 'image/jpeg', 0.9);
    status('media-camera-status', 'Photo captured locally. Tap Share photo to upload it to your private dashboard.', false);
  }

  function stopMicrophone() {
    micRequest += 1;
    if (recordingTimer) clearTimeout(recordingTimer);
    recordingTimer = null;
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
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function' || typeof URL.revokeObjectURL !== 'function') {
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
            recordedAudioBlob = new Blob(recordedChunks, { type: currentRecorder.mimeType || 'audio/webm' });
            audioUrl = URL.createObjectURL(recordedAudioBlob);
            audio.src = audioUrl;
            audio.hidden = false;
            var shareAudio = document.getElementById('media-mic-share');
            if (shareAudio) shareAudio.hidden = false;
            status('media-mic-status', 'Recording ready. Tap Share audio to upload it to your private dashboard.', false);
          }
          recordedChunks = [];
        });
        recorder.start();
        recordingTimer = setTimeout(function () {
          if (recorder === currentRecorder && recorder.state !== 'inactive') stopMicrophone();
        }, 30000);
      } catch (error) {
        stream.getTracks().forEach(function (track) { track.stop(); });
        microphoneStream = null;
        if (start) start.disabled = false;
        status('media-mic-status', 'Recording could not start in this browser.', true);
        return;
      }
      var stop = document.getElementById('media-mic-stop');
      if (stop) stop.disabled = false;
      status('media-mic-status', 'Microphone is recording on this device. Recording stops after 30 seconds or when you tap Stop.', false);
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
    var cameraShare = element('button', 'btn-primary', 'Share photo');
    cameraShare.id = 'media-camera-share';
    cameraShare.type = 'button';
    cameraShare.hidden = true;
    cameraShare.addEventListener('click', function () {
      if (!capturedPhotoBlob) return;
      var file = new File([capturedPhotoBlob], 'camera-photo.jpg', { type: 'image/jpeg' });
      shareMediaFile(file, 'media-camera-status', 'Photo uploaded.');
    });
    cameraActions.appendChild(cameraShare);
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

    var gallery = element('div', 'card');
    gallery.appendChild(element('div', 'card-title', 'Gallery photos'));
    gallery.appendChild(element('p', 'target-intro',
      'Choose a photo using Android’s system photo picker. The selection stays in this session and is not uploaded.'));
    var galleryInput = element('input', '');
    galleryInput.id = 'media-gallery-input';
    galleryInput.type = 'file';
    galleryInput.accept = 'image/*';
    galleryInput.hidden = true;
    galleryInput.addEventListener('change', selectGalleryPhoto);
    var galleryActions = element('div', 'target-actions');
    var galleryChoose = element('button', 'btn-primary', 'Choose from gallery');
    galleryChoose.id = 'media-gallery-choose';
    galleryChoose.type = 'button';
    galleryChoose.addEventListener('click', function () { galleryInput.click(); });
    var galleryClear = element('button', 'btn-secondary', 'Clear photo');
    galleryClear.id = 'media-gallery-clear';
    galleryClear.type = 'button';
    galleryClear.addEventListener('click', clearGalleryPhoto);
    galleryActions.appendChild(galleryChoose);
    galleryActions.appendChild(galleryClear);
    var galleryShare = element('button', 'btn-primary', 'Share selected photo');
    galleryShare.id = 'media-gallery-share';
    galleryShare.type = 'button';
    galleryShare.hidden = true;
    galleryShare.addEventListener('click', function () {
      if (galleryFile) shareMediaFile(galleryFile, 'media-gallery-status', 'Photo uploaded.');
    });
    galleryActions.appendChild(galleryShare);
    gallery.appendChild(galleryInput);
    gallery.appendChild(galleryActions);
    var galleryPreview = element('img', '');
    galleryPreview.id = 'media-gallery-preview';
    galleryPreview.alt = 'Selected gallery photo preview';
    galleryPreview.hidden = true;
    galleryPreview.style.cssText = 'width:100%;border-radius:12px;margin-top:10px';
    gallery.appendChild(galleryPreview);
    var galleryStatus = element('p', 'projection-share-status', 'No gallery photo selected.');
    galleryStatus.id = 'media-gallery-status';
    galleryStatus.setAttribute('role', 'status');
    galleryStatus.setAttribute('aria-live', 'polite');
    gallery.appendChild(galleryStatus);

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
    var micShare = element('button', 'btn-primary', 'Share audio');
    micShare.id = 'media-mic-share';
    micShare.type = 'button';
    micShare.hidden = true;
    micShare.addEventListener('click', function () {
      if (!recordedAudioBlob) return;
      var extension = recordedAudioBlob.type.indexOf('mp4') >= 0 ? 'm4a' : 'webm';
      var file = new File([recordedAudioBlob], 'audio-recording.' + extension, { type: recordedAudioBlob.type });
      shareMediaFile(file, 'media-mic-status', 'Audio uploaded.');
    });
    micActions.appendChild(micShare);
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
    panel.appendChild(gallery);
    panel.appendChild(mic);
    body.appendChild(panel);
  }

  function stopAll() {
    discardRecording = true;
    stopCamera();
    stopMicrophone();
    var photo = document.getElementById('media-photo-preview');
    if (photo) { photo.removeAttribute('src'); photo.hidden = true; }
    clearGalleryPhoto();
    var canvas = document.getElementById('media-photo-canvas');
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    var audio = document.getElementById('media-audio-playback');
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); audio.hidden = true; }
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = null;
    recordedAudioBlob = null;
    capturedPhotoBlob = null;
    recordedChunks = [];
    var cameraShare = document.getElementById('media-camera-share');
    var micShare = document.getElementById('media-mic-share');
    if (cameraShare) cameraShare.hidden = true;
    if (micShare) micShare.hidden = true;
    if (recordingTimer) clearTimeout(recordingTimer);
    recordingTimer = null;
    discardRecording = false;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopAll(); });
  window.addEventListener('pagehide', stopAll);
  window.addEventListener('beforeunload', stopAll);
  window.GradeCalcMedia = { stopAll: stopAll };
})();