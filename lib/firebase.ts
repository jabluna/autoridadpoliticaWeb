import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getDatabase } from "firebase/database";

export const firebaseConfig = {
  apiKey: "AIzaSyCjZL41FcM4MOrqnHITA5Ko3QJmCqyjtjc",
  authDomain: "autoridadpolitica.firebaseapp.com",
  projectId: "autoridadpolitica",
  storageBucket: "autoridadpolitica.firebasestorage.app",
  messagingSenderId: "1019448161527",
  appId: "1:1019448161527:web:78aa0c23dd96c6d008cff2",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Realtime Database
export const rtdb = getDatabase(
  app,
  "https://autoridadpolitica-default-rtdb.firebaseio.com"
);

export default app;