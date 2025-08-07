"use client";

import React, { useState, useEffect, useRef } from "react";
import { Area, AreaChart, XAxis, YAxis, PieChart, Pie, Label } from "recharts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Header from "@/components/Header";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

interface AssetData {
  name: string;
  value: number;
  change: number;
  changePercent: number;
  icon: string;
  color: string;
}

interface BaseAsset {
  name: string;
  baseValue: number;
  baseChange: number;
  icon: string;
  isComposite: boolean;
  composition?: { name: string; weight: number }[];
}

const baseAssetData = {
  indices: [
    {
      name: "Real Estate Index Fund",
      baseValue: 2850000,
      baseChange: 125000,
      icon: "REIF",
      isComposite: true,
      composition: [
        { name: "Manhattan Luxury", weight: 25 },
        { name: "Beverly Hills", weight: 20 },
        { name: "Miami Beach", weight: 18 },
        { name: "Data Centers", weight: 15 },
        { name: "Office REITs", weight: 12 },
        { name: "Industrial Parks", weight: 10 }
      ]
    },
    {
      name: "Luxury Property Index",
      baseValue: 4250000,
      baseChange: 180000,
      icon: "LPI",
      isComposite: true,
      composition: [
        { name: "Beverly Hills", weight: 35 },
        { name: "Manhattan Luxury", weight: 30 },
        { name: "Miami Beach", weight: 20 },
        { name: "Austin Downtown", weight: 15 }
      ]
    },
    {
      name: "Commercial REIT Index",
      baseValue: 1920000,
      baseChange: -45000,
      icon: "CRI",
      isComposite: true,
      composition: [
        { name: "Office REITs", weight: 40 },
        { name: "Retail Centers", weight: 25 },
        { name: "Industrial Parks", weight: 20 },
        { name: "Data Centers", weight: 15 }
      ]
    }
  ],
  commercial: [
    {
      name: "Manhattan Office Tower",
      baseValue: 12500000,
      baseChange: 250000,
      icon: "MOT",
      isComposite: false
    },
    {
      name: "Silicon Valley Tech Campus",
      baseValue: 8750000,
      baseChange: -125000,
      icon: "STC",
      isComposite: false
    },
    {
      name: "Chicago Retail Complex",
      baseValue: 4250000,
      baseChange: 85000,
      icon: "CRC",
      isComposite: false
    },
    {
      name: "Miami Data Center",
      baseValue: 15750000,
      baseChange: 320000,
      icon: "MDC",
      isComposite: false
    },
    {
      name: "LA Industrial Park",
      baseValue: 6500000,
      baseChange: 145000,
      icon: "LIP",
      isComposite: false
    },
    {
      name: "Seattle Office Building",
      baseValue: 9250000,
      baseChange: -75000,
      icon: "SOB",
      isComposite: false
    }
  ],
  residential: [
    {
      name: "Beverly Hills Mansion",
      baseValue: 8500000,
      baseChange: 425000,
      icon: "BHM",
      isComposite: false
    },
    {
      name: "Manhattan Penthouse",
      baseValue: 12000000,
      baseChange: 275000,
      icon: "MP",
      isComposite: false
    },
    {
      name: "Miami Beach Condo",
      baseValue: 2850000,
      baseChange: -65000,
      icon: "MBC",
      isComposite: false
    },
    {
      name: "Austin Family Home",
      baseValue: 875000,
      baseChange: 35000,
      icon: "AFH",
      isComposite: false
    },
    {
      name: "San Francisco Townhouse",
      baseValue: 3250000,
      baseChange: 125000,
      icon: "SFT",
      isComposite: false
    },
    {
      name: "Chicago Apartment Complex",
      baseValue: 5750000,
      baseChange: -95000,
      icon: "CAC",
      isComposite: false
    }
  ],
};

const generateDynamicAssetData = (category: keyof typeof baseAssetData) => {
  const categoryData = baseAssetData[category];
  if (!categoryData || !Array.isArray(categoryData)) {
    console.warn('Invalid category or no data for:', category, 'Available categories:', Object.keys(baseAssetData));
    return [];
  }
  return categoryData.map((asset: BaseAsset) => {
    // Add some randomness to simulate real-time price movements
    const volatility =
      asset.baseValue > 1000000
        ? 0.015
        : asset.baseValue > 1000
        ? 0.025
        : 0.035;
    const randomMultiplier = 1 + (Math.random() - 0.5) * volatility;
    const currentValue = asset.baseValue * randomMultiplier;
    const currentChange = asset.baseChange * (0.8 + Math.random() * 0.4); // ±20% variation from base
    const changePercent = (currentChange / currentValue) * 100;

    return {
      name: asset.name,
      value: currentValue,
      change: currentChange,
      changePercent,
      icon: asset.icon,
      color: currentChange >= 0 ? "text-green-400" : "text-red-400",
    };
  });
};

type TimeFrame = "1D" | "1M" | "3M" | "1Y" | "5Y" | "All";

const generateChartData = (timeFrame: TimeFrame) => {
  const data: { time: string; price: number }[] = [];
  const basePrice = 2_850_000; // starting price anchor
  const now = new Date();

  // helper to format labels
  const format = (d: Date, fmt: TimeFrame) => {
    if (fmt === "1D") {
      const h = d.getHours().toString().padStart(2, "0");
      const m = d.getMinutes().toString().padStart(2, "0");
      return `${h}:${m}`;
    }
    if (fmt === "1M" || fmt === "3M") {
      return `${d.getMonth() + 1}/${d.getDate()}`; // MM/DD
    }
    // 1Y, 5Y, All
    return `${d.getFullYear()}-${(d.getMonth() + 1)
      .toString()
      .padStart(2, "0")}`; // YYYY-MM
  };

  // configuration per timeframe
  let points: number;
  let stepMs: number;
  switch (timeFrame) {
    case "1D":
      points = 48; // last 24h, 30m intervals
      stepMs = 30 * 60 * 1000;
      break;
    case "1M":
      points = 30; // daily
      stepMs = 24 * 60 * 60 * 1000;
      break;
    case "3M":
      points = 12; // weekly
      stepMs = 7 * 24 * 60 * 60 * 1000;
      break;
    case "1Y":
      points = 12; // monthly
      stepMs = 30 * 24 * 60 * 60 * 1000;
      break;
    case "5Y":
      points = 60; // monthly
      stepMs = 30 * 24 * 60 * 60 * 1000;
      break;
    default:
      points = 40; // quarterly over ~10y
      stepMs = 90 * 24 * 60 * 60 * 1000;
  }

  for (let i = points - 1; i >= 0; i--) {
    const t = new Date(now.getTime() - i * stepMs);

    // drift + noise tuned per timeframe
    const drift =
      timeFrame === "1D"
        ? Math.sin((points - i) / 6) * 40_000
        : timeFrame === "1M"
        ? Math.sin((points - i) / 3) * 60_000
        : timeFrame === "3M"
        ? Math.sin((points - i) / 2) * 120_000
        : timeFrame === "1Y"
        ? Math.sin((points - i) / 2) * 220_000
        : Math.sin((points - i) / 2) * 350_000;

    const noiseScale =
      timeFrame === "1D"
        ? 50_000
        : timeFrame === "1M"
        ? 80_000
        : timeFrame === "3M"
        ? 120_000
        : timeFrame === "1Y"
        ? 220_000
        : 400_000;

    const price = basePrice + drift + (Math.random() - 0.5) * noiseScale;
    data.push({ time: format(t, timeFrame), price });
  }

  return data;
};

const chartConfig = {
  price: {
    label: "Price",
    color: "#6b7280", // Grey color instead of blue
  },
} satisfies ChartConfig;

const timeFrames = ["1D", "1M", "3M", "1Y", "5Y", "All"];

export default function AssetChart() {
  const [selectedCategory, setSelectedCategory] = useState("indices");
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [selectedTimeFrame, setSelectedTimeFrame] = useState("1D");
  const [chartData, setChartData] = useState(generateChartData("1D"));
  const [assetData, setAssetData] = useState<AssetData[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<AssetData | null>(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [expandedAssets, setExpandedAssets] = useState<{[key: string]: number}>({});
  const [viewMode, setViewMode] = useState<"chart" | "index">("chart");

  // Initialize data on component mount
  useEffect(() => {
    const initialData = generateDynamicAssetData("indices");
    setAssetData(initialData);
    setSelectedAsset(initialData[0] || null);
  }, []);

  // Update data every 3 seconds to simulate real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      let category: keyof typeof baseAssetData;
      
      if (selectedCategory === 'properties') {
        category = selectedSubcategory as keyof typeof baseAssetData || 'residential';
      } else {
        category = selectedCategory as keyof typeof baseAssetData;
      }
      
      setAssetData(generateDynamicAssetData(category));
      setChartData(generateChartData(selectedTimeFrame as TimeFrame));
      setLastUpdate(new Date());
    }, 3000);

    return () => clearInterval(interval);
  }, [selectedCategory, selectedSubcategory, selectedTimeFrame]);

  // Update asset data when category changes
  useEffect(() => {
    let category: keyof typeof baseAssetData;
    
    if (selectedCategory === 'properties') {
      // Auto-select commercial if no subcategory is selected
      if (!selectedSubcategory) {
        setSelectedSubcategory('commercial');
        category = 'commercial';
      } else {
        category = selectedSubcategory as keyof typeof baseAssetData;
      }
    } else {
      category = selectedCategory as keyof typeof baseAssetData;
    }
    
    const newData = generateDynamicAssetData(category);
    setAssetData(newData);
    setSelectedAsset(newData[0] || null);
    
    // Reset expanded assets when switching categories
    setExpandedAssets({});
    
    // Reset subcategory when switching to indices
    if (selectedCategory === 'indices') {
      setSelectedSubcategory(null);
    }
  }, [selectedCategory, selectedSubcategory]);

  // Update chart data immediately when timeframe changes
  useEffect(() => {
    setChartData(generateChartData(selectedTimeFrame as TimeFrame));
  }, [selectedTimeFrame]);

  const mainAsset = selectedAsset || assetData[0];
  const composition = React.useMemo(() => {
    if (selectedCategory === "indices" && mainAsset && baseAssetData.indices.find(asset => asset.name === mainAsset.name)?.composition) {
      const baseAsset = baseAssetData.indices.find(asset => asset.name === mainAsset.name);
      return baseAsset!.composition.map((comp, idx) => ({
        name: comp.name,
        weight: comp.weight,
        fill: `hsl(${(idx * 60) % 360} 65% 55%)`,
      }));
    }
    return [];
  }, [assetData, selectedCategory, mainAsset]);

  const handleAssetSelect = (asset: AssetData) => {
    setSelectedAsset(asset);
    // Generate new chart data based on selected asset (you could customize this per asset)
    setChartData(generateChartData(selectedTimeFrame as TimeFrame));
  };

  const shouldShowPieChart = selectedCategory === "indices" && composition.length > 0;

  const getDisplayAssets = () => {
    let category: keyof typeof baseAssetData;
    
    if (selectedCategory === 'properties') {
      category = selectedSubcategory as keyof typeof baseAssetData || 'commercial';
    } else {
      category = selectedCategory as keyof typeof baseAssetData;
    }
    
    const categoryAssets = generateDynamicAssetData(category);
    const expandedCount = expandedAssets[category] || 4;
    return categoryAssets.slice(0, expandedCount);
  };

  const hasMoreAssets = () => {
    let category: keyof typeof baseAssetData;
    
    if (selectedCategory === 'properties') {
      category = selectedSubcategory as keyof typeof baseAssetData || 'commercial';
    } else {
      category = selectedCategory as keyof typeof baseAssetData;
    }
    
    const categoryAssets = baseAssetData[category] || [];
    const expandedCount = expandedAssets[category] || 4;
    return categoryAssets.length > expandedCount;
  };

  const loadMoreAssets = () => {
    let category: keyof typeof baseAssetData;
    
    if (selectedCategory === 'properties') {
      category = selectedSubcategory as keyof typeof baseAssetData || 'commercial';
    } else {
      category = selectedCategory as keyof typeof baseAssetData;
    }
    
    const currentCount = expandedAssets[category] || 4;
    setExpandedAssets(prev => ({
      ...prev,
      [category]: Math.min(currentCount + 4, (baseAssetData[category] || []).length)
    }));
  };

  return (
    <div className="w-screen min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)] p-0 flex flex-col overflow-y-auto">
      <Header />
      <div className="px-2 pt-2 flex flex-col">
        <Tabs
          value={selectedCategory}
          onValueChange={setSelectedCategory}
          className="w-full flex flex-col"
        >
          <div className="flex gap-4 flex-1">
            <div
              className="flex-1 flex flex-col"
              style={{ flexBasis: "83.333333%" }}
            >
              {/* controls just above the chart */}
              <div className="flex items-center justify-between mt-auto gap-3 mb-2 py-6">
                <div className="flex gap-2">
                  <TabsList className="grid w-fit grid-cols-2 bg-[color:var(--muted)]/80 border border-[color:var(--border)]">
                    <TabsTrigger
                      value="indices"
                      className="text-sm text-[color:var(--muted-foreground)] data-[state=active]:bg-[color:var(--border)] data-[state=active]:text-[color:var(--foreground)]"
                    >
                      Indices
                    </TabsTrigger>
                    <TabsTrigger
                      value="properties"
                      className="text-sm text-[color:var(--muted-foreground)] data-[state=active]:bg-[color:var(--border)] data-[state=active]:text-[color:var(--foreground)]"
                    >
                      Properties
                    </TabsTrigger>
                  </TabsList>
                  {selectedCategory === "properties" && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => setSelectedSubcategory(selectedSubcategory === "commercial" ? null : "commercial")}
                        className={cn(
                          "px-3 py-2 text-sm rounded-md border transition-colors",
                          selectedSubcategory === "commercial"
                            ? "bg-[color:var(--border)] text-[color:var(--foreground)] border-[color:var(--border)]"
                            : "bg-[color:var(--muted)]/80 text-[color:var(--muted-foreground)] border-[color:var(--border)] hover:bg-[color:var(--border)]/30"
                        )}
                      >
                        Commercial
                      </button>
                      <button
                        onClick={() => setSelectedSubcategory(selectedSubcategory === "residential" ? null : "residential")}
                        className={cn(
                          "px-3 py-2 text-sm rounded-md border transition-colors",
                          selectedSubcategory === "residential"
                            ? "bg-[color:var(--border)] text-[color:var(--foreground)] border-[color:var(--border)]"
                            : "bg-[color:var(--muted)]/80 text-[color:var(--muted-foreground)] border-[color:var(--border)] hover:bg-[color:var(--border)]/30"
                        )}
                      >
                        Residential
                      </button>
                    </div>
                  )}
                </div>
                <Tabs
                  value={selectedTimeFrame}
                  onValueChange={(v) => setSelectedTimeFrame(v)}
                >
                  <TabsList className="grid grid-flow-col auto-cols-max bg-[color:var(--muted)]/80 border border-[color:var(--border)]">
                    {timeFrames.map((timeFrame) => (
                      <TabsTrigger
                        key={timeFrame}
                        value={timeFrame}
                        className="text-xs px-3 py-1 text-[color:var(--muted-foreground)] data-[state=active]:bg-[color:var(--border)] data-[state=active]:text-[color:var(--foreground)]"
                      >
                        {timeFrame}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                {shouldShowPieChart && (
                  <Tabs
                    value={viewMode}
                    onValueChange={(v) => setViewMode(v as any)}
                  >
                    <TabsList className="grid grid-flow-col auto-cols-max bg-[color:var(--muted)]/80 border border-[color:var(--border)]">
                      <TabsTrigger
                        value="chart"
                        className="text-xs px-3 py-1 text-[color:var(--muted-foreground)] data-[state=active]:bg-[color:var(--border)] data-[state=active]:text-[color:var(--foreground)]"
                      >
                        Price
                      </TabsTrigger>
                      <TabsTrigger
                        value="index"
                        className="text-xs px-3 py-1 text-[color:var(--muted-foreground)] data-[state=active]:bg-[color:var(--border)] data-[state=active]:text-[color:var(--foreground)]"
                      >
                        Composition
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                )}
                <div className="text-[10px] leading-none text-[color:var(--muted-foreground)]">
                  Last updated: {lastUpdate.toLocaleTimeString()}
                </div>
              </div>
              
              <div className="flex items-center gap-3 mb-4 overflow-x-auto">
                {getDisplayAssets().slice(0, 4).map((asset, index) => (
                  <button
                    key={asset.name}
                    onClick={() => handleAssetSelect(asset)}
                    className={cn(
                      "flex items-center gap-2 flex-shrink-0 p-2 rounded border transition-all",
                      selectedAsset?.name === asset.name 
                        ? "border-blue-400 bg-blue-400/10" 
                        : "border-[color:var(--border)] hover:bg-[color:var(--muted)]/60"
                    )}
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white border border-gray-600",
                        index === 0
                          ? "bg-emerald-600"
                          : index === 1
                          ? "bg-blue-600"
                          : index === 2
                          ? "bg-violet-600"
                          : "bg-orange-600"
                      )}
                    >
                      {asset.icon || asset.name.slice(0, 3)}
                    </div>
                    <div>
                      <div className="font-medium text-sm dark:text-gray-200 text-gray-700 text-left mb-1">
                        {asset.name.length > 15 ? asset.name.substring(0, 12) + "..." : asset.name}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-bold dark:text-white text-gray-900">
                          {asset.value >= 1000000
                            ? `$${(asset.value / 1000000).toFixed(1)}M`
                            : asset.value >= 1000
                            ? `$${(asset.value / 1000).toFixed(0)}K`
                            : `$${asset.value.toFixed(0)}`}
                        </div>
                        <div
                          className={cn(
                            "text-xs font-medium",
                            asset.change >= 0 ? "text-green-500" : "text-red-500"
                          )}
                        >
                          {asset.change >= 0 ? "+" : ""}
                          {asset.changePercent.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
                {hasMoreAssets() && (
                  <button 
                    onClick={loadMoreAssets}
                    className="dark:text-gray-400 text-gray-600 dark:hover:text-gray-200 hover:text-gray-800 flex-shrink-0 ml-1 p-1 hover:bg-[color:var(--muted)]/60 rounded-md transition-colors"
                    title="Load more assets"
                  >
                    →
                  </button>
                )}
              </div>

              <ChartContainer
                config={chartConfig}
                className="w-full h-[55vh] mt-2 mb-2"
              >
                {(!shouldShowPieChart || viewMode === "chart") ? (
                  <AreaChart
                    data={chartData}
                    margin={{ left: 24, right: 24, top: 16, bottom: 16 }}
                  >
                    <XAxis
                      dataKey="time"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={12}
                      tickFormatter={(value) => String(value)}
                    />
                    <YAxis
                      domain={["dataMin - 10", "dataMax + 10"]}
                      tickLine={false}
                      axisLine={false}
                      tickMargin={12}
                      tickFormatter={(value) => value.toFixed(0)}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={<ChartTooltipContent />}
                    />
                    <defs>
                      <linearGradient
                        id="fillPrice"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#60a5fa"
                          stopOpacity={0.25}
                        />
                        <stop
                          offset="100%"
                          stopColor="#111827"
                          stopOpacity={0.05}
                        />
                      </linearGradient>
                    </defs>
                    <Area
                      dataKey="price"
                      type="monotone"
                      fill="url(#fillPrice)"
                      stroke="#9ca3af"
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <div className="flex flex-col items-center">
                      <PieChart width={320} height={320}>
                        <Pie
                          data={composition}
                          dataKey="weight"
                          nameKey="name"
                          innerRadius={80}
                          outerRadius={110}
                          strokeWidth={3}
                        />
                        <Label
                          content={({ viewBox }) => {
                            // @ts-ignore
                            if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                              return (
                                <text
                                  x={viewBox.cx}
                                  y={viewBox.cy}
                                  textAnchor="middle"
                                  dominantBaseline="middle"
                                >
                                  <tspan className="fill-foreground text-xl font-semibold">
                                    {mainAsset?.name?.split(' ')[0] || 'Index'}
                                  </tspan>
                                  <tspan
                                    x={viewBox.cx}
                                    y={(viewBox.cy || 0) + 16}
                                    className="fill-muted-foreground text-xs"
                                  >
                                    {composition.length} assets
                                  </tspan>
                                </text>
                              );
                            }
                            return null;
                          }}
                        />
                      </PieChart>
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                        {composition.map((p) => (
                          <div key={p.name} className="flex items-center gap-2">
                            <span
                              className="h-2 w-2 rounded"
                              style={{ background: p.fill }}
                            />
                            <span className="truncate">{p.name}</span>
                            <span className="ml-auto tabular-nums">
                              {p.weight}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </ChartContainer>

              {/* controls are above the chart now */}
            </div>

            <div
              className="flex flex-col h-full bg-[color:var(--muted)]/80 rounded-lg border border-[color:var(--border)] p-3 overflow-hidden"
              style={{ flexBasis: "16.666667%" }}
            >
              <div className="flex justify-between items-center text-[11px] font-bold uppercase tracking-wide text-[color:var(--foreground)]/90 bg-[color:var(--border)]/40 rounded-md px-2 py-1 mb-2 border border-[color:var(--border)]">
                <span>Symbol</span>
                <span>Last</span>
                <span>Change</span>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-[color:var(--border)]/80">
                {getDisplayAssets().map((asset) => (
                  <div
                    key={asset.name}
                    className={cn(
                      "flex justify-between items-center py-2 px-2 hover:bg-[color:var(--border)]/30 transition-colors cursor-pointer",
                      selectedAsset?.name === asset.name && "bg-[color:var(--border)]/50 border-l-2 border-l-blue-400"
                    )}
                    onClick={() => handleAssetSelect(asset)}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span
                        className="font-medium text-xs truncate text-[color:var(--foreground)]/95"
                        title={asset.name}
                      >
                        {asset.name.length > 12
                          ? asset.name.substring(0, 10) + "..."
                          : asset.name}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-[color:var(--foreground)]">
                      {asset.value >= 1000000
                        ? `$${(asset.value / 1000000).toFixed(1)}M`
                        : asset.value >= 1000
                        ? `$${(asset.value / 1000).toFixed(0)}K`
                        : `$${asset.value.toFixed(0)}`}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-medium",
                        asset.change >= 0 ? "text-emerald-400" : "text-rose-400"
                      )}
                    >
                      {asset.change >= 0 ? "+" : ""}
                      {asset.changePercent.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Tabs>
      </div>
      {/* Lazy company info section (below the fold) */}
      <LazyCompanyInfo
        selectedName={mainAsset?.name}
      />
    </div>
  );
}

function LazyCompanyInfo({
  selectedName,
}: {
  selectedName?: string;
  categoryData?: { name: string; value: number }[];
}) {
  const [visible, setVisible] = useState(false);
  const [info, setInfo] = useState<any>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setVisible(true);
          }
        });
      },
      { rootMargin: "200px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !selectedName) return;
    const buildPerf = () => {
      const points = 24;
      const now = Date.now();
      const step = (30 * 24 * 60 * 60 * 1000) / 2;
      const base = 100;
      return Array.from({ length: points }).map((_, i) => {
        const t = new Date(now - (points - i) * step);
        return {
          time: `${t.getMonth() + 1}/${t.getFullYear().toString().slice(-2)}`,
          price: base + Math.sin(i / 3) * 8 + (Math.random() - 0.5) * 6,
        };
      });
    };

    // Generate asset-specific narrative and data
    const getAssetInfo = (name: string) => {
      // Check if it's an index asset
      if (name.includes('Index') || name.includes('Fund')) {
        return {
          summary: "Institutional-grade exposure to prime real-estate. Returns modeled from on-chain activity and public market comparables.",
          narrative: "This diversified index provides exposure to a carefully curated portfolio of premium real estate assets across multiple sectors. Built on blockchain infrastructure, it offers unprecedented transparency and liquidity in traditionally illiquid markets. The fund leverages sophisticated tokenization technology to fractionalize ownership while maintaining institutional-grade due diligence and risk management protocols.",
          category: "Index"
        };
      }
      
      // Commercial properties
      if (name.includes('Office') || name.includes('Tech Campus') || name.includes('Retail') || name.includes('Data Center') || name.includes('Industrial')) {
        return {
          summary: "Prime commercial real estate asset with institutional-grade tenancy and strong cash flow fundamentals.",
          narrative: "This trophy commercial asset represents best-in-class real estate in a strategic market location. The property features long-term lease agreements with creditworthy tenants, providing stable income streams and capital appreciation potential. Advanced building systems and sustainable design elements position the asset for long-term value creation in an evolving commercial landscape. The tokenization structure allows for fractional ownership while maintaining professional asset management and optimization.",
          category: "Commercial"
        };
      }
      
      // Residential properties  
      return {
        summary: "Ultra-premium residential real estate in highly desirable locations with strong appreciation history.",
        narrative: "This luxury residential asset exemplifies the pinnacle of high-end real estate investment. Located in an exclusive market with limited supply and consistent demand from high-net-worth individuals, the property offers both lifestyle value and investment returns. The tokenized structure democratizes access to institutional-quality residential real estate while preserving the exclusivity and prestige associated with premium properties. Professional property management ensures optimal maintenance and value preservation.",
        category: "Residential"
      };
    };

    const assetInfo = getAssetInfo(selectedName);

    setInfo({
      name: selectedName,
      summary: assetInfo.summary,
      narrative: assetInfo.narrative,
      category: assetInfo.category,
      metrics: [
        { label: "Market Cap (est.)", value: "$12.4B" },
        { label: "Occupancy", value: "97.2%" },
        { label: "Debt/Equity", value: "0.42" },
        { label: "12m Yield (est.)", value: "4.1%" },
      ],
      fundamentals: [
        { label: "Net Operating Income (NOI)", value: "$482M" },
        { label: "Cap Rate (implied)", value: "5.2%" },
        { label: "Price / NAV", value: "0.92x" },
        { label: "Average Lease Term", value: "7.8 yrs" },
        { label: "LTV", value: "38%" },
        { label: "Debt Maturity", value: "3.6 yrs" },
      ],
      performance: buildPerf(),
      comps: [
        { name: "Prime Offices", yield: "4.6%", corr: "0.42" },
        { name: "Luxury Resi.", yield: "3.8%", corr: "0.37" },
        { name: "Data Centers", yield: "2.9%", corr: "0.28" },
      ],
      onchain: [
        { label: "Holders", value: "18,420" },
        { label: "30d Volume", value: "$42.8M" },
        { label: "TVL (Pools)", value: "$64.3M" },
      ],
      links: [
        { label: "Trade", href: "/trade" },
        { label: "Create Pool", href: "/create-pool" },
        { label: "Create Asset", href: "/create-mint" },
      ],
      risks: [
        "Refinancing risk if rates remain elevated",
        "Cyclicality in luxury demand and transaction velocity",
        "Regulatory changes for tokenized securities",
      ],
      opportunities: [
        "Upside to NAV convergence as liquidity deepens",
        "Potential fee rebates for early LPs",
        "Pipeline of additional trophy assets",
      ],
    });
  }, [visible, selectedName]);

  return (
    <section ref={ref} className="px-4 sm:px-6 lg:px-8 py-10">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-lg font-semibold text-[color:var(--foreground)]/90 mb-2">
          Asset insights
        </h2>
        <p className="text-sm text-[color:var(--muted-foreground)] mb-6">
          Contextual data about the selected symbol appears as you scroll.
        </p>
        {!visible ? (
          <div className="h-28 rounded-lg border border-[color:var(--border)]/60 bg-[color:var(--muted)]/40 animate-pulse" />
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-4">
              <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--muted)]/40 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-base font-medium">{info?.name}</h3>
                  {info?.category && (
                    <span className="px-2 py-1 text-xs bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/20">
                      {info.category}
                    </span>
                  )}
                </div>
                <p className="text-sm text-[color:var(--muted-foreground)] leading-relaxed mb-3">
                  {info?.summary}
                </p>
                {info?.narrative && (
                  <div className="bg-[color:var(--muted)]/60 rounded-lg p-4 mb-3">
                    <h4 className="text-sm font-medium mb-2 text-[color:var(--foreground)]">Asset Overview</h4>
                    <p className="text-sm text-[color:var(--muted-foreground)] leading-relaxed">
                      {info.narrative}
                    </p>
                  </div>
                )}
                <ul className="list-disc pl-5 text-sm text-[color:var(--muted-foreground)] space-y-1">
                  {info?.highlights?.map((h: string) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--muted)]/40 p-3">
                <div className="text-xs mb-2 text-[color:var(--muted-foreground)]">
                  Trailing performance (synthetic)
                </div>
                <ChartContainer
                  config={
                    { price: { label: "Index", color: "#64748b" } } as any
                  }
                  className="w-full h-[180px]"
                >
                  <AreaChart
                    data={(info as any)?.performance}
                    margin={{ left: 12, right: 12, top: 8, bottom: 8 }}
                  >
                    <XAxis
                      dataKey="time"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={6}
                    />
                    <YAxis hide domain={["dataMin - 2", "dataMax + 2"]} />
                    <defs>
                      <linearGradient id="miniFill" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor="#94a3b8"
                          stopOpacity={0.25}
                        />
                        <stop
                          offset="100%"
                          stopColor="#111827"
                          stopOpacity={0.05}
                        />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="price"
                      fill="url(#miniFill)"
                      stroke="#94a3b8"
                      strokeWidth={1.75}
                    />
                  </AreaChart>
                </ChartContainer>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--muted)]/40 p-4 space-y-2">
                {(info as any)?.fundamentals?.map((m: any) => (
                  <div
                    key={m.label}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-[color:var(--muted-foreground)]">
                      {m.label}
                    </span>
                    <span className="font-medium">{m.value}</span>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--muted)]/40 p-4 space-y-2">
                <div className="text-xs text-[color:var(--muted-foreground)] mb-1">
                  On-chain snapshot
                </div>
                {(info as any)?.onchain?.map((m: any) => (
                  <div
                    key={m.label}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-[color:var(--muted-foreground)]">
                      {m.label}
                    </span>
                    <span className="font-medium">{m.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="xl:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--muted)]/40 p-4">
                <div className="text-sm font-medium mb-2">Comparables</div>
                <div className="space-y-2 text-sm">
                  {(info as any)?.comps?.map((c: any) => (
                    <div
                      key={c.name}
                      className="flex items-center justify-between"
                    >
                      <span className="text-[color:var(--muted-foreground)]">
                        {c.name}
                      </span>
                      <div className="flex items-center gap-4">
                        <span>Yield {c.yield}</span>
                        <span className="text-[color:var(--muted-foreground)]">
                          Corr {c.corr}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--muted)]/40 p-4">
                <div className="text-sm font-medium mb-2">Key risks</div>
                <ul className="list-disc pl-5 text-sm text-[color:var(--muted-foreground)] space-y-1">
                  {(info as any)?.risks?.map((r: string) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--muted)]/40 p-4">
                <div className="text-sm font-medium mb-2">Opportunities</div>
                <ul className="list-disc pl-5 text-sm text-[color:var(--muted-foreground)] space-y-1">
                  {(info as any)?.opportunities?.map((o: string) => (
                    <li key={o}>{o}</li>
                  ))}
                </ul>
              </div>
            </div>
            {(info as any)?.composition && (
              <div className="xl:col-span-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--muted)]/40 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">Index composition</div>
                  <div className="text-xs text-[color:var(--muted-foreground)]">
                    weights
                  </div>
                </div>
                <div className="flex items-center justify-center">
                  <PieChart width={260} height={260}>
                    <Pie
                      data={(info as any).composition}
                      dataKey="weight"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={90}
                      strokeWidth={3}
                    />
                    <Label
                      content={({ viewBox }) => {
                        // @ts-ignore
                        if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                          const total = (info as any).composition.reduce(
                            (s: number, p: any) => s + p.weight,
                            0
                          );
                          return (
                            <text
                              x={viewBox.cx}
                              y={viewBox.cy}
                              textAnchor="middle"
                              dominantBaseline="middle"
                            >
                              <tspan className="fill-foreground text-xl font-semibold">
                                Index
                              </tspan>
                              <tspan
                                x={viewBox.cx}
                                y={(viewBox.cy || 0) + 16}
                                className="fill-muted-foreground text-xs"
                              >
                                {total}%
                              </tspan>
                            </text>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </div>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {(info as any).composition.map((p: any) => (
                    <div key={p.name} className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded"
                        style={{ background: p.fill }}
                      />
                      <span className="truncate">{p.name}</span>
                      <span className="ml-auto tabular-nums">{p.weight}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
