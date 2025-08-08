import type {JsonObject, JsonValue} from '@ua/react-native-airship';
import pako from 'pako';
import Log from '@libs/Log';
import type {PushNotificationData} from './NotificationType';

const GZIP_MAGIC_NUMBER = '\x1f\x8b';

/**
 * Parse the payload of a push notification. On Android, some notification payloads are sent as a JSON string rather than an object
 */
export default function parsePushNotificationPayload(payload: JsonValue | undefined): PushNotificationData | undefined {
    // CRITICAL: Log payload parsing entry
    console.log('====== PUSH NOTIFICATION PAYLOAD PARSING ======');
    console.log('[PAYLOAD] Starting payload parsing');
    console.log('[PAYLOAD] Has payload:', payload !== undefined);
    console.log('[PAYLOAD] Payload type:', typeof payload);
    console.log('[PAYLOAD] Timestamp:', new Date().toISOString());
    console.log('===============================================');

    Log.info('[PAYLOAD] Push notification payload parsing started', false, {
        hasPayload: payload !== undefined,
        payloadType: typeof payload,
        timestamp: new Date().toISOString(),
    });

    if (payload === undefined) {
        Log.warn('[PushNotification] Payload is undefined', {
            timestamp: new Date().toISOString(),
        });
        return undefined;
    }

    // No need to parse if it's already an object
    if (typeof payload !== 'string') {
        Log.info('[PushNotification] Payload is already an object, returning as-is', false, {
            payloadType: typeof payload,
            hasReportID: !!(payload as any)?.reportID,
        });
        return payload as PushNotificationData;
    }

    Log.info('[PushNotification] Payload is a string, attempting to parse', false, {
        payloadLength: payload.length,
        payloadPreview: payload.substring(0, 100),
    });

    // Gzipped JSON String
    try {
        const binaryStringPayload = atob(payload);
        if (!binaryStringPayload.startsWith(GZIP_MAGIC_NUMBER)) {
            throw Error();
        }
        Log.info('[PushNotification] Detected gzipped payload, decompressing', false, {
            originalLength: payload.length,
            binaryLength: binaryStringPayload.length,
        });
        
        const compressed = Uint8Array.from(binaryStringPayload, (x) => x.charCodeAt(0));
        const decompressed = pako.inflate(compressed, {to: 'string'});
        const jsonObject = JSON.parse(decompressed) as JsonObject;
        
        Log.info('[PushNotification] Successfully parsed gzipped payload', false, {
            decompressedLength: decompressed.length,
            hasReportID: !!(jsonObject as any)?.reportID,
            type: (jsonObject as any)?.type,
        });
        
        return jsonObject as PushNotificationData;
    } catch (error) {
        Log.hmmm('[PushNotification] Failed to parse the payload as a Gzipped JSON string', {
            payload: payload.substring(0, 200), // Log first 200 chars for debugging
            error: String(error),
        });
    }

    // JSON String
    try {
        const jsonObject = JSON.parse(payload) as JsonObject;
        Log.info('[PushNotification] Successfully parsed as regular JSON', false, {
            hasReportID: !!(jsonObject as any)?.reportID,
            type: (jsonObject as any)?.type,
        });
        return jsonObject as PushNotificationData;
    } catch (error) {
        Log.hmmm(`[PushNotification] Failed to parse the payload as a JSON string`, {
            payload: payload.substring(0, 200), // Log first 200 chars for debugging
            error: String(error),
        });
    }

    Log.warn('[PushNotification] All parsing attempts failed, returning undefined', {
        payloadLength: payload.length,
        payloadPreview: payload.substring(0, 100),
    });

    return undefined;
}
