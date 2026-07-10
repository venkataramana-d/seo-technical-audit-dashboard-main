import type { Metadata } from "next";
import "./globals.css";
import { AuditProvider } from "@/lib/state/AuditContext";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "SEO Technical Audit Dashboard",
  description: "Enterprise-grade SEO technical audit tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AuditProvider>
          <AppShell>{children}</AppShell>
        </AuditProvider>
      </body>
    </html>
  );
}
