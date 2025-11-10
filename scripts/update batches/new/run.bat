@echo off
echo Running Batch Update Script...
echo Make sure 'script.py', '.env', and '%CSV_FILENAME%' are in this directory.
echo Make sure 'mysqldump' is in your system PATH for backup.

python script.py

echo.
echo Script finished.
pause