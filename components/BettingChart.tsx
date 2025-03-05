"use client";

import React, { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { TrendingUp } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface TradingChartProps {
  neutralAxis: number;
  sessionEndTime: number;
  onPriceUpdate: (price: number) => void;
}

interface ChartDataPoint {
  time: string;
  price: number;
  neutralAxis: number;
}

export function TradingChart({
  neutralAxis,
  sessionEndTime,
  onPriceUpdate,
}: TradingChartProps) {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [lastPrice, setLastPrice] = useState(neutralAxis);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const newPrice = lastPrice + (Math.random() - 0.5) * 2;
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
    }, 1000);

    return () => clearInterval(interval);
  }, [lastPrice, neutralAxis, onPriceUpdate]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Trading Chart</CardTitle>
        <CardDescription>
          See the live price movement as you bet on the market direction.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AreaChart
          width={500}
          height={300}
          data={chartData}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" tick={{ fill: "#8884d8", fontSize: 12 }} />
          <YAxis
            domain={["auto", "auto"]}
            tick={{ fill: "#8884d8", fontSize: 12 }}
          />
          <Tooltip />
          <Area
            type="monotone"
            dataKey="price"
            stroke="#8884d8"
            fill="#8884d8"
            fillOpacity={0.4}
          />
          <Area
            type="monotone"
            dataKey="neutralAxis"
            stroke="#82ca9d"
            fill="#82ca9d"
          />
        </AreaChart>
      </CardContent>
      <CardFooter className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          <span className="text-sm">Live Price Movement</span>
        </div>
        <div className="text-sm text-muted-foreground">
          Last updated: {new Date().toLocaleTimeString()}
        </div>
      </CardFooter>
    </Card>
  );
}
