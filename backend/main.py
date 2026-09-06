import os
import re
import subprocess
import sys
import time
import tempfile
import wave
from pathlib import Path

import requests
import whisper

from piper import PiperVoice
from piper.config import SynthesisConfig

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

app = FastAPI()

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

OLLAMA_URL = "http://localhost:11434/api/chat"
OLLAMA_MODEL = "shuri"

PIPER_MODEL = "en_US-arctic-medium"
PIPER_SPEAKER = 16
PIPER_DATA_DIR = Path(__file__).resolve().parent

PIPER_MODEL_PATH = PIPER_DATA_DIR / f"{PIPER_MODEL}.onnx"
piper_voice = PiperVoice.load(str(PIPER_MODEL_PATH))

whisper_model = whisper.load_model("tiny")

SYSTEM_PROMPT = (
    "You are SHURI, a personal AI assistant. "
    "Your name is SHURI. "
    "Never call yourself any other name. "
    "If the user asks your name, always say your name is SHURI. "
    "Your primary user is Diya. "
    "Speak naturally, calmly, intelligently, and warmly. "
    "Keep responses complete but reasonably concise. "
    "Answer directly without unnecessary explanation. "
    "Never use emojis or emoticons. "
    "Do not repeatedly say your name. "
    "Do not use dramatic robotic language. "
    "Give only the final answer. "
    "Never reveal internal reasoning or thinking. "
    "Remember relevant information from the conversation "
    "and use it naturally in later responses."
)

conversation = [
    {
        "role": "system",
        "content": SYSTEM_PROMPT
    }
]

class ChatRequest(BaseModel):
    message: str

class SpeakRequest(BaseModel):
    text: str

@app.get("/")
def home():
    return {"message": "SHURI is online"}

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

    suffix = os.path.splitext(file.filename)[1] or ".webm"
    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=suffix
        ) as temp_file:
            temp_file.write(audio_data)
            temp_path = temp_file.name

        start_time = time.time()

        result = whisper_model.transcribe(
            temp_path,
            fp16=False,
            language="en",
            temperature=0,
            condition_on_previous_text=False
        )

        print(
            f"[TIMING] Whisper: "
            f"{time.time() - start_time:.2f}s"
        )

        return {
            "text": result.get("text", "").strip()
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Transcription failed: {exc}"
        )

    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)

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

def remove_emojis(text):
    if not text:
        return ""

    pattern = re.compile(
        "["
        "\U0001F300-\U0001F5FF"
        "\U0001F600-\U0001F64F"
        "\U0001F680-\U0001F6FF"
        "\U0001F700-\U0001F77F"
        "\U0001F780-\U0001F7FF"
        "\U0001F800-\U0001F8FF"
        "\U0001F900-\U0001F9FF"
        "\U0001FA00-\U0001FAFF"
        "\U00002700-\U000027BF"
        "\U00002600-\U000026FF"
        "\U0001F1E0-\U0001F1FF"
        "]+",
        flags=re.UNICODE
    )

    return pattern.sub("", text).strip()

@app.post("/chat")
async def chat(request: ChatRequest):
    message = request.message.strip()

    if not message:
        raise HTTPException(
            status_code=400,
            detail="Message cannot be empty"
        )

    conversation.append({
        "role": "user",
        "content": message
    })

    try:
        if len(conversation) > 7:
            messages = [
                conversation[0]
            ] + conversation[-6:]
        else:
            messages = conversation

        start_time = time.time()

        response = requests.post(
            OLLAMA_URL,
            json={
                "model": OLLAMA_MODEL,
                "messages": messages,
                "stream": False,
                "think": False,
                "keep_alive": "10m",
                "options": {
                    "temperature": 0.4
                }
            },
            timeout=60
        )

        print(
            f"[TIMING] Ollama: "
            f"{time.time() - start_time:.2f}s"
        )

        if not response.ok:
            conversation.pop()

            raise HTTPException(
                status_code=response.status_code,
                detail=f"Ollama error: {response.text}"
            )

        data = response.json()

        answer = data.get(
            "message",
            {}
        ).get(
            "content",
            ""
        )

        answer = clean_thinking(answer)
        answer = remove_emojis(answer)

        if not answer:
            conversation.pop()

            raise HTTPException(
                status_code=500,
                detail="Ollama returned an empty response."
            )

        conversation.append({
            "role": "assistant",
            "content": answer
        })

        return {
            "response": answer
        }

    except requests.exceptions.ConnectionError:
        conversation.pop()

        raise HTTPException(
            status_code=503,
            detail="Could not connect to Ollama. Make sure Ollama is running."
        )

    except requests.exceptions.Timeout:
        conversation.pop()

        raise HTTPException(
            status_code=504,
            detail="Ollama took too long to respond."
        )

    except HTTPException:
        raise

    except Exception as exc:
        conversation.pop()

        raise HTTPException(
            status_code=500,
            detail=f"Chat processing failed: {exc}"
        )

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

@app.post("/speak")
async def speak(request: SpeakRequest):
    text = request.text.strip()

    if not text:
        raise HTTPException(
            status_code=400,
            detail="Text cannot be empty"
        )

    output_path = None

    try:
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=".wav"
        ) as output_file:
            output_path = output_file.name

        start_time = time.time()

        prepared_text = prepare_tts_text(text)

        # Split response into sentences
        sentences = re.split(
            r"(?<=[.!?])\s+",
            prepared_text
        )

        sentences = [
            sentence.strip()
            for sentence in sentences
            if sentence.strip()
        ]

        syn_config = SynthesisConfig(
            speaker_id=PIPER_SPEAKER
        )

        with wave.open(output_path, "wb") as wav_file:

            wav_format_set = False

            for sentence_index, sentence in enumerate(sentences):

                for audio_chunk in piper_voice.synthesize(
                    sentence,
                    syn_config=syn_config
                ):

                    if not wav_format_set:
                        wav_file.setframerate(
                            audio_chunk.sample_rate
                        )
                        wav_file.setsampwidth(
                            audio_chunk.sample_width
                        )
                        wav_file.setnchannels(
                            audio_chunk.sample_channels
                        )

                        wav_format_set = True

                    wav_file.writeframes(
                        audio_chunk.audio_int16_bytes
                    )

                # Add 0.4 seconds of silence between sentences
                if sentence_index < len(sentences) - 1:
                    silence_samples = int(
                        0.4 * piper_voice.config.sample_rate
                    )

                    silence_bytes = bytes(
                        silence_samples * 2
                    )

                    wav_file.writeframes(
                        silence_bytes
                    )

        print(
            f"[TIMING] Piper: "
            f"{time.time() - start_time:.2f}s"
        )

        return FileResponse(
            output_path,
            media_type="audio/wav",
            filename="shuri_response.wav"
        )

    except Exception as exc:

        if output_path and os.path.exists(output_path):
            os.remove(output_path)

        raise HTTPException(
            status_code=500,
            detail=f"TTS failed: {exc}"
        )

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