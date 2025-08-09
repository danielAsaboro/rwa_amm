import { AnchorProvider, Program, Idl, web3 } from '@coral-xyz/anchor'
import { Connection, PublicKey, SystemProgram, Transaction, Keypair } from '@solana/web3.js'
import idl from './rwa_amm.json'
import {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializeAccountInstruction,
  getMintLen,
  ExtensionType,
  createInitializeTransferHookInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeTransferFeeConfigInstruction,
  createInitializeInterestBearingMintInstruction,
  createEnableRequiredMemoTransfersInstruction,
  createInitializeDefaultAccountStateInstruction,
  AccountState,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  createThawAccountInstruction,
  LENGTH_SIZE,
  TYPE_SIZE,
} from '@solana/spl-token'
import {
  createInitializeInstruction,
  createUpdateFieldInstruction,
  pack,
  TokenMetadata,
} from '@solana/spl-token-metadata'

// RWA Configuration types that match the test file structure
export interface RWAConfig {
  assetClass: string
  jurisdiction: string
  allowedCountries: string[]
  restrictedStates: string[]
  minimumKycLevel: number
  tradingHours: {
    mondayStart: number
    mondayEnd: number
    tuesdayStart: number
    tuesdayEnd: number
    wednesdayStart: number
    wednesdayEnd: number
    thursdayStart: number
    thursdayEnd: number
    fridayStart: number
    fridayEnd: number
    saturdayStart: number
    saturdayEnd: number
    sundayStart: number
    sundayEnd: number
  }
  tradingLimits: {
    minTradeAmount: string
    maxTradeAmount: string
    kycBasicDailyLimit: string
    kycEnhancedDailyLimit: string
    kycInstitutionalDailyLimit: string
  }
  feeStructure: {
    tradingFeeBps: number
    protocolFeeBps: number
    kycBasicDiscountBps: number
    kycEnhancedDiscountBps: number
    kycInstitutionalDiscountBps: number
  }
  timezoneOffset: number
  whitelistRequired: boolean
  requiresAccreditedInvestor: boolean
}

// Program IDs
export const RWA_AMM_PROGRAM_ID = new PublicKey('cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG')

// Use generic Idl during app build to avoid requiring generated Anchor types
export type RwaAmmProgram = Idl

export class RwaAmmSdk {
  constructor(
    private connection: Connection,
    private provider: AnchorProvider,
    private program: Program<RwaAmmProgram>,
  ) {}

  static async initialize(connection: Connection, provider: AnchorProvider): Promise<RwaAmmSdk> {
    // Use the imported IDL
    const program = new Program(idl as Idl, provider)
    return new RwaAmmSdk(connection, provider, program as any as Program<RwaAmmProgram>)
  }

  // Create Token-2022 mint with transfer hook - Split into multiple transactions
  // Note: Cannot be made atomic across multiple transactions due to Token-2022 extension requirements
  async createRwaMint(params: CreateRwaMintParams): Promise<string> {
    const mint = Keypair.generate()
    let createdMintAccount = false
    let payerTokenAccount: PublicKey | null = null

    try {
      const payer = this.provider.wallet

      console.log('Creating RWA mint with address:', mint.publicKey.toString())
      console.log('Parameters:', params)

      // Determine which extensions we'll use
      const extensions = [] as ExtensionType[]

      // Always include metadata pointer if metadata is enabled
      if (params.metadata) {
        extensions.push(ExtensionType.MetadataPointer)
        // Match the test structure by including GroupMemberPointer as well
        extensions.push(ExtensionType.GroupMemberPointer)
      }

      // Transfer Hook extension
      if (params.transferHook?.enabled) {
        extensions.push(ExtensionType.TransferHook)
      }

      // Transfer Fee extension
      if (params.transferFee?.enabled) {
        extensions.push(ExtensionType.TransferFeeConfig)
      }

      // Interest Bearing extension
      if (params.interestBearing?.enabled) {
        extensions.push(ExtensionType.InterestBearingConfig)
      }

      // Default Account State extension (for compliance)
      if (params.transferHook?.enabled) {
        extensions.push(ExtensionType.DefaultAccountState)
      }

      // Calculate space needed for mint account
      const mintLen = getMintLen(extensions)
      console.log(`Mint account size: ${mintLen} bytes`)

      // Build planned RWA additional metadata upfront (to size rent like the test)
      let plannedAdditionalMetadata: [string, string][] = []
      // Calculate metadata length if we're storing it in the mint account
      let metadataLen = 0
      if (params.metadata) {
        if (params.metadata.rwaConfig) {
          const rwaConfig = params.metadata.rwaConfig
          plannedAdditionalMetadata = [
            ['asset_class', rwaConfig.assetClass],
            ['jurisdiction', rwaConfig.jurisdiction],
            ['allowed_countries', rwaConfig.allowedCountries.join(',')],
            ['restricted_countries', rwaConfig.restrictedStates.join(',')],
            ['minimum_kyc_level', rwaConfig.minimumKycLevel.toString()],
            ['trading_hours', JSON.stringify(rwaConfig.tradingHours)],
            ['timezone_offset', rwaConfig.timezoneOffset.toString()],
            ['min_trade_amount', rwaConfig.tradingLimits.minTradeAmount],
            ['max_trade_amount', rwaConfig.tradingLimits.maxTradeAmount],
            ['kyc_basic_daily_limit', rwaConfig.tradingLimits.kycBasicDailyLimit],
            ['kyc_enhanced_daily_limit', rwaConfig.tradingLimits.kycEnhancedDailyLimit],
            ['kyc_institutional_daily_limit', rwaConfig.tradingLimits.kycInstitutionalDailyLimit],
            ['trading_fee_bps', rwaConfig.feeStructure.tradingFeeBps.toString()],
            ['protocol_fee_bps', rwaConfig.feeStructure.protocolFeeBps.toString()],
            ['kyc_basic_discount_bps', rwaConfig.feeStructure.kycBasicDiscountBps.toString()],
            ['kyc_enhanced_discount_bps', rwaConfig.feeStructure.kycEnhancedDiscountBps.toString()],
            ['kyc_institutional_discount_bps', rwaConfig.feeStructure.kycInstitutionalDiscountBps.toString()],
            ['whitelist_required', rwaConfig.whitelistRequired.toString()],
            ['requires_accredited_investor', rwaConfig.requiresAccreditedInvestor.toString()],
            ['is_self_referential', 'true'],
            ['metadata_type', 'rwa_trading_rules'],
          ]
        }
        const metadataForSizing: TokenMetadata = {
          mint: mint.publicKey,
          name: params.metadata.name,
          symbol: params.metadata.symbol,
          uri: params.metadata.uri || '',
          additionalMetadata: plannedAdditionalMetadata,
        }
        metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadataForSizing).length
      }

      // Get rent for mint account
      const mintLamports = await this.connection.getMinimumBalanceForRentExemption(mintLen + metadataLen)

      // Transaction 1: Create mint account and basic extensions (BEFORE mint initialization)
      console.log('Transaction 1: Create mint account + base extensions')
      {
        const createMintTx = new Transaction()

        // Create mint account
        const createMintAccountIx = SystemProgram.createAccount({
          fromPubkey: payer.publicKey,
          newAccountPubkey: mint.publicKey,
          space: mintLen,
          lamports: mintLamports,
          programId: TOKEN_2022_PROGRAM_ID,
        })
        createMintTx.add(createMintAccountIx)

        // Initialize metadata pointer extension (MUST come before mint initialization)
        if (params.metadata) {
          const initializeMetadataPointerIx = createInitializeMetadataPointerInstruction(
            mint.publicKey,
            payer.publicKey,
            mint.publicKey, // self-referential
            TOKEN_2022_PROGRAM_ID,
          )
          createMintTx.add(initializeMetadataPointerIx)
        }

        // Initialize transfer hook extension
        if (params.transferHook?.enabled && params.transferHook.programId) {
          const initializeTransferHookIx = createInitializeTransferHookInstruction(
            mint.publicKey,
            payer.publicKey,
            params.transferHook.programId,
            TOKEN_2022_PROGRAM_ID,
          )
          createMintTx.add(initializeTransferHookIx)
        }

        // Initialize group member pointer (self-referential) to mirror tests
        if (extensions.includes(ExtensionType.GroupMemberPointer)) {
          const { createInitializeGroupMemberPointerInstruction } = await import('@solana/spl-token')
          createMintTx.add(
            createInitializeGroupMemberPointerInstruction(
              mint.publicKey,
              payer.publicKey,
              mint.publicKey,
              TOKEN_2022_PROGRAM_ID,
            ),
          )
        }

        createMintTx.feePayer = payer.publicKey
        createMintTx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash
        createMintTx.partialSign(mint)

        const signedTx = await payer.signTransaction(createMintTx)
        const tx1Signature = await this.connection.sendRawTransaction(signedTx.serialize())
        await this.connection.confirmTransaction(tx1Signature, 'confirmed')
        createdMintAccount = true
        console.log('✅ Tx1 done')
      }

      // Transaction 2: Additional extensions (still BEFORE mint initialization)
      console.log('Transaction 2: Configure additional extensions')
      {
        const extensionsTx = new Transaction()

        // Initialize interest bearing extension
        if (params.interestBearing?.enabled) {
          const initializeInterestBearingIx = createInitializeInterestBearingMintInstruction(
            mint.publicKey,
            params.interestBearing.rateAuthority,
            params.interestBearing.currentRate,
            TOKEN_2022_PROGRAM_ID,
          )
          extensionsTx.add(initializeInterestBearingIx)
        }

        // Initialize transfer fee extension
        if (params.transferFee?.enabled) {
          const initializeTransferFeeIx = createInitializeTransferFeeConfigInstruction(
            mint.publicKey,
            payer.publicKey,
            payer.publicKey,
            params.transferFee.transferFeeBasisPoints,
            BigInt(params.transferFee.maximumFee),
            TOKEN_2022_PROGRAM_ID,
          )
          extensionsTx.add(initializeTransferFeeIx)
        }

        // Initialize default account state (for compliance - accounts start frozen)
        if (params.transferHook?.enabled) {
          const initializeDefaultAccountStateIx = createInitializeDefaultAccountStateInstruction(
            mint.publicKey,
            AccountState.Frozen,
            TOKEN_2022_PROGRAM_ID,
          )
          extensionsTx.add(initializeDefaultAccountStateIx)
        }

        if (extensionsTx.instructions.length > 0) {
          extensionsTx.feePayer = payer.publicKey
          extensionsTx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash
          const signedExtTx = await payer.signTransaction(extensionsTx)
          const tx2Sig = await this.connection.sendRawTransaction(signedExtTx.serialize())
          await this.connection.confirmTransaction(tx2Sig, 'confirmed')
        }
        console.log('✅ Tx2 done')
      }

      // Transaction 3: Initialize mint and base metadata (no large updates yet)
      console.log('Transaction 3: Initialize mint + base metadata')
      const initializeTx = new Transaction()

      // Initialize mint
      const initializeMintIx = createInitializeMintInstruction(
        mint.publicKey,
        6, // decimals
        params.mintAuthority || payer.publicKey, // mint authority
        params.freezeAuthority || payer.publicKey, // freeze authority (needed for default account state)
        TOKEN_2022_PROGRAM_ID,
      )
      initializeTx.add(initializeMintIx)

      // Initialize metadata (if enabled)
      if (params.metadata) {
        // Create additional metadata fields for RWA configuration
        const additionalMetadata: [string, string][] = []

        if (params.metadata.rwaConfig) {
          const rwaConfig = params.metadata.rwaConfig

          // Asset Information
          additionalMetadata.push(
            ['asset_class', rwaConfig.assetClass],
            ['jurisdiction', rwaConfig.jurisdiction],
            ['allowed_countries', rwaConfig.allowedCountries.join(',')],
            ['restricted_countries', rwaConfig.restrictedStates.join(',')],
            ['minimum_kyc_level', rwaConfig.minimumKycLevel.toString()],
            ['timezone_offset', rwaConfig.timezoneOffset.toString()],
            ['min_trade_amount', rwaConfig.tradingLimits.minTradeAmount],
            ['max_trade_amount', rwaConfig.tradingLimits.maxTradeAmount],
            ['kyc_basic_daily_limit', rwaConfig.tradingLimits.kycBasicDailyLimit],
            ['kyc_enhanced_daily_limit', rwaConfig.tradingLimits.kycEnhancedDailyLimit],
            ['kyc_institutional_daily_limit', rwaConfig.tradingLimits.kycInstitutionalDailyLimit],
            ['trading_fee_bps', rwaConfig.feeStructure.tradingFeeBps.toString()],
            ['protocol_fee_bps', rwaConfig.feeStructure.protocolFeeBps.toString()],
            ['kyc_basic_discount_bps', rwaConfig.feeStructure.kycBasicDiscountBps.toString()],
            ['kyc_enhanced_discount_bps', rwaConfig.feeStructure.kycEnhancedDiscountBps.toString()],
            ['kyc_institutional_discount_bps', rwaConfig.feeStructure.kycInstitutionalDiscountBps.toString()],
            ['whitelist_required', rwaConfig.whitelistRequired.toString()],
            ['requires_accredited_investor', rwaConfig.requiresAccreditedInvestor.toString()],
            ['trading_hours', JSON.stringify(rwaConfig.tradingHours)],
            ['is_self_referential', 'true'],
            ['metadata_type', 'rwa_trading_rules'],
          )

          console.log(`Adding ${additionalMetadata.length} RWA metadata fields to mint`)
        }

        const initializeMetadataIx = createInitializeInstruction({
          programId: TOKEN_2022_PROGRAM_ID,
          mint: mint.publicKey,
          metadata: mint.publicKey, // SELF-REFERENTIAL!
          name: params.metadata.name,
          symbol: params.metadata.symbol,
          uri: params.metadata.uri || '',
          mintAuthority: payer.publicKey,
          updateAuthority: payer.publicKey,
        })
        initializeTx.add(initializeMetadataIx)

        // After base metadata init, push field updates in separate follow-up txs
        if (additionalMetadata.length > 0) {
          console.log(`Planning ${additionalMetadata.length} RWA metadata updates`)
          // We will send these after confirming initializeTx
          // Store temporarily on the instance for sequential sends below
          ;(initializeTx as any)._additionalMetadata = additionalMetadata
        }
      }

      initializeTx.feePayer = payer.publicKey
      initializeTx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash

      const signedInitializeTx = await payer.signTransaction(initializeTx)
      const tx3Signature = await this.connection.sendRawTransaction(signedInitializeTx.serialize())
      await this.connection.confirmTransaction(tx3Signature, 'confirmed')

      console.log('✅ Tx3 done: Mint + base metadata initialized')

      console.log('Mint created successfully:', {
        mintAddress: mint.publicKey.toString(),
        signature: tx3Signature,
        extensions: extensions.map((ext) => ExtensionType[ext]),
      })

      // Transaction 4+: Add metadata fields in small batches to avoid index/size issues
      if ((initializeTx as any)._additionalMetadata) {
        const allFields: [string, string][] = (initializeTx as any)._additionalMetadata
        const batchSize = 6
        for (let i = 0; i < allFields.length; i += batchSize) {
          const batch = allFields.slice(i, i + batchSize)
          const metaTx = new Transaction()
          for (const [key, value] of batch) {
            metaTx.add(
              createUpdateFieldInstruction({
                metadata: mint.publicKey,
                updateAuthority: payer.publicKey,
                programId: TOKEN_2022_PROGRAM_ID,
                field: key,
                value,
              }),
            )
          }
          metaTx.feePayer = payer.publicKey
          metaTx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash
          const signedMetaTx = await payer.signTransaction(metaTx)
          const metaSig = await this.connection.sendRawTransaction(signedMetaTx.serialize())
          await this.connection.confirmTransaction(metaSig, 'confirmed')
        }
        console.log('✅ Metadata fields updated in batches')
      }

      // Final step: Create associated token account for the payer and mint initial supply if needed
      if (params.supply > 0) {
        console.log('Final step: Minting initial supply...')

        payerTokenAccount = getAssociatedTokenAddressSync(mint.publicKey, payer.publicKey, false, TOKEN_2022_PROGRAM_ID)

        const createATAIx = createAssociatedTokenAccountIdempotentInstruction(
          payer.publicKey,
          payerTokenAccount,
          payer.publicKey,
          mint.publicKey,
          TOKEN_2022_PROGRAM_ID,
        )

        // If default account state is frozen, we need to thaw the account first
        let thawIx
        if (params.transferHook?.enabled) {
          thawIx = createThawAccountInstruction(
            payerTokenAccount,
            mint.publicKey,
            payer.publicKey, // freeze authority
            [],
            TOKEN_2022_PROGRAM_ID,
          )
        }

        const mintToIx = createMintToInstruction(
          mint.publicKey,
          payerTokenAccount,
          payer.publicKey,
          params.supply * Math.pow(10, 6), // Convert to smallest units (6 decimals)
          [],
          TOKEN_2022_PROGRAM_ID,
        )

        const mintTransaction = new Transaction().add(createATAIx)
        if (thawIx) mintTransaction.add(thawIx)
        mintTransaction.add(mintToIx)

        mintTransaction.feePayer = payer.publicKey
        mintTransaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash

        const signedMintTx = await payer.signTransaction(mintTransaction)
        const mintSignature = await this.connection.sendRawTransaction(signedMintTx.serialize())
        await this.connection.confirmTransaction(mintSignature, 'confirmed')

        console.log(`✅ Minted ${params.supply} tokens to ${payerTokenAccount.toString()}`)
      }

      return mint.publicKey.toString()
    } catch (error) {
      console.error('Error creating RWA mint:', error)

      // Attempt cleanup if we got far enough to create accounts
      try {
        console.log('Attempting cleanup of partially created accounts...')

        if (payerTokenAccount && createdMintAccount) {
          // Try to close the token account if it was created
          const { createCloseAccountInstruction } = await import('@solana/spl-token')
          const closeAccountIx = createCloseAccountInstruction(
            payerTokenAccount,
            this.provider.wallet.publicKey, // destination for remaining lamports
            this.provider.wallet.publicKey, // owner
            [],
            TOKEN_2022_PROGRAM_ID,
          )

          const closeTx = new Transaction().add(closeAccountIx)
          closeTx.feePayer = this.provider.wallet.publicKey
          closeTx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash

          const signedCloseTx = await this.provider.wallet.signTransaction(closeTx)
          await this.connection.sendRawTransaction(signedCloseTx.serialize())
          console.log('✅ Token account closed during cleanup')
        }

        // Note: Cannot close mint accounts in Solana - they remain permanently
        // But this is okay as they're just empty accounts with rent
      } catch (cleanupError) {
        console.warn('Cleanup failed (this is usually okay):', (cleanupError as Error)?.message || cleanupError)
      }

      // Provide a more user-friendly error message
      const errorMessage = (error as Error)?.message || String(error)
      if (errorMessage.includes('Transaction simulation failed')) {
        throw new Error(
          'Transaction failed during simulation. This might be due to insufficient SOL balance, invalid parameters, or network issues. Please check your wallet balance and try again.',
        )
      } else if (errorMessage.includes('Blockhash not found')) {
        throw new Error('Network connectivity issue. Please try again in a moment.')
      } else if (errorMessage.includes('account already in use')) {
        throw new Error('Mint creation conflict. Please try again to generate a new mint address.')
      } else {
        throw new Error(`Failed to create RWA mint: ${errorMessage}`)
      }
    }
  }

  // Create liquidity pool
  async createPool(params: CreatePoolParams): Promise<string> {
    try {
      // Creating AMM pool

      // This is where we would:
      // 1. Create pool account
      // 2. Initialize pool state
      // 3. Set up token vaults
      // 4. Configure fees and parameters

      return 'mock-pool-address'
    } catch (error) {
      console.error('Error creating pool:', error)
      throw error
    }
  }

  // Add liquidity to pool
  async addLiquidity(params: AddLiquidityParams): Promise<string> {
    try {
      // Adding liquidity to pool

      // This is where we would:
      // 1. Transfer tokens to pool vaults
      // 2. Mint LP tokens
      // 3. Update pool state

      return 'mock-transaction-signature'
    } catch (error) {
      console.error('Error adding liquidity:', error)
      throw error
    }
  }

  // Swap tokens
  async swap(params: SwapParams): Promise<string> {
    try {
      // Executing token swap

      // This is where we would:
      // 1. Calculate swap amounts
      // 2. Execute token transfer through transfer hook
      // 3. Update pool state
      // 4. Handle compliance validation

      return 'mock-transaction-signature'
    } catch (error) {
      console.error('Error swapping:', error)
      throw error
    }
  }

  // Create user KYC account
  async createUserKyc(params: CreateUserKycParams): Promise<string> {
    try {
      // Creating user KYC record

      // This is where we would call the create_user_kyc instruction

      return 'mock-kyc-account-address'
    } catch (error) {
      console.error('Error creating user KYC:', error)
      throw error
    }
  }

  // Update user KYC
  async updateUserKyc(params: UpdateUserKycParams): Promise<string> {
    try {
      // Updating user KYC record

      // This is where we would call the update_user_kyc instruction

      return 'mock-transaction-signature'
    } catch (error) {
      console.error('Error updating user KYC:', error)
      throw error
    }
  }

  // Create whitelist
  async createWhitelist(params: CreateWhitelistParams): Promise<string> {
    try {
      // Creating token whitelist

      // This is where we would call the create_whitelist instruction

      return 'mock-whitelist-address'
    } catch (error) {
      console.error('Error creating whitelist:', error)
      throw error
    }
  }

  // Initialize extra account meta list for transfer hook
  async initializeExtraAccountMetaList(mintAddress: PublicKey): Promise<string> {
    try {
      // Initializing extra account meta list for transfer hook

      // This is where we would call the initialize_extra_account_meta_list instruction

      return 'mock-transaction-signature'
    } catch (error) {
      console.error('Error initializing extra account meta list:', error)
      throw error
    }
  }

  // Helper functions
  getUserKycAddress(userPublicKey: PublicKey): PublicKey {
    const [address] = PublicKey.findProgramAddressSync(
      [Buffer.from('user-kyc'), userPublicKey.toBuffer()],
      this.program.programId,
    )
    return address
  }

  getWhitelistAddress(mintPublicKey: PublicKey): PublicKey {
    const [address] = PublicKey.findProgramAddressSync(
      [Buffer.from('whitelist'), mintPublicKey.toBuffer()],
      this.program.programId,
    )
    return address
  }

  getExtraAccountMetaListAddress(mintPublicKey: PublicKey): PublicKey {
    const [address] = PublicKey.findProgramAddressSync(
      [Buffer.from('extra-account-metas'), mintPublicKey.toBuffer()],
      this.program.programId,
    )
    return address
  }
}

// Type definitions for parameters
export interface CreateRwaMintParams {
  supply: number
  mintAuthority?: PublicKey
  freezeAuthority?: PublicKey
  transferFee?: {
    enabled: boolean
    transferFeeBasisPoints: number
    maximumFee: number
    feeAuthority: PublicKey
  }
  interestBearing?: {
    enabled: boolean
    rateAuthority: PublicKey
    currentRate: number // Rate in basis points (e.g., 500 = 5%)
  }
  metadata?: {
    name: string
    symbol: string
    description: string
    uri?: string
    // RWA-specific onchain metadata that will be stored in the mint's metadata extension
    rwaConfig?: RWAConfig
  }
  transferHook?: {
    enabled: boolean
    programId: PublicKey
    authority: PublicKey
  }
}

export interface CreatePoolParams {
  mintA: PublicKey
  mintB: PublicKey
  fee: number
  initialPrice: number
}

export interface AddLiquidityParams {
  poolAddress: PublicKey
  amountA: number
  amountB: number
  minAmountA: number
  minAmountB: number
}

export interface SwapParams {
  poolAddress: PublicKey
  inputMint: PublicKey
  outputMint: PublicKey
  inputAmount: number
  minOutputAmount: number
}

export interface CreateUserKycParams {
  userPublicKey: PublicKey
  kycLevel: number
  riskScore: number
}

export interface UpdateUserKycParams {
  userPublicKey: PublicKey
  newKycLevel?: number
  newRiskScore?: number
  newFlags?: number
}

export interface CreateWhitelistParams {
  mintPublicKey: PublicKey
  autoApprovalThreshold: number
}
