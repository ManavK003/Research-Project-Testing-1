import React, { useState, useEffect, useRef, useCallback } from 'react';
import './HomePage.css';

// --- All your image imports ---
import bg1 from './assets/bg1.jpg';
import bg2 from './assets/bg2.jpg';
import bg3 from './assets/bg3.jpg';
import bg5 from './assets/bg5.jpg';
import bg7 from './assets/bg7.jpg';
import bg10 from './assets/bg10.jpg';
import bg99 from './assets/bg99.png';

const API_URL = 'http://127.0.0.1:5001';

// --- Icons ---
const TrashIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>);
const EditIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>);

// --- Main App Component ---
export default function App() {
    const [page, setPage] = useState('home');
    const [userToken, setUserToken] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      const token = localStorage.getItem('token');
      console.log('🔍 DEBUG: Token from localStorage:', token ? `${token.substring(0, 20)}...` : 'null');
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
        console.log('🔍 DEBUG: Login success, received token:', token ? `${token.substring(0, 20)}...` : 'null');
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

// --- HomePage (No Changes) ---
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

// --- AuthModal with Debug Logging ---
function AuthModal({ onLoginSuccess, closeModal }) {
    const [isLoginView, setIsLoginView] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);
        
        const endpoint = isLoginView ? '/api/login' : '/api/signup';
        const payload = isLoginView ? { email, password } : { username, email, password };
        
        console.log('🔍 DEBUG: Making request to:', `${API_URL}${endpoint}`);
        console.log('🔍 DEBUG: Payload:', { ...payload, password: '[HIDDEN]' });
        
        try {
            const response = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            console.log('🔍 DEBUG: Response status:', response.status);
            console.log('🔍 DEBUG: Response headers:', Object.fromEntries(response.headers.entries()));

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Network error' }));
                console.log('🔍 DEBUG: Error data:', errorData);
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }

            const data = await response.json();
            console.log('🔍 DEBUG: Success data:', { ...data, access_token: data.access_token ? `${data.access_token.substring(0, 20)}...` : 'null' });

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
            console.error('🔍 DEBUG: Request failed:', err);
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
                    <span onClick={() => { if (!isSubmitting) setIsLoginView(!isLoginView); }}>
                        {isLoginView ? 'Sign Up' : 'Log In'}
                    </span>
                </div>
            </div>
        </div>
    );
}

// --- Dashboard Component with EXTENSIVE Debug Logging ---
function Dashboard({ userToken, navigateTo }) {
  const [transcripts, setTranscripts] = useState([]);
  const [selectedTranscript, setSelectedTranscript] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);
  const [error, setError] = useState('');
  const [isLoadingTranscripts, setIsLoadingTranscripts] = useState(true);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

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
          localStorage.removeItem('token');
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
  
  const handleStartRecording = async () => {
      try {
          setError('');
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const options = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? { mimeType: 'audio/webm;codecs=opus' } : {};
          mediaRecorderRef.current = new MediaRecorder(stream, options);
          mediaRecorderRef.current.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
          mediaRecorderRef.current.onstop = handleRecordingStop;
          audioChunksRef.current = [];
          mediaRecorderRef.current.start();
          setIsRecording(true);
      } catch (err) {
          setError("Could not start recording. Please ensure microphone permissions are enabled.");
      }
  };

  const handleStopRecording = () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
          mediaRecorderRef.current.stop();
          mediaRecorderRef.current.stream?.getTracks().forEach(track => track.stop());
      }
      setIsRecording(false);
  };
  
  const handleRecordingStop = async () => {
      setIsLoadingTranscript(true);
      setError('');
      try {
          if (audioChunksRef.current.length === 0) throw new Error('No audio data recorded');
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const formData = new FormData();
          formData.append('audio', audioBlob, `recording.webm`);
          const response = await makeAuthenticatedRequest(`${API_URL}/api/transcribe`, { method: 'POST', body: formData });
          if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              throw new Error(errorData.error || 'Transcription failed.');
          }
          const newTranscript = await response.json();
          setTranscripts(prev => [newTranscript, ...prev]);
          setSelectedTranscript(newTranscript);
      } catch (error) {
          setError(error.message);
      } finally {
          setIsLoadingTranscript(false);
      }
  };

  const handleDeleteTranscript = async (id) => {
      if (window.confirm("Are you sure?")) {
          try {
              await makeAuthenticatedRequest(`${API_URL}/api/transcripts/${id}`, { method: 'DELETE' });
              setTranscripts(prev => prev.filter(t => t.id !== id));
              if (selectedTranscript?.id === id) setSelectedTranscript(null);
          } catch (error) {
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
      } catch (error) {
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
                  {error && <div style={{color: 'red', marginBottom: '1rem', fontSize: '0.9rem'}}>{error}</div>}
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
                          </div>
                      )}
                  </div>
              </div>
              <div className="main-content">
                  <div className="recording-section">
                      {!isRecording && !isLoadingTranscript && <button onClick={handleStartRecording} className="record-btn start">Add Recording</button>}
                      {isRecording && <button onClick={handleStopRecording} className="record-btn stop">Stop Recording</button>}
                      {isLoadingTranscript && <div className="loading-text">Generating transcript...</div>}
                  </div>
                  {selectedTranscript ? (
                      <TranscriptDetail transcript={selectedTranscript} onDelete={handleDeleteTranscript} onUpdate={handleUpdateTranscript} />
                  ) : (
                      <div className="placeholder-view"><p>Select a transcript to see its analysis.</p></div>
                  )}
              </div>
          </main>
      </div>
  );
}

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
          {transcript.audioUrl && (
              <audio controls src={`${API_URL}${transcript.audioUrl}`} className="audio-player">
                  Your browser does not support the audio element.
              </audio>
          )}
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
                      <div className="analysis-item"><p>{transcript.word_count || 0}</p><span>Words</span></div>
                      <div className="analysis-item"><p>{transcript.sentence_count || 0}</p><span>Sentences</span></div>
                      <div className="analysis-item"><p>{transcript.speech_rate || 0}</p><span>Words/Min</span></div>
                      <div className="analysis-item"><p>{transcript.avg_words_per_sentence || 0}</p><span>Avg. Words/Sentence</span></div>
                  </div>
              </div>
          )}
      </div>
  );
}
