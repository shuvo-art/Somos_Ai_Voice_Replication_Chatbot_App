import sys
import json
import google.generativeai as genai
from elevenlabs.client import ElevenLabs

api_key = "AIzaSyB01ouUyKFz7IGzCgEnBdHnEY9QRQXPfIQ"
genai.configure(api_key=api_key)

def generate_ai_response_and_convert_to_audio(user_input, cloned_voice_id, user_data, output_audio_path):
    prompt = f"""
You are an AI assistant having a warm, caring, and supportive conversation with a user. The goal is to reply in a natural, loving tone, based on the context of the user's input, but without repeating what the user said.

Here is some information about the user:

- The user's loved one (AI's cloned voice) is named {user_data.get('lovedOneName', 'Unknown')}.
- The user and their loved one have a special bond. The loved one calls the user {user_data.get('nicknameForUser', 'Unknown')}.
- The user and their loved one have shared experiences, such as {user_data.get('favoriteSong', 'Unknown')} or their favorite topics, like {user_data.get('favoriteTopic', 'Unknown')}.
- The loved one has a distinctive way of greeting the user, saying: "{user_data.get('distinctGreeting', 'Unknown')}", and a special farewell phrase: "{user_data.get('distinctGoodbye', 'Unknown')}".
- The user's birthday is {user_data.get('userBirthday', 'Unknown')}, and the loved one's birthday is {user_data.get('lovedOneBirthday', 'Unknown')}.
- The loved one often says: "{user_data.get('signaturePhrase', 'Unknown')}".

**User input:** "{user_input}"

**Respond naturally based on the user's input.** Keep the response warm and loving, just like how the user’s loved one would respond. Don't repeat the user’s words; focus on giving a thoughtful and supportive reply. If the user brings up any of the special topics or moments, incorporate them into the conversation in a natural and caring way.
"""

    model = genai.GenerativeModel("gemini-1.5-flash")
    response = model.generate_content([prompt])
    ai_response_text = response.text.strip()

    print(f"User's loved one responds: {ai_response_text}")
    client = ElevenLabs(api_key="sk_7d8ac95fd298ce80955b4e070796a0412ba345f5e4266cc8")
    audio_stream = client.generate(text=ai_response_text, voice=cloned_voice_id, model="eleven_multilingual_v2")
    transformed_audio = b''.join(list(audio_stream))

    with open(output_audio_path, "wb") as output_file:
        output_file.write(transformed_audio)

    return output_audio_path

if __name__ == "__main__":
    if len(sys.argv) != 5:
        print("Usage: python generate_ai_response.py <user_input> <cloned_voice_id> <user_data_json> <output_audio_path>")
        sys.exit(1)

    user_input = sys.argv[1]
    cloned_voice_id = sys.argv[2]
    user_data = json.loads(sys.argv[3])
    output_audio_path = sys.argv[4]

    generated_audio_path = generate_ai_response_and_convert_to_audio(user_input, cloned_voice_id, user_data, output_audio_path)
    print(f"Generated audio saved at: {generated_audio_path}")