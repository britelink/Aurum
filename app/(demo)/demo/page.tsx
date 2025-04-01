"use client";
import React, { useState, useEffect } from "react";
import TradingChart from "../components/TradingChart";

export default function TradingDemoPage() {
  const [showTutorial, setShowTutorial] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState(
    Math.floor(7000 + Math.random() * 500),
  );
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

  useEffect(() => {
    const interval = setInterval(() => {
      const fluctuation = Math.floor(Math.random() * 50) - 25;
      setOnlineUsers((prev) => Math.max(7000, prev + fluctuation));
    }, 15000);

    return () => clearInterval(interval);
  }, []);

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
    setTradeHistory((prev) => [tradeData, ...prev].slice(0, 10));
  };

  const updateActivePlayers = (activePlayers: number) => {
    setOnlineUsers(7000 + activePlayers);
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
              Penny Game
            </h1>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-slate-600 dark:text-slate-400">
              <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-1"></span>
              {onlineUsers.toLocaleString()} players online
            </div>
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium">
              Play For Real
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
              How to Play
            </h2>
            <p className="text-slate-700 dark:text-slate-300 mb-3">
              It&apos;s super simple:
            </p>
            <ol className="list-decimal pl-5 text-slate-600 dark:text-slate-400 space-y-1">
              <li>Bet $1 or $2</li>
              <li>Guess if the line will go UP or DOWN</li>
              <li>Win 80% more if you&apos;re right!</li>
              <li>Lose your bet if you&apos;re wrong</li>
            </ol>
            <p className="mt-3 text-slate-700 dark:text-slate-300">
              You start with $1000 play money. Have fun!
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main chart area */}
          <div className="lg:col-span-2">
            <TradingChart
              onTradeComplete={onTradeComplete}
              onPlayersChange={updateActivePlayers}
            />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Your bets history */}
            <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-blue-900 rounded-xl overflow-hidden shadow-lg">
              <div className="bg-slate-50 dark:bg-gray-800 border-b border-slate-200 dark:border-blue-900 p-3">
                <h2 className="font-bold text-slate-800 dark:text-white">
                  Your Bets
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
                    <p>No bets yet</p>
                    <p>Make your first prediction!</p>
                  </div>
                ) : (
                  <div>
                    <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-2 mb-2">
                      <span>Prediction</span>
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
                            {trade.position === "buy" ? "UP" : "DOWN"}
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
                        View all bets
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Tips */}
            <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-blue-900 rounded-xl overflow-hidden shadow-lg">
              <div className="bg-slate-50 dark:bg-gray-800 border-b border-slate-200 dark:border-blue-900 p-3">
                <h2 className="font-bold text-slate-800 dark:text-white">
                  Quick Tips
                </h2>
              </div>
              <div className="p-4 space-y-3 text-sm text-slate-600 dark:text-slate-400">
                <p>
                  <span className="text-blue-500 dark:text-blue-400">👉</span>
                  Start with $1 bets until you get the hang of it.
                </p>
                <p>
                  <span className="text-emerald-500 dark:text-emerald-400">
                    👉
                  </span>
                  Watch if the line is trending up or down before betting.
                </p>
                <p>
                  <span className="text-amber-500 dark:text-amber-400">👉</span>
                  Don&apos;t bet bigger after losing - stay consistent.
                </p>
                <p>
                  <span className="text-purple-500 dark:text-purple-400">
                    👉
                  </span>
                  Have fun! It&apos;s just a game!
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
            Up or Down is for fun only. No real money is involved in the demo.
          </p>
          <p>
            © 2023 Up or Down |{" "}
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
