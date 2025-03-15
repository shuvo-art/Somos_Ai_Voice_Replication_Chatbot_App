import os
import noisereduce as nr
import soundfile as sf
from elevenlabs.client import ElevenLabs
import tempfile

def remove_noise_and_clone_voice(input_audio_path, clone_name):
    """
    Function to remove background noise from an audio file and clone the voice.

    Parameters:
        input_audio_path (str): Path to the input audio file to process.
        clone_name (str): The name for the cloned voice (e.g., "Alex").

    Returns:
        voice_id (str): ID of the cloned voice.
    """
    description = "a person talking"
    audio_data, sample_rate = sf.read(input_audio_path)
    reduced_noise_audio = nr.reduce_noise(y=audio_data, sr=sample_rate)

    with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp_file:
        sf.write(tmp_file.name, reduced_noise_audio, sample_rate)
        tmp_file_path = tmp_file.name  
    client = ElevenLabs(api_key="sk_7d8ac95fd298ce80955b4e070796a0412ba345f5e4266cc8")
    voice = client.clone(
        name=clone_name,
        description=description,
        files=[tmp_file_path], 
    )
    os.remove(tmp_file_path)
    return voice.voice_id


if __name__ == "__main__":
    input_audio_path = "/content/Avenue 03.wav"  
    clone_name = "Fahad"  
    cloned_voice_id = remove_noise_and_clone_voice(input_audio_path, clone_name)
    print(f"Cloned voice ID: {cloned_voice_id}")