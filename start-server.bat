@echo off
echo Starting server...

:: Start the server in a new background process
start cmd /k "node server.js"

:: Immediately open index.html in the browser
start http://localhost:3002/index.html
