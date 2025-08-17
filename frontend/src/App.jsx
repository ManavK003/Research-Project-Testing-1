import React, { useState, useEffect, useRef } from 'react';
import './HomePage.css';


import bg1 from './assets/bg1.jpg';
import bg2 from './assets/bg2.jpg';
import bg3 from './assets/bg3.jpg';
import bg5 from './assets/bg5.jpg';

import bg7 from './assets/bg7.jpg';

import bg10 from './assets/bg10.jpg';
import bg99 from './assets/bg99.png';


// address of Python backend.
const API_URL = 'http://127.0.0.1:5001';

// --- Icons ---
const TrashIcon = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
);
const EditIcon = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
);

// --- Main App Component ---
export default function App() {
    const [page, setPage] = useState('home');
    const [userToken, setUserToken] = useState(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            setUserToken(token);
            setPage('dashboard');
        } else {
            setPage('home');
        }
        setLoading(false);
    }, []);

    const navigateTo = (targetPage) => {
        if (targetPage === 'logout') {
            localStorage.removeItem('token');
            setUserToken(null);
            setPage('home');
        } else {
            setPage(targetPage);
        }
    };
    
    const handleLoginSuccess = (token) => {
        localStorage.setItem('token', token);
        setUserToken(token);
        setPage('dashboard');
    };

    if (loading) {
        return <div className="loading-screen">Loading...</div>;
    }

    switch (page) {
        case 'dashboard':
            return <Dashboard userToken={userToken} navigateTo={navigateTo} />;
        case 'home':
        default:
            return <HomePage onLoginSuccess={handleLoginSuccess} />;
    }
}

// --- HomePage ---
function HomePage({ onLoginSuccess }) {
  const [bgIndex, setBgIndex] = useState(0);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const backgroundImages = [bg1, bg2, bg3, bg5, bg7, bg99, bg10];

  useEffect(() => {
      const intervalId = setInterval(() => {
          setBgIndex((prevIndex) => (prevIndex + 1) % backgroundImages.length);
      }, 7000);
      return () => clearInterval(intervalId);
  }, [backgroundImages.length]);

  return (
    <div className="home-container" style={{ backgroundImage: `url(${backgroundImages[bgIndex]})` }}>
        <div className="home-overlay"></div>
        <div className="hero-text-container">
            <h1 className="hero-title">Transcribed AI</h1>
            <p className="hero-subtitle">Analyze Your Voice With Real Feedback</p>
        </div>
        <p className="hero-prompt">Log in or sign up to get started</p>
        <button className="get-started-btn" onClick={() => setIsFormVisible(true)}>
            Get Started
        </button>
        {isFormVisible && <AuthModal onLoginSuccess={onLoginSuccess} closeModal={() => setIsFormVisible(false)} />}
    </div>
  );
}


function AuthModal({ onLoginSuccess, closeModal }) {
    const [isLoginView, setIsLoginView] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [error, setError] = useState('');
    
    const handleModalContentClick = (e) => e.stopPropagation();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        const endpoint = isLoginView ? '/api/login' : '/api/signup';
        const payload = isLoginView ? { email, password } : { username, email, password };
        
        try {
            const response = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'An unknown error occurred.');
            }

            if (isLoginView) {
                onLoginSuccess(data.access_token);
            } else {
                alert("Sign up successful! Please log in.");
                setIsLoginView(true);
            }
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="modal-backdrop" onClick={closeModal}>
            <div className="form-container" onClick={handleModalContentClick}>
                <div className="logo">Transcribed AI</div>
                <h2 className="title">{isLoginView ? 'Welcome Back' : 'Create an Account'}</h2>
                <form onSubmit={handleSubmit}>
                    {!isLoginView && (
                        <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
                    )}
                    <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                    {error && <p style={{color: 'red', fontSize: '14px', marginBottom: '15px'}}>{error}</p>}
                    <button type="submit" className="submit-btn">{isLoginView ? 'Log In' : 'Sign Up'}</button>
                </form>
                <div className="toggle-view">
                    {isLoginView ? "Don't have an account? " : "Already have an account? "}
                    <span onClick={() => setIsLoginView(!isLoginView)}>{isLoginView ? 'Sign Up' : 'Log In'}</span>
                </div>
            </div>
        </div>
    );
}


function Dashboard({ userToken, navigateTo }) {
    const [transcripts, setTranscripts] = useState([]);
    const [selectedTranscript, setSelectedTranscript] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);

    useEffect(() => {
        const fetchTranscripts = async () => {
            try {
                const response = await fetch(`${API_URL}/api/transcripts`, {
                    headers: { 'Authorization': `Bearer ${userToken}` }
                });
                if (!response.ok) throw new Error('Could not fetch transcripts.');
                const data = await response.json();
                setTranscripts(data);
            } catch (error) {
                console.error(error);
                // If token is invalid, log out the user
                if (error.response && error.response.status === 401) {
                    navigateTo('logout');
                }
            }
        };
        if (userToken) fetchTranscripts();
    }, [userToken, navigateTo]);
    
    const handleStartRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            mediaRecorderRef.current.ondataavailable = (event) => audioChunksRef.current.push(event.data);
            mediaRecorderRef.current.onstop = handleRecordingStop;
            audioChunksRef.current = [];
            mediaRecorderRef.current.start();
            setIsRecording(true);
        } catch {
            alert("Could not start recording. Please ensure microphone permissions are enabled.");
        }
    };

    const handleStopRecording = () => {
        if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
        setIsRecording(false);
    };
    
    const handleRecordingStop = async () => {
        setIsLoadingTranscript(true);
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');

        try {
            const response = await fetch(`${API_URL}/api/transcribe`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${userToken}` },
                body: formData
            });
            if (!response.ok) throw new Error('Transcription failed.');
            const newTranscript = await response.json();
            setTranscripts(prev => [newTranscript, ...prev]);
        } catch (error) {
            console.error(error);
            alert("Error uploading audio. Please try again.");
        } finally {
            setIsLoadingTranscript(false);
        }
    };

    const handleDeleteTranscript = async (id) => {
        if (window.confirm("Are you sure you want to delete this transcript?")) {
            try {
                await fetch(`${API_URL}/api/transcripts/${id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${userToken}` }
                });
                setTranscripts(prev => prev.filter(t => t.id !== id));
                if (selectedTranscript?.id === id) setSelectedTranscript(null);
            } catch {
                alert("Failed to delete transcript.");
            }
        }
    };

    const handleUpdateTranscript = async (id, newName, newText) => {
        try {
            await fetch(`${API_URL}/api/transcripts/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${userToken}`
                },
                body: JSON.stringify({ name: newName, text: newText })
            });
            // Fetch the updated list to get new analysis
            const response = await fetch(`${API_URL}/api/transcripts`, {
                headers: { 'Authorization': `Bearer ${userToken}` }
            });
            const data = await response.json();
            setTranscripts(data);
            // Update the selected transcript view
            const updatedTranscript = data.find(t => t.id === id);
            if (updatedTranscript) setSelectedTranscript(updatedTranscript);

        } catch {
            alert("Failed to update transcript.");
        }
    };

    return (
        <div className="dashboard-container">
            <header className="dashboard-header">
                <h1>Transcribed AI Dashboard</h1>
                <button onClick={() => navigateTo('logout')} className="logout-btn">Log Out</button>
            </header>
            <main className="dashboard-main">
                <div className="transcripts-list">
                    <h2>My Transcripts</h2>
                    <div className="list-container">
                        {transcripts.length > 0 ? (
                            transcripts.map(t => (
                                <div key={t.id} onClick={() => setSelectedTranscript(t)} className={`transcript-item ${selectedTranscript?.id === t.id ? 'selected' : ''}`}>
                                    <p className="item-name">{t.name}</p>
                                    <p className="item-text">{t.text}</p>
                                </div>
                            ))
                        ) : (
                            <div className="empty-list">
                                <p>You have no transcripts yet.</p>
                                <p>Click "Add Recording" to get started!</p>
                            </div>
                        )}
                    </div>
                </div>
                <div className="main-content">
                    <div className="recording-section">
                        {!isRecording && !isLoadingTranscript && (
                            <button onClick={handleStartRecording} className="record-btn start">Add Recording</button>
                        )}
                        {isRecording && (
                            <button onClick={handleStopRecording} className="record-btn stop">Stop Recording</button>
                        )}
                        {isLoadingTranscript && (
                            <div className="loading-text">Generating transcript...</div>
                        )}
                    </div>
                    {selectedTranscript ? (
                        <TranscriptDetail transcript={selectedTranscript} onDelete={handleDeleteTranscript} onUpdate={handleUpdateTranscript} />
                    ) : (
                        <div className="placeholder-view">
                           <p>Select a transcript to see its analysis.</p>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

// --- TranscriptDetail (UPDATED with new analysis fields) ---
function TranscriptDetail({ transcript, onDelete, onUpdate }) {
    const [isEditing, setIsEditing] = useState(false);
    const [editedName, setEditedName] = useState(transcript.name);
    const [editedText, setEditedText] = useState(transcript.text);

    useEffect(() => {
        setEditedName(transcript.name);
        setEditedText(transcript.text);
        setIsEditing(false);
    }, [transcript]);

    const handleSave = () => {
        onUpdate(transcript.id, editedName, editedText);
        setIsEditing(false);
    };

    return (
        <div className="transcript-detail">
            <div className="detail-header">
                {isEditing ? (
                    <input type="text" value={editedName} onChange={(e) => setEditedName(e.target.value)} className="name-input" />
                ) : (
                    <h3>{transcript.name}</h3>
                )}
                <div className="actions">
                    <button onClick={() => setIsEditing(!isEditing)}><EditIcon className="icon"/></button>
                    <button onClick={() => onDelete(transcript.id)}><TrashIcon className="icon"/></button>
                </div>
            </div>
            
            {transcript.audioUrl && <audio controls src={`${API_URL}/${transcript.audioUrl}`} className="audio-player"></audio>}

            {isEditing ? (
                <textarea value={editedText} onChange={(e) => setEditedText(e.target.value)} className="text-editor" />
            ) : (
                <p className="transcript-text">{transcript.text}</p>
            )}

            {isEditing && (
                 <div className="save-actions">
                    <button onClick={handleSave} className="save-btn">Save Changes</button>
                </div>
            )}
            
            {!isEditing && (
                <div className="analysis-section">
                    <h4>Analysis</h4>
                    <div className="analysis-grid">
                        <div className="analysis-item"><p>{transcript.word_count}</p><span>Words</span></div>
                        <div className="analysis-item"><p>{transcript.sentence_count}</p><span>Sentences</span></div>
                        <div className="analysis-item"><p>{transcript.speech_rate}</p><span>Words/Min</span></div>
                        <div className="analysis-item"><p>{transcript.avg_words_per_sentence}</p><span>Avg. Words/Sentence</span></div>
                    </div>
                </div>
            )}
        </div>
    );
}

// --- All Minimal CSS for Dashboard (since Tailwind was removed) ---
const styles = `
.loading-screen { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; background-color: #1a1a1a; color: white; font-size: 1.5rem; }
.dashboard-container { display: grid; grid-template-rows: auto 1fr; height: 100vh; font-family: sans-serif; }
.dashboard-header { background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 1rem 1.5rem; display: flex; justify-content: space-between; align-items: center; }
.dashboard-header h1 { font-size: 1.25rem; font-weight: bold; }
.logout-btn { background-color: #007aff; color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; }
.dashboard-main { display: grid; grid-template-columns: 1fr 2fr; gap: 1.5rem; padding: 1.5rem; background-color: #f0f2f5; overflow: hidden; }
.transcripts-list { background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); display: flex; flex-direction: column; }
.transcripts-list h2 { font-size: 1.1rem; font-weight: 600; margin-bottom: 1rem; }
.list-container { overflow-y: auto; flex-grow: 1; }
.transcript-item { padding: 1rem; border-radius: 6px; cursor: pointer; border: 2px solid transparent; background-color: #f9f9f9; margin-bottom: 0.5rem; }
.transcript-item:hover { background-color: #e9e9e9; }
.transcript-item.selected { background-color: #e0eaff; border-color: #007aff; }
.item-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.item-text { font-size: 0.9rem; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.empty-list { text-align: center; padding-top: 2rem; color: #888; }
.main-content { display: flex; flex-direction: column; gap: 1.5rem; }
.recording-section { background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center; }
.record-btn { color: white; font-weight: bold; border: none; padding: 0.75rem 2rem; border-radius: 9999px; cursor: pointer; transition: transform 0.2s; }
.record-btn:hover { transform: scale(1.05); }
.record-btn.start { background-color: #34c759; }
.record-btn.stop { background-color: #ff3b30; animation: pulse 1.5s infinite; }
@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(255, 59, 48, 0.7); } 70% { box-shadow: 0 0 0 10px rgba(255, 59, 48, 0); } 100% { box-shadow: 0 0 0 0 rgba(255, 59, 48, 0); } }
.loading-text { color: #555; }
.placeholder-view { background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; color: #888; flex-grow: 1; }
.transcript-detail { background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); flex-grow: 1; display: flex; flex-direction: column; gap: 1rem; }
.detail-header { display: flex; justify-content: space-between; align-items: flex-start; }
.detail-header h3 { font-size: 1.25rem; font-weight: bold; }
.name-input { font-size: 1.25rem; font-weight: bold; border: none; border-bottom: 2px solid #007aff; width: 100%; outline: none; }
.actions button { background: none; border: none; cursor: pointer; color: #888; }
.actions button:hover { color: #007aff; }
.icon { width: 1.25rem; height: 1.25rem; }
.audio-player { width: 100%; }
.text-editor { width: 100%; height: 150px; border: 1px solid #ddd; border-radius: 6px; padding: 0.5rem; font-family: inherit; }
.transcript-text { white-space: pre-wrap; color: #333; }
.save-actions { display: flex; justify-content: flex-end; }
.save-btn { background-color: #007aff; color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; }
.analysis-section h4 { font-size: 1.1rem; font-weight: 600; margin-top: 1rem; margin-bottom: 0.5rem; }
.analysis-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 1rem; text-align: center; }
.analysis-item { background: #f0f2f5; padding: 1rem; border-radius: 6px; }
.analysis-item p { font-size: 1.5rem; font-weight: bold; }
.analysis-item span { font-size: 0.8rem; color: #666; }
`;
const styleSheet = document.createElement("style");
styleSheet.innerText = styles;
document.head.appendChild(styleSheet);