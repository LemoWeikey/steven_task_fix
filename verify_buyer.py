import pandas as pd

try:
    df = pd.read_csv('steven_data_5301.csv')
    print("Columns:", df.columns.tolist())
    
    if 'buyer' in df.columns:
        buyers = df['buyer'].dropna().unique()
        print(f"Unique Buyers count: {len(buyers)}")
        print("First 5 Buyers:", buyers[:5])
    else:
        print("ERROR: 'buyer' column not found!")

except Exception as e:
    print(f"Error: {e}")
