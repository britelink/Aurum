"use client";
import React, { useEffect, useState, useRef } from "react";

export default function TradingChart() {
  // State from MarketChart
  const [currentPrice, setCurrentPrice] = useState(1.0825);
  const [priceHistory, setPriceHistory] = useState<number[]>([]);
  const [direction, setDirection] = useState(1);
  const chartRef = useRef<HTMLDivElement>(null);

  // State from PriceSimulator
  const [balance, setBalance] = useState(1000);
  const [investmentAmount, setInvestmentAmount] = useState(100);
  const [countDown, setCountDown] = useState(30);
  const [isTrading, setIsTrading] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<
    "buy" | "sell" | null
  >(null);
  const [result, setResult] = useState<"win" | "lose" | null>(null);
  const [tradeHistory, setTradeHistory] = useState<
    {
      id: number;
      position: string;
      amount: number;
      entryPrice: number;
      exitPrice?: number;
      profit: number;
      time: string;
      isWin?: boolean;
    }[]
  >([]);
  const [activeTrade, setActiveTrade] = useState<{
    id: number;
    position: string;
    amount: number;
    entryPrice: number;
    startTime: number;
    x: number;
    y: number;
  } | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<{
    visible: boolean;
    x: number;
    y: number;
    price: number;
    index: number;
    time: string;
  } | null>(null);

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

  // Timer countdown for active trades
  useEffect(() => {
    if (!isTrading || !activeTrade) return;

    const timer = setInterval(() => {
      const elapsedTime = Math.floor(
        (Date.now() - activeTrade.startTime) / 1000,
      );
      const remaining = countDown - elapsedTime;

      if (remaining <= 0) {
        clearInterval(timer);
        completeTrade();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isTrading, activeTrade]);

  // Handle mouse movement over chart
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!chartRef.current || priceHistory.length === 0) return;

    const rect = chartRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Find the closest price point based on x position
    const width = rect.width;
    const pixelsPerPoint = width / priceHistory.length;
    const index = Math.min(
      Math.floor(x / pixelsPerPoint),
      priceHistory.length - 1,
    );

    // Convert index to time (assuming 1 second per data point)
    const date = new Date();
    date.setSeconds(date.getSeconds() - (priceHistory.length - index));
    const timeString = date.toLocaleTimeString();

    // Set hover info
    setHoverInfo({
      visible: true,
      x,
      y,
      price: priceHistory[index],
      index,
      time: timeString,
    });
  };

  const handleMouseLeave = () => {
    setHoverInfo(null);
  };

  // Draw the chart with hover indicators
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

    // Draw for each price point
    for (let i = 0; i < priceHistory.length; i++) {
      const x = (width * i) / priceHistory.length;
      const y = height - ((priceHistory[i] - minPrice) / range) * height;
      ctx.lineTo(x, y);
    }

    // Close the path and fill
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

    // Draw the price line
    ctx.beginPath();
    ctx.moveTo(0, firstY);

    for (let i = 0; i < priceHistory.length; i++) {
      const x = (width * i) / priceHistory.length;
      const y = height - ((priceHistory[i] - minPrice) / range) * height;
      ctx.lineTo(x, y);
    }

    ctx.strokeStyle = isDarkMode ? "#3b82f6" : "#2563eb"; // Blue line
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw active trade position if exists
    if (activeTrade) {
      const tradeX = (width * activeTrade.x) / priceHistory.length;
      const tradeY =
        height - ((activeTrade.entryPrice - minPrice) / range) * height;

      // Draw entry point with animation effect
      ctx.beginPath();
      ctx.arc(tradeX, tradeY, 6, 0, Math.PI * 2);
      ctx.fillStyle = activeTrade.position === "buy" ? "#10b981" : "#ef4444";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(tradeX, tradeY, 9, 0, Math.PI * 2);
      ctx.strokeStyle = activeTrade.position === "buy" ? "#10b981" : "#ef4444";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Draw horizontal dashed line for entry price
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.moveTo(tradeX, tradeY);
      ctx.lineTo(width, tradeY);
      ctx.strokeStyle =
        activeTrade.position === "buy"
          ? "rgba(16, 185, 129, 0.5)"
          : "rgba(239, 68, 68, 0.5)";
      ctx.stroke();
      ctx.setLineDash([]);

      // Label the position
      ctx.font = "bold 10px Arial";
      ctx.fillStyle = activeTrade.position === "buy" ? "#10b981" : "#ef4444";
      ctx.textAlign = "left";
      ctx.fillText(
        `${activeTrade.position.toUpperCase()} @ ${activeTrade.entryPrice.toFixed(5)}`,
        tradeX + 15,
        tradeY - 5,
      );
    }

    // Draw hover indicator if active
    if (hoverInfo && hoverInfo.visible) {
      const hoverX = (width * hoverInfo.index) / priceHistory.length;
      const hoverY =
        height - ((priceHistory[hoverInfo.index] - minPrice) / range) * height;

      // Draw vertical line
      ctx.beginPath();
      ctx.setLineDash([4, 2]);
      ctx.moveTo(hoverX, 0);
      ctx.lineTo(hoverX, height);
      ctx.strokeStyle = isDarkMode
        ? "rgba(255, 255, 255, 0.3)"
        : "rgba(0, 0, 0, 0.2)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Draw horizontal line
      ctx.beginPath();
      ctx.moveTo(0, hoverY);
      ctx.lineTo(width, hoverY);
      ctx.stroke();

      // Draw hover point
      ctx.beginPath();
      ctx.arc(hoverX, hoverY, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#3b82f6";
      ctx.fill();
      ctx.setLineDash([]);
    }

    // Draw grid lines
    ctx.strokeStyle = isDarkMode
      ? "rgba(255, 255, 255, 0.05)"
      : "rgba(0, 0, 0, 0.05)";
    ctx.lineWidth = 1;

    // Horizontal grid lines (5 evenly spaced)
    for (let i = 0; i < 5; i++) {
      const y = height * (i / 4);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();

      // Price labels on the left
      const labelPrice = maxPrice - (i / 4) * range;
      ctx.fillStyle = isDarkMode
        ? "rgba(255, 255, 255, 0.5)"
        : "rgba(0, 0, 0, 0.5)";
      ctx.font = "10px Arial";
      ctx.textAlign = "left";
      ctx.fillText(labelPrice.toFixed(5), 5, y - 5);
    }

    // Vertical grid lines (5 evenly spaced)
    for (let i = 0; i < 5; i++) {
      const x = width * (i / 4);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

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
  }, [priceHistory, currentPrice, activeTrade, hoverInfo]);

  // Start a new trade
  const startTrade = (position: "buy" | "sell") => {
    if (isTrading || investmentAmount > balance) return;

    const newTrade = {
      id: Date.now(),
      position: position,
      amount: investmentAmount,
      entryPrice: currentPrice,
      startTime: Date.now(),
      x: priceHistory.length - 1,
      y: 0,
    };

    setActiveTrade(newTrade);
    setSelectedPosition(position);
    setIsTrading(true);
    setBalance((prev) => prev - investmentAmount);
  };

  // Complete an active trade
  const completeTrade = () => {
    if (!activeTrade) return;

    let isWin = false;
    let profit = -activeTrade.amount;

    // Determine win/lose based on position and price movement
    if (
      (activeTrade.position === "buy" &&
        currentPrice > activeTrade.entryPrice) ||
      (activeTrade.position === "sell" && currentPrice < activeTrade.entryPrice)
    ) {
      isWin = true;
      profit = Math.floor(activeTrade.amount * 0.82);
      setBalance((prev) => prev + activeTrade.amount + profit);
    }

    // Add to trade history
    const completedTrade = {
      id: activeTrade.id,
      position: activeTrade.position,
      amount: activeTrade.amount,
      entryPrice: activeTrade.entryPrice,
      exitPrice: currentPrice,
      profit: isWin ? profit : -activeTrade.amount,
      time: new Date().toLocaleTimeString(),
      isWin,
    };

    setTradeHistory((prev) => [completedTrade, ...prev]);
    setResult(isWin ? "win" : "lose");
    setActiveTrade(null);
    setIsTrading(false);

    // Reset result after a delay
    setTimeout(() => {
      setResult(null);
      setSelectedPosition(null);
    }, 3000);
  };

  // Calculate time remaining for active trade
  const getTimeRemaining = () => {
    if (!activeTrade) return 0;

    const elapsed = Math.floor((Date.now() - activeTrade.startTime) / 1000);
    return Math.max(0, countDown - elapsed);
  };

  // Calculate price difference for display
  const priceDifference =
    priceHistory.length > 1
      ? (currentPrice - priceHistory[0]).toFixed(5)
      : "0.00000";
  const isPositive = parseFloat(priceDifference) >= 0;

  // Toggle expanded view
  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div
      className={`bg-white dark:bg-gray-900 border border-slate-200 dark:border-blue-900 rounded-xl overflow-hidden shadow-lg w-full transition-all duration-300 ease-in-out ${
        isExpanded
          ? "fixed inset-2.5 z-50 m-auto max-w-none max-h-none rounded-xl"
          : ""
      }`}
    >
      {/* Header with asset info and balance */}
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
        <div className="flex items-center space-x-4">
          {result && (
            <div
              className={`px-3 py-1 rounded text-sm font-medium ${
                result === "win"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
              }`}
            >
              {result === "win"
                ? `+$${Math.floor(investmentAmount * 0.82)}`
                : `-$${investmentAmount}`}
            </div>
          )}
          <div className="text-lg font-bold text-slate-800 dark:text-white">
            Balance: ${balance}
          </div>
          <div className="text-xl font-bold text-slate-800 dark:text-white">
            {currentPrice.toFixed(5)}
          </div>

          {/* Expand/Shrink Button */}
          <button
            onClick={toggleExpanded}
            className="bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-full p-1 text-slate-600 dark:text-slate-300"
            aria-label={isExpanded ? "Shrink chart" : "Expand chart"}
          >
            {isExpanded ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Chart with hover capability */}
      <div
        ref={chartRef}
        className={`relative overflow-hidden bg-slate-50 dark:bg-gray-900 ${
          isExpanded ? "h-[calc(100%-200px)]" : "h-[400px]"
        }`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Timer display for active trade */}
        {isTrading && (
          <div className="absolute top-4 right-4 bg-slate-800/80 text-white px-3 py-1 rounded">
            {getTimeRemaining()}s
          </div>
        )}

        {/* Hover tooltip */}
        {hoverInfo && hoverInfo.visible && (
          <div
            className="absolute bg-slate-800/90 text-white text-xs rounded px-3 py-2 shadow-lg z-10 pointer-events-none"
            style={{
              left: Math.min(
                hoverInfo.x + 10,
                chartRef.current!.clientWidth - 120,
              ),
              top: Math.min(
                hoverInfo.y - 60,
                chartRef.current!.clientHeight - 70,
              ),
            }}
          >
            <div className="font-bold text-blue-300">{hoverInfo.time}</div>
            <div className="font-medium mt-1">
              Price: {hoverInfo.price.toFixed(5)}
            </div>
            <div className="text-slate-300 text-[10px] mt-1">
              {hoverInfo.index < priceHistory.length - 1 ? (
                <>
                  Change:{" "}
                  <span
                    className={
                      hoverInfo.price > priceHistory[hoverInfo.index + 1]
                        ? "text-green-400"
                        : "text-red-400"
                    }
                  >
                    {(
                      hoverInfo.price - priceHistory[hoverInfo.index + 1]
                    ).toFixed(5)}
                  </span>
                </>
              ) : (
                "Current price"
              )}
            </div>
          </div>
        )}
      </div>

      {/* Investment amount selection */}
      <div className="grid grid-cols-2 p-3 border-t border-slate-200 dark:border-blue-900 bg-slate-50 dark:bg-gray-800">
        <div>
          <label className="text-sm text-slate-600 dark:text-slate-400 mb-2 block">
            Investment Amount
          </label>
          <div className="flex space-x-2">
            {[50, 100, 250, 500].map((amount) => (
              <button
                key={amount}
                onClick={() => setInvestmentAmount(amount)}
                className={`px-3 py-1 rounded text-sm ${
                  investmentAmount === amount
                    ? "bg-blue-600 text-white dark:bg-blue-700"
                    : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                } ${amount > balance ? "opacity-50 cursor-not-allowed" : ""}`}
                disabled={amount > balance || isTrading}
              >
                ${amount}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-sm text-slate-600 dark:text-slate-400 mb-2 block">
            Expiration Time
          </label>
          <div className="flex space-x-2">
            {[30, 60, 120, 300].map((seconds) => (
              <button
                key={seconds}
                onClick={() => setCountDown(seconds)}
                className={`px-3 py-1 rounded text-sm ${
                  countDown === seconds
                    ? "bg-blue-600 text-white dark:bg-blue-700"
                    : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                } ${isTrading ? "opacity-50 cursor-not-allowed" : ""}`}
                disabled={isTrading}
              >
                {seconds < 60 ? `${seconds}s` : `${seconds / 60}m`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Trading controls */}
      <div className="grid grid-cols-2 gap-2 p-3 border-t border-slate-200 dark:border-blue-900 bg-slate-50 dark:bg-gray-800">
        <button
          className={`bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-4 rounded ${isTrading ? "opacity-50 cursor-not-allowed" : ""}`}
          onClick={() => startTrade("buy")}
          disabled={isTrading || balance < investmentAmount}
        >
          BUY {currentPrice.toFixed(5)}
        </button>
        <button
          className={`bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-4 rounded ${isTrading ? "opacity-50 cursor-not-allowed" : ""}`}
          onClick={() => startTrade("sell")}
          disabled={isTrading || balance < investmentAmount}
        >
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
          <div className="font-medium text-slate-800 dark:text-white">
            {countDown < 60 ? `${countDown}s` : `${countDown / 60}m`}
          </div>
        </div>
        <div className="text-center">
          <div className="text-blue-500 dark:text-blue-300">INVESTMENT</div>
          <div className="font-medium text-slate-800 dark:text-white">
            ${investmentAmount}
          </div>
        </div>
      </div>
    </div>
  );
}
