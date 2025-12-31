const { initializeApp } = require("firebase/app");
const { getFirestore } = require("firebase/firestore");

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,   // your API key
  projectId: process.env.FIREBASE_PROJECT_ID // your project ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

module.exports = { db };
