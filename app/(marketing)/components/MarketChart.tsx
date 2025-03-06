"use client";
import React, { useEffect, useState, useRef } from "react";

export default function MarketChart() {
  const [currentPrice, setCurrentPrice] = useState(100);
  const [priceHistory, setPriceHistory] = useState<number[]>([]);
  const [direction, setDirection] = useState(1);
  const chartRef = useRef<HTMLDivElement>(null);

  // Generate initial price history
  useEffect(() => {
    const initialHistory: number[] = [];
    let price = 100;
    let tempDirection = Math.random() > 0.5 ? 1 : -1;

    for (let i = 0; i < 50; i++) {
      if (Math.random() < 0.3) {
        tempDirection *= -1;
      }
      const change = tempDirection * (0.5 + Math.random() * 1);
      price += change;
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
      // Update price with zigzag movement
      setCurrentPrice((prev) => {
        if (Math.random() < 0.2) {
          setDirection(-direction);
        }

        const volatility = 0.3 + Math.random() * 0.4;
        const newPrice = prev + direction * volatility;
        const boundedPrice = Math.max(90, Math.min(110, newPrice));

        // Update history
        setPriceHistory((oldHistory) => {
          const newHistory = [...oldHistory, boundedPrice];
          if (newHistory.length > 50) {
            return newHistory.slice(newHistory.length - 50);
          }
          return newHistory;
        });

        return boundedPrice;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [direction, priceHistory]);

  // Draw the chart
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
    gradient.addColorStop(0, "rgba(59, 130, 246, 0.08)");
    gradient.addColorStop(1, "rgba(59, 130, 246, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 0.5;

    // Horizontal grid lines
    for (let i = 0; i <= 4; i++) {
      const y = (height * i) / 4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Vertical grid lines
    for (let i = 0; i <= 4; i++) {
      const x = (width * i) / 4;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Draw area under the line
    ctx.fillStyle = "rgba(59, 130, 246, 0.15)";
    ctx.beginPath();
    ctx.moveTo(0, height);
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

    // Draw current price point
    ctx.fillStyle =
      currentPrice > priceHistory[priceHistory.length - 2]
        ? "#10b981"
        : "#ef4444";
    ctx.beginPath();
    ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
    ctx.fill();

    // Price markers at key points
    for (let i = 0; i < priceHistory.length; i += 10) {
      const x = (width * i) / priceHistory.length;
      const y = height - ((priceHistory[i] - minPrice) / range) * height;

      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [priceHistory, currentPrice]);

  // Calculate price difference for display
  const priceDifference =
    priceHistory.length > 1
      ? (currentPrice - priceHistory[priceHistory.length - 2]).toFixed(2)
      : "0.00";
  const isPositive = parseFloat(priceDifference) >= 0;

  return (
    <div className="bg-transparent border border-blue-500/20 backdrop-blur-sm rounded-xl overflow-hidden shadow-lg h-full w-full">
      {/* Header with asset info */}
      <div className="flex justify-between items-center p-4 border-b border-blue-500/20">
        <div className="flex items-center">
          <div className="w-8 h-8 bg-amber-500 rounded-md flex items-center justify-center mr-2">
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
          <div>
            <div className="font-medium text-white">EUR/USD</div>
            <div
              className={`text-xs font-medium ${isPositive ? "text-emerald-400" : "text-red-400"}`}
            >
              {isPositive ? "+" : ""}
              {priceDifference}
            </div>
          </div>
        </div>
        <div className="text-xl font-bold text-white">
          {currentPrice.toFixed(2)}
        </div>
      </div>

      {/* Chart */}
      <div
        ref={chartRef}
        className="relative h-[300px] overflow-hidden bg-transparent"
      >
        {/* Canvas will be inserted here by useEffect */}
      </div>

      {/* Stats footer */}
      <div className="grid grid-cols-3 gap-2 p-4 border-t border-blue-500/20">
        <div className="text-center">
          <div className="text-xs text-blue-300">24h High</div>
          <div className="font-medium text-white">
            {(currentPrice + 5).toFixed(2)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-blue-300">Volume</div>
          <div className="font-medium text-white">$2.4M</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-blue-300">24h Low</div>
          <div className="font-medium text-white">
            {(currentPrice - 8).toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}
