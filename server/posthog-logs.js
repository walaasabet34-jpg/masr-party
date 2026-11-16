import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';

const host = process.env.POSTHOG_HOST;
const projectToken = process.env.POSTHOG_PROJECT_TOKEN;
const missingConfigMessage = (name) => `${name} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${name} is configured`;

let provider;
export let posthogLogger = { emit() {} };

if (!host || !projectToken) {
  if (process.env.NODE_ENV !== 'production') {
    if (!host) console.warn(missingConfigMessage('POSTHOG_HOST'));
    if (!projectToken) console.warn(missingConfigMessage('POSTHOG_PROJECT_TOKEN'));
  }
} else {
  provider = new LoggerProvider({
    resource: resourceFromAttributes({
      'service.name': 'masr-party-server',
      'service.version': '0.3.0',
      'deployment.environment': process.env.NODE_ENV ?? 'development',
    }),
    processors: [
      new BatchLogRecordProcessor(
        new OTLPLogExporter({
          url: new URL('/i/v1/logs', host).toString(),
          headers: { Authorization: `Bearer ${projectToken}` },
        }),
      ),
    ],
  });
  posthogLogger = provider.getLogger('masr-party.posthog');
}

export async function shutdownPosthogLogs() {
  if (!provider) return;
  const timeout = new Promise((resolve) => {
    const timer = setTimeout(resolve, 2000);
    timer.unref();
  });
  try {
    await Promise.race([provider.forceFlush(), timeout]);
  } catch {
    // Log delivery must never affect process shutdown.
  }
}
