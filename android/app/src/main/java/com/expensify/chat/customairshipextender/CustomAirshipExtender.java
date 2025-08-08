package com.expensify.chat.customairshipextender;

import android.content.Context;
import android.util.Log;
import androidx.annotation.NonNull;
import com.urbanairship.UAirship;
import com.urbanairship.push.NotificationListener;
import com.urbanairship.push.PushManager;
import com.urbanairship.push.PushMessage;
import com.urbanairship.reactnative.AirshipExtender;

public class CustomAirshipExtender implements AirshipExtender {
    private static final String TAG = "CustomAirshipExtender";

    @Override
    public void onAirshipReady(@NonNull Context context, @NonNull UAirship airship) {
        Log.d(TAG, "=== Airship is ready! Setting up CustomNotificationProvider ===");
        
        PushManager pushManager = airship.getPushManager();
        Log.d(TAG, "PushManager obtained: " + (pushManager != null ? "SUCCESS" : "FAILED"));

        CustomNotificationProvider notificationProvider = new CustomNotificationProvider(context, airship.getAirshipConfigOptions());
        pushManager.setNotificationProvider(notificationProvider);
        
        Log.d(TAG, "CustomNotificationProvider set successfully");
        
        // Add a notification listener to log all push messages
        pushManager.setNotificationListener(new NotificationListener() {
            @Override
            public void onNotificationPosted(@NonNull Context context, @NonNull PushMessage message) {
                Log.d(TAG, "=== NOTIFICATION POSTED ===");
                Log.d(TAG, "Message: " + message.toString());
                Log.d(TAG, "Send ID: " + message.getSendId());
                Log.d(TAG, "Alert: " + message.getExtra("alert"));
                Log.d(TAG, "Title: " + message.getExtra("title"));
            }

            @Override
            public void onNotificationOpened(@NonNull Context context, @NonNull PushMessage message) {
                Log.d(TAG, "=== NOTIFICATION OPENED ===");
                Log.d(TAG, "Message: " + message.toString());
                Log.d(TAG, "Send ID: " + message.getSendId());
            }
        });
        
        Log.d(TAG, "NotificationListener set successfully");
    }
}
