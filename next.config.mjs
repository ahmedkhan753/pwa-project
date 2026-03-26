/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    output: "standalone",
    async headers() {
        return [
            {
                // Prevent caching of HTML pages — always fetch fresh from server.
                // /_next/static/ chunks are content-hashed so they can be cached
                // indefinitely; only the HTML shell must stay fresh so browsers
                // always receive the latest JS bundle references after a deploy.
                source: '/((?!_next/static|_next/image|icons|images|favicon.ico).*)',
                headers: [
                    { key: 'Cache-Control', value: 'no-cache, must-revalidate' },
                ],
            },
        ];
    },
};

export default nextConfig;
