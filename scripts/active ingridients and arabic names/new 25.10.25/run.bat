@echo off
REM Load environment variables (optional, python-dotenv handles it)
REM If you wanted to set DB_PASSWORD directly here for some reason, it would be:
REM set DB_PASSWORD=your_database_password
REM set GEMINI_API_KEY=your_gemini_api_key

REM Ensure you have activated your Python virtual environment if you are using one
REM For example:
REM call venv\Scripts\activate.bat

echo Starting the medicine active ingredient updater script...
python script.py
echo Script finished or paused.
pause