import { ProgramTestContext } from 'solana-bankrun'
import { generateKpAndFund, randomID, startTest } from './bankrun-utils/common'
import { Keypair, PublicKey, SystemProgram, Connection, clusterApiUrl } from '@solana/web3.js'
import { TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
import {
  addLiquidity,
  AddLiquidityParams,
  createConfigIx,
  CreateConfigParams,
  createPosition,
  derivePoolAuthority,
  initializePool,
  InitializePoolParams,
  MIN_LP_AMOUNT,
  MAX_SQRT_PRICE,
  MIN_SQRT_PRICE,
  swap,
  SwapParams,
  CP_AMM_PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
  createCpAmmProgram,
  createTransferHookProgram,
  createHookRegistry,
  addHookProgram,
} from './bankrun-utils'
import BN from 'bn.js'
import { createToken2022WithTransferHook, mintToToken2022 } from './bankrun-utils/token2022'
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - generated at build time by Anchor
import TransferHookIDL from '../target/idl/transfer_hook.json'

describe('AMM with Transfer Hook', () => {
  let context: ProgramTestContext
  let admin: Keypair
  let user: Keypair
  let creator: Keypair
  let config: PublicKey
  let liquidity: BN
  let sqrtPrice: BN
  let pool: PublicKey
  let position: PublicKey
  let inputTokenMint: PublicKey
  let outputTokenMint: PublicKey
  let hookProgram: PublicKey
  let hookRegistry: PublicKey

  beforeEach(async () => {
    const root = Keypair.generate()
    context = await startTest(root)
    hookProgram = TRANSFER_HOOK_PROGRAM_ID

    user = await generateKpAndFund(context.banksClient, context.payer)
    admin = await generateKpAndFund(context.banksClient, context.payer)
    creator = await generateKpAndFund(context.banksClient, context.payer)

    // Create hook-enabled mints
    const inputTokenMintKeypair = Keypair.generate()
    const outputTokenMintKeypair = Keypair.generate()

    inputTokenMint = await createToken2022WithTransferHook(
      context.banksClient,
      context.payer,
      hookProgram,
      inputTokenMintKeypair,
    )

    outputTokenMint = await createToken2022WithTransferHook(
      context.banksClient,
      context.payer,
      hookProgram,
      outputTokenMintKeypair,
    )

    // Mint tokens to users
    await mintToToken2022(context.banksClient, context.payer, inputTokenMint, context.payer, user.publicKey)

    await mintToToken2022(context.banksClient, context.payer, outputTokenMint, context.payer, user.publicKey)

    await mintToToken2022(context.banksClient, context.payer, inputTokenMint, context.payer, creator.publicKey)

    await mintToToken2022(context.banksClient, context.payer, outputTokenMint, context.payer, creator.publicKey)

    // Initialize extra account meta lists for transfer hooks
    // const program = createCpAmmProgram()
    const program = createTransferHookProgram()

    // Initialize extra account meta list for input token
    const [inputExtraAccountMetaListPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('extra-account-metas'), inputTokenMint.toBuffer()],
      TRANSFER_HOOK_PROGRAM_ID,
    )

    const inputTransaction = await program.methods
      .initializeExtraAccountMetaList()
      .accountsPartial({
        payer: context.payer.publicKey,
        extraAccountMetaList: inputExtraAccountMetaListPDA,
        mint: inputTokenMint,
        wsolMint: inputTokenMint, // Use same mint for testing
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .transaction()

    inputTransaction.recentBlockhash = (await context.banksClient.getLatestBlockhash())[0]!
    inputTransaction.sign(context.payer)
    await context.banksClient.processTransaction(inputTransaction)

    // Initialize extra account meta list for output token
    const [outputExtraAccountMetaListPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('extra-account-metas'), outputTokenMint.toBuffer()],
      TRANSFER_HOOK_PROGRAM_ID,
    )

    const outputTransaction = await program.methods
      .initializeExtraAccountMetaList()
      .accountsPartial({
        payer: context.payer.publicKey,
        extraAccountMetaList: outputExtraAccountMetaListPDA,
        mint: outputTokenMint,
        wsolMint: outputTokenMint, // Use same mint for testing
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .transaction()

    outputTransaction.recentBlockhash = (await context.banksClient.getLatestBlockhash())[0]!
    outputTransaction.sign(context.payer)
    await context.banksClient.processTransaction(outputTransaction)

    // Initialize KYC for the creator (needed for transfer hooks)
    const creatorKycTransaction = await program.methods
      .initializeUserKyc(2, 'US', 'CA', 'San Francisco') // KYC level 2 (Enhanced)
      .accountsPartial({
        payer: context.payer.publicKey,
        user: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .transaction()

    creatorKycTransaction.recentBlockhash = (await context.banksClient.getLatestBlockhash())[0]!
    creatorKycTransaction.sign(context.payer)
    await context.banksClient.processTransaction(creatorKycTransaction)

    // Initialize KYC for the user (needed for transfer hooks)
    const userKycTransaction = await program.methods
      .initializeUserKyc(2, 'US', 'NY', 'New York') // KYC level 2 (Enhanced)
      .accountsPartial({
        payer: context.payer.publicKey,
        user: user.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .transaction()

    userKycTransaction.recentBlockhash = (await context.banksClient.getLatestBlockhash())[0]!
    userKycTransaction.sign(context.payer)
    await context.banksClient.processTransaction(userKycTransaction)

    // Initialize KYC for the pool authority PDA (needed when pool vault is source)
    const poolAuthority = derivePoolAuthority()
    const poolAuthorityKycTx = await program.methods
      .initializeUserKyc(2, 'US', 'CA', 'San Francisco')
      .accountsPartial({
        payer: context.payer.publicKey,
        user: poolAuthority,
        systemProgram: SystemProgram.programId,
      })
      .transaction()
    poolAuthorityKycTx.recentBlockhash = (await context.banksClient.getLatestBlockhash())[0]!
    poolAuthorityKycTx.sign(context.payer)
    await context.banksClient.processTransaction(poolAuthorityKycTx)

    // Create config using existing pattern
    const createConfigParams: CreateConfigParams = {
      poolFees: {
        baseFee: {
          cliffFeeNumerator: new BN(2_500_000),
          numberOfPeriod: 0,
          reductionFactor: new BN(0),
          periodFrequency: new BN(0),
          feeSchedulerMode: 0,
        },
        padding: [],
        dynamicFee: null,
      },
      sqrtMinPrice: new BN(MIN_SQRT_PRICE),
      sqrtMaxPrice: new BN(MAX_SQRT_PRICE),
      vaultConfigKey: PublicKey.default,
      poolCreatorAuthority: PublicKey.default,
      activationType: 0,
      collectFeeMode: 0,
    }

    config = await createConfigIx(context.banksClient, admin, new BN(randomID()), createConfigParams)

    // Create hook registry for testing
    hookRegistry = await createHookRegistry(context.banksClient, admin)

    // Add the transfer hook program to the whitelist
    await addHookProgram(context.banksClient, hookRegistry, admin, hookProgram)

    liquidity = new BN(MIN_LP_AMOUNT)
    sqrtPrice = new BN(MIN_SQRT_PRICE.muln(2))

    // Prepare hook accounts for pool initialization
    const [inputHookPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('extra-account-metas'), inputTokenMint.toBuffer()],
      TRANSFER_HOOK_PROGRAM_ID,
    )

    const [outputHookPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('extra-account-metas'), outputTokenMint.toBuffer()],
      TRANSFER_HOOK_PROGRAM_ID,
    )

    const initPoolParams: InitializePoolParams = {
      payer: creator,
      creator: creator.publicKey,
      config,
      tokenAMint: inputTokenMint,
      tokenBMint: outputTokenMint,
      liquidity,
      sqrtPrice,
      activationPoint: null,
    }

    const result = await initializePool(context.banksClient, initPoolParams)
    pool = result.pool
    position = await createPosition(context.banksClient, user, user.publicKey, pool)
  })

  it('should swap hook-enabled tokens in AMM', async () => {
    const addLiquidityParams: AddLiquidityParams = {
      owner: user,
      pool,
      position,
      liquidityDelta: new BN(MIN_SQRT_PRICE.muln(30)),
      tokenAAmountThreshold: new BN(200),
      tokenBAmountThreshold: new BN(200),
    }
    await addLiquidity(context.banksClient, addLiquidityParams)

    const swapParams: SwapParams = {
      payer: user,
      pool,
      inputTokenMint,
      outputTokenMint,
      amountIn: new BN(10),
      minimumAmountOut: new BN(0),
      referralTokenAccount: null,
      hookRegistry,
    }

    await swap(context.banksClient, swapParams)
  })
})
