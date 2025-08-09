import { useState, useEffect, useMemo } from "react";
import {
  useConnection,
  useWallet,
  useAnchorWallet,
} from "@solana/wallet-adapter-react";
import { AnchorProvider } from "@coral-xyz/anchor";
import { RwaAmmSdk } from "@/lib/program";
import { useNetwork } from "@/contexts/NetworkContext";

export const useRwaAmmSdk = () => {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { publicKey, connected } = useWallet();
  const { network } = useNetwork();
  const [sdk, setSdk] = useState<RwaAmmSdk | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize SDK lazily when first needed
  const initializeSdk = async () => {
    if (sdk || !wallet || !connected || !publicKey) {
      return sdk;
    }

    try {
      setLoading(true);
      setError(null);

      const provider = new AnchorProvider(connection, wallet, {
        commitment: "confirmed",
      });

      const sdkInstance = await RwaAmmSdk.initialize(connection, provider);
      setSdk(sdkInstance);
      return sdkInstance;
    } catch (err) {
      console.error("Failed to initialize SDK:", err);
      setError(err instanceof Error ? err.message : "Failed to initialize SDK");
      setSdk(null);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Clear SDK when wallet disconnects or network changes
  useEffect(() => {
    if (!wallet || !connected || !publicKey) {
      setSdk(null);
    }
  }, [wallet, connected, publicKey]);

  // Clear SDK when network changes to force re-initialization
  useEffect(() => {
    setSdk(null);
  }, [network]);

  // SDK methods with error handling and loading states
  const createRwaMint = async (params: any) => {
    const sdkInstance = sdk || (await initializeSdk());
    if (!sdkInstance) throw new Error("SDK not initialized");

    setLoading(true);
    try {
      const result = await sdkInstance.createRwaMint(params);
      return result;
    } catch (err) {
      let errorMessage =
        err instanceof Error ? err.message : "Failed to create RWA mint";
      // Try to append program logs when available (SendTransactionError)
      try {
        const anyErr: any = err as any;
        if (anyErr?.logs && Array.isArray(anyErr.logs)) {
          errorMessage += `\nLogs:\n${JSON.stringify(anyErr.logs, null, 2)}`;
        } else if (typeof anyErr?.getLogs === "function") {
          const logs = await anyErr.getLogs(connection as any);
          if (logs) {
            errorMessage += `\nLogs:\n${JSON.stringify(logs, null, 2)}`;
          }
        }
      } catch (_) {}
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const createPool = async (params: any) => {
    const sdkInstance = sdk || (await initializeSdk());
    if (!sdkInstance) throw new Error("SDK not initialized");

    setLoading(true);
    try {
      const result = await sdkInstance.createPool(params);
      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to create pool";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const addLiquidity = async (params: any) => {
    const sdkInstance = sdk || (await initializeSdk());
    if (!sdkInstance) throw new Error("SDK not initialized");

    setLoading(true);
    try {
      const result = await sdkInstance.addLiquidity(params);
      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to add liquidity";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const swap = async (params: any) => {
    const sdkInstance = sdk || (await initializeSdk());
    if (!sdkInstance) throw new Error("SDK not initialized");

    setLoading(true);
    try {
      const result = await sdkInstance.swap(params);
      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to swap";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const createUserKyc = async (params: any) => {
    const sdkInstance = sdk || (await initializeSdk());
    if (!sdkInstance) throw new Error("SDK not initialized");

    setLoading(true);
    try {
      const result = await sdkInstance.createUserKyc(params);
      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to create user KYC";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const createWhitelist = async (params: any) => {
    const sdkInstance = sdk || (await initializeSdk());
    if (!sdkInstance) throw new Error("SDK not initialized");

    setLoading(true);
    try {
      const result = await sdkInstance.createWhitelist(params);
      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to create whitelist";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to clear error
  const clearError = () => setError(null);

  return {
    sdk,
    connected,
    publicKey,
    loading,
    error,
    clearError,
    // SDK methods
    createRwaMint,
    createPool,
    addLiquidity,
    swap,
    createUserKyc,
    createWhitelist,
    // Helper methods
    getUserKycAddress: (userPubkey: any) => sdk?.getUserKycAddress(userPubkey),
    getWhitelistAddress: (mintPubkey: any) =>
      sdk?.getWhitelistAddress(mintPubkey),
    getExtraAccountMetaListAddress: (mintPubkey: any) =>
      sdk?.getExtraAccountMetaListAddress(mintPubkey),
  };
};
