/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep standalone/runtime artifacts rooted in this application even when a
  // release worktree is nested beneath another repository with a lockfile.
  outputFileTracingRoot: __dirname,
};

module.exports = nextConfig;
