/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useDocumentData } from 'react-firebase-hooks/firestore';
import { auth, db, saveUser, updateUserPresence } from './lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import AuthScreen from './components/auth/AuthScreen';
import ProfileSetup from './components/auth/ProfileSetup';
import ChatList from './components/chat/ChatList';
import ChatWindow from './components/chat/ChatWindow';
import CallOverlay from './components/chat/CallOverlay';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { socket } from './lib/socket';
import { UserProfile as UserProfileType } from './lib/firebase';

export default function App() {
  const [user, loading] = useAuthState(auth);
  const [selectedChatId, setSelectedChatId] = useState<string | undefined>();
  
  // Real-time user profile check
  const userRef = user ? doc(db, 'users', user.uid) : null;
  const [profile, profileLoading] = useDocumentData(userRef) as unknown as [UserProfileType | undefined, boolean, any];
  
  const isProfileIncomplete = user && !profileLoading && profile && (!profile.name || !profile.phoneNumber);
  const [incomingCall, setIncomingCall] = useState<{
    offer: any;
    from: string;
    fromProfile: any;
    isVideo: boolean;
  } | null>(null);
  const [isIncomingCallOpen, setIsIncomingCallOpen] = useState(false);

  // Global Socket.io setup
  useEffect(() => {
    if (user) {
      socket.connect();
      socket.emit('register', user.uid);

      socket.on('call-made', (data) => {
        setIncomingCall(data);
        setIsIncomingCallOpen(true);
      });

      return () => {
        socket.off('call-made');
        socket.disconnect();
      };
    }
  }, [user]);

  // Ensure user document exists in Firestore and manage presence
  useEffect(() => {
    if (user) {
      saveUser().catch(console.error);

      // Dynamic presence management
      const handleVisibilityChange = () => {
        updateUserPresence(document.visibilityState === 'visible');
      };

      const handleOnline = () => updateUserPresence(true);
      const handleOffline = () => updateUserPresence(false);

      window.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      
      // Heartbeat to keep status fresh
      const interval = setInterval(() => {
        if (document.visibilityState === 'visible') {
          updateUserPresence(true);
        }
      }, 60000); // 1 minute heartbeat

      return () => {
        window.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        clearInterval(interval);
        updateUserPresence(false);
      };
    }
  }, [user]);

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-imo-bg">
        <Loader2 className="w-12 h-12 text-imo-blue animate-spin mb-4" />
        <p className="text-slate-500 font-display font-medium">Connecting to Probas Wife Sabe...</p>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  if (isProfileIncomplete) {
    return <ProfileSetup onComplete={() => {}} />;
  }

  return (
    <div className="h-screen w-full bg-white flex overflow-hidden">
      {/* Global Call Overlay for incoming calls */}
      {incomingCall && (
        <CallOverlay 
          isOpen={isIncomingCallOpen}
          onClose={() => {
            setIsIncomingCallOpen(false);
            setIncomingCall(null);
          }}
          user={{
            uid: incomingCall.from,
            displayName: incomingCall.fromProfile.displayName,
            photoURL: incomingCall.fromProfile.photoURL,
            phoneNumber: ''
          } as UserProfileType}
          incomingOffer={incomingCall.offer}
          isVideo={incomingCall.isVideo}
        />
      )}

      {/* Responsive Design: On mobile, show list OR chat. On desktop, show both. */}
      <div className={`${selectedChatId ? 'hidden md:flex' : 'flex'} h-full border-r border-slate-100 flex-shrink-0 w-full md:w-[380px]`}>
        <ChatList 
          selectedChatId={selectedChatId} 
          onSelectChat={(id) => setSelectedChatId(id)} 
        />
      </div>

      <div className={`${!selectedChatId ? 'hidden md:flex' : 'flex'} flex-grow h-full bg-[#f8faff]`}>
        <AnimatePresence mode="wait">
          {selectedChatId ? (
            <motion.div 
              key={selectedChatId}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full h-full"
            >
              <ChatWindow 
                chatId={selectedChatId} 
                onBack={() => setSelectedChatId(undefined)} 
              />
            </motion.div>
          ) : (
            <div className="hidden md:flex flex-col items-center justify-center w-full h-full p-8 text-center">
              <div className="w-32 h-32 bg-imo-blue/5 rounded-[3rem] flex items-center justify-center mb-8 rotate-12">
                 <img src="https://picsum.photos/seed/welcome/200" className="w-24 h-24 rounded-[2.5rem] object-cover opacity-60 -rotate-12" />
              </div>
              <h2 className="text-2xl font-display font-bold text-slate-800">Welcome to Probas Wife Sabe</h2>
              <p className="text-slate-400 mt-2 max-w-sm">Select a chat to start messaging or find new contacts to connect with.</p>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

