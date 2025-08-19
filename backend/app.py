import os
import re
import requests
from flask import Flask, request, jsonify, send_from_directory
from flask_bcrypt import Bcrypt
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity, JWTManager
from flask_cors import CORS
from datetime import datetime, timedelta
import traceback
from dotenv import load_dotenv
from pymongo import MongoClient
from bson import ObjectId
import tempfile
import wave
import struct

load_dotenv()

# --- App Configuration ---
app = Flask(__name__)


CORS(app, 
     origins=[
         "http://localhost:5173", 
         "http://127.0.0.1:5173",
         "https://research-project-testing-1.vercel.app",
         "https://*.netlify.app",
         "https://*.vercel.app",
         "https://*.railway.app"
     ],
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     allow_headers=["Content-Type", "Authorization"],
     supports_credentials=True)

# JWT Configuration
app.config["JWT_TOKEN_LOCATION"] = ["headers"]
app.config["JWT_CSRF_IN_COOKIES"] = False
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'super-strong-production-secret-key-change-this')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=24)

# File upload configuration
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024 
app.config['UPLOAD_FOLDER'] = '/tmp/audio_files' 

# Initialize extensions
bcrypt = Bcrypt(app)
jwt = JWTManager(app)

# Create upload folder
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# --- MongoDB Connection ---
def init_mongodb():
    """Initialize MongoDB connection with proper error handling"""
    try:
        mongodb_uri = os.environ.get('MONGODB_URI')
        if not mongodb_uri:
            print("ERROR: MONGODB_URI environment variable not set!")
            return None
            
        client = MongoClient(mongodb_uri, serverSelectionTimeoutMS=5000)
        # Test connection
        client.server_info()
        db = client.get_database()
        print("MongoDB connection successful!")
        
        # Create indexes for better performance
        db.users.create_index("email", unique=True)
        db.transcripts.create_index([("user_id", 1), ("created_at", -1)])
        
        return db
    except Exception as e:
        print(f" MongoDB connection error: {e}")
        return None

# Global MongoDB instance
db = init_mongodb()

# JWT error handlers
@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_payload):
    return jsonify({"error": "Token has expired"}), 401

@jwt.invalid_token_loader
def invalid_token_callback(error):
    return jsonify({"error": "Invalid token"}), 401

@jwt.unauthorized_loader
def missing_token_callback(error):
    return jsonify({"error": "Authorization token is required"}), 401

# --- API Keys ---
HUGGINGFACE_API_KEY = os.getenv('HUGGINGFACE_API_KEY')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')

if not HUGGINGFACE_API_KEY and not OPENAI_API_KEY:
    print("⚠️  WARNING: No API keys configured! Transcription will not work.")

# --- Database Models ---
class UserDocument:
    @staticmethod
    def create(username, email, password_hash):
        return {
            "username": username,
            "email": email.lower().strip(),
            "password_hash": password_hash,
            "created_at": datetime.utcnow()
        }
    
    @staticmethod
    def find_by_email(email):
        if not db:
            return None
        return db.users.find_one({"email": email.lower().strip()})
    
    @staticmethod
    def find_by_id(user_id):
        if not db:
            return None
        try:
            return db.users.find_one({"_id": ObjectId(user_id)})
        except:
            return None
    
    @staticmethod
    def insert(user_doc):
        if not db:
            return None
        try:
            result = db.users.insert_one(user_doc)
            return result.inserted_id
        except Exception as e:
            print(f"User insert error: {e}")
            return None

class TranscriptDocument:
    @staticmethod
    def create(user_id, name, text, audio_filename, analysis):
        return {
            "user_id": ObjectId(user_id),
            "name": name,
            "text": text,
            "audio_filename": audio_filename,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "word_count": analysis.get("word_count", 0),
            "sentence_count": analysis.get("sentence_count", 0),
            "speech_rate": analysis.get("speech_rate", 0.0),
            "avg_words_per_sentence": analysis.get("avg_words_per_sentence", 0.0)
        }
    
    @staticmethod
    def find_by_user(user_id):
        if not db:
            return []
        try:
            return list(db.transcripts.find(
                {"user_id": ObjectId(user_id)}
            ).sort("created_at", -1).limit(100))  # Limit for performance
        except:
            return []
    
    @staticmethod
    def find_by_id(transcript_id):
        if not db:
            return None
        try:
            return db.transcripts.find_one({"_id": ObjectId(transcript_id)})
        except:
            return None
    
    @staticmethod
    def insert(transcript_doc):
        if not db:
            return None
        try:
            result = db.transcripts.insert_one(transcript_doc)
            return result.inserted_id
        except Exception as e:
            print(f"Transcript insert error: {e}")
            return None
    
    @staticmethod
    def update(transcript_id, updates):
        if not db:
            return False
        try:
            updates["updated_at"] = datetime.utcnow()
            result = db.transcripts.update_one(
                {"_id": ObjectId(transcript_id)}, 
                {"$set": updates}
            )
            return result.modified_count > 0
        except:
            return False
    
    @staticmethod
    def delete(transcript_id):
        if not db:
            return False
        try:
            result = db.transcripts.delete_one({"_id": ObjectId(transcript_id)})
            return result.deleted_count > 0
        except:
            return False
    
    @staticmethod
    def to_dict(doc, include_audio_url=False, token=None):
        result = {
            "id": str(doc["_id"]),
            "name": doc["name"],
            "text": doc["text"],
            "createdAt": doc["created_at"].isoformat(),
            "updatedAt": doc["updated_at"].isoformat() if doc.get("updated_at") else None,
            "word_count": doc.get("word_count", 0),
            "sentence_count": doc.get("sentence_count", 0),
            "speech_rate": doc.get("speech_rate", 0.0),
            "avg_words_per_sentence": doc.get("avg_words_per_sentence", 0.0)
        }
        
        if include_audio_url and doc.get("audio_filename") and token:
            result["audioUrl"] = f"/audio/{doc['user_id']}/{doc['audio_filename']}?token={token}"
        
        return result

# --- Whisper Large V3 Transcription (API ONLY) ---
def transcribe_with_whisper_large_v3(audio_file_path):
    """
    Use Hugging Face API for Whisper Large V3 ONLY
    This is the ONLY transcription method - no local models!
    """
    if not HUGGINGFACE_API_KEY:
        if OPENAI_API_KEY:
            return transcribe_with_openai_whisper(audio_file_path)
        else:
            return "[ERROR: No API keys configured]"
    
    try:
        # Hugging Face Whisper Large V3 API
        API_URL = "https://api-inference.huggingface.co/models/openai/whisper-large-v3"
        headers = {"Authorization": f"Bearer {HUGGINGFACE_API_KEY}"}
        
        # Read audio file as binary
        with open(audio_file_path, "rb") as f:
            audio_data = f.read()
        
        # Make API request with timeout
        response = requests.post(
            API_URL, 
            headers=headers, 
            data=audio_data, 
            timeout=120  # 2 minute timeout
        )
        
        print(f"Hugging Face API Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            
            # Handle different response formats
            if isinstance(result, dict) and 'text' in result:
                text = result['text'].strip()
            elif isinstance(result, str):
                text = result.strip()
            else:
                text = str(result).strip()
            
            return text if text else "[No speech detected]"
            
        elif response.status_code == 503:
            print("Model loading, retrying in 10 seconds...")
            import time
            time.sleep(10)
            # Retry once
            response = requests.post(API_URL, headers=headers, data=audio_data, timeout=120)
            if response.status_code == 200:
                result = response.json()
                text = result.get('text', '').strip() if isinstance(result, dict) else str(result).strip()
                return text if text else "[No speech detected]"
        
        print(f"Hugging Face API Error: {response.status_code} - {response.text}")
        
        # Fallback to OpenAI if available
        if OPENAI_API_KEY:
            return transcribe_with_openai_whisper(audio_file_path)
        
        return f"[API Error: {response.status_code}]"
        
    except requests.exceptions.Timeout:
        print("Hugging Face API timeout")
        return "[API Timeout - Try shorter audio]"
    except Exception as e:
        print(f"Whisper Large V3 API error: {e}")
        if OPENAI_API_KEY:
            return transcribe_with_openai_whisper(audio_file_path)
        return f"[Transcription Error: {str(e)}]"

def transcribe_with_openai_whisper(audio_file_path):
    """
    Fallback to OpenAI Whisper API
    """
    try:
        import openai
        
        client = openai.OpenAI(api_key=OPENAI_API_KEY)
        
        with open(audio_file_path, 'rb') as audio_file:
            response = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                response_format="text"
            )
        
        text = response.strip() if response else ""
        return text if text else "[No speech detected]"
        
    except Exception as e:
        print(f"OpenAI Whisper error: {e}")
        return f"[OpenAI Error: {str(e)}]"

# --- Audio Processing ---
def convert_to_wav(input_path, output_path):
    """
    Convert audio to WAV format for better processing
    """
    try:
        # Try using simple conversion first
        with open(input_path, 'rb') as f:
            audio_data = f.read()
        
        # For now, just copy the file - can add conversion later if needed
        with open(output_path, 'wb') as f:
            f.write(audio_data)
        
        return True
    except Exception as e:
        print(f"Audio conversion error: {e}")
        return False

def get_audio_duration(audio_path):
    """
    Estimate audio duration
    """
    try:
        file_size = os.path.getsize(audio_path)
        # Rough estimate: 1 second ≈ 16KB for compressed audio
        estimated_duration = max(1.0, file_size / 16000)
        return min(estimated_duration, 600)  # Cap at 10 minutes
    except:
        return 30.0  # Default fallback

def analyze_transcript(text, audio_duration_seconds):
    """
    Analyze transcript for speech statistics
    """
    if not text or text.strip() in ["[No speech detected]", "[ERROR: No API keys configured]", "[API Timeout - Try shorter audio]"]:
        return {
            "word_count": 0,
            "sentence_count": 0,
            "speech_rate": 0.0,
            "avg_words_per_sentence": 0.0
        }
    
    # Clean text and count words
    words = text.split()
    word_count = len(words)
    
    # Count sentences
    sentences = re.split(r'[.!?]+', text)
    sentence_count = len([s for s in sentences if s.strip()])
    if sentence_count == 0:
        sentence_count = 1
    
    # Calculate speech rate (words per minute)
    speech_rate = (word_count / max(audio_duration_seconds, 1)) * 60
    
    # Average words per sentence
    avg_words_per_sentence = word_count / sentence_count
    
    return {
        "word_count": word_count,
        "sentence_count": sentence_count,
        "speech_rate": round(speech_rate, 2),
        "avg_words_per_sentence": round(avg_words_per_sentence, 2)
    }

# --- API Routes ---
@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check with service status"""
    try:
        # Test database
        db_status = "connected" if db else "disconnected"
        
        # Check API keys
        services = {
            "huggingface_whisper": "configured" if HUGGINGFACE_API_KEY else "missing",
            "openai_whisper": "configured" if OPENAI_API_KEY else "missing"
        }
        
        return jsonify({
            "status": "healthy",
            "database": db_status,
            "services": services,
            "audio_storage": "filesystem",
            "transcription": "api_only",
            "timestamp": datetime.utcnow().isoformat()
        }), 200
    except Exception as e:
        return jsonify({
            "status": "error",
            "error": str(e)
        }), 500

@app.route('/api/signup', methods=['POST'])
def signup():
    """User registration"""
    try:
        data = request.get_json()
        
        # Validate input
        if not data or not data.get('email') or not data.get('password'):
            return jsonify({"error": "Email and password are required"}), 400
        
        email = data['email'].strip().lower()
        password = data['password']
        
        # Validate email format
        if '@' not in email or len(email) < 5:
            return jsonify({"error": "Invalid email format"}), 400
        
        # Validate password
        if len(password) < 6:
            return jsonify({"error": "Password must be at least 6 characters"}), 400
        
        # Check if user exists
        if UserDocument.find_by_email(email):
            return jsonify({"error": "Email already registered"}), 409
        
        # Create user
        username = data.get('username', '').strip() or email.split('@')[0]
        hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
        
        user_doc = UserDocument.create(username, email, hashed_password)
        user_id = UserDocument.insert(user_doc)
        
        if not user_id:
            return jsonify({"error": "Failed to create user"}), 500
        
        return jsonify({"message": "User created successfully"}), 201
        
    except Exception as e:
        print(f"Signup error: {e}")
        return jsonify({"error": "Internal server error"}), 500

@app.route('/api/login', methods=['POST'])
def login():
    """User authentication"""
    try:
        data = request.get_json()
        
        if not data or not data.get('email') or not data.get('password'):
            return jsonify({"error": "Email and password are required"}), 400
        
        email = data['email'].strip().lower()
        password = data['password']
        
        # Find user
        user = UserDocument.find_by_email(email)
        
        if user and bcrypt.check_password_hash(user['password_hash'], password):
            # Create JWT token
            access_token = create_access_token(identity=str(user['_id']))
            return jsonify({
                "access_token": access_token,
                "message": "Login successful"
            }), 200
        
        return jsonify({"error": "Invalid email or password"}), 401
        
    except Exception as e:
        print(f"Login error: {e}")
        return jsonify({"error": "Internal server error"}), 500

@app.route('/api/transcripts', methods=['GET'])
@jwt_required()
def get_transcripts():
    """Get user's transcripts"""
    try:
        current_user_id = get_jwt_identity()
        transcripts = TranscriptDocument.find_by_user(current_user_id)
        
        # Get token from header for audio URLs
        auth_header = request.headers.get('Authorization', '')
        token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else ''
        
        result = [
            TranscriptDocument.to_dict(t, include_audio_url=True, token=token) 
            for t in transcripts
        ]
        
        return jsonify(result), 200
        
    except Exception as e:
        print(f"Get transcripts error: {e}")
        return jsonify({"error": "Failed to fetch transcripts"}), 500

@app.route('/api/transcribe', methods=['POST'])
@jwt_required()
def transcribe_audio():
    """Transcribe uploaded audio using Whisper Large V3 API"""
    current_user_id = get_jwt_identity()
    
    try:
        # Check if audio file is provided
        if 'audio' not in request.files:
            return jsonify({"error": "No audio file provided"}), 400
        
        audio_file = request.files['audio']
        if audio_file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        
        # Create user directory
        user_audio_dir = os.path.join(app.config['UPLOAD_FOLDER'], str(current_user_id))
        os.makedirs(user_audio_dir, exist_ok=True)
        
        # Generate filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        original_ext = os.path.splitext(audio_file.filename)[1] or '.webm'
        filename = f"recording_{timestamp}{original_ext}"
        file_path = os.path.join(user_audio_dir, filename)
        
        # Save uploaded file
        audio_file.save(file_path)
        print(f"Audio file saved: {file_path} ({os.path.getsize(file_path)} bytes)")
        
        # Get audio duration
        duration_seconds = get_audio_duration(file_path)
        print(f"Estimated duration: {duration_seconds:.1f} seconds")
        
        # Convert to WAV if needed (for better processing)
        wav_filename = f"recording_{timestamp}.wav"
        wav_path = os.path.join(user_audio_dir, wav_filename)
        
        if convert_to_wav(file_path, wav_path):
            transcription_path = wav_path
            final_filename = wav_filename
        else:
            transcription_path = file_path
            final_filename = filename
        
        # Transcribe using Whisper Large V3 API
        print("Starting Whisper Large V3 transcription...")
        transcription = transcribe_with_whisper_large_v3(transcription_path)
        print(f"Transcription result: {transcription[:100]}...")
        
        # Analyze transcript
        analysis = analyze_transcript(transcription, duration_seconds)
        print(f"Analysis: {analysis}")
        
        # Save to MongoDB
        transcript_doc = TranscriptDocument.create(
            user_id=current_user_id,
            name=f"Recording {timestamp}",
            text=transcription,
            audio_filename=final_filename,
            analysis=analysis
        )
        
        transcript_id = TranscriptDocument.insert(transcript_doc)
        if not transcript_id:
            raise Exception("Failed to save transcript to database")
        
        transcript_doc['_id'] = transcript_id
        
        # Clean up temporary files
        try:
            if transcription_path != file_path and os.path.exists(file_path):
                os.remove(file_path)  # Remove original if we converted
        except:
            pass
        
        # Return response with audio URL
        auth_header = request.headers.get('Authorization', '')
        token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else ''
        
        result = TranscriptDocument.to_dict(transcript_doc, include_audio_url=True, token=token)
        
        return jsonify(result), 201

    except Exception as e:
        print(f"Transcription error: {e}")
        traceback.print_exc()
        
        # Cleanup on error
        try:
            if 'file_path' in locals() and os.path.exists(file_path):
                os.remove(file_path)
            if 'wav_path' in locals() and os.path.exists(wav_path):
                os.remove(wav_path)
        except:
            pass
        
        return jsonify({"error": f"Processing failed: {str(e)}"}), 500

@app.route('/api/transcripts/<string:transcript_id>', methods=['PUT'])
@jwt_required()
def update_transcript(transcript_id):
    """Update transcript name or text"""
    try:
        current_user_id = get_jwt_identity()
        transcript = TranscriptDocument.find_by_id(transcript_id)
        
        if not transcript or str(transcript['user_id']) != current_user_id:
            return jsonify({"error": "Transcript not found or unauthorized"}), 403
        
        data = request.get_json()
        updates = {}
        
        if 'name' in data:
            updates['name'] = data['name'].strip()
        
        if 'text' in data:
            updates['text'] = data['text'].strip()
            
            # Recalculate analysis if text changed
            try:
                audio_path = os.path.join(
                    app.config['UPLOAD_FOLDER'], 
                    str(transcript['user_id']), 
                    transcript['audio_filename']
                )
                duration = get_audio_duration(audio_path) if os.path.exists(audio_path) else 30
                analysis = analyze_transcript(data['text'], duration)
                updates.update(analysis)
            except Exception as e:
                print(f"Analysis recalculation error: {e}")
        
        success = TranscriptDocument.update(transcript_id, updates)
        
        if success:
            return jsonify({"message": "Transcript updated successfully"}), 200
        else:
            return jsonify({"error": "Failed to update transcript"}), 500
        
    except Exception as e:
        print(f"Update transcript error: {e}")
        return jsonify({"error": "Failed to update transcript"}), 500

@app.route('/api/transcripts/<string:transcript_id>', methods=['DELETE'])
@jwt_required()
def delete_transcript(transcript_id):
    """Delete transcript and associated audio file"""
    try:
        current_user_id = get_jwt_identity()
        transcript = TranscriptDocument.find_by_id(transcript_id)
        
        if not transcript or str(transcript['user_id']) != current_user_id:
            return jsonify({"error": "Transcript not found or unauthorized"}), 403
        
        # Delete audio file if it exists
        if transcript.get('audio_filename'):
            audio_path = os.path.join(
                app.config['UPLOAD_FOLDER'], 
                str(transcript['user_id']), 
                transcript['audio_filename']
            )
            try:
                if os.path.exists(audio_path):
                    os.remove(audio_path)
                    print(f"🗑️ Deleted audio file: {audio_path}")
            except Exception as e:
                print(f"Error deleting audio file: {e}")
        
        # Delete from database
        success = TranscriptDocument.delete(transcript_id)
        
        if success:
            return jsonify({"message": "Transcript deleted successfully"}), 200
        else:
            return jsonify({"error": "Failed to delete transcript"}), 500
        
    except Exception as e:
        print(f"Delete transcript error: {e}")
        return jsonify({"error": "Failed to delete transcript"}), 500

# --- Audio Serving Routes ---
@app.route('/audio/<string:user_id>/<path:filename>')
def serve_audio_with_token(user_id, filename):
    """Serve audio files with JWT token validation"""
    token = request.args.get('token')
    if not token:
        return jsonify({"error": "Token required"}), 401
    
    try:
        from flask_jwt_extended import decode_token
        decoded_token = decode_token(token)
        token_user_id = str(decoded_token['sub'])
        
        if user_id != token_user_id:
            return jsonify({"error": "Unauthorized"}), 403
            
    except Exception as e:
        print(f"Token validation error: {e}")
        return jsonify({"error": "Invalid token"}), 401
    
    # Serve the file
    directory = os.path.join(app.config['UPLOAD_FOLDER'], str(user_id))
    file_path = os.path.join(directory, filename)
    
    if not os.path.exists(file_path):
        return jsonify({"error": "Audio file not found"}), 404
    
    # Determine MIME type
    if filename.endswith('.wav'):
        mimetype = 'audio/wav'
    elif filename.endswith('.webm'):
        mimetype = 'audio/webm'
    elif filename.endswith('.mp3'):
        mimetype = 'audio/mpeg'
    else:
        mimetype = 'audio/wav'
    
    return send_from_directory(directory, filename, mimetype=mimetype, as_attachment=False)

# --- Error Handlers ---
@app.errorhandler(413)
def too_large(e):
    return jsonify({"error": "File too large. Maximum size is 50MB."}), 413

@app.errorhandler(500)
def internal_error(e):
    return jsonify({"error": "Internal server error"}), 500

# --- Application Startup ---
if __name__ == '__main__':
    print("Starting Transcribed AI with Whisper Large V3 API...")
    
    # Validate configuration
    if not db:
        print("⚠️  WARNING: Database connection failed!")
    
    if HUGGINGFACE_API_KEY:
        print("Hugging Face API configured - Whisper Large V3 ready")
    elif OPENAI_API_KEY:
        print("OpenAI API configured - Whisper fallback ready")
    else:
        print("No transcription APIs configured!")
    
    print("Application started successfully")
    
    # Get port from environment (Railway/Vercel compatibility)
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=False)
else:
    print("Production mode initialized...")