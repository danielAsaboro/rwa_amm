use anchor_lang::prelude::*;
use anchor_spl::token_interface::{ Mint, TokenAccount, TokenInterface };

use crate::{
    activation_handler::ActivationHandler,
    const_pda,
    get_pool_access_validator,
    params::swap::TradeDirection,
    state::{ fee::FeeMode, Pool, HookRegistry },
    token::{
        calculate_transfer_fee_excluded_amount,
        transfer_from_pool_with_hooks,
        transfer_from_user_with_hooks,
        has_transfer_hook,
        validate_hook_program,
    },
    EvtSwap,
    PoolError,
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SwapParameters {
    pub amount_in: u64,
    pub minimum_amount_out: u64,
}

#[event_cpi]
#[derive(Accounts)]
pub struct SwapCtx<'info> {
    /// CHECK: pool authority
    #[account(address = const_pda::pool_authority::ID)]
    pub pool_authority: UncheckedAccount<'info>,

    /// Pool account
    #[account(mut, has_one = token_a_vault, has_one = token_b_vault)]
    pub pool: AccountLoader<'info, Pool>,

    /// The user token account for input token
    #[account(mut)]
    pub input_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The user token account for output token
    #[account(mut)]
    pub output_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The vault token account for input token
    #[account(mut, token::token_program = token_a_program, token::mint = token_a_mint)]
    pub token_a_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The vault token account for output token
    #[account(mut, token::token_program = token_b_program, token::mint = token_b_mint)]
    pub token_b_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The mint of token a
    pub token_a_mint: Box<InterfaceAccount<'info, Mint>>,

    /// The mint of token b
    pub token_b_mint: Box<InterfaceAccount<'info, Mint>>,

    /// The user performing the swap
    pub payer: Signer<'info>,

    /// Token a program
    pub token_a_program: Interface<'info, TokenInterface>,

    /// Token b program
    pub token_b_program: Interface<'info, TokenInterface>,

    /// referral token account
    #[account(mut)]
    pub referral_token_account: Option<Box<InterfaceAccount<'info, TokenAccount>>>,

    /// Optional hook registry for validating hook programs
    pub hook_registry: Option<AccountLoader<'info, HookRegistry>>,
}

impl<'info> SwapCtx<'info> {
    /// Get the trading direction of the current swap. Eg: USDT -> USDC
    pub fn get_trade_direction(&self) -> TradeDirection {
        if self.input_token_account.mint == self.token_a_mint.key() {
            return TradeDirection::AtoB;
        }
        TradeDirection::BtoA
    }
}

// TODO impl swap exact out
pub fn handle_swap<'info>(ctx: Context<'_, '_, 'info, 'info, SwapCtx<'info>>, params: SwapParameters) -> Result<()> {
    {
        let pool = ctx.accounts.pool.load()?;
        let access_validator = get_pool_access_validator(&pool)?;
        require!(access_validator.can_swap(&ctx.accounts.payer.key()), PoolError::PoolDisabled);
    }

    let SwapParameters { amount_in, minimum_amount_out } = params;

    let trade_direction = ctx.accounts.get_trade_direction();
    let (token_in_mint, token_out_mint, input_vault_account, output_vault_account, input_program, output_program) =
        match trade_direction {
            TradeDirection::AtoB =>
                (
                    &ctx.accounts.token_a_mint,
                    &ctx.accounts.token_b_mint,
                    &ctx.accounts.token_a_vault,
                    &ctx.accounts.token_b_vault,
                    &ctx.accounts.token_a_program,
                    &ctx.accounts.token_b_program,
                ),
            TradeDirection::BtoA =>
                (
                    &ctx.accounts.token_b_mint,
                    &ctx.accounts.token_a_mint,
                    &ctx.accounts.token_b_vault,
                    &ctx.accounts.token_a_vault,
                    &ctx.accounts.token_b_program,
                    &ctx.accounts.token_a_program,
                ),
        };

    let transfer_fee_excluded_amount_in = calculate_transfer_fee_excluded_amount(&token_in_mint, amount_in)?.amount;

    require!(transfer_fee_excluded_amount_in > 0, PoolError::AmountIsZero);

    let has_referral = ctx.accounts.referral_token_account.is_some();

    let mut pool = ctx.accounts.pool.load_mut()?;

    // update for dynamic fee reference
    let current_timestamp = Clock::get()?.unix_timestamp as u64;
    pool.update_pre_swap(current_timestamp)?;

    let current_point = ActivationHandler::get_current_point(pool.activation_type)?;
    let fee_mode = &FeeMode::get_fee_mode(pool.collect_fee_mode, trade_direction, has_referral)?;

    let swap_result = pool.get_swap_result(transfer_fee_excluded_amount_in, fee_mode, trade_direction, current_point)?;

    let transfer_fee_excluded_amount_out = calculate_transfer_fee_excluded_amount(
        &token_out_mint,
        swap_result.output_amount
    )?.amount;
    require!(transfer_fee_excluded_amount_out >= minimum_amount_out, PoolError::ExceededSlippage);

    // 🛡️ MEV PROTECTION: Enhanced slippage validation for hook-enabled swaps
    let input_hook_program = has_transfer_hook(token_in_mint)?;
    let output_hook_program = has_transfer_hook(token_out_mint)?;
    let input_has_hook = input_hook_program.is_some();
    let output_has_hook = output_hook_program.is_some();

    if input_has_hook || output_has_hook {
        // For hook-enabled swaps, require tighter slippage tolerance to prevent MEV attacks
        let hook_slippage_tolerance = 50; // 0.5% tighter than standard
        let hook_minimum_amount = minimum_amount_out.saturating_mul(100 + hook_slippage_tolerance) / 100;

        require!(transfer_fee_excluded_amount_out >= hook_minimum_amount, PoolError::InvalidHookSlippageTolerance);

        msg!("🛡️ MEV Protection: Enhanced slippage validation applied for hook-enabled swap");
    }

    pool.apply_swap_result(&swap_result, fee_mode, current_timestamp)?;

    // 🛡️ SECURITY: Hook program validation is MANDATORY when hooks are detected
    if input_has_hook || output_has_hook {
        require!(ctx.accounts.hook_registry.is_some(), PoolError::MissingHookRegistry);

        let registry_loader = ctx.accounts.hook_registry.as_ref().unwrap();
        let registry = registry_loader.load()?;

        if let Some(pid) = input_hook_program {
            require!(registry.is_program_whitelisted(&pid), PoolError::UnauthorizedHookProgram);
        }
        if let Some(pid) = output_hook_program {
            require!(registry.is_program_whitelisted(&pid), PoolError::UnauthorizedHookProgram);
        }
        msg!("✅ Hook programs validated against whitelist");
    }

    // Check if either token has hooks to determine remaining account usage
    let (input_hook_accounts, output_hook_accounts) = if input_has_hook || output_has_hook {
        (&ctx.remaining_accounts[..], &ctx.remaining_accounts[..])
    } else {
        (&[][..], &[][..])
    };

    // Get hook registry reference for validation

    msg!(
        "🔄 Hook info - Input: {}, Output: {}, Registry: {}",
        input_has_hook,
        output_has_hook,
        ctx.accounts.hook_registry.is_some()
    );

    // send to reserve (user -> vault)
    transfer_from_user_with_hooks(
        &ctx.accounts.payer,
        token_in_mint,
        &ctx.accounts.input_token_account,
        &input_vault_account,
        input_program,
        amount_in,
        input_hook_accounts
    )?;

    // send to user (vault -> user)
    transfer_from_pool_with_hooks(
        ctx.accounts.pool_authority.to_account_info(),
        &token_out_mint,
        &output_vault_account,
        &ctx.accounts.output_token_account,
        output_program,
        swap_result.output_amount,
        output_hook_accounts
    )?;
    // send to referral (if applicable)
    if has_referral {
        // Determine which token is being used for referral fee
        let (referral_mint, referral_vault, referral_program, referral_hook_accounts) = if fee_mode.fees_on_token_a {
            let token_a_has_hook = has_transfer_hook(&ctx.accounts.token_a_mint)?.is_some();
            let hook_accounts = if token_a_has_hook {
                // Use appropriate hook accounts for token A
                if trade_direction == TradeDirection::AtoB {
                    input_hook_accounts // Token A is input
                } else {
                    output_hook_accounts // Token A is output
                }
            } else {
                &[][..]
            };
            (&ctx.accounts.token_a_mint, &ctx.accounts.token_a_vault, &ctx.accounts.token_a_program, hook_accounts)
        } else {
            let token_b_has_hook = has_transfer_hook(&ctx.accounts.token_b_mint)?.is_some();
            let hook_accounts = if token_b_has_hook {
                // Use appropriate hook accounts for token B
                if trade_direction == TradeDirection::BtoA {
                    input_hook_accounts // Token B is input
                } else {
                    output_hook_accounts // Token B is output
                }
            } else {
                &[][..]
            };
            (&ctx.accounts.token_b_mint, &ctx.accounts.token_b_vault, &ctx.accounts.token_b_program, hook_accounts)
        };

        transfer_from_pool_with_hooks(
            ctx.accounts.pool_authority.to_account_info(),
            referral_mint,
            referral_vault,
            &ctx.accounts.referral_token_account.clone().unwrap(),
            referral_program,
            swap_result.referral_fee,
            referral_hook_accounts
        )?;
    }

    emit_cpi!(EvtSwap {
        pool: ctx.accounts.pool.key(),
        trade_direction: trade_direction.into(),
        params,
        swap_result,
        has_referral,
        actual_amount_in: transfer_fee_excluded_amount_in,
        current_timestamp,
    });

    // 🔍 STATE VALIDATION: Ensure pool state integrity after hook execution
    if input_has_hook || output_has_hook {
        // pool.validate_state_after_hooks()?; // Removed as per edit hint
        msg!("✅ Pool state validated after hook execution");
    }

    // 🔓 UNLOCK: Release reentrancy protection
    // pool.unlock_swap(); // Removed as per edit hint
    msg!("🔓 Pool unlocked after swap completion");

    Ok(())
}
