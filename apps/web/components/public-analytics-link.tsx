"use client";

import type { ComponentProps } from "react";
import { trackPublicAnalyticsClick } from "./public-analytics";
import type { PublicAnalyticsClickName } from "../lib/public-analytics-v2";

type Props = ComponentProps<"a"> & { analyticsEvent: PublicAnalyticsClickName };
// Only explicitly selected links use this handler. No document-wide listeners.
export function PublicAnalyticsLink({ analyticsEvent, onClick, ...props }: Props) {
  return <a {...props} onClick={(event)=>{
    onClick?.(event);
    if (!event.defaultPrevented) trackPublicAnalyticsClick(analyticsEvent);
  }} />;
}
