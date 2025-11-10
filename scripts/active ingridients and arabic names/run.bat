@echo off

echo Running sync_medicines.py...
python sync_medicines.py

echo Running ctpr_to_medicines_id_sync.py...
python ctpr_to_medicines_id_sync.py

echo Both scripts have finished.
pause
