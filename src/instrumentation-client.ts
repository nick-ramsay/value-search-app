import { datadogRum } from "@datadog/browser-rum";
import { nextjsPlugin, onRouterTransitionStart } from "@datadog/browser-rum-nextjs";

export { onRouterTransitionStart };

const applicationId = process.env.NEXT_PUBLIC_DATADOG_RUM_APPLICATION_ID;
const clientToken = process.env.NEXT_PUBLIC_DATADOG_RUM_CLIENT_TOKEN;

if (applicationId && clientToken) {
  datadogRum.init({
    applicationId,
    clientToken,
    site: process.env.NEXT_PUBLIC_DATADOG_SITE || "datadoghq.com",
    service: "value-search-app",
    env: process.env.NEXT_PUBLIC_DATADOG_ENV || process.env.NODE_ENV,
    version: process.env.NEXT_PUBLIC_APP_VERSION,
    sessionSampleRate: 100,
    sessionReplaySampleRate: 0,
    trackUserInteractions: true,
    trackResources: true,
    trackLongTasks: true,
    // Injects W3C tracecontext headers into same-origin fetch/XHR calls so the
    // frontend RUM view links up with the backend OpenTelemetry traces
    // (see src/instrumentation.ts) into one end-to-end trace in Datadog.
    allowedTracingUrls: [
      {
        match: (url: string) => url.startsWith(window.location.origin),
        propagatorTypes: ["tracecontext"],
      },
    ],
    plugins: [nextjsPlugin()],
  });
} else if (process.env.NODE_ENV !== "production") {
  console.info(
    "Datadog RUM disabled: set NEXT_PUBLIC_DATADOG_RUM_APPLICATION_ID and NEXT_PUBLIC_DATADOG_RUM_CLIENT_TOKEN to enable it."
  );
}
