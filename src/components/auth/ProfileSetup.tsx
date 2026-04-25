import React, { useState } from 'react';
import { motion } from 'motion/react';
import { User, Phone, Loader2, Check } from 'lucide-react';
import { db, auth, updateUserPresence } from '../../lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';

export default function ProfileSetup({ onComplete }: { onComplete: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const user = auth.currentUser;

  const handleSave = async () => {
    if (!name || (!phone && !user?.phoneNumber) || !user) return;
    
    setLoading(true);
    try {
      // 1. Update Auth Profile
      await updateProfile(user, { displayName: name });
      
      // 2. Update Firestore document
      const userRef = doc(db, 'users', user.uid);
      const phoneNumber = user.phoneNumber || (phone.startsWith('+') ? phone : `+880${phone}`);
      await updateDoc(userRef, {
        name,
        displayName: name,
        name_lowercase: name.toLowerCase(),
        phoneNumber,
        updatedAt: serverTimestamp(),
      });
      
      onComplete();
    } catch (error) {
      console.error("Error setting up profile:", error);
      alert("Failed to save profile. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-imo-bg flex items-center justify-center p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl p-8 text-center"
      >
        <div className="w-20 h-20 bg-imo-blue/10 rounded-[2rem] mx-auto flex items-center justify-center mb-6">
          <User className="text-imo-blue" size={32} />
        </div>
        
        <h2 className="text-2xl font-display font-bold text-slate-800 mb-2">Complete Profile</h2>
        <p className="text-slate-400 text-sm mb-8">Please provide your name and phone number to continue using Probas Wife Sabe.</p>
        
        <div className="space-y-4 text-left">
          <div className="relative group">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-imo-blue transition-colors" size={18} />
            <input 
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full Name"
              className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-transparent focus:border-imo-blue/20 rounded-2xl outline-none transition-all text-sm font-medium"
            />
          </div>
          
          {!user?.phoneNumber && (
            <div className="relative group">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-imo-blue transition-colors" size={18} />
              <div className="absolute left-10 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold pl-2 border-l border-slate-200">
                +880
              </div>
              <input 
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone Number"
                className="w-full pl-24 pr-4 py-4 bg-slate-50 border-2 border-transparent focus:border-imo-blue/20 rounded-2xl outline-none transition-all text-sm font-medium"
              />
            </div>
          )}
        </div>
        
        <button 
          onClick={handleSave}
          disabled={loading || !name || (!user?.phoneNumber && !phone)}
          className="w-full mt-8 py-4 bg-imo-blue text-white rounded-2xl font-bold shadow-xl shadow-imo-blue/20 hover:bg-imo-blue/90 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin" size={20} /> : (
            <>
              <Check size={20} />
              Get Started
            </>
          )}
        </button>
      </motion.div>
    </div>
  );
}
