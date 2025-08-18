import os
import re
import torch
import torchaudio
import soundfile as sf
import numpy as np
from scipy import signal
from scipy.signal import butter, filtfilt
import librosa
from pydub import AudioSegment
from pydub.effects import normalize
import io

from flask import Flask, request, jsonify, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity, JWTManager
from flask_cors import CORS
from transformers import WhisperProcessor, WhisperForConditionalGeneration
from datetime import datetime, timedelta
import traceback
from dotenv import load_dotenv 

load_dotenv()

# --- App Configuration ---
app = Flask(__name__)

CORS(app, 
     origins=["http://localhost:5173", "http://127.0.0.1:5173"],
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     allow_headers=["Content-Type", "Authorization"])

app.config["JWT_TOKEN_LOCATION"] = ["headers"]
app.config["JWT_CSRF_IN_COOKIES"] = False
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///database.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'a-very-strong-default-secret-key')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=24)
app.config['UPLOAD_FOLDER'] = 'audio_files'

db = SQLAlchemy(app)
bcrypt = Bcrypt(app)
jwt = JWTManager(app)

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# --- Debug middleware ---
@app.before_request
def log_request_info():
    auth_header = request.headers.get('Authorization')
    if auth_header:
        pass

# --- JWT Error handlers ---
@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_payload):
    return jsonify({"error": "Token has expired"}), 401

@jwt.invalid_token_loader
def invalid_token_callback(error):
    return jsonify({"error": "Invalid token"}), 401

@jwt.unauthorized_loader
def missing_token_callback(error):
    return jsonify({"error": "Authorization token is required"}), 401


try:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    
    # Load processor and model
    processor = WhisperProcessor.from_pretrained("openai/whisper-large-v3")
    model = WhisperForConditionalGeneration.from_pretrained("openai/whisper-large-v3")
    
    model = model.to(device)
    model.eval()
    
except Exception as e:
    processor = None
    model = None


def raw_audio_load(audio_path):
    """
    Load audio with ZERO preprocessing - just get it to Whisper
    """
    try:
        
        # Just load with librosa
        audio_data, sample_rate = librosa.load(audio_path, sr=16000, mono=True)
        
        duration = len(audio_data) / sample_rate
        
        return audio_data, sample_rate
        
    except Exception as e:
        return None, 0

def direct_whisper_transcribe(audio_data, sample_rate=16000):
    """
    Direct Whisper transcription - no questions asked
    """
    try:
        if audio_data is None:
            return "[No audio data]"
        
        # sent directly to Whisper
        input_features = processor(
            audio_data, 
            sampling_rate=sample_rate, 
            return_tensors="pt"
        ).input_features.to(device)
        
        
        with torch.no_grad():
            generated_ids = model.generate(input_features)
        
     
        transcription = processor.batch_decode(generated_ids, skip_special_tokens=True)[0].strip()
        
        return transcription if transcription else "[No speech detected]"
        
    except Exception as e:
        return "[Transcription error]"

# --- Database Models ---
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    transcripts = db.relationship('Transcript', backref='user', lazy=True, cascade="all, delete-orphan")

class Transcript(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(150), nullable=False)
    text = db.Column(db.Text, nullable=False)
    audio_filename = db.Column(db.String(200), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    word_count = db.Column(db.Integer)
    sentence_count = db.Column(db.Integer)
    speech_rate = db.Column(db.Float) 
    avg_words_per_sentence = db.Column(db.Float)


def analyze_transcript(text, audio_duration_seconds):
    words = text.split()
    word_count = len(words)
    sentences = re.split(r'[.!?]+', text)
    sentence_count = len([s for s in sentences if s.strip()])
    if sentence_count == 0: sentence_count = 1
    speech_rate = (word_count / audio_duration_seconds) * 60 if audio_duration_seconds > 0 else 0
    avg_words_per_sentence = word_count / sentence_count
    return {"word_count": word_count, "sentence_count": sentence_count, "speech_rate": round(speech_rate, 2), "avg_words_per_sentence": round(avg_words_per_sentence, 2)}

# --- API Routes ---
@app.route('/api/audio/<int:user_id>/<path:filename>')
@jwt_required()
def serve_audio_api(user_id, filename):
    current_user_id = int(get_jwt_identity())
    if user_id != current_user_id: 
        return jsonify({"error": "Unauthorized"}), 403
    
    directory = os.path.join(app.config['UPLOAD_FOLDER'], str(user_id))
    file_path = os.path.join(directory, filename)
    
    if not os.path.exists(file_path):
        return jsonify({"error": "File not found"}), 404
    
    return send_from_directory(directory, filename, mimetype='audio/wav', as_attachment=False)

@app.route('/audio/<int:user_id>/<path:filename>')
def serve_audio_with_token(user_id, filename):
    token = request.args.get('token')
    if not token:
        return jsonify({"error": "Token required"}), 401
    
    try:
        from flask_jwt_extended import decode_token
        decoded_token = decode_token(token)
        token_user_id = int(decoded_token['sub'])
        
        if user_id != token_user_id:
            return jsonify({"error": "Unauthorized"}), 403
        
    except Exception as e:
        return jsonify({"error": "Invalid token"}), 401
    
    directory = os.path.join(app.config['UPLOAD_FOLDER'], str(user_id))
    file_path = os.path.join(directory, filename)
    
    if not os.path.exists(file_path):
        return jsonify({"error": "File not found"}), 404
    
    return send_from_directory(directory, filename, mimetype='audio/wav', as_attachment=False)
    
@app.route('/api/signup', methods=['POST'])
def signup():
    data = request.get_json()
    if not data or not data.get('email') or not data.get('password'):
        return jsonify({"error": "Missing fields"}), 400
    if User.query.filter_by(email=data['email']).first():
        return jsonify({"error": "Email already registered"}), 409
    hashed_password = bcrypt.generate_password_hash(data['password']).decode('utf-8')
    new_user = User(username=data['username'], email=data['email'], password_hash=hashed_password)
    db.session.add(new_user)
    db.session.commit()
    return jsonify({"message": "User created"}), 201

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    user = User.query.filter_by(email=data.get('email')).first()
    if user and bcrypt.check_password_hash(user.password_hash, data.get('password')):
        access_token = create_access_token(identity=str(user.id))
        return jsonify(access_token=access_token), 200
    return jsonify({"error": "Invalid credentials"}), 401

@app.route('/api/transcripts', methods=['GET'])
@jwt_required()
def get_transcripts():
    try:
        current_user_id = int(get_jwt_identity())
        transcripts = Transcript.query.filter_by(user_id=current_user_id).order_by(Transcript.created_at.desc()).all()
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        
        result = [{
            "id": t.id, 
            "name": t.name, 
            "text": t.text,
            "audioUrl": f"/audio/{t.user_id}/{t.audio_filename}?token={token}" if t.audio_filename else None,
            "createdAt": t.created_at.isoformat(), 
            "word_count": t.word_count,
            "sentence_count": t.sentence_count, 
            "speech_rate": t.speech_rate,
            "avg_words_per_sentence": t.avg_words_per_sentence
        } for t in transcripts]
        
        return jsonify(result), 200
        
    except Exception as e:
        return jsonify({"error": "Failed to fetch transcripts"}), 500

@app.route('/api/transcripts', methods=['OPTIONS'])
def handle_options():
    return '', 204

# --- SIMPLIFIED TRANSCRIPTION ENDPOINT ---
@app.route('/api/transcribe', methods=['POST'])
@jwt_required()
def transcribe_audio():
    current_user_id = int(get_jwt_identity())
    
    if 'audio' not in request.files:
        return jsonify({"error": "No audio file part"}), 400
    
    audio_file = request.files['audio']
    if audio_file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    user_audio_dir = os.path.join(app.config['UPLOAD_FOLDER'], str(current_user_id))
    os.makedirs(user_audio_dir, exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"recording_{timestamp}.wav"
    temp_filename = f"temp_{timestamp}"
    
    # Save the uploaded file with original extension
    original_path = os.path.join(user_audio_dir, f"{temp_filename}.webm")
    final_path = os.path.join(user_audio_dir, filename)
    
    try:
       
        audio_file.save(original_path)
        
    
        audio_data, sample_rate = raw_audio_load(original_path)
        
        if audio_data is None:
            return jsonify({"error": "Could not load audio file. Please try recording again."}), 400
        
       
        duration_seconds = len(audio_data) / sample_rate
        
        # Save as WAV for storage
        sf.write(final_path, audio_data, sample_rate)
        
     
        os.remove(original_path)
        
       
        transcription = direct_whisper_transcribe(audio_data, sample_rate)
        
       
        analysis = analyze_transcript(transcription, duration_seconds)
        
   
        new_transcript = Transcript(
            user_id=current_user_id, 
            name=f"Recording {timestamp}", 
            text=transcription,
            audio_filename=filename, 
            **analysis
        )
        
        db.session.add(new_transcript)
        db.session.commit()
        
    
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        
        return jsonify({
            "id": new_transcript.id, 
            "name": new_transcript.name, 
            "text": new_transcript.text,
            "audioUrl": f"/audio/{current_user_id}/{filename}?token={token}", 
            "createdAt": new_transcript.created_at.isoformat(),
            **analysis
        }), 201

    except Exception as e:
        traceback.print_exc()
        
    
        for temp_file in [original_path, final_path]:
            if os.path.exists(temp_file):
                os.remove(temp_file)
        
        return jsonify({"error": f"Processing failed: {str(e)}"}), 500

@app.route('/api/transcripts/<int:id>', methods=['PUT'])
@jwt_required()
def update_transcript(id):
    current_user_id = int(get_jwt_identity())
    transcript = Transcript.query.get_or_404(id)
    if transcript.user_id != current_user_id: 
        return jsonify({"error": "Unauthorized"}), 403
    data = request.get_json()
    transcript.name = data.get('name', transcript.name)
    if 'text' in data:
        transcript.text = data['text']
        try:
            audio_path = os.path.join(app.config['UPLOAD_FOLDER'], str(transcript.user_id), transcript.audio_filename)
            audio_data, sample_rate = raw_audio_load(audio_path)
            if audio_data is not None:
                duration = len(audio_data) / sample_rate
                analysis = analyze_transcript(transcript.text, duration)
                for key, value in analysis.items():
                    setattr(transcript, key, value)
        except Exception as e:
            pass
    db.session.commit()
    return jsonify({"message": "Transcript updated"}), 200

@app.route('/api/transcripts/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_transcript(id):
    current_user_id = int(get_jwt_identity())
    transcript = Transcript.query.get_or_404(id)
    if transcript.user_id != current_user_id: 
        return jsonify({"error": "Unauthorized"}), 403
    if transcript.audio_filename:
        audio_path = os.path.join(app.config['UPLOAD_FOLDER'], str(transcript.user_id), transcript.audio_filename)
        if os.path.exists(audio_path):
            os.remove(audio_path)
    db.session.delete(transcript)
    db.session.commit()
    return jsonify({"message": "Transcript deleted"}), 200

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True, port=5001)