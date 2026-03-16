import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const inter = Inter({
    subsets: ["latin", "latin-ext"],
    display: "swap",
    variable: "--font-inter",
});

export const metadata: Metadata = {
    title: "Auto Inspection PWA — Vehicle Inspector",
    description: "Professional vehicle inspection tool for field appraisers. Fast, offline-ready, mobile-first.",
    keywords: ["vehicle inspection", "car appraisal", "PWA", "auto inspection"],
    manifest: "/manifest.json",
    appleWebApp: {
        capable: true,
        statusBarStyle: "black-translucent",
        title: "Auto Inspection",
    },
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
        { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
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
                    {children}
                </ThemeProvider>
            </body>
        </html>
    );
}
