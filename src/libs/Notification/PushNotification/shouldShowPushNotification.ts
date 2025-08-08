import type {PushPayload} from '@ua/react-native-airship';
import Log from '@libs/Log';
import * as ReportActionUtils from '@libs/ReportActionsUtils';
import * as Report from '@userActions/Report';
import parsePushNotificationPayload from './parsePushNotificationPayload';

/**
 * Returns whether the given Airship notification should be shown depending on the current state of the app
 */
export default function shouldShowPushNotification(pushPayload: PushPayload): boolean {
    // CRITICAL: Log before any filtering or processing
    console.log('====== PUSH NOTIFICATION FILTER ENTRY ======');
    console.log('[FILTER] Evaluating whether to show push notification');
    console.log('[FILTER] Notification ID:', pushPayload?.notificationId);
    console.log('[FILTER] Alert:', pushPayload?.alert);
    console.log('[FILTER] Title:', pushPayload?.title);
    console.log('[FILTER] Subtitle:', pushPayload?.subtitle);
    console.log('[FILTER] Timestamp:', new Date().toISOString());
    console.log('=============================================');

    Log.info('[FILTER] Push notification filtering started', false, {
        notificationId: pushPayload?.notificationId,
        alert: pushPayload?.alert,
        title: pushPayload?.title,
        subtitle: pushPayload?.subtitle,
        hasExtras: !!(pushPayload?.extras),
        hasPayload: !!(pushPayload?.extras?.payload),
        timestamp: new Date().toISOString(),
    });
    
    const data = parsePushNotificationPayload(pushPayload.extras.payload);

    if (!data) {
        Log.warn('[PushNotification] No parsed data available for notification', {
            notificationId: pushPayload.notificationId,
            rawPayload: pushPayload.extras.payload,
        });
        return true;
    }

    // Detailed notification data logs
    Log.info('[PushNotification] Parsed notification data', false, {
        type: data.type,
        reportID: data.reportID,
        lastUpdateID: data.lastUpdateID,
        previousUpdateID: data.previousUpdateID,
        onyxDataLength: data.onyxData?.length ?? 0,
        notificationId: pushPayload.notificationId,
    });

    let shouldShow = false;
    if (data.type === 'transaction') {
        shouldShow = true;
        Log.info('[PushNotification] Transaction notification - will be shown', false, {
            reportID: data.reportID,
            notificationId: pushPayload.notificationId,
        });
    } else {
        const reportAction = ReportActionUtils.getLatestReportActionFromOnyxData(data.onyxData ?? null);
        shouldShow = Report.shouldShowReportActionNotification(String(data.reportID), reportAction, true);
        Log.info('[PushNotification] Report action notification evaluation', false, {
            reportID: data.reportID,
            reportActionID: reportAction?.reportActionID,
            shouldShow,
            notificationId: pushPayload.notificationId,
        });
    }

    Log.info(`[PushNotification] Final decision: ${shouldShow ? 'SHOWING' : 'HIDING'} notification`, false, {
        type: data.type,
        reportID: data.reportID,
        shouldShow,
        notificationId: pushPayload.notificationId,
    });
    
    return shouldShow;
}
