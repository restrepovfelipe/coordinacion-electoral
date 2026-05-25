// Firebase SDK must already be loaded via <script> in index.html
// Only initialize Auth — no Firestore

const firebaseConfig = {
  apiKey: "AIzaSyBmZtgzH8EFepEqUoOcNVWbajRCMD7CU_Y",
  authDomain: "coordinacion-electoral.firebaseapp.com",
  projectId: "coordinacion-electoral",
  storageBucket: "coordinacion-electoral.appspot.com",
  // messagingSenderId and appId: register a Web App in Firebase Console →
  // coordinacion-electoral → Project settings to get these values.
  // Not required for email/password Auth (the only feature in use).
  messagingSenderId: "210392280319",
  appId: "1:210392280319:web:pending-registration"
};

const firebaseApp = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
// Firestore removed — data now comes from the NestJS REST API
