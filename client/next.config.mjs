import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001",
  },
  webpack: (config) => {
    // `src/vendor/shared` is authored for NodeNext (the server consumes it as
    // ESM), so its barrel re-exports `./contracts/findings.js` — a specifier
    // whose file on disk is `.ts`. Every client import of that package used to
    // be `import type`, which TypeScript erases, so webpack was never asked to
    // resolve it and the gap stayed invisible; the first runtime import of a
    // value (`isUntrustedSkillSource`) turns it into
    // "Module not found: Can't resolve './contracts/findings.js'" and 500s
    // every page that transitively touches it.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default withNextIntl(nextConfig);
