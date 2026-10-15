import type { NextConfig } from 'next'

type RemotePatterns = NonNullable<NonNullable<NextConfig['images']>['remotePatterns']>

/** Catalog images live in Supabase Storage; next/image refuses unlisted remote hosts. */
function supabaseImageHost(): RemotePatterns {
  return hostPattern(process.env.NEXT_PUBLIC_SUPABASE_URL, '/storage/v1/object/public/**')
}

function hostPattern(url: string | undefined, pathname: string): RemotePatterns {
  if (!url) {
    return []
  }

  try {
    const { protocol, hostname } = new URL(url)

    return [
      {
        protocol: protocol.replace(':', '') as 'http' | 'https',
        hostname,
        pathname,
      },
    ]
  } catch {
    // env.ts fails the build on a malformed URL; this only has to not throw.
    return []
  }
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseImageHost(),
  },

  /**
   * Payment proofs are allowed up to 5 MB and ride to the server inside a
   * server action, whose body defaults to a 1 MB cap — a phone screenshot would
   * be refused by the framework before any of our own validation ran. Sized
   * just above MAX_PROOF_BYTES so the message a guest sees is ours.
   */
  experimental: {
    serverActions: {
      bodySizeLimit: '6mb',
    },
  },

  /**
   * Defence in depth for a site that renders club-supplied text and images.
   * A full CSP needs per-request nonces for Next's inline hydration scripts,
   * which is a larger change; these are the headers that carry their weight
   * without one.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // The app frames nothing and should be framed by nothing.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Booking references must not ride along to third-party hosts.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ]
  },
}

export default nextConfig
