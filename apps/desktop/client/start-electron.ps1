$env:NODE_OPTIONS = ""
$electronPath = ".\node_modules\.bin\electron.cmd"
$appPath = "."

Start-Process -FilePath $electronPath -ArgumentList $appPath,"--no-sandbox" -NoNewWindow