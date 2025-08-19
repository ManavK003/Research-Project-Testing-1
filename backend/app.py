import os
import re
import io
from flask import Flask, request, jsonify, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity, JWTManager
from flask_cors import CORS
from datetime import datetime, timedelta
import traceback
from dotenv import load_dotenv
import openai


load_dotenv()

# --- App Configuration ---
app = Flask(__name__)

CORS(app, 
     origins=[
         "http://localhost:5173", 
         "http://127.0.0.1:5173",
         "https://research-project-testing-1.vercel.app",
         "https://*.netlify.app"
     ],
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     allow_headers=["Content-Type", "Authorization"],
     supports_credentials=True)

# --- Database Configuration (PostgreSQL Ready) ---
app.config["JWT_TOKEN_LOCATION"] = ["headers"]
app.config["JWT_CSRF_IN_COOKIES"] = False


database_url = os.environ.get('DATABASE_URL')
if database_url:
   
    if database_url.startswith('postgres://'):
        database_url = database_url.replace('postgres://', 'postgresql://', 1)
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
else:
    
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///database.db'

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_pre_ping': True,
    'pool_recycle': 300,
}
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'a-very-strong-default-secret-key')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=24)
app.config['UPLOAD_FOLDER'] = 'audio_files'

# Initialize extensions
db = SQLAlchemy(app)
bcrypt = Bcrypt(app)
jwt = JWTManager(app)


os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)


@app.before_request
def log_request_info():
    auth_header = request.headers.get('Authorization')
    if auth_header:
        pass

@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_payload):
    return jsonify({"error": "Token has expired"}), 401

@jwt.invalid_token_loader
def invalid_token_callback(error):
    return jsonify({"error": "Invalid token"}), 401

@jwt.unauthorized_loader
def missing_token_callback(error):
    return jsonify({"error": "Authorization token is required"}), 401


openai.api_key = os.getenv('OPENAI_API_KEY')

# --- Database Models (PostgreSQL Compatible) ---
class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    

    transcripts = db.relationship('Transcript', backref='user', lazy=True, cascade="all, delete-orphan")
    
    def __repr__(self):
        return f'<User {self.username}>'

class Transcript(db.Model):
    __tablename__ = 'transcripts'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    name = db.Column(db.String(150), nullable=False)
    text = db.Column(db.Text, nullable=False)
    audio_filename = db.Column(db.String(200), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    
    word_count = db.Column(db.Integer, default=0)
    sentence_count = db.Column(db.Integer, default=0)
    speech_rate = db.Column(db.Float, default=0.0)
    avg_words_per_sentence = db.Column(db.Float, default=0.0)
    
    def __repr__(self):
        return f'<Transcript {self.name}>'
    
    def to_dict(self, include_audio_url=False, token=None):
        result = {
            "id": self.id,
            "name": self.name,
            "text": self.text,
            "createdAt": self.created_at.isoformat(),
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
            "word_count": self.word_count or 0,
            "sentence_count": self.sentence_count or 0,
            "speech_rate": self.speech_rate or 0.0,
            "avg_words_per_sentence": self.avg_words_per_sentence or 0.0
        }
        
        if include_audio_url and self.audio_filename and token:
            result["audioUrl"] = f"/audio/{self.user_id}/{self.audio_filename}?token={token}"
        elif self.audio_filename:
            result["audioUrl"] = None
            
        return result

# --- Database Initialization Function ---
def init_database():
    """
    Initialize database tables with proper error handling
    """
    try:
        with app.app_context():
            print("Creating database tables...")
            db.create_all()
            print("Database tables created successfully!")
            
            
            db.session.execute(db.text('SELECT 1'))
            db.session.commit()
            print("Database connection test successful!")
            
            return True
    except Exception as e:
        print(f"Database initialization error: {e}")
        traceback.print_exc()
        return False

# --- Helper Functions ---
def transcribe_with_openai(audio_file_path):
    """
    Use OpenAI Whisper API for transcription
    """
    try:
        with open(audio_file_path, 'rb') as audio_file:
            response = openai.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                response_format="text"
            )
        return response.strip() if response.strip() else "[No speech detected]"
    except Exception as e:
        print(f"OpenAI transcription error: {e}")
        return "[Transcription error]"

def get_audio_duration(audio_path):
    """
    Get audio duration using multiple methods
    """
    try:
  
        import wave
        with wave.open(audio_path, 'r') as audio_file:
            frames = audio_file.getnframes()
            rate = audio_file.getframerate()
            return frames / float(rate)
    except:
        try:
         
            file_size = os.path.getsize(audio_path)
          
            estimated_duration = file_size / 4000 
            return max(1.0, estimated_duration)
        except:
            return 10.0  

def analyze_transcript(text, audio_duration_seconds):
    """
    Analyze transcript text for statistics
    """
    if not text or text.strip() in ["[No speech detected]", "[Transcription error]"]:
        return {
            "word_count": 0,
            "sentence_count": 0,
            "speech_rate": 0.0,
            "avg_words_per_sentence": 0.0
        }
    
    words = text.split()
    word_count = len(words)
    
    sentences = re.split(r'[.!?]+', text)
    sentence_count = len([s for s in sentences if s.strip()])
    if sentence_count == 0: 
        sentence_count = 1
    
    speech_rate = (word_count / audio_duration_seconds) * 60 if audio_duration_seconds > 0 else 0
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
    """
    Health check endpoint with database connectivity test
    """
    try:
        
        db.session.execute(db.text('SELECT 1'))
        db.session.commit()
        
        
        openai_status = "configured" if openai.api_key else "missing"
        
        return jsonify({
            "status": "healthy",
            "database": "connected",
            "openai": openai_status,
            "timestamp": datetime.utcnow().isoformat()
        }), 200
    except Exception as e:
        return jsonify({
            "status": "error",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }), 500

@app.route('/api/signup', methods=['POST'])
def signup():
    try:
        data = request.get_json()
        
        if not data or not data.get('email') or not data.get('password'):
            return jsonify({"error": "Missing required fields"}), 400
            
        if User.query.filter_by(email=data['email']).first():
            return jsonify({"error": "Email already registered"}), 409
            
        hashed_password = bcrypt.generate_password_hash(data['password']).decode('utf-8')
        new_user = User(
            username=data.get('username', '').strip() or data['email'].split('@')[0],
            email=data['email'].strip().lower(),
            password_hash=hashed_password
        )
        
        db.session.add(new_user)
        db.session.commit()
        
        return jsonify({"message": "User created successfully"}), 201
        
    except Exception as e:
        db.session.rollback()
        print(f"Signup error: {e}")
        traceback.print_exc()
        return jsonify({"error": "Internal server error"}), 500

@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        
        if not data or not data.get('email') or not data.get('password'):
            return jsonify({"error": "Missing email or password"}), 400
            
        user = User.query.filter_by(email=data['email'].strip().lower()).first()
        
        if user and bcrypt.check_password_hash(user.password_hash, data['password']):
            access_token = create_access_token(identity=str(user.id))
            return jsonify({"access_token": access_token}), 200
            
        return jsonify({"error": "Invalid credentials"}), 401
        
    except Exception as e:
        print(f"Login error: {e}")
        return jsonify({"error": "Internal server error"}), 500

@app.route('/api/transcripts', methods=['GET'])
@jwt_required()
def get_transcripts():
    try:
        current_user_id = int(get_jwt_identity())
        transcripts = Transcript.query.filter_by(user_id=current_user_id).order_by(
            Transcript.created_at.desc()
        ).all()
        
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        
        result = [t.to_dict(include_audio_url=True, token=token) for t in transcripts]
        
        return jsonify(result), 200
        
    except Exception as e:
        print(f"Get transcripts error: {e}")
        return jsonify({"error": "Failed to fetch transcripts"}), 500

@app.route('/api/transcripts', methods=['OPTIONS'])
def handle_options():
    return '', 204

@app.route('/api/transcribe', methods=['POST'])
@jwt_required()
def transcribe_audio():
    current_user_id = int(get_jwt_identity())
    
    try:
        if 'audio' not in request.files:
            return jsonify({"error": "No audio file provided"}), 400
        
        audio_file = request.files['audio']
        if audio_file.filename == '':
            return jsonify({"error": "No file selected"}), 400

        # Create user directory
        user_audio_dir = os.path.join(app.config['UPLOAD_FOLDER'], str(current_user_id))
        os.makedirs(user_audio_dir, exist_ok=True)
        
        # Generate filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"recording_{timestamp}.webm"
        file_path = os.path.join(user_audio_dir, filename)
        
        # Save uploaded file
        audio_file.save(file_path)
        print(f"Audio file saved: {file_path}")
        
        # Get audio duration
        duration_seconds = get_audio_duration(file_path)
        print(f"Audio duration: {duration_seconds} seconds")
        
        # Transcribe with OpenAI
        transcription = transcribe_with_openai(file_path)
        print(f"Transcription: {transcription[:100]}...")
        
        # Analyze transcript
        analysis = analyze_transcript(transcription, duration_seconds)
        print(f"Analysis: {analysis}")
        
        # Save to database
        new_transcript = Transcript(
            user_id=current_user_id,
            name=f"Recording {timestamp}",
            text=transcription,
            audio_filename=filename,
            **analysis
        )
        
        db.session.add(new_transcript)
        db.session.commit()
        
        # Return response
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        
        return jsonify(new_transcript.to_dict(include_audio_url=True, token=token)), 201

    except Exception as e:
        db.session.rollback()
        print(f"Transcription error: {e}")
        traceback.print_exc()
        
      
        try:
            if 'file_path' in locals() and os.path.exists(file_path):
                os.remove(file_path)
        except:
            pass
        
        return jsonify({"error": f"Processing failed: {str(e)}"}), 500

@app.route('/api/transcripts/<int:transcript_id>', methods=['PUT'])
@jwt_required()
def update_transcript(transcript_id):
    try:
        current_user_id = int(get_jwt_identity())
        transcript = Transcript.query.get_or_404(transcript_id)
        
        if transcript.user_id != current_user_id:
            return jsonify({"error": "Unauthorized"}), 403
            
        data = request.get_json()
        
        if 'name' in data:
            transcript.name = data['name']
            
        if 'text' in data:
            transcript.text = data['text']
            
            # Recalculate analysis if text changed
            try:
                if transcript.audio_filename:
                    audio_path = os.path.join(
                        app.config['UPLOAD_FOLDER'], 
                        str(transcript.user_id), 
                        transcript.audio_filename
                    )
                    duration = get_audio_duration(audio_path)
                    analysis = analyze_transcript(transcript.text, duration)
                    
                    for key, value in analysis.items():
                        setattr(transcript, key, value)
            except Exception as analysis_error:
                print(f"Analysis update error: {analysis_error}")
                
        transcript.updated_at = datetime.utcnow()
        db.session.commit()
        
        return jsonify({"message": "Transcript updated successfully"}), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"Update transcript error: {e}")
        return jsonify({"error": "Failed to update transcript"}), 500

@app.route('/api/transcripts/<int:transcript_id>', methods=['DELETE'])
@jwt_required()
def delete_transcript(transcript_id):
    try:
        current_user_id = int(get_jwt_identity())
        transcript = Transcript.query.get_or_404(transcript_id)
        
        if transcript.user_id != current_user_id:
            return jsonify({"error": "Unauthorized"}), 403
            
        # Delete audio file if it exists
        if transcript.audio_filename:
            audio_path = os.path.join(
                app.config['UPLOAD_FOLDER'], 
                str(transcript.user_id), 
                transcript.audio_filename
            )
            try:
                if os.path.exists(audio_path):
                    os.remove(audio_path)
                    print(f"Deleted audio file: {audio_path}")
            except Exception as file_error:
                print(f"Error deleting audio file: {file_error}")
        
        # Delete from database
        db.session.delete(transcript)
        db.session.commit()
        
        return jsonify({"message": "Transcript deleted successfully"}), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"Delete transcript error: {e}")
        return jsonify({"error": "Failed to delete transcript"}), 500

# Audio serving routes
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
    
    return send_from_directory(directory, filename, mimetype='audio/webm', as_attachment=False)

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
    
    return send_from_directory(directory, filename, mimetype='audio/webm', as_attachment=False)

# --- Application Startup ---
if __name__ == '__main__':
    print("Starting Transcribed AI application...")
    
    # Initialize database
    if not init_database():
        print("Failed to initialize database. Exiting...")
        exit(1)
    
    print("Application started successfully!")
    
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=False)
else:
   
    print("Initializing database for production...")
    init_database()