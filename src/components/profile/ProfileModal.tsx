import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Camera, Loader2, Check, User } from 'lucide-react';
import { auth, updateProfilePicture, UserProfile } from '../../lib/firebase';
import { useDocumentData } from 'react-firebase-hooks/firestore';
import { doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { cn } from '../../lib/utils';

export default function ProfileModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const user = auth.currentUser;
  const [updating, setUpdating] = useState(false);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userRef = user ? doc(db, 'users', user.uid) : null;
  const [profile] = useDocumentData(userRef) as unknown as [UserProfile | undefined, boolean, any];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUpdating(true);
    setSuccess(false);
    try {
      await updateProfilePicture(file);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error: any) {
      console.error("Error updating profile picture:", error);
      if (error.message?.includes('timed out') || error.message?.includes('Storage')) {
        alert("Upload Timeout: Firebase Storage might not be enabled yet.\n\nTo fix this:\n1. Open Firebase Console\n2. Click 'Storage' on the left\n3. Click 'Get Started'\n4. Set up your bucket with default rules\n5. Try again!");
      } else {
        alert("Failed to update profile picture: " + (error.message || "Unknown error"));
      }
    } finally {
      setUpdating(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
          >
            <div className="p-8">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-display font-bold text-slate-800">Edit Profile</h2>
                <button 
                  onClick={onClose}
                  className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-400 hover:text-slate-600"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex flex-col items-center text-center">
                <div className="relative group mb-6">
                  <div className="w-32 h-32 rounded-[2.5rem] overflow-hidden ring-4 ring-slate-50 shadow-inner bg-slate-100 flex items-center justify-center">
                    {profile?.photoURL || profile?.photo ? (
                      <img 
                        src={profile.photoURL || profile.photo || ''} 
                        className="w-full h-full object-cover" 
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <User size={48} className="text-slate-300" />
                    )}
                  </div>
                  
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={updating}
                    className="absolute -bottom-2 -right-2 w-12 h-12 bg-imo-blue text-white rounded-2xl flex items-center justify-center shadow-lg shadow-imo-blue/20 hover:scale-110 active:scale-95 transition-all group-hover:bg-blue-600 disabled:opacity-50"
                  >
                    {updating ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept="image/*" 
                    className="hidden" 
                  />
                </div>

                <div className="space-y-1 mb-8">
                  <h3 className="font-display font-bold text-slate-800 text-lg">
                    {profile?.displayName || profile?.name || 'User'}
                  </h3>
                  <p className="text-slate-400 text-sm font-medium">
                    {profile?.email}
                  </p>
                </div>

                {success && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-green-50 text-green-600 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 mb-4"
                  >
                    <Check size={16} />
                    Profile updated successfully!
                  </motion.div>
                )}

                <button 
                  onClick={onClose}
                  className="w-full py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all active:scale-[0.98]"
                >
                  Close
                </button>
              </div>
            </div>
            
            <div className="bg-slate-50 px-8 py-4 border-t border-slate-100 text-[10px] text-slate-400 uppercase tracking-widest font-bold text-center">
              Your profile is visible to contacts
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
