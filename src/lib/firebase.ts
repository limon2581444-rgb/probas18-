import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, FacebookAuthProvider, updateProfile } from 'firebase/auth';
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
export async function uploadFile(file: File | Blob, path: string) {
  if (!firebaseConfig.storageBucket) {
    throw new Error("Firebase Storage Bucket is missing in configuration. Please check firebase-applet-config.json.");
  }

  console.log("Starting upload to:", firebaseConfig.storageBucket, "Path:", path);
  
  const uploadTask = async () => {
    const storageRef = ref(storage, path);
    const metadata = {
      contentType: (file as any).type || 'application/octet-stream',
    };
    await uploadBytes(storageRef, file, metadata);
    return getDownloadURL(storageRef);
  };

  // 45 second timeout
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Upload timed out. Is Firebase Storage enabled?")), 45000)
  );

  try {
    return await Promise.race([uploadTask(), timeout]) as string;
  } catch (error: any) {
    console.error("Firebase Storage Error:", error);
    if (error.code === 'storage/retry-limit-exceeded' || error.message?.includes('timed out')) {
      throw new Error("Could not connect to Firebase Storage. Please ensure 'Storage' is enabled in your Firebase Console and your internet is stable.");
    }
    throw error;
  }
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

// Utility to save or update user profile
export async function saveUser() {
  const user = auth.currentUser;
  if (!user) return;

  const userRef = doc(db, 'users', user.uid);
  const userDoc = await getDoc(userRef);
  
  const username = user.email ? user.email.split("@")[0] : (user.phoneNumber ? user.phoneNumber.slice(-4) : 'user_' + user.uid.slice(0, 5));
  
  const userData = {
    name: user.displayName,
    displayName: user.displayName,
    email: user.email,
    photo: user.photoURL,
    photoURL: user.photoURL,
    uid: user.uid,
    phoneNumber: user.phoneNumber,
    username: username,
    username_lowercase: username.toLowerCase(),
    name_lowercase: user.displayName ? user.displayName.toLowerCase() : null,
    lastSeen: serverTimestamp(),
    isOnline: true
  };

  if (!userDoc.exists()) {
    await setDoc(userRef, userData);
  } else {
    // Force update of search fields and basic info
    const existingData = userDoc.data();
    await updateDoc(userRef, {
      name: user.displayName || existingData?.name,
      displayName: user.displayName || existingData?.displayName,
      photo: user.photoURL || existingData?.photo,
      photoURL: user.photoURL || existingData?.photoURL,
      phoneNumber: user.phoneNumber || existingData?.phoneNumber,
      username: existingData?.username || username,
      username_lowercase: (existingData?.username || username).toLowerCase(),
      name_lowercase: (user.displayName || existingData?.displayName || existingData?.name)?.toLowerCase() || null,
      lastSeen: serverTimestamp(),
      isOnline: true
    });
  }
}

// Utility to update user presence/status
export async function updateUserPresence(isOnline: boolean) {
  const user = auth.currentUser;
  if (!user) return;

  const userRef = doc(db, 'users', user.uid);
  try {
    await updateDoc(userRef, {
      isOnline,
      lastSeen: serverTimestamp()
    });
  } catch (error) {
    console.error("Error updating presence:", error);
  }
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

  // 1. Upload to storage using consolidated utility
  const timestamp = Date.now();
  const path = `voice_notes/${timestamp}_voice.webm`;
  const url = await uploadFile(blob, path);

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

// Utility to update user profile picture
export async function updateProfilePicture(file: File) {
  const user = auth.currentUser;
  if (!user) throw new Error("Auth required");

  // 1. Upload to storage
  const path = `profiles/${user.uid}/avatar_${Date.now()}`;
  const url = await uploadFile(file, path);

  // 2. Update Auth Profile (so auth.currentUser.photoURL stays in sync)
  await updateProfile(user, { photoURL: url });

  // 3. Update Firestore
  const userRef = doc(db, 'users', user.uid);
  const userDoc = await getDoc(userRef);
  const existingData = userDoc.data();
  
  const displayName = user.displayName || existingData?.displayName || existingData?.name;
  
  await updateDoc(userRef, {
    photo: url,
    photoURL: url,
    name_lowercase: displayName ? displayName.toLowerCase() : null,
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
