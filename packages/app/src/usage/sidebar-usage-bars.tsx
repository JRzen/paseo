// The default import is load-bearing under vitest: the app's `jsx: "react-native"` tsconfig
// leaves esbuild on the classic transform, so a rendered `.tsx` needs React in module scope.
import React, { memo, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { selectUsageBars, type UsageBar } from "./model";
import { useUsageByHost } from "./queries";
import { UsageMeter } from "./window-bar";

/**
 * How often the strip re-reads usage while the sidebar is up. The daemon caches each report for
 * five minutes, so polling faster would not show newer figures; this keeps a bar at most about six
 * minutes behind the source. Polling pauses while the window is hidden.
 */
const SIDEBAR_USAGE_POLL_MS = 60_000;

/**
 * Plan usage at a glance, at the foot of the sidebar: one thin bar per usage window (session,
 * weekly, ...) of every source,
 * drawn by the Usage screen's own `UsageMeter`, so it fills and colours exactly as that screen does. Bars only — the name and
 * figure are in each bar's tooltip, and pressing any bar opens the Usage screen.
 *
 * Renders nothing until a host has reported, so a host without usage support costs no space.
 * It re-reads every minute, so the bars track usage while you work.
 */
export const SidebarUsageBars = memo(function SidebarUsageBars({
  onPress,
}: {
  onPress: () => void;
}) {
  const { groups } = useUsageByHost({ pollMs: SIDEBAR_USAGE_POLL_MS });
  const bars = useMemo(() => selectUsageBars(groups), [groups]);

  if (bars.length === 0) {
    return null;
  }
  return (
    <View style={styles.strip} testID="sidebar-usage-bars">
      {bars.map((bar) => (
        <UsageBarRow key={bar.key} bar={bar} onPress={onPress} />
      ))}
    </View>
  );
});

const UsageBarRow = memo(function UsageBarRow({
  bar,
  onPress,
}: {
  bar: UsageBar;
  onPress: () => void;
}) {
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={bar.label}
          onPress={onPress}
          hitSlop={3}
          style={styles.hitArea}
          testID={`sidebar-usage-bar-${bar.key}`}
        >
          <UsageMeter usedPct={bar.usedPct} tone={bar.tone} />
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" offset={6}>
        <Text style={styles.tooltipText}>{bar.label}</Text>
      </TooltipContent>
    </Tooltip>
  );
});

const styles = StyleSheet.create((theme) => ({
  strip: {
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    paddingTop: theme.spacing[3],
  },
  hitArea: {
    paddingVertical: 2,
  },
  tooltipText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.popoverForeground,
  },
}));
