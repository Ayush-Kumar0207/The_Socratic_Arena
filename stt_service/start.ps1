$ErrorActionPreference = "Stop"

if (-not (Test-Path ".venv")) {
  python -m venv .venv
}

.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

if (-not $env:FREE_STT_MODEL) {
  $env:FREE_STT_MODEL = "small.en"
}

if (-not $env:FREE_STT_COMPUTE_TYPE) {
  $env:FREE_STT_COMPUTE_TYPE = "int8"
}

.\.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 5055
