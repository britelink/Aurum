"use client";
import React, { useEffect, useState, useRef } from "react";

export default function MarketChart() {
  const [currentPrice, setCurrentPrice] = useState(1.0825);
  const [priceHistory, setPriceHistory] = useState<number[]>([]);
  const [direction, setDirection] = useState(1);
  const chartRef = useRef<HTMLDivElement>(null);
  const [trades, setTrades] = useState<
    {
      price: number;
      position: string;
      amount: number;
      x: number;
      y: number;
    }[]
  >([]);

  // Generate initial price history (5 minute simulation with more data points)
  useEffect(() => {
    const initialHistory: number[] = [];
    let price = 1.0825;
    let tempDirection = Math.random() > 0.5 ? 1 : -1;

    // Generate 300 points for 5 minutes (assuming 1 second intervals)
    for (let i = 0; i < 300; i++) {
      if (Math.random() < 0.15) {
        tempDirection *= -1;
      }
      // More realistic forex pip movements
      const change = tempDirection * (0.00005 + Math.random() * 0.00015);
      price += change;
      // Set realistic bounds for EUR/USD
      price = Math.max(1.0815, Math.min(1.0838, price));
      initialHistory.push(price);
    }

    setPriceHistory(initialHistory);
    setCurrentPrice(initialHistory[initialHistory.length - 1]);

    // Add some sample trades
    const sampleTrades = [
      {
        price: initialHistory[50],
        position: "buy",
        amount: 60,
        x: 50,
        y: 0,
      },
      {
        price: initialHistory[100],
        position: "sell",
        amount: 500,
        x: 100,
        y: 0,
      },
      {
        price: initialHistory[170],
        position: "buy",
        amount: 100,
        x: 170,
        y: 0,
      },
      {
        price: initialHistory[220],
        position: "sell",
        amount: 500,
        x: 220,
        y: 0,
      },
      {
        price: initialHistory[270],
        position: "buy",
        amount: 315,
        x: 270,
        y: 0,
      },
    ];
    setTrades(sampleTrades);
  }, []);

  // Simulate price movement
  useEffect(() => {
    if (priceHistory.length === 0) return;

    const timer = setInterval(() => {
      // Update price with zigzag movement (smaller movements for forex)
      setCurrentPrice((prev) => {
        if (Math.random() < 0.15) {
          setDirection(-direction);
        }

        // More realistic forex pip movements
        const volatility = 0.00005 + Math.random() * 0.0001;
        const newPrice = prev + direction * volatility;
        const boundedPrice = Math.max(1.0815, Math.min(1.0838, newPrice));

        // Update history
        setPriceHistory((oldHistory) => {
          const newHistory = [...oldHistory, boundedPrice];
          if (newHistory.length > 300) {
            return newHistory.slice(newHistory.length - 300);
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
    const minPrice = Math.min(...priceHistory) - 0.0001;
    const maxPrice = Math.max(...priceHistory) + 0.0001;
    const range = maxPrice - minPrice;

    // Draw background - more responsive to color mode
    const isDarkMode = document.documentElement.classList.contains("dark");
    ctx.fillStyle = isDarkMode ? "#0f172a" : "#f8fafc";
    ctx.fillRect(0, 0, width, height);

    // Add gradient area under the chart
    const areaGradient = ctx.createLinearGradient(0, 0, 0, height);
    if (isDarkMode) {
      areaGradient.addColorStop(0, "rgba(37, 99, 235, 0.2)");
      areaGradient.addColorStop(1, "rgba(37, 99, 235, 0)");
    } else {
      areaGradient.addColorStop(0, "rgba(59, 130, 246, 0.1)");
      areaGradient.addColorStop(1, "rgba(59, 130, 246, 0)");
    }

    // Draw the area under the price line
    ctx.fillStyle = areaGradient;
    ctx.beginPath();
    ctx.moveTo(0, height); // Start at bottom left

    // Draw to the first point
    const firstY = height - ((priceHistory[0] - minPrice) / range) * height;
    ctx.lineTo(0, firstY);

    // Draw all points for the area
    for (let i = 0; i < priceHistory.length; i++) {
      const x = (width * i) / priceHistory.length;
      const y = height - ((priceHistory[i] - minPrice) / range) * height;
      ctx.lineTo(x, y);
    }

    // Complete the area
    ctx.lineTo(
      width,
      height -
        ((priceHistory[priceHistory.length - 1] - minPrice) / range) * height,
    );
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

    // Draw grid lines
    ctx.strokeStyle = isDarkMode
      ? "rgba(255, 255, 255, 0.1)"
      : "rgba(0, 0, 0, 0.1)";
    ctx.lineWidth = 0.5;

    // Vertical grid lines
    for (let i = 0; i <= 6; i++) {
      const x = (width * i) / 6;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Draw price level lines with labels
    const priceLines = 8;
    for (let i = 0; i <= priceLines; i++) {
      const price = minPrice + (range * i) / priceLines;
      const y = height - ((price - minPrice) / range) * height;

      // Draw line
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();

      // Draw price label
      ctx.fillStyle = isDarkMode
        ? "rgba(255, 255, 255, 0.5)"
        : "rgba(0, 0, 0, 0.5)";
      ctx.font = "10px Arial";
      ctx.textAlign = "left";
      ctx.fillText(price.toFixed(5), 5, y - 5);
    }

    // Draw current price horizontal line (highlighted)
    const currentY = height - ((currentPrice - minPrice) / range) * height;
    ctx.strokeStyle = "#3b82f6"; // Blue that works in both modes
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(0, currentY);
    ctx.lineTo(width, currentY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw current price label
    ctx.fillStyle = isDarkMode ? "#ffffff" : "#000000";
    ctx.font = "bold 11px Arial";
    ctx.textAlign = "left";
    ctx.fillText(currentPrice.toFixed(5), 5, currentY - 5);

    // Draw price line segments with color based on movement
    ctx.lineWidth = 2;

    for (let i = 1; i < priceHistory.length; i++) {
      const x0 = (width * (i - 1)) / priceHistory.length;
      const y0 = height - ((priceHistory[i - 1] - minPrice) / range) * height;
      const x1 = (width * i) / priceHistory.length;
      const y1 = height - ((priceHistory[i] - minPrice) / range) * height;

      // Determine line color based on price movement
      ctx.strokeStyle =
        priceHistory[i] >= priceHistory[i - 1]
          ? "#10b981" // Green for up (using Tailwind emerald-500)
          : "#ef4444"; // Red for down (using Tailwind red-500)

      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    // Draw trades
    const updatedTrades = trades.map((trade) => {
      const y = height - ((trade.price - minPrice) / range) * height;
      return { ...trade, y };
    });

    updatedTrades.forEach((trade) => {
      const x = (width * trade.x) / priceHistory.length;
      const y = trade.y;

      // Draw trade icon with better styling
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.fillStyle =
        trade.position === "buy"
          ? "rgba(16, 185, 129, 0.9)" // More modern green
          : "rgba(239, 68, 68, 0.9)"; // More modern red
      ctx.fill();

      // Add subtle border
      ctx.strokeStyle = isDarkMode
        ? "rgba(255, 255, 255, 0.2)"
        : "rgba(0, 0, 0, 0.1)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Draw currency symbol
      ctx.fillStyle = "#fff";
      ctx.font = "10px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("$", x, y);

      // Draw amount with improved style
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px Arial";
      ctx.textAlign = "center";
      ctx.fillText(`$${trade.amount}`, x, y - 18);
    });

    // Draw current price indicator
    const lastX = width;
    const lastY = height - ((currentPrice - minPrice) / range) * height;

    // Determine color based on price movement
    const priceChangeColor =
      currentPrice > priceHistory[priceHistory.length - 2]
        ? "#10b981" // More modern green
        : "#ef4444"; // More modern red

    // Draw current price point with shadow effect
    ctx.shadowColor = priceChangeColor;
    ctx.shadowBlur = 8;
    ctx.fillStyle = priceChangeColor;
    ctx.beginPath();
    ctx.arc(lastX - 5, lastY, 6, 0, Math.PI * 2);
    ctx.fill();

    // Reset shadow
    ctx.shadowBlur = 0;
  }, [priceHistory, currentPrice, trades]);

  // Calculate price difference for display
  const priceDifference =
    priceHistory.length > 1
      ? (currentPrice - priceHistory[0]).toFixed(5)
      : "0.00000";
  const isPositive = parseFloat(priceDifference) >= 0;

  return (
    <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-blue-900 rounded-xl overflow-hidden shadow-lg h-full w-full">
      {/* Header with asset info */}
      <div className="flex justify-between items-center p-3 border-b border-slate-200 dark:border-blue-900 bg-slate-50 dark:bg-gray-800">
        <div className="flex items-center">
          <div className="flex items-center bg-slate-100 dark:bg-gray-900 rounded-md p-1 mr-2">
            <span className="text-slate-800 dark:text-white font-bold mr-1">
              🇪🇺
            </span>
            <span className="text-slate-800 dark:text-white font-bold mr-1">
              /
            </span>
            <span className="text-slate-800 dark:text-white font-bold">🇺🇸</span>
          </div>
          <div>
            <div className="font-medium text-slate-800 dark:text-white">
              EUR/USD
            </div>
            <div
              className={`text-xs font-medium ${isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
            >
              {isPositive ? "+" : ""}
              {priceDifference}
            </div>
          </div>
        </div>
        <div className="text-xl font-bold text-slate-800 dark:text-white">
          {currentPrice.toFixed(5)}
        </div>
      </div>

      {/* Chart */}
      <div
        ref={chartRef}
        className="relative h-[400px] overflow-hidden bg-slate-50 dark:bg-gray-900"
      >
        {/* Canvas will be inserted here by useEffect */}
      </div>

      {/* Trading controls - simplified for visual purposes */}
      <div className="grid grid-cols-2 gap-2 p-3 border-t border-slate-200 dark:border-blue-900 bg-slate-50 dark:bg-gray-800">
        <button className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-4 rounded">
          BUY {currentPrice.toFixed(5)}
        </button>
        <button className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-4 rounded">
          SELL {currentPrice.toFixed(5)}
        </button>
      </div>

      {/* Stats footer */}
      <div className="grid grid-cols-4 gap-2 p-3 border-t border-slate-200 dark:border-blue-900 bg-slate-50 dark:bg-gray-900 text-xs">
        <div className="text-center">
          <div className="text-blue-500 dark:text-blue-300">SPREAD</div>
          <div className="font-medium text-slate-800 dark:text-white">
            0.00012
          </div>
        </div>
        <div className="text-center">
          <div className="text-blue-500 dark:text-blue-300">PAYOUT</div>
          <div className="font-medium text-slate-800 dark:text-white">82%</div>
        </div>
        <div className="text-center">
          <div className="text-blue-500 dark:text-blue-300">EXPIRES</div>
          <div className="font-medium text-slate-800 dark:text-white">5m</div>
        </div>
        <div className="text-center">
          <div className="text-blue-500 dark:text-blue-300">INVESTMENT</div>
          <div className="font-medium text-slate-800 dark:text-white">$100</div>
        </div>
      </div>
    </div>
  );
}
