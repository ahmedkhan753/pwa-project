"use client";

export async function registerPushNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('Push notifications are not supported in this browser.');
        return;
    }

    try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service Worker registered:', registration);

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.warn('Notification permission denied.');
            return;
        }

        // In a real app, you would subscribe to a VAPID server here
        // const subscription = await registration.pushManager.subscribe({
        //   userVisibleOnly: true,
        //   applicationServerKey: 'YOUR_VAPID_PUBLIC_KEY'
        // });
        // await sendSubscriptionToBackend(subscription);

        console.log('Push notifications enabled.');
    } catch (error) {
        console.error('Failed to register push notifications:', error);
    }
}
