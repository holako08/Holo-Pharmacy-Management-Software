import pandas as pd # Import pandas
import mysql.connector
import os
import datetime
import subprocess
from dotenv import load_dotenv
import sys

# --- Configuration ---
# ***** CHANGE: Use the Excel filename *****
EXCEL_FILENAME = 'batches.xlsx'
DB_HOST = 'localhost'
DB_USER = 'root'
DB_NAME = 'medicines' # Database containing medicines_table and batches table
PLACEHOLDER_BATCH = 'BTC111'
PLACEHOLDER_EXPIRY_DB = '2100-01-01'
BACKUP_DIR = 'db_backups'

# --- Load Environment Variables ---
load_dotenv()
DB_PASSWORD = os.getenv('DB_PASSWORD')

if not DB_PASSWORD:
    print("ERROR: DB_PASSWORD not found in .env file. Please create a .env file.")
    sys.exit(1)

# --- Helper Functions ---
def format_expiry_date(date_input):
    """Converts various date inputs (string, datetime) to YYYY-MM-DD."""
    if pd.isna(date_input) or date_input == '':
         return None # Handle empty expiry dates

    # If it's already a datetime object (pandas might parse it)
    if isinstance(date_input, (datetime.datetime, datetime.date)):
        # Ensure year is handled correctly (e.g., if it was 'yy')
        year = date_input.year
        if year < 100:
            year += 2000
        try:
            corrected_date = datetime.date(year, date_input.month, date_input.day)
            return corrected_date.strftime('%Y-%m-%d')
        except ValueError:
             print(f"    WARNING: Invalid date components from datetime object '{date_input}'. Skipping expiry.")
             return None


    # If it's a string
    if isinstance(date_input, str):
        date_str = date_input.strip()
        formats_to_try = ['%d.%m.%y', '%d.%m.%Y', '%Y-%m-%d', '%d/%m/%Y', '%d/%m/%y', '%Y/%m/%d']
        parsed_date = None
        for fmt in formats_to_try:
            try:
                parsed_date = datetime.datetime.strptime(date_str, fmt)
                break
            except ValueError:
                continue

        if parsed_date:
            year = parsed_date.year
            if year < 100:
                year += 2000
            try:
                corrected_date = datetime.date(year, parsed_date.month, parsed_date.day)
                return corrected_date.strftime('%Y-%m-%d')
            except ValueError:
                 print(f"    WARNING: Invalid date components after parsing '{date_str}'. Skipping expiry.")
                 return None
        else:
            print(f"    WARNING: Could not parse date string '{date_str}'. Skipping expiry update.")
            return None

    # If it's a number (Excel sometimes stores dates as numbers)
    if isinstance(date_input, (int, float)):
         try:
             # Excel date serial number (days since 1900-01-01 or 1904-01-01)
             # This requires knowing the base date used by the Excel file, common is 1899-12-30
             base_date = datetime.datetime(1899, 12, 30)
             delta = datetime.timedelta(days=date_input)
             actual_date = base_date + delta
             return actual_date.strftime('%Y-%m-%d')
         except OverflowError:
              print(f"    WARNING: Date number '{date_input}' is too large to convert. Skipping expiry.")
              return None
         except Exception as e:
              print(f"    WARNING: Could not convert date number '{date_input}': {e}. Skipping expiry.")
              return None


    print(f"    WARNING: Unhandled date format '{date_input}' (Type: {type(date_input)}). Skipping expiry.")
    return None # Indicate parsing failure


def create_backup():
    """Creates a backup of the medicines database using mysqldump."""
    print("\nAttempting to create database backup...")
    try:
        if not os.path.exists(BACKUP_DIR):
            os.makedirs(BACKUP_DIR)

        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_filename = os.path.join(BACKUP_DIR, f'{DB_NAME}_backup_{timestamp}.sql')

        # Construct mysqldump command
        # ***** Use the full path if needed, as discussed *****
        command = [
            r'C:\Program Files\MySQL\MySQL Server 9.2\bin\mysqldump.exe', # Or just 'mysqldump' if in PATH
            f'--host={DB_HOST}',
            f'--user={DB_USER}',
            f'--password={DB_PASSWORD}',
            '--databases', DB_NAME,
            '--routines',
            '--triggers',
            '--single-transaction',
            f'--result-file={backup_filename}'
        ]

        process = subprocess.run(command, capture_output=True, text=True, check=False)

        if process.returncode != 0:
            print(f"  ERROR creating backup: {process.stderr}")
            return False
        else:
            print(f"  SUCCESS: Database backup created at '{backup_filename}'")
            return True

    except FileNotFoundError:
        print("  ERROR: 'mysqldump' command not found. Make sure MySQL client tools are installed and in your PATH (or specified full path in script).")
        return False
    except Exception as e:
        print(f"  ERROR creating backup: {e}")
        return False

# --- Main Script ---
def main():
    target_branch = input("Enter the branch name for these batches (e.g., GHU1, GHU2): ").strip()
    if not target_branch:
        print("Branch name cannot be empty. Exiting.")
        return

    print(f"\nProcessing batches for branch: '{target_branch}'")

    if not create_backup():
        confirm = input("Backup failed. Do you want to continue WITHOUT a backup? (yes/no): ").lower()
        if confirm != 'yes':
            print("Exiting script.")
            return
        else:
            print("WARNING: Continuing without database backup!")

    conn = None
    cursor = None
    report = {
        'processed_rows': 0,
        'medicines_found': 0,
        'medicines_not_found': 0,
        'suppliers_updated': 0,
        'batches_created': 0,
        'batches_updated': 0,
        'batches_skipped': 0,
        'placeholder_replaced': 0,
        'errors': 0,
        'warnings': 0,
        'details': {
            'not_found': [], 'errors': [], 'warnings': [], 'created': [],
            'updated': [], 'skipped': [], 'placeholder': [], 'supplier_changes': []
        }
    }

    try:
        # --- Database Connection ---
        print(f"Connecting to database '{DB_NAME}' on '{DB_HOST}'...")
        conn = mysql.connector.connect(host=DB_HOST, user=DB_USER, password=DB_PASSWORD, database=DB_NAME)
        
        # <-- CHANGED: Added buffered=True to fix 'Unread result' error
        cursor = conn.cursor(dictionary=True, buffered=True)
        
        print("Connection successful.")

        conn.start_transaction()
        print("Started database transaction.")

        # --- Read Excel File ---
        print(f"Reading Excel file '{EXCEL_FILENAME}'...")
        if not os.path.exists(EXCEL_FILENAME):
            print(f"ERROR: Excel file '{EXCEL_FILENAME}' not found in the current directory.")
            report['errors'] += 1
            report['details']['errors'].append(f"Excel file '{EXCEL_FILENAME}' not found.")
            return # Exit if file not found

        try:
             # Read the first sheet by default. Specify sheet_name='SheetName' if needed.
            df = pd.read_excel(EXCEL_FILENAME, engine='openpyxl')
            # Convert column names to string and strip whitespace for safety
            df.columns = [str(col).strip() for col in df.columns]

            # Verify required columns exist
            required_cols = ['ItemName', 'Batch/Serial Number', 'Expiry Date', 'U_Agency', 'Final Qty']
            missing_cols = [col for col in required_cols if col not in df.columns]
            if missing_cols:
                print(f"ERROR: Missing required columns in Excel: {', '.join(missing_cols)}")
                report['errors'] += 1
                report['details']['errors'].append(f"Missing Excel columns: {', '.join(missing_cols)}")
                return
        except Exception as read_err:
             print(f"ERROR: Failed to read or parse Excel file '{EXCEL_FILENAME}': {read_err}")
             report['errors'] += 1
             report['details']['errors'].append(f"Failed to read Excel: {read_err}")
             return

        # --- Iterate over DataFrame Rows ---
        for index, row in df.iterrows():
            report['processed_rows'] += 1
            row_num = index + 2 # Excel row number (1-based index + header)

            # Use .get() with default to handle potential missing columns gracefully after initial check
            # Convert to string and strip, handle potential NaN values from pandas
            item_name_csv = str(row.get('ItemName', '')).strip() if not pd.isna(row.get('ItemName')) else ''
            batch_num_csv = str(row.get('Batch/Serial Number', '')).strip() if not pd.isna(row.get('Batch/Serial Number')) else ''
            expiry_input_csv = row.get('Expiry Date') # Keep original type for format_expiry_date
            supplier_csv = str(row.get('U_Agency', '')).strip() if not pd.isna(row.get('U_Agency')) else ''
            quantity_csv = str(row.get('Final Qty', '')).strip() if not pd.isna(row.get('Final Qty')) else ''


            print(f"\nProcessing Excel Row {row_num}: Item='{item_name_csv}', Batch='{batch_num_csv}', Expiry='{expiry_input_csv}'")

            # --- Basic Validation ---
            if not item_name_csv or item_name_csv == 'nan':
                print(f"  WARNING: Skipping row {row_num} due to missing ItemName.")
                report['warnings'] += 1
                report['details']['warnings'].append(f"Row {row_num}: Missing ItemName")
                continue
            if not batch_num_csv or batch_num_csv == 'nan':
                print(f"  WARNING: Skipping row {row_num} due to missing Batch Number.")
                report['warnings'] += 1
                report['details']['warnings'].append(f"Row {row_num} ('{item_name_csv}'): Missing Batch Number")
                continue
            if not quantity_csv or quantity_csv == 'nan':
                print(f"  WARNING: Skipping row {row_num} due to missing Final Qty.")
                report['warnings'] += 1
                report['details']['warnings'].append(f"Row {row_num} ('{item_name_csv}'): Missing Final Qty")
                continue

            try:
                quantity_val = float(quantity_csv)
            except ValueError:
                print(f"  WARNING: Skipping row {row_num} due to invalid Final Qty: '{quantity_csv}'.")
                report['warnings'] += 1
                report['details']['warnings'].append(f"Row {row_num} ('{item_name_csv}'): Invalid Final Qty '{quantity_csv}'")
                continue

            expiry_db_csv = format_expiry_date(expiry_input_csv) # Can return None

            # --- Find Medicine ID ---
            cursor.execute("SELECT id, supplier FROM medicines_table WHERE item_name = %s", (item_name_csv,))
            medicine_record = cursor.fetchone()

            if not medicine_record:
                print(f"  Medicine '{item_name_csv}' not found in database.")
                report['medicines_not_found'] += 1
                report['details']['not_found'].append(item_name_csv)
                continue

            medicine_id = medicine_record['id']
            supplier_db = medicine_record.get('supplier', '') or ''
            report['medicines_found'] += 1
            print(f"  Found Medicine ID: {medicine_id}")

            # --- Update Supplier ---
            if supplier_csv and supplier_csv != 'nan' and (not supplier_db or supplier_db.strip().lower() != supplier_csv.lower()):
                try:
                    print(f"    Updating supplier from '{supplier_db}' to '{supplier_csv}'...")
                    cursor.execute("UPDATE medicines_table SET supplier = %s WHERE id = %s", (supplier_csv, medicine_id))
                    report['suppliers_updated'] += 1
                    report['details']['supplier_changes'].append(f"{item_name_csv} (ID: {medicine_id}): '{supplier_db}' -> '{supplier_csv}'")
                except mysql.connector.Error as supplier_err:
                    print(f"    ERROR updating supplier for Medicine ID {medicine_id}: {supplier_err}")
                    report['errors'] += 1
                    report['details']['errors'].append(f"Supplier update failed for {item_name_csv}: {supplier_err}")

            # --- Fetch Existing Batches ---
            cursor.execute("SELECT batch_id, batch_number, expiry, quantity, branch FROM batches WHERE medicine_id = %s", (medicine_id,))
            existing_batches = cursor.fetchall()
            print(f"    Found {len(existing_batches)} existing batches for this medicine (across all branches).")

            # --- Process Batch Logic ---
            batch_action_taken = False
            placeholder_batch_id_to_update = None

            for batch in existing_batches:
                expiry_db_str = str(batch['expiry']) if batch['expiry'] else ''
                if (batch['batch_number'] == PLACEHOLDER_BATCH and
                    expiry_db_str == PLACEHOLDER_EXPIRY_DB and
                    batch['branch'] == target_branch):
                    placeholder_batch_id_to_update = batch['batch_id']
                    print(f"    Found placeholder batch (ID: {placeholder_batch_id_to_update}) for target branch '{target_branch}'. Will replace.")
                    break

            if placeholder_batch_id_to_update:
                try:
                    cursor.execute("""
                        UPDATE batches SET batch_number = %s, expiry = %s, quantity = %s, branch = %s, received_date = CURDATE()
                        WHERE batch_id = %s
                    """, (batch_num_csv, expiry_db_csv, quantity_val, target_branch, placeholder_batch_id_to_update))
                    print(f"      SUCCESS: Replaced placeholder batch {placeholder_batch_id_to_update} with Excel data.")
                    report['placeholder_replaced'] += 1
                    report['batches_updated'] += 1
                    report['details']['placeholder'].append(f"{item_name_csv} (Batch ID: {placeholder_batch_id_to_update})")
                    batch_action_taken = True
                except mysql.connector.Error as ph_err:
                    print(f"      ERROR replacing placeholder batch {placeholder_batch_id_to_update}: {ph_err}")
                    report['errors'] += 1
                    report['details']['errors'].append(f"Placeholder replace failed for {item_name_csv}: {ph_err}")

            if not batch_action_taken:
                target_branch_batches = [b for b in existing_batches if b['branch'] == target_branch]
                print(f"    Found {len(target_branch_batches)} batches specifically for branch '{target_branch}'.")

                exact_match_found = False
                batch_to_update_num = None

                for batch in target_branch_batches:
                    expiry_db_str = str(batch['expiry']) if batch['expiry'] else ''

                    if batch['batch_number'] == batch_num_csv and expiry_db_str == expiry_db_csv:
                        print(f"      Skipping: Exact match found (Batch ID: {batch['batch_id']}).")
                        report['batches_skipped'] += 1
                        report['details']['skipped'].append(f"{item_name_csv} - Batch: {batch_num_csv}, Expiry: {expiry_db_csv}")
                        exact_match_found = True
                        batch_action_taken = True
                        break

                    if batch['batch_number'] != batch_num_csv and expiry_db_str == expiry_db_csv:
                       batch_to_update_num = batch['batch_id']
                       print(f"      Found batch with same expiry, different number (ID: {batch_to_update_num}). Will update batch number.")

                if not exact_match_found:
                    if batch_to_update_num:
                         try:
                            print(f"        Updating batch number for Batch ID {batch_to_update_num} to '{batch_num_csv}'...")
                            cursor.execute("UPDATE batches SET batch_number = %s WHERE batch_id = %s", (batch_num_csv, batch_to_update_num))
                            report['batches_updated'] += 1
                            report['details']['updated'].append(f"{item_name_csv} - Updated Batch Number for Expiry {expiry_db_csv} (ID: {batch_to_update_num})")
                            batch_action_taken = True
                         except mysql.connector.Error as update_err:
                            print(f"        ERROR updating batch number for Batch ID {batch_to_update_num}: {update_err}")
                            report['errors'] += 1
                            report['details']['errors'].append(f"Batch number update failed for {item_name_csv}: {update_err}")
                    else:
                        try:
                            print(f"      Creating new batch record for branch '{target_branch}'...")
                            cursor.execute("""
                                INSERT INTO batches (medicine_id, batch_number, expiry, quantity, branch, received_date)
                                VALUES (%s, %s, %s, %s, %s, CURDATE())
                            """, (medicine_id, batch_num_csv, expiry_db_csv, quantity_val, target_branch))
                            report['batches_created'] += 1
                            report['details']['created'].append(f"{item_name_csv} - Batch: {batch_num_csv}, Expiry: {expiry_db_csv}")
                            batch_action_taken = True
                        except mysql.connector.Error as insert_err:
                            print(f"      ERROR creating new batch: {insert_err}")
                            report['errors'] += 1
                            report['details']['errors'].append(f"Batch creation failed for {item_name_csv}: {insert_err}")
            # End loop through Excel rows

        print("\nFinished processing Excel file.")

        if report['errors'] == 0:
            print("Committing transaction...")
            conn.commit()
            print("Transaction committed.")
        else:
            print(f"Found {report['errors']} errors. Rolling back transaction...")
            conn.rollback()
            print("Transaction rolled back. No changes were saved to the database.")

    except mysql.connector.Error as err:
        print(f"\nDatabase Error: {err}")
        report['errors'] += 1
        report['details']['errors'].append(f"General DB Error: {err}")
        # Corrected rollback block
        if conn and conn.is_connected():
            try:
                conn.rollback()
                print("Transaction rolled back due to DB error.")
            except Exception as rollback_err:
                print(f"  WARNING: Could not rollback transaction after DB error: {rollback_err}")

    except FileNotFoundError:
        print(f"ERROR: Excel file '{EXCEL_FILENAME}' not found.")
        report['errors'] += 1
        report['details']['errors'].append(f"Excel file '{EXCEL_FILENAME}' not found.")
    except Exception as e:
        print(f"\nAn unexpected error occurred: {e}")
        report['errors'] += 1
        report['details']['errors'].append(f"Unexpected Error: {e}")
        # Corrected rollback block
        if conn and conn.is_connected():
            try:
                conn.rollback()
                print("Transaction rolled back due to unexpected error.")
            except Exception as rollback_err:
                print(f"  WARNING: Could not rollback transaction after unexpected error: {rollback_err}")

    finally:
        # <-- CHANGED: Made finally block more robust to prevent crashes during cleanup
        if cursor:
            try:
                # Try to consume any lingering results just in case
                cursor.fetchall() 
            except mysql.connector.Error:
                pass # Ignore errors here, we are just cleaning up
            
            try:
                cursor.close()
                print("Cursor closed.")
            except mysql.connector.Error as close_err:
                # Log the cleanup error but don't crash
                print(f"  WARNING: Error during cursor close: {close_err}")
                
        if conn and conn.is_connected():
            conn.close()
            print("Database connection closed.")

        # --- Print Final Report ---
        print("\n--- Final Report ---")
        print(f"Branch Processed:         {target_branch}")
        print(f"Excel Rows Processed:     {report['processed_rows']}") # Changed from CSV
        print(f"Medicines Found in DB:    {report['medicines_found']}")
        print(f"Medicines Not Found:      {report['medicines_not_found']}")
        print(f"Suppliers Updated:        {report['suppliers_updated']}")
        print("-" * 20)
        print(f"New Batches Created:      {report['batches_created']}")
        print(f"Batches Updated:          {report['batches_updated']} (Incl. Placeholders)")
        print(f"Placeholders Replaced:    {report['placeholder_replaced']}")
        print(f"Batches Skipped (Exact):  {report['batches_skipped']}")
        print("-" * 20)
        print(f"Warnings Logged:          {report['warnings']}")
        print(f"Errors Encountered:       {report['errors']} {'(Changes rolled back)' if report['errors'] > 0 else '(Changes committed)'}")

        # (Detailed report sections remain the same)
        if report['medicines_not_found'] > 0:
            print("\nMedicines Not Found in DB:")
            for item in report['details']['not_found']: print(f"- {item}")
        if report['suppliers_updated'] > 0:
             print("\nSupplier Updates:")
             for item in report['details']['supplier_changes']: print(f"- {item}")
        if report['batches_created'] > 0:
            print("\nBatches Created:")
            for item in report['details']['created']: print(f"- {item}")
        if report['batches_updated'] > 0 :
            print("\nBatches Updated (Number or Placeholder):")
            for item in report['details']['updated']: print(f"- {item}")
        if report['batches_skipped'] > 0:
             print("\nBatches Skipped (Exact Match Found):")
             for item in report['details']['skipped']: print(f"- {item}")
        if report['warnings'] > 0:
            print("\nWarnings:")
            for item in report['details']['warnings']: print(f"- {item}")
        if report['errors'] > 0:
            print("\nErrors:")
            for item in report['details']['errors']: print(f"- {item}")

        print("\n--- End of Report ---")

if __name__ == "__main__":
    main()