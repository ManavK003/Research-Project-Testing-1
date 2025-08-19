# Research-Project-Testing-1

Transcribe AI is a fully functional and secure full-stack web application that allows users to record, transcribe and analyze their voice. Built using the idea of a modern single page React frontend for UI, and a Python based backend made on Flask framework for flexibility, model integration and ease of development. The application was built prioritizing safety and security and considering them paramount and more important than anything else at every instance during the entire project. The application has been extensively tested using SQL injection attacks and other tests. The application is also completely and fully responsive for every kind of screen type and size as an attempt to ensure user satisfaction.

# Intsructions for loading or using the application:

Directly visit this link to test applicaiton: https://research-project-testing-1.vercel.app/

# Load Application and Test Locally:

1. Clone and open this project on VSCode: git clone https://github.com/ManavK003/Research-Project-Testing-1.git
2. cd backend
3. Create and activate virtual environment

python -m venv venv

Activate (Windows)
venv\Scripts\activate

Activate (Mac/Linux)
source venv/bin/activate

4. Inside the virtual environmnet, install dependicies: pip install flask flask-bcrypt flask-jwt-extended flask-cors python-dotenv pymongo requests openai
5. Setup MongoDB Dataabase and get API Keys from MongoDB, Hugging Face ad Open AI
6. Create .env file in backend and provide environment variables in this form:

Required: MongoDB Atlas Connection String
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/transcribed_ai?retryWrites=true&w=majority

Required: JWT Secret (use any random string)
JWT_SECRET_KEY=your-random-secret-key-here

Required: At least one API key for transcription
HUGGINGFACE_API_KEY=hf_your_token_here
OPENAI_API_KEY=sk_your_openai_key_here

Optional: Custom port
PORT=5001

7. In a different VSCode terminal: cd frontend
8. create the following .env file in frontend: VITE_API_URL=http://localhost:5001
9. In backend terminal start backend: python app.py
10. In frontend terminal start frontend: npm run dev

    
# Web Service Framework & Architecture
Backend API: Lightweight, yet powerful REST API built using Flask framework for Python, providing JSON-based API endpoints and routes for all functions, including user authentication, data retrieval, audio processing, and transcript generation.

Frontend Application: The frontend UI is a dynamic and responsive single-page application built with React and Tailwind CSS. It communicates with the Flask backend via API calls and routes to provide a seamless user experience.

ASR Model Used: Initially the entire application was built to be fully functioning and completely secure by locally loading the AI model into the backend server. Although this was completely secure and fully functioning in every single way to run locally and in the development stage, to load such a big and heavy AI model and the other heavy libraries and packages required with it, such as Torch, Torch Audio and Librosa, onto an online backend cloud platform or deployment server proved to be very challenging for platforms like Railway and Vercel. Due to this, the decision was made to make API calls to the Whisper large v3 model in the backend using Hugging Face API calls.


Flask Extensions (for enhanced functionality and security): Flask-CORS used to manage cross-origin resource sharing, allowing the Vercel-hosted frontend to securely communicate with the Railway-hosted backend. Flask-Bcrypt provides robust password hashing capabilities. Flask-JWT-Extended manages user sessions through secure JSON Web Tokens.

# Deployment Information:
Frontend: Vercel        Backend: Railway        Database: MongoDB

# Database Management and Storage

All core application data, including user profiles and transcript metadata, is stored in a MongoDB database. The database contains two primary collections:
1. users: Stores user information such as username, email, and the hashed password.
2. transcripts: Stores the text of each transcription, speech analysis metadata, and a reference to the associated audio file. Each document is explicitly linked to a user_id to ensure data ownership.
