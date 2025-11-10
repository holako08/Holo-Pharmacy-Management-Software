import pymysql
import logging
import re

# --- Logging Setup ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(message)s',
    handlers=[
        logging.FileHandler("sync_medicines.log"),
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

source_db = "capital-pharmacy-products"
ctpr_db = "ctpr"
target_db = "medicines"

def get_conn(database):
    return pymysql.connect(database=database, **db_config)

def parse_constituents(constituents):
    if not constituents or "+" not in constituents:
        return constituents, None
    parts = constituents.split("+", 1)
    return parts[0].strip(), parts[1].strip()

def extract_int_from_code(code):
    if not code:
        return None
    digits = re.sub(r"\D", "", code)
    return int(digits) if digits else None

def make_unique_id(target_cur, new_id):
    """
    If new_id already exists, increment by 10 until unique.
    Returns the final (unique) id to use for the displaced record.
    """
    cur_id = new_id
    while True:
        target_cur.execute("SELECT id FROM medicines_table WHERE id=%s", (cur_id,))
        if target_cur.fetchone():
            cur_id += 10
        else:
            break
    return cur_id

def main():
    total, matched, updated, ctp_id, source_id, errors, displaced = 0, 0, 0, 0, 0, 0, 0
    try:
        source_conn = get_conn(source_db)
        ctpr_conn = get_conn(ctpr_db)
        target_conn = get_conn(target_db)
        source_cur = source_conn.cursor()
        ctpr_cur = ctpr_conn.cursor()
        target_cur = target_conn.cursor()

        source_cur.execute("SELECT Itemcode, Itemname, Constituents FROM imported_products")
        src_rows = source_cur.fetchall()
        total = len(src_rows)
        log.info(f"Fetched {total} records from source DB")

        for row in src_rows:
            src_code, src_name, constituents = row['Itemcode'], row['Itemname'], row['Constituents']
            act1, act2 = parse_constituents(constituents)

            # Find target match (case-insensitive)
            target_cur.execute(
                "SELECT id, item_name FROM medicines_table WHERE LOWER(item_name) = %s LIMIT 1",
                (src_name.lower(),)
            )
            tgt = target_cur.fetchone()
            if not tgt:
                continue
            matched += 1

            # Priority 1: Try CTPR lookup
            ctpr_cur.execute(
                "SELECT ItemNo FROM ctpr_products WHERE LOWER(ItemName) = %s LIMIT 1",
                (src_name.lower(),)
            )
            ctpr_rec = ctpr_cur.fetchone()
            new_id = None
            used_ctpr = False

            if ctpr_rec:
                new_id = extract_int_from_code(ctpr_rec['ItemNo'])
                used_ctpr = True
            if not new_id:
                new_id = extract_int_from_code(src_code)
                used_ctpr = False

            if not new_id:
                log.error(f"Cannot convert ItemNo/Itemcode to integer for '{src_name}'. Skipping update.")
                errors += 1
                continue

            try:
                target_conn.begin()
                # Check for PK collision and resolve
                target_cur.execute("SELECT id FROM medicines_table WHERE id=%s", (new_id,))
                pk_row = target_cur.fetchone()
                if pk_row and pk_row['id'] != tgt['id']:
                    # Displace the other row to a new unique id (add 10 until unique)
                    unique_id = make_unique_id(target_cur, new_id+10)
                    target_cur.execute(
                        "UPDATE medicines_table SET id=%s WHERE id=%s",
                        (unique_id, pk_row['id'])
                    )
                    displaced += 1
                    log.info(f"Displaced existing row with id {pk_row['id']} to {unique_id} to resolve PK conflict.")

                # Now safe to update the target row
                target_cur.execute(
                    """
                    UPDATE medicines_table
                    SET id=%s, active_name_1=%s, active_name_2=%s
                    WHERE id=%s
                    """,
                    (new_id, act1, act2, tgt['id'])
                )
                target_conn.commit()
                updated += 1
                if used_ctpr:
                    ctp_id += 1
                else:
                    source_id += 1
                log.info(f"Updated: '{src_name}' | id set to '{new_id}' | active1='{act1}', active2='{act2}'")
            except Exception as e:
                target_conn.rollback()
                errors += 1
                log.error(f"Failed to update '{src_name}': {e}")

    except Exception as ex:
        log.error(f"Fatal error: {ex}")
    finally:
        for conn in ('source_conn', 'ctpr_conn', 'target_conn'):
            try:
                locals()[conn].close()
            except Exception:
                pass

    log.info("=== SUMMARY ===")
    log.info(f"Total source items: {total}")
    log.info(f"Matched in target: {matched}")
    log.info(f"Updated records: {updated}")
    log.info(f"Used CTPR ItemNo: {ctp_id}")
    log.info(f"Used Source Itemcode: {source_id}")
    log.info(f"Errors: {errors}")
    log.info(f"Displaced existing IDs: {displaced}")
    print("=== SYNC COMPLETE ===")

if __name__ == "__main__":
    main()
