import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import requests
import whisper

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel


app = FastAPI()


# --------------------------------------------------
# CORS
# --------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------

OLLAMA_URL = "http://localhost:11434/api/chat"
OLLAMA_MODEL = "sam860/qwen3:1.7b"

PIPER_MODEL = "en_US-arctic-medium"
PIPER_SPEAKER = 16
PIPER_DATA_DIR = Path(__file__).resolve().parent


# --------------------------------------------------
# WHISPER
# --------------------------------------------------

whisper_model = whisper.load_model("base")


# --------------------------------------------------
# SYSTEM PROMPT
# --------------------------------------------------

SYSTEM_PROMPT = (
    "You are SHURI, a personal AI assistant. "
    "Your primary user is Diya. "
    "Speak naturally, calmly, intelligently, and warmly. "
    "Keep responses conversational and reasonably concise. "
    "Do not repeatedly say your name. "
    "Do not use dramatic robotic language. "
    "Give only the final answer. "
    "Never reveal internal reasoning or thinking. "
    "Remember relevant information from the conversation "
    "and use it naturally in later responses."
)


# --------------------------------------------------
# CONVERSATION MEMORY
# --------------------------------------------------

conversation = [
    {
        "role": "system",
        "content": SYSTEM_PROMPT
    }
]


# --------------------------------------------------
# REQUEST MODELS
# --------------------------------------------------

class ChatRequest(BaseModel):
    message: str


class SpeakRequest(BaseModel):
    text: str


# --------------------------------------------------
# HOME
# --------------------------------------------------

@app.get("/")
def home():
    return {
        "message": "SHURI is online"
    }


# --------------------------------------------------
# SPEECH TO TEXT - WHISPER
# --------------------------------------------------

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="No audio file provided"
        )

    audio_data = await file.read()

    if not audio_data:
        raise HTTPException(
            status_code=400,
            detail="Audio file is empty"
        )

    suffix = (
        os.path.splitext(file.filename)[1]
        or ".webm"
    )

    temp_path = None

    try:
        # Save uploaded audio temporarily
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=suffix
        ) as temp_file:

            temp_file.write(audio_data)
            temp_path = temp_file.name

        # Transcribe using Whisper
        result = whisper_model.transcribe(
            temp_path,
            fp16=False
        )

        return {
            "text": result.get(
                "text",
                ""
            ).strip()
        }

    except Exception as exc:

        raise HTTPException(
            status_code=500,
            detail=f"Transcription failed: {exc}"
        )

    finally:

        if (
            temp_path
            and os.path.exists(temp_path)
        ):
            os.remove(temp_path)


# --------------------------------------------------
# CLEAN OLLAMA THINKING TAGS
# --------------------------------------------------

def clean_thinking(text):

    if not text:
        return ""

    text = re.sub(
        r"<think>.*?</think>",
        "",
        text,
        flags=re.IGNORECASE | re.DOTALL
    )

    text = re.sub(
        r"<think>.*$",
        "",
        text,
        flags=re.IGNORECASE | re.DOTALL
    )

    text = re.sub(
        r"</think>.*$",
        "",
        text,
        flags=re.IGNORECASE | re.DOTALL
    )

    return text.strip()


# --------------------------------------------------
# CHAT - OLLAMA
# --------------------------------------------------

@app.post("/chat")
async def chat(request: ChatRequest):

    message = request.message.strip()

    if not message:
        raise HTTPException(
            status_code=400,
            detail="Message cannot be empty"
        )

    # Add user's message to conversation
    conversation.append({
        "role": "user",
        "content": message
    })

    try:

        response = requests.post(
            OLLAMA_URL,
            json={
                "model": OLLAMA_MODEL,
                "messages": conversation,
                "stream": False
            },
            timeout=120
        )

        # --------------------------------------------------
        # OLLAMA ERROR
        # --------------------------------------------------

        if not response.ok:

            conversation.pop()

            raise HTTPException(
                status_code=response.status_code,
                detail=(
                    f"Ollama error: "
                    f"{response.text}"
                )
            )

        # --------------------------------------------------
        # READ RESPONSE
        # --------------------------------------------------

        data = response.json()

        answer = clean_thinking(
            data
            .get("message", {})
            .get("content", "")
        )

        # --------------------------------------------------
        # EMPTY RESPONSE
        # --------------------------------------------------

        if not answer:

            conversation.pop()

            raise HTTPException(
                status_code=500,
                detail="Ollama returned an empty response."
            )

        # Add AI response to conversation memory
        conversation.append({
            "role": "assistant",
            "content": answer
        })

        return {
            "response": answer
        }

    # --------------------------------------------------
    # OLLAMA NOT RUNNING
    # --------------------------------------------------

    except requests.exceptions.ConnectionError:

        conversation.pop()

        raise HTTPException(
            status_code=503,
            detail=(
                "Could not connect to Ollama. "
                "Make sure Ollama is running."
            )
        )

    # --------------------------------------------------
    # OLLAMA TIMEOUT
    # --------------------------------------------------

    except requests.exceptions.Timeout:

        conversation.pop()

        raise HTTPException(
            status_code=504,
            detail=(
                "Ollama took too long to respond."
            )
        )

    # --------------------------------------------------
    # HTTP EXCEPTION
    # --------------------------------------------------

    except HTTPException:
        raise

    # --------------------------------------------------
    # OTHER ERRORS
    # --------------------------------------------------

    except Exception as exc:

        conversation.pop()

        raise HTTPException(
            status_code=500,
            detail=f"Chat processing failed: {exc}"
        )


# --------------------------------------------------
# PREPARE TEXT FOR PIPER
# --------------------------------------------------

def prepare_tts_text(text):

    replacements = [

        (
            r"\bS\.H\.U\.R\.I\.?\b",
            "[[ ʃ ˈuː ɹ iː ]]"
        ),

        (
            r"\bSHURI\b",
            "[[ ʃ ˈuː ɹ iː ]]"
        ),

        (
            r"\bShuri\b",
            "[[ ʃ ˈuː ɹ iː ]]"
        ),

        (
            r"\bshuri\b",
            "[[ ʃ ˈuː ɹ iː ]]"
        ),

        (
            r"\bDiya\b",
            "[[ d iː j ɑː ]]"
        ),

        (
            r"\bDIYA\b",
            "[[ d iː j ɑː ]]"
        ),

        (
            r"\bdiya\b",
            "[[ d iː j ɑː ]]"
        )
    ]

    for pattern, replacement in replacements:

        text = re.sub(
            pattern,
            replacement,
            text
        )

    return text


# --------------------------------------------------
# TEXT TO SPEECH - PIPER
# --------------------------------------------------

@app.post("/speak")
async def speak(request: SpeakRequest):

    text = request.text.strip()

    if not text:
        raise HTTPException(
            status_code=400,
            detail="Text cannot be empty"
        )

    model_path = (
        PIPER_DATA_DIR /
        f"{PIPER_MODEL}.onnx"
    )

    if not model_path.exists():

        raise HTTPException(
            status_code=500,
            detail=(
                f"Piper model not found: "
                f"{model_path}"
            )
        )

    output_path = None

    try:

        # Create temporary WAV file
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=".wav"
        ) as output_file:

            output_path = output_file.name

        # Piper command
        command = [
            sys.executable,
            "-m",
            "piper",

            "--data-dir",
            str(PIPER_DATA_DIR),

            "-m",
            PIPER_MODEL,

            "-s",
            str(PIPER_SPEAKER),

            "-f",
            output_path,

            "--",
            prepare_tts_text(text)
        ]

        process = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=120
        )

        # --------------------------------------------------
        # PIPER ERROR
        # --------------------------------------------------

        if process.returncode != 0:

            error = (
                process.stderr.strip()
                or process.stdout.strip()
                or "Piper failed."
            )

            if os.path.exists(output_path):
                os.remove(output_path)

            raise HTTPException(
                status_code=500,
                detail=error
            )

        # --------------------------------------------------
        # CHECK AUDIO FILE
        # --------------------------------------------------

        if not os.path.exists(output_path):

            raise HTTPException(
                status_code=500,
                detail="Piper did not create audio."
            )

        return FileResponse(
            output_path,
            media_type="audio/wav",
            filename="shuri_response.wav"
        )

    except subprocess.TimeoutExpired:

        if (
            output_path
            and os.path.exists(output_path)
        ):
            os.remove(output_path)

        raise HTTPException(
            status_code=504,
            detail="Piper took too long."
        )

    except HTTPException:
        raise

    except Exception as exc:

        if (
            output_path
            and os.path.exists(output_path)
        ):
            os.remove(output_path)

        raise HTTPException(
            status_code=500,
            detail=f"TTS failed: {exc}"
        )


# --------------------------------------------------
# RESET CONVERSATION
# --------------------------------------------------

@app.post("/reset")
def reset_conversation():

    global conversation

    conversation = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT
        }
    ]

    return {
        "message": "Conversation reset"
    }