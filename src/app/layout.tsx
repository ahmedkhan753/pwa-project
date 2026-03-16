import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { OfflineBanner } from "@/components/OfflineBanner";
import { DemoBanner } from "@/components/DemoBanner";
import "./globals.css";

const inter = Inter({
    subsets: ["latin", "latin-ext"],
    display: "swap",
    variable: "--font-inter",
});

export const metadata: Metadata = {
    title: "Zaufaj Rzeczoznawcy — System Inspekcji",
    description: "Profesjonalny system inspekcji pojazdów dla rzeczoznawców terenowych.",
    keywords: ["rzeczoznawca", "inspekcja pojazdu", "PWA", "Zaufaj Rzeczoznawcy"],
    manifest: "/manifest.json",
    appleWebApp: {
        capable: true,
        statusBarStyle: "black-translucent",
        title: "RZeczoznawcy",
    },
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#000000" },
        { media: "(prefers-color-scheme: dark)", color: "#000000" },
    ],
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="pl" className={inter.variable} suppressHydrationWarning>
            <body className="font-sans antialiased text-foreground bg-background transition-colors duration-300">
                <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem
                    disableTransitionOnChange
                >
                    <OfflineBanner />
                    <DemoBanner />
                    {children}
                </ThemeProvider>
            </body>
        </html>
    );
}
