import os
import re
import torch
import torchaudio

import soundfile
torchaudio.set_audio_backend("ffmpeg")


from flask import Flask, request, jsonify, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity, JWTManager
from flask_cors import CORS
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
from datetime import datetime, timedelta
import traceback
from dotenv import load_dotenv 

load_dotenv()

# --- App Configuration ---
app = Flask(__name__)

# UPDATED CORS SETUP - Remove supports_credentials
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

# --- Debug middleware to log all requests ---
@app.before_request
def log_request_info():
    print(f"\n🔍 DEBUG: Incoming request to {request.method} {request.url}")
    print(f"🔍 DEBUG: Headers: {dict(request.headers)}")
    print(f"🔍 DEBUG: Origin: {request.headers.get('Origin', 'No Origin header')}")
    auth_header = request.headers.get('Authorization')
    if auth_header:
        print(f"🔍 DEBUG: Authorization header: {auth_header[:27]}...")
    else:
        print("🔍 DEBUG: No Authorization header found")

# --- Error handlers for JWT ---
@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_payload):
    print("🔍 DEBUG: JWT expired token callback triggered")
    return jsonify({"error": "Token has expired"}), 401

@jwt.invalid_token_loader
def invalid_token_callback(error):
    print(f"🔍 DEBUG: JWT invalid token callback triggered: {error}")
    return jsonify({"error": "Invalid token"}), 401

@jwt.unauthorized_loader
def missing_token_callback(error):
    print(f"🔍 DEBUG: JWT unauthorized callback triggered: {error}")
    return jsonify({"error": "Authorization token is required"}), 401

# --- AI Model Loading ---
print("Loading Wav2Vec2 model...")
try:
    processor = Wav2Vec2Processor.from_pretrained("facebook/wav2vec2-base-960h")
    model = Wav2Vec2ForCTC.from_pretrained("facebook/wav2vec2-base-960h")
    print("Model loaded successfully.")
except Exception as e:
    print(f"Error loading model: {e}")
    processor = None
    model = None

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

# --- Helper Functions ---
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
@app.route('/api/signup', methods=['POST'])
def signup():
    print("🔍 DEBUG: Signup endpoint called")
    data = request.get_json()
    print(f"🔍 DEBUG: Signup data: {data}")
    if not data or not data.get('email') or not data.get('password'):
        return jsonify({"error": "Missing fields"}), 400
    if User.query.filter_by(email=data['email']).first():
        return jsonify({"error": "Email already registered"}), 409
    hashed_password = bcrypt.generate_password_hash(data['password']).decode('utf-8')
    new_user = User(username=data['username'], email=data['email'], password_hash=hashed_password)
    db.session.add(new_user)
    db.session.commit()
    print(f"🔍 DEBUG: User created successfully with ID: {new_user.id}")
    return jsonify({"message": "User created"}), 201

@app.route('/api/login', methods=['POST'])
def login():
    print("🔍 DEBUG: Login endpoint called")
    data = request.get_json()
    print(f"🔍 DEBUG: Login attempt for email: {data.get('email')}")
    user = User.query.filter_by(email=data.get('email')).first()
    if user and bcrypt.check_password_hash(user.password_hash, data.get('password')):
        # FIXED: Convert user.id to string for JWT subject
        access_token = create_access_token(identity=str(user.id))
        print(f"🔍 DEBUG: Login successful, token created for user ID: {user.id} (as string)")
        print(f"🔍 DEBUG: Token preview: {access_token[:27]}...")
        return jsonify(access_token=access_token), 200
    print("🔍 DEBUG: Login failed - invalid credentials")
    return jsonify({"error": "Invalid credentials"}), 401

@app.route('/audio/<int:user_id>/<path:filename>')
@jwt_required()
def serve_audio(user_id, filename):
    print(f"🔍 DEBUG: serve_audio called for user {user_id}, file {filename}")
    current_user_id = int(get_jwt_identity())  # Convert string back to int
    print(f"🔍 DEBUG: Current user ID from token: {current_user_id}")
    if user_id != current_user_id: 
        print("🔍 DEBUG: Unauthorized audio access attempt")
        return jsonify({"error": "Unauthorized"}), 403
    directory = os.path.join(app.config['UPLOAD_FOLDER'], str(user_id))
    return send_from_directory(directory, filename)

@app.route('/api/test-auth', methods=['GET'])
@jwt_required()
def test_auth():
    print("🔍 DEBUG: test-auth endpoint called")
    current_user_id = int(get_jwt_identity())  # Convert string back to int
    print(f"🔍 DEBUG: Successfully authenticated user ID: {current_user_id}")
    return jsonify({"message": f"Authentication successful for user {current_user_id}"}), 200

@app.route('/api/transcripts', methods=['GET'])
@jwt_required()
def get_transcripts():
    print("🔍 DEBUG: get_transcripts endpoint called")
    try:
        current_user_id = int(get_jwt_identity())  # Convert string back to int
        print(f"🔍 DEBUG: Current user ID from token: {current_user_id}")
        
        transcripts = Transcript.query.filter_by(user_id=current_user_id).order_by(Transcript.created_at.desc()).all()
        print(f"🔍 DEBUG: Found {len(transcripts)} transcripts for user {current_user_id}")
        
        result = [{
            "id": t.id, "name": t.name, "text": t.text,
            "audioUrl": f"/audio/{t.user_id}/{t.audio_filename}" if t.audio_filename else None,
            "createdAt": t.created_at.isoformat(), "word_count": t.word_count,
            "sentence_count": t.sentence_count, "speech_rate": t.speech_rate,
            "avg_words_per_sentence": t.avg_words_per_sentence
        } for t in transcripts]
        
        print(f"🔍 DEBUG: Returning transcripts data: {len(result)} items")
        return jsonify(result), 200
        
    except Exception as e:
        print(f"🔍 DEBUG: Error in get_transcripts: {str(e)}")
        print(f"🔍 DEBUG: Traceback: {traceback.format_exc()}")
        return jsonify({"error": "Failed to fetch transcripts"}), 500

@app.route('/api/transcripts', methods=['OPTIONS'])
def handle_options():
    print("🔍 DEBUG: OPTIONS request to /api/transcripts")
    return '', 204

@app.route('/api/transcribe', methods=['POST'])
@jwt_required()
def transcribe_audio():
    print("🔍 DEBUG: transcribe_audio endpoint called")
    current_user_id = int(get_jwt_identity())  # Convert string back to int
    print(f"🔍 DEBUG: Current user ID: {current_user_id}")
    
    if 'audio' not in request.files:
        return jsonify({"error": "No audio file part"}), 400
    
    audio_file = request.files['audio']
    if audio_file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    user_audio_dir = os.path.join(app.config['UPLOAD_FOLDER'], str(current_user_id))
    os.makedirs(user_audio_dir, exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    # FIXED: Save as WAV instead of WebM for better compatibility
    filename = f"recording_{timestamp}.wav"
    audio_path = os.path.join(user_audio_dir, filename)
    
    try:
        # Save the uploaded file temporarily
        temp_path = os.path.join(user_audio_dir, f"temp_{timestamp}.webm")
        audio_file.save(temp_path)
        
        # Convert WebM to WAV using ffmpeg (if available) or handle directly
        try:
            import subprocess
            # Try to convert using ffmpeg
            subprocess.run([
                'ffmpeg', '-i', temp_path, '-ar', '16000', '-ac', '1', audio_path, '-y'
            ], check=True, capture_output=True)
            os.remove(temp_path)  # Remove temporary file
            print(f"🔍 DEBUG: Audio converted to WAV successfully")
        except (subprocess.CalledProcessError, FileNotFoundError):
            # If ffmpeg is not available, try loading directly with different backends
            print("🔍 DEBUG: ffmpeg not available, trying direct load")
            os.rename(temp_path, audio_path)  # Just rename for now
        
        # Load audio with explicit backend handling
        try:
            waveform, sample_rate = torchaudio.load(audio_path)
        except RuntimeError:
            # Try with soundfile backend if available
            try:
                import torchaudio.backend.soundfile_backend as sf_backend
                torchaudio.set_audio_backend("soundfile")
                waveform, sample_rate = torchaudio.load(audio_path)
            except:
                # Last resort: try with different format hint
                try:
                    waveform, sample_rate = torchaudio.load(audio_path, format="wav")
                except:
                    return jsonify({"error": "Audio format not supported. Please try recording again."}), 400
        
        audio_duration_seconds = waveform.shape[1] / sample_rate
        print(f"🔍 DEBUG: Audio loaded - Duration: {audio_duration_seconds:.2f}s, Sample Rate: {sample_rate}")
        
        # Ensure mono channel
        if waveform.shape[0] > 1:
            waveform = torch.mean(waveform, dim=0, keepdim=True)
        
        # Resample if needed
        if sample_rate != 16000:
            resampler = torchaudio.transforms.Resample(orig_freq=sample_rate, new_freq=16000)
            waveform = resampler(waveform)
            print(f"🔍 DEBUG: Audio resampled from {sample_rate}Hz to 16000Hz")
        
        # Process with Wav2Vec2
        input_values = processor(waveform.squeeze(0), return_tensors="pt", sampling_rate=16000).input_values
        
        with torch.no_grad():
            logits = model(input_values).logits
        
        predicted_ids = torch.argmax(logits, dim=-1)
        transcription_text = processor.batch_decode(predicted_ids)[0]
        print(f"🔍 DEBUG: Transcription generated: {transcription_text[:50]}...")

    except Exception as e:
        print(f"🔍 DEBUG: Audio processing error: {str(e)}")
        traceback.print_exc()
        # Clean up any temporary files
        for temp_file in [audio_path, os.path.join(user_audio_dir, f"temp_{timestamp}.webm")]:
            if os.path.exists(temp_file):
                os.remove(temp_file)
        return jsonify({"error": "Failed to process audio file"}), 500

    analysis_results = analyze_transcript(transcription_text, audio_duration_seconds)
    
    new_transcript = Transcript(
        user_id=current_user_id, 
        name=f"Recording {timestamp}", 
        text=transcription_text.lower(),
        audio_filename=filename, 
        **analysis_results
    )
    
    db.session.add(new_transcript)
    db.session.commit()
    
    print(f"🔍 DEBUG: New transcript created with ID: {new_transcript.id}")
    
    return jsonify({
        "id": new_transcript.id, 
        "name": new_transcript.name, 
        "text": new_transcript.text,
        "audioUrl": f"/audio/{current_user_id}/{filename}", 
        "createdAt": new_transcript.created_at.isoformat(),
        **analysis_results
    }), 201

@app.route('/api/transcripts/<int:id>', methods=['PUT'])
@jwt_required()
def update_transcript(id):
    print(f"🔍 DEBUG: update_transcript called for ID: {id}")
    current_user_id = int(get_jwt_identity())  # Convert string back to int
    transcript = Transcript.query.get_or_404(id)
    if transcript.user_id != current_user_id: 
        print(f"🔍 DEBUG: Unauthorized update attempt by user {current_user_id} for transcript owned by {transcript.user_id}")
        return jsonify({"error": "Unauthorized"}), 403
    data = request.get_json()
    transcript.name = data.get('name', transcript.name)
    if 'text' in data:
        transcript.text = data['text']
        try:
            audio_path = os.path.join(app.config['UPLOAD_FOLDER'], str(transcript.user_id), transcript.audio_filename)
            waveform, sample_rate = torchaudio.load(audio_path)
            duration = waveform.shape[1] / sample_rate
            analysis = analyze_transcript(transcript.text, duration)
            for key, value in analysis.items():
                setattr(transcript, key, value)
        except Exception as e:
            print(f"Re-analysis error: {e}")
    db.session.commit()
    print(f"🔍 DEBUG: Transcript {id} updated successfully")
    return jsonify({"message": "Transcript updated"}), 200

@app.route('/api/transcripts/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_transcript(id):
    print(f"🔍 DEBUG: delete_transcript called for ID: {id}")
    current_user_id = int(get_jwt_identity())  # Convert string back to int
    transcript = Transcript.query.get_or_404(id)
    if transcript.user_id != current_user_id: 
        print(f"🔍 DEBUG: Unauthorized delete attempt by user {current_user_id} for transcript owned by {transcript.user_id}")
        return jsonify({"error": "Unauthorized"}), 403
    if transcript.audio_filename:
        audio_path = os.path.join(app.config['UPLOAD_FOLDER'], str(transcript.user_id), transcript.audio_filename)
        if os.path.exists(audio_path):
            os.remove(audio_path)
    db.session.delete(transcript)
    db.session.commit()
    print(f"🔍 DEBUG: Transcript {id} deleted successfully")
    return jsonify({"message": "Transcript deleted"}), 200

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    print("🔍 DEBUG: Starting Flask app on port 5001...")
    print(f"🔍 DEBUG: JWT Secret Key configured: {bool(app.config['JWT_SECRET_KEY'])}")
    print(f"🔍 DEBUG: CORS Origins: {app.config.get('CORS_ORIGINS', 'Not configured')}")
    app.run(debug=True, port=5001)