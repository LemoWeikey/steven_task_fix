import pandas as pd

INPUT_FILE = 'company_analytics_report_2024.xlsx'
SUMMARY_SHEET = 'Company Summary'
RAW_SHEET = 'Daily Transactions'

def verify_summary():
    print("Verifying Company Summary Sheet...")
    try:
        xl = pd.ExcelFile(INPUT_FILE)
        if SUMMARY_SHEET not in xl.sheet_names:
            print(f"FAILED: {SUMMARY_SHEET} not found.")
            return

        df_summary = xl.parse(SUMMARY_SHEET)
        df_raw = xl.parse(RAW_SHEET)
    except Exception as e:
        print(f"Error loading file: {e}")
        return

    # Check Columns
    expected_cols = [
        'Supplier', 'Total_Revenue', 'Total_Amount', 'Scale', 
        'is_fabric', 'is_clothing', 'is_fiber', 'is_filament', 'best_category'
    ]
    missing_cols = [c for c in expected_cols if c not in df_summary.columns]
    if missing_cols:
        print(f"FAILED: Missing columns: {missing_cols}")
    else:
        print("PASSED: All required columns present.")

    # Check Scale values
    valid_scales = {'Big', 'Small'}
    actual_scales = set(df_summary['Scale'].unique())
    if not actual_scales.issubset(valid_scales):
        print(f"FAILED: Invalid Scale values found: {actual_scales - valid_scales}")
    else:
        print("PASSED: Scale values are valid.")

    # Check Flags (should be 0 or 1)
    flag_cols = ['is_fabric', 'is_clothing', 'is_fiber', 'is_filament']
    for col in flag_cols:
        unique_vals = set(df_summary[col].unique())
        if not unique_vals.issubset({0, 1}):
            print(f"FAILED: Column {col} contains non-binary values: {unique_vals}")
    print("PASSED: Flag columns are binary.")

    # Spot Check Calculation for first supplier
    test_supplier = df_summary.iloc[0]['Supplier']
    print(f"Spot checking supplier: {test_supplier}")
    
    summary_rev = df_summary.iloc[0]['Total_Revenue']
    
    raw_rev = df_raw[df_raw['Supplier'] == test_supplier]['Total_Price'].sum()
    
    # Allow small float diff
    if abs(summary_rev - raw_rev) < 0.1:
        print(f"PASSED: Revenue matches for {test_supplier} (${summary_rev:,.2f})")
    else:
        print(f"FAILED: Revenue mismatch for {test_supplier}. Summary: {summary_rev}, Raw: {raw_rev}")

    print("Verification Complete.")

if __name__ == "__main__":
    verify_summary()
