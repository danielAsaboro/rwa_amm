"use client";

import { useMemo, useState, useEffect } from "react";
// Lazy import country-list to avoid type issues if types are missing
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getNames, getCodes } = require("country-list");
import { useRwaAmmSdk } from "@/hooks/useRwaAmmSdk";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import Header from "@/components/Header";
import { shortenAddress } from "@/lib/utils";
import {
  uploadToCloudinary,
  uploadMultipleFiles,
  UploadResult,
} from "@/lib/upload";
import { storeMetadataOnPantry } from "@/lib/jsonbin";
import {
  Plus,
  Trash2,
  Shield,
  DollarSign,
  Clock,
  Globe,
  Users,
  Settings,
  FileText,
  Percent,
  Calendar,
  MapPin,
  AlertTriangle,
  Info,
} from "lucide-react";

interface TransferFeeConfig {
  transferFeeBasisPoints: number;
  maximumFee: number;
  feeAuthority: string;
}

interface MetadataConfig {
  name: string;
  symbol: string;
  uri: string;
  description: string;
}

interface InterestBearingConfig {
  rateAuthority: string;
  currentRate: number;
  initializationTimestamp: number;
}

interface TransferHookConfig {
  enabled: boolean;
  programId: string;
  authority: string;
  kycRequired: boolean;
  geographicRestrictions: boolean;
  tradingHoursEnabled: boolean;
  amountLimitsEnabled: boolean;
  feeCollectionEnabled: boolean;
  transactionLoggingEnabled: boolean;
}

interface GeographicRestriction {
  country: string;
  restricted: boolean;
}

interface TradingHours {
  timezone: string;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
}

interface AmountLimits {
  minTrade: number;
  maxTrade: number;
  dailyLimit: number;
  monthlyLimit: number;
}

// RWA Configuration interface that matches the program expectations
interface RWAConfig {
  assetClass: string;
  jurisdiction: string;
  allowedCountries: string[];
  restrictedStates: string[];
  minimumKycLevel: number;
  tradingHours: {
    mondayStart: number;
    mondayEnd: number;
    tuesdayStart: number;
    tuesdayEnd: number;
    wednesdayStart: number;
    wednesdayEnd: number;
    thursdayStart: number;
    thursdayEnd: number;
    fridayStart: number;
    fridayEnd: number;
    saturdayStart: number;
    saturdayEnd: number;
    sundayStart: number;
    sundayEnd: number;
  };
  tradingLimits: {
    minTradeAmount: string;
    maxTradeAmount: string;
    kycBasicDailyLimit: string;
    kycEnhancedDailyLimit: string;
    kycInstitutionalDailyLimit: string;
  };
  feeStructure: {
    tradingFeeBps: number;
    protocolFeeBps: number;
    kycBasicDiscountBps: number;
    kycEnhancedDiscountBps: number;
    kycInstitutionalDiscountBps: number;
  };
  timezoneOffset: number;
  whitelistRequired: boolean;
  requiresAccreditedInvestor: boolean;
}

export default function CreateMintPage() {
  const [step, setStep] = useState(1);
  const { createRwaMint, loading, error, connected, clearError } =
    useRwaAmmSdk();

  // Get the connected wallet's public key
  const { publicKey } = useWallet();
  const [submitStatus, setSubmitStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [createdMintAddress, setCreatedMintAddress] = useState<string | null>(
    null
  );

  // File upload state
  const [uploadedFiles, setUploadedFiles] = useState<{
    logo?: UploadResult;
    legalAgreement?: UploadResult;
    propertyDeed?: UploadResult;
    financialStatement?: UploadResult;
    insuranceCertificate?: UploadResult;
    additionalDocs?: UploadResult[];
  }>({});

  const [uploadingFiles, setUploadingFiles] = useState<{
    [key: string]: boolean;
  }>({});
  const [formData, setFormData] = useState({
    // Basic mint info
    supply: 1000000,

    // Extensions
    transferFee: {
      enabled: false,
      config: {
        transferFeeBasisPoints: 100, // 1%
        maximumFee: 1000,
        feeAuthority: "", // Will be set to connected wallet
      } as TransferFeeConfig,
    },

    metadata: {
      enabled: true,
      config: {
        name: "",
        symbol: "",
        uri: "",
        description: "",
      } as MetadataConfig,
    },

    memoTransfer: {
      enabled: false,
      requireIncomingTransferMemos: true,
    },

    interestBearing: {
      enabled: false,
      config: {
        rateAuthority: "", // Will be set to connected wallet
        currentRate: 500, // 5% APY in basis points (500 = 5%)
        initializationTimestamp: Date.now(),
      } as InterestBearingConfig,
    },

    transferHook: {
      enabled: false,
      config: {
        programId: "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG", // Your RWA AMM program
        authority: "", // Will be set to connected wallet
        kycRequired: false,
        geographicRestrictions: false,
        tradingHoursEnabled: false,
        amountLimitsEnabled: false,
        feeCollectionEnabled: false,
        transactionLoggingEnabled: false,
      } as TransferHookConfig,
    },

    // RWA-specific configurations
    geographicRestrictions: [] as GeographicRestriction[],
    allowedCountriesCsv: "",
    restrictedCountriesCsv: "",
    tradingHours: {
      timezone: "UTC",
      startTime: "09:00",
      endTime: "17:00",
      daysOfWeek: [1, 2, 3, 4, 5], // Monday to Friday
    } as TradingHours,
    amountLimits: {
      minTrade: 100,
      maxTrade: 1000000,
      dailyLimit: 10000000,
      monthlyLimit: 100000000,
    } as AmountLimits,

    // Onchain RWA metadata configuration (will be stored in mint's metadata extension)
    rwaConfig: {
      assetClass: "real_estate", // Options: real_estate, commodities, securities, etc.
      jurisdiction: "US",
      allowedCountries: ["US", "CA"],
      restrictedStates: ["US_NY"],
      minimumKycLevel: 1, // 0=Unverified, 1=Basic, 2=Enhanced, 3=Institutional
      tradingHours: {
        mondayStart: 570, // 9:30 AM in minutes from midnight
        mondayEnd: 960, // 4:00 PM in minutes from midnight
        tuesdayStart: 570,
        tuesdayEnd: 960,
        wednesdayStart: 570,
        wednesdayEnd: 960,
        thursdayStart: 570,
        thursdayEnd: 960,
        fridayStart: 570,
        fridayEnd: 960,
        saturdayStart: 0, // Closed
        saturdayEnd: 0,
        sundayStart: 0, // Closed
        sundayEnd: 0,
      },
      tradingLimits: {
        minTradeAmount: "1000000", // $1 (6 decimals)
        maxTradeAmount: "1000000000000", // $1,000,000
        kycBasicDailyLimit: "100000000000", // $100,000
        kycEnhancedDailyLimit: "1000000000000", // $1,000,000
        kycInstitutionalDailyLimit: "10000000000000", // $10,000,000
      },
      feeStructure: {
        tradingFeeBps: 25, // 0.25%
        protocolFeeBps: 5, // 0.05%
        kycBasicDiscountBps: 0,
        kycEnhancedDiscountBps: 5, // 0.05% discount
        kycInstitutionalDiscountBps: 10, // 0.10% discount
      },
      timezoneOffset: -5, // EST
      whitelistRequired: true,
      requiresAccreditedInvestor: true,
    } as RWAConfig,
  });

  // Clear any stale SDK error when the page mounts
  useEffect(() => {
    clearError();
  }, [clearError]);

  const updateFormData = (path: string, value: any) => {
    setFormData((prev) => {
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

  // Simple helper to parse CSV of country codes → array
  const parseCodesCsv = (csv: string | undefined) =>
    (csv || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  const addGeographicRestriction = () => {
    setFormData((prev) => ({
      ...prev,
      geographicRestrictions: [
        ...prev.geographicRestrictions,
        { country: "", restricted: true },
      ],
    }));
  };

  const removeGeographicRestriction = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      geographicRestrictions: prev.geographicRestrictions.filter(
        (_, i) => i !== index
      ),
    }));
  };

  const updateGeographicRestriction = (
    index: number,
    field: keyof GeographicRestriction,
    value: any
  ) => {
    setFormData((prev) => ({
      ...prev,
      geographicRestrictions: prev.geographicRestrictions.map(
        (restriction, i) =>
          i === index ? { ...restriction, [field]: value } : restriction
      ),
    }));
  };

  // Country helpers for multi-selects
  const allCountryCodes = useMemo(() => getCodes() as string[], []);
  const isAllAllowedSelected = useMemo(() => {
    const set = new Set(
      (formData.allowedCountriesCsv || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );
    if (set.size !== allCountryCodes.length) return false;
    for (const code of allCountryCodes) if (!set.has(code)) return false;
    return true;
  }, [formData.allowedCountriesCsv, allCountryCodes]);
  const toggleAllowedAll = () => {
    updateFormData(
      "allowedCountriesCsv",
      isAllAllowedSelected ? "" : allCountryCodes.join(",")
    );
  };

  // Keep restricted list disjoint from allowed list
  useEffect(() => {
    const allowed = new Set(parseCodesCsv(formData.allowedCountriesCsv));
    const filtered = parseCodesCsv(formData.restrictedCountriesCsv).filter(
      (c) => !allowed.has(c)
    );
    const next = filtered.join(",");
    if (next !== formData.restrictedCountriesCsv) {
      updateFormData("restrictedCountriesCsv", next);
    }
  }, [formData.allowedCountriesCsv]);

  // Compute toggle state for Restricted Countries (relative to visible set)
  const allowedSet = useMemo(
    () => new Set(parseCodesCsv(formData.allowedCountriesCsv)),
    [formData.allowedCountriesCsv]
  );
  const restrictedVisibleUniverse = useMemo(
    () => allCountryCodes.filter((c) => !allowedSet.has(c)),
    [allCountryCodes, allowedSet]
  );
  const isAllRestrictedSelected = useMemo(() => {
    const selected = new Set(parseCodesCsv(formData.restrictedCountriesCsv));
    if (selected.size !== restrictedVisibleUniverse.length) return false;
    for (const code of restrictedVisibleUniverse)
      if (!selected.has(code)) return false;
    return true;
  }, [formData.restrictedCountriesCsv, restrictedVisibleUniverse]);
  const toggleRestrictedAll = () => {
    updateFormData(
      "restrictedCountriesCsv",
      isAllRestrictedSelected ? "" : restrictedVisibleUniverse.join(",")
    );
  };

  // Prevent form submission when pressing Enter in input fields (except on step 3)
  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && step !== 3) {
      e.preventDefault();
    }
  };

  // File upload handlers
  const handleFileUpload = async (file: File, fieldName: string) => {
    setUploadingFiles((prev) => ({ ...prev, [fieldName]: true }));

    try {
      const result = await uploadToCloudinary(file);
      setUploadedFiles((prev) => ({ ...prev, [fieldName]: result }));
    } catch (error) {
      console.error(`Error uploading ${fieldName}:`, error);
      alert(`Failed to upload ${fieldName}. Please try again.`);
    } finally {
      setUploadingFiles((prev) => ({ ...prev, [fieldName]: false }));
    }
  };

  const handleMultipleFileUpload = async (
    files: FileList,
    fieldName: string
  ) => {
    setUploadingFiles((prev) => ({ ...prev, [fieldName]: true }));

    try {
      const results = await uploadMultipleFiles(files);
      setUploadedFiles((prev) => ({ ...prev, [fieldName]: results }));
    } catch (error) {
      console.error(`Error uploading ${fieldName}:`, error);
      alert(`Failed to upload ${fieldName}. Please try again.`);
    } finally {
      setUploadingFiles((prev) => ({ ...prev, [fieldName]: false }));
    }
  };

  const removeUploadedFile = (fieldName: string) => {
    setUploadedFiles((prev) => ({ ...prev, [fieldName]: undefined }));
  };

  // Info tooltip component
  const InfoTooltip = ({ children }: { children: React.ReactNode }) => (
    <div className="relative group inline-block">
      <Info className="w-4 h-4 text-gray-400 hover:text-gray-300 cursor-help" />
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
        {children}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
      </div>
    </div>
  );

  // File upload component
  const FileUploadField = ({
    label,
    fieldName,
    accept,
    multiple = false,
  }: {
    label: string;
    fieldName: string;
    accept: string;
    multiple?: boolean;
  }) => {
    const isUploading = uploadingFiles[fieldName];
    const uploadedFile = uploadedFiles[fieldName as keyof typeof uploadedFiles];
    const isMultiple = multiple && Array.isArray(uploadedFile);

    return (
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          {label}
        </label>

        {(!uploadedFile || (isMultiple && uploadedFile.length === 0)) && (
          <input
            type="file"
            accept={accept}
            multiple={multiple}
            onChange={(e) => {
              const files = e.target.files;
              if (files && files.length > 0) {
                if (multiple) {
                  handleMultipleFileUpload(files, fieldName);
                } else {
                  handleFileUpload(files[0], fieldName);
                }
              }
            }}
            disabled={isUploading}
            className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gradient-to-r file:from-purple-500 file:to-pink-500 file:text-white hover:file:from-purple-600 hover:file:to-pink-600"
          />
        )}

        {isUploading && (
          <div className="mt-2 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-sm text-blue-400">
              Uploading {label.toLowerCase()}...
            </p>
          </div>
        )}

        {uploadedFile && !isUploading && (
          <div className="mt-2 space-y-2">
            {!isMultiple ? (
              // Single file upload
              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {(fieldName === "logo" || accept.includes("image")) &&
                      (uploadedFile as UploadResult)?.url && (
                        <img
                          src={(uploadedFile as UploadResult).url}
                          alt="Preview"
                          className="w-12 h-12 object-cover rounded"
                        />
                      )}
                    <div>
                      <p className="text-sm text-green-400">
                        ✓ {label} uploaded successfully
                      </p>
                      {(uploadedFile as UploadResult)?.url && (
                        <p className="text-xs text-gray-400 truncate max-w-48">
                          {(uploadedFile as UploadResult).url.split("/").pop()}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => removeUploadedFile(fieldName)}
                    className="text-red-400 hover:text-red-300 text-sm px-3 py-1 rounded bg-red-500/10 hover:bg-red-500/20 transition-all"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              // Multiple file upload
              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-green-400">
                    ✓ {(uploadedFile as UploadResult[]).length}{" "}
                    {label.toLowerCase()} uploaded successfully
                  </p>
                  <button
                    onClick={() => removeUploadedFile(fieldName)}
                    className="text-red-400 hover:text-red-300 text-sm px-3 py-1 rounded bg-red-500/10 hover:bg-red-500/20 transition-all"
                  >
                    Remove All
                  </button>
                </div>
                <div className="mt-2 space-y-1">
                  {(uploadedFile as UploadResult[]).map((file, index) => (
                    <p key={index} className="text-xs text-gray-400 truncate">
                      {file.url.split("/").pop()}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  function CountryMultiSelect({
    value,
    onChange,
    filterOut,
  }: {
    value: string;
    onChange: (csv: string) => void;
    filterOut?: Set<string>;
  }) {
    const options = useMemo((): { code: string; name: string }[] => {
      const names: string[] = getNames();
      const codes: string[] = getCodes();
      return codes.map((code: string, idx: number) => ({
        code,
        name: names[idx],
      }));
    }, []);

    const selected = useMemo(() => {
      const set = new Set(
        (value || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      );
      return set;
    }, [value]);

    const toggle = (code: string) => {
      const set = new Set(selected);
      if (set.has(code)) set.delete(code);
      else set.add(code);
      onChange(Array.from(set).join(","));
    };

    return (
      <div className="w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-56 overflow-auto p-2 bg-white/5 border border-white/10 rounded-lg">
          {options
            .filter(({ code }) => !(filterOut && filterOut.has(code)))
            .map(({ code, name }: { code: string; name: string }) => (
              <label
                key={code}
                className="flex items-center gap-2 text-sm text-gray-200"
              >
                <input
                  type="checkbox"
                  className="accent-gray-500"
                  checked={selected.has(code)}
                  onChange={() => toggle(code)}
                />
                <span>{name}</span>
                <span className="text-gray-400 text-xs">({code})</span>
              </label>
            ))}
        </div>
        {(value?.length ?? 0) > 0 && (
          <div className="mt-2">
            <span className="text-xs text-gray-400">Selected:</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {Array.from(selected as Set<string>).map((code: string) => (
                <span
                  key={code}
                  className="text-xs bg-white/10 text-gray-200 px-1.5 py-0.5 rounded border border-white/20"
                >
                  {code}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Only allow submission on step 3 (review step)
    if (step !== 3) {
      return;
    }

    if (!connected) {
      alert("Please connect your wallet first");
      return;
    }

    setSubmitStatus("submitting");
    clearError();

    try {
      console.log("Creating mint with configuration:", formData);

      // Helper function to safely create PublicKey
      const safePublicKey = (address: string): PublicKey | undefined => {
        if (!address || address.trim() === "") return undefined;
        try {
          return new PublicKey(address.trim());
        } catch (error) {
          console.error(`Invalid PublicKey: ${address}`, error);
          throw new Error(`Invalid address format: ${address}`);
        }
      };

      // Validate required fields before processing
      if (formData.transferHook.enabled) {
        if (!formData.transferHook.config.programId) {
          throw new Error("Program ID is required for Transfer Hook");
        }
      }

      // Use connected wallet address for all authority fields
      const walletAddress = publicKey?.toString() || "";
      if (!walletAddress) {
        throw new Error("Wallet not connected");
      }

      // Create metadata object for jsonbin.io storage
      let metadataUri = formData.metadata.config.uri;

      if (formData.metadata.enabled) {
        const metadata = {
          // Standard token metadata (Metaplex compatible)
          name: formData.metadata.config.name,
          symbol: formData.metadata.config.symbol,
          description: formData.metadata.config.description,
          image: uploadedFiles.logo?.url,

          // Asset attributes for NFT marketplaces
          attributes: [
            {
              trait_type: "Asset Type",
              value: "Real World Asset",
            },
            {
              trait_type: "Total Units",
              value: formData.supply,
            },
            {
              trait_type: "KYC Required",
              value: formData.transferHook.enabled
                ? formData.transferHook.config.kycRequired
                  ? "Yes"
                  : "No"
                : "No",
            },
            {
              trait_type: "Compliance Enabled",
              value: formData.transferHook.enabled ? "Yes" : "No",
            },
          ],

          // Document references stored on Cloudinary
          documents: {
            legalAgreement: uploadedFiles.legalAgreement?.url,
            propertyDeed: uploadedFiles.propertyDeed?.url,
            financialStatement: uploadedFiles.financialStatement?.url,
            insuranceCertificate: uploadedFiles.insuranceCertificate?.url,
            additionalDocs: uploadedFiles.additionalDocs?.map((doc) => doc.url),
          },

          // RWA-specific properties
          properties: {
            category: "Real World Asset" as const,
            assetType: "Tokenized Asset",
            totalUnits: formData.supply,
            unitType: "Token",
            complianceFeatures: {
              kycRequired: formData.transferHook.enabled
                ? formData.transferHook.config.kycRequired
                : false,
              geographicRestrictions: formData.transferHook.enabled
                ? formData.transferHook.config.geographicRestrictions
                : false,
              tradingHours: formData.transferHook.enabled
                ? formData.transferHook.config.tradingHoursEnabled
                : false,
              amountLimits: formData.transferHook.enabled
                ? formData.transferHook.config.amountLimitsEnabled
                : false,
            },
            createdAt: new Date().toISOString(),
            version: "1.0.0",
          },

          // Collection information
          collection: {
            name: "RWA Asset Collection",
            family: "Real World Assets",
          },
        };

        // Store metadata on getpantry.cloud and get the public URI
        metadataUri = await storeMetadataOnPantry(metadata);
        console.log("Metadata stored on getpantry.cloud:", metadataUri);
      }

      // Derive on-chain RWA config from visible UI controls so values aren't hardcoded
      const toBaseUnits = (n: number) =>
        BigInt(Math.max(0, Math.floor(n))) * BigInt(1_000_000);
      const parseTimeToMinutes = (t: string) => {
        // t like "HH:MM"
        const [hh, mm] = (t || "00:00")
          .split(":")
          .map((x) => parseInt(x || "0", 10));
        return (isFinite(hh) ? hh : 0) * 60 + (isFinite(mm) ? mm : 0);
      };

      let derivedRwaConfig: RWAConfig | undefined = undefined;
      if (formData.transferHook.enabled) {
        // Geographic restrictions mapping
        const allowedCountries = (formData.allowedCountriesCsv || "")
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);
        const restrictedStates: string[] = (
          formData.restrictedCountriesCsv || ""
        )
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);

        // Trading hours mapping to minutes per day (Token-2022 style)
        const startMins = parseTimeToMinutes(formData.tradingHours.startTime);
        const endMins = parseTimeToMinutes(formData.tradingHours.endTime);
        const selected = new Set(formData.tradingHours.daysOfWeek || []);
        const th = {
          mondayStart: selected.has(1) ? startMins : 0,
          mondayEnd: selected.has(1) ? endMins : 0,
          tuesdayStart: selected.has(2) ? startMins : 0,
          tuesdayEnd: selected.has(2) ? endMins : 0,
          wednesdayStart: selected.has(3) ? startMins : 0,
          wednesdayEnd: selected.has(3) ? endMins : 0,
          thursdayStart: selected.has(4) ? startMins : 0,
          thursdayEnd: selected.has(4) ? endMins : 0,
          fridayStart: selected.has(5) ? startMins : 0,
          fridayEnd: selected.has(5) ? endMins : 0,
          saturdayStart: selected.has(6) ? startMins : 0,
          saturdayEnd: selected.has(6) ? endMins : 0,
          sundayStart: selected.has(7) ? startMins : 0,
          sundayEnd: selected.has(7) ? endMins : 0,
        };

        // Amount limits -> base units (default 6 decimals)
        const minTradeAmount = toBaseUnits(
          formData.amountLimits.minTrade
        ).toString();
        const maxTradeAmount = toBaseUnits(
          formData.amountLimits.maxTrade
        ).toString();
        const daily = toBaseUnits(formData.amountLimits.dailyLimit).toString();
        const monthly = toBaseUnits(
          formData.amountLimits.monthlyLimit
        ).toString();

        // Build derived config using defaults where UI lacks an explicit control
        derivedRwaConfig = {
          ...formData.rwaConfig,
          allowedCountries,
          restrictedStates,
          tradingHours: th,
          tradingLimits: {
            minTradeAmount,
            maxTradeAmount,
            // Map UI daily limit to all three KYC tiers unless customized elsewhere
            kycBasicDailyLimit: daily,
            kycEnhancedDailyLimit: daily,
            kycInstitutionalDailyLimit: monthly,
          },
          feeStructure: {
            ...formData.rwaConfig.feeStructure,
            tradingFeeBps: formData.transferFee.enabled
              ? formData.transferFee.config.transferFeeBasisPoints
              : formData.rwaConfig.feeStructure.tradingFeeBps,
          },
        } as RWAConfig;
      }

      // Prepare parameters for SDK
      const params = {
        supply: formData.supply,
        mintAuthority: safePublicKey(walletAddress),
        freezeAuthority: safePublicKey(walletAddress), // Optional: can be undefined for no freeze authority
        transferFee: formData.transferFee.enabled
          ? {
              enabled: true,
              transferFeeBasisPoints:
                formData.transferFee.config.transferFeeBasisPoints,
              maximumFee: formData.transferFee.config.maximumFee,
              feeAuthority: safePublicKey(walletAddress)!,
            }
          : undefined,
        interestBearing: formData.interestBearing.enabled
          ? {
              enabled: true,
              rateAuthority: safePublicKey(walletAddress)!,
              currentRate: formData.interestBearing.config.currentRate,
            }
          : undefined,
        metadata: formData.metadata.enabled
          ? {
              name: formData.metadata.config.name,
              symbol: formData.metadata.config.symbol,
              description: formData.metadata.config.description,
              uri: metadataUri,
              // Include RWA configuration for onchain metadata storage
              rwaConfig: formData.transferHook.enabled
                ? derivedRwaConfig
                : undefined,
            }
          : undefined,
        transferHook: formData.transferHook.enabled
          ? {
              enabled: true,
              programId: safePublicKey(formData.transferHook.config.programId)!,
              authority: safePublicKey(walletAddress)!,
            }
          : undefined,
      };

      const mintAddress = await createRwaMint(params);
      setCreatedMintAddress(mintAddress.mintAddress);
      setSubmitStatus("success");

      console.log("Successfully created mint:", mintAddress);
    } catch (err) {
      console.error("Failed to create mint:", err);
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
            <span>Basic Info</span>
            <span>Extensions & RWA</span>
            <span>Review</span>
          </div>
        </div>

        <form onSubmit={(e) => e.preventDefault()} className="space-y-8">
          {/* Step 1: Basic Mint Information + Asset Details */}
          {step === 1 && (
            <div className="space-y-6">
              {/* Asset Details moved from Step 2 */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white flex items-center">
                    <FileText className="w-5 h-5 mr-2" />
                    Asset Details
                  </h3>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.metadata.enabled}
                      onChange={(e) =>
                        updateFormData("metadata.enabled", e.target.checked)
                      }
                      className="mr-2"
                    />
                    <span className="text-gray-300">Enable</span>
                  </label>
                </div>
                {formData.metadata.enabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Asset Name
                      </label>
                      <input
                        type="text"
                        value={formData.metadata.config.name}
                        onChange={(e) =>
                          updateFormData("metadata.config.name", e.target.value)
                        }
                        onKeyDown={handleInputKeyDown}
                        placeholder="e.g., Real Estate Token"
                        className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Asset Symbol
                      </label>
                      <input
                        type="text"
                        value={formData.metadata.config.symbol}
                        onChange={(e) =>
                          updateFormData(
                            "metadata.config.symbol",
                            e.target.value
                          )
                        }
                        onKeyDown={handleInputKeyDown}
                        placeholder="e.g., RET"
                        className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Asset Description
                      </label>
                      <textarea
                        value={formData.metadata.config.description}
                        onChange={(e) =>
                          updateFormData(
                            "metadata.config.description",
                            e.target.value
                          )
                        }
                        placeholder="Describe your real-world asset token..."
                        rows={3}
                        className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                      />
                    </div>
                  </div>
                )}

                {/* Total Asset Units and Asset Logo on the same row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Total Asset Units
                    </label>
                    <input
                      type="number"
                      value={formData.supply}
                      onChange={(e) =>
                        updateFormData("supply", parseInt(e.target.value))
                      }
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                    />
                  </div>
                  {formData.metadata.enabled && (
                    <FileUploadField
                      label="Asset Logo"
                      fieldName="logo"
                      accept=".png,.jpg,.jpeg,.gif,.webp,.svg"
                    />
                  )}
                </div>
              </div>

              {/* Asset Documents - moved into its own section */}
              {formData.metadata.enabled && (
                <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white flex items-center mb-4">
                    <FileText className="w-5 h-5 mr-2" />
                    Asset Documents
                  </h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FileUploadField
                        label="Legal Agreement"
                        fieldName="legalAgreement"
                        accept=".pdf,.doc,.docx"
                      />
                      <FileUploadField
                        label="Property Deed/Certificate"
                        fieldName="propertyDeed"
                        accept=".pdf,.jpg,.jpeg,.png"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FileUploadField
                        label="Financial Statement"
                        fieldName="financialStatement"
                        accept=".pdf,.xlsx,.xls"
                      />
                      <FileUploadField
                        label="Insurance Certificate"
                        fieldName="insuranceCertificate"
                        accept=".pdf,.jpg,.jpeg,.png"
                      />
                    </div>
                    <div>
                      <FileUploadField
                        label="Additional Documents"
                        fieldName="additionalDocs"
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls"
                        multiple={true}
                      />
                      <p className="mt-2 text-xs text-gray-400">
                        Upload any additional documents related to the asset
                        (appraisals, inspections, etc.)
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                <h2 className="text-xl font-semibold text-white mb-6 flex items-center">
                  <Settings className="w-5 h-5 mr-2" />
                  Basic Mint Configuration
                </h2>

                <div className="space-y-4">
                  <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                    <p className="text-sm text-blue-400 mb-2">
                      <strong>Connected Wallet:</strong>{" "}
                      {publicKey
                        ? shortenAddress(publicKey.toString())
                        : "Not connected"}
                    </p>
                    <p className="text-xs text-gray-400">
                      This wallet will be set as the Asset Manager and Freezer
                      for the token.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Token Extensions */}
          {step === 2 && (
            <div className="space-y-6">
              {/* Transfer Fee Extension */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <h3 className="text-lg font-semibold text-white flex items-center">
                      <DollarSign className="w-5 h-5 mr-2" />
                      Transfer Fee
                    </h3>
                    <InfoTooltip>
                      Charge a fee on every token transfer.
                      <br />
                      Useful for revenue generation or transaction regulation.
                    </InfoTooltip>
                  </div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.transferFee.enabled}
                      onChange={(e) =>
                        updateFormData("transferFee.enabled", e.target.checked)
                      }
                      className="mr-2"
                    />
                    <span className="text-gray-300">Enable</span>
                  </label>
                </div>

                {formData.transferFee.enabled && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <label className="text-sm font-medium text-gray-300">
                            Fee Rate
                          </label>
                          <InfoTooltip>
                            Basis points = percentage × 100
                            <br />
                            100 = 1%, 250 = 2.5%, 1000 = 10%
                            <br />
                            Max: 10,000 (100%)
                          </InfoTooltip>
                        </div>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max="10000"
                            value={
                              formData.transferFee.config.transferFeeBasisPoints
                            }
                            onChange={(e) =>
                              updateFormData(
                                "transferFee.config.transferFeeBasisPoints",
                                parseInt(e.target.value)
                              )
                            }
                            className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 pr-16 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                            placeholder="100"
                          />
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-gray-400">
                            bps
                          </div>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          {formData.transferFee.config.transferFeeBasisPoints >
                            0 && (
                            <>
                              Fee:{" "}
                              {(
                                formData.transferFee.config
                                  .transferFeeBasisPoints / 100
                              ).toFixed(2)}
                              % per transfer
                            </>
                          )}
                        </p>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <label className="text-sm font-medium text-gray-300">
                            Maximum Fee Cap
                          </label>
                          <InfoTooltip>
                            Maximum fee amount in tokens
                            <br />
                            Prevents excessive fees on large transfers
                          </InfoTooltip>
                        </div>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            value={formData.transferFee.config.maximumFee}
                            onChange={(e) =>
                              updateFormData(
                                "transferFee.config.maximumFee",
                                parseInt(e.target.value)
                              )
                            }
                            className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 pr-16 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                            placeholder="1000"
                          />
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-gray-400">
                            tokens
                          </div>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          Cap prevents fees over{" "}
                          {formData.transferFee.config.maximumFee.toLocaleString()}{" "}
                          tokens
                        </p>
                      </div>
                    </div>

                    {/* Fee Examples */}
                    <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                      <h4 className="text-sm font-medium text-blue-400 mb-2">
                        Fee Examples
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-300">
                        <div>
                          <span className="text-gray-400">
                            Transfer 1,000 tokens:
                          </span>
                          <br />
                          Fee:{" "}
                          {Math.min(
                            (1000 *
                              formData.transferFee.config
                                .transferFeeBasisPoints) /
                              10000,
                            formData.transferFee.config.maximumFee
                          ).toFixed(2)}{" "}
                          tokens
                        </div>
                        <div>
                          <span className="text-gray-400">
                            Transfer 10,000 tokens:
                          </span>
                          <br />
                          Fee:{" "}
                          {Math.min(
                            (10000 *
                              formData.transferFee.config
                                .transferFeeBasisPoints) /
                              10000,
                            formData.transferFee.config.maximumFee
                          ).toFixed(2)}{" "}
                          tokens
                        </div>
                        <div>
                          <span className="text-gray-400">
                            Transfer 100,000 tokens:
                          </span>
                          <br />
                          Fee:{" "}
                          {Math.min(
                            (100000 *
                              formData.transferFee.config
                                .transferFeeBasisPoints) /
                              10000,
                            formData.transferFee.config.maximumFee
                          ).toFixed(2)}{" "}
                          tokens
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                      <p className="text-sm text-green-400">
                        <strong>Fee Authority:</strong>{" "}
                        {publicKey
                          ? shortenAddress(publicKey.toString())
                          : "Your connected wallet"}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Your connected wallet will receive all transfer fees
                        automatically.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Metadata Extension moved to Step 1 */}

              {/* Memo Transfer Extension */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white flex items-center">
                    <FileText className="w-5 h-5 mr-2" />
                    Transaction Note Required
                  </h3>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.memoTransfer.enabled}
                      onChange={(e) =>
                        updateFormData("memoTransfer.enabled", e.target.checked)
                      }
                      className="mr-2"
                    />
                    <span className="text-gray-300">Enable</span>
                  </label>
                </div>

                {formData.memoTransfer.enabled && (
                  <div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={
                          formData.memoTransfer.requireIncomingTransferMemos
                        }
                        onChange={(e) =>
                          updateFormData(
                            "memoTransfer.requireIncomingTransferMemos",
                            e.target.checked
                          )
                        }
                        className="mr-2"
                      />
                      <span className="text-gray-300">
                        Require incoming transfer memos
                      </span>
                    </label>
                  </div>
                )}
              </div>

              {/* Interest Bearing Extension */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white flex items-center">
                    <Percent className="w-5 h-5 mr-2" />
                    Yield/Interest Feature
                  </h3>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.interestBearing.enabled}
                      onChange={(e) =>
                        updateFormData(
                          "interestBearing.enabled",
                          e.target.checked
                        )
                      }
                      className="mr-2"
                    />
                    <span className="text-gray-300">Enable</span>
                  </label>
                </div>

                {formData.interestBearing.enabled && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Current Rate (basis points - 500 = 5%)
                      </label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        max="10000"
                        value={formData.interestBearing.config.currentRate}
                        onChange={(e) =>
                          updateFormData(
                            "interestBearing.config.currentRate",
                            parseInt(e.target.value)
                          )
                        }
                        className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                      />
                    </div>
                    <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                      <p className="text-sm text-green-400">
                        <strong>Rate Authority:</strong>{" "}
                        {publicKey
                          ? shortenAddress(publicKey.toString())
                          : "Your connected wallet"}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Your connected wallet will control the interest rate.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Transfer Hook Extension */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white flex items-center">
                    <Shield className="w-5 h-5 mr-2" />
                    Compliance & Controls
                  </h3>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.transferHook.enabled}
                      onChange={(e) =>
                        updateFormData("transferHook.enabled", e.target.checked)
                      }
                      className="mr-2"
                    />
                    <span className="text-gray-300">Enable</span>
                  </label>
                </div>

                {formData.transferHook.enabled && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Program ID
                      </label>
                      <input
                        type="text"
                        value={formData.transferHook.config.programId}
                        onChange={(e) =>
                          updateFormData(
                            "transferHook.config.programId",
                            e.target.value
                          )
                        }
                        className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                      />
                    </div>

                    <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                      <p className="text-sm text-green-400">
                        <strong>Hook Authority:</strong>{" "}
                        {publicKey
                          ? shortenAddress(publicKey.toString())
                          : "Your connected wallet"}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Your connected wallet will control the transfer hook
                        settings.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.transferHook.config.kycRequired}
                          onChange={(e) =>
                            updateFormData(
                              "transferHook.config.kycRequired",
                              e.target.checked
                            )
                          }
                          className="mr-2"
                        />
                        <span className="text-gray-300">KYC Required</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={
                            formData.transferHook.config.geographicRestrictions
                          }
                          onChange={(e) =>
                            updateFormData(
                              "transferHook.config.geographicRestrictions",
                              e.target.checked
                            )
                          }
                          className="mr-2"
                        />
                        <span className="text-gray-300">
                          Geographic Restrictions
                        </span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={
                            formData.transferHook.config.tradingHoursEnabled
                          }
                          onChange={(e) =>
                            updateFormData(
                              "transferHook.config.tradingHoursEnabled",
                              e.target.checked
                            )
                          }
                          className="mr-2"
                        />
                        <span className="text-gray-300">Trading Hours</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={
                            formData.transferHook.config.amountLimitsEnabled
                          }
                          onChange={(e) =>
                            updateFormData(
                              "transferHook.config.amountLimitsEnabled",
                              e.target.checked
                            )
                          }
                          className="mr-2"
                        />
                        <span className="text-gray-300">Amount Limits</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* RWA-Specific Configuration moved from previous Step 3 */}
              {/* Geographic Restrictions */}
              {formData.transferHook.enabled &&
                formData.transferHook.config.geographicRestrictions && (
                  <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-white flex items-center">
                        <Globe className="w-5 h-5 mr-2" />
                        Geographic Restrictions
                      </h3>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={addGeographicRestriction}
                          className="flex items-center px-4 py-2 bg-gradient-to-b from-neutral-800 to-neutral-950 text-white rounded-lg hover:from-neutral-700 hover:to-neutral-900 transition-all"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add Restriction
                        </button>
                      </div>
                    </div>

                    {/* Allowed countries multi-select + Select All */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-300">
                          Allowed Countries (optional)
                        </label>
                        <button
                          type="button"
                          onClick={toggleAllowedAll}
                          className="px-3 py-1 text-xs border border-white/20 rounded hover:bg-white/10"
                        >
                          {isAllAllowedSelected ? "Deselect All" : "Select All"}
                        </button>
                      </div>
                      <CountryMultiSelect
                        value={formData.allowedCountriesCsv}
                        onChange={(csv) =>
                          updateFormData("allowedCountriesCsv", csv)
                        }
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        Leave empty to allow any country that is not explicitly
                        restricted below.
                      </p>
                    </div>

                    {/* Restricted countries multi-select with Select All */}
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-300">
                          Restricted Countries
                        </label>
                        <button
                          type="button"
                          onClick={toggleRestrictedAll}
                          className="px-3 py-1 text-xs border border-white/20 rounded hover:bg-white/10"
                        >
                          {isAllRestrictedSelected
                            ? "Deselect All"
                            : "Select All"}
                        </button>
                      </div>
                      <CountryMultiSelect
                        value={formData.restrictedCountriesCsv}
                        onChange={(csv) => {
                          // Remove any codes that are present in allowed list
                          const allowed = new Set(
                            parseCodesCsv(formData.allowedCountriesCsv)
                          );
                          const filtered = parseCodesCsv(csv).filter(
                            (c) => !allowed.has(c)
                          );
                          updateFormData(
                            "restrictedCountriesCsv",
                            filtered.join(",")
                          );
                        }}
                        filterOut={
                          new Set(parseCodesCsv(formData.allowedCountriesCsv))
                        }
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        If any country is selected here, transfers from these
                        countries will be restricted.
                      </p>
                    </div>

                    {/* Deprecated per-country rows replaced by multi-select above */}
                  </div>
                )}

              {/* Trading Hours */}
              {formData.transferHook.enabled &&
                formData.transferHook.config.tradingHoursEnabled && (
                  <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-white flex items-center mb-4">
                      <Clock className="w-5 h-5 mr-2" />
                      Trading Hours
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Timezone
                        </label>
                        <select
                          value={formData.tradingHours.timezone}
                          onChange={(e) =>
                            updateFormData(
                              "tradingHours.timezone",
                              e.target.value
                            )
                          }
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-gray-500"
                        >
                          <option value="UTC">UTC</option>
                          <option value="America/New_York">Eastern Time</option>
                          <option value="America/Chicago">Central Time</option>
                          <option value="America/Denver">Mountain Time</option>
                          <option value="America/Los_Angeles">
                            Pacific Time
                          </option>
                          <option value="Europe/London">London</option>
                          <option value="Europe/Paris">Paris</option>
                          <option value="Asia/Tokyo">Tokyo</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Start Time
                        </label>
                        <input
                          type="time"
                          value={formData.tradingHours.startTime}
                          onChange={(e) =>
                            updateFormData(
                              "tradingHours.startTime",
                              e.target.value
                            )
                          }
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          End Time
                        </label>
                        <input
                          type="time"
                          value={formData.tradingHours.endTime}
                          onChange={(e) =>
                            updateFormData(
                              "tradingHours.endTime",
                              e.target.value
                            )
                          }
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Trading Days
                      </label>
                      <div className="flex space-x-4">
                        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                          (day, index) => (
                            <label key={day} className="flex items-center">
                              <input
                                type="checkbox"
                                checked={formData.tradingHours.daysOfWeek.includes(
                                  index + 1
                                )}
                                onChange={(e) => {
                                  const newDays = e.target.checked
                                    ? [
                                        ...formData.tradingHours.daysOfWeek,
                                        index + 1,
                                      ].sort()
                                    : formData.tradingHours.daysOfWeek.filter(
                                        (d) => d !== index + 1
                                      );
                                  updateFormData(
                                    "tradingHours.daysOfWeek",
                                    newDays
                                  );
                                }}
                                className="mr-2"
                              />
                              <span className="text-gray-300">{day}</span>
                            </label>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                )}

              {/* Amount Limits */}
              {formData.transferHook.enabled &&
                formData.transferHook.config.amountLimitsEnabled && (
                  <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-white flex items-center mb-4">
                      <AlertTriangle className="w-5 h-5 mr-2" />
                      Trading Amount Limits
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Minimum Trade Amount
                        </label>
                        <input
                          type="number"
                          value={formData.amountLimits.minTrade}
                          onChange={(e) =>
                            updateFormData(
                              "amountLimits.minTrade",
                              parseInt(e.target.value)
                            )
                          }
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Maximum Trade Amount
                        </label>
                        <input
                          type="number"
                          value={formData.amountLimits.maxTrade}
                          onChange={(e) =>
                            updateFormData(
                              "amountLimits.maxTrade",
                              parseInt(e.target.value)
                            )
                          }
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Daily Limit
                        </label>
                        <input
                          type="number"
                          value={formData.amountLimits.dailyLimit}
                          onChange={(e) =>
                            updateFormData(
                              "amountLimits.dailyLimit",
                              parseInt(e.target.value)
                            )
                          }
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Monthly Limit
                        </label>
                        <input
                          type="number"
                          value={formData.amountLimits.monthlyLimit}
                          onChange={(e) =>
                            updateFormData(
                              "amountLimits.monthlyLimit",
                              parseInt(e.target.value)
                            )
                          }
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                        />
                      </div>
                    </div>
                  </div>
                )}
            </div>
          )}

          {/* Step 3: RWA-Specific Configuration */}
          {false && step === 3 && (
            <div className="space-y-6">
              {/* Geographic Restrictions */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white flex items-center">
                    <Globe className="w-5 h-5 mr-2" />
                    Geographic Restrictions
                  </h3>
                  <button
                    type="button"
                    onClick={addGeographicRestriction}
                    className="flex items-center px-4 py-2 bg-gradient-to-b from-neutral-800 to-neutral-950 text-white rounded-lg hover:from-neutral-700 hover:to-neutral-900 transition-all"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Restriction
                  </button>
                </div>

                <div className="space-y-4">
                  {formData.geographicRestrictions.map((restriction, index) => (
                    <div
                      key={index}
                      className="flex items-center space-x-4 p-4 bg-white/5 rounded-lg"
                    >
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                        <input
                          type="text"
                          placeholder="Country"
                          value={restriction.country}
                          onChange={(e) =>
                            updateGeographicRestriction(
                              index,
                              "country",
                              e.target.value
                            )
                          }
                          className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                        />
                        <select
                          value={
                            restriction.restricted ? "restricted" : "allowed"
                          }
                          onChange={(e) =>
                            updateGeographicRestriction(
                              index,
                              "restricted",
                              e.target.value === "restricted"
                            )
                          }
                          className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-gray-500"
                        >
                          <option value="allowed">Allowed</option>
                          <option value="restricted">Restricted</option>
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeGeographicRestriction(index)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Trading Hours */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white flex items-center mb-4">
                  <Clock className="w-5 h-5 mr-2" />
                  Trading Hours
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Timezone
                    </label>
                    <select
                      value={formData.tradingHours.timezone}
                      onChange={(e) =>
                        updateFormData("tradingHours.timezone", e.target.value)
                      }
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-gray-500"
                    >
                      <option value="UTC">UTC</option>
                      <option value="America/New_York">Eastern Time</option>
                      <option value="America/Chicago">Central Time</option>
                      <option value="America/Denver">Mountain Time</option>
                      <option value="America/Los_Angeles">Pacific Time</option>
                      <option value="Europe/London">London</option>
                      <option value="Europe/Paris">Paris</option>
                      <option value="Asia/Tokyo">Tokyo</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={formData.tradingHours.startTime}
                      onChange={(e) =>
                        updateFormData("tradingHours.startTime", e.target.value)
                      }
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      End Time
                    </label>
                    <input
                      type="time"
                      value={formData.tradingHours.endTime}
                      onChange={(e) =>
                        updateFormData("tradingHours.endTime", e.target.value)
                      }
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-gray-500"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Trading Days
                  </label>
                  <div className="flex space-x-4">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                      (day, index) => (
                        <label key={day} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={formData.tradingHours.daysOfWeek.includes(
                              index + 1
                            )}
                            onChange={(e) => {
                              const newDays = e.target.checked
                                ? [
                                    ...formData.tradingHours.daysOfWeek,
                                    index + 1,
                                  ].sort()
                                : formData.tradingHours.daysOfWeek.filter(
                                    (d) => d !== index + 1
                                  );
                              updateFormData(
                                "tradingHours.daysOfWeek",
                                newDays
                              );
                            }}
                            className="mr-2"
                          />
                          <span className="text-gray-300">{day}</span>
                        </label>
                      )
                    )}
                  </div>
                </div>
              </div>

              {/* Amount Limits */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white flex items-center mb-4">
                  <AlertTriangle className="w-5 h-5 mr-2" />
                  Trading Amount Limits
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Minimum Trade Amount
                    </label>
                    <input
                      type="number"
                      value={formData.amountLimits.minTrade}
                      onChange={(e) =>
                        updateFormData(
                          "amountLimits.minTrade",
                          parseInt(e.target.value)
                        )
                      }
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Maximum Trade Amount
                    </label>
                    <input
                      type="number"
                      value={formData.amountLimits.maxTrade}
                      onChange={(e) =>
                        updateFormData(
                          "amountLimits.maxTrade",
                          parseInt(e.target.value)
                        )
                      }
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Daily Limit
                    </label>
                    <input
                      type="number"
                      value={formData.amountLimits.dailyLimit}
                      onChange={(e) =>
                        updateFormData(
                          "amountLimits.dailyLimit",
                          parseInt(e.target.value)
                        )
                      }
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Monthly Limit
                    </label>
                    <input
                      type="number"
                      value={formData.amountLimits.monthlyLimit}
                      onChange={(e) =>
                        updateFormData(
                          "amountLimits.monthlyLimit",
                          parseInt(e.target.value)
                        )
                      }
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Review and Create */}
          {step === 3 && (
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-6 flex items-center">
                <Shield className="w-5 h-5 mr-2" />
                Review Asset Configuration
              </h2>

              <div className="space-y-6 text-gray-300">
                {/* Basic Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-medium text-white mb-3">
                      Basic Information
                    </h3>
                    <div className="space-y-2">
                      <p>
                        <span className="text-gray-400">
                          Total Asset Units:
                        </span>{" "}
                        {formData.supply.toLocaleString()}
                      </p>
                      <p>
                        <span className="text-gray-400">
                          Asset Manager Address:
                        </span>{" "}
                        {publicKey
                          ? shortenAddress(publicKey.toString())
                          : "Wallet not connected"}
                      </p>
                      <p>
                        <span className="text-gray-400">
                          Asset Freezer Address:
                        </span>{" "}
                        {publicKey
                          ? shortenAddress(publicKey.toString())
                          : "Wallet not connected"}
                      </p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-medium text-white mb-3">
                      Compliance & Controls
                    </h3>
                    <div className="space-y-2">
                      <p>
                        <span className="text-gray-400">Enabled:</span>{" "}
                        {formData.transferHook.enabled ? "✅" : "❌"}
                      </p>
                      {formData.transferHook.enabled && (
                        <>
                          <p>
                            <span className="text-gray-400">Program ID:</span>{" "}
                            {shortenAddress(
                              formData.transferHook.config.programId,
                              6,
                              6
                            )}
                          </p>
                          <p>
                            <span className="text-gray-400">Authority:</span>{" "}
                            {publicKey
                              ? shortenAddress(publicKey.toString(), 6, 6)
                              : "Wallet not connected"}
                          </p>
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <p>
                              <span className="text-gray-400">KYC:</span>{" "}
                              {formData.transferHook.config.kycRequired
                                ? "✅"
                                : "❌"}
                            </p>
                            <p>
                              <span className="text-gray-400">
                                Geo Restrict:
                              </span>{" "}
                              {formData.transferHook.config
                                .geographicRestrictions
                                ? "✅"
                                : "❌"}
                            </p>
                            <p>
                              <span className="text-gray-400">
                                Trading Hours:
                              </span>{" "}
                              {formData.transferHook.config.tradingHoursEnabled
                                ? "✅"
                                : "❌"}
                            </p>
                            <p>
                              <span className="text-gray-400">
                                Amount Limits:
                              </span>{" "}
                              {formData.transferHook.config.amountLimitsEnabled
                                ? "✅"
                                : "❌"}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Asset Details */}
                {formData.metadata.enabled && (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <h3 className="text-lg font-medium text-white mb-3">
                      Asset Details
                    </h3>
                    <div className="space-y-4">
                      {/* Two column layout: Logo/Info and Description */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Left column: Logo, Name, Symbol */}
                        <div className="flex items-start gap-4">
                          {uploadedFiles.logo?.url && (
                            <div className="flex-shrink-0">
                              <img
                                src={uploadedFiles.logo.url}
                                alt={
                                  formData.metadata.config.name || "Asset logo"
                                }
                                className="w-16 h-16 object-cover rounded-lg border border-white/20"
                              />
                            </div>
                          )}
                          <div className="flex-grow space-y-1">
                            <p>
                              <span className="text-gray-400">Name:</span>{" "}
                              <span className="text-white font-medium">
                                {formData.metadata.config.name || "Not set"}
                              </span>
                            </p>
                            <p>
                              <span className="text-gray-400">Symbol:</span>{" "}
                              <span className="text-white font-medium">
                                {formData.metadata.config.symbol || "Not set"}
                              </span>
                            </p>
                          </div>
                        </div>

                        {/* Right column: Description */}
                        <div className="flex flex-col">
                          <p className="text-gray-400 text-sm mb-2">
                            Description:
                          </p>
                          <p className="text-white whitespace-pre-wrap text-sm leading-relaxed">
                            {formData.metadata.config.description ||
                              "No description provided"}
                          </p>
                        </div>
                      </div>

                      {/* Documents summary */}
                      {(uploadedFiles.legalAgreement ||
                        uploadedFiles.propertyDeed ||
                        uploadedFiles.financialStatement ||
                        uploadedFiles.insuranceCertificate ||
                        (uploadedFiles.additionalDocs &&
                          uploadedFiles.additionalDocs.length > 0)) && (
                        <div className="pt-2 border-t border-white/10">
                          <p className="text-sm text-gray-400 mb-2">
                            Uploaded Documents:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {uploadedFiles.legalAgreement && (
                              <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-1 rounded">
                                Legal Agreement
                              </span>
                            )}
                            {uploadedFiles.propertyDeed && (
                              <span className="text-xs bg-green-500/20 text-green-300 px-2 py-1 rounded">
                                Property Deed
                              </span>
                            )}
                            {uploadedFiles.financialStatement && (
                              <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded">
                                Financial Statement
                              </span>
                            )}
                            {uploadedFiles.insuranceCertificate && (
                              <span className="text-xs bg-orange-500/20 text-orange-300 px-2 py-1 rounded">
                                Insurance Certificate
                              </span>
                            )}
                            {uploadedFiles.additionalDocs &&
                              uploadedFiles.additionalDocs.length > 0 && (
                                <span className="text-xs bg-gray-500/20 text-gray-300 px-2 py-1 rounded">
                                  +{uploadedFiles.additionalDocs.length}{" "}
                                  Additional
                                </span>
                              )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Transfer Fee */}
                {formData.transferFee.enabled && (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <h3 className="text-lg font-medium text-white mb-3">
                      Transfer Fee
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <p>
                        <span className="text-gray-400">Bps:</span>{" "}
                        {formData.transferFee.config.transferFeeBasisPoints}
                      </p>
                      <p>
                        <span className="text-gray-400">Maximum Fee:</span>{" "}
                        {formData.transferFee.config.maximumFee}
                      </p>
                      <p>
                        <span className="text-gray-400">Fee Authority:</span>{" "}
                        {publicKey
                          ? shortenAddress(publicKey.toString())
                          : "Wallet not connected"}
                      </p>
                    </div>
                  </div>
                )}

                {/* Memo Transfer */}
                {formData.memoTransfer.enabled && (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <h3 className="text-lg font-medium text-white mb-3">
                      Transaction Note
                    </h3>
                    <p>
                      <span className="text-gray-400">
                        Require incoming transfer memos:
                      </span>{" "}
                      {formData.memoTransfer.requireIncomingTransferMemos
                        ? "✅"
                        : "❌"}
                    </p>
                  </div>
                )}

                {/* Interest Bearing */}
                {formData.interestBearing.enabled && (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <h3 className="text-lg font-medium text-white mb-3">
                      Yield / Interest
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <p>
                        <span className="text-gray-400">Rate Authority:</span>{" "}
                        {publicKey
                          ? shortenAddress(publicKey.toString())
                          : "Wallet not connected"}
                      </p>
                      <p>
                        <span className="text-gray-400">
                          Current Rate (% APY):
                        </span>{" "}
                        {(
                          formData.interestBearing.config.currentRate / 100
                        ).toFixed(2)}
                        %
                      </p>
                    </div>
                  </div>
                )}

                {/* RWA Details */}
                {formData.transferHook.enabled && (
                  <>
                    {formData.transferHook.config.geographicRestrictions && (
                      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                        <h3 className="text-lg font-medium text-white mb-3">
                          Geographic Restrictions
                        </h3>
                        {formData.geographicRestrictions.length === 0 ? (
                          <p className="text-gray-400">
                            No restrictions added.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {formData.geographicRestrictions.map((r, i) => (
                              <p key={i}>
                                <span className="text-gray-400">
                                  Entry {i + 1}:
                                </span>{" "}
                                {r.country} —{" "}
                                {r.restricted ? "Restricted" : "Allowed"}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {formData.transferHook.config.tradingHoursEnabled && (
                      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                        <h3 className="text-lg font-medium text-white mb-3">
                          Trading Hours
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <p>
                            <span className="text-gray-400">Timezone:</span>{" "}
                            {formData.tradingHours.timezone}
                          </p>
                          <p>
                            <span className="text-gray-400">Start:</span>{" "}
                            {formData.tradingHours.startTime}
                          </p>
                          <p>
                            <span className="text-gray-400">End:</span>{" "}
                            {formData.tradingHours.endTime}
                          </p>
                        </div>
                        <div className="mt-2">
                          <p>
                            <span className="text-gray-400">Days:</span>{" "}
                            {formData.tradingHours.daysOfWeek
                              .sort()
                              .map(
                                (d) =>
                                  [
                                    "Mon",
                                    "Tue",
                                    "Wed",
                                    "Thu",
                                    "Fri",
                                    "Sat",
                                    "Sun",
                                  ][d - 1]
                              )
                              .join(", ") || "None"}
                          </p>
                        </div>
                      </div>
                    )}

                    {formData.transferHook.config.amountLimitsEnabled && (
                      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                        <h3 className="text-lg font-medium text-white mb-3">
                          Trading Amount Limits
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <p>
                            <span className="text-gray-400">Minimum:</span>{" "}
                            {formData.amountLimits.minTrade}
                          </p>
                          <p>
                            <span className="text-gray-400">Maximum:</span>{" "}
                            {formData.amountLimits.maxTrade}
                          </p>
                          <p>
                            <span className="text-gray-400">Daily Limit:</span>{" "}
                            {formData.amountLimits.dailyLimit}
                          </p>
                          <p>
                            <span className="text-gray-400">
                              Monthly Limit:
                            </span>{" "}
                            {formData.amountLimits.monthlyLimit}
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Success/Error Messages */}
          {submitStatus === "success" && createdMintAddress && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-green-400 mb-2">
                🎉 Asset Successfully Created!
              </h3>
              <p className="text-gray-300 mb-4">
                Your RWA token has been successfully created with all compliance
                features enabled.
              </p>
              <div className="bg-black/20 rounded-lg p-4">
                <p className="text-sm text-gray-400 mb-2">Mint Address:</p>
                <p className="text-green-400 font-mono text-sm break-all">
                  {shortenAddress(createdMintAddress || undefined, 6, 6)}
                </p>
              </div>
              <div className="mt-4 flex space-x-4">
                <a
                  href={`/create-pool?mint=${createdMintAddress}`}
                  className="px-4 py-2 bg-gradient-to-b from-neutral-800 to-neutral-950 text-white rounded-lg hover:from-neutral-700 hover:to-neutral-900 transition-all"
                >
                  Create Pool
                </a>
                <button
                  onClick={() =>
                    navigator.clipboard.writeText(createdMintAddress)
                  }
                  className="px-4 py-2 border border-green-500 text-green-400 rounded-lg hover:bg-green-500/10 transition-all"
                >
                  Copy Address
                </button>
              </div>
            </div>
          )}

          {submitStatus === "error" && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-red-400 mb-2">
                ❌ Creation Failed
              </h3>
              <p className="text-gray-300 mb-2">
                There was an error creating your RWA token:
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
                onClick={handleSubmit as unknown as any}
                type="button"
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
                <Shield className="w-5 h-5 mr-2" />
                {!connected
                  ? "Connect Wallet First"
                  : submitStatus === "submitting" || loading
                  ? "Taking Asset on Chain..."
                  : submitStatus === "success"
                  ? "Asset Created!"
                  : "Take Asset on Chain"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
