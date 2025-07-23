use anchor_lang::prelude::*;
use anchor_spl::{ associated_token::AssociatedToken, token_interface::{ Mint, TokenAccount, TokenInterface } };
use spl_transfer_hook_interface::instruction::ExecuteInstruction;
use spl_tlv_account_resolution::{ account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList };

use crate::{ error::CustomError, state::{ UserKYC, Token2022MetadataParser } };

#[derive(Accounts)]
pub struct TransferHook<'info> {
    #[account(token::mint = mint, token::authority = owner)]
    pub source_token: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(token::mint = mint)]
    pub destination_token: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: owner can be system account or PDA
    pub owner: UncheckedAccount<'info>,
    /// CHECK: ExtraAccountMetaList PDA
    #[account(seeds = [b"extra-account-metas", mint.key().as_ref()], bump)]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    /// PDA user KYC, must belong to owner
    #[account(seeds = [b"user-kyc", owner.key().as_ref()], bump, constraint = user_kyc.user == owner.key() @ CustomError::UserKycNotFound)]
    pub user_kyc: Account<'info, UserKYC>,
}

pub fn handle_transfer_hook(ctx: Context<TransferHook>) -> Result<()> {
    let user_kyc = &ctx.accounts.user_kyc;

    if user_kyc.is_sanctioned() {
        return err!(CustomError::UserSanctioned);
    }
    if user_kyc.is_frozen() {
        return err!(CustomError::UserAccountFrozen);
    }
    if user_kyc.kyc_level < UserKYC::BASIC {
        return err!(CustomError::UserNotKycVerified);
    }
    if user_kyc.is_expired() {
        return err!(CustomError::UserNotEligible);
    }

    let mint_ai = ctx.accounts.mint.to_account_info();
    let data = mint_ai.data.borrow();
    if let Ok(meta) = Token2022MetadataParser::parse_metadata_from_mint(&data) {
        let rwa = Token2022MetadataParser::extract_rwa_metadata(&meta);
        if let Some(allowed) = rwa.allowed_countries {
            let uc = user_kyc.get_country_str();
            if !allowed.contains(&uc) {
                return err!(CustomError::InvalidCountryCode);
            }
        }
        if let Some(restricted) = rwa.restricted_states {
            let code = format!("{}_{}", user_kyc.get_country_str(), user_kyc.get_state_str());
            if restricted.contains(&code) {
                return err!(CustomError::InvalidStateCode);
            }
        }
    }
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK
    #[account(mut, seeds = [b"extra-account-metas", mint.key().as_ref()], bump)]
    pub extra_account_meta_list: AccountInfo<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub wsol_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_extra_account_meta_list(ctx: Context<InitializeExtraAccountMetaList>) -> Result<()> {
    let metas = vec![
        ExtraAccountMeta::new_with_seeds(
            &[Seed::Literal { bytes: b"user-kyc".to_vec() }, Seed::AccountKey { index: 3 }],
            false,
            false
        )?
    ];
    let ai = ctx.accounts.extra_account_meta_list.to_account_info();
    let size = ExtraAccountMetaList::size_of(metas.len())?;
    let lamports = Rent::get()?.minimum_balance(size);
    let mint_key = ctx.accounts.mint.key();
    let seeds = &[b"extra-account-metas", mint_key.as_ref(), &[ctx.bumps.extra_account_meta_list]];
    let signer_seeds = &[&seeds[..]];
    anchor_lang::system_program::create_account(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::CreateAccount {
                from: ctx.accounts.payer.to_account_info(),
                to: ai.clone(),
            },
            signer_seeds
        ),
        lamports,
        size as u64,
        &crate::ID
    )?;
    ExtraAccountMetaList::init::<ExecuteInstruction>(&mut ai.try_borrow_mut_data()?, &metas)?;
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK
    #[account(mut, seeds = [b"extra-account-metas", mint.key().as_ref()], bump)]
    pub extra_account_meta_list: AccountInfo<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub wsol_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_update_extra_account_meta_list(_ctx: Context<UpdateExtraAccountMetaList>) -> Result<()> {
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeUserKyc<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK
    pub user: UncheckedAccount<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + crate::state::UserKYC::LEN,
        seeds = [b"user-kyc", user.key().as_ref()],
        bump
    )]
    pub user_kyc: Account<'info, UserKYC>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_user_kyc(
    ctx: Context<InitializeUserKyc>,
    kyc_level: u8,
    country: String,
    state: String,
    city: String
) -> Result<()> {
    let user_kyc = &mut ctx.accounts.user_kyc;
    let clock = Clock::get()?;
    require!(kyc_level <= UserKYC::INSTITUTIONAL, crate::error::CustomError::InvalidKycLevel);
    require!(
        country.len() == 2 && country.chars().all(|c| c.is_ascii_alphabetic()),
        crate::error::CustomError::InvalidCountryCode
    );
    require!(
        state.len() <= 2 && state.chars().all(|c| c.is_ascii_alphanumeric()),
        crate::error::CustomError::InvalidStateCode
    );
    require!(
        city.len() <= 32 && city.chars().all(|c| c.is_ascii() && !c.is_ascii_control()),
        crate::error::CustomError::InvalidCityName
    );
    user_kyc.user = ctx.accounts.user.key();
    user_kyc.kyc_level = kyc_level;
    user_kyc.risk_score = 50;
    user_kyc.last_updated = clock.unix_timestamp;
    user_kyc.flags = 0;
    user_kyc.daily_volume = 0;
    user_kyc.monthly_volume = 0;
    user_kyc.last_reset_day = clock.unix_timestamp / 86400;
    user_kyc.last_reset_month = clock.unix_timestamp / (86400 * 30);
    user_kyc.set_country(&country.to_uppercase());
    user_kyc.set_state(&state.to_uppercase());
    user_kyc.set_city(&city);
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateUserKyc<'info> {
    pub authority: Signer<'info>,
    /// CHECK
    pub user: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"user-kyc", user.key().as_ref()], bump)]
    pub user_kyc: Account<'info, UserKYC>,
}

#[allow(clippy::too_many_arguments)]
pub fn handle_update_user_kyc(
    ctx: Context<UpdateUserKyc>,
    new_kyc_level: Option<u8>,
    new_risk_score: Option<u8>,
    flags_to_set: Option<u8>,
    flags_to_clear: Option<u8>,
    new_country: Option<String>,
    new_state: Option<String>,
    new_city: Option<String>
) -> Result<()> {
    let user_kyc = &mut ctx.accounts.user_kyc;
    let clock = Clock::get()?;
    if let Some(level) = new_kyc_level {
        require!(level <= UserKYC::INSTITUTIONAL, crate::error::CustomError::InvalidKycLevel);
        user_kyc.kyc_level = level;
    }
    if let Some(score) = new_risk_score {
        user_kyc.risk_score = score;
    }
    if let Some(set) = flags_to_set {
        user_kyc.flags |= set;
    }
    if let Some(clear) = flags_to_clear {
        user_kyc.flags &= !clear;
    }
    if let Some(country) = new_country {
        require!(
            country.len() == 2 && country.chars().all(|c| c.is_ascii_alphabetic()),
            crate::error::CustomError::InvalidCountryCode
        );
        user_kyc.set_country(&country.to_uppercase());
    }
    if let Some(state) = new_state {
        require!(
            state.len() <= 2 && state.chars().all(|c| c.is_ascii_alphanumeric()),
            crate::error::CustomError::InvalidStateCode
        );
        user_kyc.set_state(&state.to_uppercase());
    }
    if let Some(city) = new_city {
        require!(
            city.len() <= 32 && city.chars().all(|c| c.is_ascii() && !c.is_ascii_control()),
            crate::error::CustomError::InvalidCityName
        );
        user_kyc.set_city(&city);
    }
    user_kyc.last_updated = clock.unix_timestamp;
    Ok(())
}
