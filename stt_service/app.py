import os
import tempfile
import threading
import time
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel


MODEL_NAME = os.getenv("FREE_STT_MODEL", "small.en")
DEVICE = os.getenv("FREE_STT_DEVICE", "auto")
COMPUTE_TYPE = os.getenv("FREE_STT_COMPUTE_TYPE", "int8")
CPU_THREADS = int(os.getenv("FREE_STT_CPU_THREADS", "4"))
BEAM_SIZE = int(os.getenv("FREE_STT_BEAM_SIZE", "5"))
DEFAULT_LANGUAGE = os.getenv("FREE_STT_LANGUAGE", "en")
MAX_AUDIO_BYTES = int(os.getenv("FREE_STT_MAX_AUDIO_BYTES", str(8 * 1024 * 1024)))
MIN_TEXT_CHARS = int(os.getenv("FREE_STT_MIN_TEXT_CHARS", "2"))

app = FastAPI(title="Socratic Arena Free STT", version="1.0.0")

cors_origins = [
    origin.strip()
    for origin in os.getenv("FREE_STT_CORS_ORIGINS", "*").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_private_network_header(request, call_next):
    response = await call_next(request)
    response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


_model = None
_model_lock = threading.Lock()
_started_at = time.time()


def get_model():
    global _model

    if _model is None:
        with _model_lock:
            if _model is None:
                print(
                    f"[free-stt] Loading faster-whisper model={MODEL_NAME} "
                    f"device={DEVICE} compute_type={COMPUTE_TYPE}"
                )
                _model = WhisperModel(
                    MODEL_NAME,
                    device=DEVICE,
                    compute_type=COMPUTE_TYPE,
                    cpu_threads=CPU_THREADS,
                )

    return _model


def confidence_from_segments(segments):
    scores = []
    for segment in segments:
        no_speech_prob = getattr(segment, "no_speech_prob", None)
        avg_logprob = getattr(segment, "avg_logprob", None)

        if no_speech_prob is not None:
            scores.append(max(0.0, min(1.0, 1.0 - float(no_speech_prob))))
        elif avg_logprob is not None:
            scores.append(max(0.0, min(1.0, (float(avg_logprob) + 1.5) / 1.5)))

    if not scores:
        return 0.0

    return sum(scores) / len(scores)


def suffix_for_upload(filename, content_type):
    source = filename or ""
    suffix = Path(source).suffix.lower()
    if suffix:
        return suffix

    if "ogg" in (content_type or ""):
        return ".ogg"
    if "wav" in (content_type or ""):
        return ".wav"
    if "mp4" in (content_type or ""):
        return ".m4a"
    return ".webm"


@app.get("/health")
def health():
    return {
        "healthy": True,
        "engine": "faster-whisper",
        "model": MODEL_NAME,
        "device": DEVICE,
        "computeType": COMPUTE_TYPE,
        "ready": _model is not None,
        "uptimeSeconds": round(time.time() - _started_at, 2),
    }


@app.post("/warmup")
def warmup():
    get_model()
    return {"success": True, "engine": "faster-whisper", "model": MODEL_NAME}


@app.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    language: str = Form(DEFAULT_LANGUAGE),
):
    contents = await audio.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty audio upload")

    if len(contents) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio chunk is too large")

    suffix = suffix_for_upload(audio.filename, audio.content_type)
    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(contents)
            temp_path = temp_file.name

        model = get_model()
        segments_iter, info = model.transcribe(
            temp_path,
            language=(language or DEFAULT_LANGUAGE).split("-")[0],
            beam_size=BEAM_SIZE,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 450},
            condition_on_previous_text=False,
            no_speech_threshold=0.65,
            compression_ratio_threshold=2.4,
            log_prob_threshold=-1.0,
        )

        segments = list(segments_iter)
        text = " ".join(segment.text.strip() for segment in segments).strip()
        confidence = confidence_from_segments(segments)

        if len(text) < MIN_TEXT_CHARS or confidence < 0.2:
            text = ""

        return {
            "success": True,
            "engine": "faster-whisper",
            "model": MODEL_NAME,
            "text": text,
            "language": getattr(info, "language", language or DEFAULT_LANGUAGE),
            "languageProbability": getattr(info, "language_probability", None),
            "duration": getattr(info, "duration", None),
            "confidence": round(confidence, 4),
            "segments": [
                {
                    "start": round(segment.start, 3),
                    "end": round(segment.end, 3),
                    "text": segment.text.strip(),
                    "confidence": round(
                        max(0.0, min(1.0, 1.0 - float(getattr(segment, "no_speech_prob", 0.0)))),
                        4,
                    ),
                }
                for segment in segments
            ],
        }
    finally:
        if temp_path:
            try:
                os.unlink(temp_path)
            except OSError:
                pass
