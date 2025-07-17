use crate::{fee_math::get_fee_in_period, state::fee::BaseFeeStruct};
use proptest::prelude::*;

proptest! {
    #![proptest_config(ProptestConfig {
        cases: 100, .. ProptestConfig::default()
    })]

    #[test]
    fn fee_scheduler_exponential(
        passed_period in 1..=u16::MAX,
    ) {
        let cliff_fee_numerator: u64 = 100_000;
        let reduction_factor: u64 = 0;


        let fee_numerator: u64 = get_fee_in_period(cliff_fee_numerator, reduction_factor, passed_period)?;
        assert_eq!(fee_numerator, cliff_fee_numerator)
    }
}

#[test]
fn test_base_fee() {
    let base_fee = BaseFeeStruct {
        cliff_fee_numerator: 100_000,
        fee_scheduler_mode: 1,
        number_of_period: 50,
        period_frequency: 1,
        reduction_factor: 500, // 5% each second
        ..Default::default()
    };
    let current_fee = base_fee.get_current_base_fee_numerator(100, 0).unwrap();
    println!("{}", current_fee)
}
