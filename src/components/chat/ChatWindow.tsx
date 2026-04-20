import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, Video, MoreVertical, Send, Smile, Paperclip, Mic, Image as ImageIcon, ChevronLeft, Loader2 } from 'lucide-react';
import { cn, formatTimestamp } from '../../lib/utils';
import { db, auth, Message, Chat, UserProfile, uploadFile } from '../../lib/firebase';
import { collection, query, orderBy, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { useCollectionData, useDocumentData } from 'react-firebase-hooks/firestore';
import { v4 as uuidv4 } from 'uuid';
import { socket } from '../../lib/socket';
import CallOverlay from './CallOverlay';

export default function ChatWindow({ chatId, onBack }: { chatId: string, onBack: () => void }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [isVideoCall, setIsVideoCall] = useState(false);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Real-time chat metadata
  const chatRef = doc(db, 'chats', chatId);
  const [chatData] = useDocumentData(chatRef) as unknown as [Chat | undefined, boolean, any];

  // Identify other participant
  const otherParticipantId = chatData?.participants.find(id => id !== auth.currentUser?.uid);
  
  // Real-time other participant profile
  const otherUserRef = otherParticipantId ? doc(db, 'users', otherParticipantId) : null;
  const [otherUser] = useDocumentData(otherUserRef) as unknown as [UserProfile | undefined, boolean, any];

  // Socket listener for typing
  useEffect(() => {
    const handleTypingStatus = (data: { chatId: string, isTyping: boolean }) => {
      if (data.chatId === chatId) {
        setIsOtherUserTyping(data.isTyping);
      }
    };

    socket.on('typing-status', handleTypingStatus);
    return () => {
      socket.off('typing-status', handleTypingStatus);
    };
  }, [chatId]);

  // Handle local typing emission
  const handleTyping = () => {
    if (!otherParticipantId) return;

    // Emit typing true
    socket.emit('typing', {
      to: otherParticipantId,
      chatId,
      isTyping: true
    });

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set timeout to emit typing false
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing', {
        to: otherParticipantId,
        chatId,
        isTyping: false
      });
    }, 3000);
  };

  // Real-time messages
  const messagesQuery = query(
    collection(db, 'chats', chatId, 'messages'),
    orderBy('createdAt', 'asc')
  );
  
  const [values, loading, , snapshot] = useCollectionData(messagesQuery);
  const messages = values?.map((data, index) => ({
    ...data,
    id: snapshot?.docs[index].id
  })) as Message[] | undefined;

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!message.trim() || !auth.currentUser) return;
    
    setSending(true);
    const textToSend = message.trim();
    setMessage('');

    // Stop typing indicator on send
    if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
    }
    if (otherParticipantId) {
        socket.emit('typing', { to: otherParticipantId, chatId, isTyping: false });
    }
    
    try {
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        text: textToSend,
        senderId: auth.currentUser.uid,
        type: 'text',
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: {
          text: textToSend,
          senderId: auth.currentUser.uid,
          createdAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setSending(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;

    setSending(true);
    try {
      const path = `chats/${chatId}/${uuidv4()}_${file.name}`;
      const url = await uploadFile(file, path);

      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        text: '',
        senderId: auth.currentUser.uid,
        type: 'image',
        mediaUrl: url,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: {
          text: 'Shared an image',
          senderId: auth.currentUser.uid,
          createdAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error uploading image:", error);
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f8faff] w-full">
      <CallOverlay 
        isOpen={isCallOpen} 
        onClose={() => {
          setIsCallOpen(false);
          setIsVideoCall(false);
        }} 
        user={otherUser}
        isVideo={isVideoCall}
      />
      <input 
        type="file" 
        accept="image/*" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
      />
      {/* Header */}
      <div className="bg-white px-6 py-4 border-b border-slate-100 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="md:hidden p-2 -ml-2 text-slate-400 hover:text-imo-blue transition-colors">
            <ChevronLeft size={24} />
          </button>
          <div className="relative group cursor-pointer">
            <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-sm ring-2 ring-white group-hover:ring-imo-blue/20 transition-all">
              <img 
                src={otherUser?.photoURL || `https://ui-avatars.com/api/?name=${otherUser?.displayName || 'Chat'}&background=random`} 
                className="w-full h-full object-cover" 
              />
            </div>
            {otherUser?.isOnline && (
              <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full"></div>
            )}
          </div>
          <div>
            <h3 className="font-display font-bold text-slate-800 text-lg leading-tight truncate max-w-[150px] md:max-w-none">
              {otherUser?.displayName || 'Loading...'}
            </h3>
            <p className={cn(
              "text-[10px] font-bold uppercase tracking-wider",
              otherUser?.isOnline ? "text-green-500" : "text-slate-400"
            )}>
              {otherUser?.isOnline ? 'Online now' : 'Offline'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setIsCallOpen(true)}
            className="p-3 text-imo-blue hover:bg-imo-bg rounded-2xl transition-all hover:scale-110 active:scale-95"
          >
            <Phone size={22} />
          </button>
          <button 
            onClick={() => {
              setIsVideoCall(true);
              setIsCallOpen(true);
            }}
            className="p-3 text-imo-blue hover:bg-imo-bg rounded-2xl transition-all hover:scale-110 active:scale-95"
          >
            <Video size={22} />
          </button>
          <button className="p-3 text-slate-400 hover:bg-slate-50 rounded-2xl transition-all">
            <MoreVertical size={22} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-grow overflow-y-auto p-6 space-y-6 scrollbar-hide"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full space-y-4">
            <Loader2 className="animate-spin text-imo-blue" size={24} />
            <p className="text-xs text-slate-400 font-medium">Loading messages...</p>
          </div>
        ) : messages?.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-60">
             <div className="w-20 h-20 bg-white rounded-[2rem] flex items-center justify-center mb-6 shadow-sm">
                <Smile className="text-slate-200" size={40} />
             </div>
             <p className="text-slate-400 text-sm font-medium">Say hello! Start the conversation.</p>
          </div>
        ) : (
          messages?.map((msg, i) => {
            const isMe = msg.senderId === auth.currentUser?.uid;
            const time = msg.createdAt ? formatTimestamp(msg.createdAt.toDate()) : '';
            
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "flex",
                  isMe ? "justify-end" : "justify-start"
                )}
              >
                <div className={cn(
                  "max-w-[70%] group relative",
                  isMe ? "items-end" : "items-start"
                )}>
                  <div className={cn(
                    "px-1 py-1 shadow-sm",
                    isMe 
                      ? "bg-imo-blue text-white rounded-t-2xl rounded-bl-2xl rounded-br-sm" 
                      : "bg-white text-slate-700 rounded-t-2xl rounded-br-2xl rounded-bl-sm",
                    msg.type === 'text' && "px-5 py-3.5"
                  )}>
                    {msg.type === 'image' ? (
                      <div className="relative rounded-xl overflow-hidden group">
                        <img 
                          src={msg.mediaUrl} 
                          alt="Shared image" 
                          className="max-h-60 w-full object-cover rounded-xl"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      </div>
                    ) : (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    )}
                  </div>
                  <div className={cn(
                    "flex items-center gap-1 mt-1.5 px-1",
                    isMe ? "flex-row-reverse" : "flex-row"
                  )}>
                    <span className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">{time}</span>
                    {isMe && <div className="w-1 h-1 bg-imo-blue rounded-full opacity-50"></div>}
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
        
        {isOtherUserTyping && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
          >
            <div className="bg-white/50 backdrop-blur-sm px-4 py-2 rounded-2xl flex items-center gap-2">
              <div className="flex gap-1">
                <motion.div 
                  animate={{ scale: [1, 1.5, 1] }} 
                  transition={{ repeat: Infinity, duration: 0.6 }}
                  className="w-1 h-1 bg-imo-blue rounded-full"
                />
                <motion.div 
                   animate={{ scale: [1, 1.5, 1] }} 
                   transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }}
                   className="w-1 h-1 bg-imo-blue rounded-full"
                />
                <motion.div 
                   animate={{ scale: [1, 1.5, 1] }} 
                   transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }}
                   className="w-1 h-1 bg-imo-blue rounded-full"
                />
              </div>
              <span className="text-[10px] font-bold text-imo-blue uppercase tracking-widest">Typing...</span>
            </div>
          </motion.div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-6 bg-transparent">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="flex-grow relative group">
             <div className="absolute left-1.5 bottom-1.5 flex gap-1">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 text-slate-400 hover:text-imo-blue hover:bg-imo-bg rounded-xl transition-all"
                >
                  <Paperclip size={20} />
                </button>
             </div>
             <textarea 
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  handleTyping();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Type a message..."
                rows={1}
                className="w-full bg-white border-2 border-transparent focus:border-imo-blue/20 rounded-2xl py-4 pl-14 pr-14 text-sm shadow-sm transition-all outline-none resize-none min-h-[56px] leading-relaxed"
             />
             <div className="absolute right-1.5 bottom-1.5 flex gap-1">
                <button className="p-2.5 text-slate-400 hover:text-imo-blue hover:bg-imo-bg rounded-xl transition-all">
                  <Smile size={20} />
                </button>
             </div>
          </div>
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSendMessage}
            disabled={!message.trim() || sending}
            className={cn(
              "w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-lg",
              message.trim() ? "bg-imo-blue text-white shadow-imo-blue/20" : "bg-white text-slate-400"
            )}
          >
            {sending ? (
              <Loader2 className="animate-spin" size={24} />
            ) : (
              message.trim() ? <Send size={24} className="ml-1" /> : <Mic size={24} />
            )}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
