"use client";

import { Suspense, useState } from "react";
import { useRwaAmmSdk } from "@/hooks/useRwaAmmSdk";
import { PublicKey } from "@solana/web3.js";
import Header from "@/components/Header";
import {
  ArrowUpDown,
  Settings,
  Droplets,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import { useSearchParams } from "next/navigation";

interface SwapConfig {
  inputToken: {
    mint: string;
    symbol: string;
    decimals: number;
    balance: number;
  };
  outputToken: {
    mint: string;
    symbol: string;
    decimals: number;
    balance: number;
  };
  inputAmount: number;
  outputAmount: number;
  slippage: number;
  priceImpact: number;
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

const SLIPPAGE_PRESETS = [0.1, 0.5, 1.0, 3.0];

function TradePageInner() {
  const searchParams = useSearchParams();
  const prePoolAddress = searchParams?.get("pool");

  const { swap, loading, error, connected, clearError } = useRwaAmmSdk();
  const [submitStatus, setSubmitStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [transactionSignature, setTransactionSignature] = useState<
    string | null
  >(null);
  const [showSettings, setShowSettings] = useState(false);

  const [swapConfig, setSwapConfig] = useState<SwapConfig>({
    inputToken: {
      mint: "",
      symbol: "SOL",
      decimals: 9,
      balance: 0,
    },
    outputToken: {
      mint: "",
      symbol: "USDC",
      decimals: 6,
      balance: 0,
    },
    inputAmount: 0,
    outputAmount: 0,
    slippage: 0.5,
    priceImpact: 0,
  });

  const updateSwapConfig = (path: string, value: any) => {
    setSwapConfig((prev) => {
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

  // Simulate price calculation (in real app, this would query the pool)
  const calculateOutput = (inputAmount: number) => {
    // Simple 1:100 ratio simulation (1 SOL = 100 USDC)
    const mockRate = swapConfig.inputToken.symbol === "SOL" ? 100 : 0.01;
    const outputAmount = inputAmount * mockRate;
    const priceImpact = Math.min(inputAmount * 0.001, 5); // Mock price impact

    updateSwapConfig("outputAmount", outputAmount);
    updateSwapConfig("priceImpact", priceImpact);
  };

  const handleInputAmountChange = (amount: number) => {
    updateSwapConfig("inputAmount", amount);
    if (amount > 0) {
      calculateOutput(amount);
    } else {
      updateSwapConfig("outputAmount", 0);
      updateSwapConfig("priceImpact", 0);
    }
  };

  const handleTokenSwitch = () => {
    const tempToken = swapConfig.inputToken;
    updateSwapConfig("inputToken", swapConfig.outputToken);
    updateSwapConfig("outputToken", tempToken);

    // Only recalculate if there's an input amount
    if (swapConfig.inputAmount > 0) {
      calculateOutput(swapConfig.inputAmount);
    }
  };

  const selectToken = (
    token: (typeof COMMON_TOKENS)[0],
    side: "input" | "output"
  ) => {
    const path = side === "input" ? "inputToken" : "outputToken";
    updateSwapConfig(`${path}.mint`, token.mint);
    updateSwapConfig(`${path}.symbol`, token.symbol);
    updateSwapConfig(`${path}.decimals`, token.decimals);

    // Simulate balance (in real app, would fetch from wallet)
    updateSwapConfig(`${path}.balance`, Math.floor(Math.random() * 10000));

    // Only recalculate if there's an input amount and we're changing the input token
    if (side === "input" && swapConfig.inputAmount > 0) {
      calculateOutput(swapConfig.inputAmount);
    }
  };

  const handleSwap = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!connected) {
      alert("Please connect your wallet first");
      return;
    }

    if (swapConfig.inputAmount <= 0) {
      alert("Please enter a valid amount");
      return;
    }

    setSubmitStatus("submitting");
    clearError();

    try {
      console.log("Executing swap:", swapConfig);

      const swapParams = {
        poolAddress: new PublicKey(
          prePoolAddress || "11111111111111111111111111111111"
        ), // Mock pool address
        inputMint: new PublicKey(
          swapConfig.inputToken.mint ||
            "So11111111111111111111111111111111111111112"
        ),
        outputMint: new PublicKey(
          swapConfig.outputToken.mint ||
            "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
        ),
        inputAmount: swapConfig.inputAmount,
        minOutputAmount:
          swapConfig.outputAmount * (1 - swapConfig.slippage / 100),
      };

      const signature = await swap(swapParams);
      setTransactionSignature(signature);
      setSubmitStatus("success");

      console.log("Swap successful:", signature);

      // Reset amounts
      updateSwapConfig("inputAmount", 0);
      updateSwapConfig("outputAmount", 0);
    } catch (err) {
      console.error("Swap failed:", err);
      setSubmitStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-900 to-neutral-950">
      <Header />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Trading Card */}
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-white flex items-center">
              <TrendingUp className="w-5 h-5 mr-2" />
              Trade Assets
            </h2>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="bg-black/20 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-medium text-white mb-3">
                Trade Settings
              </h3>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Slippage Tolerance
                </label>
                <div className="flex space-x-2">
                  {SLIPPAGE_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => updateSwapConfig("slippage", preset)}
                      className={`px-3 py-2 rounded-lg text-sm transition-all ${
                        swapConfig.slippage === preset
                          ? "bg-gradient-to-b from-neutral-800 to-neutral-950 text-white"
                          : "bg-white/10 text-gray-300 hover:bg-white/20"
                      }`}
                    >
                      {preset}%
                    </button>
                  ))}
                  <div className="flex items-center">
                    <input
                      type="number"
                      step="0.1"
                      value={swapConfig.slippage}
                      onChange={(e) =>
                        updateSwapConfig("slippage", parseFloat(e.target.value))
                      }
                      className="w-16 bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-white text-sm"
                    />
                    <span className="ml-1 text-gray-400">%</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSwap} className="space-y-4">
            {/* Input Token */}
            <div className="bg-black/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-gray-400">
                  Sell
                </label>
                <span className="text-sm text-gray-400">
                  Balance: {swapConfig.inputToken.balance.toFixed(4)}
                </span>
              </div>

              <div className="flex items-center space-x-3">
                <div className="flex-1">
                  <input
                    type="number"
                    step="0.000001"
                    value={swapConfig.inputAmount || ""}
                    onChange={(e) =>
                      handleInputAmountChange(parseFloat(e.target.value) || 0)
                    }
                    placeholder="0.0"
                    className="w-full bg-transparent text-2xl font-semibold text-white placeholder-gray-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-gray-600 rounded-full"></div>
                  <div>
                    <p className="font-semibold text-white">
                      {swapConfig.inputToken.symbol}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex space-x-2">
                {COMMON_TOKENS.map((token) => (
                  <button
                    key={token.mint}
                    type="button"
                    onClick={() => selectToken(token, "input")}
                    className={`px-2 py-1 rounded text-xs transition-all ${
                      swapConfig.inputToken.symbol === token.symbol
                        ? "bg-gradient-to-b from-neutral-800 to-neutral-950 text-white"
                        : "bg-white/10 text-gray-300 hover:bg-white/20"
                    }`}
                  >
                    {token.symbol}
                  </button>
                ))}
              </div>
            </div>

            {/* Swap Button */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleTokenSwitch}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-all"
              >
                <ArrowUpDown className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Output Token */}
            <div className="bg-black/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-gray-400">Buy</label>
                <span className="text-sm text-gray-400">
                  Balance: {swapConfig.outputToken.balance.toFixed(4)}
                </span>
              </div>

              <div className="flex items-center space-x-3">
                <div className="flex-1">
                  <input
                    type="number"
                    value={swapConfig.outputAmount.toFixed(6)}
                    readOnly
                    placeholder="0.0"
                    className="w-full bg-transparent text-2xl font-semibold text-white placeholder-gray-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-gray-500 rounded-full"></div>
                  <div>
                    <p className="font-semibold text-white">
                      {swapConfig.outputToken.symbol}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex space-x-2">
                {COMMON_TOKENS.map((token) => (
                  <button
                    key={token.mint}
                    type="button"
                    onClick={() => selectToken(token, "output")}
                    className={`px-2 py-1 rounded text-xs transition-all ${
                      swapConfig.outputToken.symbol === token.symbol
                        ? "bg-gradient-to-b from-neutral-800 to-neutral-950 text-white"
                        : "bg-white/10 text-gray-300 hover:bg-white/20"
                    }`}
                  >
                    {token.symbol}
                  </button>
                ))}
              </div>
            </div>

            {/* Trade Info */}
            {swapConfig.inputAmount > 0 && (
              <div className="bg-black/20 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Market Impact</span>
                  <span
                    className={`${
                      swapConfig.priceImpact > 3
                        ? "text-red-400"
                        : "text-gray-300"
                    }`}
                  >
                    {swapConfig.priceImpact.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">You'll Get At Least</span>
                  <span className="text-gray-300">
                    {(
                      swapConfig.outputAmount *
                      (1 - swapConfig.slippage / 100)
                    ).toFixed(6)}{" "}
                    {swapConfig.outputToken.symbol}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Transaction Fee</span>
                  <span className="text-gray-300">~0.0001 SOL</span>
                </div>
              </div>
            )}

            {/* Price Impact Warning */}
            {swapConfig.priceImpact > 3 && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                <p className="text-yellow-400 text-sm">
                  High market impact. You may receive significantly less than
                  expected.
                </p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={
                !connected ||
                submitStatus === "submitting" ||
                loading ||
                swapConfig.inputAmount <= 0
              }
              className={`w-full py-4 text-white rounded-xl transition-all font-semibold ${
                !connected ||
                submitStatus === "submitting" ||
                loading ||
                swapConfig.inputAmount <= 0
                  ? "bg-gray-500 cursor-not-allowed"
                  : submitStatus === "success"
                  ? "bg-green-500 hover:bg-green-600"
                  : "bg-gradient-to-b from-neutral-800 to-neutral-950 hover:from-neutral-700 hover:to-neutral-900"
              }`}
            >
              {!connected
                ? "Connect Wallet"
                : swapConfig.inputAmount <= 0
                ? "Enter an amount"
                : submitStatus === "submitting" || loading
                ? "Trading..."
                : submitStatus === "success"
                ? "Trade Successful!"
                : `Trade ${swapConfig.inputToken.symbol} for ${swapConfig.outputToken.symbol}`}
            </button>
          </form>
        </div>

        {/* Success Message */}
        {submitStatus === "success" && transactionSignature && (
          <div className="mt-6 bg-green-500/10 border border-green-500/30 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-green-400 mb-2">
              🎉 Trade Successful!
            </h3>
            <p className="text-gray-300 mb-4">
              Your assets have been traded successfully with compliance
              validation.
            </p>
            <div className="bg-black/20 rounded-lg p-4">
              <p className="text-sm text-gray-400 mb-2">Trade Confirmation:</p>
              <p className="text-green-400 font-mono text-sm break-all">
                {transactionSignature}
              </p>
            </div>
            <div className="mt-4 flex space-x-4">
              <button
                onClick={() =>
                  window.open(
                    `https://explorer.solana.com/tx/${transactionSignature}?cluster=devnet`,
                    "_blank"
                  )
                }
                className="px-4 py-2 bg-gradient-to-b from-neutral-800 to-neutral-950 text-white rounded-lg hover:from-neutral-700 hover:to-neutral-900 transition-all"
              >
                View on Explorer
              </button>
              <button
                onClick={() =>
                  navigator.clipboard.writeText(transactionSignature)
                }
                className="px-4 py-2 border border-green-500 text-green-400 rounded-lg hover:bg-green-500/10 transition-all"
              >
                Copy Confirmation
              </button>
            </div>
          </div>
        )}

        {/* Error Message */}
        {(error || submitStatus === "error") && (
          <div className="mt-6 bg-red-500/10 border border-red-500/30 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-red-400 mb-2">
              ❌ Trade Failed
            </h3>
            <p className="text-gray-300 mb-2">
              There was an error processing your trade:
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

        {/* RWA Compliance Info */}
        <div className="mt-6 bg-blue-500/10 border border-blue-500/30 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-blue-400 mb-2 flex items-center">
            <Droplets className="w-5 h-5 mr-2" />
            RWA Compliance Features
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-300">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span>KYC/AML Validation</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span>Geographic Compliance</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span>Trading Hours Check</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span>Amount Limits</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span>Trade Logging</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span>Automated Compliance</span>
            </div>
          </div>
          <p className="mt-3 text-sm text-gray-400">
            All trades are automatically validated through our compliance system
            to ensure regulatory requirements.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function TradePage() {
  return (
    <Suspense fallback={<div />}>
      <TradePageInner />
    </Suspense>
  );
}
