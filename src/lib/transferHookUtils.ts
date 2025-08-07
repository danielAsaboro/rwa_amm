import { Connection, PublicKey, AccountInfo } from '@solana/web3.js'
import { TOKEN_2022_PROGRAM_ID, ExtensionType, unpackMint, getExtensionData } from '@solana/spl-token'
import { AnchorProvider } from '@coral-xyz/anchor'
import { TRANSFER_HOOK_PROGRAM_ID, getTransferHookProgram } from '../../anchor/src/program-exports'

// Transfer Hook Program ID from tests

/**
 * Check if a mint has transfer hook extension
 */
export async function hasTransferHook(
  connection: Connection,
  mint: PublicKey,
): Promise<{
  hasHook: boolean
  hookProgramId?: PublicKey
}> {
  try {
    const mintAccountInfo = await connection.getAccountInfo(mint)
    if (!mintAccountInfo) {
      return { hasHook: false }
    }

    // Only Token-2022 mints can have transfer hooks
    if (!mintAccountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
      return { hasHook: false }
    }

    // Parse mint data to check for transfer hook extension
    try {
      const mintInfo = unpackMint(mint, mintAccountInfo, TOKEN_2022_PROGRAM_ID)

      // Check if mint has transfer hook extension
      if (mintInfo.tlvData && mintInfo.tlvData.length > 0) {
        try {
          const transferHookData = getExtensionData(ExtensionType.TransferHook, mintInfo.tlvData)
          if (transferHookData && transferHookData.length >= 32) {
            const hookProgramId = new PublicKey(transferHookData.subarray(0, 32))

            if (!PublicKey.default.equals(hookProgramId)) {
              return {
                hasHook: true,
                hookProgramId,
              }
            }
          }
        } catch (err) {
          // Extension not found or invalid
        }
      }
    } catch (err) {
      console.warn('Error unpacking mint data:', err)
    }

    return { hasHook: false }
  } catch (err) {
    console.warn('Error checking transfer hook:', err)
    return { hasHook: false }
  }
}

/**
 * Get the extra-account-metas PDA for a mint
 */
export function getExtraAccountMetaListAddress(mint: PublicKey, hookProgramId?: PublicKey): PublicKey {
  const programId = hookProgramId || TRANSFER_HOOK_PROGRAM_ID
  const [address] = PublicKey.findProgramAddressSync([Buffer.from('extra-account-metas'), mint.toBuffer()], programId)
  return address
}

/**
 * Get user KYC PDA address
 */
export function getUserKycAddress(user: PublicKey): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [Buffer.from('user-kyc'), user.toBuffer()],
    TRANSFER_HOOK_PROGRAM_ID,
  )
  return address
}

/**
 * Get whitelist PDA address for a mint
 */
export function getWhitelistAddress(mint: PublicKey): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [Buffer.from('whitelist'), mint.toBuffer()],
    TRANSFER_HOOK_PROGRAM_ID,
  )
  return address
}

/**
 * Check if KYC account exists and get level
 */
export async function getKycStatus(
  connection: Connection,
  user: PublicKey,
): Promise<{
  exists: boolean
  level?: number
  country?: string
  state?: string
  city?: string
}> {
  try {
    const kycAddress = getUserKycAddress(user)
    // Create a lightweight read-only AnchorProvider
    const dummyWallet = {
      publicKey: PublicKey.default,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any[]) => txs,
    } as any
    const provider = new AnchorProvider(connection as any, dummyWallet, { commitment: 'confirmed' })
    const program = getTransferHookProgram(provider)
    let account = await program.account.userKyc.fetch(kycAddress)

    const toAscii = (bytes: Uint8Array | number[]) =>
      new TextDecoder().decode(Uint8Array.from(bytes as any)).replace(/\0+$/g, '')

    return {
      exists: true,
      level: account.kycLevel as number,
      country: toAscii(account.country),
      state: toAscii(account.state),
      city: toAscii(account.city),
    }
  } catch (err) {
    return { exists: false }
  }
}

/**
 * Resolve accounts needed for transfer hook execution
 */
export async function resolveTransferHookAccounts(
  connection: Connection,
  mint: PublicKey,
  source: PublicKey,
  destination: PublicKey,
  owner: PublicKey,
  amount: bigint,
): Promise<{
  accounts: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }>
  hookProgramId?: PublicKey
}> {
  try {
    const hookInfo = await hasTransferHook(connection, mint)

    if (!hookInfo.hasHook || !hookInfo.hookProgramId) {
      return { accounts: [] }
    }

    // Get extra account meta list
    const extraAccountMetaList = getExtraAccountMetaListAddress(mint, hookInfo.hookProgramId)

    // Check if extra account meta list exists
    const extraAccountInfo = await connection.getAccountInfo(extraAccountMetaList)
    if (!extraAccountInfo) {
      console.warn('Extra account meta list not found for mint:', mint.toString())
      return { accounts: [] }
    }

    // For our specific transfer hook, we need:
    // 1. Extra account meta list
    // 2. User KYC account
    // 3. Destination owner KYC account (for pool authority)
    // 4. Hook program ID

    const accounts = [
      {
        pubkey: extraAccountMetaList,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: getUserKycAddress(owner),
        isSigner: false,
        isWritable: false,
      },
    ]

    // Add destination owner KYC if different from source owner
    const destinationOwner = destination // Simplified - would get actual owner
    if (!destinationOwner.equals(owner)) {
      accounts.push({
        pubkey: getUserKycAddress(destinationOwner),
        isSigner: false,
        isWritable: false,
      })
    }

    // Add hook program ID as required account
    accounts.push({
      pubkey: hookInfo.hookProgramId,
      isSigner: false,
      isWritable: false,
    })

    return {
      accounts,
      hookProgramId: hookInfo.hookProgramId,
    }
  } catch (err) {
    console.error('Error resolving transfer hook accounts:', err)
    return { accounts: [] }
  }
}

/**
 * Calculate compute units needed for transfer hook execution
 */
export function getTransferHookComputeUnits(hasInputHook: boolean, hasOutputHook: boolean): number {
  let baseUnits = 200_000 // Base AMM computation

  if (hasInputHook) baseUnits += 100_000 // Input token hook
  if (hasOutputHook) baseUnits += 100_000 // Output token hook
  if (hasInputHook && hasOutputHook) baseUnits += 50_000 // Additional for dual hooks

  return Math.min(baseUnits, 1_400_000) // Solana limit
}

/**
 * Validate if a swap can proceed based on KYC requirements
 */
export async function validateSwapCompliance(
  connection: Connection,
  user: PublicKey,
  inputMint: PublicKey,
  outputMint: PublicKey,
  amount: number,
): Promise<{
  canSwap: boolean
  reason?: string
  requiredKycLevel?: number
}> {
  try {
    // Check user KYC status
    const userKyc = await getKycStatus(connection, user)

    if (!userKyc.exists) {
      return {
        canSwap: false,
        reason: 'KYC required. Please complete KYC verification.',
        requiredKycLevel: 1,
      }
    }

    // Check if tokens have transfer hooks (RWA compliance required)
    const inputHookInfo = await hasTransferHook(connection, inputMint)
    const outputHookInfo = await hasTransferHook(connection, outputMint)

    if (inputHookInfo.hasHook || outputHookInfo.hasHook) {
      // RWA tokens require enhanced KYC (level 2+)
      if (!userKyc.level || userKyc.level < 2) {
        return {
          canSwap: false,
          reason: 'Enhanced KYC required for RWA token trading.',
          requiredKycLevel: 2,
        }
      }
    }

    // Additional compliance checks could go here:
    // - Trading hours validation
    // - Geographic restrictions
    // - Amount limits based on KYC level
    // - Accredited investor requirements

    return { canSwap: true }
  } catch (err) {
    console.error('Error validating swap compliance:', err)
    return {
      canSwap: false,
      reason: 'Unable to validate compliance. Please try again.',
    }
  }
}

/**
 * Get display information for transfer hook status
 */
export function getTransferHookDisplayInfo(hasHook: boolean, kycLevel?: number) {
  if (!hasHook) {
    return {
      label: 'Standard Token',
      color: 'gray',
      description: 'No special compliance requirements',
    }
  }

  const requiredLevel = 2 // RWA tokens require Enhanced KYC
  const hasRequiredKyc = kycLevel && kycLevel >= requiredLevel

  return {
    label: 'RWA Token',
    color: hasRequiredKyc ? 'green' : 'yellow',
    description: hasRequiredKyc
      ? 'Compliance validated - trading enabled'
      : `Enhanced KYC (Level ${requiredLevel}) required for trading`,
  }
}
