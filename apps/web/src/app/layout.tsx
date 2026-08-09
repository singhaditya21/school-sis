import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "@school-sis/design-tokens/tokens.css";
import "./globals.css";
import "sonner/dist/styles.css";
import { Toaster } from "sonner";
import { PWARegistry } from "@/components/pwa-registry";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "ScholarMind",
    description: "Governed school operations for education groups.",
    manifest: "/manifest.json",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className={`${inter.variable} ${geistMono.variable} font-sans`} suppressHydrationWarning>
                <PWARegistry />
                {children}
                <Toaster richColors position="top-right" closeButton />
            </body>
        </html>
    );
}
