import os
import sys
import noisereduce as nr
import soundfile as sf
import tempfile
import subprocess
import librosa
from elevenlabs import clone, voices, set_api_key
import requests
import json
from dotenv import load_dotenv
import traceback

# Load environment variables from .env file
load_dotenv()

# Fetch the ElevenLabs API key from an environment variable
API_KEY = os.getenv("ELEVENLABS_API_KEY")
if not API_KEY:
    print("Error: ELEVENLABS_API_KEY environment variable not set.", file=sys.stderr)
    sys.exit(1)
set_api_key(API_KEY)

def validate_audio_file(input_path: str) -> bool:
    """Validate if the input file is a valid audio file using ffprobe."""
    print(f"Validating file format for: {input_path}")
    command = ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", input_path]
    try:
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if result.returncode != 0:
            print(f"FFprobe error: {result.stderr}", file=sys.stderr)
            return False
        stream_info = json.loads(result.stdout)
        return any(stream["codec_type"] == "audio" for stream in stream_info.get("streams", []))
    except Exception as e:
        print(f"Error validating audio file: {str(e)}", file=sys.stderr)
        return False

def convert_audio_to_wav(input_path: str) -> str:
    print(f"Converting {input_path} to WAV format")
    output_path = tempfile.mktemp(suffix=".wav")
    command = ["ffmpeg", "-y", "-i", input_path, "-ar", "16000", "-ac", "1", output_path]
    try:
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if result.returncode != 0:
            print(f"FFmpeg error: {result.stderr}", file=sys.stderr)
            raise RuntimeError(f"Failed to convert audio to WAV: {result.stderr}")
        if not os.path.exists(output_path):
            raise RuntimeError(f"WAV file was not created: {output_path}")
        print(f"Converted to WAV: {output_path}")
        return output_path
    except Exception as e:
        print(f"Error converting audio: {str(e)}", file=sys.stderr)
        raise

def delete_voice_by_id(voice_id: str):
    print(f"Deleting voice with ID: {voice_id}")
    url = f"https://api.elevenlabs.io/v1/voices/{voice_id}"
    headers = {
        "xi-api-key": API_KEY,
        "accept": "application/json"
    }
    try:
        response = requests.delete(url, headers=headers)
        if response.status_code == 204:
            print(f"Deleted voice ID: {voice_id}")
        else:
            print(f"Failed to delete voice ID: {voice_id}, Status: {response.status_code}, Message: {response.text}", file=sys.stderr)
    except Exception as e:
        print(f"Error deleting voice: {str(e)}", file=sys.stderr)
        raise

def remove_noise_and_clone_voice(input_audio_path, clone_name):
    print(f"Step 1: Starting process for: {input_audio_path}, clone_name: {clone_name}")
    description = "a person talking"

    try:
        # Step 2: Resolve absolute path
        input_audio_path = os.path.join('/app/uploads', os.path.basename(input_audio_path))
        print(f"Step 2: Resolved absolute path: {input_audio_path}")

        # Step 3: Check if input audio file exists
        if not os.path.exists(input_audio_path):
            raise FileNotFoundError(f"Input audio file not found: {input_audio_path}")

        # Step 4: Validate audio file format
        print("Step 3: Validating audio file format")
        if not validate_audio_file(input_audio_path):
            raise ValueError(f"Invalid audio file format: {input_audio_path}")

        # Step 5: Convert to WAV
        print("Step 4: Converting audio to .wav format")
        converted_wav_path = convert_audio_to_wav(input_audio_path)

        # Step 6: Load and process
        print("Step 5: Loading WAV audio with librosa")
        audio_data, sample_rate = librosa.load(converted_wav_path, sr=16000, mono=True)
        print(f"Loaded: sample_rate={sample_rate}, shape={audio_data.shape}")

        # Step 7: Reduce noise
        print("Step 6: Reducing noise")
        reduced_noise_audio = nr.reduce_noise(y=audio_data, sr=sample_rate, stationary=True, prop_decrease=0.75)

        # Step 8: Save noise-reduced to temp file
        print("Step 7: Saving noise-reduced audio")
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp_file:
            sf.write(tmp_file.name, reduced_noise_audio, sample_rate)
            tmp_file_path = tmp_file.name
        print(f"Saved noise-reduced audio to: {tmp_file_path}")

        # Step 9: Reuse voice if already exists
        print("Step 8: Checking for existing voice")
        existing = [v for v in voices() if v.name == clone_name]
        if existing:
            print(f"Voice with name '{clone_name}' already exists. Reusing ID: {existing[0].voice_id}")
            os.remove(tmp_file_path)
            os.remove(converted_wav_path)
            return existing[0].voice_id

        # Step 10: Check limit and delete all old voices if full
        print("Step 9: Checking voice limit")
        all_voices = voices()
        if len(all_voices) >= 30:
            print("Voice limit reached. Deleting all previous voices...")
            for v in all_voices:
                delete_voice_by_id(v.voice_id)

        # Step 11: Clone
        print("Step 10: Cloning voice...")
        voice = clone(name=clone_name, description=description, files=[tmp_file_path])
        print(f"Voice cloned successfully, ID: {voice.voice_id}")

        # Step 12: Clean up
        print("Step 11: Cleaning up temporary files")
        os.remove(tmp_file_path)
        os.remove(converted_wav_path)
        return voice.voice_id

    except Exception as e:
        print(f"Error in remove_noise_and_clone_voice: {str(e)}\n{traceback.format_exc()}", file=sys.stderr)
        if 'converted_wav_path' in locals() and os.path.exists(converted_wav_path):
            os.remove(converted_wav_path)
        if 'tmp_file_path' in locals() and os.path.exists(tmp_file_path):
            os.remove(tmp_file_path)
        raise

if __name__ == "__main__":
    print(f"Args: {sys.argv}")
    if len(sys.argv) != 3:
        print("Usage: python audio_cloning.py <input_audio_path> <clone_name>", file=sys.stderr)
        sys.exit(1)

    input_audio_path = sys.argv[1]
    clone_name = sys.argv[2]

    try:
        voice_id = remove_noise_and_clone_voice(input_audio_path, clone_name)
        print(f"Cloned voice ID: {voice_id}")
        sys.stdout.flush()
    except Exception as e:
        print(f"Execution failed: {str(e)}\n{traceback.format_exc()}", file=sys.stderr)
        sys.exit(1)