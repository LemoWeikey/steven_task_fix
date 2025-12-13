import pandas as pd
import random
from faker import Faker

# Initialize Faker for generating realistic company data
fake = Faker()

# Read the trade data
df = pd.read_excel('trade_data_expanded.xlsx')

# Extract unique suppliers with their locations and countries
suppliers_data = df[['Supplier', 'Supplier Location']].drop_duplicates()

# Parse location to extract country
def extract_country(location):
    """Extract country from 'City, Country' format"""
    if pd.isna(location):
        return 'Unknown'
    parts = location.split(',')
    return parts[-1].strip() if len(parts) > 1 else location.strip()

def extract_city(location):
    """Extract city from 'City, Country' format"""
    if pd.isna(location):
        return 'Unknown'
    parts = location.split(',')
    return parts[0].strip() if len(parts) > 0 else location.strip()

suppliers_data['Country'] = suppliers_data['Supplier Location'].apply(extract_country)
suppliers_data['City'] = suppliers_data['Supplier Location'].apply(extract_city)

# Generate company information for each supplier
company_info = []

# Domain extensions by country
domain_extensions = {
    'China': ['com.cn', 'cn', 'com'],
    'India': ['co.in', 'in', 'com'],
    'Bangladesh': ['com.bd', 'bd', 'com'],
    'Vietnam': ['vn', 'com.vn', 'com'],
    'Thailand': ['co.th', 'th', 'com'],
    'USA': ['com', 'us'],
    'Korea': ['kr', 'co.kr', 'com'],
    'Turkey': ['tr', 'com.tr', 'com'],
    'UK': ['co.uk', 'uk', 'com']
}

# Phone prefixes by country
phone_prefixes = {
    'China': '+86',
    'India': '+91',
    'Bangladesh': '+880',
    'Vietnam': '+84',
    'Thailand': '+66',
    'USA': '+1',
    'Korea': '+82',
    'Turkey': '+90',
    'UK': '+44'
}

# Business types
business_types = [
    'Textile Manufacturing',
    'Garment Production',
    'Yarn Manufacturing',
    'Fabric Weaving',
    'Synthetic Fiber Production',
    'Textile Trading',
    'Apparel Manufacturing',
    'Fiber Processing'
]

for idx, row in suppliers_data.iterrows():
    company_name = row['Supplier']
    city = row['City']
    country = row['Country']
    
    # Generate company email domain
    company_domain = company_name.lower().replace(' ', '').replace('ltd', '').replace('.', '')
    domain_ext = random.choice(domain_extensions.get(country, ['com']))
    
    # Generate contact information
    phone_prefix = phone_prefixes.get(country, '+1')
    
    company_data = {
        'Company Name': company_name,
        'Country': country,
        'City': city,
        'Full Address': f"{fake.building_number()} {fake.street_name()}, {city}, {country}",
        'Postal Code': fake.postcode(),
        'Phone': f"{phone_prefix}-{random.randint(100, 999)}-{random.randint(1000, 9999)}-{random.randint(1000, 9999)}",
        'Fax': f"{phone_prefix}-{random.randint(100, 999)}-{random.randint(1000, 9999)}-{random.randint(1000, 9999)}",
        'Email': f"info@{company_domain}.{domain_ext}",
        'Sales Email': f"sales@{company_domain}.{domain_ext}",
        'Website': f"www.{company_domain}.{domain_ext}",
        'Business Type': random.choice(business_types),
        'Established Year': random.randint(1985, 2020),
        'Employees': random.choice(['50-100', '100-500', '500-1000', '1000-5000', '5000+']),
        'Annual Revenue (USD)': f"${random.randint(5, 100)}M",
        'Certifications': random.choice([
            'ISO 9001, OEKO-TEX',
            'ISO 9001, ISO 14001, WRAP',
            'ISO 9001, SA8000, BSCI',
            'ISO 9001, GRS, GOTS',
            'ISO 9001, ISO 14001'
        ]),
        'Main Products': random.choice([
            'Cotton Yarn, Polyester Yarn, Blended Yarn',
            'Denim Fabric, Cotton Fabric, Synthetic Fabric',
            'T-shirts, Jeans, Casual Wear',
            'Nylon Filament, Polyester Filament, Viscose Fiber',
            'Wool Fiber, Cotton Fiber, Synthetic Fiber'
        ]),
        'Export Markets': random.choice([
            'USA, Europe, Asia',
            'North America, EU, Middle East',
            'Global',
            'USA, Canada, Mexico, Europe',
            'Asia Pacific, North America, Europe'
        ]),
        'Payment Terms': random.choice(['L/C, T/T', 'T/T, Western Union', 'L/C, D/P, T/T', 'T/T, PayPal']),
        'Minimum Order': f"{random.randint(100, 5000)} units",
        'Contact Person': fake.name(),
        'Contact Title': random.choice(['CEO', 'Sales Manager', 'Export Manager', 'General Manager', 'Business Development Manager']),
        'Contact Email': f"{fake.first_name().lower()}.{fake.last_name().lower()}@{company_domain}.{domain_ext}",
        'Contact Phone': f"{phone_prefix}-{random.randint(100, 999)}-{random.randint(1000, 9999)}-{random.randint(1000, 9999)}"
    }
    
    company_info.append(company_data)

# Create DataFrame
companies_df = pd.DataFrame(company_info)

# Sort by country and company name
companies_df = companies_df.sort_values(['Country', 'Company Name'])

# Save to Excel with formatting
with pd.ExcelWriter('company_information_detailed.xlsx', engine='openpyxl') as writer:
    # Main sheet with all companies
    companies_df.to_excel(writer, sheet_name='All Companies', index=False)
    
    # Create separate sheets by country
    for country in companies_df['Country'].unique():
        country_df = companies_df[companies_df['Country'] == country]
        sheet_name = country[:31]  # Excel sheet name limit
        country_df.to_excel(writer, sheet_name=sheet_name, index=False)
    
    # Create summary sheet
    summary_data = {
        'Country': [],
        'Number of Companies': [],
        'Main Cities': []
    }
    
    for country in companies_df['Country'].unique():
        country_df = companies_df[companies_df['Country'] == country]
        summary_data['Country'].append(country)
        summary_data['Number of Companies'].append(len(country_df))
        summary_data['Main Cities'].append(', '.join(country_df['City'].unique()))
    
    summary_df = pd.DataFrame(summary_data)
    summary_df.to_excel(writer, sheet_name='Summary', index=False)

print(f"✅ Company information generated successfully!")
print(f"📊 Total companies: {len(companies_df)}")
print(f"🌍 Countries covered: {companies_df['Country'].nunique()}")
print(f"\nCountries breakdown:")
print(companies_df['Country'].value_counts().to_string())
print(f"\n💾 Saved to: company_information_detailed.xlsx")
