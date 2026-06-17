const LAST_VISIT_KEY = 'planify_last_visit';
const TWENTY_FOUR_H = 24 * 60 * 60 * 1000;

type NotifOpts = NotificationOptions & { renotify?: boolean; showTrigger?: unknown };

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
  } catch (err) {
    console.error('Service Worker registration failed:', err);
  }
}

export async function requestPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export async function notifyTimerDone(mode: 'focus' | 'short' | 'long') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const isFocus = mode === 'focus';
  const title = isFocus ? 'Отличная работа! 🎉' : 'Перерыв закончен! ⏰';
  const body = isFocus
    ? 'Сессия фокуса завершена. Время для короткого перерыва — вы этого заслужили!'
    : 'Время вернуться к работе. Ты справишься!';

  const opts: NotifOpts = { body, tag: 'timer', renotify: true };

  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, opts);
  } else {
    new Notification(title, opts);
  }
}

// Called on every page load: shows welcome-back notification if absent 24h+,
// saves current timestamp, and tries to schedule a future notification.
export async function trackVisit() {
  const now = Date.now();
  const lastVisit = Number(localStorage.getItem(LAST_VISIT_KEY) || 0);

  if (lastVisit && now - lastVisit >= TWENTY_FOUR_H && Notification.permission === 'granted') {
    await showReEngagementNotification();
  }

  localStorage.setItem(LAST_VISIT_KEY, String(now));

  // Try Notification Triggers API (Chrome 80+ experimental) to fire even when site is closed
  if ('serviceWorker' in navigator && Notification.permission === 'granted') {
    try {
      const reg = await navigator.serviceWorker.ready;
      const opts: NotifOpts = {
        body: 'Соскучились по твоим целям. Загляни в Planify, чтобы наметить план на сегодня и сохранить продуктивный настрой.',
        tag: 'reengagement-scheduled',
        renotify: false,
        showTrigger: new (window as any).TimestampTrigger(now + TWENTY_FOUR_H),
      };
      await reg.showNotification('Привет! 👋', opts);
    } catch {
      // Notification Triggers API not supported — fallback handled on next visit above
    }
  }
}

async function showReEngagementNotification() {
  const title = 'Привет! 👋';
  const body = 'Соскучились по твоим целям. Загляни в Planify, чтобы наметить план на сегодня и сохранить продуктивный настрой.';
  const opts: NotifOpts = { body, tag: 'reengagement', renotify: true };

  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, opts);
  } else {
    new Notification(title, opts);
  }
}
