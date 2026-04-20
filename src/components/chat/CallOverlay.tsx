import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, PhoneOff, Volume2, User, Loader2, PhoneCall, Video, VideoOff, Camera } from 'lucide-react';
import { cn } from '../../lib/utils';
import { UserProfile, auth } from '../../lib/firebase';
import { socket } from '../../lib/socket';

interface CallOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile | undefined;
  incomingOffer?: any;
  isVideo?: boolean;
}

export default function CallOverlay({ isOpen, onClose, user, incomingOffer, isVideo = false }: CallOverlayProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [duration, setDuration] = useState(0);
  const [status, setStatus] = useState<'idle' | 'calling' | 'receiving' | 'connecting' | 'connected' | 'ended'>('idle');
  const [cameraMode, setCameraMode] = useState<'user' | 'environment'>('user');
  
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const iceBufferRef = useRef<RTCIceCandidate[]>([]);

  // Ice servers
  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (status === 'connected') {
      interval = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    if (isOpen) {
      if (incomingOffer) {
        setStatus('receiving');
      } else {
        startCall();
      }
    } else {
      cleanup();
    }
  }, [isOpen]);

  useEffect(() => {
    if (status === 'ended') {
      const timeout = setTimeout(onClose, 2000);
      return () => clearTimeout(timeout);
    }
  }, [status]);

  const cleanup = () => {
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    peerConnectionRef.current?.close();
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    localStreamRef.current = null;
    peerConnectionRef.current = null;
    setDuration(0);
    setStatus('idle');
    setIsVideoOff(false);
    setIsMuted(false);
  };

  const initWebRTC = async (mode: 'user' | 'environment' = 'user') => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: isVideo ? { facingMode: mode } : false
      });
      localStreamRef.current = stream;
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      const pc = new RTCPeerConnection(iceServers);
      peerConnectionRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.onicecandidate = (event) => {
        if (event.candidate && user?.uid) {
          socket.emit('ice-candidate', {
            to: user.uid,
            candidate: event.candidate
          });
        }
      };

      pc.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      // Apply buffered ICE candidates
      if (iceBufferRef.current.length > 0) {
        iceBufferRef.current.forEach(candidate => {
          pc.addIceCandidate(candidate).catch(e => console.error("Error adding buffered candidate", e));
        });
        iceBufferRef.current = [];
      }

      return pc;
    } catch (err) {
      console.error("Access denied for camera/mic", err);
      throw err;
    }
  };

  const startCall = async () => {
    if (!user?.uid || !auth.currentUser) return;
    setStatus('calling');
    try {
      const pc = await initWebRTC(cameraMode);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit('call-user', {
        to: user.uid,
        offer,
        from: auth.currentUser.uid,
        fromProfile: {
          displayName: auth.currentUser.displayName,
          photoURL: auth.currentUser.photoURL
        },
        isVideo
      });
    } catch (err) {
      console.error('Failed to start call:', err);
      onClose();
    }
  };

  const acceptCall = async () => {
    if (!user?.uid || !incomingOffer) return;
    setStatus('connecting');
    try {
      const pc = await initWebRTC(cameraMode);
      await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('make-answer', {
        to: user.uid,
        answer
      });
      setStatus('connected');
    } catch (err) {
      console.error('Failed to accept call:', err);
      onClose();
    }
  };

  useEffect(() => {
    const handleAnswerMade = async (data: { answer: any }) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        setStatus('connected');
      }
    };

    const handleIceCandidate = async (data: { candidate: any }) => {
      const candidate = new RTCIceCandidate(data.candidate);
      if (peerConnectionRef.current && peerConnectionRef.current.remoteDescription) {
        try {
          await peerConnectionRef.current.addIceCandidate(candidate);
        } catch (e) {
          console.error('Error adding ice candidate', e);
        }
      } else {
        iceBufferRef.current.push(candidate);
      }
    };

    socket.on('answer-made', handleAnswerMade);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('call-ended', () => setStatus('ended'));

    return () => {
      socket.off('answer-made', handleAnswerMade);
      socket.off('ice-candidate', handleIceCandidate);
      socket.off('call-ended');
    };
  }, []);

  const handleClose = () => {
    if (user?.uid) {
      socket.emit('end-call', { to: user.uid });
    }
    setStatus('ended');
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = isVideoOff;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  const switchCamera = async () => {
    if (!localStreamRef.current || !peerConnectionRef.current) return;
    
    const newMode = cameraMode === 'user' ? 'environment' : 'user';
    setCameraMode(newMode);

    try {
      // Get new stream
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newMode },
        audio: true
      });

      const videoTrack = newStream.getVideoTracks()[0];
      const sender = peerConnectionRef.current.getSenders().find(s => s.track?.kind === 'video');
      
      if (sender && videoTrack) {
        await sender.replaceTrack(videoTrack);
        
        // Stop old video track
        localStreamRef.current.getVideoTracks()[0].stop();
        
        // Update local ref
        localStreamRef.current = newStream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = newStream;
        }
      }
    } catch (err) {
      console.error("Error switching camera:", err);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center text-white overflow-hidden"
        >
          {/* Remote Video (Full Screen) */}
          {isVideo && (
            <div className="absolute inset-0 z-0">
               <video 
                  ref={remoteVideoRef} 
                  autoPlay 
                  playsInline 
                  className={cn(
                    "w-full h-full object-cover transition-opacity duration-700",
                    status === 'connected' ? "opacity-100" : "opacity-30 grayscale blur-xl"
                  )} 
               />
               {status !== 'connected' && (
                 <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-12 h-12 text-imo-blue animate-spin" />
                 </div>
               )}
            </div>
          )}

          {/* Local Video (Floating) */}
          {isVideo && (
            <motion.div 
               drag
               dragConstraints={{ left: -300, right: 300, top: -500, bottom: 500 }}
               className="absolute top-10 right-6 w-32 h-44 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 bg-slate-900 z-30 cursor-move ring-4 ring-black/20"
            >
              <video 
                ref={localVideoRef} 
                autoPlay 
                playsInline 
                muted 
                className={cn(
                  "w-full h-full object-cover scale-x-[-1]",
                  isVideoOff && "hidden"
                )} 
              />
              {isVideoOff && (
                <div className="w-full h-full flex items-center justify-center bg-slate-800">
                  <User size={32} className="text-slate-600" />
                </div>
              )}
            </motion.div>
          )}

          {/* Audio background when not video */}
          {!isVideo && (
            <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
               <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-imo-blue rounded-full blur-[120px] animate-pulse"></div>
               <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500 rounded-full blur-[120px] animate-pulse transition-all duration-5000"></div>
            </div>
          )}

          {/* Call Header / Info */}
          <div className={cn(
            "text-center z-10 w-full transition-all duration-500",
            status === 'connected' && isVideo ? "opacity-0 hover:opacity-100 pt-10" : "py-20"
          )}>
            <motion.div 
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="mb-8"
            >
              {!isVideo && (
                <div className="relative inline-block">
                  <div className="w-32 h-32 rounded-[2.5rem] overflow-hidden border-4 border-white/10 shadow-2xl bg-slate-800 mx-auto">
                    {user?.photoURL ? (
                      <img src={user.photoURL} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-slate-800">
                        <User size={48} className="text-slate-600" />
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              <div className={cn(
                "mt-4 mx-auto w-fit text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg backdrop-blur-md border border-white/10",
                status === 'connected' ? "bg-green-500/80" : "bg-imo-blue/80"
              )}>
                {status === 'receiving' ? `Incoming ${isVideo ? 'Video' : 'Voice'} Call` : 
                 status === 'calling' ? 'Calling...' :
                 status === 'connecting' ? 'Connecting...' :
                 status === 'connected' ? (isVideo ? 'Live Video' : 'Connected') : 'Call Ended'}
              </div>
            </motion.div>

            <h2 className="text-3xl font-display font-bold mb-2 drop-shadow-lg">{user?.displayName || 'Unknown'}</h2>
            {status === 'connected' && (
              <p className="text-slate-200 font-mono text-lg bg-black/20 w-fit mx-auto px-3 py-1 rounded-lg backdrop-blur-sm">
                {Math.floor(duration/60)}:{ (duration%60).toString().padStart(2, '0') }
              </p>
            )}
          </div>

          {/* Call Controls */}
          <div className={cn(
            "flex flex-col items-center gap-10 w-full z-20 pb-20 transition-transform duration-500",
            status === 'connected' && isVideo ? "translate-y-10 hover:translate-y-0 opacity-20 hover:opacity-100" : ""
          )}>
            {status === 'receiving' ? (
              <div className="flex gap-12">
                <div className="flex flex-col items-center gap-3">
                  <motion.button 
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={handleClose}
                    className="w-20 h-20 bg-red-500 rounded-[2rem] flex items-center justify-center shadow-xl shadow-red-500/30 text-white"
                  >
                    <PhoneOff size={32} />
                  </motion.button>
                  <span className="text-xs font-bold uppercase tracking-wider text-red-500">Decline</span>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <motion.button 
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={acceptCall}
                    className="w-20 h-20 bg-green-500 rounded-[2rem] flex items-center justify-center shadow-xl shadow-green-500/30 text-white animate-pulse"
                  >
                    {isVideo ? <Video size={32} /> : <PhoneCall size={32} />}
                  </motion.button>
                  <span className="text-xs font-bold uppercase tracking-wider text-green-500">Accept</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10 w-full max-w-lg px-4">
                <div className="flex flex-col items-center gap-3">
                  <button 
                    onClick={toggleMute}
                    className={cn(
                      "w-16 h-16 rounded-[1.5rem] flex items-center justify-center transition-all border-2",
                      isMuted 
                        ? "bg-white text-slate-900 border-white" 
                        : "bg-white/10 text-white border-white/10 hover:bg-white/20 backdrop-blur-md"
                    )}
                  >
                    {isMuted ? <MicOff size={28} /> : <Mic size={28} />}
                  </button>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Mic</span>
                </div>

                {isVideo && (
                  <div className="flex flex-col items-center gap-3">
                    <button 
                      onClick={toggleVideo}
                      className={cn(
                        "w-16 h-16 rounded-[1.5rem] flex items-center justify-center transition-all border-2",
                        isVideoOff 
                          ? "bg-white text-slate-900 border-white" 
                          : "bg-white/10 text-white border-white/10 hover:bg-white/20 backdrop-blur-md"
                      )}
                    >
                      {isVideoOff ? <VideoOff size={28} /> : <Video size={28} />}
                    </button>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Cam</span>
                  </div>
                )}

                <div className="flex flex-col items-center gap-3">
                  <motion.button 
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={handleClose}
                    className="w-20 h-20 bg-red-500 rounded-[2.5rem] flex items-center justify-center shadow-xl shadow-red-500/40 text-white"
                  >
                    <PhoneOff size={32} />
                  </motion.button>
                </div>

                {isVideo && (
                  <div className="flex flex-col items-center gap-3">
                    <button 
                      onClick={switchCamera}
                      className="w-16 h-16 bg-white/10 text-white border-2 border-white/10 rounded-[1.5rem] flex items-center justify-center transition-all hover:bg-white/20 backdrop-blur-md"
                    >
                      <Camera size={28} />
                    </button>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Flip</span>
                  </div>
                )}

                {!isVideo && (
                  <div className="flex flex-col items-center gap-3">
                    <button 
                      onClick={() => setIsSpeakerOn(!isSpeakerOn)}
                      className={cn(
                        "w-16 h-16 rounded-[1.5rem] flex items-center justify-center transition-all border-2",
                        isSpeakerOn 
                          ? "bg-white text-slate-900 border-white" 
                          : "bg-white/10 text-white border-white/10 hover:bg-white/20 backdrop-blur-md"
                      )}
                    >
                      <Volume2 size={28} />
                    </button>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Speaker</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
