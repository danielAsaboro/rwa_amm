"use client";

import { useState, useEffect } from "react";
import { useRwaAmmSdk } from "@/hooks/useRwaAmmSdk";
import { Shield, CheckCircle, AlertTriangle, Clock, XCircle } from "lucide-react";

interface KycStatus {
  level: number;
  country: string;
  state: string;
  city: string;
  isActive: boolean;
  lastUpdated: Date;
}

interface KycStatusCardProps {
  userAddress?: string;
}

export default function KycStatusCard({ userAddress }: KycStatusCardProps) {
  const { connected, publicKey, createUserKyc, loading } = useRwaAmmSdk();
  const [kycStatus, setKycStatus] = useState<KycStatus | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({
    country: "US",
    state: "CA", 
    city: "San Francisco",
    kycLevel: 2
  });

  // Mock KYC status - in real app would fetch from blockchain
  useEffect(() => {
    if (connected && publicKey) {
      // Simulate fetching KYC status
      setKycStatus({
        level: 2,
        country: "US",
        state: "CA", 
        city: "San Francisco",
        isActive: true,
        lastUpdated: new Date()
      });
    } else {
      setKycStatus(null);
    }
  }, [connected, publicKey]);

  const getKycLevelInfo = (level: number) => {
    switch (level) {
      case 0:
        return {
          name: "No KYC",
          icon: <XCircle className="w-5 h-5 text-red-400" />,
          color: "text-red-400",
          bgColor: "bg-red-500/10 border-red-500/30"
        };
      case 1:
        return {
          name: "Basic KYC",
          icon: <AlertTriangle className="w-5 h-5 text-yellow-400" />,
          color: "text-yellow-400", 
          bgColor: "bg-yellow-500/10 border-yellow-500/30"
        };
      case 2:
        return {
          name: "Enhanced KYC",
          icon: <CheckCircle className="w-5 h-5 text-green-400" />,
          color: "text-green-400",
          bgColor: "bg-green-500/10 border-green-500/30"
        };
      case 3:
        return {
          name: "Institutional KYC",
          icon: <Shield className="w-5 h-5 text-blue-400" />,
          color: "text-blue-400",
          bgColor: "bg-blue-500/10 border-blue-500/30"
        };
      default:
        return {
          name: "Unknown",
          icon: <Clock className="w-5 h-5 text-gray-400" />,
          color: "text-gray-400",
          bgColor: "bg-gray-500/10 border-gray-500/30"
        };
    }
  };

  const handleCreateKyc = async () => {
    if (!publicKey) return;

    try {
      await createUserKyc({
        userPublicKey: publicKey,
        kycLevel: createForm.kycLevel,
        country: createForm.country,
        state: createForm.state,
        city: createForm.city
      });

      // Update local state after successful creation
      setKycStatus({
        level: createForm.kycLevel,
        country: createForm.country,
        state: createForm.state,
        city: createForm.city,
        isActive: true,
        lastUpdated: new Date()
      });

      setShowCreateForm(false);
    } catch (error) {
      console.error("Failed to create KYC:", error);
    }
  };

  if (!connected) {
    return (
      <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
        <div className="flex items-center space-x-3">
          <Shield className="w-6 h-6 text-gray-400" />
          <div>
            <h3 className="text-lg font-semibold text-gray-400">KYC Status</h3>
            <p className="text-gray-500">Connect wallet to view KYC status</p>
          </div>
        </div>
      </div>
    );
  }

  if (!kycStatus) {
    return (
      <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Shield className="w-6 h-6 text-gray-400" />
            <h3 className="text-lg font-semibold text-white">KYC Status</h3>
          </div>
          <span className="text-red-400 text-sm">Not Registered</span>
        </div>

        <p className="text-gray-300 mb-4">
          You need to complete KYC verification to trade RWA tokens with compliance features.
        </p>

        {!showCreateForm ? (
          <button
            onClick={() => setShowCreateForm(true)}
            className="w-full py-2 bg-gradient-to-b from-neutral-800 to-neutral-950 text-white rounded-lg hover:from-neutral-700 hover:to-neutral-900 transition-all"
          >
            Create KYC Profile
          </button>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Country
                </label>
                <select
                  value={createForm.country}
                  onChange={(e) => setCreateForm({ ...createForm, country: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                >
                  <option value="US">United States</option>
                  <option value="CA">Canada</option>
                  <option value="UK">United Kingdom</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  State
                </label>
                <input
                  type="text"
                  value={createForm.state}
                  onChange={(e) => setCreateForm({ ...createForm, state: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                  placeholder="CA"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                KYC Level
              </label>
              <select
                value={createForm.kycLevel}
                onChange={(e) => setCreateForm({ ...createForm, kycLevel: parseInt(e.target.value) })}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
              >
                <option value={1}>Basic KYC</option>
                <option value={2}>Enhanced KYC</option>
                <option value={3}>Institutional KYC</option>
              </select>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={handleCreateKyc}
                disabled={loading}
                className="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create KYC"}
              </button>
              <button
                onClick={() => setShowCreateForm(false)}
                className="flex-1 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const levelInfo = getKycLevelInfo(kycStatus.level);

  return (
    <div className={`backdrop-blur-sm border rounded-xl p-6 ${levelInfo.bgColor}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <Shield className="w-6 h-6 text-white" />
          <h3 className="text-lg font-semibold text-white">KYC Status</h3>
        </div>
        <div className="flex items-center space-x-2">
          {levelInfo.icon}
          <span className={`font-medium ${levelInfo.color}`}>
            {levelInfo.name}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-400">Location:</span>
          <p className="text-white">
            {kycStatus.city}, {kycStatus.state}, {kycStatus.country}
          </p>
        </div>
        <div>
          <span className="text-gray-400">Status:</span>
          <p className={`${levelInfo.color}`}>
            {kycStatus.isActive ? "Active" : "Inactive"}
          </p>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-white/10">
        <p className="text-xs text-gray-400">
          Last updated: {kycStatus.lastUpdated.toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}