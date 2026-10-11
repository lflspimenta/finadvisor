import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FinAdvisor — Gestão Financeira Inteligente",
  description: "Plataforma de gestão financeira para PMEs portuguesas com IA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt">
      <body className="min-h-screen" style={{ background: '#0f0f0f', color: '#f0f0f0' }}>
        {children}
      </body>
    </html>
  );
}
