import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, FacebookAuthProvider } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs, addDoc, updateDoc } from 'firebase/firestore';
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

// Deterministic Chat ID generation matching requested logic
export function getChatId(otherId: string) {
  const myId = auth.currentUser?.uid;
  if (!myId) throw new Error("Auth required");

  // In JS, we compare strings using localeCompare or > <
  return myId > otherId 
    ? `${myId}_${otherId}`
    : `${otherId}_${myId}`;
}

// Utility to start or get a direct chat
export async function getOrCreateChat(targetUid: string) {
  if (!auth.currentUser) throw new Error('Auth required');
  
  const chatId = getChatId(targetUid);
  const chatRef = doc(db, 'chats', chatId);
  const chatDoc = await getDoc(chatRef);
  
  if (chatDoc.exists()) {
    return chatId;
  }
  
  // Create new chat with deterministic ID
  const participants = [auth.currentUser.uid, targetUid].sort();
  await setDoc(chatRef, {
    participants,
    type: 'direct',
    updatedAt: serverTimestamp(),
  });
  
  return chatId;
}

// Utility to save or update user profile exactly as requested
export async function saveUser() {
  const user = auth.currentUser;
  if (!user) return;

  const userRef = doc(db, 'users', user.uid);
  await setDoc(userRef, {
    name: user.displayName,
    email: user.email,
    photo: user.photoURL,
    uid: user.uid,
    username: user.email ? user.email.split("@")[0] : null,
    lastSeen: serverTimestamp(),
    isOnline: true
  }, { merge: true });
}

// Utility to send a message to a receiver
export async function sendMessage(msg: string, receiverId: string) {
  const chatId = await getOrCreateChat(receiverId);
  const myUid = auth.currentUser?.uid;

  if (!myUid) throw new Error("Auth required");

  const messageData = {
    text: msg,
    sender: myUid,
    senderId: myUid, // Keep both for compatibility
    time: serverTimestamp(),
    createdAt: serverTimestamp(), // Keep both for compatibility
    type: 'text'
  };

  const chatRef = doc(db, 'chats', chatId);
  
  // 1. Add the message to the subcollection
  await addDoc(collection(db, 'chats', chatId, 'messages'), messageData);

  // 2. Update the parent chat document with last message info
  await updateDoc(chatRef, {
    lastMessage: {
      text: msg,
      senderId: myUid,
      createdAt: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
  });

  return chatId;
}

// Utility to send an image message
export async function sendImage(file: File, receiverId: string) {
  const myUid = auth.currentUser?.uid;
  if (!myUid) throw new Error("Auth required");

  // 1. Upload to storage (matching requested path chat_images/timestamp)
  const timestamp = Date.now();
  const path = `chat_images/${timestamp}_${file.name}`;
  const url = await uploadFile(file, path);

  // 2. Get or create chat
  const chatId = await getOrCreateChat(receiverId);

  // 3. Add to Firestore messages subcollection
  const messageData = {
    image: url,
    mediaUrl: url, // Keep for compatibility
    type: 'image',
    sender: myUid,
    senderId: myUid,
    time: serverTimestamp(),
    createdAt: serverTimestamp(),
    text: ''
  };

  await addDoc(collection(db, 'chats', chatId, 'messages'), messageData);

  // 4. Update parent chat
  await updateDoc(doc(db, 'chats', chatId), {
    lastMessage: {
      text: '📷 Image',
      senderId: myUid,
      createdAt: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
  });

  return url;
}

// Utility to send a voice note
export async function sendVoiceNote(blob: Blob, receiverId: string) {
  const myUid = auth.currentUser?.uid;
  if (!myUid) throw new Error("Auth required");

  // 1. Upload to storage
  const timestamp = Date.now();
  const path = `voice_notes/${timestamp}_voice.webm`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob);
  const url = await getDownloadURL(storageRef);

  // 2. Get or create chat
  const chatId = await getOrCreateChat(receiverId);

  // 3. Add to Firestore messages subcollection
  const messageData = {
    text: '',
    mediaUrl: url,
    type: 'voice',
    sender: myUid,
    senderId: myUid,
    time: serverTimestamp(),
    createdAt: serverTimestamp(),
  };

  await addDoc(collection(db, 'chats', chatId, 'messages'), messageData);

  // 4. Update parent chat
  await updateDoc(doc(db, 'chats', chatId), {
    lastMessage: {
      text: '🎤 Voice Note',
      senderId: myUid,
      createdAt: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
  });

  return url;
}

export interface UserProfile {
  uid: string;
  name: string | null;
  displayName: string | null;
  photo: string | null;
  photoURL: string | null;
  phoneNumber: string | null;
  email: string | null;
  username: string | null;
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
  sender?: string;
  text: string;
  type: 'text' | 'image' | 'voice';
  mediaUrl?: string;
  image?: string;
  createdAt: any;
  time?: any;
}
