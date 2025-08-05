use anchor_lang::prelude::*;

#[account]
#[derive(Debug)]
/// Parameter that set by the protocol
pub struct TokenBadge {
    /// token mint
    pub token_mint: Pubkey,
    
    /// Hook program ID (zero means no hook program)
    pub hook_program_id: Pubkey,
    
    /// Hook-specific configuration flags
    /// Bit flags: 
    /// 0x01 = Requires KYC validation
    /// 0x02 = Requires geographic restrictions
    /// 0x04 = Requires volume limits
    /// 0x08 = Reserved for future use
    pub hook_config_flags: u8,
    
    /// Maximum daily volume allowed (0 = no limit)
    pub max_daily_volume: u64,
    
    /// Maximum monthly volume allowed (0 = no limit) 
    pub max_monthly_volume: u64,
    
    /// Minimum KYC level required for trading (0 = no requirement)
    pub min_kyc_level: u8,
    
    /// Reserved space for future hook configurations
    pub hook_config_data: [u8; 32],
    
    /// Reserve for future features
    pub _padding: [u8; 48],
}

impl TokenBadge {
    // Hook config flag constants
    pub const FLAG_REQUIRES_KYC: u8 = 0x01;
    pub const FLAG_REQUIRES_GEO_RESTRICTIONS: u8 = 0x02;
    pub const FLAG_REQUIRES_VOLUME_LIMITS: u8 = 0x04;
    
    pub fn initialize(&mut self, token_mint: Pubkey) -> Result<()> {
        self.token_mint = token_mint;
        self.hook_program_id = Pubkey::default(); // Use zero pubkey for no hook
        self.hook_config_flags = 0;
        self.max_daily_volume = 0;
        self.max_monthly_volume = 0;
        self.min_kyc_level = 0;
        self.hook_config_data = [0; 32];
        Ok(())
    }
    
    pub fn initialize_with_hook(
        &mut self,
        token_mint: Pubkey,
        hook_program_id: Pubkey,
        hook_config_flags: u8,
        max_daily_volume: u64,
        max_monthly_volume: u64,
        min_kyc_level: u8,
    ) -> Result<()> {
        self.token_mint = token_mint;
        self.hook_program_id = hook_program_id;
        self.hook_config_flags = hook_config_flags;
        self.max_daily_volume = max_daily_volume;
        self.max_monthly_volume = max_monthly_volume;
        self.min_kyc_level = min_kyc_level;
        self.hook_config_data = [0; 32];
        Ok(())
    }
    
    /// Check if this token requires KYC validation
    pub fn requires_kyc(&self) -> bool {
        (self.hook_config_flags & Self::FLAG_REQUIRES_KYC) != 0
    }
    
    /// Check if this token has geographic restrictions
    pub fn has_geo_restrictions(&self) -> bool {
        (self.hook_config_flags & Self::FLAG_REQUIRES_GEO_RESTRICTIONS) != 0
    }
    
    /// Check if this token has volume limits
    pub fn has_volume_limits(&self) -> bool {
        (self.hook_config_flags & Self::FLAG_REQUIRES_VOLUME_LIMITS) != 0
    }
    
    /// Check if this token has a specific hook program
    pub fn has_hook_program(&self) -> bool {
        self.hook_program_id != Pubkey::default()
    }
    
    /// Get the hook program ID if it exists
    pub fn get_hook_program_id(&self) -> Option<Pubkey> {
        if self.hook_program_id != Pubkey::default() {
            Some(self.hook_program_id)
        } else {
            None
        }
    }
}
