package com.viviberi.gradecalc;

import android.Manifest;
import android.content.Intent;
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

@CapacitorPlugin(
    name = "GradeCalcMonitor",
    permissions = {
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public final class GradeCalcMonitorPlugin extends Plugin {
    @PluginMethod
    public void startMonitoring(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "startAfterNotificationPermission");
            return;
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
        if (!apiUrl.startsWith("https://") || !token.matches("[A-Za-z0-9_-]{43}")) {
            call.reject("A valid HTTPS API URL and enrolled device token are required.");
            return;
        }
        Intent intent = new Intent(getContext(), GradeCalcMonitorService.class);
        intent.setAction(GradeCalcMonitorService.ACTION_START);
        intent.putExtra("apiUrl", apiUrl);
        intent.putExtra("deviceToken", token);
        org.json.JSONArray scopes = call.getArray("scopes");
        if (scopes == null || scopes.length() == 0) { call.reject("At least one approved sharing scope is required."); return; }
        intent.putExtra("scopesJson", scopes.toString());
        ContextCompat.startForegroundService(getContext(), intent);
        JSObject result = new JSObject();
        result.put("active", true);
        call.resolve(result);
    }

    @PluginMethod
    public void stopMonitoring(PluginCall call) {
        Intent intent = new Intent(getContext(), GradeCalcMonitorService.class);
        intent.setAction(GradeCalcMonitorService.ACTION_STOP_LOCAL);
        getContext().startService(intent);
        call.resolve();
    }
}
