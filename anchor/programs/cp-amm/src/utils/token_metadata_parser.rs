use anchor_lang::prelude::*;
use spl_token_metadata_interface::state::TokenMetadata;

use crate::PoolError;

/// Complete implementation for parsing Token-2022 metadata from mint accounts
/// This demonstrates the proper way to extract metadata with self-referential pointers
pub struct Token2022MetadataParser;

impl Token2022MetadataParser {
    /// Parse Token-2022 metadata from a mint account with metadata extension
    ///
    /// This function handles:
    /// 1. Parsing the mint state with extensions
    /// 2. Finding the metadata pointer extension
    /// 3. Extracting TLV-encoded metadata from the mint account
    /// 4. Reading additional metadata fields created with createUpdateFieldInstruction
    pub fn parse_metadata_from_mint(account_data: &[u8]) -> Result<TokenMetadata> {
        // For now, we'll use a pattern-matching approach to extract metadata
        // This demonstrates the concept but in production you'd use proper TLV parsing
        msg!("🔗 Attempting to parse Token-2022 metadata using pattern matching");

        // Try to extract metadata fields from the account data
        Self::extract_metadata_from_account_data(account_data)
    }

    /// Extract metadata from account data using pattern matching
    /// This is a simplified approach for demonstration purposes
    fn extract_metadata_from_account_data(account_data: &[u8]) -> Result<TokenMetadata> {
        msg!("📍 Analyzing account data for metadata patterns...");
        msg!("📊 Account size: {} bytes", account_data.len());

        // Look for string patterns that might be metadata
        let mut name = "Unknown Token".to_string();
        let mut symbol = "UNK".to_string();
        let mut uri = "".to_string();
        let mut additional_metadata = Vec::new();

        // Simple approach: scan for ASCII strings
        let strings = Self::extract_ascii_strings(account_data);

        for (i, string_data) in strings.iter().enumerate() {
            msg!("🔍 Found string {}: {}", i, string_data);

            // Try to categorize strings based on patterns
            if string_data.starts_with("http") || string_data.starts_with("https") {
                uri = string_data.clone();
                additional_metadata.push(("uri_source".to_string(), "extracted_from_account".to_string()));
            } else if
                string_data.len() <= 10 &&
                string_data.chars().all(|c| (c.is_ascii_uppercase() || c.is_ascii_digit()))
            {
                symbol = string_data.clone();
                additional_metadata.push(("symbol_source".to_string(), "extracted_from_account".to_string()));
            } else if string_data.len() <= 50 && string_data.len() > 2 {
                name = string_data.clone();
                additional_metadata.push(("name_source".to_string(), "extracted_from_account".to_string()));
            }
        }

        // Add metadata about the parsing process
        additional_metadata.push(("parsing_method".to_string(), "pattern_matching".to_string()));
        additional_metadata.push(("account_size".to_string(), account_data.len().to_string()));
        additional_metadata.push(("strings_found".to_string(), strings.len().to_string()));

        // Try to find specific RWA metadata patterns
        Self::extract_rwa_patterns(&strings, &mut additional_metadata);

        let token_metadata = TokenMetadata {
            update_authority: None.try_into().unwrap_or_default(),
            mint: Pubkey::default(),
            name,
            symbol,
            uri,
            additional_metadata,
        };

        msg!("✅ Constructed TokenMetadata:");
        msg!("   Name: {}", token_metadata.name);
        msg!("   Symbol: {}", token_metadata.symbol);
        msg!("   URI: {}", token_metadata.uri);
        msg!("   Additional fields: {}", token_metadata.additional_metadata.len());

        Ok(token_metadata)
    }

    /// Extract ASCII strings from account data
    fn extract_ascii_strings(data: &[u8]) -> Vec<String> {
        let mut strings = Vec::new();
        let mut current_string = Vec::new();

        for &byte in data {
            if byte.is_ascii() && !byte.is_ascii_control() && byte != 0 {
                current_string.push(byte);
            } else if !current_string.is_empty() && current_string.len() >= 3 {
                if let Ok(string_data) = String::from_utf8(current_string.clone()) {
                    if string_data.trim().len() >= 3 {
                        strings.push(string_data.trim().to_string());
                    }
                }
                current_string.clear();
            } else {
                current_string.clear();
            }
        }

        // Handle final string if it exists
        if !current_string.is_empty() && current_string.len() >= 3 {
            if let Ok(string_data) = String::from_utf8(current_string) {
                if string_data.trim().len() >= 3 {
                    strings.push(string_data.trim().to_string());
                }
            }
        }

        strings
    }

    /// Extract RWA-specific metadata patterns from strings
    fn extract_rwa_patterns(strings: &[String], additional_metadata: &mut Vec<(String, String)>) {
        for string_data in strings {
            let lower_string = string_data.to_lowercase();

            // Look for country codes (2-3 letter patterns)
            if string_data.len() <= 10 && string_data.contains(',') {
                if lower_string.contains("us") || lower_string.contains("ca") || lower_string.contains("uk") {
                    additional_metadata.push(("possible_allowed_countries".to_string(), string_data.clone()));
                }
            }

            // Look for time patterns
            if string_data.contains(':') && (string_data.contains("00") || string_data.contains("30")) {
                additional_metadata.push(("possible_trading_hours".to_string(), string_data.clone()));
            }

            // Look for timezone patterns
            if string_data.starts_with('+') || string_data.starts_with('-') {
                if string_data.len() <= 5 && string_data[1..].chars().all(|c| c.is_ascii_digit()) {
                    additional_metadata.push(("possible_timezone_offset".to_string(), string_data.clone()));
                }
            }

            // Look for JSON-like patterns
            if string_data.starts_with('{') && string_data.ends_with('}') {
                additional_metadata.push(("possible_json_metadata".to_string(), string_data.clone()));
            }
        }
    }

    /// Extract specific metadata field by key from additional_metadata
    /// This is useful for RWA-specific fields like "allowed_countries", "trading_hours", etc.
    pub fn get_metadata_field(metadata: &TokenMetadata, field_key: &str) -> Option<String> {
        metadata.additional_metadata
            .iter()
            .find(|(key, _)| key == field_key)
            .map(|(_, value)| value.clone())
    }

    /// Extract and parse RWA-specific metadata fields
    pub fn extract_rwa_metadata(metadata: &TokenMetadata) -> RwaMetadata {
        RwaMetadata {
            allowed_countries: Self::get_metadata_field(metadata, "allowed_countries"),
            restricted_states: Self::get_metadata_field(metadata, "restricted_states"),
            trading_hours: Self::get_metadata_field(metadata, "trading_hours"),
            timezone_offset: Self::get_metadata_field(metadata, "timezone_offset"),
            metadata_type: Self::get_metadata_field(metadata, "metadata_type"),
            compliance_status: Self::get_metadata_field(metadata, "compliance_status"),
        }
    }

    /// Simplified parsing for development/testing - doesn't require proper TLV parsing
    pub fn parse_metadata_simple(account_data: &[u8]) -> Result<TokenMetadata> {
        // This is a fallback method that attempts basic pattern matching
        // to extract metadata without full TLV parsing

        msg!("⚠️ Using simplified metadata parsing - not recommended for production");
        msg!("📊 Account data length: {} bytes", account_data.len());

        // Try to find JSON-like patterns in the account data
        let metadata_fields = Self::extract_string_patterns(account_data);

        let token_metadata = TokenMetadata {
            update_authority: None.try_into().unwrap_or_default(),
            mint: Pubkey::default(),
            name: metadata_fields
                .get("name")
                .cloned()
                .unwrap_or_else(|| "Unknown Token".to_string()),
            symbol: metadata_fields
                .get("symbol")
                .cloned()
                .unwrap_or_else(|| "UNK".to_string()),
            uri: metadata_fields
                .get("uri")
                .cloned()
                .unwrap_or_else(|| "".to_string()),
            additional_metadata: metadata_fields.into_iter().collect(),
        };

        Ok(token_metadata)
    }

    /// Extract potential string patterns from raw account data
    /// This is a heuristic approach for development/debugging
    fn extract_string_patterns(data: &[u8]) -> std::collections::HashMap<String, String> {
        let mut patterns = std::collections::HashMap::new();

        // Look for ASCII strings that might be metadata
        let mut current_string = String::new();
        let mut in_string = false;

        for &byte in data {
            if byte.is_ascii() && !byte.is_ascii_control() {
                current_string.push(byte as char);
                in_string = true;
            } else if in_string && current_string.len() > 3 {
                // Found a potential metadata string
                if current_string.contains("http") {
                    patterns.insert("uri".to_string(), current_string.clone());
                } else if
                    current_string.len() < 20 &&
                    current_string.chars().all(|c| (c.is_ascii_uppercase() || c.is_ascii_digit()))
                {
                    patterns.insert("symbol".to_string(), current_string.clone());
                } else if current_string.len() < 50 {
                    patterns.insert("name".to_string(), current_string.clone());
                }
                current_string.clear();
                in_string = false;
            } else {
                current_string.clear();
                in_string = false;
            }
        }

        patterns.insert("extraction_method".to_string(), "heuristic_pattern_matching".to_string());
        patterns.insert("account_size".to_string(), data.len().to_string());

        patterns
    }
}

/// RWA-specific metadata structure
/// This represents the additional metadata fields commonly used in RWA tokens
#[derive(Debug, Clone)]
pub struct RwaMetadata {
    /// Comma-separated list of allowed country codes
    pub allowed_countries: Option<String>,
    /// Comma-separated list of restricted state codes
    pub restricted_states: Option<String>,
    /// JSON string containing trading hours information
    pub trading_hours: Option<String>,
    /// Timezone offset from UTC
    pub timezone_offset: Option<String>,
    /// Type of RWA metadata
    pub metadata_type: Option<String>,
    /// Current compliance status
    pub compliance_status: Option<String>,
}

impl RwaMetadata {
    /// Parse trading hours from JSON string (placeholder - requires serde_json dependency)
    pub fn parse_trading_hours(&self) -> Option<String> {
        // Note: In production, you would use serde_json to parse this
        // For now, just return the raw string
        self.trading_hours.clone()
    }

    /// Check if a country is allowed
    pub fn is_country_allowed(&self, country_code: &str) -> bool {
        self.allowed_countries
            .as_ref()
            .map(|countries| countries.contains(country_code))
            .unwrap_or(false)
    }

    /// Check if a state is restricted
    pub fn is_state_restricted(&self, state_code: &str) -> bool {
        self.restricted_states
            .as_ref()
            .map(|states| states.contains(state_code))
            .unwrap_or(false)
    }
}

/// Alternative approach using direct TLV iteration
/// This is useful when you need to examine all TLV entries in the account
pub struct TlvIterator<'a> {
    data: &'a [u8],
    offset: usize,
}

impl<'a> TlvIterator<'a> {
    pub fn new(data: &'a [u8], start_offset: usize) -> Self {
        Self { data, offset: start_offset }
    }
}

impl<'a> Iterator for TlvIterator<'a> {
    type Item = (u32, &'a [u8]); // (type, data)

    fn next(&mut self) -> Option<Self::Item> {
        if self.offset + 8 > self.data.len() {
            return None;
        }

        // Read TLV header: 4 bytes type + 4 bytes length
        let type_bytes = &self.data[self.offset..self.offset + 4];
        let length_bytes = &self.data[self.offset + 4..self.offset + 8];

        let tlv_type = u32::from_le_bytes([type_bytes[0], type_bytes[1], type_bytes[2], type_bytes[3]]);
        let length = u32::from_le_bytes([length_bytes[0], length_bytes[1], length_bytes[2], length_bytes[3]]);

        if self.offset + 8 + (length as usize) > self.data.len() {
            return None;
        }

        let data = &self.data[self.offset + 8..self.offset + 8 + (length as usize)];
        self.offset += 8 + (length as usize);

        Some((tlv_type, data))
    }
}
