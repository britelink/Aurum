"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { TrendingUp, ArrowUp, ArrowDown } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";

interface Session {
  status: "processing" | "complete";
  processingEndTime: number;
}

interface TradingChartProps {
  neutralAxis: number;
  session: Session;
  onPriceUpdate: (price: number) => void;
}

interface ChartDataPoint {
  time: string;
  price: number;
  neutralAxis: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background border border-border p-2 rounded-md shadow-md">
        <p className="text-xs font-medium">{`Time: ${label}`}</p>
        <p className="text-xs text-primary">
          <span className="font-semibold">Price:</span>{" "}
          {payload[0].value.toFixed(2)}
        </p>
      </div>
    );
  }

  return null;
};

export function TradingChart({
  neutralAxis,
  session,
  onPriceUpdate,
}: TradingChartProps) {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [lastPrice, setLastPrice] = useState(neutralAxis);
  const [trend] = useState<"up" | "down">(() =>
    Math.random() > 0.5 ? "up" : "down",
  );

  useEffect(() => {
    if (session.status !== "processing") return;

    const interval = setInterval(() => {
      const now = Date.now();
      if (now <= session.processingEndTime) {
        const movement = trend === "up" ? 1 : -1;
        const newPrice = lastPrice + movement + (Math.random() - 0.5);
        setLastPrice(newPrice);
        onPriceUpdate(newPrice);

        setChartData((prev) => {
          const newData = [
            ...prev,
            {
              time: new Date().toLocaleTimeString(),
              price: newPrice,
              neutralAxis,
            },
          ];
          if (newData.length > 20) newData.shift();
          return newData;
        });
      }
    }, 500);

    return () => clearInterval(interval);
  }, [lastPrice, neutralAxis, session, trend, onPriceUpdate]);

  if (session.status !== "processing") return null;

  // Calculate min and max for Y-axis to ensure we show both positive and negative movements
  const minValue = Math.min(neutralAxis - 10, ...chartData.map((d) => d.price));
  const maxValue = Math.max(neutralAxis + 10, ...chartData.map((d) => d.price));
  const range = maxValue - minValue;

  // Determine if price is above or below neutral axis
  const isPriceUp = lastPrice > neutralAxis;

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-lg md:text-xl">
              Live Trading Chart
            </CardTitle>
            <CardDescription>Real-time market movement</CardDescription>
          </div>
          <div className="flex items-center gap-2 bg-muted/30 px-3 py-1 rounded-full">
            <span className="text-sm font-medium">Price: </span>
            <span
              className={`text-sm font-bold ${isPriceUp ? "text-emerald-500" : "text-rose-500"}`}
            >
              {lastPrice.toFixed(2)}
            </span>
            {isPriceUp ? (
              <ArrowUp className="h-4 w-4 text-emerald-500" />
            ) : (
              <ArrowDown className="h-4 w-4 text-rose-500" />
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-[300px] md:h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#8884d8" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="colorNeutral" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#82ca9d" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.1)"
              />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10 }}
                tickLine={{ stroke: "rgba(255,255,255,0.2)" }}
                axisLine={{ stroke: "rgba(255,255,255,0.2)" }}
                minTickGap={20}
              />
              <YAxis
                domain={[minValue - range * 0.1, maxValue + range * 0.1]}
                tick={{ fontSize: 10 }}
                tickLine={{ stroke: "rgba(255,255,255,0.2)" }}
                axisLine={{ stroke: "rgba(255,255,255,0.2)" }}
                tickFormatter={(value) => value.toFixed(1)}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine
                y={neutralAxis}
                stroke="#82ca9d"
                strokeDasharray="3 3"
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke="#8884d8"
                strokeWidth={2}
                fill="url(#colorPrice)"
                animationDuration={300}
                isAnimationActive={true}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between items-center border-t pt-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Market volatility: Medium
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          Last updated: {new Date().toLocaleTimeString()}
        </div>
      </CardFooter>
    </Card>
  );
}
