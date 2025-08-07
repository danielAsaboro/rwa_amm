interface PantryResponse {
  success: boolean;
  data?: any;
  error?: string;
}


interface AssetMetadata {
  // Standard token metadata fields (Metaplex standard)
  name: string;
  symbol: string;
  description: string;
  image?: string;
  
  // Extended metadata for RWA tokens
  external_url?: string;
  animation_url?: string;
  
  // Asset-specific attributes
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
  
  // Document references stored on Cloudinary
  documents?: {
    legalAgreement?: string;
    propertyDeed?: string;
    financialStatement?: string;
    insuranceCertificate?: string;
    additionalDocs?: string[];
  };
  
  // RWA-specific properties
  properties?: {
    category: "Real World Asset";
    assetType: string;
    totalUnits: number;
    unitType?: string;
    jurisdiction?: string;
    custodian?: string;
    valuation?: {
      amount: number;
      currency: string;
      date: string;
      valuationMethod?: string;
    };
    complianceFeatures: {
      kycRequired?: boolean;
      geographicRestrictions?: boolean;
      tradingHours?: boolean;
      amountLimits?: boolean;
    };
    mintAddress?: string;
    createdAt: string;
    version: string;
  };
  
  // Collection information
  collection?: {
    name: string;
    family?: string;
  };
}

export async function storeMetadataOnPantry(metadata: AssetMetadata): Promise<string> {
  try {
    const response = await fetch('/api/metadata', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    });

    if (!response.ok) {
      throw new Error(`Metadata storage error: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    return result.uri;
  } catch (error) {
    console.error('Pantry storage error:', error);
    throw new Error('Failed to store metadata on Pantry');
  }
}

export async function getMetadataFromPantry(pantryId: string): Promise<AssetMetadata> {
  try {
    const response = await fetch(`/api/metadata/${pantryId}`);
    
    if (!response.ok) {
      throw new Error(`Pantry fetch error: ${response.status}`);
    }

    const result = await response.json();
    return result.metadata;
  } catch (error) {
    console.error('Pantry fetch error:', error);
    throw new Error('Failed to fetch metadata from Pantry');
  }
}

// Utility function to validate metadata before storing
export function validateAssetMetadata(metadata: AssetMetadata): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Required fields validation
  if (!metadata.name?.trim()) {
    errors.push('Asset name is required');
  }
  
  if (!metadata.symbol?.trim()) {
    errors.push('Asset symbol is required');
  }
  
  if (!metadata.description?.trim()) {
    errors.push('Asset description is required');
  }
  
  // Symbol length validation (common standard is 3-10 characters)
  if (metadata.symbol && (metadata.symbol.length < 2 || metadata.symbol.length > 10)) {
    errors.push('Asset symbol must be between 2-10 characters');
  }
  
  // Name length validation
  if (metadata.name && metadata.name.length > 200) {
    errors.push('Asset name must be under 200 characters');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}