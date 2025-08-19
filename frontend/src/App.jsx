import React, { useState, useEffect, useRef, useCallback } from 'react';
import './HomePage.css';

import bg1 from './assets/bg1.jpg';
import bg2 from './assets/bg2.jpg';
import bg3 from './assets/bg3.jpg';
import bg5 from './assets/bg5.jpg';
import bg7 from './assets/bg7.jpg';
import bg10 from './assets/bg10.jpg';
import bg99 from './assets/bg99.png';

// **PRODUCTION API URL - CHANGE THIS FOR DEPLOYMENT**
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5001";




const TrashIcon = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
    </svg>
);

const EditIcon = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
    </svg>
);

// **SECURE TOKEN STORAGE - Using memory only, no localStorage**
class TokenStorage {
    constructor() {
        this.token = null;
    }
    
    setToken(token) {
        this.token = token;
    }
    
    getToken() {
        return this.token;
    }
    
    removeToken() {
        this.token = null;
    }
}

const tokenStorage = new TokenStorage();

// --- Main App Component ---
export default function App() {
    const [page, setPage] = useState('loading');
    const [userToken, setUserToken] = useState(null);

    useEffect(() => {
        // Check if user was logged in (in memory only)
        const token = tokenStorage.getToken();
        
        if (token) {
            setUserToken(token);
            setPage('dashboard');
        } else {
            setPage('home');
        }
    }, []);

    const navigateTo = (targetPage) => {
        if (targetPage === 'logout') {
            tokenStorage.removeToken();
            setUserToken(null);
            setPage('home');
        } else {
            setPage(targetPage);
        }
    };
    
    const handleLoginSuccess = (token) => {
        tokenStorage.setToken(token);
        setUserToken(token);
        setPage('dashboard');
    };

    if (page === 'loading') {
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

// --- HomePage Component (Same styling) ---
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

// --- Enhanced AuthModal with Better Error Handling ---
function AuthModal({ onLoginSuccess, closeModal }) {
    const [isLoginView, setIsLoginView] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleViewToggle = () => {
        if (isSubmitting) return; 
        setEmail('');
        setPassword('');
        setUsername('');
        setError('');
        setIsLoginView(!isLoginView);
    };

    const validateInput = () => {
        if (!email.trim()) {
            setError('Email is required');
            return false;
        }
        
        if (!email.includes('@')) {
            setError('Please enter a valid email');
            return false;
        }
        
        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return false;
        }
        
        if (!isLoginView && username.trim().length < 2) {
            setError('Username must be at least 2 characters');
            return false;
        }
        
        return true;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        
        if (!validateInput()) return;
        
        setIsSubmitting(true);
        
        const endpoint = isLoginView ? '/api/login' : '/api/signup';
        const payload = isLoginView 
            ? { email: email.trim(), password } 
            : { username: username.trim(), email: email.trim(), password };
        
        try {
            
            
            const response = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            

            if (!response.ok) {
                throw new Error(data.error || `Server error: ${response.status}`);
            }

            if (isLoginView) {
                if (data.access_token) {
                    
                    onLoginSuccess(data.access_token);
                    closeModal();
                } else {
                    throw new Error('Login failed - no token received');
                }
            } else {
                alert("Account created successfully! Please log in.");
                setIsLoginView(true);
                setPassword('');
            }
        } catch (err) {
           
            setError(err.message || 'Connection failed. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="modal-backdrop" onClick={closeModal}>
            <div className="form-container" onClick={(e) => e.stopPropagation()}>
                <div className="logo">Transcribed AI</div>
                <h2 className="title">{isLoginView ? 'Welcome Back' : 'Create an Account'}</h2>
                <form onSubmit={handleSubmit}>
                    {!isLoginView && (
                        <input 
                            type="text" 
                            placeholder="Username" 
                            value={username} 
                            onChange={(e) => setUsername(e.target.value)} 
                            required 
                            disabled={isSubmitting}
                            minLength={2}
                        />
                    )}
                    <input 
                        type="email" 
                        placeholder="Email" 
                        value={email} 
                        onChange={(e) => setEmail(e.target.value)} 
                        required 
                        disabled={isSubmitting}
                    />
                    <input 
                        type="password" 
                        placeholder="Password" 
                        value={password} 
                        onChange={(e) => setPassword(e.target.value)} 
                        required 
                        disabled={isSubmitting}
                        minLength={6}
                    />
                    {error && (
                        <p style={{
                            color: '#ff3b30', 
                            fontSize: '14px', 
                            marginBottom: '15px',
                            padding: '8px',
                            backgroundColor: '#ffe6e6',
                            borderRadius: '4px',
                            border: '1px solid #ffcccc'
                        }}>
                            {error}
                        </p>
                    )}
                    <button type="submit" className="submit-btn" disabled={isSubmitting}>
                        {isSubmitting ? 'Processing...' : (isLoginView ? 'Log In' : 'Sign Up')}
                    </button>
                </form>
                <div className="toggle-view">
                    {isLoginView ? "Don't have an account? " : "Already have an account? "}
                    <span onClick={handleViewToggle} style={{ cursor: isSubmitting ? 'not-allowed' : 'pointer' }}>
                        {isLoginView ? 'Sign Up' : 'Log In'}
                    </span>
                </div>
            </div>
        </div>
    );
}

// --- Enhanced Dashboard Component ---
function Dashboard({ userToken, navigateTo }) {
    const [transcripts, setTranscripts] = useState([]);
    const [selectedTranscript, setSelectedTranscript] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);
    const [error, setError] = useState('');
    const [isLoadingTranscripts, setIsLoadingTranscripts] = useState(true);
    const [recordingStatus, setRecordingStatus] = useState('');
    const [isMobile, setIsMobile] = useState(false);
    
    // Audio recording refs
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const streamRef = useRef(null);

    // Enhanced mobile detection
    useEffect(() => {
        const checkMobile = () => {
            const width = window.innerWidth;
            const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            setIsMobile(width <= 1024 || isTouchDevice);
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const makeAuthenticatedRequest = useCallback(async (url, options = {}) => {
        if (!userToken) {
            throw new Error('No authentication token');
        }

        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${userToken}`,
                'Accept': 'application/json',
                ...options.headers
            },
            credentials: 'include'
        });
        
        if (response.status === 401) {
            
            tokenStorage.removeToken();
            navigateTo('logout');
            throw new Error('Session expired. Please log in again.');
        }
        
        return response;
    }, [userToken, navigateTo]);

    // Fetch transcripts on load
    useEffect(() => {
        if (!userToken) {
            setIsLoadingTranscripts(false);
            return;
        }
        
        const fetchTranscripts = async () => {
            setIsLoadingTranscripts(true);
            setError('');
            try {
           
                const response = await makeAuthenticatedRequest(`${API_URL}/api/transcripts`);
                
                if (!response.ok) {
                    throw new Error('Failed to fetch transcripts.');
                }
                
                const data = await response.json();
             
                setTranscripts(data);
            } catch (error) {
                
                if (error.message !== 'Session expired. Please log in again.') {
                    setError(error.message);
                }
            } finally {
                setIsLoadingTranscripts(false);
            }
        };
        
        fetchTranscripts();
    }, [userToken, makeAuthenticatedRequest]);

    // Enhanced recording start with diagnostics
    const handleStartRecording = async () => {
        try {
            setError('');
            setRecordingStatus('Checking microphone access...');
            
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Microphone not supported in this browser');
            }
            
            // Try different audio constraints for better compatibility
            const constraints = [
                { 
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        sampleRate: 44100
                    }
                },
                { 
                    audio: {
                        sampleRate: 16000,
                        channelCount: 1
                    }
                },
                { audio: true }
            ];
            
            let stream = null;
            let lastError = null;
            
            for (let i = 0; i < constraints.length; i++) {
                try {
                    setRecordingStatus(`Trying microphone configuration ${i + 1}...`);
                    stream = await navigator.mediaDevices.getUserMedia(constraints[i]);
                  
                    break;
                } catch (err) {
                   
                    lastError = err;
                    continue;
                }
            }
            
            if (!stream) {
                throw lastError || new Error('Failed to access microphone');
            }
            
            streamRef.current = stream;
            
            setRecordingStatus('Configuring recorder...');
            
            // Test supported formats
            const possibleTypes = [
                'audio/webm;codecs=opus',
                'audio/webm',
                'audio/mp4',
                'audio/wav'
            ];
            
            let mimeType = '';
            for (const type of possibleTypes) {
                if (MediaRecorder.isTypeSupported(type)) {
                    mimeType = type;
              
                    break;
                }
            }
            
            if (!mimeType) {
                throw new Error('No supported audio format found in this browser');
            }
            
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: mimeType,
                bitsPerSecond: 128000
            });
            
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];
            
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                    
                }
            };
            
            mediaRecorder.onstop = handleRecordingStop;
            
            mediaRecorder.onerror = (event) => {
        
                setError(`Recording error: ${event.error?.message || 'Unknown error'}`);
                handleStopRecording();
            };
            
            mediaRecorder.onstart = () => {
                
                setRecordingStatus('Recording - Speak now!');
            };
            
            // Start recording with small intervals for better data collection
            mediaRecorder.start(100); // 100ms intervals
            
            setIsRecording(true);
            
        } catch (err) {
           
            
            let errorMessage = 'Recording failed: ';
            if (err.name === 'NotAllowedError') {
                errorMessage += "Microphone permission denied. Please allow microphone access and refresh.";
            } else if (err.name === 'NotFoundError') {
                errorMessage += "No microphone found. Please connect a microphone.";
            } else if (err.name === 'NotReadableError') {
                errorMessage += "Microphone is being used by another application.";
            } else if (err.name === 'OverconstrainedError') {
                errorMessage += "Microphone doesn't support the required settings.";
            } else {
                errorMessage += err.message;
            }
            
            setError(errorMessage);
            setRecordingStatus('');
            
            // Cleanup
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }
        }
    };

    const handleStopRecording = () => {

        
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            setRecordingStatus('Stopping recording...');
            mediaRecorderRef.current.stop();
        }
        
        // Stop all audio tracks
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => {
                track.stop();
              
            });
            streamRef.current = null;
        }
        
        setIsRecording(false);
    };
    
    const handleRecordingStop = async () => {
        
        setIsLoadingTranscript(true);
        setError('');
        setRecordingStatus('Processing audio...');
        
        try {
            if (audioChunksRef.current.length === 0) {
                throw new Error('No audio data recorded. Please try again.');
            }
            
            
            
            // Create audio blob
            const audioBlob = new Blob(audioChunksRef.current, { 
                type: mediaRecorderRef.current.mimeType 
            });
            
           
            
            if (audioBlob.size < 1000) { // Less than 1KB is probably too short
                throw new Error('Recording too short. Please record for at least 3-5 seconds.');
            }
            
            setRecordingStatus('Uploading and transcribing with Whisper Large V3...');
            
            // Prepare form data
            const formData = new FormData();
            const filename = `recording.${audioBlob.type.includes('webm') ? 'webm' : 'wav'}`;
            formData.append('audio', audioBlob, filename);
            
            
            
            const response = await makeAuthenticatedRequest(`${API_URL}/api/transcribe`, { 
                method: 'POST', 
                body: formData 
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }
            
            const newTranscript = await response.json();
            
            
            // Update state
            setTranscripts(prev => [newTranscript, ...prev]);
            setSelectedTranscript(newTranscript);
            setRecordingStatus('');
            
        } catch (error) {
            
            setError(error.message);
            setRecordingStatus('');
        } finally {
            setIsLoadingTranscript(false);
            audioChunksRef.current = [];
            mediaRecorderRef.current = null;
        }
    };

    const handleDeleteTranscript = async (id) => {
        if (!window.confirm("Are you sure you want to delete this transcript and its audio?")) {
            return;
        }
        
        try {
            await makeAuthenticatedRequest(`${API_URL}/api/transcripts/${id}`, { 
                method: 'DELETE' 
            });
            
            setTranscripts(prev => prev.filter(t => t.id !== id));
            if (selectedTranscript?.id === id) {
                setSelectedTranscript(null);
            }
        } catch (error) {
            console.error('Delete error:', error);
            setError("Failed to delete transcript.");
        }
    };

    const handleUpdateTranscript = async (id, newName, newText) => {
        try {
            await makeAuthenticatedRequest(`${API_URL}/api/transcripts/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    name: newName.trim(), 
                    text: newText.trim() 
                })
            });
            
            // Refresh transcripts list
            const listResponse = await makeAuthenticatedRequest(`${API_URL}/api/transcripts`);
            const data = await listResponse.json();
            setTranscripts(data);
            
            const updatedTranscript = data.find(t => t.id === id);
            if (updatedTranscript) {
                setSelectedTranscript(updatedTranscript);
            }
        } catch (error) {
            console.error('Update error:', error);
            setError("Failed to update transcript.");
        }
    };

    return (
        <div className="dashboard-container">
            <header className="dashboard-header">
                <h1>Transcribed AI Dashboard</h1>
                <button onClick={() => navigateTo('logout')} className="logout-btn">
                    Log Out
                </button>
            </header>
            <main className="dashboard-main">
                <div className="transcripts-list">
                    <h2>My Transcripts</h2>
                    
                    {error && (
                        <div style={{
                            color: '#ff3b30', 
                            marginBottom: '1rem', 
                            fontSize: '0.9rem', 
                            padding: '0.75rem', 
                            backgroundColor: '#ffe6e6', 
                            borderRadius: '6px',
                            border: '1px solid #ffcccc'
                        }}>
                            {error}
                        </div>
                    )}
                    
                    <div className="list-container">
                        {isLoadingTranscripts ? (
                            <div style={{ 
                                textAlign: 'center', 
                                padding: '2rem', 
                                color: '#888' 
                            }}>
                                Loading transcripts...
                            </div>
                        ) : transcripts.length > 0 ? (
                            transcripts.map(t => (
                                <div 
                                    key={t.id} 
                                    onClick={() => setSelectedTranscript(t)} 
                                    className={`transcript-item ${selectedTranscript?.id === t.id ? 'selected' : ''}`}
                                >
                                    <p className="item-name">{t.name}</p>
                                    <p className="item-text">
                                        {t.text.length > 100 ? `${t.text.substring(0, 100)}...` : t.text}
                                    </p>
                                </div>
                            ))
                        ) : (
                            <div className="empty-list">
                                <p>You have no transcripts yet.</p>
                                <p style={{fontSize: '0.9rem', color: '#666'}}>
                                    Click "Start Recording" to create your first transcript!
                                </p>
                            </div>
                        )}
                    </div>
                </div>
                
                <div className="main-content">
                    <div className="recording-section">
                        {!isRecording && !isLoadingTranscript && (
                            <button 
                                onClick={handleStartRecording} 
                                className="record-btn start"
                                style={{
                                    padding: isMobile ? '10px 20px' : '12px 24px',
                                    fontSize: isMobile ? '14px' : '16px',
                                    backgroundColor: '#34c759',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '25px',
                                    cursor: 'pointer',
                                    fontWeight: 'bold'
                                }}
                            >
                                Start Recording
                            </button>
                        )}
                        
                        {isRecording && (
                            <div style={{ textAlign: 'center' }}>
                                <button 
                                    onClick={handleStopRecording} 
                                    className="record-btn stop"
                                    style={{
                                        padding: isMobile ? '10px 20px' : '12px 24px',
                                        fontSize: isMobile ? '14px' : '16px',
                                        backgroundColor: '#ff3b30',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '25px',
                                        cursor: 'pointer',
                                        fontWeight: 'bold'
                                    }}
                                >
                                    Stop Recording
                                </button>
                            </div>
                        )}
                        
                        {isLoadingTranscript && (
                            <div style={{
                                padding: '20px',
                                textAlign: 'center',
                                color: '#007aff',
                                fontSize: isMobile ? '14px' : '16px',
                                fontWeight: '500'
                            }}>
                                Generating transcript with Whisper Large V3...
                            </div>
                        )}
                        
                        {recordingStatus && (
                            <div style={{ 
                                marginTop: '1rem', 
                                padding: isMobile ? '10px' : '12px', 
                                backgroundColor: '#e3f2fd', 
                                borderRadius: '8px',
                                color: '#1565c0',
                                fontSize: isMobile ? '12px' : '14px',
                                textAlign: 'center',
                                border: '1px solid #bbdefb',
                                fontWeight: '500'
                            }}>
                                {recordingStatus}
                            </div>
                        )}
                    </div>
                    
                    {selectedTranscript ? (
                        <ResponsiveTranscriptDetail 
                            transcript={selectedTranscript} 
                            onDelete={handleDeleteTranscript} 
                            onUpdate={handleUpdateTranscript}
                            isMobile={isMobile}
                        />
                    ) : (
                        <div className="placeholder-view">
                            <p>
                                {isMobile 
                                    ? 'Select a transcript above to view details' 
                                    : 'Select a transcript to view its analysis and playback audio'
                                }
                            </p>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

// --- Enhanced Transcript Detail Component ---
function ResponsiveTranscriptDetail({ transcript, onDelete, onUpdate, isMobile }) {
    const [isEditing, setIsEditing] = useState(false);
    const [editedName, setEditedName] = useState(transcript.name);
    const [editedText, setEditedText] = useState(transcript.text);

    useEffect(() => {
        setEditedName(transcript.name);
        setEditedText(transcript.text);
        setIsEditing(false);
    }, [transcript]);

    const handleSave = () => {
        if (editedName.trim() && editedText.trim()) {
            onUpdate(transcript.id, editedName.trim(), editedText.trim());
            setIsEditing(false);
        }
    };

    const handleCancel = () => {
        setEditedName(transcript.name);
        setEditedText(transcript.text);
        setIsEditing(false);
    };

    return (
        <div className="transcript-detail">
            <div className="detail-header">
                {isEditing ? (
                    <input 
                        type="text" 
                        value={editedName} 
                        onChange={(e) => setEditedName(e.target.value)} 
                        className="name-input"
                        style={{
                            fontSize: isMobile ? '1rem' : '1.25rem'
                        }}
                        placeholder="Transcript name"
                    />
                ) : (
                    <h3 style={{
                        fontSize: isMobile ? '1rem' : '1.25rem',
                        margin: 0,
                        color: '#111827'
                    }}>
                        {transcript.name}
                    </h3>
                )}
                
                <div className="actions">
                    {isEditing ? (
                        <>
                            <button onClick={handleSave} title="Save changes" style={{
                                background: '#34c759',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '6px 12px',
                                marginRight: '8px',
                                cursor: 'pointer',
                                fontSize: isMobile ? '12px' : '14px'
                            }}>
                                Save
                            </button>
                            <button onClick={handleCancel} title="Cancel editing" style={{
                                background: '#ff3b30',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '6px 12px',
                                cursor: 'pointer',
                                fontSize: isMobile ? '12px' : '14px'
                            }}>
                                Cancel
                            </button>
                        </>
                    ) : (
                        <>
                            <button onClick={() => setIsEditing(true)} title="Edit transcript" style={{
                                background: '#e2e8f0',
                                color: '#475569',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '6px 12px',
                                marginRight: '8px',
                                cursor: 'pointer',
                                fontSize: isMobile ? '12px' : '14px'
                            }}>
                                <EditIcon className="icon" style={{
                                    width: isMobile ? '1rem' : '1.25rem',
                                    height: isMobile ? '1rem' : '1.25rem',
                                    verticalAlign: 'middle',
                                    marginRight: '4px'
                                }}/>
                                
                            </button>
                            <button onClick={() => onDelete(transcript.id)} title="Delete transcript" style={{
                                background: '#e2e8f0',
                                color: '#475569',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '6px 12px',
                                cursor: 'pointer',
                                fontSize: isMobile ? '12px' : '14px'
                            }}>
                                <TrashIcon className="icon" style={{
                                    width: isMobile ? '1rem' : '1.25rem',
                                    height: isMobile ? '1rem' : '1.25rem',
                                    verticalAlign: 'middle',
                                    marginRight: '4px'
                                }}/>
                                
                            </button>
                        </>
                    )}
                </div>
            </div>
            
          
            {transcript.audioUrl && (
                <div style={{ marginBottom: '1.5rem' }}>
                    <audio 
                        controls 
                        src={`${API_URL}${transcript.audioUrl}`} 
                        className="audio-player"
                        style={{
                            width: '100%',
                            height: isMobile ? '40px' : '54px',
                            borderRadius: '8px',
                            backgroundColor: '#f5f5f5'
                        }}
                        preload="metadata"
                    >
                        Your browser does not support the audio element.
                    </audio>
                </div>
            )}
            
          
            <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{
                    fontSize: isMobile ? '14px' : '16px',
                    margin: '0 0 8px 0',
                    color: '#374151',
                    fontWeight: '600'
                }}>
                    Transcript:
                </h4>
                {isEditing ? (
                    <textarea 
                        value={editedText} 
                        onChange={(e) => setEditedText(e.target.value)} 
                        className="text-editor"
                        style={{
                            minHeight: isMobile ? '120px' : '150px',
                            fontSize: isMobile ? '14px' : '16px',
                            width: '100%',
                            padding: '0.75rem',
                            border: '2px solid #007aff',
                            borderRadius: '8px',
                            resize: 'vertical',
                            fontFamily: 'inherit',
                            lineHeight: '1.5',
                            outline: 'none'
                        }}
                        placeholder="Enter transcript text..."
                    />
                ) : (
                    <div 
                        className="transcript-text"
                        style={{
                            fontSize: isMobile ? '14px' : '16px',
                            lineHeight: '1.6',
                            padding: '1rem',
                            backgroundColor: '#f8f9fa',
                            borderRadius: '8px',
                            border: '1px solid #e5e7eb',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            color: '#374151'
                        }}
                    >
                        {transcript.text || 'No transcript available'}
                    </div>
                )}
            </div>
            
            
            {!isEditing && (
                <div className="analysis-section">
                    <h4 style={{
                        fontSize: isMobile ? '16px' : '18px',
                        margin: '0 0 16px 0',
                        color: '#374151',
                        fontWeight: '600'
                    }}>
                        Speech Analysis:
                    </h4>
                    <div className="analysis-grid" style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
                        gap: isMobile ? '12px' : '16px'
                    }}>
                        <div className="analysis-item" style={{
                            padding: isMobile ? '12px' : '16px',
                            backgroundColor: '#f8f9fa',
                            borderRadius: '8px',
                            border: '1px solid #e5e7eb',
                            textAlign: 'center'
                        }}>
                            <p style={{
                                fontSize: isMobile ? '18px' : '24px',
                                fontWeight: 'bold',
                                margin: '0 0 4px 0',
                                color: '#111827'
                            }}>
                                {transcript.word_count || 0}
                            </p>
                            <span style={{
                                fontSize: isMobile ? '12px' : '14px',
                                color: '#475569',
                                fontWeight: '500'
                            }}>
                                Words
                            </span>
                        </div>
                        
                        <div className="analysis-item" style={{
                            padding: isMobile ? '12px' : '16px',
                            backgroundColor: '#f8f9fa',
                            borderRadius: '8px',
                            border: '1px solid #e5e7eb',
                            textAlign: 'center'
                        }}>
                            <p style={{
                                fontSize: isMobile ? '18px' : '24px',
                                fontWeight: 'bold',
                                margin: '0 0 4px 0',
                                color: '#111827'
                            }}>
                                {transcript.sentence_count || 0}
                            </p>
                            <span style={{
                                fontSize: isMobile ? '12px' : '14px',
                                color: '#475569',
                                fontWeight: '500'
                            }}>
                                Sentences
                            </span>
                        </div>
                        
                        <div className="analysis-item" style={{
                            padding: isMobile ? '12px' : '16px',
                            backgroundColor: '#f8f9fa',
                            borderRadius: '8px',
                            border: '1px solid #e5e7eb',
                            textAlign: 'center'
                        }}>
                            <p style={{
                                fontSize: isMobile ? '18px' : '24px',
                                fontWeight: 'bold',
                                margin: '0 0 4px 0',
                                color: '#111827'
                            }}>
                                {transcript.speech_rate || 0}
                            </p>
                            <span style={{
                                fontSize: isMobile ? '12px' : '14px',
                                color: '#475569',
                                fontWeight: '500'
                            }}>
                                Words/Min
                            </span>
                        </div>
                        
                        <div className="analysis-item" style={{
                            padding: isMobile ? '12px' : '16px',
                            backgroundColor: '#f8f9fa',
                            borderRadius: '8px',
                            border: '1px solid #e5e7eb',
                            textAlign: 'center'
                        }}>
                            <p style={{
                                fontSize: isMobile ? '18px' : '24px',
                                fontWeight: 'bold',
                                margin: '0 0 4px 0',
                                color: '#111827'
                            }}>
                                {transcript.avg_words_per_sentence || 0}
                            </p>
                            <span style={{
                                fontSize: isMobile ? '12px' : '14px',
                                color: '#475569',
                                fontWeight: '500'
                            }}>
                                Avg Words/Sentence
                            </span>
                        </div>
                    </div>
                    
                </div>
            )}
        </div>
    );
}