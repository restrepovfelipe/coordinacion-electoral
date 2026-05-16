const firebaseConfig = {
  apiKey: "AIzaSyBzLnvpt_cFKbYGvquwsINO7mhTqzQSIw0",
  authDomain: "comando-electoral-amva.firebaseapp.com",
  projectId: "comando-electoral-amva",
  storageBucket: "comando-electoral-amva.firebasestorage.app",
  messagingSenderId: "780534359669",
  appId: "1:780534359669:web:03678820c44d205a8cba3c"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const FS_COL = 'estado';
const FS_DOC = 'amva26v2';
