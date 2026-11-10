package com.viviberi.gradecalc;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import android.content.pm.ServiceInfo;
import org.json.JSONObject;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class GradeCalcMonitorService extends Service {
    static final String ACTION_START = "com.viviberi.gradecalc.MONITOR_START";
    static final String ACTION_STOP = "com.viviberi.gradecalc.MONITOR_STOP";
    static final String ACTION_STOP_LOCAL = "com.viviberi.gradecalc.MONITOR_STOP_LOCAL";
    private static final String CHANNEL_ID = "gradecalc_device_sharing";
    private static final int NOTIFICATION_ID = 7401;
    private static final long UPDATE_INTERVAL_MS = 60_000L;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private boolean stopped;
    private final Runnable updateTask = new Runnable() {
        @Override public void run() {
            if (stopped) return;
            executor.execute(() -> publishBatterySnapshot());
            handler.postDelayed(this, UPDATE_INTERVAL_MS);
        }
    };

    @Override public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            pauseRemoteAndStop();
            return START_NOT_STICKY;
        }
        if (intent != null && ACTION_STOP_LOCAL.equals(intent.getAction())) {
            stopMonitoring();
            return START_NOT_STICKY;
        }
        if (intent != null && ACTION_START.equals(intent.getAction())) {
            String apiUrl = intent.getStringExtra("apiUrl");
            String token = intent.getStringExtra("deviceToken");
            try {
                if (apiUrl == null || token == null || !apiUrl.startsWith("https://") ||
                    !token.matches("[A-Za-z0-9_-]{43}")) {
                    stopSelf();
                    return START_NOT_STICKY;
                }
                GradeCalcSecureStore.put(this, "apiUrl", apiUrl);
                GradeCalcSecureStore.put(this, "deviceToken", token);
                String scopesJson = intent.getStringExtra("scopesJson");
                if (scopesJson != null) GradeCalcSecureStore.put(this, "scopes", scopesJson);
            } catch (Exception error) {
                stopSelf();
                return START_NOT_STICKY;
            }
        }
        stopped = false;
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        handler.removeCallbacks(updateTask);
        handler.post(updateTask);
        return START_STICKY;
    }

    private void publishBatterySnapshot() {
        try {
            String apiUrl = GradeCalcSecureStore.get(this, "apiUrl");
            String token = GradeCalcSecureStore.get(this, "deviceToken");
            if (apiUrl == null || token == null) return;
            Intent battery = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (battery == null) return;
            int level = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
            int status = battery.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
            if (level < 0 || scale <= 0) return;
            double fraction = Math.max(0d, Math.min(1d, (double) level / (double) scale));
            boolean charging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                status == BatteryManager.BATTERY_STATUS_FULL;
            String version = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            org.json.JSONArray scopes = new org.json.JSONArray(GradeCalcSecureStore.get(this, "scopes"));
            JSONObject snapshot = new JSONObject();
            for (int i = 0; i < scopes.length(); i++) {
                String scope = scopes.getString(i);
                if ("battery".equals(scope)) snapshot.put("battery", new JSONObject().put("level", fraction).put("charging", charging));
                if ("device".equals(scope)) snapshot.put("device", new JSONObject().put("platform", "android")
                    .put("appVersion", version == null ? "1.0.0" : version.substring(0, Math.min(32, version.length()))));
                if ("appStatus".equals(scope)) snapshot.put("appStatus", new JSONObject().put("active", true));
                if ("permissionStatus".equals(scope)) {
                    boolean camera = checkSelfPermission(android.Manifest.permission.CAMERA) == android.content.pm.PackageManager.PERMISSION_GRANTED;
                    boolean microphone = checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED;
                    snapshot.put("permissionStatus", new JSONObject().put("camera", camera ? "granted" : "denied")
                        .put("microphone", microphone ? "granted" : "denied"));
                }
            }
            if (snapshot.length() == 0) return;
            byte[] body = new JSONObject().put("snapshot", snapshot).toString().getBytes(StandardCharsets.UTF_8);
            HttpURLConnection connection = (HttpURLConnection) new URL(apiUrl.replaceAll("/+$", "") + "/v1/telemetry").openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(10_000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Authorization", "Bearer " + token);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setFixedLengthStreamingMode(body.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body);
            }
            int response = connection.getResponseCode();
            connection.disconnect();
            if (response == 401 || response == 403) handler.post(this::stopMonitoring);
        } catch (Exception ignored) {
            // A later foreground-service cycle retries transient connectivity failures.
        }
    }

    private Notification buildNotification() {
        Intent stopIntent = new Intent(this, GradeCalcMonitorService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPending = PendingIntent.getService(this, 7402, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentTitle("GradeCalc device sharing is active")
            .setContentText("Approved device status is shared with your private dashboard.")
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .addAction(android.R.drawable.ic_media_pause, "Stop sharing", stopPending)
            .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID,
                "GradeCalc device sharing", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Visible notification while this phone shares device status.");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private void pauseRemoteAndStop() {
        executor.execute(() -> {
            try {
                String apiUrl = GradeCalcSecureStore.get(this, "apiUrl");
                String token = GradeCalcSecureStore.get(this, "deviceToken");
                if (apiUrl != null && token != null) {
                    HttpURLConnection connection = (HttpURLConnection) new URL(apiUrl.replaceAll("/+$", "") + "/v1/device/stop").openConnection();
                    connection.setRequestMethod("POST");
                    connection.setConnectTimeout(8_000);
                    connection.setReadTimeout(8_000);
                    connection.setRequestProperty("Authorization", "Bearer " + token);
                    connection.getResponseCode();
                    connection.disconnect();
                }
            } catch (Exception ignored) {
                // Local stop still takes effect when the device is offline.
            }
            handler.post(this::stopMonitoring);
        });
    }

    private void stopMonitoring() {
        stopped = true;
        handler.removeCallbacks(updateTask);
        GradeCalcSecureStore.clear(this);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        stopSelf();
    }

    @Override public void onDestroy() {
        stopped = true;
        handler.removeCallbacks(updateTask);
        executor.shutdownNow();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
