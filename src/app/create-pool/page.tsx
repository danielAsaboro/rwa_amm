"use client";

import { Suspense, useState } from "react";
import { useRwaAmmSdk } from "@/hooks/useRwaAmmSdk";
import { PublicKey } from "@solana/web3.js";
import Header from "@/components/Header";
import { DollarSign, TrendingUp, Shield, Droplets } from "lucide-react";
import { useSearchParams } from "next/navigation";

interface PoolConfig {
  tokenA: {
    mint: string;
    symbol: string;
    decimals: number;
  };
  tokenB: {
    mint: string;
    symbol: string;
    decimals: number;
  };
  fee: number; // Fee in basis points (e.g., 30 = 0.3%)
  initialPrice: number;
  initialLiquidityA: number;
  initialLiquidityB: number;
}

const COMMON_TOKENS = [
  {
    mint: "So11111111111111111111111111111111111111112",
    symbol: "SOL",
    decimals: 9,
    name: "Solana",
  },
  {
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    symbol: "USDC",
    decimals: 6,
    name: "USD Coin",
  },
  {
    mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    symbol: "USDT",
    decimals: 6,
    name: "Tether USD",
  },
];

const FEE_TIERS = [
  { bps: 1, percentage: "0.01%", label: "Stable pairs" },
  { bps: 5, percentage: "0.05%", label: "Standard pairs" },
  { bps: 30, percentage: "0.30%", label: "Volatile pairs" },
  { bps: 100, percentage: "1.00%", label: "Exotic pairs" },
];

function CreatePoolPageInner() {
  const searchParams = useSearchParams();
  const preMintAddress = searchParams?.get("mint");

  const { createPool, addLiquidity, loading, error, connected, clearError } =
    useRwaAmmSdk();
  const [step, setStep] = useState(1);
  const [submitStatus, setSubmitStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [createdPoolAddress, setCreatedPoolAddress] = useState<string | null>(
    null
  );

  const [poolConfig, setPoolConfig] = useState<PoolConfig>({
    tokenA: {
      mint: preMintAddress || "",
      symbol: "",
      decimals: 9,
    },
    tokenB: {
      mint: "",
      symbol: "",
      decimals: 9,
    },
    fee: 30, // 0.3%
    initialPrice: 1.0,
    initialLiquidityA: 1000,
    initialLiquidityB: 1000,
  });

  const updatePoolConfig = (path: string, value: any) => {
    setPoolConfig((prev) => {
      const keys = path.split(".");
      const newData = { ...prev };
      let current: any = newData;

      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;

      return newData;
    });
  };

  // Auto-populate common token info when selected
  const selectToken = (token: (typeof COMMON_TOKENS)[0], side: "A" | "B") => {
    const path = side === "A" ? "tokenA" : "tokenB";
    updatePoolConfig(`${path}.mint`, token.mint);
    updatePoolConfig(`${path}.symbol`, token.symbol);
    updatePoolConfig(`${path}.decimals`, token.decimals);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!connected) {
      alert("Please connect your wallet first");
      return;
    }

    setSubmitStatus("submitting");
    clearError();

    try {
      console.log("Creating pool with configuration:", poolConfig);

      // Create pool
      const poolParams = {
        mintA: new PublicKey(poolConfig.tokenA.mint),
        mintB: new PublicKey(poolConfig.tokenB.mint),
        fee: poolConfig.fee,
        initialPrice: poolConfig.initialPrice,
      };

      const poolAddress = await createPool(poolParams);

      // Add initial liquidity
      const liquidityParams = {
        poolAddress: new PublicKey(poolAddress),
        amountA: poolConfig.initialLiquidityA,
        amountB: poolConfig.initialLiquidityB,
        minAmountA: poolConfig.initialLiquidityA * 0.95, // 5% slippage
        minAmountB: poolConfig.initialLiquidityB * 0.95,
      };

      await addLiquidity(liquidityParams);

      setCreatedPoolAddress(poolAddress);
      setSubmitStatus("success");

      console.log("Successfully created pool:", poolAddress);
    } catch (err) {
      console.error("Failed to create pool:", err);
      setSubmitStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-900 to-neutral-950">
      <Header />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {[1, 2, 3].map((stepNumber) => (
              <div key={stepNumber} className="flex items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${
                    step >= stepNumber
                      ? "bg-gradient-to-b from-neutral-800 to-neutral-950 text-white"
                      : "bg-white/10 text-gray-400"
                  }`}
                >
                  {stepNumber}
                </div>
                {stepNumber < 3 && (
                  <div
                    className={`w-16 h-1 mx-2 ${
                      step > stepNumber
                        ? "bg-gradient-to-b from-neutral-800 to-neutral-950"
                        : "bg-white/10"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-sm text-gray-400">
            <span>Token Pair</span>
            <span>Pool Settings</span>
            <span>Review & Create</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Step 1: Token Pair Selection */}
          {step === 1 && (
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-6 flex items-center">
                <TrendingUp className="w-5 h-5 mr-2" />
                Select Asset Pair
              </h2>

              {/* Asset A */}
              <div className="mb-8">
                <h3 className="text-lg font-medium text-white mb-4 flex items-center">
                  <div className="w-3 h-3 bg-gray-600 rounded-full mr-2"></div>
                  Asset A (Base Asset)
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Asset Address
                    </label>
                    <input
                      type="text"
                      value={poolConfig.tokenA.mint}
                      onChange={(e) =>
                        updatePoolConfig("tokenA.mint", e.target.value)
                      }
                      placeholder="Enter asset address"
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Symbol
                    </label>
                    <input
                      type="text"
                      value={poolConfig.tokenA.symbol}
                      onChange={(e) =>
                        updatePoolConfig("tokenA.symbol", e.target.value)
                      }
                      placeholder="e.g., RWA"
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-sm text-gray-400 mb-3">
                    Or select a common asset:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {COMMON_TOKENS.map((token) => (
                      <button
                        key={token.mint}
                        type="button"
                        onClick={() => selectToken(token, "A")}
                        className="px-3 py-2 border border-white/20 text-gray-300 rounded-lg hover:bg-white/10 transition-all text-sm"
                      >
                        {token.symbol} - {token.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Asset B */}
              <div>
                <h3 className="text-lg font-medium text-white mb-4 flex items-center">
                  <div className="w-3 h-3 bg-gray-500 rounded-full mr-2"></div>
                  Asset B (Quote Asset)
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Asset Address
                    </label>
                    <input
                      type="text"
                      value={poolConfig.tokenB.mint}
                      onChange={(e) =>
                        updatePoolConfig("tokenB.mint", e.target.value)
                      }
                      placeholder="Enter asset address"
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Symbol
                    </label>
                    <input
                      type="text"
                      value={poolConfig.tokenB.symbol}
                      onChange={(e) =>
                        updatePoolConfig("tokenB.symbol", e.target.value)
                      }
                      placeholder="e.g., USDC"
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-sm text-gray-400 mb-3">
                    Or select a common asset:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {COMMON_TOKENS.map((token) => (
                      <button
                        key={token.mint}
                        type="button"
                        onClick={() => selectToken(token, "B")}
                        className="px-3 py-2 border border-white/20 text-gray-300 rounded-lg hover:bg-white/10 transition-all text-sm"
                      >
                        {token.symbol} - {token.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Pool Settings */}
          {step === 2 && (
            <div className="space-y-6">
              {/* Fee Tier Selection */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white flex items-center mb-4">
                  <DollarSign className="w-5 h-5 mr-2" />
                  Fee Tier
                </h3>
                <p className="text-gray-400 mb-4">
                  Select the trading fee for your pool. Higher fees provide more
                  returns to liquidity providers but may reduce trading volume.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {FEE_TIERS.map((tier) => (
                    <div
                      key={tier.bps}
                      className={`border rounded-xl p-4 cursor-pointer transition-all ${
                        poolConfig.fee === tier.bps
                          ? "border-gray-600 bg-gray-600/10"
                          : "border-white/20 hover:border-white/40"
                      }`}
                      onClick={() => updatePoolConfig("fee", tier.bps)}
                    >
                      <div className="text-center">
                        <p className="text-lg font-semibold text-white">
                          {tier.percentage}
                        </p>
                        <p className="text-sm text-gray-400">{tier.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Initial Liquidity */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white flex items-center mb-4">
                  <Droplets className="w-5 h-5 mr-2" />
                  Initial Funding
                </h3>
                <p className="text-gray-400 mb-6">
                  Set the initial funding amounts and price for your pool. This
                  establishes the starting price ratio.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {poolConfig.tokenA.symbol || "Asset A"} Amount
                    </label>
                    <input
                      type="number"
                      value={poolConfig.initialLiquidityA}
                      onChange={(e) =>
                        updatePoolConfig(
                          "initialLiquidityA",
                          parseFloat(e.target.value)
                        )
                      }
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {poolConfig.tokenB.symbol || "Asset B"} Amount
                    </label>
                    <input
                      type="number"
                      value={poolConfig.initialLiquidityB}
                      onChange={(e) =>
                        updatePoolConfig(
                          "initialLiquidityB",
                          parseFloat(e.target.value)
                        )
                      }
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                    />
                  </div>
                </div>

                <div className="mt-4 bg-black/20 rounded-lg p-4">
                  <p className="text-sm text-gray-400">Initial Price:</p>
                  <p className="text-lg font-semibold text-white">
                    1 {poolConfig.tokenA.symbol || "Asset A"} ={" "}
                    {poolConfig.initialLiquidityA > 0
                      ? (
                          poolConfig.initialLiquidityB /
                          poolConfig.initialLiquidityA
                        ).toFixed(6)
                      : "0"}{" "}
                    {poolConfig.tokenB.symbol || "Asset B"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-6 flex items-center">
                <Shield className="w-5 h-5 mr-2" />
                Review Pool Configuration
              </h2>

              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-medium text-white mb-3">
                      Token Pair
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-gray-300">
                        <span>Asset A:</span>
                        <span>{poolConfig.tokenA.symbol || "Unknown"}</span>
                      </div>
                      <div className="flex items-center justify-between text-gray-300">
                        <span>Asset B:</span>
                        <span>{poolConfig.tokenB.symbol || "Unknown"}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-medium text-white mb-3">
                      Pool Settings
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-gray-300">
                        <span>Fee Tier:</span>
                        <span>{(poolConfig.fee / 100).toFixed(2)}%</span>
                      </div>
                      <div className="flex items-center justify-between text-gray-300">
                        <span>Initial Price:</span>
                        <span>
                          {poolConfig.initialLiquidityA > 0
                            ? (
                                poolConfig.initialLiquidityB /
                                poolConfig.initialLiquidityA
                              ).toFixed(6)
                            : "0"}{" "}
                          {poolConfig.tokenB.symbol}/{poolConfig.tokenA.symbol}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-white mb-3">
                    Initial Funding
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-black/20 rounded-lg p-4">
                      <p className="text-sm text-gray-400">
                        {poolConfig.tokenA.symbol} Amount
                      </p>
                      <p className="text-lg font-semibold text-white">
                        {poolConfig.initialLiquidityA.toLocaleString()}
                      </p>
                    </div>
                    <div className="bg-black/20 rounded-lg p-4">
                      <p className="text-sm text-gray-400">
                        {poolConfig.tokenB.symbol} Amount
                      </p>
                      <p className="text-lg font-semibold text-white">
                        {poolConfig.initialLiquidityB.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Success/Error Messages */}
          {submitStatus === "success" && createdPoolAddress && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-green-400 mb-2">
                🎉 Trading Pool Successfully Created!
              </h3>
              <p className="text-gray-300 mb-4">
                Your trading pool is now active and ready for trading.
              </p>
              <div className="bg-black/20 rounded-lg p-4">
                <p className="text-sm text-gray-400 mb-2">Pool Address:</p>
                <p className="text-green-400 font-mono text-sm break-all">
                  {createdPoolAddress}
                </p>
              </div>
              <div className="mt-4 flex space-x-4">
                <a
                  href={`/trade?pool=${createdPoolAddress}`}
                  className="px-4 py-2 bg-gradient-to-b from-neutral-800 to-neutral-950 text-white rounded-lg hover:from-neutral-700 hover:to-neutral-900 transition-all"
                >
                  Start Trading
                </a>
                <button
                  onClick={() =>
                    navigator.clipboard.writeText(createdPoolAddress)
                  }
                  className="px-4 py-2 border border-green-500 text-green-400 rounded-lg hover:bg-green-500/10 transition-all"
                >
                  Copy Address
                </button>
              </div>
            </div>
          )}

          {(error || submitStatus === "error") && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-red-400 mb-2">
                ❌ Trading Pool Creation Failed
              </h3>
              <p className="text-gray-300 mb-2">
                There was an error creating your trading pool:
              </p>
              <p className="text-red-400 text-sm bg-black/20 rounded-lg p-4">
                {error || "Unknown error occurred"}
              </p>
              <button
                onClick={() => {
                  clearError();
                  setSubmitStatus("idle");
                }}
                className="mt-4 px-4 py-2 border border-red-500 text-red-400 rounded-lg hover:bg-red-500/10 transition-all"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="px-6 py-3 border border-white/20 text-white rounded-lg hover:bg-white/10 transition-all"
              >
                Previous
              </button>
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="px-6 py-3 bg-gradient-to-b from-neutral-800 to-neutral-950 text-white rounded-lg hover:from-neutral-700 hover:to-neutral-900 transition-all ml-auto"
              >
                Next
              </button>
            ) : (
              <button
                type="submit"
                disabled={
                  !connected || submitStatus === "submitting" || loading
                }
                className={`px-8 py-3 text-white rounded-lg transition-all ml-auto flex items-center ${
                  !connected || submitStatus === "submitting" || loading
                    ? "bg-gray-500 cursor-not-allowed"
                    : submitStatus === "success"
                    ? "bg-green-500 hover:bg-green-600"
                    : "bg-gradient-to-b from-neutral-800 to-neutral-950 hover:from-neutral-700 hover:to-neutral-900"
                }`}
              >
                <Droplets className="w-5 h-5 mr-2" />
                {!connected
                  ? "Connect Wallet First"
                  : submitStatus === "submitting" || loading
                  ? "Creating Trading Pool..."
                  : submitStatus === "success"
                  ? "Trading Pool Created!"
                  : "Create Pool"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CreatePoolPage() {
  return (
    <Suspense fallback={<div />}>
      <CreatePoolPageInner />
    </Suspense>
  );
}
