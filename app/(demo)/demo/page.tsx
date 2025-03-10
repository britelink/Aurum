"use client";

import { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function TradingDemo() {
  const [balance, setBalance] = useState(10000);
  const [currentPrice, setCurrentPrice] = useState(1.08215);
  const [investmentAmount, setInvestmentAmount] = useState(50);
  const [dealDuration, setDealDuration] = useState(30); // in seconds
  const [timeLeft, setTimeLeft] = useState(0);
  const [isTrading, setIsTrading] = useState(false);
  const [tradeDirection, setTradeDirection] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState(7709);
  const [tradeHistory, setTradeHistory] = useState([]);
  const [activeTrades, setActiveTrades] = useState([]);

  const timerRef = useRef(null);
  const chartUpdateRef = useRef(null);

  // Initialize chart data
  useEffect(() => {
    const initialData = Array.from({ length: 100 }, (_, i) => ({
      time: i,
      price: 1.08 + Math.random() * 0.01,
    }));
    setChartData(initialData);

    // Simulate online users changing
    const userInterval = setInterval(() => {
      setOnlineUsers((prev) => Math.floor(prev + (Math.random() * 20 - 10)));
    }, 5000);

    return () => clearInterval(userInterval);
  }, []);

  // Update chart periodically
  useEffect(() => {
    chartUpdateRef.current = setInterval(() => {
      setChartData((prevData) => {
        const newPoint = {
          time: prevData[prevData.length - 1].time + 1,
          price:
            prevData[prevData.length - 1].price +
            (Math.random() * 0.002 - 0.001),
        };
        setCurrentPrice(Number(newPoint.price.toFixed(5)));
        return [...prevData.slice(1), newPoint];
      });

      // Update active trades
      setActiveTrades((prev) =>
        prev.map((trade) => {
          const updatedTrade = { ...trade };
          if (currentPrice > trade.entryPrice) {
            updatedTrade.profit =
              trade.direction === "BUY"
                ? (trade.amount * 0.84).toFixed(2)
                : -(trade.amount * 0.84).toFixed(2);
          } else if (currentPrice < trade.entryPrice) {
            updatedTrade.profit =
              trade.direction === "SELL"
                ? (trade.amount * 0.84).toFixed(2)
                : -(trade.amount * 0.84).toFixed(2);
          }
          return updatedTrade;
        }),
      );
    }, 1000);

    return () => clearInterval(chartUpdateRef.current);
  }, [currentPrice]);

  // Handle timer countdown
  useEffect(() => {
    if (isTrading && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            completeTrade();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => clearInterval(timerRef.current);
  }, [isTrading, timeLeft]);

  const completeTrade = () => {
    const activeTrade = activeTrades[0]; // Get the current active trade
    if (!activeTrade) return;

    let profit = 0;
    let isWin = false;

    if (
      activeTrade.direction === "BUY" &&
      currentPrice > activeTrade.entryPrice
    ) {
      profit = Number((activeTrade.amount * 0.84).toFixed(2));
      isWin = true;
    } else if (
      activeTrade.direction === "SELL" &&
      currentPrice < activeTrade.entryPrice
    ) {
      profit = Number((activeTrade.amount * 0.84).toFixed(2));
      isWin = true;
    } else {
      profit = -activeTrade.amount;
    }

    const newBalance = balance + (isWin ? activeTrade.amount + profit : profit);
    setBalance(Number(newBalance.toFixed(2)));

    const completedTrade = {
      ...activeTrade,
      exitPrice: currentPrice,
      profit,
      time: new Date().toLocaleTimeString(),
      isWin,
    };

    setTradeHistory((prev) => [completedTrade, ...prev.slice(0, 4)]);
    setActiveTrades([]);
    setIsTrading(false);
    setTradeDirection(null);
  };

  const startTrade = (direction) => {
    if (isTrading) return;

    if (investmentAmount > balance) {
      alert("Insufficient balance");
      return;
    }

    const newTrade = {
      id: Date.now(),
      direction,
      amount: investmentAmount,
      entryPrice: currentPrice,
      time: new Date().toLocaleTimeString(),
      profit: 0,
    };

    setActiveTrades([newTrade]);
    setIsTrading(true);
    setTradeDirection(direction);
    setTimeLeft(dealDuration);
  };

  const decreaseInvestment = () => {
    if (investmentAmount > 10) setInvestmentAmount((prev) => prev - 10);
  };

  const increaseInvestment = () => {
    setInvestmentAmount((prev) => prev + 10);
  };

  const formatTime = (seconds) => {
    return `00:${seconds < 10 ? "0" + seconds : seconds}`;
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      {/* Top bar */}
      <div className="flex justify-between items-center p-4 border-b border-gray-800">
        <div className="flex items-center">
          <div className="text-blue-400 mr-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
          <div className="font-semibold">TradeSim</div>
        </div>
        <div className="flex items-center space-x-2">
          <div className="text-yellow-500 font-bold">${balance.toFixed(2)}</div>
          <div className="text-gray-500 text-sm">demo balance</div>
        </div>
        <div className="bg-blue-500 px-4 py-2 rounded text-sm">
          <div>Register now</div>
          <div className="text-xs flex items-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v8" />
              <path d="M8 12h8" />
            </svg>
            <span className="ml-1">{onlineUsers} online</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1">
        {/* Left Sidebar */}
        <div className="w-24 bg-gray-900 border-r border-gray-800">
          <div className="flex flex-col h-full">
            {/* Navigation Items */}
            {[
              { icon: "💹", label: "Trade" },
              { icon: "📱", label: "Apps" },
              { icon: "📚", label: "Education" },
              { icon: "📜", label: "History" },
              { icon: "💰", label: "Withdraw" },
              { icon: "❓", label: "Help" },
              { icon: "🤝", label: "Partner" },
              { icon: "📋", label: "Register" },
            ].map((item, index) => (
              <div
                key={index}
                className="flex flex-col items-center justify-center p-4 border-b border-gray-800 cursor-pointer hover:bg-gray-800"
              >
                <div className="text-xl">{item.icon}</div>
                <div className="text-xs mt-1">{item.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Trading Area */}
        <div className="flex-1 flex flex-col">
          {/* Currency Selection */}
          <div className="p-4 flex justify-center">
            <div className="bg-gray-800 px-6 py-2 rounded-full flex items-center">
              <span className="mr-2">🇪🇺</span>
              <span>EUR/USD</span>
            </div>
          </div>

          {/* Chart Area */}
          <div className="flex-1 p-4">
            <div className="h-full border border-gray-800 rounded-lg overflow-hidden">
              <div className="h-8 bg-gray-800 flex items-center px-4">
                <div className="text-sm text-gray-400">
                  Price: {currentPrice}
                </div>
              </div>
              <div className="h-5/6">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis dataKey="time" hide={true} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1e2130",
                        border: "none",
                      }}
                      labelStyle={{ color: "#9ca3af" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="price"
                      stroke="#3b82f6"
                      dot={false}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Trade Controls */}
          <div className="h-32 bg-gray-800 border-t border-gray-700 flex">
            {/* Investment Amount */}
            <div className="w-64 border-r border-gray-700 flex flex-col justify-center px-4">
              <div className="text-sm text-gray-400 mb-2">Investment</div>
              <div className="flex items-center">
                <button
                  onClick={decreaseInvestment}
                  className="bg-gray-700 w-8 h-8 flex items-center justify-center rounded"
                >
                  -
                </button>
                <div className="flex-1 text-center text-xl font-bold">
                  ${investmentAmount}
                </div>
                <button
                  onClick={increaseInvestment}
                  className="bg-gray-700 w-8 h-8 flex items-center justify-center rounded"
                >
                  +
                </button>
              </div>
            </div>

            {/* Buy/Sell Buttons */}
            <div className="flex-1 flex">
              <button
                onClick={() => startTrade("SELL")}
                disabled={isTrading}
                className="w-1/2 bg-red-500 hover:bg-red-600 flex flex-col items-center justify-center"
              >
                <div className="text-xl font-bold">SELL</div>
                <div className="text-sm">84%</div>
              </button>
              <button
                onClick={() => startTrade("BUY")}
                disabled={isTrading}
                className="w-1/2 bg-green-500 hover:bg-green-600 flex flex-col items-center justify-center"
              >
                <div className="text-xl font-bold">BUY</div>
                <div className="text-sm">84%</div>
              </button>
            </div>

            {/* Timer */}
            <div className="w-64 border-l border-gray-700 flex flex-col justify-center items-center">
              <div className="text-sm text-gray-400 mb-2">Deal duration</div>
              <div className="text-2xl font-bold">
                {isTrading ? formatTime(timeLeft) : formatTime(dealDuration)}
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-16 bg-gray-900 border-l border-gray-800">
          <div className="flex flex-col h-full">
            {/* Action Buttons */}
            {[
              { icon: "📊", label: "Deals" },
              { icon: "📈", label: "Trends" },
              { icon: "👥", label: "Social" },
              { icon: "⚙️", label: "Settings" },
            ].map((item, index) => (
              <div
                key={index}
                className="flex flex-col items-center justify-center p-4 border-b border-gray-800 cursor-pointer hover:bg-gray-800"
              >
                <div className="text-xl">{item.icon}</div>
                <div className="text-xs mt-1">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
