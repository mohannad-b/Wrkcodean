import React, { useState } from 'react';
import { 
  Hammer, 
  BarChart3, 
  Send, 
  FileText, 
  Info, 
  Sparkles, 
  AlertTriangle, 
  Check, 
  Plus, 
  Trash2,
  Eye,
  Save,
  History
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { cn } from '../lib/utils';

// Types
type QuoteStatus = 'Draft' | 'Sent' | 'Signed';

interface VolumeTier {
  id: string;
  min: number;
  max: number | null; // null for infinity
  discount: number; // percentage
  price: number; // calculated
}

export const OpsProjectDetailPricingTab: React.FC = () => {
  // --- STATE ---
  
  // Status
  const [status, setStatus] = useState<QuoteStatus>('Draft');
  
  // Internal / AI Suggested Data (Read Only)
  const internalData = {
    apiCostPerRun: 0.012,
    humanTimePerRun: 2, // minutes
    humanCostPerHr: 40, // $
    estRunsPerMonth: 5000,
    suggestedBuildFee: 1200,
    suggestedPricePerResult: 0.045,
    suggestedTiers: [
      { min: 0, max: 5000, discount: 0 },
      { min: 5000, max: 20000, discount: 10 },
      { min: 20000, max: null, discount: 20 },
    ]
  };

  // Derived Internal Costs
  const humanCostPerRun = (internalData.humanTimePerRun / 60) * internalData.humanCostPerHr;
  const totalInternalCostPerRun = internalData.apiCostPerRun + humanCostPerRun;
  const estMonthlyInternalCost = totalInternalCostPerRun * internalData.estRunsPerMonth;

  // Client Facing Data (Editable)
  const [buildFee, setBuildFee] = useState<number>(1000);
  const [pricePerResult, setPricePerResult] = useState<number>(0.045);
  const [tiers, setTiers] = useState<VolumeTier[]>([
    { id: '1', min: 0, max: 2500, discount: 0, price: 0.045 },
    { id: '2', min: 2500, max: 10000, discount: 10, price: 0.0405 },
  ]);
  const [overrideNote, setOverrideNote] = useState('');

  // Check for Overrides
  const isBuildFeeOverridden = buildFee !== internalData.suggestedBuildFee;
  const isPriceOverridden = pricePerResult !== internalData.suggestedPricePerResult;
  const isOverridden = isBuildFeeOverridden || isPriceOverridden;

  // --- HANDLERS ---

  const handlePriceChange = (val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num)) {
      setPricePerResult(num);
      // Recalculate tier prices based on new base price
      setTiers(prev => prev.map(t => ({
        ...t,
        price: num * (1 - t.discount / 100)
      })));
    }
  };

  const updateTier = (id: string, field: keyof VolumeTier, value: any) => {
    setTiers(prev => prev.map(t => {
      if (t.id !== id) return t;
      const updated = { ...t, [field]: value };
      
      // Recalculate price if discount changes
      if (field === 'discount') {
        updated.price = pricePerResult * (1 - value / 100);
      }
      return updated;
    }));
  };

  const addTier = () => {
    const lastTier = tiers[tiers.length - 1];
    const newMin = lastTier.max ? lastTier.max : (lastTier.min + 10000);
    
    setTiers([...tiers, {
      id: Math.random().toString(36).substr(2, 9),
      min: newMin,
      max: null,
      discount: 0,
      price: pricePerResult
    }]);
  };

  const removeTier = (id: string) => {
    setTiers(prev => prev.filter(t => t.id !== id));
  };

  // Calculate Margins
  const grossMarginPerRun = pricePerResult - totalInternalCostPerRun;
  const marginPercent = (grossMarginPerRun / pricePerResult) * 100;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 h-full bg-gray-50">
      
      {/* --- LEFT COLUMN: INTERNAL ANALYSIS (5 cols) --- */}
      <div className="lg:col-span-5 p-6 overflow-y-auto border-r border-gray-200 bg-gray-50/50">
        <div className="max-w-xl mx-auto space-y-6">
          
          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
             <div className="p-1.5 bg-blue-100 text-blue-700 rounded">
                <Sparkles size={16} />
             </div>
             <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Internal & AI Analysis</h3>
          </div>

          {/* Internal Cost Breakdown */}
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
             <h4 className="text-xs font-bold text-gray-400 uppercase mb-4 flex items-center gap-2">
                <Info size={12} /> Estimated Costs
             </h4>
             
             <div className="space-y-4">
                <div className="flex justify-between items-center text-sm">
                   <span className="text-gray-600">API Cost / Run</span>
                   <span className="font-mono font-medium text-gray-800">${internalData.apiCostPerRun.toFixed(3)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                   <span className="text-gray-600">Human Time / Run</span>
                   <div className="text-right">
                      <span className="font-mono font-medium text-gray-800 block">${humanCostPerRun.toFixed(3)}</span>
                      <span className="text-[10px] text-gray-400">({internalData.humanTimePerRun}m @ ${internalData.humanCostPerHr}/hr)</span>
                   </div>
                </div>
                <div className="h-px bg-gray-100" />
                <div className="flex justify-between items-center text-sm">
                   <span className="font-bold text-gray-700">Total Cost / Run</span>
                   <span className="font-mono font-bold text-gray-900">${totalInternalCostPerRun.toFixed(3)}</span>
                </div>
                
                <div className="bg-gray-50 rounded p-3 text-xs text-gray-500 flex justify-between items-center border border-gray-100">
                   <span>Est. Monthly Cost (5k runs)</span>
                   <span className="font-mono font-bold text-gray-700">${estMonthlyInternalCost.toFixed(2)}</span>
                </div>
             </div>
          </section>

          {/* AI Suggestions */}
          <section className="bg-blue-50/50 rounded-xl border border-blue-100 p-5">
             <h4 className="text-xs font-bold text-blue-600 uppercase mb-4 flex items-center gap-2">
                <Sparkles size={12} /> AI Suggestions
             </h4>

             <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="space-y-1">
                   <p className="text-[10px] font-bold text-blue-400 uppercase">Build Fee</p>
                   <p className="text-lg font-mono font-bold text-blue-900">${internalData.suggestedBuildFee}</p>
                </div>
                <div className="space-y-1">
                   <p className="text-[10px] font-bold text-blue-400 uppercase">Price / Result</p>
                   <p className="text-lg font-mono font-bold text-blue-900">${internalData.suggestedPricePerResult}</p>
                </div>
             </div>

             <div className="space-y-2">
                <p className="text-[10px] font-bold text-blue-400 uppercase">Suggested Volume Tiers</p>
                <div className="bg-white rounded border border-blue-100 overflow-hidden">
                   {internalData.suggestedTiers.map((t, i) => (
                      <div key={i} className="flex justify-between px-3 py-2 text-xs border-b border-blue-50 last:border-0 text-blue-800">
                         <span>{t.min.toLocaleString()} - {t.max ? t.max.toLocaleString() : '∞'}</span>
                         <span className="font-mono">{t.discount}% off</span>
                      </div>
                   ))}
                </div>
             </div>
          </section>

        </div>
      </div>

      {/* --- RIGHT COLUMN: CLIENT FACING (7 cols) --- */}
      <div className="lg:col-span-7 bg-white p-8 overflow-y-auto flex flex-col relative">
        
        <div className="max-w-2xl mx-auto w-full space-y-8 pb-20">
          
          {/* Header */}
          <div className="flex items-center justify-between">
             <div>
                <h2 className="text-xl font-bold text-[#0A0A0A]">Client Pricing</h2>
                <p className="text-xs text-gray-500 mt-1">Configure the final numbers the client will see.</p>
             </div>
             <div className="flex items-center gap-2">
                <Badge variant="outline" className={cn(
                   "border-none font-medium px-3 py-1",
                   status === 'Draft' ? "bg-amber-100 text-amber-700" :
                   status === 'Sent' ? "bg-purple-100 text-purple-700" : "bg-emerald-100 text-emerald-700"
                )}>
                   {status}
                </Badge>
             </div>
          </div>

          {/* Override Alert */}
          {isOverridden && (
             <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                   <AlertTriangle size={18} className="text-amber-600 mt-0.5" />
                   <div>
                      <h4 className="text-sm font-bold text-amber-900">Pricing Overridden</h4>
                      <p className="text-xs text-amber-700 mt-1">
                         Values differ from AI suggestions. Please add a note for the approval team.
                      </p>
                   </div>
                </div>
                <Textarea 
                   placeholder="Why did you override the suggested pricing?"
                   value={overrideNote}
                   onChange={(e) => setOverrideNote(e.target.value)}
                   className="bg-white border-amber-200 text-xs focus:border-amber-400 min-h-[60px]"
                />
             </div>
          )}

          {/* Fee Inputs */}
          <div className="grid grid-cols-2 gap-6">
             
             {/* Build Fee */}
             <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase flex justify-between">
                   Final Build Fee
                   {isBuildFeeOverridden && <span className="text-[10px] text-amber-600 font-normal flex items-center gap-1"><History size={10}/> Suggested: ${internalData.suggestedBuildFee}</span>}
                </label>
                <div className="relative">
                   <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                   <Input 
                      type="number"
                      value={buildFee}
                      onChange={(e) => setBuildFee(parseFloat(e.target.value))}
                      className={cn("pl-7 font-mono font-bold text-lg h-12", isBuildFeeOverridden ? "border-amber-300 bg-amber-50/30" : "border-gray-200")}
                   />
                </div>
             </div>

             {/* Per Result Price */}
             <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase flex justify-between">
                   Final Price / Result
                   {isPriceOverridden && <span className="text-[10px] text-amber-600 font-normal flex items-center gap-1"><History size={10}/> Suggested: ${internalData.suggestedPricePerResult}</span>}
                </label>
                <div className="relative">
                   <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                   <Input 
                      type="number"
                      step="0.001"
                      value={pricePerResult}
                      onChange={(e) => handlePriceChange(e.target.value)}
                      className={cn("pl-7 font-mono font-bold text-lg h-12", isPriceOverridden ? "border-amber-300 bg-amber-50/30" : "border-gray-200")}
                   />
                </div>
                <div className="flex justify-end">
                   <span className={cn("text-[10px] font-bold", marginPercent > 30 ? "text-emerald-600" : "text-red-500")}>
                      {marginPercent.toFixed(1)}% Gross Margin
                   </span>
                </div>
             </div>
          </div>

          {/* Volume Tiers Editor */}
          <div className="space-y-3 pt-4 border-t border-gray-100">
             <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-500 uppercase">Volume Discounts</label>
                <Button variant="ghost" size="sm" onClick={addTier} className="h-6 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                   <Plus size={12} className="mr-1" /> Add Tier
                </Button>
             </div>
             
             <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm text-left">
                   <thead className="bg-gray-50 text-xs uppercase text-gray-500 font-bold">
                      <tr>
                         <th className="px-4 py-3 w-[140px]">Min Vol</th>
                         <th className="px-4 py-3 w-[140px]">Max Vol</th>
                         <th className="px-4 py-3 w-[120px]">Discount %</th>
                         <th className="px-4 py-3 text-right">Final Price</th>
                         <th className="px-4 py-3 w-[40px]"></th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-gray-100">
                      {tiers.map((tier, i) => (
                         <tr key={tier.id} className="group hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-2">
                               <Input 
                                  type="number" 
                                  value={tier.min} 
                                  onChange={(e) => updateTier(tier.id, 'min', parseInt(e.target.value))}
                                  className="h-8 font-mono text-xs bg-white"
                               />
                            </td>
                            <td className="px-4 py-2">
                               <Input 
                                  type="number" 
                                  value={tier.max || ''} 
                                  placeholder="∞"
                                  onChange={(e) => updateTier(tier.id, 'max', e.target.value ? parseInt(e.target.value) : null)}
                                  className="h-8 font-mono text-xs bg-white"
                               />
                            </td>
                            <td className="px-4 py-2">
                               <div className="relative">
                                  <Input 
                                     type="number" 
                                     value={tier.discount} 
                                     onChange={(e) => updateTier(tier.id, 'discount', parseFloat(e.target.value))}
                                     className="h-8 font-mono text-xs bg-white pr-6"
                                  />
                                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">%</span>
                               </div>
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-gray-700 font-bold">
                               ${tier.price.toFixed(4)}
                            </td>
                            <td className="px-4 py-2 text-center">
                               <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => removeTier(tier.id)}
                                  className="h-6 w-6 text-gray-300 hover:text-red-500"
                               >
                                  <Trash2 size={12} />
                               </Button>
                            </td>
                         </tr>
                      ))}
                   </tbody>
                </table>
             </div>
          </div>

        </div>
        
        {/* Bottom Action Bar */}
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 px-8 flex justify-between items-center z-10">
           <div className="flex items-center gap-4">
              <Button variant="ghost" className="text-gray-500 hover:text-gray-900 gap-2">
                 <Eye size={16} /> Preview Client View
              </Button>
              <Button variant="ghost" className="text-gray-500 hover:text-gray-900 gap-2">
                 <Save size={16} /> Save Draft
              </Button>
           </div>
           
           <Button 
              className="bg-[#E43632] hover:bg-[#C12E2A] text-white font-bold shadow-lg shadow-red-500/20 gap-2 pl-6 pr-8"
              onClick={() => setStatus('Sent')}
           >
              <Send size={16} /> Generate & Send Quote
           </Button>
        </div>

      </div>
    </div>
  );
};
