import sounddevice as sd
from scipy.io.wavfile import write

# fs = 44100  # Sample rate
# seconds = 5  # Duration of recording

# print("Recording...")
# myrecording = sd.rec(int(seconds * fs), samplerate=fs, channels=2)
# sd.wait()  # Wait until recording is finished
# write('output.wav', fs, myrecording)  # Save as WAV file
# print("Finished")


from enum import Enum
from typing import Optional
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

# 1. Define the Structured Output Schema
class UrgencyLevel(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"
    CRITICAL = "Critical"

class WildfireReport(BaseModel):
    location: Optional[str] = Field(
        description="The location or region of the wildfire mentioned in the report."
    )
    size: Optional[str] = Field(
        description="Estimated size or area affected (e.g., '50 acres', '100 hectares', 'small spot fire')."
    )
    urgency: UrgencyLevel = Field(
        description="Assessed level of urgency based on tone, speed of propagation, and threats to life/property."
    )
    summary: str = Field(
        description="A brief 1-2 sentence summary of the report."
    )

# 2. Initialize the Client
from dotenv import load_dotenv
load_dotenv()
client = genai.Client()

# 3. Upload the Audio File
# Large or standard audio files should be uploaded via client.files.upload
audio_file = client.files.upload(file="output.wav")

# 4. Generate Structured Output
response = client.models.generate_content(
    model="gemini-3.6-flash",
    contents=[
        audio_file,
        "Analyze this wildfire report audio. Extract the key variables according to the provided schema."
    ],
    config=types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=WildfireReport,
        temperature=0.1,  # Low temperature for precise factual extraction
    ),
)

# 5. Access the Parsed Pydantic Model Directly
report: WildfireReport = response.parsed

print(f"Location: {report.location}")
print(f"Size:     {report.size}")
print(f"Urgency:  {report.urgency.value}")
print(f"Summary:  {report.summary}")