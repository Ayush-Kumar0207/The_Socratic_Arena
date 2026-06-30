# Socratic Arena Free STT

This service gives Socratic Arena a no-paid-API speech-to-text path.

It uses `faster-whisper`, an open-source Whisper implementation. The model runs on the machine hosting this service, so there is no Deepgram, Google STT, or OpenAI API bill. The first run downloads the selected open model once.

## Start On Windows

```powershell
cd stt_service
.\start.ps1
```

Default settings:

- URL: `http://127.0.0.1:5055`
- Model: `small.en`
- Compute: `int8`

For better accuracy on a strong machine:

```powershell
$env:FREE_STT_MODEL="medium.en"
.\start.ps1
```

For faster/lighter inference:

```powershell
$env:FREE_STT_MODEL="base.en"
.\start.ps1
```

## Browser/Backend Fallback Order

The frontend tries:

1. Direct local STT: `http://127.0.0.1:5055/transcribe`
2. Backend proxy: `/api/stt/transcribe`
3. Browser `SpeechRecognition`

This keeps the app free to run while still working when the local STT service is not started.
