// Notificações do navegador: avisa quando chega mensagem e o app não está em foco.
export function askNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission()
  }
}

export function notify(title, body) {
  if (!('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible') return
  try {
    new Notification(title, { body, icon: '/icons/icon-192.png' })
  } catch {
    // alguns navegadores móveis exigem service worker — falha silenciosa
  }
}
