import posthog from "posthog-js";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

if (!projectToken || !posthogHost) {
  if (process.env.NODE_ENV === "development") {
    const missingVariable = projectToken
      ? "NEXT_PUBLIC_POSTHOG_HOST"
      : "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN";
    throw new Error(
      `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
    );
  }
} else {
  posthog.init(projectToken, {
    api_host: "/ingest",
    // The PostHog app itself, not the ingestion host. Used only to build
    // links back into PostHog (toolbar, session replay).
    ui_host: "https://eu.posthog.com",
    defaults: "2026-01-30",
    // PostHogProvider captures $pageview manually so it can wait for
    // Next's router. Leaving the automatic capture on double-counts.
    capture_pageview: false,
    // Must be explicit: the default is "if_capture_pageview", which resolves
    // to off because capture_pageview is false above.
    capture_pageleave: true,
    capture_exceptions: true,
    debug: process.env.NODE_ENV === "development",
  });
}
