import os
import sys
import noisereduce as nr
import soundfile as sf
from elevenlabs.client import ElevenLabs
import tempfile

def remove_noise_and_clone_voice(input_audio_path, clone_name):
    print(f"Step 1: Starting voice cloning process for input: {input_audio_path}, clone_name: {clone_name}")
    description = "a person talking"
    try:
        print("Step 2: Reading audio file")
        audio_data, sample_rate = sf.read(input_audio_path)
        print(f"Step 3: Audio read successfully, sample_rate: {sample_rate}, data shape: {audio_data.shape}")
        
        print("Step 4: Reducing noise from audio")
        reduced_noise_audio = nr.reduce_noise(y=audio_data, sr=sample_rate)
        print("Step 5: Noise reduction completed")
        
        print("Step 6: Creating temporary file for noise-reduced audio")
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp_file:
            sf.write(tmp_file.name, reduced_noise_audio, sample_rate)
            tmp_file_path = tmp_file.name
        print(f"Step 7: Temporary file created at: {tmp_file_path}")
        
        print("Step 8: Initializing ElevenLabs client")
        client = ElevenLabs(api_key="sk_7d8ac95fd298ce80955b4e070796a0412ba345f5e4266cc8")
        print("Step 9: Cloning voice with ElevenLabs")
        voice = client.clone(name=clone_name, description=description, files=[tmp_file_path])
        print(f"Step 10: Voice cloned successfully, voice_id: {voice.voice_id}")
        
        print(f"Step 11: Cleaning up temporary file: {tmp_file_path}")
        os.remove(tmp_file_path)
        print("Step 12: Temporary file removed")
        
        return voice.voice_id
    except sf.LibsndfileError as e:
        print(f"Step 13: Error reading audio file: {str(e)}")
        raise
    except ValueError as e:
        print(f"Step 13: Error during noise reduction: {str(e)}")
        raise
    except Exception as e:  # Catch all exceptions, including ElevenLabs-specific ones
        print(f"Step 13: Unexpected error during voice cloning: {str(e)}")
        raise

if __name__ == "__main__":
    print(f"Debug: sys.argv = {sys.argv}")  # Debug: Log arguments
    if len(sys.argv) != 3:
        print("Usage: python audio_cloning.py <input_audio_path> <clone_name>")
        sys.exit(1)

    input_audio_path = sys.argv[1]
    clone_name = sys.argv[2]
    try:
        print(f"Main: Starting execution with input_audio_path: {input_audio_path}, clone_name: {clone_name}")
        cloned_voice_id = remove_noise_and_clone_voice(input_audio_path, clone_name)
        print(f"Cloned voice ID: {cloned_voice_id}")  # Ensure this matches the expected format
        sys.stdout.flush()  # Force flush to ensure output is sent
    except Exception as e:
        print(f"Main: Execution failed with error: {str(e)}")
        sys.stdout.flush()  # Force flush for error message
        sys.exit(1)