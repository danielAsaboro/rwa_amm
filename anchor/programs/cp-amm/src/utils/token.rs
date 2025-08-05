use crate::math::safe_math::SafeMath;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_instruction::transfer;

use anchor_lang::{
    prelude::InterfaceAccount,
    solana_program::{ program::{ invoke, invoke_signed }, instruction::AccountMeta },
};
use anchor_spl::{
    token::Token,
    token_2022::spl_token_2022::{
        self,
        extension::{
            self,
            transfer_fee::{ TransferFee, MAX_FEE_BASIS_POINTS },
            transfer_hook::TransferHook,
            BaseStateWithExtensions,
            ExtensionType,
            StateWithExtensions,
        },
    },
    token_interface::{ Mint, TokenAccount, TokenInterface },
};
use num_enum::{ IntoPrimitive, TryFromPrimitive };

use crate::{ state::TokenBadge, PoolError };

#[derive(AnchorSerialize, AnchorDeserialize, Debug, PartialEq, Eq, IntoPrimitive, TryFromPrimitive)]
#[repr(u8)]
pub enum TokenProgramFlags {
    TokenProgram,
    TokenProgram2022,
}

pub fn get_token_program_flags<'a, 'info>(token_mint: &'a InterfaceAccount<'info, Mint>) -> TokenProgramFlags {
    let token_mint_ai = token_mint.to_account_info();

    if token_mint_ai.owner.eq(&anchor_spl::token::ID) {
        TokenProgramFlags::TokenProgram
    } else {
        TokenProgramFlags::TokenProgram2022
    }
}

/// refer code from Orca
#[derive(Debug)]
pub struct TransferFeeIncludedAmount {
    pub amount: u64,
    pub transfer_fee: u64,
}

#[derive(Debug)]
pub struct TransferFeeExcludedAmount {
    pub amount: u64,
    pub transfer_fee: u64,
}

pub fn calculate_transfer_fee_excluded_amount<'info>(
    token_mint: &InterfaceAccount<'info, Mint>,
    transfer_fee_included_amount: u64
) -> Result<TransferFeeExcludedAmount> {
    if let Some(epoch_transfer_fee) = get_epoch_transfer_fee(token_mint)? {
        let transfer_fee = epoch_transfer_fee
            .calculate_fee(transfer_fee_included_amount)
            .ok_or_else(|| PoolError::MathOverflow)?;
        let transfer_fee_excluded_amount = transfer_fee_included_amount
            .checked_sub(transfer_fee)
            .ok_or_else(|| PoolError::MathOverflow)?;
        return Ok(TransferFeeExcludedAmount {
            amount: transfer_fee_excluded_amount,
            transfer_fee,
        });
    }

    Ok(TransferFeeExcludedAmount {
        amount: transfer_fee_included_amount,
        transfer_fee: 0,
    })
}

pub fn calculate_transfer_fee_included_amount<'info>(
    token_mint: &InterfaceAccount<'info, Mint>,
    transfer_fee_excluded_amount: u64
) -> Result<TransferFeeIncludedAmount> {
    if transfer_fee_excluded_amount == 0 {
        return Ok(TransferFeeIncludedAmount {
            amount: 0,
            transfer_fee: 0,
        });
    }

    if let Some(epoch_transfer_fee) = get_epoch_transfer_fee(token_mint)? {
        let transfer_fee: u64 = if u16::from(epoch_transfer_fee.transfer_fee_basis_points) == MAX_FEE_BASIS_POINTS {
            // edge-case: if transfer fee rate is 100%, current SPL implementation returns 0 as inverse fee.
            // https://github.com/solana-labs/solana-program-library/blob/fe1ac9a2c4e5d85962b78c3fc6aaf028461e9026/token/program-2022/src/extension/transfer_fee/mod.rs#L95

            // But even if transfer fee is 100%, we can use maximum_fee as transfer fee.
            // if transfer_fee_excluded_amount + maximum_fee > u64 max, the following checked_add should fail.
            u64::from(epoch_transfer_fee.maximum_fee)
        } else {
            epoch_transfer_fee.calculate_inverse_fee(transfer_fee_excluded_amount).ok_or(PoolError::MathOverflow)?
        };

        let transfer_fee_included_amount = transfer_fee_excluded_amount
            .checked_add(transfer_fee)
            .ok_or(PoolError::MathOverflow)?;

        // verify transfer fee calculation for safety
        let transfer_fee_verification = epoch_transfer_fee.calculate_fee(transfer_fee_included_amount).unwrap();
        if transfer_fee != transfer_fee_verification {
            // We believe this should never happen
            return Err(PoolError::FeeInverseIsIncorrect.into());
        }

        return Ok(TransferFeeIncludedAmount {
            amount: transfer_fee_included_amount,
            transfer_fee,
        });
    }

    Ok(TransferFeeIncludedAmount {
        amount: transfer_fee_excluded_amount,
        transfer_fee: 0,
    })
}

pub fn get_epoch_transfer_fee<'info>(token_mint: &InterfaceAccount<'info, Mint>) -> Result<Option<TransferFee>> {
    let token_mint_info = token_mint.to_account_info();
    if *token_mint_info.owner == Token::id() {
        return Ok(None);
    }

    let token_mint_data = token_mint_info.try_borrow_data()?;
    let token_mint_unpacked = StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&token_mint_data)?;
    if let Ok(transfer_fee_config) = token_mint_unpacked.get_extension::<extension::transfer_fee::TransferFeeConfig>() {
        let epoch = Clock::get()?.epoch;
        return Ok(Some(transfer_fee_config.get_epoch_fee(epoch).clone()));
    }

    Ok(None)
}

pub fn transfer_from_user<'a, 'c: 'info, 'info>(
    authority: &'a Signer<'info>,
    token_mint: &'a InterfaceAccount<'info, Mint>,
    token_owner_account: &'a InterfaceAccount<'info, TokenAccount>,
    destination_token_account: &'a InterfaceAccount<'info, TokenAccount>,
    token_program: &'a Interface<'info, TokenInterface>,
    amount: u64
) -> Result<()> {
    let destination_account = destination_token_account.to_account_info();

    let instruction = spl_token_2022::instruction::transfer_checked(
        token_program.key,
        &token_owner_account.key(),
        &token_mint.key(),
        destination_account.key,
        authority.key,
        &[],
        amount,
        token_mint.decimals
    )?;

    let account_infos = vec![
        token_owner_account.to_account_info(),
        token_mint.to_account_info(),
        destination_account.to_account_info(),
        authority.to_account_info()
    ];

    // Log CPI accounts for debugging (user -> destination)
    msg!("🔁 CPI transfer_checked (from user)");
    msg!("  [0] source_token: {}", token_owner_account.key());
    msg!("  [1] mint: {}", token_mint.key());
    msg!("  [2] destination_token: {}", destination_account.key);
    msg!("  [3] authority: {}", authority.key());

    invoke_signed(&instruction, &account_infos, &[])?;

    Ok(())
}

pub fn transfer_from_pool<'c: 'info, 'info>(
    pool_authority: AccountInfo<'info>,
    token_mint: &InterfaceAccount<'info, Mint>,
    token_vault: &InterfaceAccount<'info, TokenAccount>,
    token_owner_account: &InterfaceAccount<'info, TokenAccount>,
    token_program: &Interface<'info, TokenInterface>,
    amount: u64
) -> Result<()> {
    let signer_seeds = pool_authority_seeds!();

    let instruction = spl_token_2022::instruction::transfer_checked(
        token_program.key,
        &token_vault.key(),
        &token_mint.key(),
        &token_owner_account.key(),
        &pool_authority.key(),
        &[],
        amount,
        token_mint.decimals
    )?;

    let account_infos = vec![
        token_vault.to_account_info(),
        token_mint.to_account_info(),
        token_owner_account.to_account_info(),
        pool_authority.to_account_info()
    ];

    // Log CPI accounts for debugging (pool -> user)
    msg!("🔁 CPI transfer_checked (from pool)");
    msg!("  [0] source_token (vault): {}", token_vault.key());
    msg!("  [1] mint: {}", token_mint.key());
    msg!("  [2] destination_token (user): {}", token_owner_account.key());
    msg!("  [3] authority (pool PDA): {}", pool_authority.key());

    invoke_signed(&instruction, &account_infos, &[&signer_seeds[..]])?;

    Ok(())
}

pub fn is_supported_mint(mint_account: &InterfaceAccount<Mint>) -> Result<bool> {
    let mint_info = mint_account.to_account_info();
    if *mint_info.owner == Token::id() {
        return Ok(true);
    }

    if spl_token_2022::native_mint::check_id(&mint_account.key()) {
        return Err(PoolError::UnsupportNativeMintToken2022.into());
    }

    let mint_data = mint_info.try_borrow_data()?;
    let mint = StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&mint_data)?;
    let extensions = mint.get_extension_types()?;
    for e in extensions {
        if
            e != ExtensionType::TransferFeeConfig &&
            e != ExtensionType::MetadataPointer &&
            e != ExtensionType::TokenMetadata &&
            e != ExtensionType::TransferHook
        {
            return Ok(false);
        }
    }
    Ok(true)
}

pub fn is_token_badge_initialized<'c: 'info, 'info>(mint: Pubkey, token_badge: &'c AccountInfo<'info>) -> Result<bool> {
    let token_badge: Account<'_, TokenBadge> = Account::try_from(token_badge)?;
    Ok(token_badge.token_mint == mint)
}

pub fn update_account_lamports_to_minimum_balance<'info>(
    account: AccountInfo<'info>,
    payer: AccountInfo<'info>,
    system_program: AccountInfo<'info>
) -> Result<()> {
    let minimum_balance = Rent::get()?.minimum_balance(account.data_len());
    let current_lamport = account.get_lamports();
    if minimum_balance > current_lamport {
        let extra_lamports = minimum_balance.safe_sub(current_lamport)?;
        invoke(&transfer(payer.key, account.key, extra_lamports), &[payer, account, system_program])?;
    }

    Ok(())
}

/// Check if a mint has transfer hook extension
pub fn has_transfer_hook<'info>(token_mint: &InterfaceAccount<'info, Mint>) -> Result<Option<Pubkey>> {
    let mint_info = token_mint.to_account_info();

    // Legacy SPL Token - no hooks
    if *mint_info.owner == Token::id() {
        return Ok(None);
    }

    let mint_data = mint_info.try_borrow_data()?;
    let mint = StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&mint_data)?;

    if let Ok(transfer_hook_config) = mint.get_extension::<TransferHook>() {
        if let Some(hook_program_id) = Option::<Pubkey>::from(transfer_hook_config.program_id) {
            return Ok(Some(hook_program_id));
        }
    }

    Ok(None)
}

/// Validate that a hook program is whitelisted
pub fn validate_hook_program<'a>(hook_program_id: &Pubkey, hook_registry: &'a AccountInfo<'a>) -> Result<()> {
    use crate::state::HookRegistry;

    let loader: anchor_lang::accounts::account_loader::AccountLoader<
        'a,
        HookRegistry
    > = anchor_lang::accounts::account_loader::AccountLoader
        ::try_from(hook_registry)
        .map_err(|_| crate::PoolError::InvalidHookRegistry)?;
    let hook_registry = loader.load()?;

    require!(hook_registry.is_program_whitelisted(hook_program_id), crate::PoolError::UnauthorizedHookProgram);

    Ok(())
}

/// Transfer from user with hook support
pub fn transfer_from_user_with_hooks<'info>(
    authority: &Signer<'info>,
    token_mint: &InterfaceAccount<'info, Mint>,
    token_owner_account: &InterfaceAccount<'info, TokenAccount>,
    destination_token_account: &InterfaceAccount<'info, TokenAccount>,
    token_program: &Interface<'info, TokenInterface>,
    amount: u64,
    remaining_accounts: &[AccountInfo<'info>]
) -> Result<()> {
    // Check if token has transfer hook
    if let Some(hook_program_id) = has_transfer_hook(token_mint)? {
        msg!("🔗 Token has transfer hook: {}", hook_program_id);

        // Whitelist validation is done in instruction layer (swap), not here

        // 🛡️ HOOK EXECUTION: Use hook-aware transfer with enhanced error handling
        match
            transfer_with_hook_support(
                authority.to_account_info(),
                token_mint,
                token_owner_account,
                destination_token_account,
                token_program,
                amount,
                remaining_accounts
            )
        {
            Ok(()) => {
                msg!("✅ Hook-enabled transfer completed successfully");
                Ok(())
            }
            Err(e) => {
                msg!("❌ Hook execution failed: {:?}", e);
                // Enhanced error handling for hook failures
                if e.to_string().contains("insufficient compute units") {
                    return Err(crate::PoolError::HookExecutionTimeout.into());
                } else if e.to_string().contains("invalid account") {
                    return Err(crate::PoolError::HookAccountResolutionFailed.into());
                } else {
                    return Err(crate::PoolError::HookExecutionFailed.into());
                }
            }
        }
    } else {
        // Use standard transfer (backward compatibility)
        transfer_from_user(authority, token_mint, token_owner_account, destination_token_account, token_program, amount)
    }
}

/// Transfer from pool with hook support
pub fn transfer_from_pool_with_hooks<'info>(
    pool_authority: AccountInfo<'info>,
    token_mint: &InterfaceAccount<'info, Mint>,
    token_vault: &InterfaceAccount<'info, TokenAccount>,
    token_owner_account: &InterfaceAccount<'info, TokenAccount>,
    token_program: &Interface<'info, TokenInterface>,
    amount: u64,
    remaining_accounts: &[AccountInfo<'info>]
) -> Result<()> {
    // Check if token has transfer hook
    if let Some(hook_program_id) = has_transfer_hook(token_mint)? {
        msg!("🔗 Token has transfer hook: {}", hook_program_id);

        // Whitelist validation is done in instruction layer (swap), not here

        // 🛡️ HOOK EXECUTION: Use hook-aware transfer with enhanced error handling
        match
            transfer_with_hook_support_signed(
                pool_authority,
                token_mint,
                token_vault,
                token_owner_account,
                token_program,
                amount,
                remaining_accounts
            )
        {
            Ok(()) => {
                msg!("✅ Hook-enabled pool transfer completed successfully");
                Ok(())
            }
            Err(e) => {
                msg!("❌ Hook execution failed in pool transfer: {:?}", e);
                // Enhanced error handling for hook failures
                if e.to_string().contains("insufficient compute units") {
                    return Err(crate::PoolError::HookExecutionTimeout.into());
                } else if e.to_string().contains("invalid account") {
                    return Err(crate::PoolError::HookAccountResolutionFailed.into());
                } else {
                    return Err(crate::PoolError::HookExecutionFailed.into());
                }
            }
        }
    } else {
        // Use standard transfer (backward compatibility)
        transfer_from_pool(pool_authority, token_mint, token_vault, token_owner_account, token_program, amount)
    }
}

/// Core hook-aware transfer function
fn transfer_with_hook_support<'info>(
    authority: AccountInfo<'info>,
    token_mint: &InterfaceAccount<'info, Mint>,
    source_account: &InterfaceAccount<'info, TokenAccount>,
    destination_account: &InterfaceAccount<'info, TokenAccount>,
    token_program: &Interface<'info, TokenInterface>,
    amount: u64,
    remaining_accounts: &[AccountInfo<'info>]
) -> Result<()> {
    // Build the instruction with extra accounts for hooks
    let mut instruction = spl_token_2022::instruction::transfer_checked(
        token_program.key,
        &source_account.key(),
        &token_mint.key(),
        &destination_account.key(),
        &authority.key(),
        &[], // signers - will be handled by invoke_signed if needed
        amount,
        token_mint.decimals
    )?;

    // Build complete account list
    let mut account_infos = vec![
        source_account.to_account_info(),
        token_mint.to_account_info(),
        destination_account.to_account_info(),
        authority.clone()
    ];
    // Prefer correct ordering: [extra_meta_for_this_mint, hook_program, ...rest]
    if let Some(hook_program_id) = has_transfer_hook(token_mint)? {
        // extra-account-metas PDA for this mint under hook program
        let (expected_meta, _bump) = Pubkey::find_program_address(
            &[b"extra-account-metas", token_mint.key().as_ref()],
            &hook_program_id
        );
        // push extra meta if provided
        if let Some(ai) = remaining_accounts.iter().find(|ai| ai.key() == expected_meta) {
            instruction.accounts.push(AccountMeta::new_readonly(ai.key(), false));
            account_infos.push(ai.clone());
        }
        // push hook program account if provided
        if let Some(ai) = remaining_accounts.iter().find(|ai| ai.key() == hook_program_id) {
            instruction.accounts.push(AccountMeta::new_readonly(ai.key(), false));
            account_infos.push(ai.clone());
        }
    }
    // Append all other remaining accounts (skip ones we already added)
    for ai in remaining_accounts.iter() {
        if !account_infos.iter().any(|x| x.key() == ai.key()) {
            instruction.accounts.push(AccountMeta::new_readonly(ai.key(), false));
            account_infos.push(ai.clone());
        }
    }

    // Log CPI accounts for debugging (hook-aware transfer)
    msg!("🔁 CPI transfer_checked (with hook support)");
    msg!("  [0] source_token: {}", source_account.key());
    msg!("  [1] mint: {}", token_mint.key());
    msg!("  [2] destination_token: {}", destination_account.key());
    msg!("  [3] authority: {}", authority.key());
    msg!("  (+{}) extra accounts passed for hook", remaining_accounts.len());
    for (i, acc) in remaining_accounts.iter().enumerate() {
        msg!("    [{}] extra: {}", i + 4, acc.key());
    }
    msg!("🔄 Executing transfer with {} accounts", account_infos.len());

    // Execute the transfer
    invoke(&instruction, &account_infos)?;

    Ok(())
}

/// Hook-aware transfer with signature (for pool authority)
fn transfer_with_hook_support_signed<'info>(
    authority: AccountInfo<'info>,
    token_mint: &InterfaceAccount<'info, Mint>,
    source_account: &InterfaceAccount<'info, TokenAccount>,
    destination_account: &InterfaceAccount<'info, TokenAccount>,
    token_program: &Interface<'info, TokenInterface>,
    amount: u64,
    remaining_accounts: &[AccountInfo<'info>]
) -> Result<()> {
    let signer_seeds = pool_authority_seeds!();

    // Build the instruction with extra accounts for hooks
    let mut instruction = spl_token_2022::instruction::transfer_checked(
        token_program.key,
        &source_account.key(),
        &token_mint.key(),
        &destination_account.key(),
        &authority.key(),
        &[], // signers - handled by signer_seeds
        amount,
        token_mint.decimals
    )?;

    // Build complete account list
    let mut account_infos = vec![
        source_account.to_account_info(),
        token_mint.to_account_info(),
        destination_account.to_account_info(),
        authority.clone()
    ];
    // Prefer correct ordering: [extra_meta_for_this_mint, hook_program, ...rest]
    if let Some(hook_program_id) = has_transfer_hook(token_mint)? {
        let (expected_meta, _bump) = Pubkey::find_program_address(
            &[b"extra-account-metas", token_mint.key().as_ref()],
            &hook_program_id
        );
        if let Some(ai) = remaining_accounts.iter().find(|ai| ai.key() == expected_meta) {
            instruction.accounts.push(AccountMeta::new_readonly(ai.key(), false));
            account_infos.push(ai.clone());
        }
        if let Some(ai) = remaining_accounts.iter().find(|ai| ai.key() == hook_program_id) {
            instruction.accounts.push(AccountMeta::new_readonly(ai.key(), false));
            account_infos.push(ai.clone());
        }
    }
    for ai in remaining_accounts.iter() {
        if !account_infos.iter().any(|x| x.key() == ai.key()) {
            instruction.accounts.push(AccountMeta::new_readonly(ai.key(), false));
            account_infos.push(ai.clone());
        }
    }

    // Log CPI accounts for debugging (hook-aware transfer, signed)
    msg!("🔁 CPI transfer_checked (with hook support, signed)");
    msg!("  [0] source_token: {}", source_account.key());
    msg!("  [1] mint: {}", token_mint.key());
    msg!("  [2] destination_token: {}", destination_account.key());
    msg!("  [3] authority: {}", authority.key());
    msg!("  (+{}) extra accounts passed for hook", remaining_accounts.len());
    for (i, acc) in remaining_accounts.iter().enumerate() {
        msg!("    [{}] extra: {}", i + 4, acc.key());
    }
    msg!("🔄 Executing signed transfer with {} accounts", account_infos.len());

    // Execute the transfer with signature
    invoke_signed(&instruction, &account_infos, &[&signer_seeds[..]])?;

    Ok(())
}

// helper functions removed; client must pass required accounts
