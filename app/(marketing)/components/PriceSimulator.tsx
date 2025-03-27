"use client";
import React, { useEffect, useState, useRef } from "react";

export default function PriceSimulator() {
  // Chart data
  const [priceHistory, setPriceHistory] = useState<number[]>([]);
  const [currentPrice, setCurrentPrice] = useState(100);
  const [direction, setDirection] = useState(1);
  const chartRef = useRef<HTMLDivElement>(null);

  // Game state
  const [isActive, setIsActive] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState(10);
  const [balance, setBalance] = useState(1000);
  const [betAmount, setBetAmount] = useState<1 | 2 | 5 | 10 | 25 | 50>(1);
  const [selectedBet, setSelectedBet] = useState<"up" | "down" | null>(null);
  const [result, setResult] = useState<"win" | "lose" | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  // Generate initial data
  useEffect(() => {
    const initialHistory: number[] = [];
    let price = 100;

    for (let i = 0; i < 20; i++) {
      if (Math.random() < 0.2) {
        setDirection((prev) => prev * -1);
      }
      const change = direction * (Math.random() * 2);
      price += change;
      initialHistory.push(price);
    }

    setPriceHistory(initialHistory);
    setCurrentPrice(initialHistory[initialHistory.length - 1]);
  }, []);

  // Price movement simulation
  useEffect(() => {
    if (priceHistory.length === 0) return;

    const timer = setInterval(() => {
      if (isActive) {
        // Update time remaining
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            // Time's up - evaluate result
            setIsActive(false);

            // Determine random outcome for demo
            const finalMove = Math.random() > 0.5 ? 1 : -1;
            const finalPrice = currentPrice + finalMove * (Math.random() * 5);

            // Update chart with final move
            setCurrentPrice(finalPrice);
            setPriceHistory((prev) => [...prev.slice(1), finalPrice]);

            // Determine if player won
            if (selectedBet) {
              const isWin =
                (selectedBet === "up" && finalPrice > currentPrice) ||
                (selectedBet === "down" && finalPrice < currentPrice);

              setResult(isWin ? "win" : "lose");

              // Update balance
              if (isWin) {
                setBalance((prev) => prev + betAmount * 0.92);
              } else {
                setBalance((prev) => prev - betAmount);
              }
            }

            // Reset for next round
            setTimeout(() => {
              setIsActive(true);
              setSelectedBet(null);
              setResult(null);
              setTimeRemaining(10);
            }, 3000);

            return 0;
          }
          return prev - 1;
        });

        // Random price movement
        if (Math.random() < 0.2) {
          setDirection((prev) => prev * -1);
        }

        const change = direction * (Math.random() * 2);
        const newPrice = currentPrice + change;

        setCurrentPrice(newPrice);
        setPriceHistory((prev) => [...prev.slice(1), newPrice]);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isActive, direction, currentPrice, priceHistory, selectedBet, betAmount]);

  // Place bet handler
  const handlePlaceBet = (bet: "up" | "down") => {
    if (isActive && !selectedBet) {
      setSelectedBet(bet);
      setShowTooltip(true);
      setTimeout(() => setShowTooltip(false), 3000);
    }
  };

  // Draw chart
  useEffect(() => {
    if (!chartRef.current || priceHistory.length === 0) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const chartElement = chartRef.current;
    const width = chartElement.clientWidth;
    const height = chartElement.clientHeight;

    canvas.width = width;
    canvas.height = height;
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";

    // Clear any existing canvas
    const existingCanvas = chartElement.querySelector("canvas");
    if (existingCanvas) {
      chartElement.removeChild(existingCanvas);
    }

    chartElement.appendChild(canvas);

    // Draw chart
    ctx.clearRect(0, 0, width, height);

    // Find min/max for scaling
    const minPrice = Math.min(...priceHistory) - 5;
    const maxPrice = Math.max(...priceHistory) + 5;
    const range = maxPrice - minPrice;

    // Draw gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(37, 99, 235, 0.05)");
    gradient.addColorStop(1, "rgba(37, 99, 235, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Draw simple grid
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 0.5;

    // Draw area under the line
    ctx.fillStyle = "rgba(59, 130, 246, 0.1)";
    ctx.beginPath();

    // Start at bottom left
    ctx.moveTo(0, height);

    // Draw line to first point
    const firstY = height - ((priceHistory[0] - minPrice) / range) * height;
    ctx.lineTo(0, firstY);

    // Draw history points
    priceHistory.forEach((price, index) => {
      const x = (width * index) / priceHistory.length;
      const y = height - ((price - minPrice) / range) * height;
      ctx.lineTo(x, y);
    });

    // Complete area
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

    // Draw price line
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;
    ctx.beginPath();

    // Draw line
    priceHistory.forEach((price, index) => {
      const x = (width * index) / priceHistory.length;
      const y = height - ((price - minPrice) / range) * height;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Draw current price point
    const lastX = (width * (priceHistory.length - 1)) / priceHistory.length;
    const lastY =
      height -
      ((priceHistory[priceHistory.length - 1] - minPrice) / range) * height;

    ctx.fillStyle =
      priceHistory[priceHistory.length - 1] >
      priceHistory[priceHistory.length - 2]
        ? "#10b981" // green
        : "#ef4444"; // red

    ctx.beginPath();
    ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
    ctx.fill();

    // Draw bet indicator if user has placed a bet
    if (selectedBet) {
      ctx.fillStyle = selectedBet === "up" ? "#10b981" : "#ef4444";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(selectedBet === "up" ? "⬆" : "⬇", width - 20, 20);
    }
  }, [priceHistory, currentPrice, selectedBet]);

  return (
    <div className="bg-white dark:bg-gray-900 p-4 rounded-lg shadow-md">
      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center">
          <div className="font-medium text-slate-800 dark:text-slate-200 mr-2">
            Penny Game Simulator
          </div>
          <div
            className={`text-sm font-medium px-2 py-0.5 rounded ${currentPrice > priceHistory[priceHistory.length - 2] ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}
          >
            {currentPrice > priceHistory[priceHistory.length - 2] ? "↑" : "↓"}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="relative">
        <div
          ref={chartRef}
          className="w-full h-48 bg-slate-50 dark:bg-gray-800 rounded relative mb-3"
        ></div>

        {/* Status overlay */}
        <div className="flex justify-between items-center mb-3">
          <div
            className={`px-3 py-1 rounded-md text-sm font-medium ${
              isActive
                ? "bg-blue-100 text-blue-800"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {isActive ? `Time left: ${timeRemaining}s` : "Round ended"}
          </div>

          {result && (
            <div
              className={`px-3 py-1 rounded-md font-medium text-sm ${
                result === "win"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {result === "win"
                ? `You win +$${(betAmount * 0.92).toFixed(2)}`
                : `You lose -$${betAmount.toFixed(2)}`}
            </div>
          )}
        </div>
      </div>

      {/* Bet amount selection */}
      <div className="mb-3">
        <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
          How much to bet?
        </div>
        <div className="flex space-x-2">
          {[1, 2, 5, 10, 25, 50].map((amount) => (
            <button
              key={amount}
              onClick={() => setBetAmount(amount as 1 | 2 | 5 | 10 | 25 | 50)}
              className={`px-3 py-1.5 rounded-md text-sm ${
                betAmount === amount
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              disabled={amount > balance || !isActive || selectedBet !== null}
            >
              ${amount}
            </button>
          ))}
        </div>
      </div>

      {/* Bet buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => handlePlaceBet("up")}
          disabled={!isActive || selectedBet !== null || balance < betAmount}
          className={`py-3 rounded-md font-medium text-sm ${
            selectedBet === "up"
              ? "bg-emerald-600 text-white"
              : "bg-emerald-500 hover:bg-emerald-600 text-white"
          } ${(!isActive || selectedBet !== null) && selectedBet !== "up" ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          BET UP ↑
        </button>
        <button
          onClick={() => handlePlaceBet("down")}
          disabled={!isActive || selectedBet !== null || balance < betAmount}
          className={`py-3 rounded-md font-medium text-sm ${
            selectedBet === "down"
              ? "bg-red-600 text-white"
              : "bg-red-500 hover:bg-red-600 text-white"
          } ${(!isActive || selectedBet !== null) && selectedBet !== "down" ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          BET DOWN ↓
        </button>
      </div>

      {/* Balance and info */}
      <div className="mt-3 grid grid-cols-2 gap-3 text-center">
        <div className="bg-slate-50 dark:bg-gray-800 p-2 rounded">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Your Balance
          </div>
          <div className="font-medium text-slate-800 dark:text-white">
            ${balance.toFixed(2)}
          </div>
        </div>
        <div className="bg-slate-50 dark:bg-gray-800 p-2 rounded">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Game Fee
          </div>
          <div className="font-medium text-slate-800 dark:text-white">8%</div>
        </div>
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div className="mt-3 bg-blue-50 dark:bg-blue-900/30 p-3 rounded-md text-sm text-blue-800 dark:text-blue-200">
          {selectedBet === "up"
            ? "You bet the line will go UP. Wait for the result!"
            : "You bet the line will go DOWN. Wait for the result!"}
        </div>
      )}
    </div>
  );
}
