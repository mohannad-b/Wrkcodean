import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface MetricConfigModalsProps {
  showManualTimeModal: boolean;
  setShowManualTimeModal: (open: boolean) => void;
  showHourlyRateModal: boolean;
  setShowHourlyRateModal: (open: boolean) => void;
  metricForm: { manualMinutes: string; hourlyRate: string };
  setMetricForm: (next: { manualMinutes: string; hourlyRate: string }) => void;
  savingMetricConfig: boolean;
  onSaveMetricConfig: (payload: { manualMinutes?: number; hourlyRate?: number }) => void;
}

export function MetricConfigModals({
  showManualTimeModal,
  setShowManualTimeModal,
  showHourlyRateModal,
  setShowHourlyRateModal,
  metricForm,
  setMetricForm,
  savingMetricConfig,
  onSaveMetricConfig,
}: MetricConfigModalsProps) {
  return (
    <>
      <Dialog open={showManualTimeModal} onOpenChange={setShowManualTimeModal}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>Configure manual effort per run</DialogTitle>
            <DialogDescription>
              This feeds Hours Saved and Est. Cost Savings. We refresh calculations daily once runs are reported.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="manualMinutes">Minutes per run (manual process)</Label>
              <Input
                id="manualMinutes"
                type="number"
                min={0}
                step={1}
                value={metricForm.manualMinutes}
                onChange={(e) => setMetricForm({ ...metricForm, manualMinutes: e.target.value })}
              />
              <p className="text-xs text-gray-500">Example: If a human takes 7 minutes to do this task.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowManualTimeModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                onSaveMetricConfig({
                  manualMinutes: Number(metricForm.manualMinutes || 0),
                })
              }
              disabled={savingMetricConfig}
            >
              {savingMetricConfig ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showHourlyRateModal} onOpenChange={setShowHourlyRateModal}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>Configure hourly salary</DialogTitle>
            <DialogDescription>
              Used to translate hours saved into estimated cost savings for your team.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="hourlyRate">Hourly salary (USD)</Label>
              <Input
                id="hourlyRate"
                type="number"
                min={0}
                step={1}
                value={metricForm.hourlyRate}
                onChange={(e) => setMetricForm({ ...metricForm, hourlyRate: e.target.value })}
              />
              <p className="text-xs text-gray-500">Average hourly fully-loaded cost of the role doing this work.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowHourlyRateModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                onSaveMetricConfig({
                  hourlyRate: Number(metricForm.hourlyRate || 0),
                })
              }
              disabled={savingMetricConfig}
            >
              {savingMetricConfig ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
