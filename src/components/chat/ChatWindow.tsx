import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, Video, MoreVertical, Send, Smile, Paperclip, Mic, Image as ImageIcon, ChevronLeft, Loader2, Play, Pause, Trash2, StopCircle } from 'lucide-react';
import { cn, formatTimestamp } from '../../lib/utils';
import { db, auth, Message, Chat, UserProfile, uploadFile, sendVoiceNote, sendMessage } from '../../lib/firebase';
import { collection, query, orderBy, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { useCollectionData, useDocumentData } from 'react-firebase-hooks/firestore';
import { v4 as uuidv4 } from 'uuid';
import { socket } from '../../lib/socket';
import CallOverlay from './CallOverlay';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';

export default function ChatWindow({ chatId, onBack }: { chatId: string, onBack: () => void }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [isVideoCall, setIsVideoCall] = useState(false);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
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
  }, [messages, isOtherUserTyping]);

  const handleSendMessage = async () => {
    if (!message.trim() || !otherParticipantId) return;
    
    setSending(true);
    const textToSend = message.trim();
    setMessage('');

    // Stop typing indicator on send
    if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
    }
    socket.emit('typing', { to: otherParticipantId, chatId, isTyping: false });
    
    try {
      await sendMessage(textToSend, otherParticipantId);
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setSending(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !otherParticipantId) return;

    setSending(true);
    try {
      await sendImage(file, otherParticipantId);
    } catch (error) {
      console.error("Error uploading image:", error);
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size > 0 && !isRecordingCancelled.current) {
          setSending(true);
          try {
            if (otherParticipantId) {
              await sendVoiceNote(audioBlob, otherParticipantId);
            }
          } catch (error) {
            console.error("Error sending voice note:", error);
          } finally {
            setSending(false);
          }
        }
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setIsRecording(true);
      isRecordingCancelled.current = false;
      setRecordingDuration(0);
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      alert("Microphone access is required for voice notes.");
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const isRecordingCancelled = useRef(false);
  const cancelRecording = () => {
    isRecordingCancelled.current = true;
    stopRecording();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const onEmojiClick = (emojiData: EmojiClickData) => {
    setMessage(prev => prev + emojiData.emoji);
  };

  return (
    <div className="flex flex-col h-full bg-[#e5ddd5] w-full relative overflow-hidden">
      {/* WhatsApp background pattern overlay */}
      <div 
        className="absolute inset-0 opacity-[0.06] pointer-events-none" 
        style={{ 
          backgroundImage: `url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')`,
          backgroundSize: '400px'
        }}
      ></div>
      
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
            const isMe = msg.senderId === auth.currentUser?.uid || msg.sender === auth.currentUser?.uid;
            const msgTime = msg.createdAt || msg.time;
            const time = (msgTime && typeof msgTime.toDate === 'function') ? formatTimestamp(msgTime.toDate()) : 'Pending...';
            
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className={cn(
                  "flex w-full",
                  isMe ? "justify-end" : "justify-start"
                )}
              >
                <div className={cn(
                  "max-w-[85%] md:max-w-[70%] group relative flex flex-col",
                  isMe ? "items-end" : "items-start"
                )}>
                  <div className={cn(
                    "relative px-4 py-2 shadow-sm transition-all",
                    isMe 
                      ? "bg-[#dcf8c6] text-slate-800 rounded-l-2xl rounded-tr-2xl rounded-br-sm border border-[#c7e9af]" 
                      : "bg-white text-slate-800 rounded-r-2xl rounded-tl-2xl rounded-bl-sm border border-slate-100",
                    msg.type === 'text' && "min-w-[80px]"
                  )}>
                    {/* Tail for WhatsApp looks */}
                    <div className={cn(
                      "absolute top-0 w-3 h-3",
                      isMe 
                        ? "-right-2 bg-[#dcf8c6] border-t border-r border-[#c7e9af]" 
                        : "-left-2 bg-white border-t border-l border-slate-100"
                    )} style={{ 
                        clipPath: isMe ? 'polygon(0 0, 0 100%, 100% 0)' : 'polygon(100% 0, 100% 100%, 0 0)',
                    }}></div>

                    {msg.type === 'image' ? (
                      <div className="relative rounded-lg overflow-hidden group/img mt-1">
                        <img 
                          src={msg.image || msg.mediaUrl} 
                          alt="Shared image" 
                          className="max-h-80 w-full object-cover rounded-lg"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-black/5 opacity-0 group-hover/img:opacity-100 transition-opacity"></div>
                      </div>
                    ) : msg.type === 'voice' ? (
                      <div className="flex items-center gap-3 min-w-[220px] py-1">
                        <button className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center shadow-sm transition-all",
                          isMe ? "bg-[#71ce3a] text-white" : "bg-imo-blue text-white"
                        )}>
                          <Play size={18} fill="currentColor" />
                        </button>
                        <div className="flex-grow">
                          <div className={cn(
                            "h-1.5 rounded-full w-full",
                            isMe ? "bg-[#c7e9af]" : "bg-slate-100"
                          )}>
                            <div className={cn(
                              "h-full rounded-full w-1/3",
                              isMe ? "bg-[#71ce3a]" : "bg-imo-blue"
                            )}></div>
                          </div>
                          <div className="flex justify-between items-center mt-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">0:14 / Voice</span>
                          </div>
                        </div>
                        <audio src={msg.mediaUrl} className="hidden" controls />
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        <p className="text-[15px] leading-snug whitespace-pre-wrap">{msg.text}</p>
                      </div>
                    )}
                    
                    {/* Timestamp inside bubble to match WhatsApp style better */}
                    <div className="flex justify-end items-center gap-1 mt-1 -mr-1">
                      <span className="text-[10px] text-slate-400 font-medium">{time}</span>
                      {isMe && (
                         <div className="flex">
                            <svg width="16" height="11" viewBox="0 0 16 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                               <path d="M1 5L5 9L14.5 1" stroke="#4FB6EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                               <path d="M5.5 5L9.5 9L19 1" stroke="#4FB6EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="translate(-4, 0)"/>
                            </svg>
                         </div>
                      )}
                    </div>
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
      <div className="p-6 bg-transparent relative">
        <AnimatePresence>
          {showEmojiPicker && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-24 right-6 z-50 shadow-2xl rounded-3xl overflow-hidden"
            >
              <EmojiPicker 
                onEmojiClick={onEmojiClick} 
                autoFocusSearch={false}
                theme={Theme.LIGHT}
                width={320}
                height={400}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="max-w-4xl mx-auto flex items-center gap-3">
          {isRecording ? (
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex-grow bg-white rounded-2xl p-2 px-4 shadow-sm border border-red-100 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex items-center justify-center">
                    <div className="absolute inset-0 bg-red-400 rounded-full animate-ping opacity-25"></div>
                    <div className="w-2.5 h-2.5 bg-red-500 rounded-full"></div>
                  </div>
                  <span className="font-mono text-sm font-bold text-slate-700">{formatDuration(recordingDuration)}</span>
                </div>
                <div className="h-4 w-[1px] bg-slate-100"></div>
                <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest animate-pulse">Recording...</span>
              </div>
              
              <div className="flex items-center gap-2">
                <button 
                  onClick={cancelRecording}
                  className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                >
                  <Trash2 size={20} />
                </button>
                <div className="h-6 w-[1px] bg-slate-100"></div>
                <button 
                  onClick={stopRecording}
                  className="p-3 bg-imo-blue text-white rounded-xl shadow-lg shadow-imo-blue/20 hover:scale-105 transition-all"
                >
                  <Send size={20} className="ml-0.5" />
                </button>
              </div>
            </motion.div>
          ) : (
            <>
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
                    <button 
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className={cn(
                        "p-2.5 rounded-xl transition-all",
                        showEmojiPicker ? "bg-imo-blue text-white" : "text-slate-400 hover:text-imo-blue hover:bg-imo-bg"
                      )}
                    >
                      <Smile size={20} />
                    </button>
                </div>
              </div>
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => message.trim() ? handleSendMessage() : startRecording()}
                disabled={sending}
                className={cn(
                  "w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-lg",
                  message.trim() ? "bg-imo-blue text-white shadow-imo-blue/20" : "bg-white text-slate-400 hover:text-imo-blue"
                )}
              >
                {sending ? (
                  <Loader2 className="animate-spin" size={24} />
                ) : (
                  message.trim() ? <Send size={24} className="ml-1" /> : <Mic size={24} />
                )}
              </motion.button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
