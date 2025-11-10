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
TARGET_BRANCH = 'ghu2'
STATE_FILE = 'script_state.json' # File to save/load script state

# Configure Gemini API
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-2.5-pro') # <-- CORRECTED: Kept your specified model

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

def save_state(skipped_medicine_ids, current_index=0): # <-- MODIFIED: Renamed variable
    """Saves the current state of the script to a JSON file."""
    state = {
        'skipped_medicine_ids': list(skipped_medicine_ids), # <-- MODIFIED: Changed key name
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
        # <-- MODIFIED: Load 'skipped_medicine_ids'
        return set(state.get('skipped_medicine_ids', [])), state.get('current_index', 0)
    return set(), 0 # Return empty set and 0 if no state file

def get_medicines_to_process(conn, skipped_medicine_ids): # <-- MODIFIED: Renamed variable
    """
    Fetches medicine items that need processing (active_name_1 is NULL,
    have batches in TARGET_BRANCH, and haven't been explicitly skipped).
    """
    cursor = conn.cursor(dictionary=True)
    query = """
    SELECT DISTINCT m.id, m.item_name
    FROM medicines_table m
    JOIN batches b ON m.id = b.medicine_id
    WHERE m.active_name_1 IS NULL
      AND b.branch = %s
    """
    cursor.execute(query, (TARGET_BRANCH,))
    
    # <-- MODIFIED: Filter out skipped IDs in Python
    all_medicines = cursor.fetchall()
    medicines = [med for med in all_medicines if med['id'] not in skipped_medicine_ids]
    
    cursor.close()
    return medicines

def get_active_ingredients_from_gemini(item_name):
    """
    Uses Gemini API to find active ingredients for a given item name.
    Returns a list of active ingredients or a list of options if uncertain.
    """
    prompt = f"What are the main active ingredients for the product '{item_name}'? This could be a medicine (Active Pharmaceutical Ingredients or APIs) or a supplement (e.g., Glucosamine, Omega-3). Respond with a JSON object. If you are certain, provide a single 'active_ingredients' key with a list of ingredients. If you are not 100% sure or there are multiple common formulations, provide an 'options' key with a list of possible lists of active ingredients. Each option should be a list of strings."

    try:
        response = model.generate_content(prompt)
        # Assuming the API response is clean JSON.
        # You might need more robust parsing and error handling here.
        text_response = response.text.strip().replace("```json", "").replace("```", "")
        data = json.loads(text_response)

        if 'active_ingredients' in data:
            return {'certain': True, 'ingredients': data['active_ingredients']}
        elif 'options' in data:
            return {'certain': False, 'options': data['options']}
        else:
            print(f"Gemini response for '{item_name}' did not contain expected keys: {data}")
            return {'certain': False, 'options': []} # No options
    except Exception as e:
        print(f"Error calling Gemini API for '{item_name}': {e}")
        return {'certain': False, 'options': []} # Handle API errors

def update_medicine_active_ingredients(conn, medicine_id, active_ingredients):
    """
    Updates the active_name_1, active_name_2, and active_name_3 columns
    for a given medicine_id.
    """
    active_name_1 = active_ingredients[0] if len(active_ingredients) > 0 else None
    active_name_2 = active_ingredients[1] if len(active_ingredients) > 1 else None
    active_name_3 = ", ".join(active_ingredients[2:]) if len(active_ingredients) > 2 else None

    cursor = conn.cursor()
    query = """
    UPDATE medicines_table
    SET active_name_1 = %s, active_name_2 = %s, active_name_3 = %s
    WHERE id = %s
    """
    try:
        cursor.execute(query, (active_name_1, active_name_2, active_name_3, medicine_id))
        conn.commit()
        print(f"Updated medicine ID {medicine_id} with active ingredients: {', '.join(active_ingredients)}")
    except mysql.connector.Error as err:
        print(f"Error updating medicine ID {medicine_id}: {err}")
        conn.rollback()
    finally:
        cursor.close()

def main():
    conn = get_db_connection()
    if not conn:
        return

    # <-- MODIFIED: Load skipped IDs, not processed ones
    skipped_medicine_ids, start_index = load_state()
    # <-- MODIFIED: Pass skipped IDs to filter
    medicines_to_process = get_medicines_to_process(conn, skipped_medicine_ids)

    print(f"Found {len(medicines_to_process)} new/un-skipped medicines to process.")
    # <-- MODIFIED: Updated print message
    print(f"Resuming from index {start_index}, ignoring {len(skipped_medicine_ids)} previously skipped items.")
    
    # --- NEW INSTRUCTION ---
    print("\n--- PRESS Ctrl+C AT ANY TIME TO PAUSE AND SAVE STATE ---")
    
    current_item_index = start_index # To keep track of the index for Ctrl+C

    # --- NEW TRY/EXCEPT/FINALLY BLOCK ---
    try:
        for i in range(start_index, len(medicines_to_process)):
            current_item_index = i # Update current index
            medicine = medicines_to_process[i]
            medicine_id = medicine['id']
            item_name = medicine['item_name']

            print(f"\nProcessing '{item_name}' (ID: {medicine_id})...")

            # <-- MODIFIED: This check is no longer needed, get_medicines_to_process handles it
            # if medicine_id in skipped_medicine_ids:
            #     print(f"Skipping '{item_name}' as it was already processed.")
            #     continue

            gemini_result = get_active_ingredients_from_gemini(item_name)

            if gemini_result['certain']:
                active_ingredients = gemini_result['ingredients']
                print(f"Gemini is certain: {', '.join(active_ingredients)}")
                update_medicine_active_ingredients(conn, medicine_id, active_ingredients)
                # <-- MODIFIED: Save state without adding to any list
                # The DB update (active_name_1) handles this for next run
                save_state(skipped_medicine_ids, i + 1)
                time.sleep(1)
            else:
                if gemini_result['options']:
                    print(f"Gemini is not 100% sure or found multiple options for '{item_name}':")
                    for idx, option in enumerate(gemini_result['options']):
                        print(f"  {idx + 1}. {', '.join(option)}")

                    while True:
                        try:
                            user_choice = input("Enter the number of the correct option, 's' to skip, or 'p' to pause: ").lower()
                            if user_choice == 'p':
                                print("Pausing script...")
                                # <-- MODIFIED: Save state with skipped IDs
                                save_state(skipped_medicine_ids, i) # Save current index
                                return # Exit script (finally block will run)
                            elif user_choice == 's':
                                print(f"Skipping '{item_name}'.")
                                skipped_medicine_ids.add(medicine_id) # <-- MODIFIED: Add to skipped list
                                save_state(skipped_medicine_ids, i + 1) # <-- MODIFIED: Save skipped list
                                break
                            else:
                                choice_idx = int(user_choice) - 1
                                if 0 <= choice_idx < len(gemini_result['options']):
                                    selected_ingredients = gemini_result['options'][choice_idx]
                                    update_medicine_active_ingredients(conn, medicine_id, selected_ingredients)
                                    # <-- MODIFIED: Save state (DB update handles this item)
                                    save_state(skipped_medicine_ids, i + 1)
                                    break
                                else:
                                    print("Invalid option. Please try again.")
                        except ValueError:
                            print("Invalid input. Please enter a number, 's', or 'p'.")
                else:
                    print(f"Could not determine active ingredients for '{item_name}' or no options found. Skipping.")
                    skipped_medicine_ids.add(medicine_id) # <-- MODIFIED: Add to skipped list
                    save_state(skipped_medicine_ids, i + 1) # <-- MODIFIED: Save skipped list

        print("\nScript finished processing all available medicines.")

    except KeyboardInterrupt:
        print(f"\n--- PAUSING SCRIPT (Ctrl+C detected) ---")
        print(f"Saving state at index {current_item_index}. This item will be re-processed on next run.")
        # <-- MODIFIED: Save state with skipped IDs
        save_state(skipped_medicine_ids, current_item_index) # Save the current index

    finally:
        if conn and conn.is_connected():
            print("Closing database connection.")
            conn.close()

if __name__ == "__main__":
    main()