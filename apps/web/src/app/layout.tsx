import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "sonner/dist/styles.css";
import { Toaster } from "sonner";
import { PWARegistry } from "@/components/pwa-registry";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "ScholarMind",
    description: "Multi-tenant school management platform",
    manifest: "/manifest.json",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className={inter.variable} suppressHydrationWarning>
            <body className="font-sans" suppressHydrationWarning>
                <PWARegistry />
                {children}
                <Toaster richColors position="top-right" closeButton />
            </body>
        </html>
    );
}
