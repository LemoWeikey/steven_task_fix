import pandas as pd
import numpy as np
import random
from datetime import date, timedelta

INPUT_FILE = 'company_analytics_report_2024.xlsx'
SHEET_NAME = 'Daily Transactions'

def generate_data():
    print(f"Loading {INPUT_FILE}...")
    try:
        xl = pd.ExcelFile(INPUT_FILE)
    except FileNotFoundError:
        print("Error: File not found.")
        return

    # Extract Companies from Executive Summary
    if 'Executive Summary' in xl.sheet_names:
        df_exec = xl.parse('Executive Summary')
        companies = df_exec['Supplier'].unique().tolist()
        print(f"Found {len(companies)} companies.")
    else:
        print("Executive Summary not found. Using defaults.")
        companies = ["Atlantic Fibers", "Sunrise Synthetics"]

    category_products = {
        'Clothing': ['T-Shirt', 'Jeans', 'Dress', 'Jacket', 'Sportswear', 'Shirt'],
        'Fabric': ['Cotton Fabric', 'Polyester Fabric', 'Denim', 'Knitted Fabric', 'Woven Fabric'],
        'Fiber': ['Polyester Staple Fiber', 'Cotton Fiber', 'Viscose Fiber', 'Acrylic Fiber'],
        'Filament': ['POY', 'DTY', 'FDY', 'Viscose Filament', 'Nylon Filament']
    }

    # Realistic 6-digit HS Codes
    hs_code_map = {
        # Clothing
        'T-Shirt': '610910',  # T-shirts, cotton
        'Jeans': '620342',    # Trousers, bib and brace overalls, breeches and shorts
        'Dress': '620443',    # Women's or girls' dresses of synthetic fibres
        'Jacket': '620193',   # Men's or boys' anoraks, of man-made fibres
        'Sportswear': '611212', # Track suits, of synthetic fibres
        'Shirt': '620520',    # Men's or boys' shirts of cotton
        
        # Fabric
        'Cotton Fabric': '520832', # Woven fabrics of cotton, dyed
        'Polyester Fabric': '540752', # Woven fabrics of polyester filaments
        'Denim': '520942',     # Denim fabric
        'Knitted Fabric': '600632', # Knitted or crocheted fabrics of synthetic fibres
        'Woven Fabric': '551321', # Woven fabrics of synthetic staple fibres
        
        # Fiber
        'Polyester Staple Fiber': '550320', # Synthetic staple fibres, of polyesters
        'Cotton Fiber': '520100',  # Cotton, not carded or combed
        'Viscose Fiber': '550410', # Artificial staple fibres, of viscose rayon
        'Acrylic Fiber': '550330', # Synthetic staple fibres, acrylic
        
        # Filament
        'POY': '540246',      # Other polyesters, partially oriented
        'DTY': '540233',      # Textured yarn, of polyesters
        'FDY': '540247',      # Other polyesters
        'Viscose Filament': '540331', # Viscose rayon, single yarn
        'Nylon Filament': '540245'    # Other, of nylon or other polyamides
    }
    
    categories = list(category_products.keys())

    # Data Pools
    buyers = [
        "Global Textiles Ltd", "Fashion Corp", "Zara Supply", "H&M Sourcing", 
        "Uniqlo Mfg", "Local Distributors", "Vietnam Garment Co", "Shenzhen Trading",
        "Walmart Sourcing", "Target Procurement", "Nike Materials", "Adidas Supply"
    ]
    
    regions = ["North America", "Europe", "Asia Pacific", "South America"]
    countries_map = {
        "North America": ["USA", "Canada", "Mexico"],
        "Europe": ["Germany", "France", "UK", "Italy", "Spain"],
        "Asia Pacific": ["Vietnam", "China", "India", "Bangladesh", "Japan", "Korea"],
        "South America": ["Brazil", "Argentina"]
    }

    records = []
    
    # Date Range: Full Year 2024
    start_date = date(2024, 1, 1)
    end_date = date(2024, 12, 31)
    delta = (end_date - start_date).days
    
    print("Generating daily transactions for full year 2024...")
    
    for i in range(delta + 1):
        current_date = start_date + timedelta(days=i)
        
        # Seasonality factor
        seasonality = 1 + 0.3 * np.sin(2 * np.pi * i / 365)
        
        for comp in companies:
            # Randomize activity
            if random.random() > 0.6: continue 
            
            n_trans = random.randint(1, 5)
            
            for _ in range(n_trans):
                # Select Category first, then Product
                category = random.choice(categories)
                product = random.choice(category_products[category])
                
                # Get HS Code
                hs_code = hs_code_map.get(product, '999999')
                
                # Pricing logic based on category
                base_price = 0
                if category == 'Fiber': base_price = random.uniform(1.2, 3.0)
                elif category == 'Filament': base_price = random.uniform(2.0, 5.0)
                elif category == 'Fabric': base_price = random.uniform(3.0, 10.0)
                elif category == 'Clothing': base_price = random.uniform(5.0, 50.0)
                
                unit_price = round(base_price * random.uniform(0.9, 1.1), 2)
                
                # Amount logic (Fiber/Filament usually higher volume)
                if category in ['Fiber', 'Filament']:
                    amount = random.randint(1000, 20000)
                else:
                    amount = random.randint(100, 5000)
                
                # Total Calculation
                total_price = round(unit_price * amount, 2)
                
                # Participants
                buyer = random.choice(buyers)
                
                # Locations
                region_b = random.choice(regions)
                country_b = random.choice(countries_map[region_b])
                country_s = random.choice(["Vietnam", "China", "India", "Turkey"])

                record = {
                    "Date_Trade": current_date,
                    "Supplier": comp,
                    "Buyer": buyer,
                    "Product": product,
                    "HS_Code": hs_code,
                    "Category": category,
                    "Unit_Price": unit_price,
                    "Total_Amount": amount,
                    "Total_Price": total_price,
                    "Country_Supplier": country_s,
                    "Country_Buyer": country_b,
                    "Region_Buyer": region_b,
                    "Status": random.choice(["Completed", "Shipped", "Processing", "Completed"])
                }
                records.append(record)

    df_out = pd.DataFrame(records)
    print(f"Generated {len(df_out)} records.")
    
    # Calculate some summary stats to verify
    total_rev = df_out['Total_Price'].sum()
    print(f"Total Revenue Generated: ${total_rev:,.2f}")

    # Append to Excel
    print("Writing to Excel...")
    with pd.ExcelWriter(INPUT_FILE, engine='openpyxl', mode='a', if_sheet_exists='replace') as writer:
        df_out.to_excel(writer, sheet_name=SHEET_NAME, index=False)
    
    print("Done!")

if __name__ == "__main__":
    generate_data()
