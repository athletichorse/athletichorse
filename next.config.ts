import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Version-skew protection: a tab still running an older deployment reloads itself
  // instead of having buttons and links silently fail after an update goes live.
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || undefined,
};

export default nextConfig;
