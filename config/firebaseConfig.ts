import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';


const firebaseConfig = {
  apiKey: "AIzaSyDpQ732O0CAgvQgVbaKedt8djz7YqY6VAw",
  authDomain: "messenger-9ac7a.firebaseapp.com",
  projectId: "messenger-9ac7a",
  storageBucket: "messenger-9ac7a.firebasestorage.app",
  messagingSenderId: "536495246256",
  appId: "1:536495246256:web:9818b3d9739d917fb1a475",
  measurementId: "G-YY9TN5SZRW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth with AsyncStorage persistence
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

// Initialize other Firebase services
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;