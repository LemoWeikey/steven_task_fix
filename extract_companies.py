import pandas as pd
import os

# Define file paths
input_file = 'vietnam_buyers_hs5301_cleaned_imputed.xlsx'
output_file = 'unique_company_locations.xlsx'

def extract_companies():
    print(f"Loading {input_file}...")
    try:
        df = pd.read_excel(input_file)
    except FileNotFoundError:
        print(f"Error: File {input_file} not found.")
        return

    # Extract Buyer Information
    print("Extracting buyer information...")
    buyers = df[['buyer', 'buyer_country']].copy()
    buyers.columns = ['Name', 'Location']
    
    # Extract Seller Information
    print("Extracting seller information...")
    sellers = df[['seller', 'seller_country']].copy()
    sellers.columns = ['Name', 'Location']
    
    # Combine both
    print("Combining and grouping headers...")
    all_companies = pd.concat([buyers, sellers], ignore_index=True)
    
    # Clean up: Drop rows with missing names
    all_companies = all_companies.dropna(subset=['Name'])
    
    # Normalize names (strip whitespace)
    all_companies['Name'] = all_companies['Name'].astype(str).str.strip()
    all_companies['Location'] = all_companies['Location'].astype(str).str.strip()
    
    # Group by Name and Location (Drop duplicates)
    # The user asked to "group by company name", and have "Name" and "Location" cols.
    # We will keep unique pairs.
    unique_companies = all_companies.drop_duplicates().sort_values(by='Name')
    
    # Save to Excel
    print(f"Saving to {output_file}...")
    unique_companies.to_excel(output_file, index=False)
    print("Done.")

if __name__ == "__main__":
    extract_companies()
