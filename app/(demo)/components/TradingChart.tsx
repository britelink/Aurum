/* eslint-disable no-unused-vars */

"use client";
import React, { useEffect, useState, useRef } from "react";
import {
  calculateSessionResults,
  BetPosition,
  BetAmount,
  Player,
  SessionResult,
  generateSimulatedSession,
} from "../utils/aurumDemo";

interface TradingChartProps {
  onTradeComplete?: (tradeData: {
    id: number;
    position: string;
    amount: number;
    entryPrice: number;
    exitPrice?: number;
    profit: number;
    time: string;
    isWin?: boolean;
  }) => void;
}

export default function TradingChart({ onTradeComplete }: TradingChartProps) {
  // State from MarketChart
  const [currentPrice, setCurrentPrice] = useState(1.0825);
  const [priceHistory, setPriceHistory] = useState<number[]>([]);
  const [direction, setDirection] = useState(1);
  const chartRef = useRef<HTMLDivElement>(null);

  // State from PriceSimulator
  const [balance, setBalance] = useState(1000);
  const [betAmount, setBetAmount] = useState<BetAmount>(1);
  const [sessionPlayers, setSessionPlayers] = useState<Player[]>([]);
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(
    null,
  );
  const [userPlayerId] = useState(
    `user-${Math.random().toString(36).substring(2, 9)}`,
  );
  const [sessionTime] = useState(30); // seconds for demo
  const [countDown, setCountDown] = useState(30);
  const [isTrading, setIsTrading] = useState(false);
  const [result, setResult] = useState<"win" | "lose" | null>(null);
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

  // Add this new state to track trade path points
  const [tradePath, setTradePath] = useState<
    { x: number; y: number; price: number; time: number }[]
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

        // If in active trading session, update trade path
        if (isTrading && activeTrade) {
          setTradePath((prevPath) => [
            ...prevPath,
            {
              x: chartRef.current ? chartRef.current.clientWidth : 0,
              y: 0, // Will be calculated in draw function
              price: boundedPrice,
              time: Date.now(),
            },
          ]);
        }

        return boundedPrice;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [direction, priceHistory, isTrading, activeTrade]);

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

  // Draw the chart with hover indicators and color-coded line segments
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

    // Draw the price line with color segments
    ctx.lineWidth = 2;

    // Draw each segment with appropriate color
    for (let i = 1; i < priceHistory.length; i++) {
      const prevX = (width * (i - 1)) / priceHistory.length;
      const prevY =
        height - ((priceHistory[i - 1] - minPrice) / range) * height;
      const x = (width * i) / priceHistory.length;
      const y = height - ((priceHistory[i] - minPrice) / range) * height;

      // Determine color based on price movement
      const priceIsRising = priceHistory[i] >= priceHistory[i - 1];
      ctx.strokeStyle = priceIsRising
        ? isDarkMode
          ? "#10b981"
          : "#059669" // Green for price increase
        : isDarkMode
          ? "#ef4444"
          : "#dc2626"; // Red for price decrease

      ctx.beginPath();
      ctx.moveTo(prevX, prevY);
      ctx.lineTo(x, y);
      ctx.stroke();
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

    // Draw the trade path if in active trading session
    if (isTrading && activeTrade && tradePath.length > 0) {
      // Calculate y positions for all points in trade path
      const updatedTradePath = tradePath.map((point) => ({
        ...point,
        y: height - ((point.price - minPrice) / range) * height,
      }));

      // Draw path highlight - a semi-transparent area along the price path
      ctx.beginPath();
      ctx.moveTo(updatedTradePath[0].x, updatedTradePath[0].y);

      // Create path from entry point to current position
      for (let i = 1; i < updatedTradePath.length; i++) {
        // For x position, calculate based on time progress in session
        const timeProgress =
          (updatedTradePath[i].time - activeTrade.startTime) /
          (sessionTime * 1000);
        const x = width - (1 - timeProgress) * width;

        ctx.lineTo(x, updatedTradePath[i].y);
      }

      // Close the path to bottom for area fill
      ctx.lineTo(width, height);
      ctx.lineTo(updatedTradePath[0].x, height);
      ctx.closePath();

      // Use position-appropriate colors
      const pathColor =
        activeTrade.position === "buy"
          ? "rgba(16, 185, 129, 0.15)" // Green for buy
          : "rgba(239, 68, 68, 0.15)"; // Red for sell

      ctx.fillStyle = pathColor;
      ctx.fill();

      // Draw the path line itself
      ctx.beginPath();
      ctx.moveTo(updatedTradePath[0].x, updatedTradePath[0].y);

      for (let i = 1; i < updatedTradePath.length; i++) {
        const timeProgress =
          (updatedTradePath[i].time - activeTrade.startTime) /
          (sessionTime * 1000);
        const x = width - (1 - timeProgress) * width;

        ctx.lineTo(x, updatedTradePath[i].y);
      }

      ctx.strokeStyle =
        activeTrade.position === "buy"
          ? "rgba(16, 185, 129, 0.8)" // Green for buy
          : "rgba(239, 68, 68, 0.8)"; // Red for sell

      ctx.lineWidth = 3;
      ctx.stroke();

      // Draw entry point marker
      ctx.beginPath();
      ctx.arc(updatedTradePath[0].x, updatedTradePath[0].y, 6, 0, Math.PI * 2);
      ctx.fillStyle = activeTrade.position === "buy" ? "#10b981" : "#ef4444";
      ctx.fill();
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Add entry label
      ctx.font = "bold 11px Arial";
      ctx.fillStyle = activeTrade.position === "buy" ? "#10b981" : "#ef4444";
      ctx.textAlign = "left";
      const labelY =
        updatedTradePath[0].y > height - 40
          ? updatedTradePath[0].y - 25
          : updatedTradePath[0].y + 25;

      ctx.fillText(
        `ENTRY: ${activeTrade.entryPrice.toFixed(5)}`,
        updatedTradePath[0].x + 10,
        labelY,
      );

      // Add "Target" label at the right edge
      const lastPoint = updatedTradePath[updatedTradePath.length - 1];
      ctx.fillText(
        `CURRENT: ${lastPoint.price.toFixed(5)}`,
        width - 150,
        lastPoint.y - 10,
      );

      // Draw "Session Progress" indicator at the bottom of chart
      const sessionProgress = Math.min(
        (Date.now() - activeTrade.startTime) / (sessionTime * 1000),
        1,
      );
      ctx.fillStyle = isDarkMode ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)";
      ctx.fillRect(0, height - 5, width, 5);
      ctx.fillStyle = activeTrade.position === "buy" ? "#10b981" : "#ef4444";
      ctx.fillRect(0, height - 5, width * sessionProgress, 5);
    }
  }, [
    priceHistory,
    currentPrice,
    activeTrade,
    tradePath,
    hoverInfo,
    isTrading,
    sessionTime,
  ]);

  // Initialize with some random players
  useEffect(() => {
    // Simulate 15-25 other players for the session
    const randomPlayerCount = Math.floor(Math.random() * 10) + 15;
    const simulatedPlayers = generateSimulatedSession(randomPlayerCount);
    setSessionPlayers(simulatedPlayers);
  }, []);

  // Function to place a bet
  const placeBet = (position: BetPosition) => {
    if (balance < betAmount) return;

    // Remove any existing bets by this player
    const filteredPlayers = sessionPlayers.filter((p) => p.id !== userPlayerId);

    // Add the new bet
    const userBet: Player = {
      id: userPlayerId,
      position,
      amount: betAmount,
    };

    setSessionPlayers([...filteredPlayers, userBet]);
    setBalance((prev) => prev - betAmount);
    setIsTrading(true);

    // Initialize trade path with entry point
    const entryPrice = currentPrice;
    const newActiveTrade = {
      id: Date.now(),
      position,
      amount: betAmount,
      entryPrice,
      startTime: Date.now(),
      x: chartRef.current ? chartRef.current.clientWidth : 0,
      y: 0, // Will be calculated in the draw function
    };

    setActiveTrade(newActiveTrade);
    setTradePath([
      {
        x: chartRef.current ? chartRef.current.clientWidth : 0,
        y: 0,
        price: entryPrice,
        time: Date.now(),
      },
    ]);

    // Start countdown to session end
    startSessionCountdown();
  };

  // Function to start countdown timer
  const startSessionCountdown = () => {
    setCountDown(sessionTime);
    const timer = setInterval(() => {
      setCountDown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          endSession();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Function to end a trading session
  const endSession = () => {
    setIsTrading(false);

    // Determine the winner based on price movement
    const startPrice = tradePath[0]?.price || currentPrice;
    const endPrice = currentPrice;
    const priceWentUp = endPrice > startPrice;
    const winningPosition: BetPosition = priceWentUp ? "buy" : "sell";

    // Calculate session results
    const result = calculateSessionResults(sessionPlayers, winningPosition);
    setSessionResult(result);

    // Find the user's result
    const userResult = [...result.winners, ...result.losers].find(
      (player) => player.playerId === userPlayerId,
    );

    if (userResult) {
      // Update user's balance
      setBalance((prev) => prev + userResult.totalReturn);

      // Create trade history entry
      const tradeData = {
        id: Date.now(),
        position: activeTrade?.position || "unknown",
        amount: activeTrade?.amount || 0,
        entryPrice: activeTrade?.entryPrice || 0,
        exitPrice: currentPrice,
        profit: userResult.profit,
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        isWin: userResult.profit > 0,
      };

      // Notify parent component
      if (onTradeComplete) {
        onTradeComplete(tradeData);
      }
    }

    // Reset for next session
    setActiveTrade(null);
    setTradePath([]);
    setCountDown(0);
    setSessionPlayers([]);
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

    setResult(isWin ? "win" : "lose");
    setActiveTrade(null);
    setIsTrading(false);

    // Reset result after a delay
    setTimeout(() => {
      setResult(null);
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
                ? `+$${Math.floor(betAmount * 0.82)}`
                : `-$${betAmount}`}
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

        {/* Session info overlay */}
        <div className="absolute top-4 left-4 bg-slate-800/90 text-white px-3 py-2 rounded text-xs">
          <div className="font-bold mb-1">Current Session</div>
          <div>
            Buy: $
            {sessionPlayers
              .filter((p) => p.position === "buy")
              .reduce((sum, p) => sum + p.amount, 0)}
          </div>
          <div>
            Sell: $
            {sessionPlayers
              .filter((p) => p.position === "sell")
              .reduce((sum, p) => sum + p.amount, 0)}
          </div>
          <div>Players: {sessionPlayers.length}</div>
          {isTrading && <div className="mt-1">Ends in: {countDown}s</div>}
        </div>

        {/* Session result overlay */}
        {sessionResult && (
          <div className="absolute inset-0 bg-slate-900/80 flex items-center justify-center">
            <div className="bg-white dark:bg-slate-800 p-4 rounded-lg max-w-xs text-center">
              <div className="text-xl font-bold mb-2">
                {sessionResult.isFoul
                  ? "No Winners"
                  : sessionResult.isNeutral
                    ? "Draw"
                    : `${sessionResult.winningPosition?.toUpperCase()} Wins!`}
              </div>
              {!sessionResult.isFoul && !sessionResult.isNeutral && (
                <div className="mb-3">
                  <div className="text-sm text-slate-600 dark:text-slate-400">
                    {sessionResult.winningPosition === "buy"
                      ? "Price went UP"
                      : "Price went DOWN"}
                  </div>
                  <div className="mt-2 flex justify-center space-x-4">
                    <div className="text-center">
                      <div className="text-xs text-slate-500">$1 Bettors</div>
                      <div className="font-medium">
                        $
                        {sessionResult.winners
                          .find((w) => w.initialBet === 1)
                          ?.totalReturn.toFixed(2) || "0.00"}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-slate-500">$2 Bettors</div>
                      <div className="font-medium">
                        $
                        {sessionResult.winners
                          .find((w) => w.initialBet === 2)
                          ?.totalReturn.toFixed(2) || "0.00"}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div className="text-sm mb-1">
                {sessionResult.isFoul
                  ? "All bets were on the same side - no money lost"
                  : sessionResult.isNeutral
                    ? "Buy and Sell were exactly equal - continuing to next round"
                    : "Results calculated with 8% platform fee"}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Investment amount selection - Update to only allow $1 and $2 */}
      <div className="p-3 border-t border-slate-200 dark:border-blue-900">
        <div>
          <label className="text-sm text-slate-600 dark:text-slate-400 mb-2 block">
            Bet Amount
          </label>
          <div className="flex space-x-2">
            {[1, 2].map((amount) => (
              <button
                key={amount}
                onClick={() => setBetAmount(amount as BetAmount)}
                className={`px-3 py-1 rounded text-sm ${
                  betAmount === amount
                    ? "bg-blue-600 text-white dark:bg-blue-700"
                    : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                } ${isTrading ? "opacity-50 cursor-not-allowed" : ""}`}
                disabled={isTrading}
              >
                ${amount}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Trading controls */}
      <div className="grid grid-cols-2 gap-2 p-3 border-t border-slate-200 dark:border-blue-900 bg-slate-50 dark:bg-gray-800">
        <button
          className={`bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-4 rounded ${isTrading ? "opacity-50 cursor-not-allowed" : ""}`}
          onClick={() => placeBet("buy")}
          disabled={isTrading || balance < betAmount}
        >
          BUY (UP)
        </button>
        <button
          className={`bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-4 rounded ${isTrading ? "opacity-50 cursor-not-allowed" : ""}`}
          onClick={() => placeBet("sell")}
          disabled={isTrading || balance < betAmount}
        >
          SELL (DOWN)
        </button>
      </div>

      {/* Stats footer */}
      <div className="grid grid-cols-4 gap-2 p-3 border-t border-slate-200 dark:border-blue-900 bg-slate-50 dark:bg-gray-900 text-xs">
        <div className="text-center">
          <div className="text-blue-500 dark:text-blue-300">SESSION</div>
          <div className="font-medium text-slate-800 dark:text-white">
            {isTrading ? `${countDown}s` : "Ready"}
          </div>
        </div>
        <div className="text-center">
          <div className="text-blue-500 dark:text-blue-300">PAYOUT</div>
          <div className="font-medium text-slate-800 dark:text-white">
            100%+
          </div>
        </div>
        <div className="text-center">
          <div className="text-blue-500 dark:text-blue-300">FEE</div>
          <div className="font-medium text-slate-800 dark:text-white">8%</div>
        </div>
        <div className="text-center">
          <div className="text-blue-500 dark:text-blue-300">MY BET</div>
          <div className="font-medium text-slate-800 dark:text-white">
            ${betAmount}
          </div>
        </div>
      </div>
    </div>
  );
}
