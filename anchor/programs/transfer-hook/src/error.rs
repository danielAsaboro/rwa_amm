use anchor_lang::prelude::*;

#[error_code]
pub enum CustomError {
    #[msg("User KYC not found")] UserKycNotFound,
    #[msg("User not eligible to trade")] UserNotEligible,
    #[msg("User sanctioned")] UserSanctioned,
    #[msg("User account frozen")] UserAccountFrozen,
    #[msg("User not KYC verified")] UserNotKycVerified,
    #[msg("Invalid KYC level")] InvalidKycLevel,
    #[msg("Invalid country code")] InvalidCountryCode,
    #[msg("Invalid state code")] InvalidStateCode,
    #[msg("Invalid city name")] InvalidCityName,
}
