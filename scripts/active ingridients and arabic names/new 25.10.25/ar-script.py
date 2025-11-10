import mysql.connector
import os
from dotenv import load_dotenv
import google.generativeai as genai
import json
import time

# Load environment variables from .env file
#load_dotenv()#

# --- Configuration ---
DB_HOST = 'localhost'
DB_USER = 'root'
DB_PASSWORD = "200800"
DB_DATABASE = 'medicines'
GEMINI_API_KEY = "AIzaSyC6g9j5hOx-LQIpGIJFEgRsUm8HHoKEihQ"
# TARGET_BRANCH will be asked from the user
STATE_FILE = 'ar_script_state.json' # File to save/load script state

# Configure Gemini API
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-2.5-pro')

def get_db_connection():
    """Establishes and returns a database connection."""
    try:
        conn = mysql.connector.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_DATABASE
        )
        return conn
    except mysql.connector.Error as err:
        print(f"Error connecting to database: {err}")
        return None

def save_state(skipped_medicine_ids, current_index=0):
    """Saves the current state of the script to a JSON file."""
    state = {
        'skipped_medicine_ids': list(skipped_medicine_ids),
        'current_index': current_index
    }
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f)
    print("Script state saved.")

def load_state():
    """Loads the script state from a JSON file."""
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, 'r') as f:
            state = json.load(f)
        print("Script state loaded.")
        return set(state.get('skipped_medicine_ids', [])), state.get('current_index', 0)
    return set(), 0 # Return empty set and 0 if no state file

def get_medicines_to_process(conn, skipped_medicine_ids, target_branch):
    """
    Fetches medicine items that need processing (arabic_name is NULL,
    have batches in TARGET_BRANCH, and haven't been explicitly skipped).
    """
    cursor = conn.cursor(dictionary=True)
    query = """
    SELECT DISTINCT m.id, m.item_name
    FROM medicines_table m
    JOIN batches b ON m.id = b.medicine_id
    WHERE m.arabic_name IS NULL
      AND b.branch = %s
    """
    try:
        cursor.execute(query, (target_branch,))
        
        # Filter out skipped IDs in Python
        all_medicines = cursor.fetchall()
        medicines = [med for med in all_medicines if med['id'] not in skipped_medicine_ids]
        
        return medicines
    except mysql.connector.Error as err:
        print(f"Error fetching medicines: {err}")
        return []
    finally:
        cursor.close()
        

def get_arabic_translation_from_gemini(item_name):
    """
    Uses Gemini API to get an Arabic translation for a given item name.
    Returns a dictionary with success status and translation/certainty or error.
    """
    # Example: PANADOL COLD AND FLU CAPLETS 24 S -> باندول برد و زكام حبوب حبة
    prompt = f"""
    Translate the following pharmaceutical/product name to Arabic: '{item_name}'
    Respond ONLY with a JSON object.
    1. If you are 100% certain of the translation (e.g., it's a common product like 'PANADOL'), respond with:
       {{"certain": true, "translation": "الترجمة"}}
    2. If you are *not* 100% certain (e.g., it's a complex name, a supplement, or could be ambiguous), respond with:
       {{"certain": false, "translation": "الترجمة المقترحة"}}
    """

    try:
        response = model.generate_content(prompt)
        text_response = response.text.strip().replace("```json", "").replace("```", "")
        data = json.loads(text_response)

        if 'translation' in data and 'certain' in data:
            return {'success': True, 'data': data}
        else:
            print(f"Gemini response for '{item_name}' did not contain 'translation' and 'certain' keys: {data}")
            return {'success': False, 'error': 'Invalid JSON format from API'}
    except Exception as e:
        print(f"Error calling Gemini API for '{item_name}': {e}")
        return {'success': False, 'error': str(e)}

def update_medicine_arabic_name(conn, medicine_id, arabic_name):
    """
    Updates the arabic_name column for a given medicine_id.
    """
    cursor = conn.cursor()
    query = """
    UPDATE medicines_table
    SET arabic_name = %s
    WHERE id = %s
    """
    try:
        cursor.execute(query, (arabic_name, medicine_id))
        conn.commit()
        print(f"Updated medicine ID {medicine_id} with Arabic name: {arabic_name}")
    except mysql.connector.Error as err:
        print(f"Error updating medicine ID {medicine_id}: {err}")
        conn.rollback()
    finally:
        cursor.close()

def main():
    conn = get_db_connection()
    if not conn:
        return
        
    # --- NEW: Ask for target branch ---
    target_branch = input("Enter the target branch name (e.g., 'ghu2'): ").strip()
    if not target_branch:
        print("Branch name cannot be empty. Exiting.")
        return

    # Load skipped IDs and starting index
    skipped_medicine_ids, start_index = load_state()
    # Pass skipped IDs and branch to filter
    medicines_to_process = get_medicines_to_process(conn, skipped_medicine_ids, target_branch)

    print(f"\nFound {len(medicines_to_process)} new/un-skipped medicines to translate for branch '{target_branch}'.")
    print(f"Resuming from index {start_index}, ignoring {len(skipped_medicine_ids)} previously skipped items.")
    
    print("\n--- PRESS Ctrl+C AT ANY TIME TO PAUSE AND SAVE STATE ---")
    
    current_item_index = start_index # To keep track of the index for Ctrl+C

    try:
        for i in range(start_index, len(medicines_to_process)):
            current_item_index = i # Update current index
            medicine = medicines_to_process[i]
            medicine_id = medicine['id']
            item_name = medicine['item_name']

            print(f"\nProcessing '{item_name}' (ID: {medicine_id})... [{i + 1} of {len(medicines_to_process)}]")

            gemini_result = get_arabic_translation_from_gemini(item_name)

            # --- MODIFIED: Auto-accept any successful translation ---
            if gemini_result['success']:
                translation = gemini_result['data']['translation']
                
                print(f"  Gemini translation: {translation}")
                print(f"  Automatically updating.")
                
                update_medicine_arabic_name(conn, medicine_id, translation)
                save_state(skipped_medicine_ids, i + 1)
                time.sleep(0.5) # Small delay
            
            else:
                # This is the "API failure" block, which remains the same
                print(f"Could not get translation for '{item_name}': {gemini_result.get('error', 'Unknown API error')}. Skipping.")
                skipped_medicine_ids.add(medicine_id) # Add to skipped list
                save_state(skipped_medicine_ids, i + 1) # Save skipped list

        print("\nScript finished processing all available medicines.")

    except KeyboardInterrupt:
        print(f"\n--- PAUSING SCRIPT (Ctrl+C detected) ---")
        print(f"Saving state at index {current_item_index}. This item will be re-processed on next run.")
        save_state(skipped_medicine_ids, current_item_index) # Save the current index

    finally:
        if conn and conn.is_connected():
            print("Closing database connection.")
            conn.close()

if __name__ == "__main__":
    main()