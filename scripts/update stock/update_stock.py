import mysql.connector
import pandas as pd
from datetime import datetime

# --- Database Configuration ---
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '200800',
    'database': 'medicines'
}

# --- Excel File Details ---
EXCEL_FILE = 'g2 SYSTEM STOCK ON 28.07.25.csv'
ITEM_NAME_COLUMN = 'Item Description'
ITEM_NO_COLUMN = 'Item No.'
QUANTITY_COLUMN = 'In Stock'
BATCH_NAME_PLACEHOLDER = 'BTC111'
DEFAULT_EXPIRY_DATE = '2099-12-31'
DEFAULT_PRICE_PLACEHOLDER = 1.0

def update_medicine_stock():
    """
    Connects to the database, reads the CSV file, and updates medicine stock
    by creating new batches, creating new medicines if not found, and handling duplicates.
    """
    print("Starting medicine stock update script...")

    # --- NEW: Prompt for branch name ---
    branch_name = input("Please enter the branch name for this stock update: ").strip()
    if not branch_name:
        print("Error: Branch name cannot be empty. Exiting script.")
        return
    print(f"--- Updating stock for branch: {branch_name} ---")
    # --- END NEW ---

    # 1. Read the CSV file with the correct encoding
    try:
        df = pd.read_csv(EXCEL_FILE, encoding='ISO-8859-1')
        print(f"Successfully loaded '{EXCEL_FILE}'. Found {len(df)} rows.")
        if ITEM_NAME_COLUMN not in df.columns or QUANTITY_COLUMN not in df.columns or ITEM_NO_COLUMN not in df.columns:
            print(f"Error: Required columns '{ITEM_NAME_COLUMN}', '{QUANTITY_COLUMN}', or '{ITEM_NO_COLUMN}' not found in the file.")
            print(f"Available columns: {df.columns.tolist()}")
            return
    except FileNotFoundError:
        print(f"Error: CSV file '{EXCEL_FILE}' not found. Please ensure it's in the same directory as the script.")
        return
    except Exception as e:
        print(f"Error reading CSV file: {e}")
        return

    # 2. Connect to the database
    db_connection = None
    try:
        db_connection = mysql.connector.connect(**DB_CONFIG)
        cursor = db_connection.cursor()
        print("Successfully connected to the MySQL database.")

        updated_count = 0
        created_count = 0
        duplicate_handled_count = 0
        error_count = 0
        new_items_list = []
        error_items_list = []

        for index, row in df.iterrows():
            item_no_str = row[ITEM_NO_COLUMN]
            item_name = row[ITEM_NAME_COLUMN]

            if pd.isna(item_name) or not isinstance(item_name, str) or not item_name.strip():
                print(f"Warning: Skipping row with missing or invalid item name (row index: {index}).")
                continue

            item_name = item_name.strip()
            new_quantity = row[QUANTITY_COLUMN]

            try:
                item_id = int(''.join(filter(str.isdigit, str(item_no_str))))
            except (ValueError, TypeError):
                error_reason = f"Could not parse Item No. '{item_no_str}' to an integer."
                print(f"Warning: {error_reason} for '{item_name}'. Skipping.")
                error_count += 1
                error_items_list.append({'item': item_name, 'reason': error_reason})
                continue

            if pd.isna(new_quantity):
                print(f"Warning: Skipping '{item_name}' due to missing quantity.")
                continue

            try:
                # Find medicine_id(s)
                cursor.execute("SELECT id FROM medicines_table WHERE item_name = %s", (item_name,))
                medicine_results = cursor.fetchall() # Use fetchall to clear results
                medicine_id_to_update = None

                if len(medicine_results) == 0:
                    # Case 1: Item not found, create new medicine
                    print(f"Medicine '{item_name}' not found. Creating new entry...")
                    # Create a new medicine entry
                    insert_medicine_query = "INSERT INTO medicines_table (id, item_name, price, expiry, stock) VALUES (%s, %s, %s, %s, %s)"
                    medicine_values = (item_id, item_name, DEFAULT_PRICE_PLACEHOLDER, DEFAULT_EXPIRY_DATE, new_quantity)
                    cursor.execute(insert_medicine_query, medicine_values)
                    medicine_id = item_id
                    print(f"Created new medicine entry for '{item_name}' with ID {medicine_id}.")
                    created_count += 1
                    new_items_list.append(item_name)
                    
                    # --- MODIFIED: Create a new batch for the newly created medicine, including the branch ---
                    insert_batch_query = "INSERT INTO batches (medicine_id, batch_number, expiry, quantity, received_date, branch) VALUES (%s, %s, %s, %s, CURDATE(), %s)"
                    batch_values = (medicine_id, BATCH_NAME_PLACEHOLDER, DEFAULT_EXPIRY_DATE, new_quantity, branch_name)
                    cursor.execute(insert_batch_query, batch_values)
                    db_connection.commit()
                    updated_count += 1

                elif len(medicine_results) > 1:
                    # Case 2: Multiple matching names found
                    print(f"Multiple entries found for '{item_name}'. Handling duplicates...")
                    medicine_id_to_update = medicine_results[0][0]
                    for i in range(1, len(medicine_results)):
                        duplicate_id = medicine_results[i][0]
                        cursor.execute("DELETE FROM batches WHERE medicine_id = %s", (duplicate_id,))
                        cursor.execute("DELETE FROM medicines_table WHERE id = %s", (duplicate_id,))
                        print(f"  - Deleted duplicate medicine entry with ID: {duplicate_id}.")
                    duplicate_handled_count += 1
                    
                    # --- MODIFIED: Apply branch logic to the remaining item ---
                    # Check if a batch for this specific branch already exists
                    
                    cursor.execute("SELECT batch_id FROM batches WHERE medicine_id = %s AND branch = %s", (medicine_id_to_update, branch_name))
                    
                    # --- FIX 1: Use fetchall() to clear unread results ---
                    batch_results_list = cursor.fetchall() 

                    if batch_results_list: # Check if the list is not empty
                        # Branch-batch exists, update its quantity
                        batch_id = batch_results_list[0][0] # Get the first item from the list
                        update_batch_query = "UPDATE batches SET quantity = %s WHERE batch_id = %s" 
                        cursor.execute(update_batch_query, (new_quantity, batch_id))
                        print(f"Updated '{item_name}': Replaced quantity to {new_quantity} for branch '{branch_name}'.")
                    else:
                        # Branch-batch does NOT exist, create a new one
                        insert_batch_query = "INSERT INTO batches (medicine_id, batch_number, expiry, quantity, received_date, branch) VALUES (%s, %s, %s, %s, CURDATE(), %s)"
                        batch_values = (medicine_id_to_update, BATCH_NAME_PLACEHOLDER, DEFAULT_EXPIRY_DATE, new_quantity, branch_name)
                        cursor.execute(insert_batch_query, batch_values)
                        print(f"Created new batch for '{item_name}' (branch: {branch_name}) with quantity {new_quantity}.")

                    # --- MODIFIED: Update main stock to be the SUM of ALL batches for this medicine ---
                    update_total_stock_query = "UPDATE medicines_table SET stock = (SELECT SUM(quantity) FROM batches WHERE medicine_id = %s) WHERE id = %s"
                    cursor.execute(update_total_stock_query, (medicine_id_to_update, medicine_id_to_update))
                    db_connection.commit()
                    updated_count += 1
                    # --- END MODIFIED BLOCK ---

                else:
                    # Case 3: Single match found, proceed to update/create branch-batch
                    medicine_id_to_update = medicine_results[0][0]
                    
                    # --- MODIFIED: Replace old batch check with new branch-specific logic ---
                    # Check if a batch for this specific branch already exists
                    
                    cursor.execute("SELECT batch_id FROM batches WHERE medicine_id = %s AND branch = %s", (medicine_id_to_update, branch_name))
                    
                    # --- FIX 2: Use fetchall() to clear unread results ---
                    batch_results_list = cursor.fetchall() 
                    
                    if batch_results_list: # Check if the list is not empty
                        # Branch-batch exists, update its quantity
                        batch_id = batch_results_list[0][0] # Get the first item from the list
                        update_batch_query = "UPDATE batches SET quantity = %s WHERE batch_id = %s" 
                        cursor.execute(update_batch_query, (new_quantity, batch_id))
                        print(f"Updated '{item_name}': Replaced quantity to {new_quantity} for branch '{branch_name}'.")
                    else:
                        # Branch-batch does NOT exist, create a new one
                        print(f"No batch found for '{item_name}' at branch '{branch_name}'. Creating a new one...")
                        insert_batch_query = "INSERT INTO batches (medicine_id, batch_number, expiry, quantity, received_date, branch) VALUES (%s, %s, %s, %s, CURDATE(), %s)"
                        batch_values = (medicine_id_to_update, BATCH_NAME_PLACEHOLDER, DEFAULT_EXPIRY_DATE, new_quantity, branch_name)
                        cursor.execute(insert_batch_query, batch_values)
                        print(f"Created new batch for '{item_name}' (branch: {branch_name}) with quantity {new_quantity}.")

                    # --- MODIFIED: Update main stock to be the SUM of ALL batches for this medicine ---
                    update_total_stock_query = "UPDATE medicines_table SET stock = (SELECT SUM(quantity) FROM batches WHERE medicine_id = %s) WHERE id = %s"
                    cursor.execute(update_total_stock_query, (medicine_id_to_update, medicine_id_to_update))
                    db_connection.commit()
                    updated_count += 1
                    # --- END MODIFIED BLOCK ---

            except mysql.connector.Error as err:
                error_count += 1
                error_reason = f"Database error: {err}"
                print(f"Error for '{item_name}': {error_reason}")
                error_items_list.append({'item': item_name, 'reason': error_reason})
                db_connection.rollback()
            except Exception as e:
                error_count += 1
                error_reason = f"An unexpected error occurred: {e}"
                print(f"Error for '{item_name}': {error_reason}")
                error_items_list.append({'item': item_name, 'reason': error_reason})
                db_connection.rollback()

        print("\n--- Update Summary ---")
        print(f"Update completed for branch: {branch_name}") # --- NEW ---
        print(f"Total items processed from CSV: {len(df)}")
        print(f"Items successfully updated/created: {updated_count}")
        print(f"New medicine items created in DB: {created_count}")
        if new_items_list:
            print("List of new items added: 🆕")
            for item in new_items_list:
                print(f"  - {item}")
        print(f"Duplicate items handled: {duplicate_handled_count}")
        print(f"Items with errors during update: {error_count}")
        
        if error_items_list:
            print("\nList of items with errors: ❌")
            for error_detail in error_items_list:
                print(f"  - Item: '{error_detail['item']}' | Reason: {error_detail['reason']}")

    except mysql.connector.Error as err:
        print(f"Error connecting to database: {err}")
        print("Please check your database connection details (host, user, password, database).")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
    finally:
        if db_connection and db_connection.is_connected():
            cursor.close()
            db_connection.close()
            print("Database connection closed.")

if __name__ == "__main__":
    update_medicine_stock()