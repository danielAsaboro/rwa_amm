use anchor_lang::prelude::*;

#[account(zero_copy)]
#[derive(InitSpace, Debug)]
pub struct HookRegistry {
    /// Authority that can manage the whitelist
    pub authority: Pubkey,
    
    /// Maximum 32 whitelisted hook programs
    pub whitelisted_programs: [Pubkey; 32],
    
    /// Number of programs currently whitelisted
    pub program_count: u8,
    
    /// Bump seed for the PDA
    pub bump: u8,
    
    /// Reserved space for future features
    pub _padding: [u8; 126],
}

impl HookRegistry {
    pub const LEN: usize = 32 + (32 * 32) + 1 + 1 + 126; // 1184 bytes
    
    /// Check if a program is whitelisted
    pub fn is_program_whitelisted(&self, program_id: &Pubkey) -> bool {
        if self.program_count == 0 {
            return false;
        }
        
        self.whitelisted_programs[..self.program_count as usize]
            .iter()
            .any(|p| p == program_id)
    }
    
    /// Add a program to the whitelist
    pub fn add_program(&mut self, program_id: Pubkey) -> Result<()> {
        require!(self.program_count < 32, crate::PoolError::HookRegistryFull);
        require!(
            !self.is_program_whitelisted(&program_id),
            crate::PoolError::HookProgramAlreadyWhitelisted
        );
        
        self.whitelisted_programs[self.program_count as usize] = program_id;
        self.program_count += 1;
        
        Ok(())
    }
    
    /// Remove a program from the whitelist
    pub fn remove_program(&mut self, program_id: Pubkey) -> Result<()> {
        let mut found_index = None;
        
        for (i, &whitelisted_program) in self.whitelisted_programs[..self.program_count as usize].iter().enumerate() {
            if whitelisted_program == program_id {
                found_index = Some(i);
                break;
            }
        }
        
        let index = found_index.ok_or(crate::PoolError::HookProgramNotFound)?;
        
        // Shift remaining programs to fill the gap
        for i in index..(self.program_count as usize - 1) {
            self.whitelisted_programs[i] = self.whitelisted_programs[i + 1];
        }
        
        // Clear the last slot and decrement count
        self.whitelisted_programs[self.program_count as usize - 1] = Pubkey::default();
        self.program_count -= 1;
        
        Ok(())
    }
    
    /// Get list of whitelisted programs
    pub fn get_whitelisted_programs(&self) -> &[Pubkey] {
        &self.whitelisted_programs[..self.program_count as usize]
    }
}

#[derive(Accounts)]
pub struct CreateHookRegistry<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    
    /// The authority that will manage the hook registry
    pub authority: Signer<'info>,
    
    /// Hook registry PDA account
    #[account(
        init,
        payer = payer,
        space = 8 + HookRegistry::LEN,
        seeds = [b"hook-registry"],
        bump
    )]
    pub hook_registry: AccountLoader<'info, HookRegistry>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManageHookProgram<'info> {
    /// Authority that can manage the registry
    pub authority: Signer<'info>,
    
    /// Hook registry account
    #[account(
        mut,
        seeds = [b"hook-registry"],
        bump = hook_registry.load()?.bump,
        has_one = authority
    )]
    pub hook_registry: AccountLoader<'info, HookRegistry>,
}

pub fn handle_create_hook_registry(ctx: Context<CreateHookRegistry>) -> Result<()> {
    let hook_registry = &mut ctx.accounts.hook_registry.load_init()?;
    
    hook_registry.authority = ctx.accounts.authority.key();
    hook_registry.program_count = 0;
    hook_registry.bump = ctx.bumps.hook_registry;
    hook_registry.whitelisted_programs = [Pubkey::default(); 32];
    
    msg!("🔧 Hook registry created with authority: {}", hook_registry.authority);
    
    Ok(())
}

pub fn handle_add_hook_program(ctx: Context<ManageHookProgram>, program_id: Pubkey) -> Result<()> {
    let hook_registry = &mut ctx.accounts.hook_registry.load_mut()?;
    
    msg!("➕ Adding hook program to whitelist: {}", program_id);
    
    hook_registry.add_program(program_id)?;
    
    msg!("✅ Hook program added. Total programs: {}", hook_registry.program_count);
    
    Ok(())
}

pub fn handle_remove_hook_program(ctx: Context<ManageHookProgram>, program_id: Pubkey) -> Result<()> {
    let hook_registry = &mut ctx.accounts.hook_registry.load_mut()?;
    
    msg!("➖ Removing hook program from whitelist: {}", program_id);
    
    hook_registry.remove_program(program_id)?;
    
    msg!("✅ Hook program removed. Total programs: {}", hook_registry.program_count);
    
    Ok(())
}

pub fn handle_update_hook_registry_authority(
    ctx: Context<ManageHookProgram>,
    new_authority: Pubkey
) -> Result<()> {
    let hook_registry = &mut ctx.accounts.hook_registry.load_mut()?;
    
    let old_authority = hook_registry.authority;
    hook_registry.authority = new_authority;
    
    msg!("🔄 Hook registry authority updated: {} → {}", old_authority, new_authority);
    
    Ok(())
}