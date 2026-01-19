import { CheckCircle2, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ProceedingModalsProps {
  showProceedCelebration: boolean;
  setShowProceedCelebration: (open: boolean) => void;
  showPricingModal: boolean;
  setShowPricingModal: (open: boolean) => void;
}

export function ProceedingModals({
  showProceedCelebration,
  setShowProceedCelebration,
  showPricingModal,
  setShowPricingModal,
}: ProceedingModalsProps) {
  return (
    <>
      <Dialog open={showProceedCelebration} onOpenChange={setShowProceedCelebration}>
        <DialogContent className="max-w-sm text-center bg-white">
          <DialogHeader>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 animate-bounce">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <DialogTitle className="mt-3 text-xl">Submitted for build</DialogTitle>
            <DialogDescription className="text-sm text-gray-600">
              We’re moving your automation to the next step. Sit tight while we get pricing started.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <Dialog open={showPricingModal} onOpenChange={setShowPricingModal}>
        <DialogContent className="max-w-sm text-center bg-white">
          <DialogHeader>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600 animate-pulse">
              <Clock className="h-8 w-8" />
            </div>
            <DialogTitle className="mt-3 text-xl">Pricing in progress</DialogTitle>
            <DialogDescription className="text-sm text-gray-600">
              This should only take a couple of minutes. We’ll update the build status as soon as it’s ready.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}
