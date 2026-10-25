import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page is private and uncached, so no incremental cache is configured.
export default defineCloudflareConfig({});
