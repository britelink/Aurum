"use client";
import AurumButton from "@/components/AurumButton";
import React, { useEffect, useState } from "react";

export default function PriceSimulator() {
  const [position, setPosition] = useState(0);
  const [direction, setDirection] = useState(1);
  const [countDown, setCountDown] = useState(10);
  const [isActive, setIsActive] = useState(true);
  const [selectedBet, setSelectedBet] = useState<"up" | "down" | null>(null);
  const [betAmount, setBetAmount] = useState<1 | 2>(1);
  const [result, setResult] = useState<"win" | "lose" | null>(null);

  // Simulate price movement
  useEffect(() => {
    const timer = setInterval(() => {
      if (isActive) {
        setPosition((prev) => {
          // Random movement with bias based on direction
          const newPos = prev + direction * (Math.random() * 2 - 0.5);

          // Bounce if hitting boundaries
          if (newPos > 8 || newPos < -8) {
            setDirection(-direction);
            return prev;
          }

          return newPos;
        });

        setCountDown((prev) => {
          if (prev <= 1) {
            // End of active period
            setIsActive(false);

            // Determine win/lose
            if (selectedBet) {
              if (
                (selectedBet === "up" && position > 0) ||
                (selectedBet === "down" && position < 0)
              ) {
                setResult("win");
              } else if (position !== 0) {
                setResult("lose");
              }
            }

            return 5; // Reset to cooldown period
          }
          return prev - 1;
        });
      } else {
        setCountDown((prev) => {
          if (prev <= 1) {
            // End of cooldown period
            setIsActive(true);
            setSelectedBet(null);
            setResult(null);
            return 10; // Reset to active period
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isActive, direction, position, selectedBet]);

  const handlePlaceBet = (bet: "up" | "down") => {
    if (isActive && !selectedBet) {
      setSelectedBet(bet);
    }
  };

  return (
    <div className="bg-white dark:bg-navy-800 rounded-xl shadow-lg p-6 max-w-md w-full">
      <div className="mb-4 flex justify-between items-center">
        <h3 className="text-xl font-medium">Live Demo</h3>
        <div
          className={`px-3 py-1 rounded-full text-sm font-medium ${
            isActive
              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
              : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
          }`}
        >
          {isActive ? "Active" : "Cooldown"}: {countDown}s
        </div>
      </div>

      <div className="relative h-64 mb-6 border border-gray-200 dark:border-navy-600 rounded-lg overflow-hidden">
        {/* Chart visualization */}
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-1/2 left-0 right-0 h-px bg-gray-300 dark:bg-gray-600"></div>

          {/* Price indicator */}
          <div
            className="absolute w-4 h-4 bg-gold-500 rounded-full transition-all duration-300"
            style={{
              left: "50%",
              top: `${50 - position * 5}%`,
              transform: "translate(-50%, -50%)",
            }}
          ></div>

          {/* Y-axis labels */}
          <div className="absolute top-0 left-2 text-xs text-gray-500 dark:text-gray-400">
            +8
          </div>
          <div className="absolute top-1/4 left-2 text-xs text-gray-500 dark:text-gray-400">
            +4
          </div>
          <div className="absolute bottom-1/4 left-2 text-xs text-gray-500 dark:text-gray-400">
            -4
          </div>
          <div className="absolute bottom-0 left-2 text-xs text-gray-500 dark:text-gray-400">
            -8
          </div>
        </div>
      </div>

      <div className="flex justify-between mb-4">
        <div className="space-x-2">
          <button
            className={`px-3 py-1 rounded-md ${betAmount === 1 ? "bg-navy-800 text-white" : "bg-gray-200 dark:bg-navy-700 text-gray-800 dark:text-gray-200"}`}
            onClick={() => setBetAmount(1)}
          >
            $1
          </button>
          <button
            className={`px-3 py-1 rounded-md ${betAmount === 2 ? "bg-navy-800 text-white" : "bg-gray-200 dark:bg-navy-700 text-gray-800 dark:text-gray-200"}`}
            onClick={() => setBetAmount(2)}
          >
            $2
          </button>
        </div>

        {result && (
          <div
            className={`px-3 py-1 rounded-md font-medium ${
              result === "win"
                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
            }`}
          >
            {result === "win" ? "You Win!" : "You Lose"}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <AurumButton
          variant={selectedBet === "up" ? "primary" : "outline"}
          onClick={() => handlePlaceBet("up")}
          className={`${!isActive || selectedBet ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          Bet Up
        </AurumButton>
        <AurumButton
          variant={selectedBet === "down" ? "primary" : "outline"}
          onClick={() => handlePlaceBet("down")}
          className={`${!isActive || selectedBet ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          Bet Down
        </AurumButton>
      </div>
    </div>
  );
}
