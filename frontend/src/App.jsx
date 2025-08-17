import React, { useState, useEffect, useRef } from 'react';
import './HomePage.css'; 




import bg1 from './assets/bg1.jpg';
import bg2 from './assets/bg2.jpg';
import bg3 from './assets/bg3.jpg';
import bg5 from './assets/bg5.jpg';
import bg7 from './assets/bg7.jpg';
import bg99 from './assets/bg99.png';
import bg10 from './assets/bg10.jpg';



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
        return <div className="w-full h-screen flex items-center justify-center bg-gray-900 text-white">Loading...</div>;
    }

    switch (page) {
        case 'dashboard':
            return <Dashboard userToken={userToken} navigateTo={navigateTo} />;
        case 'home':
        default:
            return <HomePage navigateTo={navigateTo} onLoginSuccess={handleLoginSuccess} />;
    }
}


function HomePage({ onLoginSuccess }) {
  const [bgIndex, setBgIndex] = useState(0);
  const [isFormVisible, setIsFormVisible] = useState(false);

  // This array should contain all your imported images
  const backgroundImages = [
    bg1, bg2, bg3, bg5, bg7, bg99, bg10
  ];

  useEffect(() => {
      const intervalId = setInterval(() => {
          setBgIndex((prevIndex) => (prevIndex + 1) % backgroundImages.length);
      }, 7000); // Change image every 7 seconds
      return () => clearInterval(intervalId);
  }, [backgroundImages.length]);

  return (
    <div 
        className="home-container" 
        style={{ backgroundImage: `url(${backgroundImages[bgIndex]})` }}
    >
        <div className="home-overlay"></div>

        {/* This is the new, simpler structure */}
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
  
  // This function stops the modal from closing when its content is clicked.
  const handleModalContentClick = (e) => e.stopPropagation();

  const handleSubmit = async (e) => {
      e.preventDefault();
      setError('');
      const endpoint = isLoginView ? '/api/login' : '/api/signup';
      const payload = isLoginView ? { email, password } : { username, email, password };
      
      try {
          // This is where the call to your real backend will go.
          console.log(`Calling backend at ${endpoint} with`, payload);

          // For now, we simulate a successful login.
          if (isLoginView) {
              onLoginSuccess("fake_jwt_token_for_testing");
          } else {
              // For sign up, we just show a message.
              alert("Sign up successful! Please log in.");
              setIsLoginView(true);
          }
      } catch (err) {
          setError(err.message);
      }
  };

  return (
      // This now uses the custom CSS classes from HomePage.css
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
                  
                  <button type="submit" className="submit-btn">
                      {isLoginView ? 'Log In' : 'Sign Up'}
                  </button>
              </form>

              <div className="toggle-view">
                  {isLoginView ? "Don't have an account? " : "Already have an account? "}
                  <span onClick={() => setIsLoginView(!isLoginView)}>
                      {isLoginView ? 'Sign Up' : 'Log In'}
                  </span>
              </div>
          </div>
      </div>
  );
}


/**
 * The Main Dashboard Component
 */
function Dashboard({ userToken, navigateTo }) {
    const [transcripts, setTranscripts] = useState([]);
    const [selectedTranscript, setSelectedTranscript] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);

    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);

    // --- Data Fetching from Backend ---
    useEffect(() => {
        if (!userToken) return;
        // In a real app, you would fetch data from your backend here
       
        const mockData = [
            {id: 1, name: "Meeting Notes 1", text: "This is a sample transcript from a meeting.", audioUrl: "", createdAt: {seconds: Date.now()/1000}},
            {id: 2, name: "Personal Memo", text: "A quick brown fox jumps over the lazy dog.", audioUrl: "", createdAt: {seconds: Date.now()/1000 - 3600}},
        ];
        mockData.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds);
        setTranscripts(mockData);
    }, [userToken]);
    
    // --- Voice Recording Logic ---
    const handleStartRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            mediaRecorderRef.current.ondataavailable = (event) => audioChunksRef.current.push(event.data);
            mediaRecorderRef.current.onstop = handleRecordingStop;
            audioChunksRef.current = [];
            mediaRecorderRef.current.start();
            setIsRecording(true);
        } catch (error) {
            console.error("Error starting recording:", error);
            alert("Could not start recording. Please ensure you have given microphone permissions.");
        }
    };

    const handleStopRecording = () => {
        if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };
    
    const handleRecordingStop = async () => {
        setIsLoadingTranscript(true);
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
       
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');

        console.log("Sending audio to backend for transcription...");
        
       
        setTimeout(() => {
            const simulatedResponse = {
                id: Date.now(),
                name: `Recording ${new Date().toLocaleString()}`,
                text: "This is a simulated transcript from the backend wav2vec2 model.",
                audioUrl: URL.createObjectURL(audioBlob),
                createdAt: { seconds: Date.now() / 1000 }
            };
            
            setTranscripts(prev => [simulatedResponse, ...prev]);
            setIsLoadingTranscript(false);
        }, 3000);
    };

    const handleDeleteTranscript = (id) => {
        if (window.confirm("Are you sure you want to delete this transcript?")) {
           
            setTranscripts(prev => prev.filter(t => t.id !== id));
            if (selectedTranscript?.id === id) {
                setSelectedTranscript(null);
            }
        }
    };

    const handleUpdateTranscript = (id, newName, newText) => {
       
        setTranscripts(prev => prev.map(t => t.id === id ? {...t, name: newName, text: newText} : t));
        setSelectedTranscript(prev => ({...prev, name: newName, text: newText}));
    };

    return (
        <div className="w-full min-h-screen bg-gray-100 font-sans grid grid-rows-[auto_1fr]">
            <header className="bg-white shadow-sm p-4 flex justify-between items-center">
                <h1 className="text-xl font-bold text-gray-800">Transcribed AI Dashboard</h1>
                <button 
                    onClick={() => navigateTo('logout')}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg"
                >
                    Log Out
                </button>
            </header>

            <main className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
                <div className="lg:col-span-1 bg-white p-6 rounded-lg shadow">
                    <h2 className="text-lg font-semibold mb-4">My Transcripts</h2>
                    <div className="space-y-2 max-h-[75vh] overflow-y-auto">
                        {transcripts.length > 0 ? (
                            transcripts.map(t => (
                                <div key={t.id} onClick={() => setSelectedTranscript(t)} className={`p-3 rounded-lg cursor-pointer border-2 ${selectedTranscript?.id === t.id ? 'bg-blue-100 border-blue-500' : 'bg-gray-50 hover:bg-gray-200 border-transparent'}`}>
                                    <p className="font-medium text-gray-800 truncate">{t.name}</p>
                                    <p className="text-sm text-gray-500 truncate">{t.text}</p>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-10">
                                <p className="text-gray-500">You have no transcripts yet.</p>
                                <p className="text-gray-400 text-sm">Click "Add Recording" to get started!</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white p-6 rounded-lg shadow text-center">
                        {!isRecording && !isLoadingTranscript && (
                            <button onClick={handleStartRecording} className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-8 rounded-full transition-transform transform hover:scale-105">
                                Add Recording
                            </button>
                        )}
                        {isRecording && (
                            <button onClick={handleStopRecording} className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-8 rounded-full animate-pulse">
                                Stop Recording
                            </button>
                        )}
                        {isLoadingTranscript && (
                            <div className="text-gray-600">Generating transcript...</div>
                        )}
                    </div>

                    {selectedTranscript ? (
                        <TranscriptDetail transcript={selectedTranscript} onDelete={handleDeleteTranscript} onUpdate={handleUpdateTranscript} />
                    ) : (
                        <div className="bg-white p-6 rounded-lg shadow text-center text-gray-500 h-full flex items-center justify-center">
                           <p>Select a transcript to see its analysis.</p>
                        </div>
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

    const wordCount = transcript.text.split(/\s+/).filter(Boolean).length;
    const sentenceCount = transcript.text.split(/[.!?]+/).filter(Boolean).length;
    const avgWordsPerSentence = sentenceCount > 0 ? (wordCount / sentenceCount).toFixed(2) : 0;
    
    return (
        <div className="bg-white p-6 rounded-lg shadow space-y-4">
            <div className="flex justify-between items-start">
                {isEditing ? (
                    <input type="text" value={editedName} onChange={(e) => setEditedName(e.target.value)} className="text-xl font-bold text-gray-800 border-b-2 border-blue-500 focus:outline-none w-full" />
                ) : (
                    <h3 className="text-xl font-bold text-gray-800">{transcript.name}</h3>
                )}
                <div className="flex space-x-2">
                    <button onClick={() => setIsEditing(!isEditing)} className="p-2 text-gray-500 hover:text-blue-600"><EditIcon className="w-5 h-5"/></button>
                    <button onClick={() => onDelete(transcript.id)} className="p-2 text-gray-500 hover:text-red-600"><TrashIcon className="w-5 h-5"/></button>
                </div>
            </div>
            
            {transcript.audioUrl && <audio controls src={transcript.audioUrl} className="w-full"></audio>}

            {isEditing ? (
                <textarea value={editedText} onChange={(e) => setEditedText(e.target.value)} className="w-full h-48 p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            ) : (
                <p className="text-gray-700 whitespace-pre-wrap">{transcript.text}</p>
            )}

            {isEditing && (
                 <div className="flex justify-end">
                    <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg">Save Changes</button>
                </div>
            )}
            
            {!isEditing && (
                <div>
                    <h4 className="text-lg font-semibold mt-6 mb-2">Analysis</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-center">
                        <div className="bg-gray-100 p-4 rounded-lg"><p className="text-2xl font-bold">{wordCount}</p><p className="text-sm text-gray-600">Words</p></div>
                        <div className="bg-gray-100 p-4 rounded-lg"><p className="text-2xl font-bold">{sentenceCount}</p><p className="text-sm text-gray-600">Sentences</p></div>
                        <div className="bg-gray-100 p-4 rounded-lg"><p className="text-2xl font-bold">{avgWordsPerSentence}</p><p className="text-sm text-gray-600">Avg. Words/Sentence</p></div>
                    </div>
                </div>
            )}
        </div>
    );
}