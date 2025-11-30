import React, { useState, useEffect } from 'react';
import { 
  X, 
  CheckCircle2, 
  CreditCard, 
  FileText, 
  PenTool, 
  Building, 
  Lock,
  ChevronRight,
  ShieldCheck,
  Download,
  Printer
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Checkbox } from './ui/checkbox';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';
import { 
  Dialog, 
  DialogContent, 
  DialogTrigger,
  DialogTitle,
  DialogDescription
} from './ui/dialog';

interface QuoteSignatureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSign: () => void;
  volume: number;
  unitPrice: number;
  monthlyCost: number;
  buildFee: number;
}

export const QuoteSignatureModal: React.FC<QuoteSignatureModalProps> = ({
  open,
  onOpenChange,
  onSign,
  volume,
  unitPrice,
  monthlyCost,
  buildFee
}) => {
  const [step, setStep] = useState<'review' | 'payment' | 'sign' | 'success'>('review');
  const [typedName, setTypedName] = useState('');
  const [companyName, setCompanyName] = useState('Acme Corp');
  const [agreed, setAgreed] = useState(false);
  const [signatureType, setSignatureType] = useState<'type' | 'draw'>('type');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setStep('review');
      setIsSubmitting(false);
      setTypedName('');
      setAgreed(false);
    }
  }, [open]);

  const handleSign = async () => {
    setIsSubmitting(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsSubmitting(false);
    setStep('success');
  };

  const handleClose = () => {
    if (step === 'success') {
      onSign();
    }
    onOpenChange(false);
  };

  const totalFirstMonth = buildFee + monthlyCost;

  // Confetti particles
  const particles = Array.from({ length: 50 }).map((_, i) => ({
    id: i,
    x: Math.random() * 100 - 50,
    y: Math.random() * 100 - 50,
    color: ['#E43632', '#22c55e', '#3b82f6', '#f59e0b'][Math.floor(Math.random() * 4)]
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[80vw] w-[80vw] p-0 overflow-hidden bg-gray-50 gap-0 border-0 sm:rounded-3xl shadow-2xl h-[85vh] flex flex-col">
        
        {/* HEADER */}
        <div className="bg-white border-b border-gray-100 p-6 flex items-center justify-between shrink-0 z-20">
          <div>
            <DialogTitle className="text-xl font-bold text-[#0A0A0A] flex items-center gap-2">
              {step === 'success' ? (
                <>
                  <CheckCircle2 className="text-emerald-500" size={24} /> Quote Signed
                </>
              ) : (
                "Review & Sign Quote"
              )}
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500 mt-1">
              {step === 'success' 
                ? "Your agreement is secure and stored." 
                : "Lock your pricing, approve the build, and authorize WRK to begin."}
            </DialogDescription>
          </div>
          
          <div className="flex items-center gap-6">
            {step !== 'success' && (
              <div className="flex items-center gap-2 text-sm font-medium">
                <div className={cn("flex items-center gap-2", step === 'review' ? "text-[#E43632]" : "text-emerald-600")}>
                  <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs border", step === 'review' ? "border-[#E43632] bg-red-50" : "bg-emerald-100 border-emerald-200")}>1</div>
                  <span className="hidden sm:inline">Review</span>
                </div>
                <div className="w-8 h-px bg-gray-200" />
                <div className={cn("flex items-center gap-2", step === 'payment' ? "text-[#E43632]" : step === 'sign' || step === 'success' ? "text-emerald-600" : "text-gray-400")}>
                  <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs border", step === 'payment' ? "border-[#E43632] bg-red-50" : step === 'sign' || step === 'success' ? "bg-emerald-100 border-emerald-200" : "border-gray-200")}>2</div>
                  <span className="hidden sm:inline">Payment</span>
                </div>
                <div className="w-8 h-px bg-gray-200" />
                <div className={cn("flex items-center gap-2", step === 'sign' ? "text-[#E43632]" : "text-gray-400")}>
                  <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs border", step === 'sign' ? "border-[#E43632] bg-red-50" : "border-gray-200")}>3</div>
                  <span className="hidden sm:inline">Sign</span>
                </div>
              </div>
            )}
            
            <Button variant="ghost" size="icon" className="rounded-full" onClick={() => onOpenChange(false)}>
              <X size={20} className="text-gray-400" />
            </Button>
          </div>
        </div>

        {/* BODY CONTENT */}
        <div className="flex-1 overflow-hidden relative flex">
          <AnimatePresence mode="wait">
            {step === 'success' ? (
              // SUCCESS STATE
              <motion.div 
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full h-full flex flex-col items-center justify-center bg-white p-8 relative overflow-hidden"
              >
                {/* Confetti */}
                {particles.map((p) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                    animate={{ 
                      opacity: 0, 
                      x: p.x * 10, 
                      y: p.y * 10,
                      rotate: Math.random() * 360
                    }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    className="absolute top-1/2 left-1/2 w-3 h-3 rounded-sm"
                    style={{ backgroundColor: p.color }}
                  />
                ))}

                <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center mb-8 shadow-lg shadow-emerald-100">
                   <motion.div
                     initial={{ scale: 0, opacity: 0 }}
                     animate={{ scale: 1, opacity: 1 }}
                     transition={{ delay: 0.2, type: "spring" }}
                   >
                     <CheckCircle2 size={48} className="text-emerald-500" />
                   </motion.div>
                </div>
                
                <h3 className="text-3xl font-bold text-[#0A0A0A] mb-3 text-center">Build Authorized</h3>
                <p className="text-gray-500 text-lg mb-8 max-w-md text-center">
                  Your quote is locked and your build is now officially in progress.
                </p>
                
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-6 w-full max-w-sm mb-8">
                   <div className="flex justify-between text-sm mb-2">
                      <span className="text-gray-500">Reference ID</span>
                      <span className="font-mono font-medium">QT-{Math.floor(Math.random() * 10000)}</span>
                   </div>
                   <div className="flex justify-between text-sm mb-2">
                      <span className="text-gray-500">Billed Today</span>
                      <span className="font-bold text-[#0A0A0A]">${buildFee.toLocaleString()}</span>
                   </div>
                   <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Est. Next Bill</span>
                      <span className="text-[#0A0A0A]">${monthlyCost.toLocaleString()}</span>
                   </div>
                </div>

                <Button 
                  onClick={handleClose}
                  size="lg"
                  className="bg-[#E43632] hover:bg-[#C12E2A] text-white px-8 h-12 text-lg shadow-xl shadow-red-500/20"
                >
                  Return to Build Status
                </Button>
                <p className="text-xs text-gray-400 mt-6">
                  A copy of the signed agreement has been sent to your email.
                </p>
              </motion.div>
            ) : (
              // MAIN FLOW (Document + Sidebar)
              <div className="w-full h-full flex flex-col lg:flex-row">
                
                {/* DOCUMENT PREVIEW (Scrollable) */}
                <div className="flex-1 bg-gray-100/50 p-4 sm:p-8 overflow-y-auto relative">
                   <div className="bg-white shadow-xl shadow-gray-200/50 border border-gray-200 max-w-[210mm] mx-auto min-h-[297mm] p-8 sm:p-12 relative text-sm text-gray-700">
                      {/* Watermark */}
                      {!isSubmitting && step !== 'sign' && (
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-45 text-gray-100 text-9xl font-black pointer-events-none select-none border-8 border-gray-100 p-8 opacity-50">
                           DRAFT
                        </div>
                      )}

                      {/* Doc Header */}
                      <div className="flex justify-between items-start mb-12">
                         <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-[#E43632] rounded flex items-center justify-center text-white font-bold text-xl">W</div>
                            <div>
                               <h3 className="font-bold text-[#0A0A0A] text-lg tracking-tight">WRK Studio</h3>
                               <p className="text-xs text-gray-500">Automate Everything.</p>
                            </div>
                         </div>
                         <div className="text-right">
                            <h1 className="text-2xl font-light text-[#0A0A0A] mb-2">Build Quote</h1>
                            <div className="text-xs space-y-1 text-gray-500">
                               <p>Quote #: <span className="font-mono text-[#0A0A0A]">Q-2024-8832</span></p>
                               <p>Date: <span className="text-[#0A0A0A]">{new Date().toLocaleDateString()}</span></p>
                               <p>Valid Until: <span className="text-[#0A0A0A]">{new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}</span></p>
                            </div>
                         </div>
                      </div>

                      {/* Client Info */}
                      <div className="grid grid-cols-2 gap-8 mb-12">
                         <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Prepared For</p>
                            <p className="font-bold text-[#0A0A0A]">{companyName}</p>
                            <p>Attn: Authorized Signatory</p>
                            <p>San Francisco, CA</p>
                         </div>
                         <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Services Provided By</p>
                            <p className="font-bold text-[#0A0A0A]">WRK Technologies Inc.</p>
                            <p>123 Innovation Drive</p>
                            <p>New York, NY 10012</p>
                         </div>
                      </div>

                      {/* Line Items */}
                      <div className="mb-12">
                         <table className="w-full">
                            <thead>
                               <tr className="border-b-2 border-[#0A0A0A]">
                                  <th className="text-left py-3 font-bold text-[#0A0A0A]">Description</th>
                                  <th className="text-right py-3 font-bold text-[#0A0A0A]">Rate</th>
                                  <th className="text-right py-3 font-bold text-[#0A0A0A]">Qty</th>
                                  <th className="text-right py-3 font-bold text-[#0A0A0A]">Amount</th>
                               </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                               <tr>
                                  <td className="py-4">
                                     <p className="font-bold text-[#0A0A0A]">One-Time Build Fee</p>
                                     <p className="text-xs text-gray-500 mt-1">Implementation, testing, and deployment of "Finance Reconciliation" automation.</p>
                                  </td>
                                  <td className="text-right py-4 font-mono">$1,000.00</td>
                                  <td className="text-right py-4 font-mono">1</td>
                                  <td className="text-right py-4 font-mono font-bold text-[#0A0A0A]">${buildFee.toLocaleString()}</td>
                               </tr>
                               <tr>
                                  <td className="py-4">
                                     <p className="font-bold text-[#0A0A0A]">Monthly Usage (Estimated)</p>
                                     <p className="text-xs text-gray-500 mt-1">Volume Tier: {volume.toLocaleString()} units @ ${unitPrice.toFixed(3)}/unit</p>
                                     <p className="text-[10px] text-[#E43632] mt-1 font-medium">12-Month Price Lock Applied</p>
                                  </td>
                                  <td className="text-right py-4 font-mono">${unitPrice.toFixed(3)}</td>
                                  <td className="text-right py-4 font-mono">{volume.toLocaleString()}</td>
                                  <td className="text-right py-4 font-mono font-bold text-[#0A0A0A]">${monthlyCost.toLocaleString()}</td>
                               </tr>
                            </tbody>
                            <tfoot>
                               <tr className="border-t-2 border-[#0A0A0A]">
                                  <td colSpan={3} className="pt-4 text-right font-bold text-[#0A0A0A]">Total Due Today</td>
                                  <td className="pt-4 text-right font-bold text-xl text-[#0A0A0A]">${buildFee.toLocaleString()}</td>
                               </tr>
                               <tr>
                                  <td colSpan={3} className="pt-1 text-right text-xs text-gray-500">Est. Monthly Recurring</td>
                                  <td className="pt-1 text-right text-xs font-mono text-gray-500">${monthlyCost.toLocaleString()}</td>
                               </tr>
                            </tfoot>
                         </table>
                      </div>

                      {/* Terms */}
                      <div className="mb-12 bg-gray-50 p-6 rounded-lg border border-gray-100">
                         <h4 className="font-bold text-[#0A0A0A] mb-3 text-xs uppercase tracking-wider">Terms & Conditions</h4>
                         <div className="space-y-3 text-xs text-gray-600 leading-relaxed">
                            <p><strong>1. Services.</strong> WRK shall provide the automation services as described above. The Client agrees to provide necessary access and credentials for implementation.</p>
                            <p><strong>2. Fees & Payment.</strong> The One-Time Build Fee is due immediately upon signature. Recurring usage fees are billed monthly in arrears based on actual volume.</p>
                            <p><strong>3. Cancellation.</strong> The Client may cancel the monthly service at any time with 30 days written notice. The Build Fee is non-refundable once work commences.</p>
                            <p><strong>4. Intellectual Property.</strong> The Client retains full ownership of their data. WRK retains ownership of the underlying automation logic and reusable components.</p>
                         </div>
                      </div>

                      {/* Signature Area */}
                      <div className="border-t border-gray-200 pt-8 mt-auto">
                         <div className="grid grid-cols-2 gap-12">
                            <div>
                               <div className="h-16 border-b border-gray-300 mb-2 flex items-end pb-2">
                                  {step === 'sign' && typedName ? (
                                    <span className="font-serif text-2xl italic text-blue-900">{typedName}</span>
                                  ) : (
                                    <span className="text-gray-300 text-sm italic">Awaiting signature...</span>
                                  )}
                               </div>
                               <p className="text-xs font-bold text-[#0A0A0A] uppercase">Authorized Signature</p>
                            </div>
                            <div>
                               <div className="h-16 border-b border-gray-300 mb-2 flex items-end pb-2">
                                  <span className="text-[#0A0A0A]">{new Date().toLocaleDateString()}</span>
                               </div>
                               <p className="text-xs font-bold text-[#0A0A0A] uppercase">Date</p>
                            </div>
                         </div>
                      </div>
                   </div>
                   
                   {/* Doc Actions */}
                   <div className="absolute top-6 right-6 flex flex-col gap-2">
                      <Button variant="secondary" size="icon" className="h-10 w-10 rounded-full shadow-lg bg-white hover:bg-gray-50">
                         <Printer size={16} className="text-gray-600" />
                      </Button>
                      <Button variant="secondary" size="icon" className="h-10 w-10 rounded-full shadow-lg bg-white hover:bg-gray-50">
                         <Download size={16} className="text-gray-600" />
                      </Button>
                   </div>
                </div>

                {/* SIDEBAR ACTIONS */}
                <div className="w-full lg:w-[400px] bg-white border-l border-gray-200 flex flex-col shrink-0 shadow-xl z-10">
                   <div className="p-6 flex-1 overflow-y-auto">
                      
                      {/* STEP 1: REVIEW */}
                      {step === 'review' && (
                         <motion.div 
                           initial={{ opacity: 0, x: 20 }}
                           animate={{ opacity: 1, x: 0 }}
                           className="space-y-6"
                         >
                            <div>
                               <h3 className="font-bold text-lg text-[#0A0A0A]">Order Summary</h3>
                               <p className="text-sm text-gray-500">Please review the breakdown before proceeding.</p>
                            </div>

                            <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-3">
                               <div className="flex justify-between items-center">
                                  <span className="text-sm font-medium text-gray-700">Build Fee</span>
                                  <span className="font-bold text-[#0A0A0A]">${buildFee.toLocaleString()}</span>
                               </div>
                               <div className="h-px bg-gray-200" />
                               <div className="flex justify-between items-center">
                                  <span className="text-sm font-medium text-gray-700">First Month Est.</span>
                                  <span className="font-bold text-[#0A0A0A]">${monthlyCost.toLocaleString()}</span>
                               </div>
                               <div className="flex justify-between items-center text-xs text-gray-500">
                                  <span>Volume</span>
                                  <span>{volume.toLocaleString()} units</span>
                               </div>
                            </div>
                            
                            <div className="bg-blue-50 p-4 rounded-xl flex gap-3 items-start">
                               <ShieldCheck className="text-blue-600 shrink-0 mt-0.5" size={18} />
                               <div>
                                  <p className="text-sm font-bold text-blue-900">Price Lock Guarantee</p>
                                  <p className="text-xs text-blue-700 mt-1">Your unit rate of ${unitPrice.toFixed(3)} is locked for 12 months from today.</p>
                               </div>
                            </div>
                         </motion.div>
                      )}

                      {/* STEP 2: PAYMENT */}
                      {step === 'payment' && (
                         <motion.div 
                           initial={{ opacity: 0, x: 20 }}
                           animate={{ opacity: 1, x: 0 }}
                           className="space-y-6"
                         >
                            <div>
                               <h3 className="font-bold text-lg text-[#0A0A0A]">Payment Method</h3>
                               <p className="text-sm text-gray-500">Securely add a card for the build fee.</p>
                            </div>

                            <div className="border border-gray-200 rounded-xl p-4 relative overflow-hidden group cursor-pointer bg-white hover:border-[#E43632] transition-colors">
                               <div className="absolute top-0 right-0 bg-[#0A0A0A] text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg">
                                  DEFAULT
                               </div>
                               <div className="flex items-center gap-3 mb-3">
                                  <div className="w-10 h-6 bg-gray-900 rounded flex items-center justify-center text-white text-[8px] font-bold tracking-widest">
                                     VISA
                                  </div>
                                  <span className="font-bold text-[#0A0A0A] text-sm">•••• 4242</span>
                               </div>
                               <p className="text-xs text-gray-500">Expires 12/25</p>
                               <div className="mt-3 flex items-center gap-2 text-xs text-emerald-600 font-bold">
                                  <CheckCircle2 size={12} /> Card verified
                               </div>
                            </div>

                            <div className="relative">
                               <div className="absolute inset-0 flex items-center">
                                  <span className="w-full border-t border-gray-200" />
                               </div>
                               <div className="relative flex justify-center text-xs uppercase">
                                  <span className="bg-white px-2 text-gray-500">Or pay with</span>
                               </div>
                            </div>

                            <Button variant="outline" className="w-full justify-start text-gray-600 h-12" disabled>
                               <CreditCard size={16} className="mr-2" /> Add New Card
                            </Button>
                         </motion.div>
                      )}

                      {/* STEP 3: SIGNATURE */}
                      {step === 'sign' && (
                         <motion.div 
                           initial={{ opacity: 0, x: 20 }}
                           animate={{ opacity: 1, x: 0 }}
                           className="space-y-6"
                         >
                            <div>
                               <h3 className="font-bold text-lg text-[#0A0A0A]">Sign & Authorize</h3>
                               <p className="text-sm text-gray-500">Final step to activate your build.</p>
                            </div>

                            <div className="space-y-4">
                               <div className="space-y-2">
                                  <label className="text-xs font-bold text-gray-700 uppercase">Company Name</label>
                                  <Input 
                                    value={companyName}
                                    onChange={(e) => setCompanyName(e.target.value)}
                                    className="bg-gray-50 border-gray-200"
                                  />
                               </div>
                               
                               <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                     <label className="text-xs font-bold text-gray-700 uppercase">Signature</label>
                                     <div className="flex bg-gray-100 rounded-lg p-0.5">
                                        <button 
                                          onClick={() => setSignatureType('type')}
                                          className={cn("px-2 py-0.5 text-[10px] rounded font-medium transition-colors", signatureType === 'type' ? "bg-white shadow-sm text-[#0A0A0A]" : "text-gray-500")}
                                        >Type</button>
                                        <button 
                                          onClick={() => setSignatureType('draw')}
                                          className={cn("px-2 py-0.5 text-[10px] rounded font-medium transition-colors", signatureType === 'draw' ? "bg-white shadow-sm text-[#0A0A0A]" : "text-gray-500")}
                                        >Draw</button>
                                     </div>
                                  </div>
                                  
                                  <div className="relative">
                                     {signatureType === 'type' ? (
                                        <Input 
                                          value={typedName}
                                          onChange={(e) => setTypedName(e.target.value)}
                                          placeholder="Type your full name"
                                          className="h-16 text-2xl font-serif italic bg-blue-50/30 border-blue-100 focus:border-blue-300 text-blue-900 placeholder:text-blue-200 placeholder:not-italic"
                                        />
                                     ) : (
                                        <div className="h-16 border border-gray-200 rounded-md bg-gray-50 flex items-center justify-center text-gray-400 text-xs cursor-crosshair hover:bg-gray-100">
                                           <PenTool size={14} className="mr-2" /> Click to draw signature
                                        </div>
                                     )}
                                     <div className="absolute right-3 top-3 text-xs text-gray-300 select-none pointer-events-none">
                                        {signatureType === 'type' ? 'Start typing...' : ''}
                                     </div>
                                  </div>
                               </div>

                               <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
                                  <Checkbox 
                                    id="terms" 
                                    checked={agreed}
                                    onCheckedChange={(c) => setAgreed(c === true)}
                                    className="mt-0.5 border-gray-300 data-[state=checked]:bg-[#E43632] data-[state=checked]:border-[#E43632]"
                                  />
                                  <label htmlFor="terms" className="text-xs text-gray-600 leading-relaxed cursor-pointer select-none">
                                     I agree to the terms in the attached quote and authorize WRK to charge my payment method for the <strong>$1,000.00</strong> build fee today, and recurring monthly fees thereafter.
                                  </label>
                               </div>
                            </div>
                         </motion.div>
                      )}
                   </div>

                   {/* BOTTOM ACTIONS */}
                   <div className="p-6 border-t border-gray-200 bg-gray-50">
                      {step === 'review' && (
                         <Button onClick={() => setStep('payment')} className="w-full h-12 bg-[#0A0A0A] hover:bg-gray-800 text-white font-bold">
                            Proceed to Payment <ChevronRight size={16} className="ml-2" />
                         </Button>
                      )}
                      {step === 'payment' && (
                         <div className="flex gap-3">
                            <Button variant="outline" onClick={() => setStep('review')} className="h-12">Back</Button>
                            <Button onClick={() => setStep('sign')} className="flex-1 h-12 bg-[#0A0A0A] hover:bg-gray-800 text-white font-bold">
                               Use this Card
                            </Button>
                         </div>
                      )}
                      {step === 'sign' && (
                         <div className="flex gap-3">
                            <Button variant="outline" onClick={() => setStep('payment')} className="h-12">Back</Button>
                            <Button 
                              onClick={handleSign} 
                              disabled={!agreed || !typedName || isSubmitting}
                              className="flex-1 h-12 bg-[#E43632] hover:bg-[#C12E2A] text-white font-bold shadow-lg shadow-red-500/20 relative overflow-hidden"
                            >
                               {isSubmitting ? (
                                 <span className="flex items-center gap-2">
                                   <motion.div 
                                     animate={{ rotate: 360 }}
                                     transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                                   >
                                      <Lock size={16} />
                                   </motion.div>
                                   Processing...
                                 </span>
                               ) : (
                                 <span className="flex items-center gap-2">
                                    Sign & Approve Quote <PenTool size={16} />
                                 </span>
                               )}
                            </Button>
                         </div>
                      )}
                   </div>
                </div>

              </div>
            )}
          </AnimatePresence>
        </div>

      </DialogContent>
    </Dialog>
  );
};
