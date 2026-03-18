// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBbcIw2zf4sGA5VofBFoy_lJa2eOt9eXKc",
  authDomain: "expense-tracking-a0d9f.firebaseapp.com",
  projectId: "expense-tracking-a0d9f",
  storageBucket: "expense-tracking-a0d9f.firebasestorage.app",
  messagingSenderId: "852353220224",
  appId: "1:852353220224:web:fc3a1780f48135ca5ab065",
  measurementId: "G-1F0CHMKEDD"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  ignoreUndefinedProperties: true,
});
