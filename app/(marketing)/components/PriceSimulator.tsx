"use client";
import React, { useEffect, useState, useRef } from "react";

export default function PriceSimulator() {
  const [currentPrice, setCurrentPrice] = useState(100);
  const [priceHistory, setPriceHistory] = useState<number[]>([]);
  const [direction, setDirection] = useState(1);
  const [countDown, setCountDown] = useState(10);
  const [isActive, setIsActive] = useState(true);
  const [selectedBet, setSelectedBet] = useState<"up" | "down" | null>(null);
  const [betAmount, setBetAmount] = useState<1 | 2 | 5 | 10 | 25 | 50>(1);
  const [result, setResult] = useState<"win" | "lose" | null>(null);
  const [balance, setBalance] = useState(1000);
  const [timeframe, setTimeframe] = useState("1M");
  const [assetType] = useState("EUR/USD"); // Remove setter if not needed
  const [showTooltip, setShowTooltip] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  // Generate initial price history
  useEffect(() => {
    // Generate initial history data - zigzag pattern with some randomness
    const initialHistory: number[] = [];
    let price = 100;
    let tempDirection = Math.random() > 0.5 ? 1 : -1;

    for (let i = 0; i < 50; i++) {
      // Change direction with 30% probability
      if (Math.random() < 0.3) {
        tempDirection *= -1;
      }

      // Add some randomness to the movement
      const change = tempDirection * (0.5 + Math.random() * 1);
      price += change;

      // Keep price within reasonable bounds
      price = Math.max(90, Math.min(110, price));

      initialHistory.push(price);
    }

    setPriceHistory(initialHistory);
    setCurrentPrice(initialHistory[initialHistory.length - 1]);
  }, []);

  // Simulate price movement
  useEffect(() => {
    if (priceHistory.length === 0) return;

    const timer = setInterval(() => {
      if (isActive) {
        // Update price with zigzag movement
        setCurrentPrice((prev) => {
          // Random movement with bias based on direction
          // More extreme to create zigzag effect
          if (Math.random() < 0.2) {
            setDirection(-direction);
          }

          const volatility = 0.3 + Math.random() * 0.4; // More volatile for zigzag
          const newPrice = prev + direction * volatility;

          // Keep price within reasonable bounds
          const boundedPrice = Math.max(90, Math.min(110, newPrice));

          // Update history
          setPriceHistory((oldHistory) => {
            // Keep last 50 points for performance
            const newHistory = [...oldHistory, boundedPrice];
            if (newHistory.length > 50) {
              return newHistory.slice(newHistory.length - 50);
            }
            return newHistory;
          });

          return boundedPrice;
        });

        setCountDown((prev) => {
          if (prev <= 1) {
            // End of active period
            setIsActive(false);

            // Determine win/lose
            if (selectedBet) {
              const startPrice = priceHistory[priceHistory.length - 10] || 100;
              if (
                (selectedBet === "up" && currentPrice > startPrice) ||
                (selectedBet === "down" && currentPrice < startPrice)
              ) {
                setResult("win");
                setBalance((prev) => prev + betAmount * 1.8);
              } else if (currentPrice !== startPrice) {
                setResult("lose");
                setBalance((prev) => prev - betAmount);
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
  }, [isActive, direction, currentPrice, priceHistory, selectedBet]);

  const handlePlaceBet = (bet: "up" | "down") => {
    if (isActive && !selectedBet) {
      setSelectedBet(bet);
      setShowTooltip(true);
      setTimeout(() => setShowTooltip(false), 3000);
    }
  };

  // Draw the zigzag chart
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
    const minPrice = Math.min(...priceHistory, currentPrice) - 1;
    const maxPrice = Math.max(...priceHistory, currentPrice) + 1;
    const range = maxPrice - minPrice;

    // Draw gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(37, 99, 235, 0.05)");
    gradient.addColorStop(1, "rgba(37, 99, 235, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 0.5;

    // Horizontal grid lines
    for (let i = 0; i <= 4; i++) {
      const y = (height * i) / 4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();

      // Price labels
      const price = maxPrice - (range * i) / 4;
      ctx.fillStyle = "#94a3b8";
      ctx.font = "10px sans-serif";
      ctx.fillText(price.toFixed(2), 5, y - 5);
    }

    // Vertical grid lines
    for (let i = 0; i <= 4; i++) {
      const x = (width * i) / 4;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      // Time labels (fake)
      if (i < 4) {
        ctx.fillStyle = "#94a3b8";
        ctx.font = "10px sans-serif";
        ctx.fillText(`${10 - i * 2}s`, x + 5, height - 5);
      }
    }

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

    // Add current price point
    const lastX = width;
    const lastY = height - ((currentPrice - minPrice) / range) * height;
    ctx.lineTo(lastX, lastY);

    // Complete area
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

    // Draw price line
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;
    ctx.beginPath();

    // Draw history
    priceHistory.forEach((price, index) => {
      const x = (width * index) / priceHistory.length;
      const y = height - ((price - minPrice) / range) * height;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    // Add current price point
    ctx.lineTo(lastX, lastY);

    ctx.stroke();

    // Draw small circles at key price points
    for (let i = 0; i < priceHistory.length; i += 5) {
      const x = (width * i) / priceHistory.length;
      const y = height - ((priceHistory[i] - minPrice) / range) * height;

      ctx.fillStyle = "#3b82f6";
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw current price point
    ctx.fillStyle =
      currentPrice > priceHistory[priceHistory.length - 2]
        ? "#10b981"
        : "#ef4444";
    ctx.beginPath();
    ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
    ctx.fill();

    // Current price label
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(currentPrice.toFixed(2), lastX, lastY + 4);

    // Draw bet indicator if active
    if (selectedBet) {
      const startPrice = priceHistory[priceHistory.length - 10] || 100;
      const startX = (width * (priceHistory.length - 10)) / priceHistory.length;
      const startY = height - ((startPrice - minPrice) / range) * height;

      ctx.strokeStyle =
        selectedBet === "up"
          ? "rgba(16, 185, 129, 0.7)"
          : "rgba(239, 68, 68, 0.7)";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 3]);

      // Horizontal line from start point
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(width, startY);
      ctx.stroke();

      // Reset line dash
      ctx.setLineDash([]);

      // Draw arrow indicating bet direction
      // const arrowY = selectedBet === "up" ? startY - 15 : startY + 15;
      ctx.fillStyle =
        selectedBet === "up"
          ? "rgba(16, 185, 129, 0.9)"
          : "rgba(239, 68, 68, 0.9)";
      ctx.beginPath();
      if (selectedBet === "up") {
        ctx.moveTo(startX + 5, startY - 5);
        ctx.lineTo(startX + 10, startY - 15);
        ctx.lineTo(startX + 15, startY - 5);
      } else {
        ctx.moveTo(startX + 5, startY + 5);
        ctx.lineTo(startX + 10, startY + 15);
        ctx.lineTo(startX + 15, startY + 5);
      }
      ctx.fill();

      // Add bet amount label
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        `$${betAmount}`,
        startX + 10,
        selectedBet === "up" ? startY - 25 : startY + 25,
      );
    }
  }, [priceHistory, currentPrice, selectedBet, betAmount]);

  // Calculate price difference for display
  const priceDifference =
    priceHistory.length > 1
      ? (currentPrice - priceHistory[priceHistory.length - 2]).toFixed(2)
      : "0.00";
  const isPositive = parseFloat(priceDifference) >= 0;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg p-4 max-w-md w-full">
      {/* Header with platform name and balance */}
      <div className="flex justify-between items-center mb-3 border-b border-slate-200 dark:border-slate-800 pb-2">
        <div className="flex items-center">
          <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center mr-2">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M3 9L12 4L21 9L12 14L3 9Z" fill="white" />
              <path d="M3 14L12 19L21 14" stroke="white" strokeWidth="2" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-blue-600 dark:text-blue-400">
            Penny Game
          </h2>
        </div>
        <div className="flex items-center">
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-md px-3 py-1">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="mr-2 text-amber-500"
            >
              <path
                d="M12 2L15 8L21 9L16.5 14L18 20L12 17L6 20L7.5 14L3 9L9 8L12 2Z"
                fill="currentColor"
              />
            </svg>
            <span className="font-medium text-slate-700 dark:text-slate-300">
              ${balance.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Asset selection and timeframe */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center">
          <div className="font-medium text-slate-800 dark:text-slate-200 mr-2">
            {assetType}
          </div>
          <div
            className={`text-sm font-medium px-2 py-0.5 rounded ${isPositive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}
          >
            {isPositive ? "+" : ""}
            {priceDifference}
          </div>
        </div>
        <div className="flex">
          {["30S", "1M", "5M"].map((time) => (
            <button
              key={time}
              onClick={() => setTimeframe(time)}
              className={`px-2 py-1 text-xs font-medium rounded-md mx-0.5 ${
                timeframe === time
                  ? "bg-blue-600 text-white dark:bg-blue-700"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {time}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="relative">
        <div
          ref={chartRef}
          className="relative h-64 mb-3 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-900/50"
        >
          {/* Canvas will be inserted here by useEffect */}

          {/* Timer overlay */}
          <div className="absolute top-2 right-2 bg-slate-800/70 text-white text-xs font-medium px-2 py-1 rounded-full">
            {isActive ? `Expires: ${countDown}s` : `New trade: ${countDown}s`}
          </div>

          {/* Current price */}
          <div className="absolute top-2 left-2 bg-slate-800/70 text-white text-xs font-medium px-2 py-1 rounded">
            {currentPrice.toFixed(2)}
          </div>

          {/* Tooltip when bet is placed */}
          {showTooltip && selectedBet && (
            <div className="absolute top-1/4 left-1/2 transform -translate-x-1/2 bg-slate-800/90 text-white text-xs px-3 py-2 rounded shadow-lg z-10 transition-opacity duration-300">
              <div className="font-medium">
                {selectedBet === "up"
                  ? "Bullish prediction"
                  : "Bearish prediction"}
              </div>
              <div className="text-slate-300">
                Exp: 10s | ${betAmount} invested
              </div>
            </div>
          )}
        </div>

        {/* Countdown and result */}
        <div className="flex justify-between items-center mb-3">
          <div
            className={`px-3 py-1 rounded-md text-sm font-medium ${
              isActive
                ? "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200"
                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {isActive ? "Trading Active" : "Processing Results"}
          </div>

          {result && (
            <div
              className={`px-3 py-1 rounded-md font-medium text-sm ${
                result === "win"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
                  : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200"
              }`}
            >
              {result === "win"
                ? `Profit: +$${(betAmount * 1.8).toFixed(2)}`
                : `Loss: -$${betAmount.toFixed(2)}`}
            </div>
          )}
        </div>
      </div>

      {/* Investment amount selection */}
      <div className="mb-3">
        <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
          Investment Amount
        </div>
        <div className="flex space-x-2">
          {[1, 2, 5, 10, 25, 50].map((amount) => (
            <button
              key={amount}
              onClick={() => setBetAmount(amount as 1 | 2 | 5 | 10 | 25 | 50)}
              className={`px-3 py-1.5 rounded-md text-sm ${
                betAmount === amount
                  ? "bg-blue-600 text-white dark:bg-blue-700"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
              disabled={amount > balance}
            >
              ${amount}
            </button>
          ))}
        </div>
      </div>

      {/* Trade buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => handlePlaceBet("up")}
          disabled={!isActive || !!selectedBet || balance < betAmount}
          className={`flex items-center justify-center gap-2 py-3 px-4 rounded-md font-medium text-sm transition-all ${
            selectedBet === "up"
              ? "bg-emerald-600 text-white shadow-md dark:bg-emerald-700"
              : !isActive || selectedBet || balance < betAmount
                ? "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed"
                : "bg-emerald-500 text-white hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700 shadow-sm hover:shadow"
          }`}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M12 4L4 12H9V20H15V12H20L12 4Z" fill="currentColor" />
          </svg>
          Buy UP
        </button>
        <button
          onClick={() => handlePlaceBet("down")}
          disabled={!isActive || !!selectedBet || balance < betAmount}
          className={`flex items-center justify-center gap-2 py-3 px-4 rounded-md font-medium text-sm transition-all ${
            selectedBet === "down"
              ? "bg-red-600 text-white shadow-md dark:bg-red-700"
              : !isActive || selectedBet || balance < betAmount
                ? "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed"
                : "bg-red-500 text-white hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 shadow-sm hover:shadow"
          }`}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M12 20L20 12H15V4H9V12H4L12 20Z" fill="currentColor" />
          </svg>
          Sell DOWN
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mt-3 text-center text-xs">
        <div className="bg-slate-50 dark:bg-slate-800 p-2 rounded-md">
          <div className="text-slate-500 dark:text-slate-400">Success Rate</div>
          <div className="font-medium text-slate-800 dark:text-slate-200">
            85%
          </div>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800 p-2 rounded-md">
          <div className="text-slate-500 dark:text-slate-400">Payout</div>
          <div className="font-medium text-slate-800 dark:text-slate-200">
            180%
          </div>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800 p-2 rounded-md">
          <div className="text-slate-500 dark:text-slate-400">Trades</div>
          <div className="font-medium text-slate-800 dark:text-slate-200">
            32
          </div>
        </div>
      </div>
    </div>
  );
}
