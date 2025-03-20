import openai
from elevenlabs.client import ElevenLabs
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Fetch the OpenAI API key from an environment variable
openai.api_key = os.getenv("OPENAI_API_KEY")
if not openai.api_key:
    print("Error: OPENAI_API_KEY environment variable not set.")
    sys.exit(1)

    
def generate_ai_response_and_convert_to_audio(user_input, cloned_voice_id, user_data, output_audio_path):
    """
    Function to generate AI response based on user input and convert it to cloned voice audio.
    Now supports additional personalized data.

    Parameters:
        user_input (str): The text input from the user.
        cloned_voice_id (str): The ID of the cloned voice.
        user_data (dict): Dictionary containing user and loved one personalized data.
        output_audio_path (str): The path where the generated audio will be saved.

    Returns:
        generated_audio_path (str): Path to the generated audio file.
    """
    prompt = f"""
You are an AI assistant having a warm, caring, and supportive conversation with a user. The goal is to reply in a natural, loving tone, based on the context of the user's input, but without repeating what the user said. 

Here is some information about the user:

- The user's loved one (AI's cloned voice) is named {user_data.get('loved_one_name', 'Unknown')}.
- The user and their loved one have a special bond. The loved one calls the user {user_data.get('nickname_for_user', 'Unknown')}.
- The user and their loved one have shared experiences, such as {user_data.get('favorite_song', 'Unknown')} or their favorite topics, like {user_data.get('favorite_topic', 'Unknown')}.
- The loved one has a distinctive way of greeting the user, saying: "{user_data.get('distinct_greeting', 'Unknown')}", and a special farewell phrase: "{user_data.get('distinct_goodbye', 'Unknown')}".
- The user's birthday is {user_data.get('user_birthday', 'Unknown')}, and the loved one's birthday is {user_data.get('loved_one_birthday', 'Unknown')}.
- The loved one often says: "{user_data.get('signature_phrase', 'Unknown')}".

**User input:** "{user_input}"

**Respond naturally based on the user's input.** Keep the response warm and loving, just like how the user’s loved one would respond. Don't repeat the user’s words; focus on giving a thoughtful and supportive reply. If the user brings up any of the special topics or moments, incorporate them into the conversation in a natural and caring way.

Your responses should sound like they come from the user’s loved one. Be warm, natural, and caring, incorporating relevant details about the user's loved one or their relationship only when it feels right in the conversation.

If the user mentions something related to the favorite song, signature phrase, or special moments, include that in a personal way.
"""

    # Make the OpenAI API call to generate a response using GPT-4
    try:
        response = openai.ChatCompletion.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are a warm, caring, and supportive assistant."},
                {"role": "user", "content": prompt}
            ]
        )

        ai_response_text = response['choices'][0]['message']['content'].strip()
        print(f"User's loved one responds: {ai_response_text}")
    except Exception as e:
        print(f"Error generating AI response: {e}")
        return None
    
    # Now convert the AI response to speech
    client = ElevenLabs(api_key="sk_64d6b4479e000033f8c46242b98f1dc388a160e8855286e1")
    try:
        audio_stream = client.generate(
            text=ai_response_text,
            voice=cloned_voice_id,
            model="eleven_multilingual_v2",
        )
        transformed_audio = b''.join(list(audio_stream))
        with open(output_audio_path, "wb") as output_file:
            output_file.write(transformed_audio)
    except Exception as e:
        print(f"Error generating speech: {e}")
        return None
    
    return output_audio_path


if __name__ == "__main__":
    user_data = {
        'loved_one_name': 'Mom',
        'loved_one_birthday': '1990-05-15',
        'user_birthday': '2015-11-20',
        'nickname_for_loved_one': 'Fahad',
        'nickname_for_user': 'Mom',
        'favorite_song': 'You Are My Sunshine',
        'signature_phrase': 'I love you to the stars and back!',
        'favorite_topic': 'traveling',
        'distinct_greeting': 'Hey, Mom! How are you today?',
        'distinct_goodbye': 'Catch you later, love!',
        'additional_data': 'The user loves cooking and enjoys hiking in the mountains.'
    }
    user_input = "How are you my son?"  
    cloned_voice_id = "etbmwBxMSr4d1abqNSYy" 
    output_audio_path = "generated_audio.wav"

    generated_audio_path = generate_ai_response_and_convert_to_audio(user_input, cloned_voice_id, user_data, output_audio_path)

    if generated_audio_path:
        print(f"Generated audio saved at: {generated_audio_path}")
    else:
        print("There was an error generating the audio.")