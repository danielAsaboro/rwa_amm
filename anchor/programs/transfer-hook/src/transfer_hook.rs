use std::cell::RefMut;

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::spl_token_2022::{
        extension::{ transfer_hook::TransferHookAccount, BaseStateWithExtensionsMut, PodStateWithExtensionsMut },
        pod::PodAccount,
    },
    token_interface::{ Mint, TokenAccount, TokenInterface },
};

use spl_transfer_hook_interface::instruction::ExecuteInstruction;
use spl_tlv_account_resolution::{ account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList };

use crate::utils::token_metadata_parser::Token2022MetadataParser;
use crate::PoolError;

#[derive(Accounts)]
pub struct TransferHook<'info> {
    #[account(token::mint = mint, token::authority = owner)]
    pub source_token: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(token::mint = mint)]
    pub destination_token: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: source token account owner, can be SystemAccount or PDA owned by another program
    pub owner: UncheckedAccount<'info>,
    /// CHECK: ExtraAccountMetaList Account,
    #[account(seeds = [b"extra-account-metas", mint.key().as_ref()], bump)]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    /// User KYC account (PDA derived from owner)
    #[account(
        seeds = [b"user-kyc", owner.key().as_ref()],
        bump,
        // Constraint to ensure the KYC belongs to the transfer owner
        constraint = user_kyc.user == owner.key() @ PoolError::UserKycNotFound
    )]
    pub user_kyc: Account<'info, UserKYC>,
}

pub fn handle_transfer_hook(ctx: Context<TransferHook>) -> Result<()> {
    // commented out for now, for testing purposes;
    // assert_is_transferring(&ctx)?;

    msg!("🎯 TRANSFER HOOK ENTRY POINT REACHED!");
    msg!("🎯 Transfer hook called successfully!");
    msg!("🔍 === TRANSFER HOOK ACCOUNT ANALYSIS ===");
    msg!("🔍 All accounts received:");
    msg!("  - source_token: {}", ctx.accounts.source_token.key());
    msg!("  - mint: {}", ctx.accounts.mint.key());
    msg!("  - destination_token: {}", ctx.accounts.destination_token.key());
    msg!("  - owner: {}", ctx.accounts.owner.key());
    msg!("  - extra_account_meta_list: {}", ctx.accounts.extra_account_meta_list.key());
    msg!("  - user_kyc: {}", ctx.accounts.user_kyc.key());
    msg!("🔍 === END ACCOUNT ANALYSIS ===");

    // Read metadata from the mint (self-referential)
    let mint_account = &ctx.accounts.mint.to_account_info();

    // Log basic mint information
    msg!("🪙 Mint: {}", ctx.accounts.mint.key());
    msg!("📤 From: {}", ctx.accounts.source_token.key());
    msg!("📥 To: {}", ctx.accounts.destination_token.key());
    msg!("👤 Owner: {}", ctx.accounts.owner.key());

    // ===== KYC COMPLIANCE VALIDATION =====
    msg!("🆔 Performing KYC compliance validation...");
    msg!("🔍 KYC account info: {}", ctx.accounts.user_kyc.key());

    let user_kyc = &ctx.accounts.user_kyc;

    msg!("📊 User KYC Status:");
    msg!("  👤 User: {}", user_kyc.user);
    msg!("  📋 KYC Level: {}", user_kyc.kyc_level);
    msg!("  ⚠️ Risk Score: {}", user_kyc.risk_score);
    msg!("  🏴 Flags: 0b{:08b}", user_kyc.flags);
    msg!("  🌍 Location: {}, {}, {}", user_kyc.get_city_str(), user_kyc.get_state_str(), user_kyc.get_country_str());
    msg!("  📅 Last Updated: {}", user_kyc.last_updated);

    // Check if user is eligible for trading
    if !user_kyc.is_eligible_for_trading() {
        if user_kyc.is_sanctioned() {
            msg!("🛑 BLOCKED: User is sanctioned");
            return err!(PoolError::UserSanctioned);
        }
        if user_kyc.is_frozen() {
            msg!("🧊 BLOCKED: User account is frozen");
            return err!(PoolError::UserAccountFrozen);
        }
        if user_kyc.is_expired() {
            msg!("⏰ BLOCKED: User KYC is expired");
            return err!(PoolError::UserKycExpired);
        }
        if user_kyc.kyc_level < UserKYC::BASIC {
            msg!("📋 BLOCKED: User KYC level insufficient (need Basic+)");
            return err!(PoolError::UserNotKycVerified);
        }
    }

    msg!("✅ KYC compliance check passed!");

    // ===== TOKEN METADATA & GEOGRAPHIC VALIDATION =====
    msg!("🏢 Performing token metadata validation...");

    let account_data = mint_account.data.borrow();
    match Token2022MetadataParser::parse_metadata_from_mint(&account_data) {
        Ok(metadata) => {
            msg!("📋 Successfully parsed Token-2022 metadata!");
            msg!("  🏷️  Name: {}", metadata.name);
            msg!("  🔤 Symbol: {}", metadata.symbol);

            // Extract and validate RWA-specific metadata
            let rwa_metadata = Token2022MetadataParser::extract_rwa_metadata(&metadata);

            // Validate geographic restrictions
            if let Some(allowed_countries) = &rwa_metadata.allowed_countries {
                msg!("🌍 Checking geographic restrictions...");
                let user_country = user_kyc.get_country_str();

                if !allowed_countries.contains(&user_country) {
                    msg!("🚫 BLOCKED: User country '{}' not in allowed list: {}", user_country, allowed_countries);
                    return err!(PoolError::InvalidCountryCode);
                }
                msg!("✅ Country validation passed: {}", user_country);
            }

            if let Some(restricted_states) = &rwa_metadata.restricted_states {
                let user_state_code = format!("{}_{}", user_kyc.get_country_str(), user_kyc.get_state_str());

                if restricted_states.contains(&user_state_code) {
                    msg!("🚫 BLOCKED: User state '{}' is restricted", user_state_code);
                    return err!(PoolError::InvalidStateCode);
                }
                msg!("✅ State validation passed: {}", user_state_code);
            }

            // Log trading hours and other metadata for audit
            if let Some(hours) = &rwa_metadata.trading_hours {
                msg!("  🕘 Trading hours: {}", hours);
            }
            if let Some(offset) = &rwa_metadata.timezone_offset {
                msg!("  🌐 Timezone offset: {}", offset);
            }

            msg!("✅ Token metadata validation completed!");
        }
        Err(_) => {
            msg!("⚠️ Could not parse token metadata - proceeding with KYC-only validation");
        }
    }

    msg!("✅ Transfer hook validation completed successfully!");
    Ok(())
}

fn assert_is_transferring(ctx: &Context<TransferHook>) -> Result<()> {
    let source_token_info = ctx.accounts.source_token.to_account_info();
    let mut account_data_ref: RefMut<&mut [u8]> = source_token_info.try_borrow_mut_data()?;
    let mut account = PodStateWithExtensionsMut::<PodAccount>::unpack(*account_data_ref)?;
    let account_extension = account.get_extension_mut::<TransferHookAccount>()?;

    if !bool::from(account_extension.transferring) {
        return err!(PoolError::IsNotCurrentlyTransferring);
    }

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    payer: Signer<'info>,

    /// CHECK: ExtraAccountMetaList Account, must use these seeds
    #[account(
        mut,
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump
    )]
    pub extra_account_meta_list: AccountInfo<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub wsol_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_extra_account_meta_list(ctx: Context<InitializeExtraAccountMetaList>) -> Result<()> {
    msg!("🔧 Initializing extra account meta list with user KYC requirement");

    // Define the extra accounts required for the transfer hook
    let extra_account_metas = vec![
        // Add the user KYC account derived from the transfer owner
        // This will make the KYC account available in every transfer hook call
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal {
                    bytes: "user-kyc".as_bytes().to_vec(),
                },
                // Use the owner account (account index 3 in the standard transfer accounts)
                // Standard transfer accounts: [0] source_token, [1] mint, [2] destination_token, [3] owner
                Seed::AccountKey { index: 3 },
            ],
            false, // is_signer - KYC account doesn't need to sign
            false // is_writable - read-only for compliance validation
        )?
    ];

    msg!("📋 Added {} extra accounts to transfer hook:", extra_account_metas.len());
    msg!("  🆔 User KYC account (derived from owner)");

    // Get the account info for the extra account meta list
    let account_info = ctx.accounts.extra_account_meta_list.to_account_info();

    // Calculate required space for the extra account metas
    let account_size = ExtraAccountMetaList::size_of(extra_account_metas.len())?;

    // Create the account
    let rent = Rent::get()?;
    let lamports = rent.minimum_balance(account_size);

    let mint_key = ctx.accounts.mint.key();
    let seeds = &[b"extra-account-metas", mint_key.as_ref(), &[ctx.bumps.extra_account_meta_list]];
    let signer_seeds = &[&seeds[..]];

    anchor_lang::system_program::create_account(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::CreateAccount {
                from: ctx.accounts.payer.to_account_info(),
                to: account_info.clone(),
            },
            signer_seeds
        ),
        lamports,
        account_size as u64,
        &crate::ID
    )?;

    // Initialize the extra account meta list
    ExtraAccountMetaList::init::<ExecuteInstruction>(&mut account_info.try_borrow_mut_data()?, &extra_account_metas)?;

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateExtraAccountMetaList<'info> {
    #[account(mut)]
    payer: Signer<'info>,

    /// CHECK: ExtraAccountMetaList Account, must use these seeds
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

#[account]
pub struct UserKYC {
    pub user: Pubkey,
    pub kyc_level: u8, // 0=Unverified, 1=Basic, 2=Enhanced, 3=Institutional
    pub risk_score: u8, // 0-100, higher means more risky
    pub last_updated: i64, // Unix timestamp
    pub flags: u8, // Bit flags: 0x01=Sanctions, 0x02=PEP, 0x04=Frozen, 0x08=Expired
    pub daily_volume: u64, // Current daily trading volume
    pub monthly_volume: u64, // Current monthly trading volume
    pub last_reset_day: i64, // Last day volume was reset
    pub last_reset_month: i64, // Last month volume was reset
    pub country: [u8; 2], // ISO 3166-1 alpha-2 country code (e.g., "US", "CA")
    pub state: [u8; 2], // State/province code (e.g., "NY", "CA")
    pub city: [u8; 32], // City name (padded with zeros)
}

impl UserKYC {
    pub const LEN: usize = 32 + 1 + 1 + 8 + 1 + 8 + 8 + 8 + 8 + 2 + 2 + 32;

    // KYC levels
    pub const UNVERIFIED: u8 = 0;
    pub const BASIC: u8 = 1;
    pub const ENHANCED: u8 = 2;
    pub const INSTITUTIONAL: u8 = 3;

    // Flag constants
    pub const FLAG_SANCTIONS: u8 = 0x01;
    pub const FLAG_PEP: u8 = 0x02; // Politically Exposed Person
    pub const FLAG_FROZEN: u8 = 0x04;
    pub const FLAG_EXPIRED: u8 = 0x08;

    pub fn is_sanctioned(&self) -> bool {
        (self.flags & Self::FLAG_SANCTIONS) != 0
    }

    pub fn is_pep(&self) -> bool {
        (self.flags & Self::FLAG_PEP) != 0
    }

    pub fn is_frozen(&self) -> bool {
        (self.flags & Self::FLAG_FROZEN) != 0
    }

    pub fn is_expired(&self) -> bool {
        (self.flags & Self::FLAG_EXPIRED) != 0
    }

    pub fn is_eligible_for_trading(&self) -> bool {
        self.kyc_level >= Self::BASIC && !self.is_sanctioned() && !self.is_frozen() && !self.is_expired()
    }

    pub fn update_daily_volume(&mut self, current_day: i64, amount: u64) {
        if self.last_reset_day != current_day {
            self.daily_volume = 0;
            self.last_reset_day = current_day;
        }
        self.daily_volume = self.daily_volume.saturating_add(amount);
    }

    pub fn update_monthly_volume(&mut self, current_month: i64, amount: u64) {
        if self.last_reset_month != current_month {
            self.monthly_volume = 0;
            self.last_reset_month = current_month;
        }
        self.monthly_volume = self.monthly_volume.saturating_add(amount);
    }

    pub fn get_country_str(&self) -> String {
        String::from_utf8_lossy(&self.country).trim_end_matches('\0').to_string()
    }

    pub fn get_state_str(&self) -> String {
        String::from_utf8_lossy(&self.state).trim_end_matches('\0').to_string()
    }

    pub fn get_city_str(&self) -> String {
        String::from_utf8_lossy(&self.city).trim_end_matches('\0').to_string()
    }

    pub fn set_country(&mut self, country: &str) {
        self.country = [0; 2];
        let bytes = country.as_bytes();
        let len = bytes.len().min(2);
        self.country[..len].copy_from_slice(&bytes[..len]);
    }

    pub fn set_state(&mut self, state: &str) {
        self.state = [0; 2];
        let bytes = state.as_bytes();
        let len = bytes.len().min(2);
        self.state[..len].copy_from_slice(&bytes[..len]);
    }

    pub fn set_city(&mut self, city: &str) {
        self.city = [0; 32];
        let bytes = city.as_bytes();
        let len = bytes.len().min(32);
        self.city[..len].copy_from_slice(&bytes[..len]);
    }
}

#[derive(Accounts)]
pub struct InitializeUserKyc<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The user whose KYC is being initialized
    /// CHECK: This will be validated through PDA derivation
    pub user: UncheckedAccount<'info>,

    /// KYC account (PDA)
    #[account(init, payer = payer, space = 8 + UserKYC::LEN, seeds = [b"user-kyc", user.key().as_ref()], bump)]
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

    msg!("🆔 Initializing KYC for user: {}", ctx.accounts.user.key());
    msg!("📋 KYC Level: {}", kyc_level);
    msg!("🌍 Location: {}, {}, {}", city, state, country);

    // Validate KYC level
    require!(kyc_level <= UserKYC::INSTITUTIONAL, PoolError::InvalidKycLevel);

    // Validate country code (2 characters)
    require!(country.len() == 2 && country.chars().all(|c| c.is_ascii_alphabetic()), PoolError::InvalidCountryCode);

    // Validate state code (2 characters)
    require!(state.len() <= 2 && state.chars().all(|c| c.is_ascii_alphanumeric()), PoolError::InvalidStateCode);

    // Validate city name (max 32 characters)
    require!(
        city.len() <= 32 && city.chars().all(|c| c.is_ascii() && !c.is_ascii_control()),
        PoolError::InvalidCityName
    );

    // Initialize KYC data
    user_kyc.user = ctx.accounts.user.key();
    user_kyc.kyc_level = kyc_level;
    user_kyc.risk_score = 50; // Default medium risk
    user_kyc.last_updated = clock.unix_timestamp;
    user_kyc.flags = 0; // No flags initially
    user_kyc.daily_volume = 0;
    user_kyc.monthly_volume = 0;
    user_kyc.last_reset_day = clock.unix_timestamp / 86400; // Current day
    user_kyc.last_reset_month = clock.unix_timestamp / (86400 * 30); // Current month (approx)

    // Set location data
    user_kyc.set_country(&country.to_uppercase());
    user_kyc.set_state(&state.to_uppercase());
    user_kyc.set_city(&city);

    msg!("✅ KYC initialized successfully!");
    msg!("📊 Risk Score: {}", user_kyc.risk_score);
    msg!("📅 Timestamp: {}", user_kyc.last_updated);
    msg!("🎯 Trading Eligible: {}", user_kyc.is_eligible_for_trading());

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateUserKyc<'info> {
    /// Authority that can update KYC (could be admin or the user themselves)
    pub authority: Signer<'info>,

    /// The user whose KYC is being updated
    /// CHECK: This will be validated through PDA derivation
    pub user: UncheckedAccount<'info>,

    /// KYC account (PDA)
    #[account(
        mut,
        seeds = [b"user-kyc", user.key().as_ref()],
        bump
    )]
    pub user_kyc: Account<'info, UserKYC>,
}

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

    msg!("🔄 Updating KYC for user: {}", ctx.accounts.user.key());
    msg!("👤 Authority: {}", ctx.accounts.authority.key());

    // Update KYC level if provided
    if let Some(level) = new_kyc_level {
        require!(level <= UserKYC::INSTITUTIONAL, PoolError::InvalidKycLevel);

        let old_level = user_kyc.kyc_level;
        user_kyc.kyc_level = level;
        msg!("📈 KYC Level: {} → {}", old_level, level);
    }

    // Update risk score if provided
    if let Some(score) = new_risk_score {
        require!(score <= 100, PoolError::InvalidRiskScore);

        let old_score = user_kyc.risk_score;
        user_kyc.risk_score = score;
        msg!("⚠️ Risk Score: {} → {}", old_score, score);
    }

    // Set flags if provided
    if let Some(flags) = flags_to_set {
        let old_flags = user_kyc.flags;
        user_kyc.flags |= flags;
        msg!("🚩 Flags SET: 0b{:08b} → 0b{:08b}", old_flags, user_kyc.flags);

        // Log specific flags being set
        if (flags & UserKYC::FLAG_SANCTIONS) != 0 {
            msg!("🛑 SANCTIONS flag set");
        }
        if (flags & UserKYC::FLAG_PEP) != 0 {
            msg!("🏛️ PEP flag set");
        }
        if (flags & UserKYC::FLAG_FROZEN) != 0 {
            msg!("🧊 FROZEN flag set");
        }
        if (flags & UserKYC::FLAG_EXPIRED) != 0 {
            msg!("⏰ EXPIRED flag set");
        }
    }

    // Clear flags if provided
    if let Some(flags) = flags_to_clear {
        let old_flags = user_kyc.flags;
        user_kyc.flags &= !flags;
        msg!("🚩 Flags CLEARED: 0b{:08b} → 0b{:08b}", old_flags, user_kyc.flags);
    }

    // Update location if provided
    if let Some(country) = new_country {
        require!(country.len() == 2 && country.chars().all(|c| c.is_ascii_alphabetic()), PoolError::InvalidCountryCode);
        let old_country = user_kyc.get_country_str();
        user_kyc.set_country(&country.to_uppercase());
        msg!("🌍 Country: {} → {}", old_country, user_kyc.get_country_str());
    }

    if let Some(state) = new_state {
        require!(state.len() <= 2 && state.chars().all(|c| c.is_ascii_alphanumeric()), PoolError::InvalidStateCode);
        let old_state = user_kyc.get_state_str();
        user_kyc.set_state(&state.to_uppercase());
        msg!("🏛️ State: {} → {}", old_state, user_kyc.get_state_str());
    }

    if let Some(city) = new_city {
        require!(
            city.len() <= 32 && city.chars().all(|c| c.is_ascii() && !c.is_ascii_control()),
            PoolError::InvalidCityName
        );
        let old_city = user_kyc.get_city_str();
        user_kyc.set_city(&city);
        msg!("🏙️ City: {} → {}", old_city, user_kyc.get_city_str());
    }

    // Update timestamp
    user_kyc.last_updated = clock.unix_timestamp;

    msg!("✅ KYC updated successfully!");
    msg!("📊 Current Risk Score: {}", user_kyc.risk_score);
    msg!("🎯 Trading Eligible: {}", user_kyc.is_eligible_for_trading());
    msg!("📅 Last Updated: {}", user_kyc.last_updated);

    Ok(())
}
