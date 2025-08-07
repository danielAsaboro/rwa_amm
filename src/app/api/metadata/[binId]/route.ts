import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ binId: string }> }
) {
  try {
    const { binId } = await params;

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

    // Fetch from Pantry public endpoint
    const response = await fetch(
      `https://getpantry.cloud/apiv1/pantry/${pantryId}/basket/${binId}`
    );

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Failed to fetch metadata: ${response.status}`,
        },
        { status: response.status }
      );
    }

    const result = await response.json();

    return NextResponse.json({
      metadata: result,
      basketInfo: {
        id: binId,
        pantryId: pantryId,
      },
    });
  } catch (error) {
    console.error("Metadata fetch error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch metadata",
      },
      { status: 500 }
    );
  }
}
