import { PostHog } from "posthog-node";

export default function PostHogClient() {
  const posthogClient = new PostHog(
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!,
    {
      host: "https://eu.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    },
  );
  return posthogClient;
}
