"use client";

import React from "react";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "../convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Home() {
  // For our MVP, we assume a default free balance of $10.
  // In production, you'd fetch the current balance from the user record.
  const [balance, setBalance] = React.useState(10);
  const depositFunds = useMutation(api.aurum.depositFunds);
  const joinActiveSession = useMutation(api.aurum.joinActiveSession);
  const currentSession = useQuery(api.aurum.getCurrentSession);

  // On mount, ensure there's an active session.
  React.useEffect(() => {
    (async () => {
      await joinActiveSession({});
    })();
  }, [joinActiveSession]);

  return (
    <>
      <header className="sticky top-0 z-10 bg-background p-4 border-b-2 border-slate-200 dark:border-slate-800 flex justify-between items-center">
        <h2 className="text-lg font-bold">Aurum Betting Platform</h2>
        <SignOutButton />
      </header>
      <main className="p-8 flex flex-col gap-8">
        <h1 className="text-4xl font-bold text-center">Place Your Bets</h1>
        <Balance balance={balance} />
        <div className="flex flex-col items-center gap-4">
          <button
            className="bg-blue-500 text-white px-4 py-2 rounded"
            onClick={async () => {
              // For MVP testing, allow user to receive free funds.
              await depositFunds({ amount: 10, paymentMethod: "eco-usd" });
              setBalance((prev) => prev + 10);
            }}
          >
            Get Free $10
          </button>
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
  return (
    <div className="p-4 bg-gray-200 rounded shadow-sm text-center">
      <p className="text-lg">Your Balance: ${balance}</p>
    </div>
  );
}

function Session({ session }: { session: any }) {
  const placeBet = useMutation(api.aurum.placeBet);
  const [timeLeft, setTimeLeft] = React.useState(0);

  // Calculate countdown timer based on session.endTime.
  React.useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      if (session?.endTime) {
        const diff = session.endTime - now;
        setTimeLeft(diff > 0 ? Math.ceil(diff / 1000) : 0);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [session]);

  return (
    <div className="bg-white p-6 rounded-lg shadow-md w-full max-w-md">
      <h2 className="text-xl font-bold mb-4">Current Session</h2>
      <p className="mb-2">Neutral Axis: {session.neutralAxis.toFixed(2)}</p>
      <p className="mb-4">
        Betting ends in: {timeLeft} second{timeLeft === 1 ? "" : "s"}
      </p>
      <div className="grid grid-cols-2 gap-4">
        <button
          className="bg-green-500 text-white p-3 rounded"
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
          className="bg-red-500 text-white p-3 rounded"
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
          className="bg-green-600 text-white p-3 rounded"
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
          className="bg-red-600 text-white p-3 rounded"
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
    </div>
  );
}
