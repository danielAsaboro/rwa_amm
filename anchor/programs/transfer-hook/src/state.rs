use anchor_lang::prelude::*;
use spl_token_metadata_interface::state::TokenMetadata;

#[account]
pub struct UserKYC {
    pub user: Pubkey,
    pub kyc_level: u8,
    pub risk_score: u8,
    pub last_updated: i64,
    pub flags: u8,
    pub daily_volume: u64,
    pub monthly_volume: u64,
    pub last_reset_day: i64,
    pub last_reset_month: i64,
    pub country: [u8; 2],
    pub state: [u8; 2],
    pub city: [u8; 32],
}

impl UserKYC {
    pub const LEN: usize = 32 + 1 + 1 + 8 + 1 + 8 + 8 + 8 + 8 + 2 + 2 + 32;
    pub const UNVERIFIED: u8 = 0;
    pub const BASIC: u8 = 1;
    pub const ENHANCED: u8 = 2;
    pub const INSTITUTIONAL: u8 = 3;
    pub const FLAG_SANCTIONS: u8 = 0x01;
    pub const FLAG_PEP: u8 = 0x02;
    pub const FLAG_FROZEN: u8 = 0x04;
    pub const FLAG_EXPIRED: u8 = 0x08;

    pub fn is_sanctioned(&self) -> bool {
        (self.flags & Self::FLAG_SANCTIONS) != 0
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
        let b = country.as_bytes();
        let len = b.len().min(2);
        self.country[..len].copy_from_slice(&b[..len]);
    }
    pub fn set_state(&mut self, state: &str) {
        self.state = [0; 2];
        let b = state.as_bytes();
        let len = b.len().min(2);
        self.state[..len].copy_from_slice(&b[..len]);
    }
    pub fn set_city(&mut self, city: &str) {
        self.city = [0; 32];
        let b = city.as_bytes();
        let len = b.len().min(32);
        self.city[..len].copy_from_slice(&b[..len]);
    }
}

#[derive(Clone, Debug)]
pub struct RwaMetadata {
    pub allowed_countries: Option<String>,
    pub restricted_states: Option<String>,
    pub trading_hours: Option<String>,
    pub timezone_offset: Option<String>,
    pub metadata_type: Option<String>,
    pub compliance_status: Option<String>,
}

pub struct Token2022MetadataParser;
impl Token2022MetadataParser {
    pub fn parse_metadata_from_mint(account_data: &[u8]) -> Result<TokenMetadata> {
        Self::extract_metadata_from_account_data(account_data)
    }
    fn extract_metadata_from_account_data(account_data: &[u8]) -> Result<TokenMetadata> {
        let strings = Self::extract_ascii_strings(account_data);
        let mut name = "Unknown Token".to_string();
        let mut symbol = "UNK".to_string();
        let mut uri = String::new();
        let mut additional_metadata = Vec::new();
        for s in &strings {
            if s.starts_with("http") {
                uri = s.clone();
            } else if s.len() <= 10 && s.chars().all(|c| (c.is_ascii_uppercase() || c.is_ascii_digit())) {
                symbol = s.clone();
            } else if s.len() <= 50 && s.len() > 2 {
                name = s.clone();
            }
        }
        additional_metadata.push(("strings_found".to_string(), strings.len().to_string()));
        let token_metadata = TokenMetadata {
            update_authority: None.try_into().unwrap_or_default(),
            mint: Pubkey::default(),
            name,
            symbol,
            uri,
            additional_metadata,
        };
        Ok(token_metadata)
    }
    fn extract_ascii_strings(data: &[u8]) -> Vec<String> {
        let mut strings = Vec::new();
        let mut cur = Vec::new();
        for &b in data {
            if b.is_ascii() && !b.is_ascii_control() && b != 0 {
                cur.push(b);
            } else if !cur.is_empty() && cur.len() >= 3 {
                if let Ok(s) = String::from_utf8(cur.clone()) {
                    let t = s.trim().to_string();
                    if t.len() >= 3 {
                        strings.push(t);
                    }
                }
                cur.clear();
            } else {
                cur.clear();
            }
        }
        if !cur.is_empty() && cur.len() >= 3 {
            if let Ok(s) = String::from_utf8(cur) {
                let t = s.trim().to_string();
                if t.len() >= 3 {
                    strings.push(t);
                }
            }
        }
        strings
    }
    pub fn extract_rwa_metadata(_metadata: &TokenMetadata) -> RwaMetadata {
        RwaMetadata {
            allowed_countries: None,
            restricted_states: None,
            trading_hours: None,
            timezone_offset: None,
            metadata_type: None,
            compliance_status: None,
        }
    }
}
