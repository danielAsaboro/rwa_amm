use anchor_lang::prelude::*;
use spl_transfer_hook_interface::instruction::ExecuteInstruction;
use spl_discriminator::SplDiscriminate;

pub mod state;
pub use state::*;
pub mod error;
pub use error::*;
pub mod instructions;
pub use instructions::*;
// Set to your deployed hook program ID
declare_id!("Hos5X6SbGqyDb8FfvRgiDqWpTE9C6FcgAkXrTeryUXwB");

#[program]
pub mod transfer_hook {
    use super::*;

    #[instruction(discriminator = ExecuteInstruction::SPL_DISCRIMINATOR_SLICE)]
    pub fn transfer_hook(ctx: Context<TransferHook>) -> Result<()> {
        handle_transfer_hook(ctx)
    }

    pub fn initialize_extra_account_meta_list(ctx: Context<InitializeExtraAccountMetaList>) -> Result<()> {
        handle_initialize_extra_account_meta_list(ctx)
    }

    pub fn update_extra_account_meta_list(ctx: Context<UpdateExtraAccountMetaList>) -> Result<()> {
        handle_update_extra_account_meta_list(ctx)
    }

    pub fn initialize_user_kyc(
        ctx: Context<InitializeUserKyc>,
        kyc_level: u8,
        country: String,
        state: String,
        city: String
    ) -> Result<()> {
        handle_initialize_user_kyc(ctx, kyc_level, country, state, city)
    }

    pub fn update_user_kyc(
        ctx: Context<UpdateUserKyc>,
        new_kyc_level: Option<u8>,
        new_risk_score: Option<u8>,
        flags_to_set: Option<u8>,
        flags_to_clear: Option<u8>,
        new_country: Option<String>,
        new_state: Option<String>,
        new_city: Option<String>
    ) -> Result<()> {
        handle_update_user_kyc(
            ctx,
            new_kyc_level,
            new_risk_score,
            flags_to_set,
            flags_to_clear,
            new_country,
            new_state,
            new_city
        )
    }
}
