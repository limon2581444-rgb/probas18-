import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, UserPlus, MoreHorizontal, Loader2, X, MessageSquarePlus, Settings, ShieldCheck, Key, LogOut } from 'lucide-react';
import { cn, formatTimestamp } from '../../lib/utils';
import { db, auth, Chat, UserProfile, getOrCreateChat } from '../../lib/firebase';
import { collection, query, where, orderBy, getDocs, doc } from 'firebase/firestore';
import { useCollectionData, useDocumentData } from 'react-firebase-hooks/firestore';
import { updatePassword } from 'firebase/auth';

export default function ChatList({ onSelectChat, selectedChatId }: { onSelectChat: (id: string) => void, selectedChatId?: string }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [searchingDB, setSearchingDB] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<'idle' | 'success' | 'error'>('idle');
  
  // Real-time chats for the current user
  const chatsQuery = query(
    collection(db, 'chats'),
    where('participants', 'array-contains', auth.currentUser?.uid),
    orderBy('updatedAt', 'desc')
  );
  
  const [values, loading, , snapshot] = useCollectionData(chatsQuery);
  const chats = values?.map((data, index) => ({
    ...data,
    id: snapshot?.docs[index].id
  })) as Chat[] | undefined;

  const handleSetPassword = async () => {
    if (!newPassword || !auth.currentUser) return;
    setPasswordLoading(true);
    setPasswordStatus('idle');
    try {
      await updatePassword(auth.currentUser, newPassword);
      setPasswordStatus('success');
      setNewPassword('');
      setTimeout(() => setShowSettings(false), 2000);
    } catch (error: any) {
      console.error(error);
      setPasswordStatus('error');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    setSearchingDB(true);
    setIsSearching(true);
    try {
      const usersRef = collection(db, 'users');
      // Search by phone number (exact match)
      const q = query(usersRef, where('phoneNumber', '==', searchTerm.trim()));
      const snap = await getDocs(q);
      const results = snap.docs
        .map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile))
        .filter(u => u.uid !== auth.currentUser?.uid);
      setSearchResults(results);
    } catch (error) {
      console.error(error);
    } finally {
      setSearchingDB(false);
    }
  };

  const handleStartChat = async (targetUid: string) => {
    try {
      const chatId = await getOrCreateChat(targetUid);
      onSelectChat(chatId);
      setIsSearching(false);
      setSearchTerm('');
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-100 w-full md:w-[380px]">
      <div className="p-6 pb-2">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-20 h-20 rounded-full border-4 border-imo-blue/20 p-1 flex items-center justify-center shrink-0">
              <img 
                src={auth.currentUser?.photoURL || `https://ui-avatars.com/api/?name=${auth.currentUser?.displayName || 'User'}&background=random`} 
                className="w-full h-full rounded-full object-cover shadow-inner" 
              />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg text-slate-800 leading-tight">Probas Wife Sabe</h2>
              <div className="flex items-center gap-1.5">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Active Now</p>
                <span className="text-[10px] text-imo-blue font-bold">@{auth.currentUser?.email?.split('@')[0]}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 hover:bg-slate-50 rounded-full transition-colors text-slate-400">
              <Search size={20} />
            </button>
            <button 
              onClick={() => setIsSearching(true)}
              className="p-2 bg-imo-blue text-white rounded-xl shadow-lg shadow-imo-blue/20 hover:scale-105 transition-all"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        <div className="relative mb-4 space-y-3">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-imo-blue transition-colors" size={16} />
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search by phone (+880...)" 
              className="w-full bg-slate-50 border-none rounded-xl py-3 pl-10 pr-10 text-sm focus:ring-1 focus:ring-imo-blue transition-all outline-none"
            />
            {searchTerm && (
              <button 
                onClick={() => { setSearchTerm(''); setIsSearching(false); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
              >
                <X size={14} />
              </button>
            )}
          </div>
          
          <div className="relative group">
            <div className="absolute left-3 -top-2 px-1 bg-white text-[10px] font-bold text-slate-400 z-10">Username</div>
            <input 
              type="text" 
              readOnly
              value={auth.currentUser?.email?.split('@')[0] || ''}
              className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 px-4 text-sm font-medium text-slate-600 outline-none"
            />
          </div>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto scrollbar-hide">
        <div className="px-2 pb-4">
          {isSearching ? (
            <div className="space-y-4">
              <div className="px-4 py-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Search Results</span>
                <button onClick={() => setIsSearching(false)} className="text-[10px] font-bold uppercase tracking-widest text-imo-blue">Cancel</button>
              </div>
              {searchingDB ? (
                <div className="flex justify-center p-8"><Loader2 className="animate-spin text-imo-blue" /></div>
              ) : searchResults.length === 0 ? (
                <div className="text-center p-8 text-slate-400 text-sm">No users found for this phone number.</div>
              ) : (
                searchResults.map(u => (
                  <button 
                    key={u.uid}
                    onClick={() => handleStartChat(u.uid)}
                    className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 rounded-2xl transition-all"
                  >
                    <img src={u.photoURL || `https://ui-avatars.com/api/?name=${u.displayName}&background=random`} className="w-12 h-12 rounded-xl object-cover" />
                    <div className="text-left">
                      <p className="font-bold text-slate-800">{u.displayName}</p>
                      <p className="text-xs text-slate-400">{u.phoneNumber}</p>
                    </div>
                    <MessageSquarePlus className="ml-auto text-imo-blue" size={20} />
                  </button>
                ))
              )}
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center p-12 space-y-4">
              <Loader2 className="animate-spin text-imo-blue" size={24} />
              <p className="text-xs text-slate-400 font-medium font-display">Syncing chats...</p>
            </div>
          ) : chats?.length === 0 ? (
            <div className="text-center p-12">
              <div className="w-16 h-16 bg-slate-50 rounded-2xl mx-auto mb-4 flex items-center justify-center">
                <MoreHorizontal className="text-slate-300" />
              </div>
              <p className="text-sm text-slate-500 font-medium">No conversations yet.</p>
              <button 
                onClick={() => setIsSearching(true)}
                className="mt-4 text-imo-blue text-xs font-bold uppercase tracking-widest hover:underline"
              >
                Start a new chat
              </button>
            </div>
          ) : (
            chats?.map((chat) => (
              <ChatItem 
                key={chat.id} 
                chat={chat} 
                isSelected={selectedChatId === chat.id} 
                onClick={() => onSelectChat(chat.id)} 
              />
            ))
          )}
        </div>
      </div>
      
      <div className="p-4 border-t border-slate-50 grid grid-cols-4 gap-2 bg-white">
         <button className="flex flex-col items-center gap-1 py-1 text-imo-blue relative">
            <div className="w-1 h-1 bg-imo-blue rounded-full absolute -top-1"></div>
            <div className="text-[10px] font-bold uppercase tracking-wider">Chats</div>
         </button>
         <button 
            onClick={() => setShowSettings(true)}
            className="flex flex-col items-center gap-1 py-1 text-slate-400"
          >
            <Settings size={18} className="mb-0.5" />
            <div className="text-[10px] font-bold uppercase tracking-wider">Settings</div>
         </button>
         <button className="flex flex-col items-center gap-1 py-1 text-slate-400">
            <div className="text-[10px] font-bold uppercase tracking-wider">Contacts</div>
         </button>
         <button onClick={() => auth.signOut()} className="flex flex-col items-center gap-1 py-1 text-slate-400">
            <LogOut size={18} className="mb-0.5" />
            <div className="text-[10px] font-bold uppercase tracking-wider">Logout</div>
         </button>
      </div>

      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="relative w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl overflow-hidden p-8"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-display font-bold text-slate-800">Account Security</h3>
                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-slate-50 rounded-full text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="bg-slate-50 rounded-2xl p-4 flex items-start gap-3">
                  <ShieldCheck className="text-imo-blue shrink-0 mt-0.5" size={20} />
                  <div>
                    <p className="text-xs font-bold text-slate-800">Advanced Protection</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Secure your account by setting a master password for cross-device access.</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="relative">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                    <input 
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New Security Password"
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-transparent focus:border-imo-blue/20 rounded-2xl transition-all outline-none text-slate-800 text-sm font-medium"
                    />
                  </div>

                  {passwordStatus === 'success' && (
                    <p className="text-green-500 text-[10px] font-bold uppercase tracking-wider px-2">Password Updated Successfully!</p>
                  )}
                  {passwordStatus === 'error' && (
                    <p className="text-red-500 text-[10px] font-bold uppercase tracking-wider px-2">Update Failed. Re-login may be required.</p>
                  )}

                  <button 
                    onClick={handleSetPassword}
                    disabled={passwordLoading || newPassword.length < 6}
                    className="w-full py-4 bg-imo-blue text-white rounded-2xl font-bold shadow-xl shadow-imo-blue/20 hover:bg-imo-blue/90 transition-all transform active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {passwordLoading ? <Loader2 className="animate-spin" size={20} /> : 'Update Password'}
                  </button>
                </div>

                <div className="pt-4 border-t border-slate-50">
                  <button 
                    onClick={() => auth.signOut()}
                    className="w-full py-3 text-red-500 font-bold text-xs uppercase tracking-widest hover:bg-red-50 rounded-xl transition-all"
                  >
                    Sign Out Everywhere
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ChatItemProps {
  key?: string | number;
  chat: Chat;
  isSelected: boolean;
  onClick: () => void;
}

function ChatItem({ chat, isSelected, onClick }: ChatItemProps) {
  const otherParticipantId = chat.participants.find(id => id !== auth.currentUser?.uid);
  const otherUserRef = otherParticipantId ? doc(db, 'users', otherParticipantId) : null;
  const [otherUser] = useDocumentData(otherUserRef) as unknown as [UserProfile | undefined, boolean, any];

  const time = chat.updatedAt ? formatTimestamp(chat.updatedAt.toDate()) : '';

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-4 p-4 rounded-2xl transition-all mb-1",
        isSelected ? "bg-imo-bg text-imo-blue shadow-sm" : "hover:bg-slate-50 text-slate-600"
      )}
    >
      <div className="relative flex-shrink-0">
        <div className="w-14 h-14 rounded-2xl overflow-hidden shadow-sm">
          <img 
            src={otherUser?.photoURL || `https://ui-avatars.com/api/?name=${otherUser?.displayName || 'Chat'}&background=random`} 
            className="w-full h-full object-cover" 
          />
        </div>
        {otherUser?.isOnline && (
          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full"></div>
        )}
      </div>
      <div className="flex-grow text-left overflow-hidden">
        <div className="flex items-center justify-between mb-1">
          <span className={cn("font-bold truncate text-[15px]", isSelected ? "text-imo-blue" : "text-slate-800")}>
            {otherUser?.displayName || 'Chat'}
          </span>
          <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap">{time}</span>
        </div>
        <div className="flex items-center justify-between">
          <p className={cn("text-xs truncate max-w-[180px]", isSelected ? "text-imo-blue/70" : "text-slate-400")}>
            {chat.lastMessage?.text || 'No messages yet'}
          </p>
        </div>
      </div>
    </motion.button>
  );
}
