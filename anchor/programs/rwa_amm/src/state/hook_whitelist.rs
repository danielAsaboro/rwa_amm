use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct HookWhitelist {
    pub admin: Pubkey,
    #[max_len(32)]
    pub programs: Vec<Pubkey>,
}

impl HookWhitelist {
    pub const SEED: &'static [u8] = b"hook-whitelist";

    pub fn init(&mut self, admin: Pubkey) {
        self.admin = admin;
        self.programs = Vec::new();
    }

    pub fn is_whitelisted(&self, program_id: &Pubkey) -> bool {
        self.programs.iter().any(|p| p == program_id)
    }
}


