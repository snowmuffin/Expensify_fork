import Airship from '@ua/react-native-airship';
import Log from '@libs/Log';
import type ForegroundNotificationsModule from './types';

function configureForegroundNotifications() {
    Log.info('[PushNotification] Configuring Android foreground notifications to always show');
    // Always show push notifications in foreground
    Airship.push.android.setForegroundDisplayPredicate((pushPayload) => {
        Log.info('[PushNotification] Android foreground display predicate called', false, {pushPayload});
        return Promise.resolve(true);
    });
}

function disableForegroundNotifications() {
    Log.info('[PushNotification] Disabling Android foreground notifications');
    Airship.push.android.setForegroundDisplayPredicate(() => Promise.resolve(false));
}

const ForegroundNotifications: ForegroundNotificationsModule = {
    configureForegroundNotifications,
    disableForegroundNotifications,
};

export default ForegroundNotifications;
