"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { currentUser } from "@/lib/mock-automations";
import { useState } from "react";

export default function SettingsPage() {
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveWorkspace = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      // TODO: Show success message
    }, 500);
  };

  const handleSaveUser = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      // TODO: Show success message
    }, 500);
  };
  return (
    <div className="flex-1 h-full overflow-y-auto bg-gray-50/50">
      <div className="max-w-[1200px] mx-auto p-6 md:p-10 space-y-8">
        <PageHeader title="Settings" subtitle="Manage your workspace and user preferences." />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Workspace Settings */}
          <SectionCard
            title="Workspace Settings"
            description="Configure your workspace preferences"
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="workspace-name">Workspace Name</Label>
                <Input
                  id="workspace-name"
                  placeholder="My Workspace"
                  defaultValue="WRK Workspace"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workspace-url">Workspace URL</Label>
                <Input
                  id="workspace-url"
                  placeholder="workspace-url"
                  defaultValue="wrk-workspace"
                />
              </div>
              <div className="flex items-center justify-between pt-2">
                <div className="space-y-0.5">
                  <Label>Enable Notifications</Label>
                  <p className="text-xs text-gray-500">Receive email notifications for updates</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Button className="w-full mt-4" onClick={handleSaveWorkspace} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </SectionCard>

          {/* User Settings */}
          <SectionCard title="User Settings" description="Manage your personal account settings">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="user-name">Full Name</Label>
                <Input id="user-name" placeholder="Your Name" defaultValue={currentUser.name} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-email">Email</Label>
                <Input
                  id="user-email"
                  type="email"
                  placeholder="your@email.com"
                  defaultValue={currentUser.email}
                />
              </div>
              <div className="flex items-center justify-between pt-2">
                <div className="space-y-0.5">
                  <Label>Dark Mode</Label>
                  <p className="text-xs text-gray-500">Toggle dark mode interface</p>
                </div>
                <Switch />
              </div>
              <Button className="w-full mt-4" onClick={handleSaveUser} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
