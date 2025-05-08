"use client";
import React, { useEffect, useState, useRef } from "react";

export default function MarketChart() {
  // Base state for chart
  const [currentPrice, setCurrentPrice] = useState(1.0825);
  const [priceHistory, setPriceHistory] = useState<number[]>([]);
  const [direction, setDirection] = useState(1);
  const chartRef = useRef<HTMLDivElement>(null);

  // Simplified trades
  const [trades, setTrades] = useState<
    {
      price: number;
      position: string;
      amount: number;
      x: number;
      y: number;
    }[]
  >([]);

  // Generate initial data when component mounts
  useEffect(() => {
    const initialHistory: number[] = [];
    let price = 1.0825;

    // Generate simpler price history
    for (let i = 0; i < 100; i++) {
      if (Math.random() < 0.15) {
        if (direction > 0) {
          setDirection(-1);
        } else {
          setDirection(1);
        }
      }

      // Simpler price changes
      const change = direction * (Math.random() * 0.0002);
      price += change;

      // Keep price in reasonable range
      price = Math.max(1.0815, Math.min(1.0838, price));
      initialHistory.push(price);
    }

    setPriceHistory(initialHistory);
    setCurrentPrice(initialHistory[initialHistory.length - 1]);

    // Add some sample trades (simplified)
    const sampleTrades = [
      {
        price: initialHistory[20],
        position: "buy",
        amount: 50,
        x: 20,
        y: 0,
      },
      {
        price: initialHistory[40],
        position: "sell",
        amount: 100,
        x: 40,
        y: 0,
      },
      {
        price: initialHistory[70],
        position: "buy",
        amount: 75,
        x: 70,
        y: 0,
      },
    ];
    setTrades(sampleTrades);
  }, []);

  // Simple price animation
  useEffect(() => {
    if (priceHistory.length === 0) return;

    const timer = setInterval(() => {
      // Random direction change
      if (Math.random() < 0.15) {
        if (direction > 0) {
          setDirection(-1);
        } else {
          setDirection(1);
        }
      }

      // Update price
      setCurrentPrice((prev) => {
        const change = direction * (Math.random() * 0.0002);
        const newPrice = prev + change;
        const boundedPrice = Math.max(1.0815, Math.min(1.0838, newPrice));

        // Update history
        setPriceHistory((old) => {
          const updated = [...old, boundedPrice];
          return updated.length > 100 ? updated.slice(-100) : updated;
        });

        return boundedPrice;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [direction]);

  // Draw chart with canvas
  useEffect(() => {
    if (!chartRef.current || priceHistory.length === 0) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Setup canvas
    const chartElement = chartRef.current;
    const width = chartElement.clientWidth;
    const height = chartElement.clientHeight;
    canvas.width = width;
    canvas.height = height;
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";

    // Replace any existing canvas
    const existingCanvas = chartElement.querySelector("canvas");
    if (existingCanvas) {
      chartElement.removeChild(existingCanvas);
    }
    chartElement.appendChild(canvas);

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Calculate price range for scaling
    const minPrice = Math.min(...priceHistory) - 0.0001;
    const maxPrice = Math.max(...priceHistory) + 0.0001;
    const range = maxPrice - minPrice;

    // Draw gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(59, 130, 246, 0.1)");
    gradient.addColorStop(1, "rgba(59, 130, 246, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Draw grid lines
    ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
    ctx.lineWidth = 0.5;

    // Draw 4 horizontal grid lines
    for (let i = 0; i <= 4; i++) {
      const y = (height * i) / 4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();

      // Price labels
      const price = minPrice + (range * (4 - i)) / 4;
      ctx.fillStyle = "#94a3b8";
      ctx.font = "10px sans-serif";
      ctx.fillText(price.toFixed(4), 5, y + 15);
    }

    // Draw the price line
    ctx.lineWidth = 2;
    ctx.beginPath();

    // Draw each price point
    priceHistory.forEach((price, i) => {
      const x = (width * i) / priceHistory.length;
      const y = height - ((price - minPrice) / range) * height;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        // Color segments based on movement
        ctx.strokeStyle =
          priceHistory[i] >= priceHistory[i - 1]
            ? "#10b981" // Green for up
            : "#ef4444"; // Red for down

        ctx.lineTo(x, y);
        ctx.stroke();

        // Start a new path segment
        ctx.beginPath();
        ctx.moveTo(x, y);
      }
    });

    // Draw trades
    const updatedTrades = trades.map((trade) => {
      const y = height - ((trade.price - minPrice) / range) * height;
      return { ...trade, y };
    });

    updatedTrades.forEach((trade) => {
      const x = (width * trade.x) / priceHistory.length;

      // Draw trade marker
      ctx.beginPath();
      ctx.arc(x, trade.y, 8, 0, Math.PI * 2);
      ctx.fillStyle =
        trade.position === "buy"
          ? "rgba(16, 185, 129, 0.9)" // Green for buy
          : "rgba(239, 68, 68, 0.9)"; // Red for sell
      ctx.fill();

      // Label
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`$${trade.amount}`, x, trade.y + 3);
    });

    // Draw current price marker
    const lastX = (width * (priceHistory.length - 1)) / priceHistory.length;
    const lastY = height - ((currentPrice - minPrice) / range) * height;

    // Draw point
    ctx.beginPath();
    ctx.arc(lastX, lastY, 6, 0, Math.PI * 2);
    ctx.fillStyle =
      priceHistory[priceHistory.length - 1] >
      priceHistory[priceHistory.length - 2]
        ? "#10b981" // Green for up
        : "#ef4444"; // Red for down
    ctx.fill();

    // Current price label
    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(currentPrice.toFixed(4), width - 10, 20);
  }, [priceHistory, currentPrice, trades]);

  // Calculate price difference for display
  const priceDifference = (currentPrice - priceHistory[0]).toFixed(4);
  const isPositive = parseFloat(priceDifference) >= 0;

  return (
    <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-blue-900 rounded-xl overflow-hidden shadow-lg h-full">
      {/* Header with simplified asset info */}
      <div className="flex justify-between items-center p-3 border-b border-slate-200 dark:border-blue-900 bg-slate-50 dark:bg-gray-800">
        <div className="flex items-center">
          <div className="font-medium text-slate-800 dark:text-white">
            The Line
          </div>
          <div
            className={`ml-2 px-2 py-0.5 text-xs rounded ${
              isPositive
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            }`}
          >
            {isPositive ? "+" : ""}
            {priceDifference}
          </div>
        </div>
        <div className="text-xl font-bold text-slate-800 dark:text-white">
          {currentPrice.toFixed(4)}
        </div>
      </div>

      {/* Chart */}
      <div
        ref={chartRef}
        className="relative h-[300px] overflow-hidden bg-slate-50 dark:bg-gray-900"
      >
        {/* Canvas will be inserted here */}
      </div>

      {/* Trading controls - simplified */}
      <div className="grid grid-cols-2 gap-2 p-3 border-t border-slate-200 dark:border-blue-900 bg-slate-50 dark:bg-gray-800">
        <button className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-4 rounded">
          PREDICT UP ↑
        </button>
        <button className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-4 rounded">
          PREDICT DOWN ↓
        </button>
      </div>

      {/* Simplified stats */}
      <div className="grid grid-cols-3 gap-2 p-3 border-t border-slate-200 dark:border-blue-900 bg-slate-50 dark:bg-gray-900 text-xs">
        <div className="text-center">
          <div className="text-blue-500 dark:text-blue-300">WIN RATE</div>
          <div className="font-medium text-slate-800 dark:text-white">92%</div>
        </div>
        <div className="text-center">
          <div className="text-blue-500 dark:text-blue-300">ROUND</div>
          <div className="font-medium text-slate-800 dark:text-white">30s</div>
        </div>
        <div className="text-center">
          <div className="text-blue-500 dark:text-blue-300">MIN BET</div>
          <div className="font-medium text-slate-800 dark:text-white">$1</div>
        </div>
      </div>
    </div>
  );
}
