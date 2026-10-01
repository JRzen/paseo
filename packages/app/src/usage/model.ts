import { formatCompactTimeAgoAsProse } from "@/utils/time";
import { usageCopy } from "./copy";
import { clampPct, formatPct } from "./format";
import { deriveTone } from "./tone";
import type { UsageReport, UsageReportEntry, UsageTone, UsageView, UsageWindow } from "./types";

export function usedPercent(window: UsageWindow): number | null {
  if (window.usedPct != null) return window.usedPct;
  if (window.remainingPct != null) return 100 - window.remainingPct;
  return null;
}

/** The window the source marked as its headline. Sources own that choice; there is no fallback. */
export function headlineWindow(report: UsageReport): UsageWindow | null {
  return report.windows.find((window) => window.headline === true) ?? null;
}

export interface UsagePill {
  icon: string | null;
  sourceLabel: string;
  /** Headline percent, else the plan label, else nothing beside the icon. */
  text: string | null;
}

export function resolveUsagePill(input: {
  supportsUsage: boolean;
  entry: UsageReportEntry | null | undefined;
}): UsagePill | null {
  const { supportsUsage, entry } = input;
  if (!supportsUsage || !entry) return null;
  const window = headlineWindow(entry.report);
  const percent = window ? usedPercent(window) : null;
  return {
    icon: entry.icon ?? null,
    sourceLabel: entry.sourceLabel,
    text:
      percent != null
        ? `${Math.round(Math.max(0, Math.min(100, percent)))}%`
        : (entry.report.planLabel ?? null),
  };
}

/** When a report was fetched, from its compact relative time: "Updated 3m ago". */
export function formatUsageFreshness(compactTimeAgo: string): string {
  return `${usageCopy.updated} ${formatCompactTimeAgoAsProse(compactTimeAgo)}`;
}

/** A user-requested refresh of one report. The previous report stays on screen throughout. */
export type UsageRefresh = "idle" | "pending" | "failed";

export function resolveUsageRefresh(mutation: {
  isPending: boolean;
  error: unknown;
}): UsageRefresh {
  if (mutation.isPending) return "pending";
  if (mutation.error) return "failed";
  return "idle";
}

/**
 * A host's report list with one report swapped for its refreshed copy, in place.
 * `null` means the daemon no longer knows the ID, so the report leaves the list.
 */
export function replaceReport(
  reports: readonly UsageReportEntry[],
  reportId: string,
  refreshed: UsageReportEntry | null,
): UsageReportEntry[] {
  if (!refreshed) return reports.filter((report) => report.id !== reportId);
  return reports.map((report) => (report.id === reportId ? refreshed : report));
}

export interface UsageQueryState {
  data: UsageReportEntry[] | undefined;
  error: unknown;
  isFetching: boolean;
}

export function resolveUsageView(input: {
  isConnected: boolean;
  supportsUsage: boolean;
  query: UsageQueryState | undefined;
}): UsageView {
  const { isConnected, supportsUsage, query } = input;
  if (!isConnected) return { kind: "unavailable", message: usageCopy.hostUnavailable };
  if (!supportsUsage) return { kind: "unavailable", message: usageCopy.hostUpgradeRequired };
  if (query?.data) {
    return { kind: "ready", reports: query.data, isRefreshing: query.isFetching };
  }
  if (query?.error) {
    return {
      kind: "error",
      message: query.error instanceof Error ? query.error.message : String(query.error),
    };
  }
  return { kind: "loading" };
}

export interface UsageHost {
  serverId: string;
  label: string;
  isConnected: boolean;
  supportsUsage: boolean;
}

export interface UsageHostGroup {
  serverId: string;
  label: string;
  view: UsageView;
}

/** One group per connected host, in host order. */
export function groupUsageByHost(
  hosts: readonly UsageHost[],
  queries: ReadonlyMap<string, UsageQueryState>,
): UsageHostGroup[] {
  return hosts
    .filter((host) => host.isConnected)
    .map((host) => ({
      serverId: host.serverId,
      label: host.label,
      view: resolveUsageView({
        isConnected: true,
        supportsUsage: host.supportsUsage,
        query: queries.get(host.serverId),
      }),
    }));
}

export interface UsageBar {
  /** Host, report and window, so a source's session and weekly bars never collide. */
  key: string;
  /** Names the bar where it has no visible label: "Claude · Session 42%". */
  label: string;
  /** Clamped to 0–100, ready to size the fill. */
  usedPct: number;
  /** The same rule the Usage screen's bars use: the source's tone, else the derived one. */
  tone: UsageTone;
}

/**
 * One bar per usage window with a percentage — session, weekly and so on — for every report
 * across every host that has reported, in the order the Usage screen lists them. Hosts still
 * loading, failed or unsupported contribute nothing rather than a placeholder: the strip is a
 * glance, and the Usage screen is where those states are explained.
 */
export function selectUsageBars(groups: readonly UsageHostGroup[]): UsageBar[] {
  const readyGroups = groups.filter((group) => group.view.kind === "ready");
  const nameHosts = readyGroups.length > 1;
  const bars: UsageBar[] = [];
  for (const group of readyGroups) {
    if (group.view.kind !== "ready") continue;
    for (const entry of group.view.reports) {
      const source = nameHosts ? `${group.label} · ${entry.sourceLabel}` : entry.sourceLabel;
      entry.report.windows.forEach((window, index) => {
        const percent = usedPercent(window);
        if (percent == null) return;
        bars.push({
          key: `${group.serverId}:${entry.id}:${window.id ?? index}`,
          label: `${source} · ${window.label} ${formatPct(percent)}`,
          usedPct: clampPct(percent),
          tone: window.tone ?? deriveTone(percent),
        });
      });
    }
  }
  return bars;
}
