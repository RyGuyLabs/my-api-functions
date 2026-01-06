const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

let app;
try {
  app = initializeApp();
} catch (e) {
  app = require('firebase-admin/app').getApp();
}
const db = getFirestore(app);

module.exports = { db };
