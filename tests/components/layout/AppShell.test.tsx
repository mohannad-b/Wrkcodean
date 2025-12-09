import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShellClient } from "@/components/layout/AppShellClient";

// Mock next/navigation
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({
    push: pushMock,
  }),
}));

// Mock user profile provider to avoid network fetch
vi.mock("@/components/providers/user-profile-provider", () => ({
  UserProfileProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useUserProfile: () => ({ profile: null, isHydrating: false }),
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("AppShellClient", () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    const mockStorage = {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = String(value);
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        Object.keys(store).forEach((key) => delete store[key]);
      }),
    };
    Object.defineProperty(window, "localStorage", {
      value: mockStorage,
      writable: true,
    });
    pushMock.mockClear();
  });

  it("renders without crashing", () => {
    render(
      <AppShellClient initialProfile={null} initialLastUpdatedAt={null}>
        <div>Test Content</div>
      </AppShellClient>
    );
  });

  it("renders sidebar and main content", () => {
    render(
      <AppShellClient initialProfile={null} initialLastUpdatedAt={null}>
        <div>Test Content</div>
      </AppShellClient>
    );

    // Check that main content is rendered
    const main = screen.getByRole("main");
    expect(main).toBeInTheDocument();
    expect(main).toHaveTextContent("Test Content");
  });

  it("applies correct layout classes", () => {
    const { container } = render(
      <AppShellClient initialProfile={null} initialLastUpdatedAt={null}>
        <div>Test</div>
      </AppShellClient>
    );

    const shell = container.firstChild;
    expect(shell).toHaveClass("h-screen", "bg-[#F5F5F5]");
  });

  it("restores collapsed sidebar state from localStorage", async () => {
    window.localStorage.setItem("wrk:sidebar-collapsed", "true");
    render(
      <AppShellClient initialProfile={null} initialLastUpdatedAt={null}>
        <div>Test Content</div>
      </AppShellClient>
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Expand sidebar")).toBeInTheDocument();
    });
  });

  it("persists sidebar state changes to localStorage", async () => {
    const setItemSpy = vi.spyOn(window.localStorage, "setItem");
    const user = userEvent.setup();

    render(
      <AppShellClient initialProfile={null} initialLastUpdatedAt={null}>
        <div>Test Content</div>
      </AppShellClient>
    );

    await waitFor(() => expect(screen.getByLabelText("Collapse sidebar")).toBeInTheDocument());
    await waitFor(() => expect(setItemSpy).toHaveBeenCalledWith("wrk:sidebar-collapsed", "false"));
    setItemSpy.mockClear();

    await user.click(screen.getByLabelText("Collapse sidebar"));
    await waitFor(() => expect(screen.getByLabelText("Expand sidebar")).toBeInTheDocument());
    expect(setItemSpy).toHaveBeenCalledWith("wrk:sidebar-collapsed", "true");
  });
});
