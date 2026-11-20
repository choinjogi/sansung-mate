// multi/vendor/firebase.js 로 묶이는 파일 (npm run build:vendor). CDN 없이 앱이 이 파일 하나로 Firebase를 씀
export { initializeApp } from 'firebase/app';
export { getAuth, connectAuthEmulator, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInWithPopup, signInWithRedirect, signInWithCredential, GoogleAuthProvider, signOut, updatePassword } from 'firebase/auth';
export { getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where,
  writeBatch, serverTimestamp, Timestamp, orderBy, limit, addDoc } from 'firebase/firestore';
export { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import qrcode from 'qrcode-generator';
export { qrcode };
