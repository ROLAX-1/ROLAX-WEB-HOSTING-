"use client";
import { useEffect } from "react";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import Pricing from "@/components/Pricing";
import FAQ from "@/components/FAQ";
import Footer from "@/components/Footer";
import OfferStrip, { OfferBanner } from "@/components/OfferStrip";
import { useStore } from "@/lib/store";

export default function Home() {
  const hydrate = useStore((s) => s.hydrate);
  useEffect(() => { hydrate(); }, [hydrate]);

  return (
    <main className="min-h-screen bg-black">
      <OfferBanner />
      <Navbar />
      <Hero />
      <OfferStrip />
      <Features />
      <Pricing />
      <FAQ />
      <Footer />
    </main>
  );
}
