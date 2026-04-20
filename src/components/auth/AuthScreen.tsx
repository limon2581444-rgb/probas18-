import React, { useState, useEffect } from 'react';
import { signInWithPopup, signInWithPhoneNumber, RecaptchaVerifier, ConfirmationResult, signInWithEmailAndPassword } from 'firebase/auth';
import { auth, googleProvider, facebookProvider } from '../../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, Facebook, Chrome as Google, Smartphone, ChevronLeft, Loader2, Mail, Lock } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function AuthScreen() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'phone' | 'email'>('phone');
  const [otp, setOtp] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Initialize Recaptcha
  useEffect(() => {
    (window as any).recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      'size': 'invisible',
      'callback': (response: any) => {
        // reCAPTCHA solved, allow signInWithPhoneNumber.
      }
    });
  }, []);

  const handlePhoneSignIn = async () => {
    if (!phoneNumber) return;
    setLoading(true);
    setError('');
    try {
      const appVerifier = (window as any).recaptchaVerifier;
      // Add country code if not present, but user already has +880 visual hint
      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+880${phoneNumber}`;
      const result = await signInWithPhoneNumber(auth, formattedPhone, appVerifier);
      setConfirmationResult(result);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/operation-not-allowed') {
        setError('Phone Authentication is not enabled in your Firebase Console. Please enable it in Authentication > Sign-in method.');
      } else {
        setError(err.message || 'Failed to send verification code.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp || !confirmationResult) return;
    setLoading(true);
    setError('');
    try {
      await confirmationResult.confirm(otp);
    } catch (err: any) {
      console.error(err);
      setError('Invalid verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    console.log("Starting Google Sign-in...");
    try {
      const result = await signInWithPopup(auth, googleProvider);
      console.log("Google Sign-in Success:", result.user.email);
      if (result.user.providerData.length === 1) {
        console.log("Set password needed - User only has one authentication provider linked.");
      }
    } catch (err: any) {
      console.error("Google Auth Error:", err);
      if (err.code === 'auth/operation-not-allowed') {
        setError('Google Sign-in is not enabled in your Firebase Console. Go to Authentication > Sign-in method and enable Google.');
      } else if (err.code === 'auth/unauthorized-domain') {
        setError(`Domain not authorized. Please add "${window.location.hostname}" to Authorized Domains in Firebase Authentication Settings.`);
      } else if (err.code === 'auth/popup-closed-by-user') {
        setError('Login popup was closed before finishing. Please try again.');
      } else {
        setError(`Login failed: ${err.message || 'Unknown error'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFacebookSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithPopup(auth, facebookProvider);
    } catch (err: any) {
      console.error("Facebook Auth Error:", err);
      if (err.code === 'auth/operation-not-allowed') {
        setError('Facebook Sign-in is not enabled in your Firebase Console.');
      } else {
        setError(`Facebook Sign-in failed: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignIn = async () => {
    if (!email || !password) return;
    setLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/operation-not-allowed') {
        setError('Email/Password login is not enabled in your Firebase Console.');
      } else if (err.code === 'auth/invalid-credential') {
        setError('Invalid email or password.');
      } else {
        setError(err.message || 'Login failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-imo-bg flex items-center justify-center p-4 font-sans">
      <div id="recaptcha-container"></div>
      
      <AnimatePresence mode="wait">
        {!confirmationResult ? (
          <motion.div 
            key="login-form"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl overflow-hidden p-8"
          >
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-imo-blue rounded-[2rem] mx-auto flex items-center justify-center mb-6 shadow-lg rotate-12">
                <span className="text-white text-2xl font-display font-bold -rotate-12">Sabe</span>
              </div>
              <h1 className="text-2xl font-display font-bold text-slate-800">Probas Wife Sabe</h1>
              <p className="text-slate-500 mt-2 text-sm">
                {authMode === 'phone' ? 'Enter your phone number to continue' : 'Sign in with your email account'}
              </p>
            </div>

            <div className="space-y-4">
              <button 
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full py-4 bg-white border-2 border-slate-100 text-slate-700 rounded-2xl font-bold shadow-sm hover:bg-slate-50 transition-all transform active:scale-[0.98] flex items-center justify-center gap-3"
              >
                {loading ? <Loader2 className="animate-spin text-imo-blue" /> : (
                  <>
                    <Google className="text-red-500 w-5 h-5" />
                    Continue with Google
                  </>
                )}
              </button>

              <div className="relative flex items-center py-4">
                <div className="flex-grow border-t border-slate-100"></div>
                <span className="flex-shrink mx-4 text-slate-300 text-[10px] font-bold uppercase tracking-widest">Or login with</span>
                <div className="flex-grow border-t border-slate-100"></div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={handleFacebookSignIn}
                  className="flex items-center justify-center gap-2 py-3.5 px-4 bg-white border-2 border-slate-50 rounded-2xl hover:bg-slate-50 transition-all font-bold text-slate-700 text-xs"
                >
                  <Facebook className="text-blue-600 w-4 h-4" fill="currentColor" />
                  Facebook
                </button>
                <button 
                  onClick={() => setAuthMode(authMode === 'phone' ? 'email' : 'phone')}
                  className="flex items-center justify-center gap-2 py-3.5 px-4 bg-white border-2 border-slate-50 rounded-2xl hover:bg-slate-50 transition-all font-bold text-slate-700 text-xs"
                >
                  {authMode === 'phone' ? <Mail className="text-imo-blue w-4 h-4" /> : <Phone className="text-imo-blue w-4 h-4" />}
                  {authMode === 'phone' ? 'Email' : 'Phone'}
                </button>
              </div>

              <div className="relative pt-6">
                <AnimatePresence mode="wait">
                  {authMode === 'phone' ? (
                    <motion.div
                      key="phone-fields"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="space-y-4"
                    >
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <span className="text-slate-400 text-sm font-bold">+880</span>
                        </div>
                        <input
                          type="tel"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          className="w-full pl-16 pr-4 py-4 bg-slate-50 border-2 border-transparent focus:border-imo-blue/20 rounded-2xl transition-all outline-none text-slate-800 font-medium"
                          placeholder="1XXXXXXXXX"
                        />
                      </div>

                      {error && <p className="text-red-500 text-xs font-medium px-2">{error}</p>}

                      <button 
                        onClick={handlePhoneSignIn}
                        disabled={loading || !phoneNumber}
                        className="w-full py-4 bg-imo-blue text-white rounded-2xl font-bold shadow-xl shadow-imo-blue/20 hover:bg-imo-blue/90 transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2"
                      >
                        {loading ? <Loader2 className="animate-spin" size={20} /> : 'Send OTP'}
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="email-fields"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className="space-y-4"
                    >
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-transparent focus:border-imo-blue/20 rounded-2xl transition-all outline-none text-slate-800 font-medium"
                          placeholder="Email Address"
                        />
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-transparent focus:border-imo-blue/20 rounded-2xl transition-all outline-none text-slate-800 font-medium"
                          placeholder="Password"
                        />
                      </div>

                      {error && <p className="text-red-500 text-xs font-medium px-2">{error}</p>}

                      <button 
                        onClick={handleEmailSignIn}
                        disabled={loading || !email || !password}
                        className="w-full py-4 bg-imo-blue text-white rounded-2xl font-bold shadow-xl shadow-imo-blue/20 hover:bg-imo-blue/90 transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2"
                      >
                        {loading ? <Loader2 className="animate-spin" size={20} /> : 'Sign In with Email'}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="otp-input"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl overflow-hidden p-8"
          >
            <button 
              onClick={() => setConfirmationResult(null)}
              className="mb-6 p-2 -ml-2 text-slate-400 hover:text-imo-blue transition-colors flex items-center gap-1 text-sm font-bold"
            >
              <ChevronLeft size={20} />
              Back
            </button>
            
            <div className="text-left mb-8">
              <h2 className="text-2xl font-display font-bold text-slate-800">Verify Code</h2>
              <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                We've sent a 6-digit code to <span className="font-bold text-slate-700">+880 {phoneNumber}</span>
              </p>
            </div>

            <div className="space-y-6">
              <div className="relative">
                <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                <input
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-transparent focus:border-imo-blue/20 rounded-2xl transition-all outline-none text-slate-800 font-bold tracking-[0.5em] text-xl"
                  placeholder="000000"
                />
              </div>

              {error && <p className="text-red-500 text-xs font-medium px-2">{error}</p>}

              <button 
                onClick={handleVerifyOtp}
                disabled={loading || otp.length < 6}
                className="w-full py-4 bg-imo-blue text-white rounded-2xl font-bold shadow-xl shadow-imo-blue/20 hover:bg-imo-blue/90 transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : 'Verify & Sign In'}
              </button>

              <p className="text-center text-xs text-slate-400">
                Didn't receive the code? <button onClick={handlePhoneSignIn} className="text-imo-blue font-bold">Resend</button>
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
