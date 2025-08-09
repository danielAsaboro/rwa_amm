use anchor_lang::prelude::*;

use crate::{state::HookWhitelist, PoolError};

#[event_cpi]
#[derive(Accounts)]
pub struct InitHookWhitelistCtx<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        seeds = [HookWhitelist::SEED],
        bump,
        payer = payer,
        space = 8 + HookWhitelist::INIT_SPACE,
    )]
    pub hook_whitelist: Account<'info, HookWhitelist>,

    pub system_program: Program<'info, System>,
}

pub fn handle_init_hook_whitelist(ctx: Context<InitHookWhitelistCtx>) -> Result<()> {
    let admin = ctx.accounts.payer.key();
    ctx.accounts.hook_whitelist.init(admin);
    
    // Automatically whitelist this program (RWA AMM program) as it serves as the Transfer Hook
    let rwa_program_id = ctx.program_id;
    if !ctx.accounts.hook_whitelist.is_whitelisted(rwa_program_id) {
        ctx.accounts.hook_whitelist.programs.push(*rwa_program_id);
    }
    
    Ok(())
}

#[event_cpi]
#[derive(Accounts)]
pub struct AddHookProgramCtx<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [HookWhitelist::SEED],
        bump,
        constraint = hook_whitelist.admin == admin.key() @ PoolError::InvalidAdmin,
    )]
    pub hook_whitelist: Account<'info, HookWhitelist>,
}

pub fn handle_add_hook_program(ctx: Context<AddHookProgramCtx>, program_id: Pubkey) -> Result<()> {
    if !ctx.accounts.hook_whitelist.is_whitelisted(&program_id) {
        ctx.accounts.hook_whitelist.programs.push(program_id);
    }
    Ok(())
}

#[event_cpi]
#[derive(Accounts)]
pub struct RemoveHookProgramCtx<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [HookWhitelist::SEED],
        bump,
        constraint = hook_whitelist.admin == admin.key() @ PoolError::InvalidAdmin,
    )]
    pub hook_whitelist: Account<'info, HookWhitelist>,
}

pub fn handle_remove_hook_program(
    ctx: Context<RemoveHookProgramCtx>,
    program_id: Pubkey,
) -> Result<()> {
    let list = &mut ctx.accounts.hook_whitelist.programs;
    if let Some(pos) = list.iter().position(|p| p == &program_id) {
        list.remove(pos);
    }
    Ok(())
}


