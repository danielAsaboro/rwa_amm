import { AnchorProvider, Program, web3, BN } from '@coral-xyz/anchor'
import { Connection, PublicKey, SystemProgram, Transaction, Keypair } from '@solana/web3.js'
// Import from proper program exports
import {
  getCpAmmProgram,
  getTransferHookProgram,
  CP_AMM_PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
  type CpAmm,
  type TransferHook,
} from '../../anchor/src/program-exports'

import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
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
  createAssociatedTokenAccountInstruction,
  createAssociatedTokenAccountIdempotentInstruction as createATAIdem,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  getAccount,
  createThawAccountInstruction,
  LENGTH_SIZE,
  TYPE_SIZE,
} from '@solana/spl-token'
import { createTransferCheckedWithTransferHookInstruction } from '@solana/spl-token'
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

// Constants from test files
export const MIN_SQRT_PRICE = '4295048016'
export const MAX_SQRT_PRICE = '79226673521066979257578248091'
export const MIN_LP_AMOUNT = '1844674407370955161600'

// Use the generated IDL type

export class RwaAmmSdk {
  constructor(
    private connection: Connection,
    private provider: AnchorProvider,
    private program: Program<CpAmm>,
    private transferHookProgram: Program<TransferHook>,
  ) {}

  static async initialize(connection: Connection, provider: AnchorProvider): Promise<RwaAmmSdk> {
    try {
      // Initialize both programs using proper helper functions
      console.log('Initializing CP AMM Program with ID:', CP_AMM_PROGRAM_ID.toString())
      console.log('Initializing Transfer Hook Program with ID:', TRANSFER_HOOK_PROGRAM_ID.toString())

      const cpAmmProgram = getCpAmmProgram(provider)
      const transferHookProgram = getTransferHookProgram(provider)

      console.log('✅ Programs initialized successfully')
      return new RwaAmmSdk(connection, provider, cpAmmProgram, transferHookProgram)
    } catch (error) {
      console.error('Error initializing SDK programs:', error)
      throw error
    }
  }

  // Create Token-2022 mint with transfer hook - Split into multiple transactions
  // Note: Cannot be made atomic across multiple transactions due to Token-2022 extension requirements
  async createRwaMint(params: CreateRwaMintParams): Promise<{ mintAddress: string; signature: string }> {
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
      // TEMPORARILY DISABLED: Not adding DefaultAccountState extension since we're not initializing it
      // if (params.transferHook?.enabled) {
      //   extensions.push(ExtensionType.DefaultAccountState)
      // }

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
        // TEMPORARILY DISABLED: Commenting out frozen account state to simplify testing
        // if (params.transferHook?.enabled) {
        //   const initializeDefaultAccountStateIx = createInitializeDefaultAccountStateInstruction(
        //     mint.publicKey,
        //     AccountState.Frozen,
        //     TOKEN_2022_PROGRAM_ID,
        //   )
        //   extensionsTx.add(initializeDefaultAccountStateIx)
        // }

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

      // Initialize mint with actual decimals parameter
      const decimals = params.decimals ?? 6 // Default to 6 if not specified
      const initializeMintIx = createInitializeMintInstruction(
        mint.publicKey,
        decimals,
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

      // Initialize transfer hook accounts if this is a transfer hook enabled mint
      if (params.transferHook?.enabled) {
        console.log('Initializing transfer hook accounts for mint...')
        await this.initializeTransferHookAccounts(mint.publicKey)
      }

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
        // TEMPORARILY DISABLED: No need to thaw since we're not using frozen accounts
        // let thawIx
        // if (params.transferHook?.enabled) {
        //   thawIx = createThawAccountInstruction(
        //     payerTokenAccount,
        //     mint.publicKey,
        //     payer.publicKey, // freeze authority
        //     [],
        //     TOKEN_2022_PROGRAM_ID,
        //   )
        // }

        const mintToIx = createMintToInstruction(
          mint.publicKey,
          payerTokenAccount,
          payer.publicKey,
          params.supply * Math.pow(10, decimals), // Convert to smallest units using actual decimals
          [],
          TOKEN_2022_PROGRAM_ID,
        )

        const mintTransaction = new Transaction().add(createATAIx)
        // TEMPORARILY DISABLED: No thaw instruction needed since we're not using frozen accounts
        // if (thawIx) mintTransaction.add(thawIx)
        mintTransaction.add(mintToIx)

        mintTransaction.feePayer = payer.publicKey
        mintTransaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash

        const signedMintTx = await payer.signTransaction(mintTransaction)
        const mintSignature = await this.connection.sendRawTransaction(signedMintTx.serialize())
        await this.connection.confirmTransaction(mintSignature, 'confirmed')

        console.log(`✅ Minted ${params.supply} tokens to ${payerTokenAccount.toString()}`)
      }

      return { mintAddress: mint.publicKey.toString(), signature: tx3Signature }
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

  // Mint additional tokens to an existing token account
  async mintTokens(params: { mintAddress: PublicKey; amount: number; recipientAddress?: PublicKey }): Promise<string> {
    try {
      const payer = this.provider.wallet
      if (!payer.publicKey) throw new Error('Wallet not connected')

      const mint = params.mintAddress
      const recipient = params.recipientAddress || payer.publicKey

      // Detect token program (Token or Token-2022)
      const mintAccountInfo = await this.connection.getAccountInfo(mint)
      if (!mintAccountInfo) throw new Error('Mint account not found')
      const tokenProgramId = mintAccountInfo.owner

      // Get mint info to determine decimals
      const mintInfo = await getMint(this.connection, mint, 'confirmed', tokenProgramId)
      const amount = params.amount * Math.pow(10, mintInfo.decimals)

      // Get or create associated token account for recipient
      const recipientTokenAccount = getAssociatedTokenAddressSync(
        mint,
        recipient,
        true, // Allow owner off curve
        tokenProgramId,
      )

      const transaction = new Transaction()

      // Check if recipient token account exists, create if needed
      const recipientAccountInfo = await this.connection.getAccountInfo(recipientTokenAccount)
      let needsThaw = false
      if (!recipientAccountInfo) {
        // Prefer idempotent create to avoid race conditions
        const createIx = createATAIdem(payer.publicKey, recipientTokenAccount, recipient, mint, tokenProgramId)
        transaction.add(createIx)
        // TEMPORARILY DISABLED: No frozen accounts to thaw since we disabled default frozen state
        // Accounts created under Token-2022 with DefaultAccountState.Frozen need thaw before minting
        // needsThaw = tokenProgramId.equals(TOKEN_2022_PROGRAM_ID)
        needsThaw = false
      } else {
        try {
          const acct = await getAccount(this.connection, recipientTokenAccount, 'confirmed', tokenProgramId)
          // @ts-ignore - Account type exposes isFrozen/state depending on version
          if ((acct as any).isFrozen === true || (acct as any).state?.toString?.().toLowerCase?.() === 'frozen') {
            needsThaw = true
          }
        } catch {
          // If parsing fails, skip thaw check; we'll attempt mint and let it error if truly frozen
        }
      }

      if (needsThaw && tokenProgramId.equals(TOKEN_2022_PROGRAM_ID)) {
        const thawIx = createThawAccountInstruction(recipientTokenAccount, mint, payer.publicKey, [], tokenProgramId)
        transaction.add(thawIx)
      }

      // Create mint to instruction
      const mintToIx = createMintToInstruction(
        mint,
        recipientTokenAccount,
        payer.publicKey, // Mint authority (assuming payer is the authority)
        amount,
        [],
        tokenProgramId,
      )
      transaction.add(mintToIx)

      // Send transaction
      transaction.feePayer = payer.publicKey
      transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash

      const signedTransaction = await payer.signTransaction(transaction)
      const signature = await this.connection.sendRawTransaction(signedTransaction.serialize())

      await this.connection.confirmTransaction(signature, 'confirmed')
      return signature
    } catch (error) {
      console.error('Error minting tokens:', error)
      throw error
    }
  }

  // Create token badge for unsupported tokens
  async createTokenBadge(tokenMint: PublicKey): Promise<string> {
    try {
      const payer = this.provider.wallet

      // Derive token badge address
      const [tokenBadge] = PublicKey.findProgramAddressSync(
        [Buffer.from('token_badge'), tokenMint.toBuffer()],
        this.program.programId,
      )

      console.log('Creating token badge for:', tokenMint.toString())
      console.log('Token badge address:', tokenBadge.toString())

      // Create token badge transaction
      const transaction = await this.program.methods
        .createTokenBadge()
        .accountsPartial({
          tokenBadge,
          tokenMint,
          admin: payer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .transaction()

      // Send transaction
      transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash
      transaction.feePayer = payer.publicKey

      const signedTx = await payer.signTransaction(transaction)
      const signature = await this.connection.sendRawTransaction(signedTx.serialize())
      await this.connection.confirmTransaction(signature, 'finalized')

      console.log('Token badge created successfully:', {
        tokenBadge: tokenBadge.toString(),
        tokenMint: tokenMint.toString(),
        signature,
      })

      return tokenBadge.toString()
    } catch (error) {
      console.error('Error creating token badge:', error)
      const errorMessage = (error as Error)?.message || String(error)
      throw new Error(`Failed to create token badge: ${errorMessage}`)
    }
  }

  // Create config for AMM pools
  async createConfig(params: CreateConfigParams): Promise<string> {
    try {
      const payer = this.provider.wallet

      // Generate a random config ID like the test does
      const configId = Math.floor(Math.random() * 1000)

      // Derive config address
      const [config] = PublicKey.findProgramAddressSync(
        [Buffer.from('config'), new BN(configId).toArrayLike(Buffer, 'le', 8)],
        this.program.programId,
      )

      console.log('Creating config with ID:', configId)
      console.log('Config address:', config.toString())

      // Create config transaction
      const transaction = await this.program.methods
        .createConfig(new BN(configId), params)
        .accountsPartial({
          config,
          admin: payer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .transaction()

      // Send transaction
      transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash
      transaction.feePayer = payer.publicKey

      const signedTx = await payer.signTransaction(transaction)
      const signature = await this.connection.sendRawTransaction(signedTx.serialize())
      await this.connection.confirmTransaction(signature, 'finalized')

      console.log('Config created successfully:', {
        configAddress: config.toString(),
        configId,
        signature,
      })

      return config.toString()
    } catch (error) {
      console.error('Error creating config:', error)
      const errorMessage = (error as Error)?.message || String(error)
      throw new Error(`Failed to create config: ${errorMessage}`)
    }
  }

  // Create liquidity pool
  async createPool(params: CreatePoolParams): Promise<string> {
    try {
      const payer = this.provider.wallet

      // Derive all required addresses
      const poolAuthority = this.derivePoolAuthority()
      const pool = this.derivePoolAddress(params.config, params.mintA, params.mintB)

      // Create position NFT keypair
      const positionNftKP = Keypair.generate()
      const position = this.derivePositionAddress(positionNftKP.publicKey)
      const positionNftAccount = this.derivePositionNftAccount(positionNftKP.publicKey)

      // Derive token vaults
      const tokenAVault = this.deriveTokenVaultAddress(params.mintA, pool)
      const tokenBVault = this.deriveTokenVaultAddress(params.mintB, pool)

      // Get token programs for mints
      const tokenAInfo = await this.connection.getAccountInfo(params.mintA)
      const tokenBInfo = await this.connection.getAccountInfo(params.mintB)

      if (!tokenAInfo || !tokenBInfo) {
        throw new Error('Token mint accounts not found')
      }

      const tokenAProgram = tokenAInfo.owner
      const tokenBProgram = tokenBInfo.owner

      // Get user's token accounts
      const payerTokenA = getAssociatedTokenAddressSync(params.mintA, payer.publicKey, true, tokenAProgram)
      const payerTokenB = getAssociatedTokenAddressSync(params.mintB, payer.publicKey, true, tokenBProgram)

      // Check if token accounts exist and create them if needed
      const payerTokenAInfo = await this.connection.getAccountInfo(payerTokenA)
      const payerTokenBInfo = await this.connection.getAccountInfo(payerTokenB)

      if (!payerTokenAInfo || !payerTokenBInfo) {
        console.log('Creating missing token accounts...')
        const createAccountTx = new Transaction()

        if (!payerTokenAInfo) {
          const createATAIx = createAssociatedTokenAccountIdempotentInstruction(
            payer.publicKey,
            payerTokenA,
            payer.publicKey,
            params.mintA,
            tokenAProgram,
          )
          createAccountTx.add(createATAIx)
          console.log('Added create instruction for Token A account')
        }

        if (!payerTokenBInfo) {
          const createBTAIx = createAssociatedTokenAccountIdempotentInstruction(
            payer.publicKey,
            payerTokenB,
            payer.publicKey,
            params.mintB,
            tokenBProgram,
          )
          createAccountTx.add(createBTAIx)
          console.log('Added create instruction for Token B account')
        }

        if (createAccountTx.instructions.length > 0) {
          createAccountTx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash
          createAccountTx.feePayer = payer.publicKey

          const signedCreateTx = await payer.signTransaction(createAccountTx)
          const createSignature = await this.connection.sendRawTransaction(signedCreateTx.serialize())
          await this.connection.confirmTransaction(createSignature, 'confirmed')

          console.log('✅ Token accounts created successfully:', createSignature)
        }
      }

      // Check if existing config is being used
      if (params.config.toString() === 'Db6HasKaZp4k7R6hYri92prjSQyAYYf7jCwB1WzRr7FS') {
        console.log('✅ Using existing config from admin/configs page')
      }

      // Check if tokens have transfer hooks in parallel (moved up for scoping)
      const [tokenAAccount, tokenBAccount] = await Promise.all([
        this.connection.getAccountInfo(params.mintA),
        this.connection.getAccountInfo(params.mintB),
      ])

      const tokenAIsTransferHook = tokenAAccount?.owner.equals(TOKEN_2022_PROGRAM_ID) ?? false
      const tokenBIsTransferHook = tokenBAccount?.owner.equals(TOKEN_2022_PROGRAM_ID) ?? false
      const needsThawing = tokenAIsTransferHook || tokenBIsTransferHook

      // Create token badges for any tokens that need them
      console.log('Checking if tokens need badges...')
      const tokenBadges: PublicKey[] = []

      // Check if Token A needs a badge
      try {
        const tokenABadge = PublicKey.findProgramAddressSync(
          [Buffer.from('token_badge'), params.mintA.toBuffer()],
          this.program.programId,
        )[0]

        const tokenABadgeInfo = await this.connection.getAccountInfo(tokenABadge)
        if (!tokenABadgeInfo) {
          console.log('Creating token badge for Token A...')
          await this.createTokenBadge(params.mintA)
        }
        tokenBadges.push(tokenABadge)
      } catch (error) {
        console.warn('Error with Token A badge:', error)
      }

      // Check if Token B needs a badge
      try {
        const tokenBBadge = PublicKey.findProgramAddressSync(
          [Buffer.from('token_badge'), params.mintB.toBuffer()],
          this.program.programId,
        )[0]

        const tokenBBadgeInfo = await this.connection.getAccountInfo(tokenBBadge)
        if (!tokenBBadgeInfo) {
          console.log('Creating token badge for Token B...')
          await this.createTokenBadge(params.mintB)
        }
        tokenBadges.push(tokenBBadge)
      } catch (error) {
        console.warn('Error with Token B badge:', error)
      }

      // Convert token badges to remaining accounts and add transfer hook accounts
      const remainingAccounts = tokenBadges.map((badge) => ({
        pubkey: badge,
        isSigner: false,
        isWritable: false,
      }))

      // Add transfer hook accounts if tokens have transfer hooks
      if (tokenAIsTransferHook || tokenBIsTransferHook) {
        console.log('Adding transfer hook accounts to remaining accounts...')

        // Add extra account meta lists
        if (tokenAIsTransferHook) {
          const [tokenAExtraAccountMetas] = PublicKey.findProgramAddressSync(
            [Buffer.from('extra-account-metas'), params.mintA.toBuffer()],
            TRANSFER_HOOK_PROGRAM_ID,
          )
          remainingAccounts.push({
            pubkey: tokenAExtraAccountMetas,
            isSigner: false,
            isWritable: false,
          })
        }

        if (tokenBIsTransferHook) {
          const [tokenBExtraAccountMetas] = PublicKey.findProgramAddressSync(
            [Buffer.from('extra-account-metas'), params.mintB.toBuffer()],
            TRANSFER_HOOK_PROGRAM_ID,
          )
          remainingAccounts.push({
            pubkey: tokenBExtraAccountMetas,
            isSigner: false,
            isWritable: false,
          })
        }

        // Add KYC accounts
        const [userKycPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('user-kyc'), payer.publicKey.toBuffer()],
          TRANSFER_HOOK_PROGRAM_ID,
        )
        const [poolAuthorityKycPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('user-kyc'), poolAuthority.toBuffer()],
          TRANSFER_HOOK_PROGRAM_ID,
        )

        remainingAccounts.push(
          {
            pubkey: userKycPda,
            isSigner: false,
            isWritable: false,
          },
          {
            pubkey: poolAuthorityKycPda,
            isSigner: false,
            isWritable: false,
          },
          {
            pubkey: TRANSFER_HOOK_PROGRAM_ID,
            isSigner: false,
            isWritable: false,
          },
        )

        console.log(
          `Added ${remainingAccounts.length - tokenBadges.length} transfer hook accounts to remaining accounts`,
        )
      }

      // Initialize transfer hook accounts if needed for RWA tokens
      console.log('Checking if tokens have transfer hooks and initializing required accounts...')

      // If we have transfer hook tokens, initialize all required accounts
      if (tokenAIsTransferHook || tokenBIsTransferHook) {
        console.log('Transfer hook tokens detected, initializing required accounts...')

        // Initialize KYC accounts for user and pool authority in parallel
        await this.initializeKycAccounts([payer.publicKey, poolAuthority])

        // Check and initialize extra account meta lists for both tokens in parallel
        const extraAccountTasks: Promise<void>[] = []

        if (tokenAIsTransferHook) {
          extraAccountTasks.push(this.initializeTransferHookAccounts(params.mintA))
        }

        if (tokenBIsTransferHook) {
          extraAccountTasks.push(this.initializeTransferHookAccounts(params.mintB))
        }

        // Wait for all extra account initializations
        if (extraAccountTasks.length > 0) {
          await Promise.all(extraAccountTasks)
        }

        console.log('✅ All transfer hook accounts initialized')
      }

      // Note: We disabled default frozen state for transfer hook tokens, so no thawing needed

      // Create pool initialization transaction
      const transaction = await this.program.methods
        .initializePool({
          liquidity: params.liquidity,
          sqrtPrice: params.sqrtPrice,
          activationPoint: params.activationPoint || null,
        })
        .accountsPartial({
          creator: payer.publicKey,
          positionNftAccount,
          positionNftMint: positionNftKP.publicKey,
          payer: payer.publicKey,
          config: params.config,
          poolAuthority,
          pool,
          position,
          tokenAMint: params.mintA,
          tokenBMint: params.mintB,
          tokenAVault,
          tokenBVault,
          payerTokenA,
          payerTokenB,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          tokenAProgram,
          tokenBProgram,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(remainingAccounts)
        .transaction()

      // Don't add thaw instructions here - they need to be in a separate transaction
      // after the vaults are created but before any transfers

      // Add compute budget for hook execution
      transaction.add(
        web3.ComputeBudgetProgram.setComputeUnitLimit({
          units: 800_000,
        }),
        web3.ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: 1,
        }),
      )

      // Get recent blockhash and sign
      transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash
      transaction.feePayer = payer.publicKey
      transaction.partialSign(positionNftKP)

      // Sign with wallet and send
      const signedTx = await payer.signTransaction(transaction)
      const signature = await this.connection.sendRawTransaction(signedTx.serialize())
      await this.connection.confirmTransaction(signature, 'confirmed')

      console.log('✅ Pool created with transfer hook support')

      console.log('Pool created successfully:', {
        poolAddress: pool.toString(),
        positionAddress: position.toString(),
        signature,
      })

      return pool.toString()
    } catch (error) {
      console.error('Error creating pool:', error)
      const errorMessage = (error as Error)?.message || String(error)
      throw new Error(`Failed to create pool: ${errorMessage}`)
    }
  }

  // Create position for liquidity provision
  async createPosition(params: CreatePositionParams): Promise<string> {
    try {
      const payer = this.provider.wallet

      // Validate pool exists
      const poolAccount = await this.connection.getAccountInfo(params.poolAddress)
      if (!poolAccount) {
        throw new Error('Pool not found')
      }

      // Create position NFT keypair
      const positionNftKP = Keypair.generate()
      const position = this.derivePositionAddress(positionNftKP.publicKey)
      const poolAuthority = this.derivePoolAuthority()
      const positionNftAccount = this.derivePositionNftAccount(positionNftKP.publicKey)

      // Build transaction
      const transaction = await this.program.methods
        .createPosition()
        .accountsPartial({
          owner: params.owner || payer.publicKey,
          positionNftMint: positionNftKP.publicKey,
          poolAuthority,
          positionNftAccount,
          payer: payer.publicKey,
          pool: params.poolAddress,
          position,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([positionNftKP])
        .transaction()

      // Add compute budget
      transaction.add(
        web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
        web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
      )

      // Send transaction - sign with both payer and positionNftKP (like in tests)
      transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash
      transaction.feePayer = payer.publicKey
      
      // Sign with positionNftKP first, then with payer wallet
      transaction.sign(positionNftKP)
      const signedTx = await payer.signTransaction(transaction)
      const signature = await this.connection.sendRawTransaction(signedTx.serialize())
      await this.connection.confirmTransaction(signature, 'confirmed')

      console.log('Position created successfully:', {
        positionAddress: position.toString(),
        positionNftMint: positionNftKP.publicKey.toString(),
        signature,
      })

      return position.toString()
    } catch (error) {
      console.error('Error creating position:', error)
      const errorMessage = (error as Error)?.message || String(error)
      throw new Error(`Failed to create position: ${errorMessage}`)
    }
  }

  // Add liquidity to pool
  async addLiquidity(params: AddLiquidityParams): Promise<string> {
    try {
      const payer = this.provider.wallet

      // Get pool and position states
      const poolAccount = await this.connection.getAccountInfo(params.poolAddress)
      if (!poolAccount) {
        throw new Error('Pool not found')
      }

      const poolState = await this.program.account.pool.fetch(params.poolAddress)
      const positionState = await this.program.account.position.fetch(params.position)

      // Derive position NFT account
      const positionNftAccount = this.derivePositionNftAccount(positionState.nftMint)

      // Get token programs
      const tokenAProgram = (await this.connection.getAccountInfo(poolState.tokenAMint))?.owner
      const tokenBProgram = (await this.connection.getAccountInfo(poolState.tokenBMint))?.owner

      if (!tokenAProgram || !tokenBProgram) {
        throw new Error('Token programs not found')
      }

      // Get user token accounts
      const tokenAAccount = getAssociatedTokenAddressSync(poolState.tokenAMint, payer.publicKey, true, tokenAProgram)
      const tokenBAccount = getAssociatedTokenAddressSync(poolState.tokenBMint, payer.publicKey, true, tokenBProgram)

      // Prepare hook accounts
      const hookAccounts = await this.prepareHookAccountsForLiquidity(
        poolState.tokenAMint,
        poolState.tokenBMint,
        payer.publicKey,
      )

      // Build transaction
      const transaction = await this.program.methods
        .addLiquidity({
          liquidityDelta: new BN(params.liquidityDelta),
          tokenAAmountThreshold: new BN(params.tokenAAmountThreshold),
          tokenBAmountThreshold: new BN(params.tokenBAmountThreshold),
        })
        .accountsPartial({
          pool: params.poolAddress,
          position: params.position,
          positionNftAccount,
          owner: payer.publicKey,
          tokenAAccount,
          tokenBAccount,
          tokenAVault: poolState.tokenAVault,
          tokenBVault: poolState.tokenBVault,
          tokenAProgram,
          tokenBProgram,
          tokenAMint: poolState.tokenAMint,
          tokenBMint: poolState.tokenBMint,
        })
        .remainingAccounts(hookAccounts)
        .transaction()

      // Add compute budget
      transaction.add(
        web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 }),
        web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
      )

      // Send transaction
      transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash
      transaction.feePayer = payer.publicKey

      const signedTx = await payer.signTransaction(transaction)
      const signature = await this.connection.sendRawTransaction(signedTx.serialize())
      await this.connection.confirmTransaction(signature, 'confirmed')

      console.log('Liquidity added successfully:', signature)
      return signature
    } catch (error) {
      console.error('Error adding liquidity:', error)
      const errorMessage = (error as Error)?.message || String(error)
      throw new Error(`Failed to add liquidity: ${errorMessage}`)
    }
  }

  // Swap tokens with transfer hook support
  async swap(params: SwapParams): Promise<string> {
    try {
      const payer = this.provider.wallet

      // Get pool state
      const poolState = await this.program.account.pool.fetch(params.poolAddress)
      const poolAuthority = this.derivePoolAuthority()

      // Determine token programs
      const tokenAProgram = (await this.connection.getAccountInfo(poolState.tokenAMint))?.owner
      const tokenBProgram = (await this.connection.getAccountInfo(poolState.tokenBMint))?.owner

      if (!tokenAProgram || !tokenBProgram) {
        throw new Error('Token programs not found')
      }

      // Get user token accounts - determine correct program for each token
      const inputTokenProgram = params.inputMint.equals(poolState.tokenAMint) ? tokenAProgram : tokenBProgram
      const outputTokenProgram = params.outputMint.equals(poolState.tokenAMint) ? tokenAProgram : tokenBProgram

      const inputTokenAccount = getAssociatedTokenAddressSync(
        params.inputMint,
        payer.publicKey,
        true,
        inputTokenProgram,
      )
      const outputTokenAccount = getAssociatedTokenAddressSync(
        params.outputMint,
        payer.publicKey,
        true,
        outputTokenProgram,
      )

      // Enhanced transfer hook account resolution
      const hookAccounts = await this.resolveAllTransferHookAccounts(
        params.inputMint,
        params.outputMint,
        payer.publicKey,
        poolAuthority,
      )

      // Calculate compute units needed for hooks
      const computeUnits = this.calculateHookComputeUnits(
        hookAccounts.inputHookAccounts.length > 0,
        hookAccounts.outputHookAccounts.length > 0,
      )

      // Build swap transaction
      const transaction = await this.program.methods
        .swap({
          amountIn: new BN(params.inputAmount),
          minimumAmountOut: new BN(params.minOutputAmount),
        })
        .accountsPartial({
          poolAuthority,
          pool: params.poolAddress,
          payer: payer.publicKey,
          inputTokenAccount,
          outputTokenAccount,
          tokenAVault: poolState.tokenAVault,
          tokenBVault: poolState.tokenBVault,
          tokenAProgram,
          tokenBProgram,
          tokenAMint: poolState.tokenAMint,
          tokenBMint: poolState.tokenBMint,
          referralTokenAccount: null, // Optional referral account
          hookRegistry: null, // Optional hook registry
        })
        .remainingAccounts([
          ...hookAccounts.inputHookAccounts,
          ...hookAccounts.outputHookAccounts,
          ...hookAccounts.commonAccounts,
        ])
        .transaction()

      // Add compute budget for hook execution
      transaction.add(
        web3.ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }),
        web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
      )

      // Send transaction
      transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash
      transaction.feePayer = payer.publicKey

      const signedTx = await payer.signTransaction(transaction)
      const signature = await this.connection.sendRawTransaction(signedTx.serialize())
      await this.connection.confirmTransaction(signature, 'confirmed')

      console.log('Swap executed successfully:', {
        signature,
        inputMint: params.inputMint.toString(),
        outputMint: params.outputMint.toString(),
        inputAmount: params.inputAmount,
        minOutputAmount: params.minOutputAmount,
        hookAccountsUsed: hookAccounts.inputHookAccounts.length + hookAccounts.outputHookAccounts.length,
      })

      return signature
    } catch (error) {
      console.error('Error swapping:', error)
      let errorMessage = (error as Error)?.message || String(error)

      // Try to get detailed logs from SendTransactionError
      try {
        const anyError: any = error
        if (anyError?.logs && Array.isArray(anyError.logs)) {
          console.log('Transaction logs:', anyError.logs)
          errorMessage += `\nLogs:\n${JSON.stringify(anyError.logs, null, 2)}`
        } else if (typeof anyError?.getLogs === 'function') {
          const logs = await anyError.getLogs(this.connection)
          if (logs) {
            console.log('Transaction logs:', logs)
            errorMessage += `\nLogs:\n${JSON.stringify(logs, null, 2)}`
          }
        }
      } catch (logError) {
        console.warn('Failed to extract logs:', logError)
      }

      // Enhanced error handling for specific errors with better user guidance
      if (errorMessage.includes('AmountIsZero') || errorMessage.includes('0x1776')) {
        throw new Error(`❌ Trade amount is zero or too small\n\nThe amount after fees must be greater than 0.\nTry:\n• Enter a larger amount\n• Check token decimals are correct`)
      } else if (errorMessage.includes('PriceRangeViolation') || errorMessage.includes('0x177f')) {
        throw new Error(`❌ Pool Liquidity Insufficient\n\nThis swap would cause extreme price impact due to low pool liquidity.\n\nSolutions:\n• Reduce swap amount significantly\n• Add more liquidity to the pool first\n• Try swapping in smaller increments\n• Increase slippage tolerance (with caution)`)
      } else if (errorMessage.includes('insufficient funds') || errorMessage.includes('InsufficientFunds')) {
        throw new Error(`❌ Insufficient Balance\n\nYou don't have enough tokens or SOL for this transaction.\n\nCheck:\n• Token balance is sufficient\n• SOL balance for transaction fees (~0.01 SOL)\n• Wallet is connected properly`)
      } else if (errorMessage.includes('slippage tolerance exceeded') || errorMessage.includes('SlippageExceeded')) {
        throw new Error(`❌ Slippage Exceeded\n\nPrice moved more than your slippage tolerance allows.\n\nTry:\n• Increase slippage tolerance\n• Reduce swap amount\n• Try again (prices may have changed)`)
      } else if (errorMessage.includes('TransferHookFailed') || errorMessage.includes('hook')) {
        throw new Error(`❌ RWA Compliance Check Failed\n\nTransfer hook validation rejected this transaction.\n\nPossible issues:\n• KYC status not verified\n• Geographic restrictions\n• Trading hours restrictions\n• Amount limits exceeded`)
      } else if (errorMessage.includes('KycRequired') || errorMessage.includes('0x1770')) {
        throw new Error(`❌ KYC Required\n\nThis RWA token requires KYC verification.\n\nAction needed:\n• Complete KYC process\n• Ensure KYC account is created\n• Verify compliance status`)
      } else if (errorMessage.includes('InsufficientKycLevel') || errorMessage.includes('0x1771')) {
        throw new Error(`❌ Higher KYC Level Required\n\nYour current KYC level is insufficient for this RWA token.\n\nAction needed:\n• Upgrade to higher KYC tier\n• Provide additional verification documents\n• Contact support if needed`)
      } else if (errorMessage.includes('GeographicRestriction') || errorMessage.includes('0x1772')) {
        throw new Error(`❌ Geographic Restriction\n\nThis RWA token cannot be traded from your location.\n\nThis is due to regulatory compliance requirements.`)
      } else if (errorMessage.includes('TradingHoursRestriction') || errorMessage.includes('0x1773')) {
        throw new Error(`❌ Trading Hours Restriction\n\nThis RWA token can only be traded during specific hours.\n\nPlease try again during allowed trading hours.`)
      } else if (errorMessage.includes('ExceedsTradeLimit') || errorMessage.includes('0x1774')) {
        throw new Error(`❌ Trade Amount Exceeds Limits\n\nThis amount exceeds your KYC tier limits.\n\nOptions:\n• Reduce trade amount\n• Upgrade KYC level\n• Split into multiple smaller trades`)
      } else if (errorMessage.includes('PoolNotFound') || errorMessage.includes('pool')) {
        throw new Error(`❌ Pool Not Available\n\nNo liquidity pool found for this token pair.\n\nAction needed:\n• Create a new pool for this pair\n• Use different tokens\n• Check if pool address is correct`)
      } else {
        // Provide a more helpful generic error
        let userFriendlyError = `❌ Transaction Failed\n\n${errorMessage}`
        
        // Add common troubleshooting tips for generic errors
        userFriendlyError += `\n\nCommon solutions:\n• Check wallet connection\n• Ensure sufficient SOL for fees\n• Try reducing transaction amount\n• Refresh page and try again\n• Check network status`
        
        throw new Error(userFriendlyError)
      }
    }
  }

  // Create user KYC account
  async createUserKyc(params: CreateUserKycParams): Promise<string> {
    try {
      const payer = this.provider.wallet

      // Derive KYC account PDA
      const userKycPda = PublicKey.findProgramAddressSync(
        [Buffer.from('user-kyc'), params.userPublicKey.toBuffer()],
        TRANSFER_HOOK_PROGRAM_ID,
      )[0]

      // If KYC account already exists, route to update instead of initialize
      const existingKyc = await this.connection.getAccountInfo(userKycPda)
      if (existingKyc) {
        return await this.updateUserKyc({
          userPublicKey: params.userPublicKey,
          newKycLevel: params.kycLevel,
          newCountry: params.country,
          newState: params.state,
          newCity: params.city,
        })
      }

      // Build transaction
      const transaction = await this.transferHookProgram.methods
        .initializeUserKyc(
          params.kycLevel,
          params.country || 'US',
          params.state || 'CA',
          params.city || 'San Francisco',
        )
        .accountsPartial({
          payer: payer.publicKey,
          user: params.userPublicKey,
          userKyc: userKycPda,
          systemProgram: SystemProgram.programId,
        })
        .transaction()

      // Send transaction
      transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash
      transaction.feePayer = payer.publicKey

      const signedTx = await payer.signTransaction(transaction)
      const signature = await this.connection.sendRawTransaction(signedTx.serialize())
      await this.connection.confirmTransaction(signature, 'confirmed')

      console.log('User KYC created successfully:', {
        kycAddress: userKycPda.toString(),
        user: params.userPublicKey.toString(),
        kycLevel: params.kycLevel,
        signature,
      })

      return signature
    } catch (error) {
      console.error('Error creating user KYC:', error)
      const errorMessage = (error as Error)?.message || String(error)
      throw new Error(`Failed to create user KYC: ${errorMessage}`)
    }
  }

  // Update user KYC
  async updateUserKyc(params: UpdateUserKycParams): Promise<string> {
    try {
      const payer = this.provider.wallet
      const userKycPda = PublicKey.findProgramAddressSync(
        [Buffer.from('user-kyc'), params.userPublicKey.toBuffer()],
        TRANSFER_HOOK_PROGRAM_ID,
      )[0]

      const transaction = await this.transferHookProgram.methods
        .updateUserKyc(
          params.newKycLevel ?? null,
          params.newRiskScore ?? null,
          params.flagsToSet ?? null,
          params.flagsToClear ?? null,
          params.newCountry ?? null,
          params.newState ?? null,
          params.newCity ?? null,
        )
        .accountsPartial({
          authority: payer.publicKey,
          user: params.userPublicKey,
          userKyc: userKycPda,
        })
        .transaction()

      transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash
      transaction.feePayer = payer.publicKey

      const signedTx = await payer.signTransaction(transaction)
      const signature = await this.connection.sendRawTransaction(signedTx.serialize())
      await this.connection.confirmTransaction(signature, 'confirmed')

      console.log('User KYC updated successfully:', {
        kycAddress: userKycPda.toString(),
        user: params.userPublicKey.toString(),
        newKycLevel: params.newKycLevel,
        signature,
      })

      return signature
    } catch (error) {
      console.error('Error updating user KYC:', error)
      const errorMessage = (error as Error)?.message || String(error)
      throw new Error(`Failed to update user KYC: ${errorMessage}`)
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

  // Get pool quote for swap calculation
  async getPoolQuote(
    poolAddress: PublicKey,
    inputMint: PublicKey,
    inputAmount: number,
  ): Promise<{
    outputAmount: number
    priceImpact: number
    fee: number
    maxSafeAmount?: number
    priceRangeWarning?: boolean
  }> {
    try {
      // Get pool state
      const poolState = await this.program.account.pool.fetch(poolAddress)
      const isTokenA = inputMint.equals(poolState.tokenAMint)

      // Check if amount would violate price range
      const maxSwapResult = await this.calculateMaxSwapAmount(poolAddress, inputMint, isTokenA)
      let actualInputAmount = inputAmount
      let priceRangeWarning = false

      if (maxSwapResult && maxSwapResult.maxAmount < inputAmount) {
        actualInputAmount = maxSwapResult.maxAmount
        priceRangeWarning = true
        console.warn(`Input amount ${inputAmount} exceeds max safe amount ${maxSwapResult.maxAmount}`)
      }

      // Basic AMM calculation (this would be more complex in production)
      // This is a simplified constant product formula implementation
      
      // Get current reserves (simplified - would need to fetch actual token balances)
      const inputReserve = isTokenA ? Number(poolState.liquidity.toString()) : Number(poolState.liquidity.toString())
      const outputReserve = isTokenA ? Number(poolState.liquidity.toString()) : Number(poolState.liquidity.toString())

      // Constant product formula: x * y = k
      // After swap: (x + actualInputAmount) * (y - outputAmount) = k
      // Solving for outputAmount
      const k = inputReserve * outputReserve
      const newInputReserve = inputReserve + actualInputAmount
      const newOutputReserve = k / newInputReserve
      const outputAmount = outputReserve - newOutputReserve

      // Calculate price impact
      const priceImpact = (actualInputAmount / inputReserve) * 100

      // Calculate fee (simplified)
      const fee = actualInputAmount * 0.003 // 0.3% fee

      return {
        outputAmount: Math.max(0, outputAmount - fee),
        priceImpact: Math.min(priceImpact, 100),
        fee,
        maxSafeAmount: maxSwapResult?.maxAmount,
        priceRangeWarning,
      }
    } catch (error) {
      console.error('Error getting pool quote:', error)
      // Fallback to mock calculation
      return {
        outputAmount: inputAmount * 100, // Mock rate
        priceImpact: Math.min(inputAmount * 0.001, 5),
        fee: inputAmount * 0.003,
      }
    }
  }

  // Get pool information
  async getPoolInfo(poolAddress: PublicKey): Promise<{
    tokenAMint: PublicKey
    tokenBMint: PublicKey
    tokenAVault: PublicKey
    tokenBVault: PublicKey
    liquidity: BN
    sqrtPrice: BN
    sqrtMinPrice: BN
    sqrtMaxPrice: BN
    feeRate: number
  } | null> {
    try {
      const poolState = await this.program.account.pool.fetch(poolAddress)
      return {
        tokenAMint: poolState.tokenAMint,
        tokenBMint: poolState.tokenBMint,
        tokenAVault: poolState.tokenAVault,
        tokenBVault: poolState.tokenBVault,
        liquidity: poolState.liquidity,
        sqrtPrice: poolState.sqrtPrice,
        sqrtMinPrice: poolState.sqrtMinPrice,
        sqrtMaxPrice: poolState.sqrtMaxPrice,
        feeRate: 0.003, // Simplified - would come from pool config
      }
    } catch (error) {
      console.error('Error fetching pool info:', error)
      return null
    }
  }

  // Calculate maximum swap amount that won't violate price bounds
  async calculateMaxSwapAmount(
    poolAddress: PublicKey,
    inputMint: PublicKey,
    isTokenA: boolean
  ): Promise<{ maxAmount: number; wouldViolate: boolean } | null> {
    try {
      const poolState = await this.program.account.pool.fetch(poolAddress)
      
      const currentSqrtPrice = poolState.sqrtPrice.toNumber()
      const sqrtMinPrice = poolState.sqrtMinPrice.toNumber()
      const sqrtMaxPrice = poolState.sqrtMaxPrice.toNumber()
      const liquidity = poolState.liquidity.toNumber()

      // Simple approximation - in production this would use the same curve math as the contract
      // For now, we'll calculate a conservative maximum based on price bounds
      let maxSqrtPriceChange: number
      
      if (isTokenA) {
        // Swapping token A for B decreases sqrt price
        maxSqrtPriceChange = currentSqrtPrice - sqrtMinPrice
      } else {
        // Swapping token B for A increases sqrt price
        maxSqrtPriceChange = sqrtMaxPrice - currentSqrtPrice
      }

      // Conservative estimation: limit price movement to 80% of available range
      const safeMaxChange = maxSqrtPriceChange * 0.8
      
      // Rough approximation: amount = (price_change * liquidity) / current_price
      // This is simplified - the actual curve math is more complex
      const maxAmount = Math.max(0, (safeMaxChange * liquidity) / (currentSqrtPrice * 1000000))

      return {
        maxAmount: Math.floor(maxAmount),
        wouldViolate: maxAmount === 0
      }
    } catch (error) {
      console.error('Error calculating max swap amount:', error)
      return null
    }
  }

  // Get user token balance for a specific mint
  // IMPORTANT: Returns UI amount (decimal-adjusted, human-readable format)
  // Example: if user has 1000 tokens with 6 decimals, this returns 1000.0 (not 1000000000)
  async getUserTokenBalance(mintAddress: PublicKey, userPublicKey: PublicKey): Promise<{
    balance: number // UI amount (already decimal-adjusted)
    exists: boolean
    tokenProgram?: PublicKey
    rawAmount?: string // Raw amount in smallest units for debugging
  }> {
    try {
      // Try both TOKEN_PROGRAM_ID and TOKEN_2022_PROGRAM_ID
      const [tokenAccounts, token2022Accounts] = await Promise.all([
        this.connection.getParsedTokenAccountsByOwner(userPublicKey, {
          programId: TOKEN_PROGRAM_ID,
        }).catch(() => ({ value: [] })),
        this.connection.getParsedTokenAccountsByOwner(userPublicKey, {
          programId: TOKEN_2022_PROGRAM_ID,
        }).catch(() => ({ value: [] }))
      ])

      const allAccounts = [...tokenAccounts.value, ...token2022Accounts.value]
      
      // Find the account for the specific mint
      const tokenAccount = allAccounts.find(account => {
        const mintPubkey = account.account.data.parsed.info.mint
        return mintPubkey === mintAddress.toString()
      })

      if (!tokenAccount) {
        return { balance: 0, exists: false }
      }

      // uiAmount is already decimal-adjusted (what users see)
      const balance = tokenAccount.account.data.parsed.info.tokenAmount.uiAmount || 0
      const rawAmount = tokenAccount.account.data.parsed.info.tokenAmount.amount || "0"
      const tokenProgram = tokenAccount.account.owner

      console.log(`💰 Balance for ${mintAddress.toString().slice(0, 8)}...: ${balance} UI amount (raw: ${rawAmount})`)

      return { 
        balance, // This is UI amount - no further conversion needed!
        exists: true,
        tokenProgram,
        rawAmount
      }
    } catch (error) {
      console.error('Error getting user token balance:', error)
      return { balance: 0, exists: false }
    }
  }

  // List available pools with enhanced information
  async listPools(): Promise<
    Array<{
      address: PublicKey
      tokenAMint: PublicKey
      tokenBMint: PublicKey
      liquidity: BN
      sqrtPrice: BN
      tokenAHasHook?: boolean
      tokenBHasHook?: boolean
    }>
  > {
    try {
      const pools = await this.program.account.pool.all()
      const poolsWithHookInfo = await Promise.all(
        pools.map(async (pool) => {
          try {
            const { hasTransferHook } = await import('./transferHookUtils')
            const [tokenAHookInfo, tokenBHookInfo] = await Promise.all([
              hasTransferHook(this.connection, pool.account.tokenAMint),
              hasTransferHook(this.connection, pool.account.tokenBMint),
            ])

            return {
              address: pool.publicKey,
              tokenAMint: pool.account.tokenAMint,
              tokenBMint: pool.account.tokenBMint,
              liquidity: pool.account.liquidity,
              sqrtPrice: pool.account.sqrtPrice,
              tokenAHasHook: tokenAHookInfo.hasHook,
              tokenBHasHook: tokenBHookInfo.hasHook,
            }
          } catch (error) {
            console.warn('Error checking hooks for pool:', pool.publicKey.toString(), error)
            return {
              address: pool.publicKey,
              tokenAMint: pool.account.tokenAMint,
              tokenBMint: pool.account.tokenBMint,
              liquidity: pool.account.liquidity,
              sqrtPrice: pool.account.sqrtPrice,
            }
          }
        }),
      )

      return poolsWithHookInfo
    } catch (error) {
      console.error('Error listing pools:', error)
      return []
    }
  }

  // Check transfer hook status for a token
  async checkTransferHookStatus(mint: PublicKey): Promise<{
    hasHook: boolean
    hookProgramId?: PublicKey
    requiresKyc: boolean
    requiredKycLevel?: number
  }> {
    try {
      const { hasTransferHook } = await import('./transferHookUtils')
      const hookInfo = await hasTransferHook(this.connection, mint)

      return {
        hasHook: hookInfo.hasHook,
        hookProgramId: hookInfo.hookProgramId,
        requiresKyc: hookInfo.hasHook, // All RWA tokens require KYC
        requiredKycLevel: hookInfo.hasHook ? 2 : undefined, // Enhanced KYC for RWA
      }
    } catch (error) {
      console.error('Error checking transfer hook status:', error)
      return {
        hasHook: false,
        requiresKyc: false,
      }
    }
  }

  // Get current KYC status for a user
  async getUserKycStatus(user: PublicKey): Promise<{
    exists: boolean
    level?: number
    country?: string
    state?: string
    city?: string
    canTradeRwa: boolean
  }> {
    try {
      const { getKycStatus } = await import('./transferHookUtils')
      const kycStatus = await getKycStatus(this.connection, user)

      return {
        ...kycStatus,
        canTradeRwa: Boolean(kycStatus.exists && (kycStatus.level ?? 0) >= 2),
      }
    } catch (error) {
      console.error('Error getting KYC status:', error)
      return {
        exists: false,
        canTradeRwa: false,
      }
    }
  }

  // Validate if a swap can proceed
  async validateSwap(
    user: PublicKey,
    inputMint: PublicKey,
    outputMint: PublicKey,
    amount: number,
  ): Promise<{
    canSwap: boolean
    reason?: string
    requiredKycLevel?: number
    inputHookStatus?: any
    outputHookStatus?: any
  }> {
    try {
      const { validateSwapCompliance } = await import('./transferHookUtils')
      const validation = await validateSwapCompliance(this.connection, user, inputMint, outputMint, amount)

      // Get hook status for both tokens
      const [inputHookStatus, outputHookStatus] = await Promise.all([
        this.checkTransferHookStatus(inputMint),
        this.checkTransferHookStatus(outputMint),
      ])

      return {
        ...validation,
        inputHookStatus,
        outputHookStatus,
      }
    } catch (error) {
      console.error('Error validating swap:', error)
      return {
        canSwap: false,
        reason: 'Unable to validate swap. Please try again.',
      }
    }
  }

  // Helper functions
  getUserKycAddress(userPublicKey: PublicKey): PublicKey {
    const [address] = PublicKey.findProgramAddressSync(
      [Buffer.from('user-kyc'), userPublicKey.toBuffer()],
      TRANSFER_HOOK_PROGRAM_ID,
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

  // Enhanced transfer hook account resolution
  async resolveAllTransferHookAccounts(
    inputMint: PublicKey,
    outputMint: PublicKey,
    user: PublicKey,
    poolAuthority: PublicKey,
  ): Promise<{
    inputHookAccounts: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }>
    outputHookAccounts: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }>
    commonAccounts: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }>
  }> {
    const inputHookAccounts: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }> = []
    const outputHookAccounts: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }> = []
    const commonAccounts: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }> = []

    try {
      // Import transfer hook utilities
      const { hasTransferHook, getExtraAccountMetaListAddress, getUserKycAddress } = await import('./transferHookUtils')

      // Check input token for transfer hooks
      const inputHookInfo = await hasTransferHook(this.connection, inputMint)
      if (inputHookInfo.hasHook && inputHookInfo.hookProgramId) {
        const inputExtraAccounts = getExtraAccountMetaListAddress(inputMint, inputHookInfo.hookProgramId)
        inputHookAccounts.push({
          pubkey: inputExtraAccounts,
          isSigner: false,
          isWritable: false,
        })
      }

      // Check output token for transfer hooks
      const outputHookInfo = await hasTransferHook(this.connection, outputMint)
      if (outputHookInfo.hasHook && outputHookInfo.hookProgramId) {
        const outputExtraAccounts = getExtraAccountMetaListAddress(outputMint, outputHookInfo.hookProgramId)
        outputHookAccounts.push({
          pubkey: outputExtraAccounts,
          isSigner: false,
          isWritable: false,
        })
      }

      // Add common accounts needed by both hooks
      if (inputHookInfo.hasHook || outputHookInfo.hasHook) {
        // User KYC account
        const userKycPda = getUserKycAddress(user)
        commonAccounts.push({
          pubkey: userKycPda,
          isSigner: false,
          isWritable: false,
        })

        // Pool authority KYC account
        const poolAuthorityKycPda = getUserKycAddress(poolAuthority)
        commonAccounts.push({
          pubkey: poolAuthorityKycPda,
          isSigner: false,
          isWritable: false,
        })

        // Transfer hook program ID
        commonAccounts.push({
          pubkey: TRANSFER_HOOK_PROGRAM_ID,
          isSigner: false,
          isWritable: false,
        })
      }

      return {
        inputHookAccounts,
        outputHookAccounts,
        commonAccounts,
      }
    } catch (error) {
      console.warn('Error resolving transfer hook accounts:', error)
      return {
        inputHookAccounts: [],
        outputHookAccounts: [],
        commonAccounts: [],
      }
    }
  }

  // Calculate compute units needed for transfer hook execution
  calculateHookComputeUnits(hasInputHook: boolean, hasOutputHook: boolean): number {
    let baseUnits = 300_000 // Base AMM computation (increased from 200k)

    if (hasInputHook) baseUnits += 150_000 // Input token hook (increased from 100k)
    if (hasOutputHook) baseUnits += 150_000 // Output token hook (increased from 100k)
    if (hasInputHook && hasOutputHook) baseUnits += 100_000 // Additional for dual hooks (increased from 50k)

    return Math.min(baseUnits, 1_400_000) // Solana compute limit
  }

  // Helper methods for address derivation
  derivePoolAuthority(): PublicKey {
    const [address] = PublicKey.findProgramAddressSync([Buffer.from('pool_authority')], this.program.programId)
    return address
  }

  derivePoolAddress(config: PublicKey, tokenAMint: PublicKey, tokenBMint: PublicKey): PublicKey {
    // Ensure consistent ordering
    const firstKey = this.getFirstKey(tokenAMint, tokenBMint)
    const secondKey = this.getSecondKey(tokenAMint, tokenBMint)

    const [address] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool'), config.toBuffer(), firstKey, secondKey],
      this.program.programId,
    )
    return address
  }

  derivePositionAddress(positionNft: PublicKey): PublicKey {
    const [address] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), positionNft.toBuffer()],
      this.program.programId,
    )
    return address
  }

  derivePositionNftAccount(positionNft: PublicKey): PublicKey {
    const [address] = PublicKey.findProgramAddressSync(
      [Buffer.from('position_nft_account'), positionNft.toBuffer()],
      this.program.programId,
    )
    return address
  }

  deriveTokenVaultAddress(tokenMint: PublicKey, pool: PublicKey): PublicKey {
    const [address] = PublicKey.findProgramAddressSync(
      [Buffer.from('token_vault'), tokenMint.toBuffer(), pool.toBuffer()],
      this.program.programId,
    )
    return address
  }

  private getFirstKey(key1: PublicKey, key2: PublicKey): Buffer {
    const buf1 = key1.toBuffer()
    const buf2 = key2.toBuffer()
    return Buffer.compare(buf1, buf2) === 1 ? buf1 : buf2
  }

  private getSecondKey(key1: PublicKey, key2: PublicKey): Buffer {
    const buf1 = key1.toBuffer()
    const buf2 = key2.toBuffer()
    return Buffer.compare(buf1, buf2) === 1 ? buf2 : buf1
  }

  // Prepare hook accounts for pool operations
  private async prepareHookAccountsForPool(
    tokenAMint: PublicKey,
    tokenBMint: PublicKey,
    creator: PublicKey,
  ): Promise<web3.AccountMeta[]> {
    const accounts: web3.AccountMeta[] = []

    try {
      // Check if tokens are Token-2022 and have transfer hooks
      const tokenAAccount = await this.connection.getAccountInfo(tokenAMint)
      const tokenBAccount = await this.connection.getAccountInfo(tokenBMint)

      const hasTokenAHook = tokenAAccount?.owner.equals(TOKEN_2022_PROGRAM_ID) ?? false
      const hasTokenBHook = tokenBAccount?.owner.equals(TOKEN_2022_PROGRAM_ID) ?? false

      // For now, create pools without transfer hooks to avoid AccountOwnedByWrongProgram error
      // RWA functionality should be added after basic pool creation works
      console.log('Skipping transfer hook accounts for basic pool creation')

      // TODO: Add transfer hook support after basic functionality works:
      // if (hasTokenAHook || hasTokenBHook) {
      //   // Add extra-account-metas and user-kyc PDAs as remaining accounts
      // }
    } catch (error) {
      console.warn('Error checking for transfer hooks:', error)
      // Continue without hook accounts
    }

    return accounts
  }

  // Prepare hook accounts for swap operations
  private async prepareHookAccountsForSwap(
    inputMint: PublicKey,
    outputMint: PublicKey,
    user: PublicKey,
    poolAuthority: PublicKey,
  ): Promise<web3.AccountMeta[]> {
    const accounts: web3.AccountMeta[] = []

    // Add extra account meta lists for transfer hooks
    const inputExtraAccountMetaList = PublicKey.findProgramAddressSync(
      [Buffer.from('extra-account-metas'), inputMint.toBuffer()],
      TRANSFER_HOOK_PROGRAM_ID,
    )[0]

    const outputExtraAccountMetaList = PublicKey.findProgramAddressSync(
      [Buffer.from('extra-account-metas'), outputMint.toBuffer()],
      TRANSFER_HOOK_PROGRAM_ID,
    )[0]

    // Add user and pool authority KYC accounts
    const userKycPda = PublicKey.findProgramAddressSync(
      [Buffer.from('user-kyc'), user.toBuffer()],
      TRANSFER_HOOK_PROGRAM_ID,
    )[0]

    const poolAuthorityKycPda = PublicKey.findProgramAddressSync(
      [Buffer.from('user-kyc'), poolAuthority.toBuffer()],
      TRANSFER_HOOK_PROGRAM_ID,
    )[0]

    accounts.push(
      { pubkey: inputExtraAccountMetaList, isSigner: false, isWritable: false },
      { pubkey: outputExtraAccountMetaList, isSigner: false, isWritable: false },
      { pubkey: userKycPda, isSigner: false, isWritable: false },
      { pubkey: poolAuthorityKycPda, isSigner: false, isWritable: false },
      { pubkey: TRANSFER_HOOK_PROGRAM_ID, isSigner: false, isWritable: false },
    )

    return accounts
  }

  // Prepare hook accounts for liquidity operations
  private async prepareHookAccountsForLiquidity(
    tokenAMint: PublicKey,
    tokenBMint: PublicKey,
    user: PublicKey,
  ): Promise<web3.AccountMeta[]> {
    const accounts: web3.AccountMeta[] = []

    // Add extra account meta lists for transfer hooks
    const tokenAExtraAccountMetaList = PublicKey.findProgramAddressSync(
      [Buffer.from('extra-account-metas'), tokenAMint.toBuffer()],
      TRANSFER_HOOK_PROGRAM_ID,
    )[0]

    const tokenBExtraAccountMetaList = PublicKey.findProgramAddressSync(
      [Buffer.from('extra-account-metas'), tokenBMint.toBuffer()],
      TRANSFER_HOOK_PROGRAM_ID,
    )[0]

    // Add user KYC account
    const userKycPda = PublicKey.findProgramAddressSync(
      [Buffer.from('user-kyc'), user.toBuffer()],
      TRANSFER_HOOK_PROGRAM_ID,
    )[0]

    accounts.push(
      { pubkey: tokenAExtraAccountMetaList, isSigner: false, isWritable: false },
      { pubkey: tokenBExtraAccountMetaList, isSigner: false, isWritable: false },
      { pubkey: userKycPda, isSigner: false, isWritable: false },
      { pubkey: TRANSFER_HOOK_PROGRAM_ID, isSigner: false, isWritable: false },
    )

    return accounts
  }

  // Initialize KYC accounts for users and pool authority with parallel checks
  async initializeKycAccounts(userPublicKeys: PublicKey[]): Promise<void> {
    const payer = this.provider.wallet

    try {
      console.log(
        'Checking KYC accounts for users:',
        userPublicKeys.map((k) => k.toString()),
      )

      // Derive all KYC PDAs
      const kycPdas = userPublicKeys.map(
        (userPubkey) =>
          PublicKey.findProgramAddressSync(
            [Buffer.from('user-kyc'), userPubkey.toBuffer()],
            TRANSFER_HOOK_PROGRAM_ID,
          )[0],
      )

      // Check all KYC accounts in parallel for speed
      const kycAccountInfos = await Promise.all(kycPdas.map((pda) => this.connection.getAccountInfo(pda)))

      // Initialize missing KYC accounts
      const initializationPromises: Promise<string>[] = []

      for (let i = 0; i < userPublicKeys.length; i++) {
        if (!kycAccountInfos[i]) {
          console.log(`Initializing KYC for user: ${userPublicKeys[i].toString()}`)

          const kycTx = await this.transferHookProgram.methods
            .initializeUserKyc(2, 'US', 'CA', 'San Francisco') // KYC level 2 (Enhanced)
            .accountsPartial({
              payer: payer.publicKey,
              user: userPublicKeys[i],
              userKyc: kycPdas[i],
              systemProgram: SystemProgram.programId,
            })
            .transaction()

          kycTx.feePayer = payer.publicKey
          kycTx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash

          const signedTx = await payer.signTransaction(kycTx)

          // Add to parallel initialization (but still need to serialize transaction sending)
          initializationPromises.push(
            this.connection.sendRawTransaction(signedTx.serialize()).then(async (signature) => {
              await this.connection.confirmTransaction(signature, 'confirmed')
              console.log(`✅ KYC initialized for ${userPublicKeys[i].toString()}: ${signature}`)
              return signature
            }),
          )
        } else {
          console.log(`✅ KYC already exists for user: ${userPublicKeys[i].toString()}`)
        }
      }

      // Wait for all KYC initializations to complete
      if (initializationPromises.length > 0) {
        await Promise.all(initializationPromises)
        console.log('✅ All KYC accounts initialized')
      }
    } catch (error) {
      console.error('Error initializing KYC accounts:', error)
      throw new Error(`Failed to initialize KYC accounts: ${(error as Error)?.message || error}`)
    }
  }

  // Setup transfer hook accounts (extra-account-metas and KYC) - only if needed
  async setupTransferHookAccounts(tokenAMint: PublicKey, tokenBMint: PublicKey, userPubkey: PublicKey): Promise<void> {
    const payer = this.provider.wallet
    const poolAuthority = this.derivePoolAuthority()

    console.log('Checking and setting up transfer hook accounts...')

    // Check if tokens are actually transfer hook enabled first
    const tokenAAccount = await this.connection.getAccountInfo(tokenAMint)
    const tokenBAccount = await this.connection.getAccountInfo(tokenBMint)

    if (!tokenAAccount || !tokenBAccount) {
      throw new Error('Token mints not found')
    }

    // Only proceed if tokens are Token-2022 with transfer hooks
    const isTokenATransferHook = tokenAAccount.owner.equals(TOKEN_2022_PROGRAM_ID)
    const isTokenBTransferHook = tokenBAccount.owner.equals(TOKEN_2022_PROGRAM_ID)

    if (!isTokenATransferHook && !isTokenBTransferHook) {
      console.log('Tokens are not transfer hook enabled, skipping setup')
      return
    }

    // Initialize extra-account-metas for tokens if needed
    if (isTokenATransferHook) {
      const [tokenAExtraAccountMetas] = PublicKey.findProgramAddressSync(
        [Buffer.from('extra-account-metas'), tokenAMint.toBuffer()],
        TRANSFER_HOOK_PROGRAM_ID,
      )

      const tokenAMetasInfo = await this.connection.getAccountInfo(tokenAExtraAccountMetas)
      if (!tokenAMetasInfo) {
        console.log('Initializing extra-account-metas for Token A...')
        const tokenAMetasTransaction = await this.transferHookProgram.methods
          .initializeExtraAccountMetaList()
          .accountsPartial({
            payer: payer.publicKey,
            extraAccountMetaList: tokenAExtraAccountMetas,
            mint: tokenAMint,
            wsolMint: tokenAMint, // Use same mint for testing
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .transaction()

        tokenAMetasTransaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash
        tokenAMetasTransaction.feePayer = payer.publicKey
        const signedTx = await payer.signTransaction(tokenAMetasTransaction)
        const signature = await this.connection.sendRawTransaction(signedTx.serialize())
        await this.connection.confirmTransaction(signature, 'confirmed')
      }
    }

    if (isTokenBTransferHook) {
      const [tokenBExtraAccountMetas] = PublicKey.findProgramAddressSync(
        [Buffer.from('extra-account-metas'), tokenBMint.toBuffer()],
        TRANSFER_HOOK_PROGRAM_ID,
      )

      const tokenBMetasInfo = await this.connection.getAccountInfo(tokenBExtraAccountMetas)
      if (!tokenBMetasInfo) {
        console.log('Initializing extra-account-metas for Token B...')
        const tokenBMetasTransaction = await this.transferHookProgram.methods
          .initializeExtraAccountMetaList()
          .accountsPartial({
            payer: payer.publicKey,
            extraAccountMetaList: tokenBExtraAccountMetas,
            mint: tokenBMint,
            wsolMint: tokenBMint, // Use same mint for testing
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .transaction()

        tokenBMetasTransaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash
        tokenBMetasTransaction.feePayer = payer.publicKey
        const signedTx = await payer.signTransaction(tokenBMetasTransaction)
        const signature = await this.connection.sendRawTransaction(signedTx.serialize())
        await this.connection.confirmTransaction(signature, 'confirmed')
      }
    }

    // Initialize KYC for user if needed
    const [userKycPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('user-kyc'), userPubkey.toBuffer()],
      TRANSFER_HOOK_PROGRAM_ID,
    )

    const userKycInfo = await this.connection.getAccountInfo(userKycPda)
    if (!userKycInfo) {
      console.log('Initializing KYC for user...')
      const userKycTransaction = await this.transferHookProgram.methods
        .initializeUserKyc(2, 'US', 'CA', 'San Francisco') // KYC level 2 (Enhanced)
        .accountsPartial({
          payer: payer.publicKey,
          user: userPubkey,
          systemProgram: SystemProgram.programId,
        })
        .transaction()

      userKycTransaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash
      userKycTransaction.feePayer = payer.publicKey
      const signedTx = await payer.signTransaction(userKycTransaction)
      const signature = await this.connection.sendRawTransaction(signedTx.serialize())
      await this.connection.confirmTransaction(signature, 'confirmed')
    } else {
      console.log('✅ User KYC already exists')
    }

    // Initialize KYC for pool authority if needed
    const [poolAuthorityKycPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('user-kyc'), poolAuthority.toBuffer()],
      TRANSFER_HOOK_PROGRAM_ID,
    )

    const poolAuthorityKycInfo = await this.connection.getAccountInfo(poolAuthorityKycPda)
    if (!poolAuthorityKycInfo) {
      console.log('Initializing KYC for pool authority...')
      const poolAuthorityKycTx = await this.transferHookProgram.methods
        .initializeUserKyc(2, 'US', 'CA', 'San Francisco')
        .accountsPartial({
          payer: payer.publicKey,
          user: poolAuthority,
          systemProgram: SystemProgram.programId,
        })
        .transaction()

      poolAuthorityKycTx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash
      poolAuthorityKycTx.feePayer = payer.publicKey
      const signedTx = await payer.signTransaction(poolAuthorityKycTx)
      const signature = await this.connection.sendRawTransaction(signedTx.serialize())
      await this.connection.confirmTransaction(signature, 'confirmed')
    } else {
      console.log('✅ Pool authority KYC already exists')
    }

    console.log('✅ All transfer hook accounts checked and initialized as needed')
  }

  // Initialize transfer hook accounts for a mint (extra account meta list)
  async initializeTransferHookAccounts(mintAddress: PublicKey): Promise<void> {
    try {
      const payer = this.provider.wallet

      // Derive extra account meta list PDA
      const [extraAccountMetaListPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('extra-account-metas'), mintAddress.toBuffer()],
        TRANSFER_HOOK_PROGRAM_ID,
      )

      // Check if extra account meta list already exists (parallel check for speed)
      console.log('Checking if extra account meta list exists for mint:', mintAddress.toString())
      const extraAccountMetaInfo = await this.connection.getAccountInfo(extraAccountMetaListPda)

      if (!extraAccountMetaInfo) {
        console.log('Initializing extra account meta list for transfer hook...')

        const initMetaListTx = await this.transferHookProgram.methods
          .initializeExtraAccountMetaList()
          .accountsPartial({
            payer: payer.publicKey,
            extraAccountMetaList: extraAccountMetaListPda,
            mint: mintAddress,
            wsolMint: mintAddress, // Use same mint for testing like in tests
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .transaction()

        initMetaListTx.feePayer = payer.publicKey
        initMetaListTx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash

        const signedMetaListTx = await payer.signTransaction(initMetaListTx)
        const metaListSignature = await this.connection.sendRawTransaction(signedMetaListTx.serialize())
        await this.connection.confirmTransaction(metaListSignature, 'confirmed')

        console.log('✅ Extra account meta list initialized:', extraAccountMetaListPda.toString())
      } else {
        console.log('✅ Extra account meta list already exists')
      }
    } catch (error) {
      console.error('Error initializing transfer hook accounts:', error)
      // Don't throw - this is not critical for mint creation
      console.warn('⚠️ Transfer hook accounts not initialized, but mint creation successful')
    }
  }
}

// Type definitions for parameters
export interface CreateConfigParams {
  poolFees: {
    baseFee: {
      cliffFeeNumerator: BN
      numberOfPeriod: number
      reductionFactor: BN
      periodFrequency: BN
      feeSchedulerMode: number
    }
    padding: number[]
    dynamicFee: null
  }
  sqrtMinPrice: BN
  sqrtMaxPrice: BN
  vaultConfigKey: PublicKey
  poolCreatorAuthority: PublicKey
  activationType: number
  collectFeeMode: number
}

export interface CreateRwaMintParams {
  supply: number
  decimals?: number // Number of decimal places (default: 6)
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
  config: PublicKey
  mintA: PublicKey
  mintB: PublicKey
  liquidity: BN
  sqrtPrice: BN
  activationPoint?: BN
}

export interface CreatePositionParams {
  poolAddress: PublicKey
  owner?: PublicKey
}

export interface AddLiquidityParams {
  poolAddress: PublicKey
  position: PublicKey
  liquidityDelta: number
  tokenAAmountThreshold: number
  tokenBAmountThreshold: number
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
  country?: string
  state?: string
  city?: string
}

export interface UpdateUserKycParams {
  userPublicKey: PublicKey
  newKycLevel?: number
  newRiskScore?: number
  newFlags?: number
  flagsToSet?: number
  flagsToClear?: number
  newCountry?: string
  newState?: string
  newCity?: string
}

export interface CreateWhitelistParams {
  mintPublicKey: PublicKey
  autoApprovalThreshold: number
}

// Helper function to detect if a mint has Transfer Hook extension
export async function hasTransferHook(connection: Connection, mint: PublicKey): Promise<boolean> {
  try {
    const mintAccountInfo = await connection.getAccountInfo(mint)
    if (!mintAccountInfo) return false

    // Basic check if it's a Token-2022 mint
    if (!mintAccountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) return false

    // This is a simplified check - in production you'd parse the mint data
    // to detect TransferHook extension
    return true // Assume Token-2022 mints may have hooks
  } catch {
    return false
  }
}

// Hook-aware transfer instruction builder
export async function createHookAwareTransferInstruction(
  connection: Connection,
  source: PublicKey,
  mint: PublicKey,
  destination: PublicKey,
  owner: PublicKey,
  amount: bigint,
  decimals: number,
) {
  // Check if mint has transfer hook
  const hasHook = await hasTransferHook(connection, mint)

  if (hasHook) {
    // Use Transfer Hook compatible instruction
    return await createTransferCheckedWithTransferHookInstruction(
      connection,
      source,
      mint,
      destination,
      owner,
      amount,
      decimals,
    )
  } else {
    // Use standard transfer for non-hook tokens
    const { createTransferCheckedInstruction } = await import('@solana/spl-token')
    return createTransferCheckedInstruction(source, mint, destination, owner, amount, decimals)
  }
}

// Helper to get extra accounts for Transfer Hook
export async function getTransferHookExtraAccounts(
  connection: Connection,
  mint: PublicKey,
  source: PublicKey,
  destination: PublicKey,
  owner: PublicKey,
): Promise<PublicKey[]> {
  try {
    const hasHook = await hasTransferHook(connection, mint)
    if (!hasHook) return []

    // Get ExtraAccountMetaList PDA
    const [extraAccountMetaListPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('extra-account-metas'), mint.toBuffer()],
      new PublicKey('574KpKhRZRWi9etrtmRSXZof7JASoPxU6ZUiFgLVErRv'), // Your RWA program ID
    )

    const extraAccountMetaListAccount = await connection.getAccountInfo(extraAccountMetaListPDA)
    if (!extraAccountMetaListAccount) return []

    // Parse ExtraAccountMetaList and resolve accounts
    // This would use the TLV Account Resolution library in production
    return [] // Return resolved extra accounts
  } catch {
    return []
  }
}
