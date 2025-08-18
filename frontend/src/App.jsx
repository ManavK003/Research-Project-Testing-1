import React, { useState, useEffect, useRef, useCallback } from 'react';
import './HomePage.css';

import bg1 from './assets/bg1.jpg';
import bg2 from './assets/bg2.jpg';
import bg3 from './assets/bg3.jpg';
import bg5 from './assets/bg5.jpg';
import bg7 from './assets/bg7.jpg';
import bg10 from './assets/bg10.jpg';
import bg99 from './assets/bg99.png';

const API_URL = 'https://research-project-testing-1-production.up.railway.app' ;

const TrashIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>);
const EditIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>);

// --- Main App Component ---
export default function App() {
    const [page, setPage] = useState('home');
    const [userToken, setUserToken] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = null; // localStorage.getItem('token');
        
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
            // localStorage.removeItem('token');
            setUserToken(null);
            setPage('home');
        } else {
            setPage(targetPage);
        }
    };
    
    const handleLoginSuccess = (token) => {
        // localStorage.setItem('token', token);
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

// --- AuthModal ---
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


    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);
        
        const endpoint = isLoginView ? '/api/login' : '/api/signup';
        const payload = isLoginView ? { email, password } : { username, email, password };
        
        try {
            const response = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Network error' }));
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }

            const data = await response.json();

            if (isLoginView) {
                if (data.access_token) {
                    onLoginSuccess(data.access_token);
                    closeModal();
                } else {
                    throw new Error('No access token received');
                }
            } else {
                alert("Sign up successful! Please log in.");
                setIsLoginView(true);
            }
        } catch (err) {
            setError(err.message);
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
                    {!isLoginView && <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required disabled={isSubmitting}/>}
                    <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={isSubmitting}/>
                    <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={isSubmitting}/>
                    {error && <p style={{color: 'red', fontSize: '14px', marginBottom: '15px'}}>{error}</p>}
                    <button type="submit" className="submit-btn" disabled={isSubmitting}>
                        {isSubmitting ? 'Processing...' : (isLoginView ? 'Log In' : 'Sign Up')}
                    </button>
                </form>
                <div className="toggle-view">
                    {isLoginView ? "Don't have an account? " : "Already have an account? "}
                    <span onClick={handleViewToggle}>
                        {isLoginView ? 'Sign Up' : 'Log In'}
                    </span>
                </div>
            </div>
        </div>
    );
}

// --- ENHANCED RESPONSIVE Dashboard with Proper Audio Recording ---
function Dashboard({ userToken, navigateTo }) {
    const [transcripts, setTranscripts] = useState([]);
    const [selectedTranscript, setSelectedTranscript] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);
    const [error, setError] = useState('');
    const [isLoadingTranscripts, setIsLoadingTranscripts] = useState(true);
    const [recordingStatus, setRecordingStatus] = useState('');
    const [isMobile, setIsMobile] = useState(false);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const streamRef = useRef(null);
    const analyzerRef = useRef(null);
    const animationFrameRef = useRef(null);

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
        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${userToken}`,
                'Accept': 'application/json',
                ...options.headers
            }
        });
        if (response.status === 401) {
            // localStorage.removeItem('token');
            navigateTo('logout');
            throw new Error('Session expired. Please log in again.');
        }
        return response;
    }, [userToken, navigateTo]);

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
                if (!response.ok) throw new Error('Failed to fetch transcripts.');
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

    const stopAudioLevelMonitoring = () => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        analyzerRef.current = null;
    };
    
    // ENHANCED RECORDING START WITH COMPREHENSIVE DIAGNOSTICS
    const handleStartRecording = async () => {
        try {
            setError('');
            setRecordingStatus('Running diagnostics...');
            
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('MediaDevices API not supported in this browser');
            }
            
            setRecordingStatus('Requesting microphone permission...');
            
            const constraints = [
                { 
                    audio: {
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false,
                        sampleRate: 44100,
                        channelCount: 1
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
                    stream = await navigator.mediaDevices.getUserMedia(constraints[i]);
                    break;
                } catch (err) {
                    lastError = err;
                    continue;
                }
            }
            
            if (!stream) {
                throw lastError || new Error('Failed to get microphone access with any constraints');
            }
            
            streamRef.current = stream;
            
            setRecordingStatus('Testing audio stream...');
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            setRecordingStatus('Microphone ready, configuring recorder...');
            
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
                throw new Error('No supported audio format found');
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
                setError(`Recording error: ${event.error}`);
                handleStopRecording();
            };
            
            mediaRecorder.onstart = () => {
            };
            
            mediaRecorder.start(50); // Every 50ms for maximum data collection
            
            setIsRecording(true);
            setRecordingStatus('Recording active - Speak now!');
            
        } catch (err) {
            if (err.name === 'NotAllowedError') {
                setError("Microphone permission denied. Please allow microphone access and refresh the page.");
            } else if (err.name === 'NotFoundError') {
                setError("No microphone found. Please connect a microphone and try again.");
            } else if (err.name === 'NotReadableError') {
                setError("Microphone is being used by another application. Please close other apps using the microphone.");
            } else if (err.name === 'OverconstrainedError') {
                setError("Microphone doesn't support the required settings. Try a different microphone.");
            } else {
                setError(`Recording failed: ${err.message}`);
            }
            setRecordingStatus('');
            stopAudioLevelMonitoring();
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
        
        stopAudioLevelMonitoring();
        setIsRecording(false);
    };
    
    const handleRecordingStop = async () => {
        setIsLoadingTranscript(true);
        setError('');
        setRecordingStatus('Processing audio...');
        
        try {
            if (audioChunksRef.current.length === 0) {
                throw new Error('No audio data was recorded. Please check your microphone and try again.');
            }
            
            // Create blob from chunks
            const audioBlob = new Blob(audioChunksRef.current, { 
                type: mediaRecorderRef.current.mimeType 
            });
            
            if (audioBlob.size < 100) { 
                throw new Error('Recording too short. Please record for at least 2-3 seconds.');
            }
            
            setRecordingStatus('Uploading and transcribing...');
            
            // Test the blob by creating a URL
            const audioUrl = URL.createObjectURL(audioBlob);
            
            const formData = new FormData();
            formData.append('audio', audioBlob, `recording.${audioBlob.type.includes('webm') ? 'webm' : 'wav'}`);
            
            const response = await makeAuthenticatedRequest(`${API_URL}/api/transcribe`, { 
                method: 'POST', 
                body: formData 
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }
            
            const newTranscript = await response.json();
            
            URL.revokeObjectURL(audioUrl);
            
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
        if (window.confirm("Are you sure you want to delete this transcript?")) {
            try {
                await makeAuthenticatedRequest(`${API_URL}/api/transcripts/${id}`, { method: 'DELETE' });
                setTranscripts(prev => prev.filter(t => t.id !== id));
                if (selectedTranscript?.id === id) setSelectedTranscript(null);
            } catch {
                setError("Failed to delete transcript.");
            }
        }
    };

    const handleUpdateTranscript = async (id, newName, newText) => {
        try {
            await makeAuthenticatedRequest(`${API_URL}/api/transcripts/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName, text: newText })
            });
            const listResponse = await makeAuthenticatedRequest(`${API_URL}/api/transcripts`);
            const data = await listResponse.json();
            setTranscripts(data);
            const updatedTranscript = data.find(t => t.id === id);
            if (updatedTranscript) setSelectedTranscript(updatedTranscript);
        } catch {
            setError("Failed to update transcript.");
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
                    {error && <div style={{color: 'red', marginBottom: '1rem', fontSize: '0.9rem', padding: '0.5rem', backgroundColor: '#ffe6e6', borderRadius: '4px'}}>{error}</div>}
                    <div className="list-container">
                        {isLoadingTranscripts ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>Loading...</div>
                        ) : transcripts.length > 0 ? (
                            transcripts.map(t => (
                                <div key={t.id} onClick={() => setSelectedTranscript(t)} className={`transcript-item ${selectedTranscript?.id === t.id ? 'selected' : ''}`}>
                                    <p className="item-name">{t.name}</p>
                                    <p className="item-text">{t.text}</p>
                                </div>
                            ))
                        ) : (
                            <div className="empty-list">
                                <p>You have no transcripts yet.</p>
                                <p style={{fontSize: '0.9rem', color: '#666'}}>Click "Add Recording" to create your first transcript!</p>
                            </div>
                        )}
                    </div>
                </div>
                <div className="main-content">
                    <div className="recording-section">
                        {!isRecording && !isLoadingTranscript && (
                            <button onClick={handleStartRecording} className="record-btn start" style={{
                                padding: isMobile ? '10px 20px' : '12px 24px',
                                fontSize: isMobile ? '14px' : '16px',
                                backgroundColor: '#4CAF50',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer'
                            }}>
                                Add Recording
                            </button>
                        )}
                        {isRecording && (
                            <div style={{ textAlign: 'center' }}>
                                <button onClick={handleStopRecording} className="record-btn stop" style={{
                                    padding: isMobile ? '10px 20px' : '12px 24px',
                                    fontSize: isMobile ? '14px' : '16px',
                                    backgroundColor: '#f44336',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    animation: 'pulse 1s infinite'
                                }}>
                                       Stop Recording
                                </button>
                            </div>
                        )}
                        {isLoadingTranscript && (
                            <div className="loading-text" style={{
                                padding: '20px',
                                textAlign: 'center',
                                color: '#666',
                                fontSize: isMobile ? '14px' : '16px'
                            }}>
                                Generating transcript...
                            </div>
                        )}
                        {recordingStatus && (
                            <div style={{ 
                                marginTop: '1rem', 
                                padding: isMobile ? '10px' : '12px', 
                                backgroundColor: '#e3f2fd', 
                                borderRadius: '6px',
                                color: '#1565c0',
                                fontSize: isMobile ? '12px' : '14px',
                                textAlign: 'center',
                                border: '1px solid #bbdefb'
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
                            <p>{isMobile ? 'Select a transcript above' : 'Select a transcript to see its analysis.'}</p>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

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
        onUpdate(transcript.id, editedName, editedText);
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
                    />
                ) : (
                    <h3 style={{
                        fontSize: isMobile ? '1rem' : '1.25rem'
                    }}>{transcript.name}</h3>
                )}
                <div className="actions">
                    <button onClick={() => setIsEditing(!isEditing)}>
                        <EditIcon className="icon" style={{
                            width: isMobile ? '1rem' : '1.25rem',
                            height: isMobile ? '1rem' : '1.25rem'
                        }}/>
                    </button>
                    <button onClick={() => onDelete(transcript.id)}>
                        <TrashIcon className="icon" style={{
                            width: isMobile ? '1rem' : '1.25rem',
                            height: isMobile ? '1rem' : '1.25rem'
                        }}/>
                    </button>
                </div>
            </div>
            {transcript.audioUrl && (
                <audio controls src={`${API_URL}${transcript.audioUrl}`} className="audio-player" style={{
                    height: isMobile ? '40px' : '54px'
                }}>
                    Your browser does not support the audio element.
                </audio>
            )}
            {isEditing ? (
                <textarea 
                    value={editedText} 
                    onChange={(e) => setEditedText(e.target.value)} 
                    className="text-editor"
                    style={{
                        minHeight: isMobile ? '100px' : '150px',
                        fontSize: isMobile ? '14px' : '16px'
                    }}
                />
            ) : (
                <p className="transcript-text" style={{
                    fontSize: isMobile ? '14px' : '16px'
                }}>{transcript.text}</p>
            )}
            {isEditing && (
                 <div className="save-actions">
                    <button onClick={handleSave} className="save-btn" style={{
                        fontSize: isMobile ? '14px' : '16px',
                        padding: isMobile ? '8px 16px' : '12px 20px'
                    }}>Save Changes</button>
                </div>
            )}
            {!isEditing && (
                <div className="analysis-section">
                    <h4 style={{
                        fontSize: isMobile ? '16px' : '18px'
                    }}>Analysis</h4>
                    <div className="analysis-grid">
                        <div className="analysis-item">
                            <p style={{
                                fontSize: isMobile ? '20px' : '24px'
                            }}>{transcript.word_count || 0}</p>
                            <span>Words</span>
                        </div>
                        <div className="analysis-item">
                            <p style={{
                                fontSize: isMobile ? '20px' : '24px'
                            }}>{transcript.sentence_count || 0}</p>
                            <span>Sentences</span>
                        </div>
                        <div className="analysis-item">
                            <p style={{
                                fontSize: isMobile ? '20px' : '24px'
                            }}>{transcript.speech_rate || 0}</p>
                            <span>Words/Min</span>
                        </div>
                        <div className="analysis-item">
                            <p style={{
                                fontSize: isMobile ? '20px' : '24px'
                            }}>{transcript.avg_words_per_sentence || 0}</p>
                            <span>Avg. Words/Sentence</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}