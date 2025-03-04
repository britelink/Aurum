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

export function TradingChart() {
  // chartData holds an array of objects with time and price.
  const [chartData, setChartData] = useState<{ time: string; price: number }[]>(
    [],
  );
  const [lastPrice, setLastPrice] = useState(100); // starting price

  useEffect(() => {
    // Initialize chart data with the last 20 seconds
    const initialData = [];
    const now = Date.now();
    let price = lastPrice;
    for (let i = 20; i > 0; i--) {
      const time = new Date(now - i * 1000).toLocaleTimeString();
      // Simulate a small fluctuation for initial data
      price = price + (Math.random() - 0.5) * 2;
      initialData.push({ time, price: Number(price.toFixed(2)) });
    }
    setChartData(initialData);
    setLastPrice(price);

    // Update the chart every second with a new price point.
    const interval = setInterval(() => {
      const currentTime = new Date().toLocaleTimeString();
      // Simulate price fluctuation (can replace with actual data source)
      const newPrice = lastPrice + (Math.random() - 0.5) * 2;
      setLastPrice(Number(newPrice.toFixed(2)));
      const newDataPoint = {
        time: currentTime,
        price: Number(newPrice.toFixed(2)),
      };

      setChartData((prevData) => {
        const newData = [...prevData, newDataPoint];
        // Keep the last 20 data points
        if (newData.length > 20) newData.shift();
        return newData;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [lastPrice]);

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
