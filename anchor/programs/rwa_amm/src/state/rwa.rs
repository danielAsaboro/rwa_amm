use anchor_lang::prelude::*;

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
}

impl UserKYC {
    pub const LEN: usize = 32 + 1 + 1 + 8 + 1 + 8 + 8 + 8 + 8;

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
        self.flags & Self::FLAG_SANCTIONS != 0
    }

    pub fn is_pep(&self) -> bool {
        self.flags & Self::FLAG_PEP != 0
    }

    pub fn is_frozen(&self) -> bool {
        self.flags & Self::FLAG_FROZEN != 0
    }

    pub fn is_expired(&self) -> bool {
        self.flags & Self::FLAG_EXPIRED != 0
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
}

#[account]
pub struct Whitelist {
    pub mint: Pubkey,
    pub admin: Pubkey,
    pub auto_approval_threshold: u8, // KYC level for auto-approval
    pub user_count: u32,
    // Note: approved_users stored separately as WhitelistEntry accounts
    // to handle dynamic sizing properly
}

impl Whitelist {
    pub const LEN: usize = 32 + 32 + 1 + 4;
}

#[account]
pub struct WhitelistEntry {
    pub whitelist: Pubkey,
    pub user: Pubkey,
    pub added_at: i64,
    pub added_by: Pubkey,
}

impl WhitelistEntry {
    pub const LEN: usize = 32 + 32 + 8 + 32;
}

#[account]
pub struct TransactionLog {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
    pub fees_collected: u64,
    pub kyc_level_from: u8,
    pub kyc_level_to: u8,
}

impl TransactionLog {
    pub const LEN: usize = 32 + 32 + 32 + 8 + 8 + 8 + 1 + 1;
}

#[account]
pub struct TradingHours {
    pub mint: Pubkey,
    pub admin: Pubkey,
    pub timezone_offset: i8, // Hours offset from UTC (-12 to +14)
    pub monday_start: u16,    // Minutes from midnight (0-1439)
    pub monday_end: u16,
    pub tuesday_start: u16,
    pub tuesday_end: u16,
    pub wednesday_start: u16,
    pub wednesday_end: u16,
    pub thursday_start: u16,
    pub thursday_end: u16,
    pub friday_start: u16,
    pub friday_end: u16,
    pub saturday_start: u16,
    pub saturday_end: u16,
    pub sunday_start: u16,
    pub sunday_end: u16,
    pub holidays: Vec<i64>, // Unix timestamps of holidays
}

impl TradingHours {
    // Base size without Vec
    pub const BASE_LEN: usize = 32 + 32 + 1 + 14 * 2;

    pub fn is_trading_allowed(&self, _timestamp: i64) -> bool {
        // TODO: Implement actual trading hours logic
        // This is a stub - would need proper timezone and holiday calculations
        true
    }
}

#[account]
pub struct GeographicRules {
    pub mint: Pubkey,
    pub admin: Pubkey,
    pub allowed_countries: Vec<[u8; 2]>, // ISO 3166-1 alpha-2 country codes
    pub restricted_states: Vec<[u8; 4]>, // Country code + state code
    pub restricted_cities: Vec<String>,  // City names or codes
}

impl GeographicRules {
    pub const BASE_LEN: usize = 32 + 32;

    pub fn is_location_allowed(&self, _country: &str, _state: Option<&str>, _city: Option<&str>) -> bool {
        // TODO: Implement geographic validation logic
        // This is a stub
        true
    }
}

#[account]
pub struct TradeLimits {
    pub mint: Pubkey,
    pub admin: Pubkey,
    pub min_trade_amount: u64,
    pub max_trade_amount: u64,
    pub daily_limit: u64,
    pub monthly_limit: u64,
    pub kyc_basic_daily_limit: u64,
    pub kyc_enhanced_daily_limit: u64,
    pub kyc_institutional_daily_limit: u64,
}

impl TradeLimits {
    pub const LEN: usize = 32 + 32 + 8 * 7;

    pub fn get_daily_limit_for_kyc_level(&self, kyc_level: u8) -> u64 {
        match kyc_level {
            UserKYC::BASIC => self.kyc_basic_daily_limit,
            UserKYC::ENHANCED => self.kyc_enhanced_daily_limit,
            UserKYC::INSTITUTIONAL => self.kyc_institutional_daily_limit,
            _ => 0, // Unverified users have no limit (0 means blocked)
        }
    }
}

#[account]
pub struct FeeStructure {
    pub mint: Pubkey,
    pub admin: Pubkey,
    pub trading_fee_bps: u16, // Basis points (1 bps = 0.01%)
    pub protocol_fee_bps: u16,
    pub kyc_basic_discount_bps: u16, // Discount for higher KYC levels
    pub kyc_enhanced_discount_bps: u16,
    pub kyc_institutional_discount_bps: u16,
    pub volume_tier_1_threshold: u64,
    pub volume_tier_1_discount_bps: u16,
    pub volume_tier_2_threshold: u64,
    pub volume_tier_2_discount_bps: u16,
}

impl FeeStructure {
    pub const LEN: usize = 32 + 32 + 2 * 7 + 8 * 2;

    pub fn calculate_trading_fee(&self, amount: u64, kyc_level: u8, monthly_volume: u64) -> u64 {
        let mut fee_bps = self.trading_fee_bps;
        
        // Apply KYC discount
        let kyc_discount = match kyc_level {
            UserKYC::BASIC => self.kyc_basic_discount_bps,
            UserKYC::ENHANCED => self.kyc_enhanced_discount_bps,
            UserKYC::INSTITUTIONAL => self.kyc_institutional_discount_bps,
            _ => 0,
        };
        fee_bps = fee_bps.saturating_sub(kyc_discount);

        // Apply volume discount
        let volume_discount = if monthly_volume >= self.volume_tier_2_threshold {
            self.volume_tier_2_discount_bps
        } else if monthly_volume >= self.volume_tier_1_threshold {
            self.volume_tier_1_discount_bps
        } else {
            0
        };
        fee_bps = fee_bps.saturating_sub(volume_discount);

        // Calculate fee amount
        (amount as u128 * fee_bps as u128 / 10_000) as u64
    }

    pub fn calculate_protocol_fee(&self, amount: u64) -> u64 {
        (amount as u128 * self.protocol_fee_bps as u128 / 10_000) as u64
    }
}