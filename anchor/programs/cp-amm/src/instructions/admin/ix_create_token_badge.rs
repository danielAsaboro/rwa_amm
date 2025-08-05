use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::{
    assert_eq_admin, constants::seeds::TOKEN_BADGE_PREFIX, state::TokenBadge,
    token::is_supported_mint, EvtCreateTokenBadge, PoolError,
};

#[event_cpi]
#[derive(Accounts)]
pub struct CreateTokenBadgeCtx<'info> {
    #[account(
        init,
        payer = admin,
        seeds = [
            TOKEN_BADGE_PREFIX.as_ref(),
            token_mint.key().as_ref(),
        ],
        bump,
        space = 8 + 32 + 32 + 1 + 8 + 8 + 1 + 32 + 48 // TokenBadge space calculation
    )]
    pub token_badge: Account<'info, TokenBadge>,

    pub token_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        constraint = assert_eq_admin(admin.key()) @ PoolError::InvalidAdmin,
    )]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_create_token_badge(ctx: Context<CreateTokenBadgeCtx>) -> Result<()> {
    require!(
        !is_supported_mint(&ctx.accounts.token_mint)?,
        PoolError::CannotCreateTokenBadgeOnSupportedMint
    );
    ctx.accounts.token_badge.initialize(ctx.accounts.token_mint.key())?;

    emit_cpi!(EvtCreateTokenBadge {
        token_mint: ctx.accounts.token_mint.key(),
    });

    Ok(())
}
