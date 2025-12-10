import React, { useState } from 'react';
import { X, Lock, Eye, CheckCircle, Shield, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface CredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  systemName: string;
}

export const CredentialsModal: React.FC<CredentialsModalProps> = ({ isOpen, onClose, systemName }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    setIsConnecting(true);
    // Simulate API call
    setTimeout(() => {
      setIsConnecting(false);
      setIsSuccess(true);
      setTimeout(() => {
         onClose();
         setIsSuccess(false); // Reset for next time
      }, 1500);
    }, 1500);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div>
                <h3 className="font-bold text-lg text-[#0A0A0A]">Connect to {systemName}</h3>
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                  <Shield size={10} className="text-emerald-500" />
                  Credentials are encrypted and stored securely.
                </p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6">
              {isSuccess ? (
                <div className="py-8 flex flex-col items-center text-center">
                  <motion.div 
                    initial={{ scale: 0 }} animate={{ scale: 1 }} 
                    className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4"
                  >
                    <CheckCircle size={32} />
                  </motion.div>
                  <h4 className="text-lg font-bold text-[#0A0A0A]">Successfully Connected!</h4>
                  <p className="text-sm text-gray-500 mt-1">Redirecting you back to the blueprint...</p>
                </div>
              ) : (
                <form onSubmit={handleConnect} className="space-y-4">
                  <Button variant="outline" type="button" className="w-full h-12 bg-white border-gray-300 hover:bg-gray-50 text-[#0A0A0A] font-medium relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center text-[10px] font-bold">
                      {systemName.charAt(0)}
                    </div>
                    Sign in with {systemName}
                  </Button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-gray-100" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white px-2 text-gray-400 font-medium tracking-wider">Or enter credentials</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                       <Label className="text-xs font-bold text-gray-600">Username / Email</Label>
                       <Input placeholder="user@company.com" className="bg-gray-50 border-gray-200 focus-visible:ring-[#E43632]" required />
                    </div>
                    <div className="space-y-1.5">
                       <Label className="text-xs font-bold text-gray-600">API Token / Password</Label>
                       <div className="relative">
                         <Input type="password" placeholder="••••••••••••••••" className="bg-gray-50 border-gray-200 focus-visible:ring-[#E43632] pr-10" required />
                         <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                           <Eye size={14} />
                         </button>
                       </div>
                    </div>
                  </div>

                  <div className="pt-2">
                    <Button 
                      type="submit" 
                      disabled={isConnecting}
                      className="w-full bg-[#E43632] hover:bg-[#C12E2A] text-white font-bold h-11 shadow-lg shadow-red-500/20"
                    >
                      {isConnecting ? (
                        <>
                          <Loader2 size={16} className="animate-spin mr-2" />
                          Connecting...
                        </>
                      ) : (
                        'Connect Account'
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
