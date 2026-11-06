// Dana Nails · recibe las notificaciones aunque la app esté cerrada
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
firebase.initializeApp({
  apiKey: 'AIzaSyDyWK4vBeBvch-JYa5WhjoNHwfqGwv6448',
  authDomain: 'dana-nails.firebaseapp.com',
  projectId: 'dana-nails',
  storageBucket: 'dana-nails.firebasestorage.app',
  messagingSenderId: '334385291062',
  appId: '1:334385291062:web:29d9d2fccbd1a0d1265d97'
});
// Firebase muestra solo la notificación y, al tocarla, abre la app
firebase.messaging();
