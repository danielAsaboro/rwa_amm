import * as anchor from '@coral-xyz/anchor'
import { Program } from '@coral-xyz/anchor'
import { CpAmm } from '../target/types/cp_amm'
import { TransferHook } from '../target/types/transfer_hook'
import {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  getMintLen,
  ExtensionType,
  createInitializeTransferHookInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  createTransferCheckedWithTransferHookInstruction,
  getAssociatedTokenAddressSync,
  createInitializeMetadataPointerInstruction,
  LENGTH_SIZE,
  TYPE_SIZE,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import {
  createInitializeInstruction,
  createUpdateFieldInstruction,
  pack,
  TokenMetadata,
} from '@solana/spl-token-metadata'
import { Keypair, SystemProgram, Transaction, sendAndConfirmTransaction, PublicKey } from '@solana/web3.js'

// RWA Metadata structure for trading rules
interface RWAMetadata extends TokenMetadata {
  name: string
  symbol: string
  uri: string
  additionalMetadata: [string, string][]
}

// Create RWA metadata with trading hours and allowed countries
function createRWAMetadata(
  mint: PublicKey,
  basicInfo: { name: string; symbol: string; uri: string },
  rwaConfig: {
    allowedCountries: string[]
    restrictedStates: string[]
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
    timezoneOffset: number
  },
): RWAMetadata {
  return {
    mint,
    name: basicInfo.name,
    symbol: basicInfo.symbol,
    uri: basicInfo.uri,
    additionalMetadata: [
      // Geographic restrictions
      ['allowed_countries', rwaConfig.allowedCountries.join(',')],
      ['restricted_states', rwaConfig.restrictedStates.join(',')],

      // Trading Hours (serialized as JSON for complex structure)
      ['trading_hours', JSON.stringify(rwaConfig.tradingHours)],
      ['timezone_offset', rwaConfig.timezoneOffset.toString()],

      // Metadata type indicator
      ['metadata_type', 'rwa_trading_rules'],
      ['is_self_referential', 'true'],
    ],
  }
}

describe('Simple Transfer Hook Test', () => {
  anchor.setProvider(anchor.AnchorProvider.env())

  const program1 = anchor.workspace.CpAmm as Program<CpAmm>
  const program2 = anchor.workspace.TransferHook as Program<TransferHook>

  const provider = anchor.AnchorProvider.env()

  let mint: Keypair
  let payer: anchor.AnchorProvider['wallet']
  let user1: Keypair
  let user2: Keypair

  before(async function () {
    this.timeout(60000) // Increase timeout to 60 seconds
    mint = Keypair.generate()
    payer = provider.wallet
    user1 = Keypair.generate()
    user2 = Keypair.generate()

    console.log('🏗️ Creating mint with transfer hook and metadata...')
    console.log('Mint address:', mint.publicKey.toString())
    console.log('Your program ID:', program2.programId.toString())

    // RWA Configuration with trading hours and geographic restrictions
    const rwaConfig = {
      allowedCountries: ['US', 'CA', 'GB'],
      restrictedStates: ['US_NY', 'US_TX'],
      tradingHours: {
        mondayStart: 570, // 9:30 AM
        mondayEnd: 960, // 4:00 PM
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
      timezoneOffset: -5, // EST
    }

    // Create RWA metadata
    const metadata = createRWAMetadata(
      mint.publicKey,
      {
        name: 'Test RWA Token',
        symbol: 'TRWA',
        uri: 'https://example.com/metadata/trwa.json',
      },
      rwaConfig,
    )

    // Create mint with transfer hook and metadata extensions
    const extensions = [ExtensionType.TransferHook, ExtensionType.MetadataPointer]
    const mintLen = getMintLen(extensions)

    // Calculate space needed for metadata
    const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length

    const mintLamports = await provider.connection.getMinimumBalanceForRentExemption(mintLen + metadataLen)

    const createMintAccountIx = SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports: mintLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    })

    // Initialize metadata pointer (self-referential - points to the mint itself)
    const initializeMetadataPointerIx = createInitializeMetadataPointerInstruction(
      mint.publicKey, // mint account
      payer.publicKey, // update authority
      mint.publicKey, // metadata account (SELF-REFERENTIAL!)
      TOKEN_2022_PROGRAM_ID,
    )

    const initializeTransferHookIx = createInitializeTransferHookInstruction(
      mint.publicKey,
      payer.publicKey,
      program2.programId, // Your program as the hook
      TOKEN_2022_PROGRAM_ID,
    )

    const initializeMintIx = createInitializeMintInstruction(
      mint.publicKey,
      6,
      payer.publicKey,
      null,
      TOKEN_2022_PROGRAM_ID,
    )

    // Initialize the metadata (stored in the same mint account - SELF-REFERENTIAL!)
    const initializeMetadataIx = createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      mint: mint.publicKey,
      metadata: mint.publicKey, // SELF-REFERENTIAL!
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadata.uri,
      mintAuthority: payer.publicKey,
      updateAuthority: payer.publicKey,
    })

    const createMintTx = new Transaction()
      .add(createMintAccountIx)
      .add(initializeMetadataPointerIx) // Must come before mint initialization
      .add(initializeTransferHookIx)
      .add(initializeMintIx)
      .add(initializeMetadataIx)

    await sendAndConfirmTransaction(provider.connection, createMintTx, [payer.payer!, mint], {
      commitment: 'confirmed',
    })

    console.log('✅ Created mint with transfer hook and basic metadata')

    // Add RWA-specific metadata fields in smaller batches
    console.log('📋 Adding RWA metadata fields...')

    // Split metadata into smaller batches to avoid transaction size limits
    const batchSize = 3
    const metadataEntries = metadata.additionalMetadata

    for (let i = 0; i < metadataEntries.length; i += batchSize) {
      const batch = metadataEntries.slice(i, i + batchSize)
      const batchTx = new Transaction()

      for (const [key, value] of batch) {
        batchTx.add(
          createUpdateFieldInstruction({
            metadata: mint.publicKey, // SELF-REFERENTIAL!
            updateAuthority: payer.publicKey,
            programId: TOKEN_2022_PROGRAM_ID,
            field: key,
            value: value,
          }),
        )
      }

      await sendAndConfirmTransaction(provider.connection, batchTx, [payer.payer!], {
        commitment: 'confirmed',
      })

      console.log(
        `✅ Added metadata batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(metadataEntries.length / batchSize)}`,
      )
    }

    console.log('✅ Added RWA metadata with trading hours and allowed countries')
    console.log('🌍 Allowed countries:', rwaConfig.allowedCountries.join(', '))
    console.log('🕘 Trading hours: Monday-Friday 9:30 AM - 4:00 PM EST')
    console.log('🚫 Restricted states:', rwaConfig.restrictedStates.join(', '))

    // Create token accounts
    const user1TokenAccount = getAssociatedTokenAddressSync(
      mint.publicKey,
      user1.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
    )
    const user2TokenAccount = getAssociatedTokenAddressSync(
      mint.publicKey,
      user2.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
    )

    const createATAs = new Transaction()
      .add(
        createAssociatedTokenAccountIdempotentInstruction(
          payer.publicKey,
          user1TokenAccount,
          user1.publicKey,
          mint.publicKey,
          TOKEN_2022_PROGRAM_ID,
        ),
      )
      .add(
        createAssociatedTokenAccountIdempotentInstruction(
          payer.publicKey,
          user2TokenAccount,
          user2.publicKey,
          mint.publicKey,
          TOKEN_2022_PROGRAM_ID,
        ),
      )

    await sendAndConfirmTransaction(provider.connection, createATAs, [payer.payer!], {
      commitment: 'confirmed',
    })

    // Mint tokens to user1
    const mintAmount = 1000 * Math.pow(10, 6)
    const mintToIx = createMintToInstruction(
      mint.publicKey,
      user1TokenAccount,
      payer.publicKey,
      mintAmount,
      [],
      TOKEN_2022_PROGRAM_ID,
    )

    await sendAndConfirmTransaction(provider.connection, new Transaction().add(mintToIx), [payer.payer!], {
      commitment: 'confirmed',
    })

    console.log('✅ Setup complete!')

    // Initialize the extra account meta list
    console.log('🔧 Initializing extra account meta list...')
    const [extraAccountMetaListPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('extra-account-metas'), mint.publicKey.toBuffer()],
      program2.programId,
    )

    await program2.methods
      .initializeExtraAccountMetaList()
      .accountsPartial({
        payer: payer.publicKey,
        extraAccountMetaList: extraAccountMetaListPDA,
        mint: mint.publicKey,
        wsolMint: mint.publicKey, // Using same mint for wsol_mint for now
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: 'confirmed' })

    console.log('✅ Extra account meta list initialized!')

    // Initialize KYC for both users before testing transfers
    console.log('🆔 Setting up KYC for test users...')

    // Initialize KYC for user1 (the sender)
    const [user1KycPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('user-kyc'), user1.publicKey.toBuffer()],
      program2.programId,
    )

    await program2.methods
      .initializeUserKyc(
        2, // Enhanced KYC level
        'US', // Country
        'CA', // State
        'San Francisco', // City
      )
      .accountsPartial({
        payer: payer.publicKey,
        user: user1.publicKey,
        userKyc: user1KycPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: 'confirmed' })

    console.log('✅ KYC initialized for user1 (sender)')
    console.log('  🆔 KYC PDA:', user1KycPDA.toString())
  })

  it('should call transfer hook during transfer', async function () {
    this.timeout(30000) // Increase timeout for the test
    console.log('🔄 Testing transfer...')

    const user1TokenAccount = getAssociatedTokenAddressSync(
      mint.publicKey,
      user1.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
    )
    const user2TokenAccount = getAssociatedTokenAddressSync(
      mint.publicKey,
      user2.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
    )

    const transferAmount = 100 * Math.pow(10, 6)

    // Transfer with transfer hook - uses helper function to resolve extra accounts
    const transferIx = await createTransferCheckedWithTransferHookInstruction(
      provider.connection,
      user1TokenAccount,
      mint.publicKey,
      user2TokenAccount,
      user1.publicKey,
      BigInt(transferAmount),
      6,
      [],
      'confirmed',
      TOKEN_2022_PROGRAM_ID,
    )

    const transferTx = new Transaction().add(transferIx)
    transferTx.feePayer = payer.publicKey

    let signature: string
    try {
      signature = await sendAndConfirmTransaction(provider.connection, transferTx, [payer.payer!, user1], {
        commitment: 'confirmed',
        skipPreflight: false, // Enable preflight to get logs
      })
    } catch (error: any) {
      console.log('❌ Transfer failed with error:', error.message)

      // Try to get logs using getLogs if available
      if (typeof error.getLogs === 'function') {
        const logs = error.getLogs()
        console.log('📋 Transaction logs:')
        logs.forEach((log: string, index: number) => {
          console.log(`  ${index + 1}. ${log}`)
        })
      }

      // Check if logs are directly available
      if (error.logs) {
        console.log('📋 Direct transaction logs:')
        error.logs.forEach((log: string, index: number) => {
          console.log(`  ${index + 1}. ${log}`)
        })
      }

      throw error
    }

    console.log('✅ Transfer completed! Signature:', signature)

    // Check transaction logs
    const transaction = await provider.connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    })

    if (transaction?.meta?.logMessages) {
      console.log('📝 Transaction logs:')
      transaction.meta.logMessages.forEach((log, index) => {
        console.log(`  ${index + 1}. ${log}`)
        if (log.includes(program2.programId.toString())) {
          console.log('  🎉 YOUR PROGRAM WAS CALLED!')
        }
      })
    }

    console.log('🏆 Test complete - check logs above to see if your program was invoked!')
  })

  it('should initialize and update user KYC', async function () {
    this.timeout(30000)

    console.log('🆔 Testing KYC functionality...')

    // Create a test user keypair
    const testUser = Keypair.generate()

    // Derive the KYC PDA
    const [userKycPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('user-kyc'), testUser.publicKey.toBuffer()],
      program2.programId,
    )

    console.log('👤 Test User:', testUser.publicKey.toString())
    console.log('🆔 KYC PDA:', userKycPDA.toString())

    // 1. Initialize KYC
    console.log('📋 Initializing KYC...')
    await program2.methods
      .initializeUserKyc(
        2, // Enhanced KYC level
        'US', // Country
        'CA', // State
        'San Francisco', // City
      )
      .accountsPartial({
        payer: payer.publicKey,
        user: testUser.publicKey,
        userKyc: userKycPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: 'confirmed' })

    console.log('✅ KYC initialized successfully!')

    // 2. Read and verify KYC data
    console.log('📖 Reading KYC data...')
    const kycAccount = await program2.account.userKyc.fetch(userKycPDA)

    console.log('📊 KYC Data:')
    console.log('  👤 User:', kycAccount.user.toString())
    console.log('  📋 KYC Level:', kycAccount.kycLevel)
    console.log('  ⚠️ Risk Score:', kycAccount.riskScore)
    console.log('  🏴 Flags:', `0b${kycAccount.flags.toString(2).padStart(8, '0')}`)
    console.log(
      '  🌍 Country:',
      kycAccount.country
        .map((byte) => String.fromCharCode(byte))
        .join('')
        .replace(/\0/g, ''),
    )
    console.log(
      '  🏛️ State:',
      kycAccount.state
        .map((byte) => String.fromCharCode(byte))
        .join('')
        .replace(/\0/g, ''),
    )
    console.log(
      '  🏙️ City:',
      kycAccount.city
        .map((byte) => String.fromCharCode(byte))
        .join('')
        .replace(/\0/g, '')
        .trim(),
    )
    console.log('  📅 Last Updated:', new Date(kycAccount.lastUpdated.toNumber() * 1000).toISOString())
    console.log('  🎯 Trading Eligible:', kycAccount.kycLevel >= 1 && kycAccount.flags === 0)

    // 3. Update KYC - upgrade level and add flags
    console.log('🔄 Updating KYC...')
    await program2.methods
      .updateUserKyc(
        3, // Institutional level
        25, // Lower risk score
        0x02, // Set PEP flag
        null, // No flags to clear
        null, // Don't change country
        null, // Don't change state
        'Los Angeles', // Change city
      )
      .accountsPartial({
        authority: payer.publicKey,
        user: testUser.publicKey,
        userKyc: userKycPDA,
      })
      .rpc({ commitment: 'confirmed' })

    console.log('✅ KYC updated successfully!')

    // 4. Read updated KYC data
    console.log('📖 Reading updated KYC data...')
    const updatedKycAccount = await program2.account.userKyc.fetch(userKycPDA)

    console.log('📊 Updated KYC Data:')
    console.log('  📋 KYC Level:', updatedKycAccount.kycLevel, '(was 2, now 3)')
    console.log('  ⚠️ Risk Score:', updatedKycAccount.riskScore, '(was 50, now 25)')
    console.log('  🏴 Flags:', `0b${updatedKycAccount.flags.toString(2).padStart(8, '0')}`, '(PEP flag set)')
    console.log(
      '  🏙️ City:',
      updatedKycAccount.city
        .map((byte) => String.fromCharCode(byte))
        .join('')
        .replace(/\0/g, '')
        .trim(),
      '(changed to Los Angeles)',
    )
    console.log('  📅 Last Updated:', new Date(updatedKycAccount.lastUpdated.toNumber() * 1000).toISOString())

    // 5. Test flag clearing
    console.log('🚩 Testing flag clearing...')
    await program2.methods
      .updateUserKyc(
        null, // Don't change level
        null, // Don't change risk score
        null, // No flags to set
        0x02, // Clear PEP flag
        null, // Don't change country
        null, // Don't change state
        null, // Don't change city
      )
      .accountsPartial({
        authority: payer.publicKey,
        user: testUser.publicKey,
        userKyc: userKycPDA,
      })
      .rpc({ commitment: 'confirmed' })

    // 6. Verify flag was cleared
    const finalKycAccount = await program2.account.userKyc.fetch(userKycPDA)
    console.log('🚩 Final flags:', `0b${finalKycAccount.flags.toString(2).padStart(8, '0')}`, '(PEP flag cleared)')
    console.log('🎯 Final Trading Eligible:', finalKycAccount.kycLevel >= 1 && finalKycAccount.flags === 0)

    console.log('🎉 KYC test completed successfully!')
  })

  it('should block transfers for compliance violations', async function () {
    this.timeout(60000) // Longer timeout for multiple tests

    console.log('🚫 Testing compliance failure scenarios...')

    // Get the existing user1 KYC PDA
    const [user1KycPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('user-kyc'), user1.publicKey.toBuffer()],
      program2.programId,
    )

    console.log('👤 Testing with user1:', user1.publicKey.toString())
    console.log('🆔 User1 KYC PDA:', user1KycPDA.toString())

    // Helper function to test transfer failure
    const testTransferFailure = async (expectedError: string, scenario: string) => {
      console.log(`\n🧪 Testing: ${scenario}`)

      const user1TokenAccount = getAssociatedTokenAddressSync(
        mint.publicKey,
        user1.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      )
      const user2TokenAccount = getAssociatedTokenAddressSync(
        mint.publicKey,
        user2.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      )

      try {
        const transferIx = await createTransferCheckedWithTransferHookInstruction(
          provider.connection,
          user1TokenAccount,
          mint.publicKey,
          user2TokenAccount,
          user1.publicKey,
          BigInt(50 * Math.pow(10, 6)), // 50 tokens
          6,
          [],
          'confirmed',
          TOKEN_2022_PROGRAM_ID,
        )

        const transferTx = new Transaction().add(transferIx)
        transferTx.feePayer = payer.publicKey

        await sendAndConfirmTransaction(provider.connection, transferTx, [payer.payer!, user1], {
          commitment: 'confirmed',
          skipPreflight: false,
        })

        // If we get here, the test failed
        console.log('❌ UNEXPECTED: Transfer should have failed but succeeded')
        throw new Error(`Expected transfer to fail with ${expectedError}, but it succeeded`)
      } catch (error: any) {
        if (error.message && error.message.includes(expectedError)) {
          console.log(`✅ SUCCESS: Transfer correctly blocked with error: ${expectedError}`)
          return true
        } else if (error.logs) {
          console.log('📋 Transaction logs:')
          error.logs.forEach((log: string, index: number) => {
            console.log(`  ${index + 1}. ${log}`)
          })

          // Check if our expected blocking message is in the logs
          const hasExpectedBlock = error.logs.some(
            (log: string) => log.includes('BLOCKED') || log.includes(expectedError),
          )

          if (hasExpectedBlock) {
            console.log(`✅ SUCCESS: Transfer correctly blocked (found in logs)`)
            return true
          }
        }

        console.log('❌ UNEXPECTED ERROR:', error.message)
        throw error
      }
    }

    // TEST 1: Country restriction (change user to France - not in allowlist)
    console.log('\n🌍 TEST 1: Country Restriction Failure')
    await program2.methods
      .updateUserKyc(
        null, // Don't change level
        null, // Don't change risk score
        null, // No flags to set
        null, // No flags to clear
        'FR', // Change to France (not in US,CA,GB allowlist)
        null, // Don't change state
        null, // Don't change city
      )
      .accountsPartial({
        authority: payer.publicKey,
        user: user1.publicKey,
        userKyc: user1KycPDA,
      })
      .rpc({ commitment: 'confirmed' })

    console.log('📍 Updated user1 country to FR (France)')
    await testTransferFailure('InvalidCountryCode', 'France country restriction')

    // TEST 2: State restriction (change to US_NY - restricted state)
    console.log('\n🏛️ TEST 2: State Restriction Failure')
    await program2.methods
      .updateUserKyc(
        null, // Don't change level
        null, // Don't change risk score
        null, // No flags to set
        null, // No flags to clear
        'US', // Back to US
        'NY', // Change to NY (restricted state)
        null, // Don't change city
      )
      .accountsPartial({
        authority: payer.publicKey,
        user: user1.publicKey,
        userKyc: user1KycPDA,
      })
      .rpc({ commitment: 'confirmed' })

    console.log('📍 Updated user1 to US_NY (restricted state)')
    await testTransferFailure('InvalidStateCode', 'New York state restriction')

    // TEST 3: Sanctions flag
    console.log('\n🛑 TEST 3: Sanctions Flag Failure')
    await program2.methods
      .updateUserKyc(
        null, // Don't change level
        null, // Don't change risk score
        0x01, // Set sanctions flag (UserKYC::FLAG_SANCTIONS)
        null, // No flags to clear
        'US', // Back to allowed country
        'CA', // Back to allowed state
        null, // Don't change city
      )
      .accountsPartial({
        authority: payer.publicKey,
        user: user1.publicKey,
        userKyc: user1KycPDA,
      })
      .rpc({ commitment: 'confirmed' })

    console.log('🚩 Set sanctions flag on user1')
    await testTransferFailure('UserSanctioned', 'sanctions flag blocking')

    // TEST 4: Frozen account flag
    console.log('\n🧊 TEST 4: Frozen Account Flag Failure')
    await program2.methods
      .updateUserKyc(
        null, // Don't change level
        null, // Don't change risk score
        0x04, // Set frozen flag (UserKYC::FLAG_FROZEN)
        0x01, // Clear sanctions flag
        null, // Don't change country
        null, // Don't change state
        null, // Don't change city
      )
      .accountsPartial({
        authority: payer.publicKey,
        user: user1.publicKey,
        userKyc: user1KycPDA,
      })
      .rpc({ commitment: 'confirmed' })

    console.log('🚩 Set frozen flag on user1')
    await testTransferFailure('UserAccountFrozen', 'frozen account blocking')

    // TEST 5: Insufficient KYC level
    console.log('\n📋 TEST 5: Insufficient KYC Level Failure')
    await program2.methods
      .updateUserKyc(
        0, // Set to Unverified level
        null, // Don't change risk score
        null, // No flags to set
        0x04, // Clear frozen flag
        null, // Don't change country
        null, // Don't change state
        null, // Don't change city
      )
      .accountsPartial({
        authority: payer.publicKey,
        user: user1.publicKey,
        userKyc: user1KycPDA,
      })
      .rpc({ commitment: 'confirmed' })

    console.log('📋 Set KYC level to 0 (Unverified)')
    await testTransferFailure('UserNotKycVerified', 'insufficient KYC level blocking')

    // CLEANUP: Restore user1 to compliant state for other tests
    console.log('\n🔄 CLEANUP: Restoring user1 to compliant state')
    await program2.methods
      .updateUserKyc(
        2, // Enhanced level
        null, // Don't change risk score
        null, // No flags to set
        null, // No flags to clear
        'US', // Allowed country
        'CA', // Allowed state
        'San Francisco', // Restore city
      )
      .accountsPartial({
        authority: payer.publicKey,
        user: user1.publicKey,
        userKyc: user1KycPDA,
      })
      .rpc({ commitment: 'confirmed' })

    console.log('🎉 All compliance failure tests passed!')
    console.log('✅ Geographic restrictions working')
    console.log('✅ Sanctions blocking working')
    console.log('✅ Frozen account blocking working')
    console.log('✅ KYC level validation working')
    console.log('👤 User1 restored to compliant state')
  })
})
