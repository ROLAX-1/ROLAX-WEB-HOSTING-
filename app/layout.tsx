import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/Toaster";
import BotWorker from "@/components/BotWorker";

export const metadata: Metadata = {
  title: "ROLAX HOST - Host Python, Node.js & HTML at Lightning Speed",
  description: "Premium hosting platform for Python, Node.js and HTML projects. Deploy at lightning speed with ROLAX HOST.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-black text-white">
        {children}
        <BotWorker />
        <Toaster />
      </body>
    </html>
  );
}
