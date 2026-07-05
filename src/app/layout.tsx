import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenChat Zen",
  description: "Mobile-first OpenCode chat client",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "OpenChat Zen",
    statusBarStyle: "default"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#148579"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <ServiceWorker />
        {children}
      </body>
    </html>
  );
}
