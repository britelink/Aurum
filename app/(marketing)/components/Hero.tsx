import AurumButton from "@/components/AurumButton";
import React from "react";
import MarketChart from "./MarketChart";
import Link from "next/link";

interface HeroProps {
  title: string;
  subtitle: string;
  ctaText?: string;
  ctaAction?: () => void;
  secondaryCta?: string;
  secondaryCtaAction?: () => void;
  showChart?: boolean;
}

export default function Hero({
  title,
  subtitle,
  ctaText = "Start Playing",
  ctaAction,
  secondaryCta,
  secondaryCtaAction,
  showChart = true,
}: HeroProps) {
  return (
    <div className="relative bg-gradient-to-br from-blue-800 via-blue-900 to-slate-900 text-white py-20 px-6 overflow-hidden h-screen">
      {/* Background elements */}
      <div className="absolute inset-0 z-0">
        {/* Chart-like grid lines */}
        <div className="absolute inset-0 bg-grid-white/[0.05]"></div>

        {/* Abstract data visualization elements */}
        <div className="absolute top-1/4 right-1/4 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/3 left-1/3 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/4 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Hero Content */}
          <div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-blue-200 via-white to-amber-300">
              {title}
            </h1>

            <p className="text-xl text-blue-100 mb-8">{subtitle}</p>

            <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
              <Link href="/play">
                <AurumButton
                  variant="primary"
                  size="lg"
                  onClick={ctaAction}
                  className="bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-blue-900 border-0"
                >
                  {ctaText}
                </AurumButton>
              </Link>

              {secondaryCta && (
                <Link href="/demo">
                  <AurumButton
                    variant="outline"
                    size="lg"
                    onClick={secondaryCtaAction}
                    className="border-blue-300 text-blue-100 hover:bg-blue-800/50"
                  >
                    {secondaryCta}
                  </AurumButton>
                </Link>
              )}
            </div>

            {/* Market metrics */}
            <div className="grid grid-cols-3 gap-4 mt-10">
              <div className="bg-blue-900/50 backdrop-blur-sm border border-blue-500/20 p-3 rounded-md">
                <div className="text-xs text-blue-300">Success Rate</div>
                <div className="text-xl font-bold text-white">85%</div>
              </div>
              <div className="bg-blue-900/50 backdrop-blur-sm border border-blue-500/20 p-3 rounded-md">
                <div className="text-xs text-blue-300">Avg. Return</div>
                <div className="text-xl font-bold text-white">180%</div>
              </div>
              <div className="bg-blue-900/50 backdrop-blur-sm border border-blue-500/20 p-3 rounded-md">
                <div className="text-xs text-blue-300">Trade Cycle</div>
                <div className="text-xl font-bold text-white">15s</div>
              </div>
            </div>
          </div>

          {/* Chart section */}
          {showChart && (
            <div className="hidden lg:block">
              <MarketChart />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
