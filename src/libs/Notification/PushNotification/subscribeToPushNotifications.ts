import {NativeModules} from 'react-native';
import Onyx from 'react-native-onyx';
import applyOnyxUpdatesReliably from '@libs/actions/applyOnyxUpdatesReliably';
import Log from '@libs/Log';
import Navigation from '@libs/Navigation/Navigation';
import Visibility from '@libs/Visibility';
import {updateLastVisitedPath} from '@userActions/App';
import * as Modal from '@userActions/Modal';
import CONFIG from '@src/CONFIG';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import ROUTES from '@src/ROUTES';
import type {OnyxUpdatesFromServer} from '@src/types/onyx';
import PushNotification from '.';
import type {PushNotificationData} from './NotificationType';

/**
 * Safely finish background processing for push notifications
 * This prevents crashes when the native bridge is not available
 */
function safelyFinishBackgroundProcessing(context: string, additionalData?: Record<string, any>) {
    if (NativeModules.PushNotificationBridge && typeof NativeModules.PushNotificationBridge.finishBackgroundProcessing === 'function') {
        Log.info(`[PushNotification] Finishing background processing - ${context}`, false, additionalData);
        return NativeModules.PushNotificationBridge.finishBackgroundProcessing();
    } else {
        Log.warn(`[PushNotification] PushNotificationBridge not available - ${context}`, {
            bridgeExists: !!NativeModules.PushNotificationBridge,
            hasMethod: !!(NativeModules.PushNotificationBridge?.finishBackgroundProcessing),
            isDevelopment: __DEV__,
            isProduction: CONFIG.ENVIRONMENT === 'production',
            environment: CONFIG.ENVIRONMENT,
            ...additionalData,
        });
        
        // In development, this might be expected behavior
        if (__DEV__) {
            Log.info('[PushNotification] Development environment - PushNotificationBridge absence may be normal', false, {
                context,
                ...additionalData,
            });
        }
        
        return Promise.resolve();
    }
}

/**
 * Manage push notification subscriptions on sign-in/sign-out.
 */
Onyx.connect({
    key: ONYXKEYS.NVP_PRIVATE_PUSH_NOTIFICATION_ID,
    callback: (notificationID) => {
        Log.info('[PushNotification] Push notification ID changed', false, {
            notificationID,
            hasNotificationID: !!notificationID,
            timestamp: new Date().toISOString(),
        });

        if (notificationID) {
            Log.info('[PushNotification] Registering push notifications and initializing handlers', false, {
                notificationID,
            });
            
            PushNotification.register(notificationID);
            PushNotification.init();

            // Subscribe handlers for different push notification types
            Log.info('[PushNotification] Setting up notification type handlers', false, {
                notificationID,
            });
            PushNotification.onReceived(PushNotification.TYPE.REPORT_COMMENT, applyOnyxData);
            PushNotification.onSelected(PushNotification.TYPE.REPORT_COMMENT, navigateToReport);

            PushNotification.onReceived(PushNotification.TYPE.REPORT_ACTION, applyOnyxData);
            PushNotification.onSelected(PushNotification.TYPE.REPORT_ACTION, navigateToReport);

            PushNotification.onReceived(PushNotification.TYPE.TRANSACTION, applyOnyxData);
            PushNotification.onSelected(PushNotification.TYPE.TRANSACTION, navigateToReport);
            
            Log.info('[PushNotification] All notification handlers registered successfully', false, {
                notificationID,
            });
        } else {
            Log.info('[PushNotification] No notification ID - deregistering and clearing notifications', false, {
                timestamp: new Date().toISOString(),
            });
            PushNotification.deregister();
            PushNotification.clearNotifications();
        }
    },
});

let isSingleNewDotEntry: boolean | undefined;
Onyx.connect({
    key: ONYXKEYS.HYBRID_APP,
    callback: (value) => {
        if (!value) {
            return;
        }
        isSingleNewDotEntry = value?.isSingleNewDotEntry;
    },
});

function applyOnyxData({reportID, onyxData, lastUpdateID, previousUpdateID, hasPendingOnyxUpdates = false}: PushNotificationData): Promise<void> {
    // Add push notification Onyx data application logs
    Log.info(`[PushNotification] Starting to apply onyx data - ${Visibility.isVisible() ? 'FOREGROUND' : 'BACKGROUND'}`, false, {
        reportID, 
        lastUpdateID, 
        previousUpdateID,
        onyxDataCount: onyxData?.length ?? 0,
        hasPendingOnyxUpdates,
        timestamp: new Date().toISOString(),
    });

    const logMissingOnyxDataInfo = (isDataMissing: boolean): boolean => {
        if (isDataMissing) {
            Log.hmmm("[PushNotification] FAILED to apply onyx updates - missing data", {
                lastUpdateID, 
                previousUpdateID, 
                onyxDataCount: onyxData?.length ?? 0,
                hasPendingOnyxUpdates,
                reportID,
            });
            return false;
        }

        Log.info('[PushNotification] SUCCESS - reliable onyx update received', false, {
            lastUpdateID, 
            previousUpdateID, 
            onyxDataCount: onyxData?.length ?? 0,
            reportID,
            hasPendingOnyxUpdates,
        });
        return true;
    };

    let updates: OnyxUpdatesFromServer;
    if (hasPendingOnyxUpdates) {
        const isDataMissing = !lastUpdateID;
        logMissingOnyxDataInfo(isDataMissing);
        if (isDataMissing) {
            return Promise.resolve();
        }

        updates = {
            type: CONST.ONYX_UPDATE_TYPES.AIRSHIP,
            lastUpdateID,
            shouldFetchPendingUpdates: true,
            updates: [],
        };
    } else {
        const isDataMissing = !lastUpdateID || !onyxData || !previousUpdateID;
        logMissingOnyxDataInfo(isDataMissing);
        if (isDataMissing) {
            return Promise.resolve();
        }

        updates = {
            type: CONST.ONYX_UPDATE_TYPES.AIRSHIP,
            lastUpdateID,
            previousUpdateID,
            updates: [
                {
                    eventType: '', // This is only needed for Pusher events
                    data: onyxData,
                },
            ],
        };
    }

    /**
     * When this callback runs in the background on Android (via Headless JS), no other Onyx.connect callbacks will run. This means that
     * lastUpdateIDAppliedToClient will NOT be populated in other libs. To workaround this, we manually read the value here
     * and pass it as a param
     */
    return getLastUpdateIDAppliedToClient()
        .then((lastUpdateIDAppliedToClient) => {
            Log.info('[PushNotification] Applying Onyx updates reliably', false, {
                reportID,
                lastUpdateIDAppliedToClient,
                updatesType: updates.type,
                updatesCount: updates.updates?.length ?? 0,
            });
            return applyOnyxUpdatesReliably(updates, {shouldRunSync: true, clientLastUpdateID: lastUpdateIDAppliedToClient});
        })
        .then(() => {
            Log.info('[PushNotification] Onyx updates applied successfully, finishing background processing', false, {
                reportID,
                lastUpdateID,
            });
            
            return safelyFinishBackgroundProcessing('success', {reportID, lastUpdateID});
        })
        .catch((error) => {
            Log.alert('[PushNotification] Error applying Onyx updates', {
                reportID,
                lastUpdateID,
                error: String(error),
            });
            
            // Still need to finish background processing even on error, but safely
            return safelyFinishBackgroundProcessing('error', {
                reportID,
                lastUpdateID,
                error: String(error),
            });
        });
}

function navigateToReport({reportID}: PushNotificationData): Promise<void> {
    Log.info('[PushNotification] Starting navigation to report from push notification', false, {
        reportID,
        timestamp: new Date().toISOString(),
    });

    Navigation.waitForProtectedRoutes().then(() => {
        // The attachment modal remains open when navigating to the report so we need to close it
        Modal.close(() => {
            try {
                // When transitioning to the new experience via the singleNewDotEntry flow, the navigation
                // is handled elsewhere. So we cancel here to prevent double navigation.
                if (isSingleNewDotEntry) {
                    Log.info('[PushNotification] Skipping navigation - singleNewDotEntry flow', false, {
                        reportID,
                        isSingleNewDotEntry,
                    });
                    return;
                }

                // Get rid of the transition screen, if it is on the top of the stack
                if (CONFIG.IS_HYBRID_APP && Navigation.getActiveRoute().includes(ROUTES.TRANSITION_BETWEEN_APPS)) {
                    Log.info('[PushNotification] Removing transition screen before navigation', false, {reportID});
                    Navigation.goBack();
                }
                // If a chat is visible other than the one we are trying to navigate to, then we need to navigate back
                const activeRoute = Navigation.getActiveRoute();
                const targetRoutePattern = `r/${reportID}`;
                
                if (activeRoute.slice(1, 2) === ROUTES.REPORT && !Navigation.isActiveRoute(`r/${reportID}` as any)) {
                    Log.info('[PushNotification] Navigating back from current report before going to target', false, {
                        reportID,
                        currentRoute: activeRoute,
                        targetRoute: targetRoutePattern,
                    });
                    Navigation.goBack();
                }

                const fullTargetRoute = ROUTES.REPORT_WITH_ID.getRoute(String(reportID));
                const backTo = Navigation.isActiveRoute(fullTargetRoute) ? undefined : Navigation.getActiveRoute();
                
                Log.info('[PushNotification] Executing navigation to report', false, {
                    reportID,
                    fullTargetRoute,
                    backTo,
                    isAlreadyOnTargetRoute: Navigation.isActiveRoute(fullTargetRoute),
                    currentRoute: activeRoute,
                });
                
                Navigation.navigate(ROUTES.REPORT_WITH_ID.getRoute(String(reportID), undefined, undefined, undefined, undefined, backTo));
                updateLastVisitedPath(fullTargetRoute);
                
                Log.info('[PushNotification] Navigation completed successfully', false, {reportID});
            } catch (error) {
                let errorMessage = String(error);
                if (error instanceof Error) {
                    errorMessage = error.message;
                }

                Log.alert('[PushNotification] Navigation failed', {
                    reportID, 
                    error: errorMessage,
                    stack: error instanceof Error ? error.stack : undefined,
                });
            }
        });
    });

    return Promise.resolve();
}

function getLastUpdateIDAppliedToClient(): Promise<number> {
    return new Promise((resolve) => {
        Onyx.connect({
            key: ONYXKEYS.ONYX_UPDATES_LAST_UPDATE_ID_APPLIED_TO_CLIENT,
            callback: (value) => resolve(value ?? CONST.DEFAULT_NUMBER_ID),
        });
    });
}
