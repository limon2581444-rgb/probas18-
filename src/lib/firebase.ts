import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, FacebookAuthProvider } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();
export const facebookProvider = new FacebookAuthProvider();

// Utility for file uploads
export async function uploadFile(file: File, path: string) {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

// Utility to start or get a direct chat
export async function getOrCreateChat(targetUid: string) {
  if (!auth.currentUser) throw new Error('Auth required');
  
  const myUid = auth.currentUser.uid;
  const participants = [myUid, targetUid].sort();
  
  // Find existing chat
  const chatsRef = collection(db, 'chats');
  const q = query(
    chatsRef, 
    where('type', '==', 'direct'),
    where('participants', '==', participants)
  );
  
  const querySnapshot = await getDocs(q);
  
  if (!querySnapshot.empty) {
    return querySnapshot.docs[0].id;
  }
  
  // Create new chat
  const newChat = await addDoc(chatsRef, {
    participants,
    type: 'direct',
    updatedAt: serverTimestamp(),
  });
  
  return newChat.id;
}

export interface UserProfile {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
  phoneNumber: string | null;
  statusMessage?: string;
  isOnline?: boolean;
  lastSeen?: string;
}

export interface Chat {
  id: string;
  participants: string[];
  type: 'direct' | 'group';
  lastMessage?: {
    text: string;
    senderId: string;
    timestamp: any;
  };
  updatedAt: any;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  type: 'text' | 'image' | 'voice';
  mediaUrl?: string;
  createdAt: any;
}
