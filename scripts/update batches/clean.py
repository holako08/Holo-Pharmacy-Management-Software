import mysql.connector
import sys

# --- Configuration ---
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '200800', # Your MySQL password
    'database': 'medicines'
}

# --- Criteria for deletion ---
PLACEHOLDER_BATCHES = ('BTC111', 'TST1')
PLACEHOLDER_EXPIRY = '2099-12-31'


def clean_placeholder_batches():
    """
    Finds and deletes specific placeholder batches from the database.
    
    Criteria for deletion:
    1. Batch number is 'BTC111' OR 'TST1'
    2. Expiry date is '2099-12-31'
    3. Branch is NULL or an empty string
    """
    conn = None
    batches_deleted_report = []
    
    print("Starting placeholder batch cleanup script...")

    try:
        # --- Database Connection ---
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor(dictionary=True)
        print(f"Successfully connected to database '{DB_CONFIG['database']}'.")

        # --- 1. Find the batches to delete (for reporting) ---
        print(f"Searching for batches matching criteria:")
        print(f"  - Batch Name: {PLACEHOLDER_BATCHES}")
        print(f"  - Expiry Date: {PLACEHOLDER_EXPIRY}")
        print(f"  - Branch: (No Branch / NULL)")

        # Create dynamic placeholders for the IN clause (e.g., "%s, %s")
        batch_placeholders = ', '.join(['%s'] * len(PLACEHOLDER_BATCHES))

        # Create the flat parameter list
        select_params = list(PLACEHOLDER_BATCHES)
        select_params.append(PLACEHOLDER_EXPIRY)

        # ---!! FIX: Changed 'id' to 'batch_id' ---
        select_query = f"""
        SELECT batch_id, medicine_id, batch_number, expiry, branch
        FROM batches
        WHERE
            batch_number IN ({batch_placeholders})
            AND expiry = %s
            AND (branch IS NULL OR branch = '')
        """

        cursor.execute(select_query, select_params)
        batches_to_delete = cursor.fetchall()
        
        total_found = len(batches_to_delete)

        if total_found == 0:
            print("\nNo placeholder batches found. Database is clean.")
            cursor.close()
            conn.close()
            print("Database connection closed.")
            return

        print(f"\nFound {total_found} placeholder batch(es) to delete:")
        
        # --- 2. Build the report (before deleting) ---
        for batch in batches_to_delete:
            # ---!! FIX: Changed 'batch['id']' to 'batch['batch_id']' ---
            report_msg = (
                f"  - Batch '{batch['batch_number']}' "
                f"(Batch ID: {batch['batch_id']}, "
                f"Medicine ID: {batch['medicine_id']}, "
                f"Expiry: {batch['expiry']})"
            )
            print(report_msg)
            batches_deleted_report.append(report_msg)

        # --- 3. Delete the batches ---
        print(f"\nProceeding to delete {total_found} batch(es)... ", end='')
        
        delete_params = list(PLACEHOLDER_BATCHES)
        delete_params.append(PLACEHOLDER_EXPIRY)

        delete_query = f"""
        DELETE FROM batches
        WHERE
            batch_number IN ({batch_placeholders})
            AND expiry = %s
            AND (branch IS NULL OR branch = '')
        """
        
        cursor.execute(delete_query, delete_params)
        
        rows_deleted = cursor.rowcount
        
        conn.commit()
        print(f"Done. Committed {rows_deleted} deletion(s).")

        # --- 4. Final Report ---
        print("\n" + "="*50)
        print("        DETAILED CLEANUP REPORT")
        print("="*50)
        
        if rows_deleted != total_found:
            print(f"  [Warning] Found {total_found} but deleted {rows_deleted}. "
                  "This is unusual but may happen in rare cases.")
        else:
            print(f"Successfully found and deleted {rows_deleted} placeholder batch(es).")
        
        print("\nDetails of deleted batches:")
        for line in batches_deleted_report:
            print(line)
        print("="*50)

    except mysql.connector.Error as err:
        print(f"\nDATABASE ERROR: {err}", file=sys.stderr)
        if conn and conn.is_connected():
            conn.rollback()
            print("Transaction was rolled back.", file=sys.stderr)
    except Exception as e:
        print(f"\nAn unexpected error occurred: {e}", file=sys.stderr)
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()
            print("\nDatabase connection closed.")


if __name__ == '__main__':
    clean_placeholder_batches()