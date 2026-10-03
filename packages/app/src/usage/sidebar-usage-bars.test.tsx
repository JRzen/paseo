/**
 * @vitest-environment jsdom
 */
import { act } from "@testing-library/react";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
});

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: () => null,
}));

// The meter's own drawing is the Usage screen's; this suite is about which bars appear and when.
vi.mock("./window-bar", () => ({ UsageMeter: () => null }));

const useUsageByHostMock = vi.hoisted(() => vi.fn());
vi.mock("./queries", () => ({ useUsageByHost: useUsageByHostMock }));

import type { UsageHostGroup } from "./model";
import { SidebarUsageBars } from "./sidebar-usage-bars";
import type { UsageReportEntry } from "./types";

function report(windows: { id: string; label: string; usedPct?: number }[]): UsageReportEntry {
  return {
    id: "claude:account-1",
    account: {},
    fetchedAt: "2026-01-01T00:00:00.000Z",
    sourceId: "claude",
    sourceLabel: "Claude",
    report: { status: "available", windows },
  } as UsageReportEntry;
}

function readyHost(reports: UsageReportEntry[]): UsageHostGroup {
  return {
    serverId: "srv",
    label: "srv",
    view: { kind: "ready", reports, isRefreshing: false },
  };
}

const noop = (): void => undefined;

let container: HTMLDivElement;
let root: Root;

function render(): void {
  act(() => {
    root.render(<SidebarUsageBars onPress={noop} />);
  });
}

beforeEach(() => {
  useUsageByHostMock.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("SidebarUsageBars", () => {
  it("polls usage every minute so the bars stay current", () => {
    useUsageByHostMock.mockReturnValue({ groups: [], refresh: vi.fn() });
    render();
    expect(useUsageByHostMock).toHaveBeenCalledWith({ pollMs: 60_000 });
  });

  it("draws a bar for each window, session and weekly", () => {
    useUsageByHostMock.mockReturnValue({
      groups: [
        readyHost([
          report([
            { id: "session", label: "Session", usedPct: 20 },
            { id: "weekly", label: "Weekly", usedPct: 80 },
          ]),
        ]),
      ],
      refresh: vi.fn(),
    });
    render();
    const bars = Array.from(container.querySelectorAll("[data-testid^='sidebar-usage-bar-']"));
    expect(bars.map((bar) => bar.getAttribute("aria-label"))).toEqual([
      "Claude · Session 20%",
      "Claude · Weekly 80%",
    ]);
  });

  it("takes no space until a host reports", () => {
    useUsageByHostMock.mockReturnValue({ groups: [], refresh: vi.fn() });
    render();
    expect(container.innerHTML).toBe("");
  });
});
