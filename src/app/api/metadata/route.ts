import { NextRequest, NextResponse } from "next/server";

interface PantryResponse {
  success: boolean;
  data?: any;
  error?: string;
}

interface PantryErrorResponse {
  message: string;
  data?: any;
}

export async function POST(request: NextRequest) {
  try {
    const metadata = await request.json();

    // Get Pantry ID from environment variables
    const pantryId = process.env.PANTRY_ID;

    if (!pantryId) {
      return NextResponse.json(
        {
          error: "Pantry ID not configured",
        },
        { status: 500 }
      );
    }

    // Create a meaningful basket name from asset metadata
    const basketName = metadata.name
      ? `RWA-${metadata.symbol || "Asset"}-${metadata.name.substring(0, 50)}`
      : "RWA-Asset-Metadata";

    // Generate a unique basket key based on timestamp and metadata
    const basketKey = `${basketName}-${Date.now()}`.replace(
      /[^a-zA-Z0-9-_]/g,
      "-"
    );

    const response = await fetch(
      `https://getpantry.cloud/apiv1/pantry/${pantryId}/basket/${basketKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(metadata),
      }
    );

    if (!response.ok) {
      const errorResult = await response.text();
      console.error("Pantry API error:", {
        status: response.status,
        statusText: response.statusText,
        error: errorResult,
      });

      if (response.status === 401) {
        return NextResponse.json(
          {
            error:
              "Invalid Pantry ID. Please check PANTRY_ID in your environment (.env.local) and ensure it's a valid Pantry ID from getpantry.cloud.",
          },
          { status: 401 }
        );
      }

      return NextResponse.json(
        {
          error: `Pantry API error: ${
            errorResult || response.statusText || response.status
          }`,
        },
        { status: response.status }
      );
    }

    // Return the public URL for the JSON metadata
    const publicUri = `https://getpantry.cloud/apiv1/pantry/${pantryId}/basket/${basketKey}`;

    return NextResponse.json({
      uri: publicUri,
      basketId: basketKey,
      basketName: basketName,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Pantry storage error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to store metadata",
      },
      { status: 500 }
    );
  }
}
