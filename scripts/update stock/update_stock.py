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
ITEM_NAME_COLUMN = 'ItemName'
QUANTITY_COLUMN = 'ClosQty'
BATCH_NAME_PLACEHOLDER = 'BTC111'
DEFAULT_EXPIRY_DATE = '2099-12-31'
DEFAULT_PRICE_PLACEHOLDER = 1.0

def update_medicine_stock():
    """
    Connects to the database, reads the Excel file, and updates medicine stock
    by creating new batches, creating new medicines if not found, and handling duplicates.
    """
    print("Starting medicine stock update script...")

    # 1. Read the Excel file (CSV) with the correct encoding
    try:
        df = pd.read_csv(EXCEL_FILE, encoding='ISO-8859-1')
        print(f"Successfully loaded '{EXCEL_FILE}'. Found {len(df)} rows.")
        if ITEM_NAME_COLUMN not in df.columns or QUANTITY_COLUMN not in df.columns:
            print(f"Error: Required columns '{ITEM_NAME_COLUMN}' or '{QUANTITY_COLUMN}' not found in the Excel file.")
            print(f"Available columns: {df.columns.tolist()}")
            return
    except FileNotFoundError:
        print(f"Error: Excel file '{EXCEL_FILE}' not found. Please ensure it's in the same directory as the script.")
        return
    except Exception as e:
        print(f"Error reading Excel file: {e}")
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
        new_items_list = []  # List to store names of newly created items

        for index, row in df.iterrows():
            item_name = str(row[ITEM_NAME_COLUMN]).strip()
            new_quantity = float(row[QUANTITY_COLUMN])

            if not item_name:
                print(f"Skipping row {index + 2}: Item name is empty.")
                continue
            if pd.isna(new_quantity) or new_quantity < 0:
                print(f"Skipping row {index + 2} ('{item_name}'): Invalid quantity '{row[QUANTITY_COLUMN]}'.")
                continue

            try:
                # Find medicine_id(s)
                cursor.execute("SELECT id FROM medicines_table WHERE item_name = %s", (item_name,))
                medicine_results = cursor.fetchall()
                medicine_id_to_update = None

                if len(medicine_results) == 0:
                    # Case 1: Item not found, create new medicine
                    print(f"Medicine '{item_name}' not found. Creating new entry...")
                    insert_medicine_query = """
                        INSERT INTO medicines_table (item_name, price, stock, expiry)
                        VALUES (%s, %s, %s, %s)
                    """
                    cursor.execute(insert_medicine_query, (item_name, DEFAULT_PRICE_PLACEHOLDER, new_quantity, DEFAULT_EXPIRY_DATE))
                    medicine_id_to_update = cursor.lastrowid
                    created_count += 1
                    new_items_list.append(item_name)
                    print(f"Created new medicine '{item_name}' with ID: {medicine_id_to_update}.")
                    
                    # Also create a new batch for the newly created medicine
                    insert_batch_query = """
                        INSERT INTO batches (medicine_id, batch_number, expiry, quantity, received_date)
                        VALUES (%s, %s, %s, %s, CURDATE())
                    """
                    batch_values = (medicine_id_to_update, BATCH_NAME_PLACEHOLDER, DEFAULT_EXPIRY_DATE, new_quantity)
                    cursor.execute(insert_batch_query, batch_values)
                    db_connection.commit()
                    updated_count += 1 # Count this as an update as a batch was created

                elif len(medicine_results) > 1:
                    # Case 2: Multiple matching names found
                    print(f"Multiple entries found for '{item_name}'. Handling duplicates...")
                    medicine_id_to_update = medicine_results[0][0]
                    # Keep the first one, delete the rest
                    for i in range(1, len(medicine_results)):
                        duplicate_id = medicine_results[i][0]
                        cursor.execute("DELETE FROM batches WHERE medicine_id = %s", (duplicate_id,))
                        cursor.execute("DELETE FROM medicines_table WHERE id = %s", (duplicate_id,))
                        print(f"  - Deleted duplicate medicine entry with ID: {duplicate_id}.")
                    duplicate_handled_count += 1
                    
                    # Update the stock of the remaining medicine and its batch
                    update_stock_query = """
                        UPDATE batches SET quantity = %s WHERE medicine_id = %s
                    """
                    cursor.execute(update_stock_query, (new_quantity, medicine_id_to_update))
                    update_medicine_stock_query = """
                        UPDATE medicines_table SET stock = %s WHERE id = %s
                    """
                    cursor.execute(update_medicine_stock_query, (new_quantity, medicine_id_to_update))
                    db_connection.commit()
                    updated_count += 1
                    print(f"Updated '{item_name}': Replaced quantity to {new_quantity} for existing batch.")

                else:
                    # Case 3: Single match found, proceed to update existing batch
                    medicine_id_to_update = medicine_results[0][0]
                    
                    # Check for an existing batch for this medicine
                    cursor.execute("SELECT COUNT(*) FROM batches WHERE medicine_id = %s", (medicine_id_to_update,))
                    batch_exists = cursor.fetchone()[0] > 0
                    
                    if batch_exists:
                        # Update the quantity of the existing batch
                        update_batch_query = """
                            UPDATE batches SET quantity = %s WHERE medicine_id = %s
                        """
                        cursor.execute(update_batch_query, (new_quantity, medicine_id_to_update))
                        
                        # Also update the main stock column in the medicines_table
                        update_medicine_stock_query = """
                            UPDATE medicines_table SET stock = %s WHERE id = %s
                        """
                        cursor.execute(update_medicine_stock_query, (new_quantity, medicine_id_to_update))
                        db_connection.commit()
                        updated_count += 1
                        print(f"Updated '{item_name}': Replaced quantity to {new_quantity} for existing batch.")

                    else:
                        # If no batch exists, create a new one
                        print(f"No batch found for '{item_name}'. Creating a new one...")
                        insert_batch_query = """
                            INSERT INTO batches (medicine_id, batch_number, expiry, quantity, received_date)
                            VALUES (%s, %s, %s, %s, CURDATE())
                        """
                        batch_values = (medicine_id_to_update, BATCH_NAME_PLACEHOLDER, DEFAULT_EXPIRY_DATE, new_quantity)
                        cursor.execute(insert_batch_query, batch_values)

                        # Update the main stock column in the medicines_table
                        update_medicine_stock_query = """
                            UPDATE medicines_table SET stock = %s WHERE id = %s
                        """
                        cursor.execute(update_medicine_stock_query, (new_quantity, medicine_id_to_update))
                        db_connection.commit()
                        updated_count += 1
                        print(f"Created new batch for '{item_name}' with quantity {new_quantity}.")

            except mysql.connector.Error as err:
                error_count += 1
                print(f"Database error for '{item_name}': {err}")
                db_connection.rollback()
            except Exception as e:
                error_count += 1
                print(f"An unexpected error occurred for '{item_name}': {e}")
                db_connection.rollback()

        print("\n--- Update Summary ---")
        print(f"Total items processed from Excel: {len(df)}")
        print(f"Items successfully updated: {updated_count}")
        print(f"New items created: {created_count}")
        if new_items_list:
            print("List of new items added: 🆕")
            for item in new_items_list:
                print(f"  - {item}")
        print(f"Duplicate items handled: {duplicate_handled_count}")
        print(f"Items with errors during update: {error_count}")

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