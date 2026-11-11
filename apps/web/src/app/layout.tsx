import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import "sonner/dist/styles.css";
import { Toaster } from "sonner";
import { PWARegistry } from "@/components/pwa-registry";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const jakarta = Plus_Jakarta_Sans({
    subsets: ["latin"],
    variable: "--font-display",
    weight: ["600", "700", "800"],
    display: "swap",
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "ScholarMind",
    description: "Institutional finance control & school operating system",
    manifest: "/manifest.json",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className={`${inter.variable} ${jakarta.variable}`} suppressHydrationWarning>
            <body className="font-sans" suppressHydrationWarning>
                <PWARegistry />
                {children}
                <Toaster richColors position="top-right" closeButton />
            </body>
        </html>
    );
}
