// Firebase SDK must already be loaded via <script> in index.html
// Only initialize Auth — no Firestore

const firebaseConfig = {
  apiKey: "AIzaSyBzLnvpt_cFKbYGvquwsINO7mhTqzQSIw0",
  authDomain: "comando-electoral-amva.firebaseapp.com",
  projectId: "comando-electoral-amva",
  storageBucket: "comando-electoral-amva.firebasestorage.app",
  messagingSenderId: "780534359669",
  appId: "1:780534359669:web:03678820c44d205a8cba3c"
};

const firebaseApp = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
// Firestore removed — data now comes from the NestJS REST API
