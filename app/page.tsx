"use client";

import React, { useEffect } from "react";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "../convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TradingChart } from "@/components/BettingChart";

interface Session {
  _id: Id<"sessions">;
  status: "open" | "closed" | "pending";
  endTime: number;
  neutralAxis: number;
  winner?: "buyers" | "sellers" | "neutral";
}

type SessionStatus = "open" | "closed" | "pending" | "processing";
type PriceDirection = "up" | "down" | null;

interface BettingButtonsProps {
  session: Session;
  placeBet: (args: {
    sessionId: Id<"sessions">;
    amount: 1 | 2;
    direction: "up" | "down";
  }) => Promise<any>;
}

export default function Home() {
  const { isAuthenticated } = useConvexAuth();
  const currentSession = useQuery(api.session.getCurrentSession);
  const user = useQuery(api.aurum.getCurrentUser);

  if (!isAuthenticated) {
    return <div>Please sign in to continue</div>;
  }

  return (
    <>
      <header className="sticky top-0 z-10 bg-background p-4 border-b-2 border-slate-200 dark:border-slate-800 flex justify-between items-center">
        <h2 className="text-lg font-bold">Aurum Betting Platform</h2>
        <SignOutButton />
      </header>
      <main className="p-8 flex flex-col gap-8">
        <h1 className="text-4xl font-bold text-center">Place Your Bets</h1>
        <Balance balance={user?.balance || 0} />
        <div className="flex flex-col items-center gap-4">
          {currentSession ? (
            <Session session={currentSession} />
          ) : (
            <p>Loading session...</p>
          )}
        </div>
      </main>
    </>
  );
}

function SignOutButton() {
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const router = useRouter();
  return (
    <>
      {isAuthenticated && (
        <button
          className="bg-slate-200 dark:bg-slate-800 text-foreground rounded px-2 py-1"
          onClick={async () => {
            await signOut();
            router.push("/signin");
          }}
        >
          Sign out
        </button>
      )}
    </>
  );
}

function Balance({ balance }: { balance: number }) {
  const depositFunds = useMutation(api.aurum.depositFunds);
  const [isDepositing, setIsDepositing] = React.useState(false);

  const handleDeposit = async () => {
    try {
      setIsDepositing(true);
      await depositFunds({
        amount: 10,
        paymentMethod: "eco-usd",
      });
    } catch (error) {
      console.error("Failed to deposit:", error);
    } finally {
      setIsDepositing(false);
    }
  };

  return (
    <div className="p-4 bg-gray-800 rounded shadow-sm text-center">
      <p className="text-lg text-white">Your Balance: ${balance}</p>
      {balance === 0 && (
        <button
          onClick={handleDeposit}
          disabled={isDepositing}
          className={`mt-2 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors ${
            isDepositing ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          {isDepositing ? "Depositing..." : "Deposit $10"}
        </button>
      )}
    </div>
  );
}

function Session({ session }: { session: Session }) {
  const placeBet = useMutation(api.aurum.placeBet);
  const [timeLeft, setTimeLeft] = React.useState(0);
  const [sessionStatus, setSessionStatus] = React.useState<SessionStatus>(
    session?.status,
  );
  const [winner, setWinner] = React.useState(session?.winner);
  const [priceDirection, setPriceDirection] =
    React.useState<PriceDirection>(null);
  const [phase, setPhase] = React.useState<
    "betting" | "processing" | "results"
  >("betting");

  React.useEffect(() => {
    if (!session) return;

    const updateStatus = () => {
      const now = Date.now();
      const diff = session.endTime - now;

      if (diff > 0) {
        setTimeLeft(Math.ceil(diff / 1000));
        setPhase("betting");
        setSessionStatus("open");
      } else if (now < session.endTime + 10000) {
        setTimeLeft(Math.ceil((session.endTime + 10000 - now) / 1000));
        setPhase("processing");
        setSessionStatus("processing");
      } else {
        setPhase("results");
        setSessionStatus("closed");
        setWinner(session.winner);
      }
    };

    updateStatus();
    const interval = setInterval(updateStatus, 500);
    return () => clearInterval(interval);
  }, [session]);

  return (
    <div className="bg-gray-800 p-6 rounded-lg shadow-md w-full max-w-md">
      <h2 className="text-xl font-bold mb-4 text-white">Current Session</h2>

      {phase === "betting" && (
        <>
          <p className="mb-4 text-gray-300">Betting ends in: {timeLeft}s</p>
          <BettingButtons session={session} placeBet={placeBet} />
        </>
      )}

      {phase === "processing" && (
        <>
          <p className="mb-4 text-yellow-300">
            Price Movement Phase: {timeLeft}s remaining
          </p>
          {priceDirection && (
            <p className="text-xl font-bold text-white">
              Trending {priceDirection}! 🚀
            </p>
          )}
        </>
      )}

      {phase === "results" && winner && <WinnerDisplay winner={winner} />}

      <TradingChart
        neutralAxis={session.neutralAxis}
        sessionEndTime={session.endTime}
        onPriceUpdate={(price: number) => {
          if (phase === "processing") {
            setPriceDirection(price > session.neutralAxis ? "up" : "down");
          }
        }}
      />
    </div>
  );
}

function BettingButtons({ session, placeBet }: BettingButtonsProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <button
        className={`bg-green-600 text-white p-3 rounded transition-colors ${
          session.status !== "open"
            ? "opacity-50 cursor-not-allowed"
            : "hover:bg-green-700"
        }`}
        disabled={session.status !== "open"}
        onClick={() =>
          placeBet({
            sessionId: session._id,
            amount: 1,
            direction: "up",
          })
        }
      >
        Bet $1 (Up)
      </button>
      <button
        className={`bg-red-600 text-white p-3 rounded transition-colors ${
          session.status !== "open"
            ? "opacity-50 cursor-not-allowed"
            : "hover:bg-red-700"
        }`}
        disabled={session.status !== "open"}
        onClick={() =>
          placeBet({
            sessionId: session._id,
            amount: 1,
            direction: "down",
          })
        }
      >
        Bet $1 (Down)
      </button>
      <button
        className={`bg-green-700 text-white p-3 rounded transition-colors ${
          session.status !== "open"
            ? "opacity-50 cursor-not-allowed"
            : "hover:bg-green-800"
        }`}
        disabled={session.status !== "open"}
        onClick={() =>
          placeBet({
            sessionId: session._id,
            amount: 2,
            direction: "up",
          })
        }
      >
        Bet $2 (Up)
      </button>
      <button
        className={`bg-red-700 text-white p-3 rounded transition-colors ${
          session.status !== "open"
            ? "opacity-50 cursor-not-allowed"
            : "hover:bg-red-800"
        }`}
        disabled={session.status !== "open"}
        onClick={() =>
          placeBet({
            sessionId: session._id,
            amount: 2,
            direction: "down",
          })
        }
      >
        Bet $2 (Down)
      </button>
    </div>
  );
}

function WinnerDisplay({
  winner,
}: {
  winner: "buyers" | "sellers" | "neutral";
}) {
  return (
    <p className="mb-4 text-green-300">
      Winner:{" "}
      {winner === "buyers" ? "Up" : winner === "sellers" ? "Down" : "Tie"}
    </p>
  );
}
