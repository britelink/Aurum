import AurumButton from "@/components/AurumButton";
import React from "react";

interface HeroProps {
  title: string;
  subtitle: string;
  ctaText?: string;
  ctaAction?: () => void;
  secondaryCta?: string;
  secondaryCtaAction?: () => void;
}

export default function Hero({
  title,
  subtitle,
  ctaText = "Start Trading",
  ctaAction,
  secondaryCta,
  secondaryCtaAction,
}: HeroProps) {
  return (
    <div className="relative bg-navy-900 text-white py-32 px-6 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-navy-900 via-navy-800 to-navy-900 opacity-90"></div>

      {/* Abstract gold patterns */}
      <div className="absolute top-0 right-0 w-1/2 h-full opacity-10">
        <div className="absolute right-0 top-0 w-96 h-96 rounded-full bg-gold-500 filter blur-3xl"></div>
        <div className="absolute right-1/4 bottom-1/4 w-64 h-64 rounded-full bg-gold-400 filter blur-2xl"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto">
        <div className="max-w-3xl">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-bold mb-6">
            {title.split(" ").map((word, index) => (
              <React.Fragment key={index}>
                {index > 0 && " "}
                {index % 3 === 1 ? (
                  <span className="text-gradient">{word}</span>
                ) : (
                  word
                )}
              </React.Fragment>
            ))}
          </h1>

          <p className="text-xl text-gray-300 mb-8">{subtitle}</p>

          <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
            <AurumButton variant="primary" size="lg" onClick={ctaAction}>
              {ctaText}
            </AurumButton>

            {secondaryCta && (
              <AurumButton
                variant="outline"
                size="lg"
                onClick={secondaryCtaAction}
              >
                {secondaryCta}
              </AurumButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
