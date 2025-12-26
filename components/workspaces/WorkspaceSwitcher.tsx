"use client";

import React, { useMemo, useState } from "react";
import { ChevronsUpDown, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Badge } from "@/components/ui/badge";
import { useActiveWorkspace } from "@/lib/workspaces/useActiveWorkspace";

type Props = {
  compact?: boolean;
  onSwitched?: (name: string) => void;
  onError?: (message: string) => void;
};

export default function WorkspaceSwitcher({ compact = false, onSwitched, onError }: Props) {
  const { activeWorkspace, memberships, setActiveWorkspace, isLoading, error } = useActiveWorkspace();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return memberships;
    return memberships.filter((m) => m.tenantName.toLowerCase().includes(search.toLowerCase()));
  }, [memberships, search]);

  if (memberships.length <= 1 && activeWorkspace && compact) {
    return (
      <Button variant="ghost" size="sm" className="gap-2 text-sm" disabled>
        {activeWorkspace.tenantName} <Badge variant="secondary">{activeWorkspace.role}</Badge>
      </Button>
    );
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <Button variant="outline" size={compact ? "sm" : "default"} className="w-full justify-between">
          <span className="truncate">
            {activeWorkspace ? activeWorkspace.tenantName : isLoading ? "Loading..." : "Select workspace"}
          </span>
          <ChevronsUpDown size={16} className="ml-2 shrink-0 opacity-50" />
        </Button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Content className="p-0 w-72 bg-white text-slate-900 rounded-md border shadow-lg outline-hidden z-50">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search workspaces..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>No workspaces found.</CommandEmpty>
            <CommandGroup>
              {filtered.map((workspace) => {
                const suspended = false;
                return (
                  <CommandItem
                    key={workspace.tenantId}
                    value={workspace.tenantId}
                    className="justify-between"
                    disabled={suspended || isLoading}
                    onSelect={async () => {
                      setOpen(false);
                      await setActiveWorkspace(workspace.tenantId);
                      if (error && onError) onError(error);
                      if (onSwitched) onSwitched(workspace.tenantName);
                    }}
                  >
                    <div className="flex flex-col">
                      <span>{workspace.tenantName}</span>
                      <span className="text-xs text-muted-foreground capitalize">{workspace.role}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {suspended && <AlertTriangle size={14} className="text-amber-500" />}
                      {activeWorkspace?.tenantId === workspace.tenantId && <Check size={16} />}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Root>
  );
}

