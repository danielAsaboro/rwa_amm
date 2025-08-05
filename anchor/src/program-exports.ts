// Here we export some useful types and functions for interacting with the Anchor program.
import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { Cluster, PublicKey } from '@solana/web3.js'
import CpAmmIDL from '../target/idl/cp_amm.json'
import TransferHookIDL from '../target/idl/transfer_hook.json'
import type { CpAmm } from '../target/types/cp_amm'
import type { TransferHook } from '../target/types/transfer_hook'

// Re-export the generated IDL and type
export { CpAmm, CpAmmIDL, TransferHook, TransferHookIDL }

// The programId is imported from the program IDL.
export const CP_AMM_PROGRAM_ID = new PublicKey(CpAmmIDL.address)
export const TRANSFER_HOOK_PROGRAM_ID = new PublicKey(TransferHookIDL.address)

// This is a helper function to get the Counter Anchor program.
export function getCpAmmProgram(provider: AnchorProvider, address?: PublicKey): Program<CpAmm> {
  return new Program({ ...CpAmmIDL, address: address ? address.toBase58() : CpAmmIDL.address } as CpAmm, provider)
}

// This is a helper function to get the program ID for the Counter program depending on the cluster.
export function getCpAmmProgramId(cluster: Cluster) {
  switch (cluster) {
    case 'devnet':
    case 'testnet':
      // This is the program ID for the Counter program on devnet and testnet.
      return CP_AMM_PROGRAM_ID
    case 'mainnet-beta':
    default:
      return CP_AMM_PROGRAM_ID
  }
}

// Hook Program

// This is a helper function to get the Transfer Hook Anchor program.
export function getTransferHookProgram(provider: AnchorProvider, address?: PublicKey): Program<TransferHook> {
  return new Program(
    { ...TransferHookIDL, address: address ? address.toBase58() : TransferHookIDL.address } as TransferHook,
    provider,
  )
}

// This is a helper function to get the program ID for the Transfer Hook program depending on the cluster.
export function getTransferHookProgramId(cluster: Cluster) {
  switch (cluster) {
    case 'devnet':
    case 'testnet':
      // This is the program ID for the Counter program on devnet and testnet.
      return TRANSFER_HOOK_PROGRAM_ID
    case 'mainnet-beta':
    default:
      return TRANSFER_HOOK_PROGRAM_ID
  }
}
