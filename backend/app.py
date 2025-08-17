import os
import re
import torch
import torchaudio
from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity, JWTManager
from flask_cors import CORS
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
from datetime import datetime, timedelta
import io

# --- App Configuration ---
app = Flask(__name__)
CORS(app) # Allow React frontend to communicate with this backend


app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///database.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

app.config['JWT_SECRET_KEY'] = 'your-super-secret-key-change-me' 

# --- Initialize Extensions ---
db = SQLAlchemy(app)
bcrypt = Bcrypt(app)
jwt = JWTManager(app)

# --- AI Model Loading ---

print("Loading Wav2Vec2 model... This may take a moment.")
processor = Wav2Vec2Processor.from_pretrained("facebook/wav2vec2-base-960h")
model = Wav2Vec2ForCTC.from_pretrained("facebook/wav2vec2-base-960h")
print("Model loaded successfully.")


# --- Database Models ---

# User model for storing usernames and securely hashed passwords
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    transcripts = db.relationship('Transcript', backref='user', lazy=True, cascade="all, delete-orphan")

# Transcript model for storing all transcription data
class Transcript(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(150), nullable=False)
    text = db.Column(db.Text, nullable=False)
    audio_path = db.Column(db.String(200), nullable=True) 
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    word_count = db.Column(db.Integer)
    sentence_count = db.Column(db.Integer)
    speech_rate = db.Column(db.Float) 
    avg_words_per_sentence = db.Column(db.Float)

# --- Helper Functions ---

def analyze_transcript(text, audio_duration_seconds):
  
    words = text.split()
    word_count = len(words)
    
    # Simple sentence count based on punctuation
    sentences = re.split(r'[.!?]+', text)
    # Filter out any empty strings that result from the split
    sentence_count = len([s for s in sentences if s.strip()])
    if sentence_count == 0: sentence_count = 1 # Avoid division by zero

    # Calculate speech rate (words per minute)
    speech_rate = 0
    if audio_duration_seconds > 0:
        speech_rate = (word_count / audio_duration_seconds) * 60

    # Calculate average words per sentence
    avg_words_per_sentence = word_count / sentence_count

    return {
        "word_count": word_count,
        "sentence_count": sentence_count,
        "speech_rate": round(speech_rate, 2),
        "avg_words_per_sentence": round(avg_words_per_sentence, 2)
    }


# --- API Routes ---

# --- User Authentication Routes ---

@app.route('/api/signup', methods=['POST'])
def signup():
    data = request.get_json()
    username = data['username']
    email = data['email']
    password = data['password']

    # Check if user already exists
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already registered"}), 409
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already taken"}), 409

    # Hash the password for security
    hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
    new_user = User(username=username, email=email, password_hash=hashed_password)
    
    db.session.add(new_user)
    db.session.commit()
    
    return jsonify({"message": "User created successfully"}), 201

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data['email']
    password = data['password']
    
    user = User.query.filter_by(email=email).first()
    
    # Check if user exists and password is correct
    if user and bcrypt.check_password_hash(user.password_hash, password):
        # Create a JWT token that expires in 1 day
        access_token = create_access_token(identity=user.id, expires_delta=timedelta(days=1))
        return jsonify(access_token=access_token), 200
    
    return jsonify({"error": "Invalid credentials"}), 401


# --- Transcription Routes ---

@app.route('/api/transcribe', methods=['POST'])
@jwt_required() # This protects the route, requiring a valid token
def transcribe_audio():
    current_user_id = get_jwt_identity()
    
    if 'audio' not in request.files:
        return jsonify({"error": "No audio file provided"}), 400
        
    audio_file = request.files['audio']
    

    user_audio_dir = os.path.join('audio_files', str(current_user_id))
    os.makedirs(user_audio_dir, exist_ok=True)
    
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"recording_{timestamp}.webm"
    audio_path = os.path.join(user_audio_dir, filename)
    audio_file.save(audio_path)


    try:
     
        waveform, sample_rate = torchaudio.load(audio_path)
        audio_duration_seconds = waveform.shape[1] / sample_rate
        
       
        if sample_rate != 16000:
            resampler = torchaudio.transforms.Resample(orig_freq=sample_rate, new_freq=16000)
            waveform = resampler(waveform)
        
       
        input_values = processor(waveform.squeeze(0), return_tensors="pt", sampling_rate=16000).input_values
        
        
        with torch.no_grad():
            logits = model(input_values).logits
        
        predicted_ids = torch.argmax(logits, dim=-1)
        transcription_text = processor.batch_decode(predicted_ids)[0]

    except Exception as e:
        print(f"Error during transcription: {e}")
        return jsonify({"error": "Failed to process audio file"}), 500

  
    analysis_results = analyze_transcript(transcription_text, audio_duration_seconds)
    
    new_transcript = Transcript(
        user_id=current_user_id,
        name=f"Recording {timestamp}",
        text=transcription_text.lower(), 
        audio_path=audio_path,
        **analysis_results 
    )
    
    db.session.add(new_transcript)
    db.session.commit()
    
    return jsonify({
        "id": new_transcript.id,
        "name": new_transcript.name,
        "text": new_transcript.text,
        "audioUrl": audio_path, 
        "createdAt": new_transcript.created_at.isoformat(),
        **analysis_results
    }), 201


@app.route('/api/transcripts', methods=['GET'])
@jwt_required()
def get_transcripts():
    current_user_id = get_jwt_identity()
    transcripts = Transcript.query.filter_by(user_id=current_user_id).order_by(Transcript.created_at.desc()).all()
    
    return jsonify([{
        "id": t.id,
        "name": t.name,
        "text": t.text,
        "audioUrl": t.audio_path,
        "createdAt": t.created_at.isoformat(),
        "word_count": t.word_count,
        "sentence_count": t.sentence_count,
        "speech_rate": t.speech_rate,
        "avg_words_per_sentence": t.avg_words_per_sentence
    } for t in transcripts]), 200

@app.route('/api/transcripts/<int:id>', methods=['PUT'])
@jwt_required()
def update_transcript(id):
    current_user_id = get_jwt_identity()
    transcript = Transcript.query.get_or_404(id)
    
    if transcript.user_id != current_user_id:
        return jsonify({"error": "Unauthorized"}), 403
        
    data = request.get_json()
    transcript.name = data.get('name', transcript.name)
    transcript.text = data.get('text', transcript.text)
    
    # Re-analyze the text if it has been changed
    if 'text' in data:
        # audio duration to re-calculate speech rate
        waveform, sample_rate = torchaudio.load(transcript.audio_path)
        duration = waveform.shape[1] / sample_rate
        analysis = analyze_transcript(transcript.text, duration)
        transcript.word_count = analysis['word_count']
        transcript.sentence_count = analysis['sentence_count']
        transcript.speech_rate = analysis['speech_rate']
        transcript.avg_words_per_sentence = analysis['avg_words_per_sentence']
        
    db.session.commit()
    
    return jsonify({"message": "Transcript updated successfully"}), 200

@app.route('/api/transcripts/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_transcript(id):
    current_user_id = get_jwt_identity()
    transcript = Transcript.query.get_or_404(id)
    
    if transcript.user_id != current_user_id:
        return jsonify({"error": "Unauthorized"}), 403
        
 
    if transcript.audio_path and os.path.exists(transcript.audio_path):
        os.remove(transcript.audio_path)
        
    db.session.delete(transcript)
    db.session.commit()
    
    return jsonify({"message": "Transcript deleted successfully"}), 200


if __name__ == '__main__':
   
    with app.app_context():
        db.create_all()
    app.run(debug=True, port=5001)