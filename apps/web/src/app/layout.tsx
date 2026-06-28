import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { PWARegistry } from "@/components/pwa-registry";

const inter = Inter({ subsets: ["latin"] });

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "School Information System",
    description: "Multi-tenant school management platform",
    manifest: "/manifest.json",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className={inter.className} suppressHydrationWarning>
                <PWARegistry />
                {children}
            </body>
        </html>
    );
}
