"use client";

import { useState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Plus, Trash2, Save, Send, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminProject } from "@/lib/admin-mock";

interface VolumeTier {
  id: string;
  min: number;
  max: number | null;
  discount: number;
  price: number;
}

interface PricingOverridePanelProps {
  project: AdminProject;
  onSave?: (pricing: { setupFee: number; unitPrice: number; tiers: VolumeTier[] }) => void;
}

export function PricingOverridePanel({ project, onSave }: PricingOverridePanelProps) {
  const [setupFee, setSetupFee] = useState(project.setupFee || 1000);
  const [unitPrice, setUnitPrice] = useState(project.unitPrice || 0.045);
  const [tiers, setTiers] = useState<VolumeTier[]>([
    { id: "1", min: 0, max: 2500, discount: 0, price: unitPrice },
    { id: "2", min: 2500, max: 10000, discount: 10, price: unitPrice * 0.9 },
  ]);
  const [overrideNote, setOverrideNote] = useState("");

  const suggestedSetupFee = 1200;
  const suggestedUnitPrice = 0.045;
  const isBuildFeeOverridden = setupFee !== suggestedSetupFee;
  const isPriceOverridden = unitPrice !== suggestedUnitPrice;
  const isOverridden = isBuildFeeOverridden || isPriceOverridden;

  const handlePriceChange = (val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num)) {
      setUnitPrice(num);
      setTiers((prev) =>
        prev.map((t) => ({
          ...t,
          price: num * (1 - t.discount / 100),
        }))
      );
    }
  };

  const updateTier = (id: string, field: keyof VolumeTier, value: number | null) => {
    setTiers((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const updated = { ...t, [field]: value };
        if (field === "discount") {
          updated.price = unitPrice * (1 - (value as number) / 100);
        }
        return updated;
      })
    );
  };

  const addTier = () => {
    const lastTier = tiers[tiers.length - 1];
    const newMin = lastTier.max ? lastTier.max : lastTier.min + 10000;
    setTiers([
      ...tiers,
      {
        id: Math.random().toString(36).substr(2, 9),
        min: newMin,
        max: null,
        discount: 0,
        price: unitPrice,
      },
    ]);
  };

  const removeTier = (id: string) => {
    setTiers((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="space-y-6">
      <SectionCard title="Pricing Configuration" className="p-6">
        {isOverridden && (
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 mb-6 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="text-amber-600 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-amber-900">Pricing Overridden</h4>
                <p className="text-xs text-amber-700 mt-1">
                  Values differ from AI suggestions. Please add a note for the approval team.
                </p>
              </div>
            </div>
            <textarea
              placeholder="Why did you override the suggested pricing?"
              value={overrideNote}
              onChange={(e) => setOverrideNote(e.target.value)}
              className="bg-white border-amber-200 text-xs focus:border-amber-400 min-h-[60px] rounded p-2 resize-none"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-6 mb-6">
          <div className="space-y-2">
            <Label className="text-xs font-bold text-gray-500 uppercase flex justify-between">
              Final Build Fee
              {isBuildFeeOverridden && (
                <span className="text-[10px] text-amber-600 font-normal">
                  Suggested: ${suggestedSetupFee}
                </span>
              )}
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
              <Input
                type="number"
                value={setupFee}
                onChange={(e) => setSetupFee(parseFloat(e.target.value) || 0)}
                className={cn(
                  "pl-7 font-mono font-bold text-lg h-12",
                  isBuildFeeOverridden ? "border-amber-300 bg-amber-50/30" : "border-gray-200"
                )}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold text-gray-500 uppercase flex justify-between">
              Final Price / Result
              {isPriceOverridden && (
                <span className="text-[10px] text-amber-600 font-normal">
                  Suggested: ${suggestedUnitPrice}
                </span>
              )}
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
              <Input
                type="number"
                step="0.001"
                value={unitPrice}
                onChange={(e) => handlePriceChange(e.target.value)}
                className={cn(
                  "pl-7 font-mono font-bold text-lg h-12",
                  isPriceOverridden ? "border-amber-300 bg-amber-50/30" : "border-gray-200"
                )}
              />
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold text-gray-500 uppercase">Volume Discounts</Label>
            <Button variant="ghost" size="sm" onClick={addTier} className="h-6 text-xs text-blue-600">
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
                {tiers.map((tier) => (
                  <tr key={tier.id} className="group hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        value={tier.min}
                        onChange={(e) => updateTier(tier.id, "min", parseInt(e.target.value) || 0)}
                        className="h-8 font-mono text-xs bg-white"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        value={tier.max || ""}
                        placeholder="∞"
                        onChange={(e) =>
                          updateTier(tier.id, "max", e.target.value ? parseInt(e.target.value) : null)
                        }
                        className="h-8 font-mono text-xs bg-white"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <div className="relative">
                        <Input
                          type="number"
                          value={tier.discount}
                          onChange={(e) => updateTier(tier.id, "discount", parseFloat(e.target.value) || 0)}
                          className="h-8 font-mono text-xs bg-white pr-6"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                          %
                        </span>
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

        <div className="flex items-center justify-between pt-6 border-t border-gray-100 mt-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" className="text-gray-500 hover:text-gray-900 gap-2">
              <Eye size={16} /> Preview Client View
            </Button>
            <Button variant="ghost" className="text-gray-500 hover:text-gray-900 gap-2">
              <Save size={16} /> Save Draft
            </Button>
          </div>

          <Button
            className="bg-[#E43632] hover:bg-[#C12E2A] text-white font-bold gap-2"
            onClick={() => onSave?.({ setupFee, unitPrice, tiers })}
          >
            <Send size={16} /> Generate & Send Quote
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
