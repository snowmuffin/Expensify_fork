import type {PushPayload} from '@ua/react-native-airship';
import Airship, {EventType} from '@ua/react-native-airship';
import {NativeModules} from 'react-native';
import Log from '@libs/Log';
import ShortcutManager from '@libs/ShortcutManager';
import ForegroundNotifications from './ForegroundNotifications';
import type {NotificationDataMap, NotificationTypes} from './NotificationType';
import NotificationType from './NotificationType';
import parsePushNotificationPayload from './parsePushNotificationPayload';
import type {ClearNotifications, Deregister, Init, OnReceived, OnSelected, Register} from './types';
import type PushNotificationType from './types';

type NotificationEventHandler<T extends NotificationTypes> = (data: NotificationDataMap[T]) => Promise<void>;

type NotificationEventHandlerMap<T extends NotificationTypes> = Partial<Record<T, NotificationEventHandler<T>>>;

type NotificationEventActionMap = Partial<Record<EventType, NotificationEventHandlerMap<NotificationTypes>>>;

const notificationEventActionMap: NotificationEventActionMap = {};

/**
 * Handle a push notification event, and trigger and bound actions.
 */
function pushNotificationEventCallback(eventType: EventType, notification: PushPayload) {
    // CRITICAL: Log initial push notification receipt before any processing
    console.log('====== INITIAL PUSH NOTIFICATION RECEIVED ======');
    console.log('[RECEIVE] Push notification arrived at React Native layer');
    console.log('[RECEIVE] Event Type:', eventType);
    console.log('[RECEIVE] Notification ID:', notification?.notificationId);
    console.log('[RECEIVE] Alert:', notification?.alert);
    console.log('[RECEIVE] Title:', notification?.title);
    console.log('[RECEIVE] Subtitle:', notification?.subtitle);
    console.log('[RECEIVE] Timestamp:', new Date().toISOString());
    console.log('[RECEIVE] Extras keys:', Object.keys(notification?.extras || {}));
    console.log('=================================================');
    
    Log.info('[RECEIVE] Push notification received at React Native layer', false, {
        eventType,
        notificationId: notification?.notificationId,
        alert: notification?.alert,
        title: notification?.title,
        subtitle: notification?.subtitle,
        extrasKeys: Object.keys(notification?.extras || {}),
        timestamp: new Date().toISOString(),
    });

    const actionMap = notificationEventActionMap[eventType] ?? {};

    // Add detailed logs when push notifications are received
    Log.info(`[PushNotification] Push notification received - Event: ${eventType}`, false, {
        notificationId: notification.notificationId,
        extras: notification.extras,
        alert: notification.alert,
        title: notification.title,
        subtitle: notification.subtitle,
        timestamp: new Date().toISOString(),
    });

    const data = parsePushNotificationPayload(notification.extras.payload);

    Log.info(`[PushNotification] Callback triggered for ${eventType}`, false, {
        parsedData: data,
        hasActionMap: !!actionMap,
        actionMapKeys: Object.keys(actionMap),
    });

    if (!data) {
        Log.warn('[PushNotification] Notification has null or undefined payload, not executing any callback.', {
            rawPayload: notification.extras.payload,
            notificationId: notification.notificationId,
        });
        return;
    }

    if (!data.type) {
        Log.warn('[PushNotification] No type value provided in payload, not executing any callback.', {
            data,
            notificationId: notification.notificationId,
        });
        return;
    }

    // Add logs for notification type specific processing
    Log.info(`[PushNotification] Processing notification type: ${data.type}`, false, {
        reportID: data.reportID,
        lastUpdateID: data.lastUpdateID,
        eventType,
        notificationId: notification.notificationId,
    });

    const action = actionMap[data.type];
    if (!action) {
        Log.warn('[PushNotification] No callback set up: ', {
            event: eventType,
            notificationType: data.type,
            availableTypes: Object.keys(actionMap),
        });
        return;
    }

    /**
     * The action callback should return a promise. It's very important we return that promise so that
     * when these callbacks are run in Android's background process (via Headless JS), the process waits
     * for the promise to resolve before quitting
     */
    Log.info('[PushNotification] Executing action callback', false, {
        eventType,
        notificationType: data.type,
        reportID: data.reportID,
    });
    
    return action(data);
}

/**
 * Configure push notifications and register callbacks. This is separate from namedUser registration because it needs to be executed
 * from a headless JS process, outside of any react lifecycle.
 *
 * WARNING: Moving or changing this code could break Push Notification processing in non-obvious ways.
 *          DO NOT ALTER UNLESS YOU KNOW WHAT YOU'RE DOING. See this PR for details: https://github.com/Expensify/App/pull/3877
 */
const init: Init = () => {
    Log.info('[PushNotification] Initializing push notification system', false, {
        timestamp: new Date().toISOString(),
    });

    // Check native bridge availability
    const bridgeStatus = {
        pushNotificationBridgeExists: !!NativeModules.PushNotificationBridge,
        hasFinishBackgroundProcessing: !!(NativeModules.PushNotificationBridge?.finishBackgroundProcessing),
        nativeModulesKeys: Object.keys(NativeModules).filter(key => key.includes('Push') || key.includes('Notification')),
    };
    
    Log.info('[PushNotification] Native bridge status', false, bridgeStatus);

    // Setup event listeners with explicit logging
    Log.info('[PushNotification] Setting up event listeners', false, {
        EventType: EventType,
        PushReceived: EventType.PushReceived,
        NotificationResponse: EventType.NotificationResponse,
    });

    Airship.addListener(EventType.PushReceived, (notification) => {
        // CRITICAL: Log at Airship SDK level - earliest entry point
        console.log('====== AIRSHIP SDK PUSH RECEIVED ======');
        console.log('[AIRSHIP] PushReceived event triggered at Airship SDK level');
        console.log('[AIRSHIP] Notification ID:', notification?.pushPayload?.notificationId);
        console.log('[AIRSHIP] Alert:', notification?.pushPayload?.alert);
        console.log('[AIRSHIP] Title:', notification?.pushPayload?.title);
        console.log('[AIRSHIP] Subtitle:', notification?.pushPayload?.subtitle);
        console.log('[AIRSHIP] Has extras:', !!(notification?.pushPayload?.extras));
        console.log('[AIRSHIP] Timestamp:', new Date().toISOString());
        console.log('=======================================');
        
        Log.info('[AIRSHIP] PushReceived listener triggered at Airship SDK level', false, {
            notificationId: notification?.pushPayload?.notificationId,
            alert: notification?.pushPayload?.alert,
            title: notification?.pushPayload?.title,
            subtitle: notification?.pushPayload?.subtitle,
            hasExtras: !!(notification?.pushPayload?.extras),
            hasPayload: !!notification?.pushPayload,
            timestamp: new Date().toISOString(),
        });
        return pushNotificationEventCallback(EventType.PushReceived, notification.pushPayload);
    });

    // Note: the NotificationResponse event has a nested PushReceived event,
    // so event.notification refers to the same thing as notification above ^
    Airship.addListener(EventType.NotificationResponse, (event) => {
        // CRITICAL: Log notification response (user tap)
        console.log('====== AIRSHIP SDK NOTIFICATION RESPONSE ======');
        console.log('[AIRSHIP] NotificationResponse event triggered (user tapped notification)');
        console.log('[AIRSHIP] Notification ID:', event?.pushPayload?.notificationId);
        console.log('[AIRSHIP] Alert:', event?.pushPayload?.alert);
        console.log('[AIRSHIP] Title:', event?.pushPayload?.title);
        console.log('[AIRSHIP] Timestamp:', new Date().toISOString());
        console.log('===============================================');
        
        Log.info('[AIRSHIP] NotificationResponse listener triggered (user tapped)', false, {
            notificationId: event?.pushPayload?.notificationId,
            alert: event?.pushPayload?.alert,
            title: event?.pushPayload?.title,
            hasPayload: !!event?.pushPayload,
            timestamp: new Date().toISOString(),
        });
        return pushNotificationEventCallback(EventType.NotificationResponse, event.pushPayload);
    });

    // Log all available Airship events
    try {
        const allEventTypes = Object.values(EventType);
        Log.info('[PushNotification] Available Airship event types', false, {
            eventTypes: allEventTypes,
        });
    } catch (error) {
        Log.warn('[PushNotification] Could not enumerate EventType values', {error});
    }

    ForegroundNotifications.configureForegroundNotifications();
    
    Log.info('[PushNotification] Push notification system initialized successfully', false, {
        timestamp: new Date().toISOString(),
        bridgeAvailable: bridgeStatus.pushNotificationBridgeExists,
        listenersAdded: true,
    });
};

/**
 * Register this device for push notifications for the given notificationID.
 */
const register: Register = (notificationID) => {
    Log.info('[PushNotification] Starting registration process', false, {
        notificationID,
        timestamp: new Date().toISOString(),
    });

    // Check Airship availability
    Log.info('[PushNotification] Airship status check', false, {
        airshipAvailable: !!Airship,
        contactAvailable: !!Airship?.contact,
        pushAvailable: !!Airship?.push,
        addListenerAvailable: !!Airship?.addListener,
    });

    Airship.contact
        .getNamedUserId()
        .then((userID) => {
            Log.info('[PushNotification] Current named user ID retrieved', false, {
                currentUserID: userID,
                requestedNotificationID: notificationID,
                needsRegistration: userID !== notificationID.toString(),
            });

            if (userID === notificationID.toString()) {
                // No need to register again for this notificationID.
                Log.info('[PushNotification] Already registered for this notification ID, skipping registration', false, {
                    notificationID,
                });
                return;
            }

            // Get permissions to display push notifications (prompts user on iOS, but not Android)
            Log.info('[PushNotification] Requesting push notification permissions', false, {notificationID});
            Airship.push.enableUserNotifications().then((isEnabled) => {
                Log.info('[PushNotification] Push notification permission result', false, {
                    notificationID,
                    isEnabled,
                });

                if (isEnabled) {
                    return;
                }

                Log.info('[PushNotification] User has disabled visible push notifications for this app.', false, {
                    notificationID,
                });
            });

            // Register this device as a named user in AirshipAPI.
            // Regardless of the user's opt-in status, we still want to receive silent push notifications.
            Log.info(`[PushNotification] Subscribing to notifications with named user`, false, {
                notificationID,
                namedUserID: notificationID.toString(),
            });
            Airship.contact.identify(notificationID.toString());
            
            // Check notification status after registration
            Airship.push.getNotificationStatus().then((status) => {
                Log.info('[PushNotification] Notification status after registration', false, {
                    notificationID,
                    status,
                });
            }).catch((error) => {
                Log.warn('[PushNotification] Failed to get notification status', {
                    notificationID,
                    error,
                });
            });
        })
        .catch((error: Record<string, unknown>) => {
            Log.warn('[PushNotification] Failed to register for push notifications! Reason: ', {
                notificationID,
                error,
            });
        });
};

/**
 * Deregister this device from push notifications.
 */
const deregister: Deregister = () => {
    Log.info('[PushNotification] Starting deregistration process', false, {
        timestamp: new Date().toISOString(),
    });

    // Get current named user before resetting
    Airship.contact.getNamedUserId().then((currentUserID) => {
        Log.info('[PushNotification] Current user before deregistration', false, {
            currentUserID,
        });
    }).catch((error) => {
        Log.warn('[PushNotification] Failed to get current named user ID during deregistration', {error});
    });

    Airship.contact.reset();
    Airship.removeAllListeners(EventType.PushReceived);
    Airship.removeAllListeners(EventType.NotificationResponse);
    ForegroundNotifications.disableForegroundNotifications();
    ShortcutManager.removeAllDynamicShortcuts();
    
    Log.info('[PushNotification] Deregistration completed - reset contact, removed listeners, disabled foreground notifications', false, {
        timestamp: new Date().toISOString(),
    });
};

/**
 * Bind a callback to a push notification of a given type.
 * See https://github.com/Expensify/Web-Expensify/blob/main/lib/MobilePushNotifications.php for the various
 * types of push notifications sent, along with the data that they provide.
 *
 * Note: This implementation allows for only one callback to be bound to an Event/Type pair. For example,
 *       if we attempt to bind two callbacks to the PushReceived event for reportComment notifications,
 *       the second will overwrite the first.
 *
 * @param triggerEvent - The event that should trigger this callback. Should be one of UrbanAirship.EventType
 */
function bind<T extends NotificationTypes>(triggerEvent: EventType, notificationType: T, callback: NotificationEventHandler<T>) {
    Log.info('[PushNotification] Binding callback for notification type', false, {
        triggerEvent,
        notificationType,
        hasCallback: !!callback,
        timestamp: new Date().toISOString(),
    });

    let actionMap = notificationEventActionMap[triggerEvent] as NotificationEventHandlerMap<T> | undefined;

    if (!actionMap) {
        actionMap = {};
        Log.info('[PushNotification] Creating new action map for trigger event', false, {
            triggerEvent,
        });
    }

    actionMap[notificationType] = callback;
    notificationEventActionMap[triggerEvent] = actionMap;
    
    // Log current state of action map
    Log.info('[PushNotification] Action map updated', false, {
        triggerEvent,
        notificationType,
        totalEventTypes: Object.keys(notificationEventActionMap).length,
        typesForThisEvent: Object.keys(actionMap).length,
        allEventTypes: Object.keys(notificationEventActionMap),
    });
}

/**
 * Bind a callback to be executed when a push notification of a given type is received.
 */
const onReceived: OnReceived = (notificationType, callback) => {
    Log.info('[PushNotification] Setting up onReceived callback', false, {
        notificationType,
        hasCallback: !!callback,
        eventType: EventType.PushReceived,
    });
    bind(EventType.PushReceived, notificationType, callback);
};

/**
 * Bind a callback to be executed when a push notification of a given type is tapped by the user.
 */
const onSelected: OnSelected = (notificationType, callback) => {
    Log.info('[PushNotification] Setting up onSelected callback', false, {
        notificationType,
        hasCallback: !!callback,
        eventType: EventType.NotificationResponse,
    });
    bind(EventType.NotificationResponse, notificationType, callback);
};

/**
 * Clear all push notifications
 */
const clearNotifications: ClearNotifications = () => {
    Airship.push.clearNotifications();
};

const PushNotification: PushNotificationType = {
    init,
    register,
    deregister,
    onReceived,
    onSelected,
    TYPE: NotificationType,
    clearNotifications,
};

export default PushNotification;
