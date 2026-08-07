import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Clarity B2B — Supply Chain Finance Platform",
  description:
    "Real-time invoice management, supply chain financing, and enterprise-grade payment processing for B2B suppliers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="h-full antialiased" style={{ fontFamily: "var(--font-inter, Inter, sans-serif)" }}>
        <div className="flex h-full">
          {/* Sidebar */}
          <Sidebar />

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col ml-[250px] min-h-screen"
            style={{ backgroundColor: "var(--page-bg)" }}
          >
            <Header />
            <main className="flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
