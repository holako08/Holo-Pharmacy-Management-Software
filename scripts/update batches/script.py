import pandas as pd
import mysql.connector
from datetime import datetime
import sys
import decimal # For handling stock quantities

# --- Configuration ---
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '200800', # Replace with your MySQL password
    'database': 'medicines'
}
EXCEL_FILE_PATH = 'ghu2.xlsx'
BRANCH_NAME = 'ghu2'

def parse_expiry_date(expiry_date_str):
    """
    Parses various date formats from Excel into 'YYYY-MM-DD'.
    """
    if pd.isna(expiry_date_str) or str(expiry_date_str).strip() == '':
        return None  # Handle blank dates
        
    expiry_date_str = str(expiry_date_str)

    try:
        # Handle full timestamps (e.g., '2026-05-30 00:00:00')
        if ' ' in expiry_date_str:
            expiry_date_obj = datetime.strptime(expiry_date_str.split(' ')[0], '%Y-%m-%d')
        # Handle 'dd.mm.yy' format (e.g., '30.05.26')
        elif '.' in expiry_date_str:
            expiry_date_obj = datetime.strptime(expiry_date_str, '%d.%m.%y')
        # Add other formats if needed
        else:
            # Try to parse as 'YYYY-MM-DD' as a fallback
            expiry_date_obj = datetime.strptime(expiry_date_str, '%Y-%m-%d')

        return expiry_date_obj.strftime('%Y-%m-%d')
    
    except ValueError as e:
        print(f"  - [Date Parse Warning] Could not parse date '{expiry_date_str}'. Error: {e}", file=sys.stderr)
        return None

def sync_database():
    """
    Connects to the database, reads the Excel file, and performs a
    full sync operation (Create, Update, Delete) on the batches table.
    """
    conn = None
    report = {
        'medicines_skipped': [],
        'suppliers_updated': 0,
        'batches_created': [],
        'batches_updated': [],
        'batches_deleted': [],
        'batches_delete_skipped_stock': [],
        'batches_parse_error': []
    }

    try:
        # --- Read Excel Data ---
        df = pd.read_excel(EXCEL_FILE_PATH, engine='openpyxl', sheet_name='Sheet1')
        print(f"Successfully read data from '{EXCEL_FILE_PATH}'.")

        # --- Database Connection ---
        conn = mysql.connector.connect(**DB_CONFIG)
        # Using dictionary=True to get results as dicts (e.g., row['stock'])
        cursor = conn.cursor(dictionary=True)
        print(f"Successfully connected to database '{DB_CONFIG['database']}'.")

        # Group data by item name to process each medicine once
        grouped = df.groupby('ItemName')
        total_items = len(grouped)
        print(f"Found {total_items} unique items to process.")

        for i, (item_name, group) in enumerate(grouped):
            try:
                print(f"\n--- Processing item {i+1}/{total_items}: '{item_name}' ---")

                # --- 1. Find the medicine in the database ---
                cursor.execute("SELECT id FROM medicines_table WHERE item_name = %s", (item_name,))
                result = cursor.fetchone()

                if not result:
                    print(f"  - WARNING: Medicine '{item_name}' not found. Skipping.")
                    report['medicines_skipped'].append(item_name)
                    continue

                medicine_id = result['id']

                # --- 2. Update the supplier ---
                supplier = group['U_Agency'].iloc[0]
                if pd.isna(supplier):
                    supplier = None # Handle blank suppliers
                
                cursor.execute(
                    "UPDATE medicines_table SET supplier = %s WHERE id = %s",
                    (supplier, medicine_id)
                )
                report['suppliers_updated'] += 1
                # No print here, too noisy. Will be in summary.

                # --- 3. Build map of batches from Excel file ---
                excel_batches_map = {}
                for _, row in group.iterrows():
                    batch_number = str(row['Batch/Serial Number']).strip()
                    if not batch_number or batch_number.lower() == 'nan' or batch_number.lower() == 'not applicable':
                        continue # Skip rows with no batch number
                    
                    mysql_expiry_date = parse_expiry_date(row['Expiry Date'])
                    
                    if mysql_expiry_date is None:
                        msg = f"'{item_name}' - Batch '{batch_number}' (Expiry: '{row['Expiry Date']}')"
                        report['batches_parse_error'].append(msg)
                        print(f"    - Skipping batch '{batch_number}': Could not parse expiry date.")
                        continue
                        
                    excel_batches_map[batch_number] = mysql_expiry_date
                
                print(f"  - Found {len(excel_batches_map)} valid batches in Excel.")

                # --- 4. Get existing batches from Database ---
                cursor.execute(
                    "SELECT id, batch_number, expiry, stock FROM batches WHERE medicine_id = %s AND branch = %s",
                    (medicine_id, BRANCH_NAME)
                )
                db_batches = cursor.fetchall()
                db_batches_map = {b['batch_number']: b for b in db_batches}
                print(f"  - Found {len(db_batches_map)} existing batches in DB for branch '{BRANCH_NAME}'.")

                # --- 5. Sync Logic (Create, Update, Delete) ---
                excel_batch_nums = set(excel_batches_map.keys())
                db_batch_nums = set(db_batches_map.keys())

                # 5a. CREATE (in Excel, not in DB)
                batches_to_create = excel_batch_nums - db_batch_nums
                for batch_num in batches_to_create:
                    expiry = excel_batches_map[batch_num]
                    insert_query = """
                    INSERT INTO batches (medicine_id, batch_number, expiry, branch)
                    VALUES (%s, %s, %s, %s)
                    """
                    cursor.execute(insert_query, (medicine_id, batch_num, expiry, BRANCH_NAME))
                    msg = f"'{item_name}' - Batch '{batch_num}', Expiry: {expiry}"
                    report['batches_created'].append(msg)
                    print(f"    - CREATED: Batch '{batch_num}'")

                # 5b. UPDATE (in both, check for changes)
                batches_to_update = excel_batch_nums.intersection(db_batch_nums)
                for batch_num in batches_to_update:
                    db_batch = db_batches_map[batch_num]
                    excel_expiry = excel_batches_map[batch_num]
                    
                    db_expiry_str = db_batch['expiry'].strftime('%Y-%m-%d') if db_batch['expiry'] else None

                    if excel_expiry != db_expiry_str:
                        cursor.execute(
                            "UPDATE batches SET expiry = %s WHERE id = %s",
                            (excel_expiry, db_batch['id'])
                        )
                        msg = f"'{item_name}' - Batch '{batch_num}': Expiry {db_expiry_str} -> {excel_expiry}"
                        report['batches_updated'].append(msg)
                        print(f"    - UPDATED: Batch '{batch_num}' expiry from {db_expiry_str} to {excel_expiry}")

                # 5c. DELETE (in DB, not in Excel) - with stock check
                batches_to_delete = db_batch_nums - excel_batch_nums
                for batch_num in batches_to_delete:
                    db_batch = db_batches_map[batch_num]
                    
                    stock = db_batch.get('stock')
                    if stock is None or not isinstance(stock, (int, float, decimal.Decimal)):
                        stock_val = 0.0
                    else:
                        try:
                            stock_val = float(stock)
                        except (ValueError, TypeError):
                            stock_val = 0.0

                    # This is the safety check
                    if stock_val > 0:
                        msg = f"'{item_name}' - Batch '{batch_num}': Has stock ({stock_val})."
                        report['batches_delete_skipped_stock'].append(msg)
                        print(f"    - SKIP DELETE: Batch '{batch_num}' has stock ({stock_val}).")
                    else:
                        cursor.execute("DELETE FROM batches WHERE id = %s", (db_batch['id'],))
                        msg = f"'{item_name}' - Batch '{batch_num}' (Stock: {stock_val})"
                        report['batches_deleted'].append(msg)
                        print(f"    - DELETED: Batch '{batch_num}' (Stock was {stock_val}). This fixed the 'mess'.")

            except Exception as e:
                print(f"  - ERROR processing '{item_name}': {e}", file=sys.stderr)
                conn.rollback() # Rollback changes for this single item
                print(f"  - Rolled back changes for '{item_name}'.", file=sys.stderr)

        # --- Finalize Transaction ---
        conn.commit()
        print("\nDatabase sync complete. All changes have been committed.")

    except FileNotFoundError:
        print(f"ERROR: The file '{EXCEL_FILE_PATH}' was not found.", file=sys.stderr)
    except mysql.connector.Error as err:
        print(f"DATABASE ERROR: {err}", file=sys.stderr)
        if conn and conn.is_connected():
            conn.rollback()
            print("Transaction was rolled back.", file=sys.stderr)
    except Exception as e:
        print(f"An unexpected error occurred: {e}", file=sys.stderr)
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()
            print("Database connection closed.")
        
        # --- Print Detailed Report ---
        print("\n" + "="*50)
        print("          DETAILED SYNC REPORT")
        print("="*50)
        
        print(f"\n--- Summary ---")
        print(f"Items Processed:      {total_items - len(report['medicines_skipped'])}")
        print(f"Suppliers Updated:    {report['suppliers_updated']}")
        print(f"Batches Created:      {len(report['batches_created'])} (New Supply)")
        print(f"Batches Updated:      {len(report['batches_updated'])} (Expiry Changes)")
        print(f"Batches Deleted:      {len(report['batches_deleted'])} (Cleaned 'mess')")
        print(f"Deletions Skipped:    {len(report['batches_delete_skipped_stock'])} (Stock > 0 Safety Check)")
        print(f"Batches Parse Errors: {len(report['batches_parse_error'])}")
        
        if report['medicines_skipped']:
            print("\n--- Skipped Medicines (Not in DB) ---")
            for item in report['medicines_skipped']:
                print(f"  - {item}")

        if report['batches_created']:
            print("\n--- Batches Created (New Supply) ---")
            for item in report['batches_created']:
                print(f"  - {item}")
        
        if report['batches_updated']:
            print("\n--- Batches Updated (Expiry) ---")
            for item in report['batches_updated']:
                print(f"  - {item}")
        
        if report['batches_deleted']:
            print("\n--- Batches Deleted (Cleaning the Mess) ---")
            for item in report['batches_deleted']:
                print(f"  - {item}")

        if report['batches_delete_skipped_stock']:
            print("\n--- Deletions Skipped (Safety Check: Stock > 0) ---")
            for item in report['batches_delete_skipped_stock']:
                print(f"  - {item}")
        
        if report['batches_parse_error']:
            print("\n--- Batches Skipped (Expiry Parse Error) ---")
            for item in report['batches_parse_error']:
                print(f"  - {item}")

        print("\n" + "="*50)
        print("Report complete.")


if __name__ == '__main__':
    sync_database()