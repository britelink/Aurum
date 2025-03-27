/* eslint-disable no-unused-vars */

"use client";
import React, { useEffect, useState, useRef } from "react";
import {
  BetPosition,
  BetAmount,
  Player,
  SessionResult,
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
  onPlayersChange?: (activePlayers: number) => void;
}

export default function TradingChart({
  onTradeComplete,
  onPlayersChange,
}: TradingChartProps) {
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

  // Add this state to track which direction has more bets
  const [betImbalance, setBetImbalance] = useState<"buy" | "sell" | "equal">(
    "equal",
  );

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

  // Simulate price movement (will be overridden during betting rounds)
  useEffect(() => {
    if (priceHistory.length === 0) return;

    const timer = setInterval(() => {
      // Only move the price randomly when not in an active betting round
      if (!isTrading) {
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
      } else if (isTrading && activeTrade) {
        // During active trading, move the price based on bet imbalance
        setCurrentPrice((prev) => {
          // If more people bet UP, move the line DOWN (line moves opposite to majority)
          const moveDirection =
            betImbalance === "buy" ? -1 : betImbalance === "sell" ? 1 : 0;

          // If equal bets, make very small random movements
          const volatility =
            betImbalance === "equal"
              ? (Math.random() - 0.5) * 0.00005
              : 0.00008 + Math.random() * 0.00012;

          const newPrice = prev + moveDirection * volatility;
          const boundedPrice = Math.max(1.0815, Math.min(1.0838, newPrice));

          // Update history
          setPriceHistory((oldHistory) => {
            const newHistory = [...oldHistory, boundedPrice];
            if (newHistory.length > 300) {
              return newHistory.slice(newHistory.length - 300);
            }
            return newHistory;
          });

          // Update trade path
          setTradePath((prevPath) => [
            ...prevPath,
            {
              x: chartRef.current ? chartRef.current.clientWidth : 0,
              y: 0, // Will be calculated in draw function
              price: boundedPrice,
              time: Date.now(),
            },
          ]);

          return boundedPrice;
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [direction, priceHistory, isTrading, activeTrade, betImbalance]);

  // Timer countdown for active trades
  useEffect(() => {
    if (!isTrading || !activeTrade) return;

    const timer = setInterval(() => {
      const elapsedTime = Math.floor(
        (Date.now() - activeTrade.startTime) / 1000,
      );
      const remaining = sessionTime - elapsedTime;

      if (remaining <= 0) {
        clearInterval(timer);
        completeTrade();
      } else {
        setCountDown(remaining);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isTrading, activeTrade, sessionTime]);

  // Update bet imbalance whenever sessionPlayers changes
  useEffect(() => {
    if (sessionPlayers.length === 0) {
      setBetImbalance("equal");
      // Report player count to parent (safely handle the callback)
      onPlayersChange?.(0);
      return;
    }

    const buyTotal = sessionPlayers
      .filter((p) => p.position === "buy")
      .reduce((sum, p) => sum + p.amount, 0);

    const sellTotal = sessionPlayers
      .filter((p) => p.position === "sell")
      .reduce((sum, p) => sum + p.amount, 0);

    if (buyTotal > sellTotal) {
      setBetImbalance("buy");
    } else if (sellTotal > buyTotal) {
      setBetImbalance("sell");
    } else {
      setBetImbalance("equal");
    }

    // Report player count to parent (safely)
    onPlayersChange?.(sessionPlayers.length);
  }, [sessionPlayers, onPlayersChange]); // Always include onPlayersChange in the dependency array

  // Handle mouse movement over chart
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!chartRef.current || priceHistory.length === 0) return;

    const chartRect = chartRef.current.getBoundingClientRect();
    const x = e.clientX - chartRect.left;
    const width = chartRect.width;

    // Calculate the price index corresponding to the mouse position
    const priceIndex = Math.min(
      priceHistory.length - 1,
      Math.max(0, Math.floor((x / width) * priceHistory.length)),
    );

    // Get the price at this index
    const price = priceHistory[priceIndex];

    // Find the y-coordinate for this price
    const minPrice = Math.min(...priceHistory) - 0.0001;
    const maxPrice = Math.max(...priceHistory) + 0.0001;
    const range = maxPrice - minPrice;
    const height = chartRect.height;
    const y = height - ((price - minPrice) / range) * height;

    // Show hover info at this position
    setHoverInfo({
      visible: true,
      x,
      y,
      price,
      index: priceIndex,
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
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

    // Draw hover indicator/crosshair if visible
    if (hoverInfo && hoverInfo.visible) {
      // Vertical line
      ctx.strokeStyle = isDarkMode
        ? "rgba(255,255,255,0.2)"
        : "rgba(0,0,0,0.1)";
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(hoverInfo.x, 0);
      ctx.lineTo(hoverInfo.x, height);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(0, hoverInfo.y);
      ctx.lineTo(width, hoverInfo.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Price dot
      ctx.fillStyle = isDarkMode ? "#fbbf24" : "#d97706";
      ctx.beginPath();
      ctx.arc(hoverInfo.x, hoverInfo.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "white";
      ctx.stroke();
    }

    // Draw active trade entry point and trade path if visible
    if (activeTrade && isTrading && tradePath.length > 0) {
      const entryPrice = activeTrade.entryPrice;
      const entryY = height - ((entryPrice - minPrice) / range) * height;

      // Draw entry point
      ctx.fillStyle = activeTrade.position === "buy" ? "#10b981" : "#ef4444";
      ctx.beginPath();
      ctx.arc(0, entryY, 4, 0, Math.PI * 2);
      ctx.fill();

      // Draw trade path
      ctx.strokeStyle = isDarkMode ? "#fbbf24" : "#d97706";
      ctx.lineWidth = 2;
      ctx.beginPath();

      // Start at entry point
      ctx.moveTo(0, entryY);

      // Calculate and update y-values for trade path
      for (let i = 0; i < tradePath.length; i++) {
        const pathPoint = tradePath[i];
        const pathPointY =
          height - ((pathPoint.price - minPrice) / range) * height;
        const pathPointX = (width * (i + 1)) / (tradePath.length + 1);

        // Update the y-value in the path data
        tradePath[i] = { ...pathPoint, y: pathPointY };

        ctx.lineTo(pathPointX, pathPointY);
      }
      ctx.stroke();

      // Draw current price indicator
      const currentY = height - ((currentPrice - minPrice) / range) * height;
      ctx.fillStyle = "#fbbf24"; // Amber color
      ctx.beginPath();
      ctx.arc(width, currentY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "white";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw price labels
    ctx.fillStyle = isDarkMode ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.7)";
    ctx.font = "10px sans-serif";

    // Simplify to just show High, Middle, Low
    ctx.textAlign = "left";
    ctx.fillText(`High: ${maxPrice.toFixed(4)}`, 10, 15);
    ctx.fillText(`Price: ${currentPrice.toFixed(4)}`, 10, height / 2);
    ctx.fillText(`Low: ${minPrice.toFixed(4)}`, 10, height - 10);

    // Draw current price label on right side
    ctx.textAlign = "right";
    ctx.fillStyle = isDarkMode ? "#fbbf24" : "#d97706";
    ctx.fillText(`Current: ${currentPrice.toFixed(4)}`, width - 10, 15);
  }, [
    priceHistory,
    currentPrice,
    hoverInfo,
    isTrading,
    activeTrade,
    tradePath,
  ]);

  // Function to place a bet - renamed for clarity
  const placeBet = async (position: BetPosition) => {
    if (isTrading || balance < betAmount) return;

    // Remove any existing bets by this player
    const filteredPlayers = sessionPlayers.filter((p) => p.id !== userPlayerId);

    // Add the new bet
    const userBet: Player = {
      id: userPlayerId,
      position,
      amount: betAmount,
    };

    // Generate random number of AI players (0-15)
    const aiPlayers = generateRandomAIPlayers(0, 15, position, betAmount);
    setSessionPlayers([...filteredPlayers, ...aiPlayers, userBet]);
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

    // Report new player count immediately (safely)
    onPlayersChange?.(1 + aiPlayers.length); // User + AI players
  };

  // Helper function to generate AI players
  const generateRandomAIPlayers = (
    min: number,
    max: number,
    userPosition: BetPosition,
  ) => {
    const playerCount = min + Math.floor(Math.random() * (max - min + 1));
    const aiPlayers: Player[] = [];

    for (let i = 0; i < playerCount; i++) {
      // Generate random position - make it somewhat biased against the user's position
      // to create more interesting gameplay (55-45 bias)
      const position =
        Math.random() < 0.55
          ? userPosition === "buy"
            ? "sell"
            : "buy"
          : userPosition === "buy"
            ? "buy"
            : "sell";

      // Generate random bet amount (either 1 or 2)
      const amount = Math.random() < 0.7 ? 1 : 2;

      aiPlayers.push({
        id: `ai-${i}-${Math.random().toString(36).substring(2, 9)}`,
        position,
        amount,
      });
    }

    return aiPlayers;
  };

  // Function to start countdown timer
  const startSessionCountdown = () => {
    setCountDown(sessionTime);
  };

  // Function to end a trading session
  const endSession = () => {
    setIsTrading(false);

    // Determine the winner based on price movement
    const startPrice =
      tradePath[0]?.price || activeTrade?.entryPrice || currentPrice;
    const endPrice = currentPrice;
    const priceWentUp = endPrice > startPrice;
    const winningPosition: BetPosition = priceWentUp ? "buy" : "sell";

    // Calculate winner distributions based on new logic
    const result = calculatePrizeDistribution(sessionPlayers, winningPosition);

    // Create a proper SessionResult object
    const sessionResultObject: SessionResult = {
      winningPosition: result.winningPosition,
      players: sessionPlayers,
      buyTotal: sessionPlayers
        .filter((p) => p.position === "buy")
        .reduce((sum, p) => sum + p.amount, 0),
      sellTotal: sessionPlayers
        .filter((p) => p.position === "sell")
        .reduce((sum, p) => sum + p.amount, 0),
      winners: result.players
        .filter((p) => p.hasWon)
        .map((p) => ({
          playerId: p.id,
          position:
            sessionPlayers.find((sp) => sp.id === p.id)?.position || "buy",
          profit: p.payout - p.betAmount,
          initialBet: p.betAmount as BetAmount,
          totalReturn: p.payout,
          roi: ((p.payout - p.betAmount) / p.betAmount) * 100,
        })),
      losers: result.players
        .filter((p) => !p.hasWon)
        .map((p) => ({
          playerId: p.id,
          position:
            sessionPlayers.find((sp) => sp.id === p.id)?.position || "sell",
          profit: -p.betAmount,
          initialBet: p.betAmount as BetAmount,
          totalReturn: 0,
          roi: -100,
        })),
      isFoul: false,
      isNeutral: result.isTie,
      timestamp: Date.now(),
    };

    setSessionResult(sessionResultObject);

    // Find the user's result
    const userResult = result.players.find(
      (player) => player.id === userPlayerId,
    );

    if (userResult) {
      // Update user's balance
      setBalance((prev) => prev + userResult.payout);

      // Create trade history entry
      const tradeData = {
        id: Date.now(),
        position: activeTrade?.position || "unknown",
        amount: activeTrade?.amount || 0,
        entryPrice: activeTrade?.entryPrice || 0,
        exitPrice: currentPrice,
        profit: userResult.payout - (activeTrade?.amount || 0), // profit = payout - bet
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        isWin: userResult.hasWon,
      };

      // Notify parent component
      if (onTradeComplete) {
        onTradeComplete(tradeData);
      }
    }

    // Reset for next session
    setTimeout(() => {
      setActiveTrade(null);
      setTradePath([]);
      setCountDown(0);
      setSessionPlayers([]);
      setSessionResult(null);
    }, 5000);
  };

  // Calculate prize distribution based on the new logic
  const calculatePrizeDistribution = (
    players: Player[],
    winningPosition: BetPosition,
  ): {
    isTie: boolean;
    winningPosition: BetPosition | null;
    players: {
      id: string;
      hasWon: boolean;
      betAmount: number;
      payout: number;
    }[];
    houseFee: number;
  } => {
    // Calculate total bets for each side
    const upTotal = players
      .filter((p) => p.position === "buy")
      .reduce((sum, p) => sum + p.amount, 0);

    const downTotal = players
      .filter((p) => p.position === "sell")
      .reduce((sum, p) => sum + p.amount, 0);

    // If equal bets on both sides, it's a tie
    if (upTotal === downTotal) {
      return {
        isTie: true,
        winningPosition: null,
        players: players.map((p) => ({
          id: p.id,
          hasWon: false,
          betAmount: p.amount,
          payout: p.amount, // return original bet
        })),
        houseFee: 0,
      };
    }

    // Calculate winning and losing pools
    const winningPlayers = players.filter(
      (p) => p.position === winningPosition,
    );
    const losingPlayers = players.filter((p) => p.position !== winningPosition);

    const winningPool = winningPlayers.reduce((sum, p) => sum + p.amount, 0);
    const losingPool = losingPlayers.reduce((sum, p) => sum + p.amount, 0);

    // Calculate house fee (8% of losing pool)
    const houseFee = losingPool * 0.08;

    // Calculate prize pool (92% of losing pool)
    const prizePool = losingPool * 0.92;

    // Calculate results for all players
    const playerResults = players.map((player) => {
      if (player.position === winningPosition) {
        // Winners get their bet back plus a proportional share of the prize pool
        const share = player.amount / winningPool;
        const prize = prizePool * share;
        return {
          id: player.id,
          hasWon: true,
          betAmount: player.amount,
          payout: player.amount + prize, // original bet + winnings
        };
      } else {
        // Losers get nothing
        return {
          id: player.id,
          hasWon: false,
          betAmount: player.amount,
          payout: 0,
        };
      }
    });

    return {
      isTie: false,
      winningPosition,
      players: playerResults,
      houseFee,
    };
  };

  // Complete an active trade
  const completeTrade = () => {
    if (!activeTrade) return;
    endSession();
  };

  // Calculate time remaining for active trade
  const getTimeRemaining = () => {
    if (!activeTrade) return 0;

    const elapsed = Math.floor((Date.now() - activeTrade.startTime) / 1000);
    return Math.max(0, sessionTime - elapsed);
  };

  // Calculate price difference for display - simplified
  const priceTrend =
    priceHistory.length > 1 && currentPrice > priceHistory[0]
      ? "rising"
      : "falling";
  const isPositive = priceTrend === "rising";

  // Toggle expanded view
  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-slate-200 dark:border-blue-900 overflow-hidden h-full flex flex-col">
      {/* Chart header */}
      <div className="bg-slate-50 dark:bg-gray-800 border-b border-slate-200 dark:border-blue-900 p-3 flex justify-between items-center">
        <div>
          <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Your Balance
          </div>
          <div className="text-2xl font-bold text-slate-800 dark:text-white">
            ${balance.toFixed(2)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Current Price
          </div>
          <div
            className={`text-xl font-bold flex items-center ${
              isPositive
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {isPositive ? (
              <svg
                className="w-4 h-4 mr-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 10l7-7m0 0l7 7m-7-7v18"
                />
              </svg>
            ) : (
              <svg
                className="w-4 h-4 mr-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 14l-7 7m0 0l-7-7m7 7V3"
                />
              </svg>
            )}
            {currentPrice.toFixed(4)}
          </div>
        </div>
        <div>
          <button
            onClick={toggleExpanded}
            className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={isExpanded ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"}
              />
            </svg>
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

        {/* Simplified Session info overlay */}
        <div className="absolute top-4 left-4 bg-slate-800/90 text-white px-3 py-2 rounded text-xs">
          <div className="font-bold mb-1">Current Round</div>
          <div>
            UP Bets: $
            {sessionPlayers
              .filter((p) => p.position === "buy")
              .reduce((sum, p) => sum + p.amount, 0)}
          </div>
          <div>
            DOWN Bets: $
            {sessionPlayers
              .filter((p) => p.position === "sell")
              .reduce((sum, p) => sum + p.amount, 0)}
          </div>
          <div>Players: {sessionPlayers.length}</div>
          {isTrading && <div className="mt-1">Ends in: {countDown}s</div>}
        </div>

        {/* Bet direction prediction */}
        {isTrading && betImbalance !== "equal" && (
          <div className="absolute bottom-4 right-4 bg-slate-800/80 text-white px-3 py-1 rounded text-xs">
            Prediction: Line will go {betImbalance === "buy" ? "DOWN" : "UP"}
            <span className="ml-1 opacity-75">(opposite of majority)</span>
          </div>
        )}

        {/* Simplified Session result overlay */}
        {sessionResult && (
          <div className="absolute inset-0 bg-slate-900/80 flex items-center justify-center">
            <div className="bg-white dark:bg-slate-800 p-4 rounded-lg max-w-xs text-center">
              <div className="text-xl font-bold mb-2">
                {sessionResult.isNeutral
                  ? "It's a Tie! Same bets on both sides."
                  : `${sessionResult.winningPosition === "buy" ? "UP" : "DOWN"} Wins!`}
              </div>
              {!sessionResult.isNeutral && (
                <div className="mb-3">
                  <div className="text-sm text-slate-600 dark:text-slate-400">
                    {sessionResult.winningPosition === "buy"
                      ? "Line went UP"
                      : "Line went DOWN"}
                  </div>

                  {/* User's result */}
                  {sessionResult.winners.find(
                    (p) => p.playerId === userPlayerId,
                  ) ? (
                    <div className="mt-3 text-green-500 font-bold text-lg">
                      You WON $
                      {sessionResult.winners
                        .find((p) => p.playerId === userPlayerId)
                        ?.profit.toFixed(2)}
                      !
                    </div>
                  ) : (
                    <div className="mt-3 text-red-500 font-bold text-lg">
                      {sessionResult.isNeutral
                        ? "You got your bet back."
                        : "You lost your bet."}
                    </div>
                  )}
                </div>
              )}
              <div className="text-sm mb-1">
                {sessionResult.isNeutral
                  ? "Everyone gets their money back!"
                  : "Winners share 92% of losing bets."}
              </div>
              <div className="text-xs text-slate-500 mt-2">
                House fee: $
                {(
                  sessionResult.losers.reduce(
                    (sum, loser) => sum + loser.initialBet,
                    0,
                  ) * 0.08
                ).toFixed(2)}{" "}
                (8%)
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Investment amount selection - simplified labels */}
      <div className="p-3 border-t border-slate-200 dark:border-blue-900">
        <div>
          <label className="text-sm text-slate-600 dark:text-slate-400 mb-2 block">
            How Much to Bet?
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

      {/* Trading controls - simplified labels */}
      <div className="grid grid-cols-2 gap-2 p-3 border-t border-slate-200 dark:border-blue-900 bg-slate-50 dark:bg-gray-800">
        <button
          className={`bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-4 rounded ${isTrading ? "opacity-50 cursor-not-allowed" : ""}`}
          onClick={() => placeBet("buy")}
          disabled={isTrading || balance < betAmount}
        >
          BET UP ↑
        </button>
        <button
          className={`bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-4 rounded ${isTrading ? "opacity-50 cursor-not-allowed" : ""}`}
          onClick={() => placeBet("sell")}
          disabled={isTrading || balance < betAmount}
        >
          BET DOWN ↓
        </button>
      </div>

      {/* Stats footer - simplified explanations */}
      <div className="grid grid-cols-4 gap-2 p-3 border-t border-slate-200 dark:border-blue-900 bg-slate-50 dark:bg-gray-900 text-xs">
        <div className="text-center">
          <div className="text-blue-500 dark:text-blue-300">ROUND</div>
          <div className="font-medium text-slate-800 dark:text-white">
            {isTrading ? `${countDown}s left` : "Ready to bet!"}
          </div>
        </div>
        <div className="text-center">
          <div className="text-blue-500 dark:text-blue-300">WIN SHARE</div>
          <div className="font-medium text-slate-800 dark:text-white">
            92% of pool
          </div>
        </div>
        <div className="text-center">
          <div className="text-blue-500 dark:text-blue-300">GAME FEE</div>
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
