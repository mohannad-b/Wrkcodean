"use client";

import { useCallback } from "react";
import { toast } from "sonner";

export type ToastVariant = "default" | "success" | "error" | "warning";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

export function useToast() {
  return useCallback((options: ToastOptions) => {
    const { title, description, variant = "default", duration } = options;
    const toastArgs = { description, duration };

    if (variant === "success") {
      toast.success(title, toastArgs);
      return;
    }

    if (variant === "error") {
      toast.error(title, toastArgs);
      return;
    }

    if (variant === "warning") {
      if (typeof toast.warning === "function") {
        toast.warning(title, toastArgs);
      } else {
        toast(title, toastArgs);
      }
      return;
    }
    toast(title, toastArgs);
  }, []);
}

