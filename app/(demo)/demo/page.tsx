"use client";
import React, { useState } from "react";
import TradingChart from "../components/TradingChart";

export default function TradingDemoPage() {
  const [showTutorial, setShowTutorial] = useState(true);
  const [onlineUsers] = useState(Math.floor(7000 + Math.random() * 500));
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

  // Function to receive trade history updates from the TradingChart component
  const onTradeComplete = (tradeData: {
    id: number;
    position: string;
    amount: number;
    entryPrice: number;
    exitPrice?: number;
    profit: number;
    time: string;
    isWin?: boolean;
  }) => {
    setTradeHistory((prev) => [tradeData, ...prev].slice(0, 10)); // Keep only the 10 most recent trades
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-950">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-800">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center">
            <div className="text-blue-600 dark:text-blue-400 mr-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">
              PennySimulator Pro
            </h1>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-slate-600 dark:text-slate-400">
              <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-1"></span>
              {onlineUsers.toLocaleString()} traders online
            </div>
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium">
              Create Real Account
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-6">
        {/* Tutorial overlay */}
        {showTutorial && (
          <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 relative">
            <button
              onClick={() => setShowTutorial(false)}
              className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <h2 className="text-lg font-semibold text-blue-800 dark:text-blue-300 mb-2">
              Welcome to the Trading Simulator
            </h2>
            <p className="text-slate-700 dark:text-slate-300 mb-3">
              This is a risk-free environment to practice trading. Here&apos;s
              how it works:
            </p>
            <ol className="list-decimal pl-5 text-slate-600 dark:text-slate-400 space-y-1">
              <li>Select your investment amount and expiration time</li>
              <li>
                Predict if the price will go UP or DOWN within the time frame
              </li>
              <li>
                If your prediction is correct, you earn 82% profit on your
                investment
              </li>
              <li>If incorrect, you lose your investment amount</li>
            </ol>
            <p className="mt-3 text-slate-700 dark:text-slate-300">
              You start with a $1000 virtual balance. Good luck!
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main chart area */}
          <div className="lg:col-span-2">
            <TradingChart onTradeComplete={onTradeComplete} />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Market news */}
            <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-blue-900 rounded-xl overflow-hidden shadow-lg">
              <div className="bg-slate-50 dark:bg-gray-800 border-b border-slate-200 dark:border-blue-900 p-3">
                <h2 className="font-bold text-slate-800 dark:text-white">
                  Market News
                </h2>
              </div>
              <div className="p-4 space-y-4">
                {[
                  {
                    title: "EUR/USD Faces Resistance at 1.0840",
                    time: "11:32",
                    source: "MarketWatch",
                  },
                  {
                    title: "Fed Minutes Show Hawkish Tone on Rates",
                    time: "10:15",
                    source: "Bloomberg",
                  },
                  {
                    title: "ECB's Lagarde Hints at Potential Rate Cut",
                    time: "09:45",
                    source: "Reuters",
                  },
                ].map((news, index) => (
                  <div
                    key={index}
                    className="border-b border-slate-100 dark:border-gray-800 pb-3 last:border-0 last:pb-0"
                  >
                    <h3 className="font-medium text-slate-800 dark:text-white text-sm">
                      {news.title}
                    </h3>
                    <div className="flex justify-between mt-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>{news.source}</span>
                      <span>{news.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Trade history */}
            <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-blue-900 rounded-xl overflow-hidden shadow-lg">
              <div className="bg-slate-50 dark:bg-gray-800 border-b border-slate-200 dark:border-blue-900 p-3">
                <h2 className="font-bold text-slate-800 dark:text-white">
                  Your Trade History
                </h2>
              </div>
              <div className="p-3">
                {tradeHistory.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-10 w-10 mx-auto mb-2 text-slate-300 dark:text-slate-600"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                      <path d="M18 12h-2" />
                      <path d="M15 9l3 3-3 3" />
                    </svg>
                    <p>Your trade history will appear here</p>
                    <p>Place your first trade to get started</p>
                  </div>
                ) : (
                  <div>
                    <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-2 mb-2">
                      <span>Position</span>
                      <span>Amount</span>
                      <span>Result</span>
                    </div>
                    {tradeHistory.slice(0, 4).map((trade) => (
                      <div
                        key={trade.id}
                        className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800 last:border-0"
                      >
                        <div className="flex items-center">
                          <span
                            className={`inline-block w-2 h-2 rounded-full mr-2 ${
                              trade.position === "buy"
                                ? "bg-green-500"
                                : "bg-red-500"
                            }`}
                          ></span>
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            {trade.position === "buy" ? "BUY" : "SELL"}
                          </span>
                        </div>
                        <span className="text-sm text-slate-600 dark:text-slate-400">
                          ${trade.amount}
                        </span>
                        <div className="text-right">
                          <span
                            className={`text-sm font-medium ${
                              trade.isWin ? "text-green-500" : "text-red-500"
                            }`}
                          >
                            {trade.isWin ? "+" : ""}$
                            {Math.abs(trade.profit).toFixed(2)}
                          </span>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {trade.time}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="mt-2 text-right">
                      <button className="text-xs text-blue-500 hover:text-blue-600 dark:hover:text-blue-400">
                        View all trades
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Trading tips */}
            <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-blue-900 rounded-xl overflow-hidden shadow-lg">
              <div className="bg-slate-50 dark:bg-gray-800 border-b border-slate-200 dark:border-blue-900 p-3">
                <h2 className="font-bold text-slate-800 dark:text-white">
                  Trading Tips
                </h2>
              </div>
              <div className="p-4 space-y-3 text-sm text-slate-600 dark:text-slate-400">
                <p>
                  <span className="text-blue-500 dark:text-blue-400">⚡</span>
                  Start with smaller investments while you learn the platform.
                </p>
                <p>
                  <span className="text-emerald-500 dark:text-emerald-400">
                    ⚡
                  </span>
                  Look for trends before placing trades.
                </p>
                <p>
                  <span className="text-amber-500 dark:text-amber-400">⚡</span>
                  Don&apos;t chase losses with larger investments.
                </p>
                <p>
                  <span className="text-purple-500 dark:text-purple-400">
                    ⚡
                  </span>
                  Set a stop-loss to protect your capital.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-gray-900 border-t border-slate-200 dark:border-gray-800 py-4 mt-12">
        <div className="container mx-auto px-4 text-center text-sm text-slate-500 dark:text-slate-400">
          <p className="mb-2">
            TradeSimulator Pro is for educational purposes only. No real money
            is involved.
          </p>
          <p>
            © 2023 TradeSimulator Pro |{" "}
            <a href="#" className="text-blue-500">
              Terms
            </a>{" "}
            |{" "}
            <a href="#" className="text-blue-500">
              Privacy
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
