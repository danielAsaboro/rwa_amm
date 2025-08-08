import { BN } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'

export const CP_AMM_PROGRAM_ID = new PublicKey('574KpKhRZRWi9etrtmRSXZof7JASoPxU6ZUiFgLVErRv')

export const TRANSFER_HOOK_PROGRAM_ID = new PublicKey('Hos5X6SbGqyDb8FfvRgiDqWpTE9C6FcgAkXrTeryUXwB')

export const TREASURY = new PublicKey('4EWqcx3aNZmMetCnxwLYwyNjan6XLGp3Ca2W316vrSjv')

export const MIN_SQRT_PRICE = new BN('4295048016')
export const MAX_SQRT_PRICE = new BN('79226673521066979257578248091')

export const LIQUIDITY_MAX = new BN('34028236692093846346337460743')
export const MIN_LP_AMOUNT = new BN('1844674407370955161600')
export const DECIMALS = 6
export const BASIS_POINT_MAX = 10_000
export const OFFSET = 64
export const U64_MAX = new BN('18446744073709551615')

// Set the decimals, fee basis points, and maximum fee
export const FEE_BASIS_POINT = 100 // 1%
export const MAX_FEE = BigInt(9 * Math.pow(10, DECIMALS)) // 9 tokens