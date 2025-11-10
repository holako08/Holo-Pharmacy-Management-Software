@echo off
REM This batch file runs the Python script to update the database.

echo =======================================================
echo  Starting Database Update Script
echo =======================================================

REM --- Step 1: Check for Python ---
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Python does not seem to be installed or is not in the system's PATH.
    echo Please install Python 3 and ensure it's added to your PATH.
    pause
    exit /b 1
)

REM --- Step 2: Install required Python libraries ---
echo.
echo Installing required Python libraries (pandas, mysql-connector-python, openpyxl)...
pip install pandas mysql-connector-python openpyxl >nul

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to install required Python packages.
    echo Please check your internet connection and pip installation.
    pause
    exit /b 1
)

echo Libraries are installed/up-to-date.

REM --- Step 3: Run the Python script ---
echo.
echo Running the update_db.py script...
echo.
python Script.py

echo.
echo =======================================================
echo  Script finished. Check the output above for details.
echo =======================================================
echo.
pause
