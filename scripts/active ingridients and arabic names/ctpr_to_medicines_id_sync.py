import pymysql
import logging
import re

# --- Logging Setup ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(message)s',
    handlers=[
        logging.FileHandler("ctpr_to_medicines_id_sync.log"),
        logging.StreamHandler()
    ]
)
log = logging.getLogger()

# --- Database configs ---
db_config = {
    "host": "localhost",
    "user": "root",
    "password": "200800",
    "cursorclass": pymysql.cursors.DictCursor,
    "autocommit": False
}

ctpr_db = "ctpr"
target_db = "medicines"

def get_conn(database):
    return pymysql.connect(database=database, **db_config)

def extract_int_from_code(code):
    if not code:
        return None
    digits = re.sub(r"\D", "", code)
    return int(digits) if digits else None

def make_unique_id(target_cur, new_id):
    cur_id = new_id
    while True:
        target_cur.execute("SELECT id FROM medicines_table WHERE id=%s", (cur_id,))
        if target_cur.fetchone():
            cur_id += 10
        else:
            break
    return cur_id

def main():
    total, matched, updated, errors, displaced = 0, 0, 0, 0, 0
    try:
        ctpr_conn = get_conn(ctpr_db)
        target_conn = get_conn(target_db)
        ctpr_cur = ctpr_conn.cursor()
        target_cur = target_conn.cursor()

        ctpr_cur.execute("SELECT ItemNo, ItemName FROM ctpr_products")
        ctpr_rows = ctpr_cur.fetchall()
        total = len(ctpr_rows)
        log.info(f"Fetched {total} records from ctpr_products")

        for row in ctpr_rows:
            itemno, itemname = row['ItemNo'], row['ItemName']

            # Match by item name (case-insensitive)
            target_cur.execute(
                "SELECT id, item_name FROM medicines_table WHERE LOWER(item_name) = %s LIMIT 1",
                (itemname.lower(),)
            )
            tgt = target_cur.fetchone()
            if not tgt:
                continue
            matched += 1

            # Convert ItemNo to integer
            new_id = extract_int_from_code(itemno)
            if not new_id:
                log.error(f"Cannot convert ItemNo '{itemno}' to integer for '{itemname}'. Skipping update.")
                errors += 1
                continue

            try:
                target_conn.begin()
                # Check for PK collision and resolve
                target_cur.execute("SELECT id FROM medicines_table WHERE id=%s", (new_id,))
                pk_row = target_cur.fetchone()
                if pk_row and pk_row['id'] != tgt['id']:
                    # Displace the other row to a new unique id
                    unique_id = make_unique_id(target_cur, new_id + 10)
                    target_cur.execute(
                        "UPDATE medicines_table SET id=%s WHERE id=%s",
                        (unique_id, pk_row['id'])
                    )
                    displaced += 1
                    log.info(f"Displaced existing row with id {pk_row['id']} to {unique_id} to resolve PK conflict.")

                # Now safe to update
                target_cur.execute(
                    """
                    UPDATE medicines_table
                    SET id=%s
                    WHERE id=%s
                    """,
                    (new_id, tgt['id'])
                )
                target_conn.commit()
                updated += 1
                log.info(f"Updated: '{itemname}' | id set to '{new_id}'")
            except Exception as e:
                target_conn.rollback()
                errors += 1
                log.error(f"Failed to update '{itemname}': {e}")

    except Exception as ex:
        log.error(f"Fatal error: {ex}")
    finally:
        for conn in ('ctpr_conn', 'target_conn'):
            try:
                locals()[conn].close()
            except Exception:
                pass

    log.info("=== SUMMARY ===")
    log.info(f"Total ctpr items: {total}")
    log.info(f"Matched in medicines: {matched}")
    log.info(f"Updated records: {updated}")
    log.info(f"Errors: {errors}")
    log.info(f"Displaced existing IDs: {displaced}")
    print("=== SYNC COMPLETE ===")

if __name__ == "__main__":
    main()
