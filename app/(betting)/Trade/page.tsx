/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React from "react";
import { useQuery, useMutation, useConvexAuth } from "convex/react";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TradingChart } from "@/components/BettingChart";
import type { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowUpIcon,
  ArrowDownIcon,
  BarChart2Icon,
  DollarSignIcon,
} from "lucide-react";
import { api } from "@/convex/_generated/api";

interface Session {
  _id: Id<"sessions">;
  status: "open" | "closed" | "pending" | "processing";
  endTime: number;
  processingEndTime: number;
  neutralAxis: number;
  winner?: "buyers" | "sellers" | "neutral";
}

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
    return (
      <div className="flex items-center justify-center h-screen">
        <Card>
          <CardContent className="p-6">
            <p className="text-lg font-semibold mb-4">
              Please sign in to continue
            </p>
            <Button asChild>
              <Link href="/signin">Sign In</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800">
      <header className="sticky top-0 z-10 bg-gray-800/80 backdrop-blur-sm p-4 border-b border-gray-700 flex justify-between items-center">
        <h2 className="text-xl font-bold text-white">Penny Betting Platform</h2>
        <SignOutButton />
      </header>
      <main className="container mx-auto p-4 md:p-8">
        <h1 className="text-4xl font-bold text-center text-white mb-8">
          Place Your Bets
        </h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Current Session</CardTitle>
            </CardHeader>
            <CardContent>
              {currentSession ? (
                <Session session={currentSession} />
              ) : (
                <p className="text-center text-gray-400">Loading session...</p>
              )}
            </CardContent>
          </Card>
          <div className="space-y-8">
            <Balance balance={user?.balance || 0} />
            <BettingHistory />
          </div>
        </div>
      </main>
    </div>
  );
}

function SignOutButton() {
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const router = useRouter();
  return (
    <>
      {isAuthenticated && (
        <Button
          variant="outline"
          onClick={async () => {
            await signOut();
            router.push("/signin");
          }}
        >
          Sign out
        </Button>
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <DollarSignIcon className="mr-2" />
          Balance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold mb-4">${balance.toFixed(2)}</p>
        {balance === 0 && (
          <Button
            onClick={handleDeposit}
            disabled={isDepositing}
            className="w-full"
          >
            {isDepositing ? "Depositing..." : "Deposit $10"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function Session({ session }: { session: Session }) {
  const placeBet = useMutation(api.aurum.placeBet);
  const [timeLeft, setTimeLeft] = React.useState(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [priceDirection, setPriceDirection] = React.useState<
    "up" | "down" | null
  >(null);

  React.useEffect(() => {
    if (!session) return;

    const updateTimeLeft = () => {
      const now = Date.now();
      if (session.status === "open") {
        const remaining = Math.max(
          0,
          Math.ceil((session.endTime - now) / 1000),
        );
        setTimeLeft(remaining);
      } else if (session.status === "processing") {
        const remaining = Math.max(
          0,
          Math.ceil((session.processingEndTime - now) / 1000),
        );
        setTimeLeft(remaining);
      }
    };

    updateTimeLeft();
    const interval = setInterval(updateTimeLeft, 100);
    return () => clearInterval(interval);
  }, [session]);

  return (
    <div className="space-y-6">
      {session.status === "open" && (
        <>
          <div className="flex justify-between items-center">
            <p className="text-lg font-semibold">Betting ends in:</p>
            <p className="text-3xl font-bold text-yellow-400">{timeLeft}s</p>
          </div>
          <BettingButtons session={session} placeBet={placeBet} />
        </>
      )}

      {session.status === "processing" && (
        <>
          <div className="flex justify-between items-center mb-4">
            <p className="text-lg font-semibold">Price Movement Phase:</p>
            <p className="text-3xl font-bold text-yellow-400">
              {timeLeft}s remaining
            </p>
          </div>
          <TradingChart
            neutralAxis={session.neutralAxis}
            session={session}
            onPriceUpdate={(price: number) => {
              setPriceDirection(price > session.neutralAxis ? "up" : "down");
            }}
          />
        </>
      )}

      {session.status === "closed" && session.winner && (
        <WinnerDisplay winner={session.winner} />
      )}
    </div>
  );
}

function BettingButtons({ session, placeBet }: BettingButtonsProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Button
        variant="outline"
        size="lg"
        className="bg-green-600 hover:bg-green-700 text-white"
        disabled={session.status !== "open"}
        onClick={() =>
          placeBet({ sessionId: session._id, amount: 1, direction: "up" })
        }
      >
        <ArrowUpIcon className="mr-2" /> Bet $1 (Up)
      </Button>
      <Button
        variant="outline"
        size="lg"
        className="bg-red-600 hover:bg-red-700 text-white"
        disabled={session.status !== "open"}
        onClick={() =>
          placeBet({ sessionId: session._id, amount: 1, direction: "down" })
        }
      >
        <ArrowDownIcon className="mr-2" /> Bet $1 (Down)
      </Button>
      <Button
        variant="outline"
        size="lg"
        className="bg-green-700 hover:bg-green-800 text-white"
        disabled={session.status !== "open"}
        onClick={() =>
          placeBet({ sessionId: session._id, amount: 2, direction: "up" })
        }
      >
        <ArrowUpIcon className="mr-2" /> Bet $2 (Up)
      </Button>
      <Button
        variant="outline"
        size="lg"
        className="bg-red-700 hover:bg-red-800 text-white"
        disabled={session.status !== "open"}
        onClick={() =>
          placeBet({ sessionId: session._id, amount: 2, direction: "down" })
        }
      >
        <ArrowDownIcon className="mr-2" /> Bet $2 (Down)
      </Button>
    </div>
  );
}

function WinnerDisplay({
  winner,
}: {
  winner: "buyers" | "sellers" | "neutral";
}) {
  return (
    <div className="text-center p-6 bg-gray-700 rounded-lg">
      <h3 className="text-2xl font-bold mb-2">Session Result</h3>
      <p className="text-3xl font-bold text-green-400">
        Winner:{" "}
        {winner === "buyers" ? "Up" : winner === "sellers" ? "Down" : "Tie"}
      </p>
    </div>
  );
}

function BettingHistory() {
  // This is a placeholder. You would typically fetch this data from your API.
  const history = [
    { id: 1, date: "2023-05-01", amount: 1, direction: "up", result: "win" },
    { id: 2, date: "2023-05-02", amount: 2, direction: "down", result: "loss" },
    { id: 3, date: "2023-05-03", amount: 1, direction: "up", result: "win" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <BarChart2Icon className="mr-2" />
          Betting History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="all">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="wins">Wins</TabsTrigger>
            <TabsTrigger value="losses">Losses</TabsTrigger>
          </TabsList>
          <TabsContent value="all">
            <ul className="space-y-2">
              {history.map((bet) => (
                <li
                  key={bet.id}
                  className="flex justify-between items-center p-2 bg-gray-700 rounded"
                >
                  <span>{new Date(bet.date).toLocaleDateString()}</span>
                  <span
                    className={
                      bet.result === "win" ? "text-green-400" : "text-red-400"
                    }
                  >
                    ${bet.amount} {bet.direction === "up" ? "↑" : "↓"}
                  </span>
                </li>
              ))}
            </ul>
          </TabsContent>
          <TabsContent value="wins">
            {/* Filter and display only wins */}
          </TabsContent>
          <TabsContent value="losses">
            {/* Filter and display only losses */}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
