package com.viviberi.gradecalc;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONArray;
import java.util.HashSet;
import java.util.Set;

@CapacitorPlugin(
    name = "GradeCalcMonitor",
    permissions = {
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public final class GradeCalcMonitorPlugin extends Plugin {

    @PluginMethod
    public void requestSetupPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33) {
            resolveSetupPermissions(call);
            return;
        }
        PermissionState state = getPermissionState("notifications");
        if (state == PermissionState.GRANTED) {
            resolveSetupPermissions(call);
        } else if (state == PermissionState.PROMPT) {
            requestPermissionForAlias("notifications", call, "finishSetupPermissionRequest");
        } else {
            call.reject("Notification permission is disabled. Enable it in Android Settings before starting visible device sharing.");
        }
    }

    @PermissionCallback
    private void finishSetupPermissionRequest(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            call.reject("Notification permission is required for visible background device sharing.");
            return;
        }
        resolveSetupPermissions(call);
    }

    private void resolveSetupPermissions(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", true);
        result.put("notifications", Build.VERSION.SDK_INT >= 33 ? "granted" : "not_required");
        call.resolve(result);
    }

    private static final Set<String> ALLOWED_SCOPES = new HashSet<String>() {{
        add("battery");
        add("device");
        add("permissionStatus");
        add("appStatus");
    }};

    @PluginMethod
    public void startMonitoring(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33) {
            PermissionState state = getPermissionState("notifications");
            if (state == PermissionState.PROMPT) {
                requestPermissionForAlias("notifications", call, "startAfterNotificationPermission");
                return;
            }
            if (state != PermissionState.GRANTED) {
                call.reject("Notification permission was denied. Enable it in Android Settings to keep device sharing visible.");
                return;
            }
        }
        startService(call);
    }

    @PermissionCallback
    private void startAfterNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            call.reject("Notification permission is required to show the active device-sharing service.");
            return;
        }
        startService(call);
    }

    private void startService(PluginCall call) {
        String apiUrl = call.getString("apiUrl", "");
        String token = call.getString("deviceToken", "");
        JSONArray scopes = call.getArray("scopes");
        if (!isValidApiUrl(apiUrl) || !token.matches("[A-Za-z0-9_-]{43}")) {
            call.reject("A valid HTTPS API URL and enrolled device token are required.");
            return;
        }
        if (scopes == null || scopes.length() == 0 || !hasAllowedScope(scopes)) {
            call.reject("At least one supported status-sharing scope is required.");
            return;
        }

        try {
            // Persist secrets directly through the native bridge; never place them in Intent extras.
            GradeCalcSecureStore.put(getContext(), "apiUrl", apiUrl);
            GradeCalcSecureStore.put(getContext(), "deviceToken", token);
            GradeCalcSecureStore.put(getContext(), "scopes", scopes.toString());
            Intent intent = new Intent(getContext(), GradeCalcMonitorService.class);
            intent.setAction(GradeCalcMonitorService.ACTION_START);
            ContextCompat.startForegroundService(getContext(), intent);
            JSObject result = new JSObject();
            result.put("active", true);
            call.resolve(result);
        } catch (Exception error) {
            GradeCalcSecureStore.clear(getContext());
            call.reject("Android secure storage or foreground service could not start.");
        }
    }

    private boolean isValidApiUrl(String value) {
        try {
            Uri uri = Uri.parse(value);
            return "https".equalsIgnoreCase(uri.getScheme()) &&
                uri.getHost() != null && !uri.getHost().isEmpty() &&
                uri.getUserInfo() == null && uri.getQuery() == null && uri.getFragment() == null;
        } catch (Exception error) {
            return false;
        }
    }

    private boolean hasAllowedScope(JSONArray scopes) {
        try {
            Set<String> seen = new HashSet<>();
            for (int i = 0; i < scopes.length(); i++) {
                String scope = scopes.getString(i);
                if (!ALLOWED_SCOPES.contains(scope) || !seen.add(scope)) return false;
            }
            return true;
        } catch (Exception error) {
            return false;
        }
    }

    @PluginMethod
    public void stopMonitoring(PluginCall call) {
        Intent intent = new Intent(getContext(), GradeCalcMonitorService.class);
        intent.setAction(GradeCalcMonitorService.ACTION_STOP_LOCAL);
        getContext().startService(intent);
        call.resolve();
    }
}
