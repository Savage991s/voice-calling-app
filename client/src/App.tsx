import React, { useState, useEffect, useCallback } from 'react';
import io, { Socket } from 'socket.io-client';
import './App.css';

interface User {
  id: string;
  username: string;
  roomCode: string;
  isAudioEnabled: boolean;
}

interface Message {
  id: string;
  text: string;
  sender: string;
  senderId: string;
  timestamp: Date;
  type: string;
}

interface AppState {
  socket: Socket | null;
  currentUser: User | null;
  roomCode: string;
  users: User[];
  messages: Message[];
  isInCall: boolean;
  isAudioEnabled: boolean;
  localStream: MediaStream | null;
  peerConnections: Map<string, RTCPeerConnection>;
}

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    socket: null,
    currentUser: null,
    roomCode: '',
    users: [],
    messages: [],
    isInCall: false,
    isAudioEnabled: true,
    localStream: null,
    peerConnections: new Map()
  });

  const [username, setUsername] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [messageText, setMessageText] = useState('');
  const [showJoinForm, setShowJoinForm] = useState(true);
  const [selfAudioEnabled, setSelfAudioEnabled] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(new Set<string>());

  // Video refs removed - voice only app

  // WebRTC functions
  const createPeerConnection = useCallback((userId: string): RTCPeerConnection => {
    console.log('Creating peer connection for user:', userId);
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    peerConnection.onicecandidate = (event) => {
      if (event.candidate && state.socket) {
        console.log('Sending ICE candidate to:', userId);
        state.socket.emit('ice-candidate', {
          target: userId,
          candidate: event.candidate
        });
      }
    };

    peerConnection.onconnectionstatechange = () => {
      console.log('Connection state changed for', userId, ':', peerConnection.connectionState);
      if (peerConnection.connectionState === 'connected') {
        console.log('Successfully connected to', userId);
      } else if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
        console.log('Connection failed/disconnected for', userId);
        // Clean up the connection
        cleanupPeerConnection(userId);
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE connection state changed for', userId, ':', peerConnection.iceConnectionState);
    };

    peerConnection.ontrack = (event) => {
      // Audio stream received - voice only app
      console.log('🎵 Audio stream received from', userId);
      console.log('Remote stream:', event.streams[0]);
      console.log('Audio tracks in remote stream:', event.streams[0].getAudioTracks());
      
      // Remove any existing audio element for this user
      const existingAudio = document.getElementById(`audio-${userId}`);
      if (existingAudio) {
        existingAudio.remove();
      }
      
      // Create an audio element to play the remote audio
      const audio = new Audio();
      audio.srcObject = event.streams[0];
      audio.autoplay = true;
      audio.volume = 1.0;
      
      // Add event listeners for debugging and mobile compatibility
      audio.onloadedmetadata = () => {
        console.log('🎵 Audio metadata loaded for', userId);
        // Try to play audio - mobile browsers may require user interaction
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(e => {
            console.error('Audio play failed for', userId, ':', e);
            // On mobile, this might fail due to autoplay policy
            console.log('This is normal on mobile - audio will play when user interacts');
          });
        }
      };
      
      audio.onplay = () => console.log('🎵 Audio started playing for', userId);
      audio.onerror = (e) => console.error('🎵 Audio error for', userId, e);
      
      // Mobile-specific: Try to play when user interacts
      const tryPlayOnInteraction = () => {
        if (audio.paused) {
          audio.play().catch(e => console.log('Still can\'t play audio:', e));
        }
      };
      
      // Add click listeners to try playing audio
      document.addEventListener('click', tryPlayOnInteraction, { once: true });
      document.addEventListener('touchstart', tryPlayOnInteraction, { once: true });
      
      // Store the audio element for cleanup
      audio.id = `audio-${userId}`;
      document.body.appendChild(audio);
      
      console.log('🎵 Audio element created for user:', userId);
    };

    return peerConnection;
  }, [state.socket]);

  const cleanupPeerConnection = useCallback((userId: string) => {
    const peerConnection = state.peerConnections.get(userId);
    if (peerConnection) {
      peerConnection.close();
      setState(prev => {
        const newPeerConnections = new Map(prev.peerConnections);
        newPeerConnections.delete(userId);
        return { ...prev, peerConnections: newPeerConnections };
      });
    }
    
    // Remove audio element
    const audio = document.getElementById(`audio-${userId}`);
    if (audio) {
      audio.remove();
    }
  }, [state.peerConnections]);

  const handleOffer = useCallback(async (offer: RTCSessionDescriptionInit, senderId: string) => {
    console.log('Handling offer from:', senderId);
    
    // Check if we already have a connection for this user
    let peerConnection = state.peerConnections.get(senderId);
    
    // If connection exists but is closed, remove it and create a new one
    if (peerConnection && peerConnection.signalingState === 'closed') {
      console.log('Removing closed connection for', senderId);
      cleanupPeerConnection(senderId);
      peerConnection = undefined;
    }
    
    if (!peerConnection) {
      peerConnection = createPeerConnection(senderId);
      setState(prev => {
        const newPeerConnections = new Map(prev.peerConnections);
        newPeerConnections.set(senderId, peerConnection!);
        return { ...prev, peerConnections: newPeerConnections };
      });
    }

    try {
      // Check if we're in the right state to handle an offer
      if (peerConnection.signalingState === 'have-local-offer' || 
          peerConnection.signalingState === 'have-remote-offer') {
        console.log('Already processing offer/answer for', senderId, 'state:', peerConnection.signalingState);
        return;
      }

      await peerConnection.setRemoteDescription(offer);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      if (state.socket) {
        state.socket.emit('answer', {
          target: senderId,
          answer: answer
        });
      }
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  }, [createPeerConnection, state.socket, state.peerConnections, cleanupPeerConnection]);

  const handleAnswer = useCallback(async (answer: RTCSessionDescriptionInit, senderId: string) => {
    console.log('Handling answer from:', senderId);
    const peerConnection = state.peerConnections.get(senderId);
    if (peerConnection) {
      try {
        // Check if we're in the right state to handle an answer
        if (peerConnection.signalingState !== 'have-local-offer') {
          console.log('Not in correct state to handle answer for', senderId, 'state:', peerConnection.signalingState);
          return;
        }

        await peerConnection.setRemoteDescription(answer);
        console.log('Answer set successfully for:', senderId);
      } catch (error) {
        console.error('Error handling answer:', error);
      }
    } else {
      console.error('No peer connection found for:', senderId);
    }
  }, [state.peerConnections]);

  const handleIceCandidate = useCallback(async (candidate: RTCIceCandidateInit, senderId: string) => {
    const peerConnection = state.peerConnections.get(senderId);
    if (peerConnection && peerConnection.signalingState !== 'closed') {
      try {
        await peerConnection.addIceCandidate(candidate);
        console.log('ICE candidate added successfully for', senderId);
      } catch (error) {
        console.error('Error adding ICE candidate for', senderId, ':', error);
      }
    } else {
      console.log('Cannot add ICE candidate - connection closed or not found for', senderId);
    }
  }, [state.peerConnections]);

  const startCall = useCallback(async () => {
    try {
      console.log('Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false, // Voice only - no video
        audio: state.isAudioEnabled
      });

      console.log('Microphone access granted!', stream);
      console.log('Audio tracks:', stream.getAudioTracks());
      console.log('Audio track enabled:', stream.getAudioTracks()[0]?.enabled);
      
      // Create a local audio element so you can hear yourself
      const testAudio = new Audio();
      testAudio.srcObject = stream;
      testAudio.muted = !selfAudioEnabled; // Control based on selfAudioEnabled state
      testAudio.autoplay = true;
      testAudio.volume = 0.3; // Lower volume so it's not too loud
      testAudio.id = 'test-audio';
      document.body.appendChild(testAudio);
      console.log('Test audio element created - self audio enabled:', selfAudioEnabled);

      setState(prev => ({ ...prev, localStream: stream }));

      // Create peer connections for existing users
      state.users.forEach(user => {
        if (user.id !== state.currentUser?.id) {
          // Only create connection if we don't already have one
          if (!state.peerConnections.has(user.id)) {
            console.log('Creating peer connection for user:', user.username);
            const peerConnection = createPeerConnection(user.id);
            stream.getTracks().forEach(track => {
              console.log('Adding track to peer connection:', track.kind, track.enabled);
              peerConnection.addTrack(track, stream);
            });

            setState(prev => {
              const newPeerConnections = new Map(prev.peerConnections);
              newPeerConnections.set(user.id, peerConnection);
              return { ...prev, peerConnections: newPeerConnections };
            });

            // Create and send offer
            peerConnection.createOffer().then(offer => {
              console.log('Creating offer for user:', user.username);
              peerConnection.setLocalDescription(offer);
              if (state.socket) {
                state.socket.emit('offer', {
                  target: user.id,
                  offer: offer
                });
              }
            }).catch(error => {
              console.error('Error creating offer:', error);
            });
          } else {
            console.log('Peer connection already exists for user:', user.username);
          }
        }
      });
    } catch (error) {
      console.error('Error accessing media devices:', error);
      alert('Microphone access denied. Please allow microphone access and refresh the page.');
    }
  }, [state.isAudioEnabled, state.users, state.currentUser?.id, createPeerConnection, state.socket]);

  // Initialize socket connection
  useEffect(() => {
    // Use the current origin for production, localhost for development
    const socketUrl = window.location.origin;
    console.log('Connecting to socket at:', socketUrl);
    const socket = io(socketUrl);
    
    // Add connection event listeners
    socket.on('connect', () => {
      console.log('✅ Socket connected! ID:', socket.id);
    });
    
    socket.on('disconnect', () => {
      console.log('❌ Socket disconnected');
    });
    
    socket.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error);
    });
    
    setState(prev => ({ ...prev, socket }));

    return () => {
      socket.disconnect();
    };
  }, []);

  // Socket event listeners
  useEffect(() => {
    if (!state.socket) return;

    state.socket.on('room-created', (data) => {
      console.log('🎉 Room created successfully:', data);
      console.log('Room code:', data.roomCode);
      console.log('Users:', data.users);
      
      // Clear the timeout since room creation was successful
      if ((window as any).roomCreationTimeout) {
        clearTimeout((window as any).roomCreationTimeout);
        (window as any).roomCreationTimeout = null;
      }
      
      setState(prev => ({
        ...prev,
        roomCode: data.roomCode,
        users: data.users,
        isInCall: true
      }));
      setShowJoinForm(false);
    });
    
    // Add debugging for all socket events
    state.socket.onAny((eventName, ...args) => {
      console.log('📡 Socket event received:', eventName, args);
    });

    state.socket.on('room-joined', (data) => {
      console.log('Successfully joined room:', data);
      
      // Clear any pending timeout since room operation was successful
      if ((window as any).roomCreationTimeout) {
        clearTimeout((window as any).roomCreationTimeout);
        (window as any).roomCreationTimeout = null;
      }
      
      setState(prev => ({
        ...prev,
        roomCode: data.roomCode,
        users: data.users,
        messages: data.messages,
        isInCall: true
      }));
      setShowJoinForm(false);
    });

    state.socket.on('user-joined', (data) => {
      console.log('User joined:', data.user);
      setState(prev => ({
        ...prev,
        users: data.users
      }));
      
      // If we have a local stream, create a connection for the new user
      if (state.localStream && data.user.id !== state.currentUser?.id && !state.peerConnections.has(data.user.id) && !connectionAttempts.has(data.user.id)) {
        console.log('Creating connection for new user:', data.user.username);
        
        // Mark this user as having a connection attempt in progress
        setConnectionAttempts(prev => new Set(prev).add(data.user.id));
        
        const peerConnection = createPeerConnection(data.user.id);
        state.localStream.getTracks().forEach(track => {
          peerConnection.addTrack(track, state.localStream!);
        });

        setState(prev => {
          const newPeerConnections = new Map(prev.peerConnections);
          newPeerConnections.set(data.user.id, peerConnection);
          return { ...prev, peerConnections: newPeerConnections };
        });

        // Create and send offer
        peerConnection.createOffer().then(offer => {
          peerConnection.setLocalDescription(offer);
          if (state.socket) {
            state.socket.emit('offer', {
              target: data.user.id,
              offer: offer
            });
          }
        }).catch(error => {
          console.error('Error creating offer for new user:', error);
          // Remove from connection attempts on error
          setConnectionAttempts(prev => {
            const newSet = new Set(prev);
            newSet.delete(data.user.id);
            return newSet;
          });
        });
      } else if (state.peerConnections.has(data.user.id)) {
        console.log('Connection already exists for new user:', data.user.username);
      } else if (connectionAttempts.has(data.user.id)) {
        console.log('Connection attempt already in progress for:', data.user.username);
      }
    });

    state.socket.on('user-left', (data) => {
      console.log('User left:', data.userId);
      // Clean up peer connection for the user who left
      cleanupPeerConnection(data.userId);
      
      setState(prev => ({
        ...prev,
        users: data.users
      }));
    });

    state.socket.on('new-message', (message) => {
      setState(prev => ({
        ...prev,
        messages: [...prev.messages, message]
      }));
    });

    state.socket.on('error', (error) => {
      console.log('Socket error:', error);
      
      // Clear any pending timeout since we got an error response
      if ((window as any).roomCreationTimeout) {
        clearTimeout((window as any).roomCreationTimeout);
        (window as any).roomCreationTimeout = null;
      }
      
      alert(error.message);
    });

    // WebRTC signaling
    state.socket.on('offer', async (data) => {
      await handleOffer(data.offer, data.sender);
    });

    state.socket.on('answer', async (data) => {
      await handleAnswer(data.answer, data.sender);
    });

    state.socket.on('ice-candidate', async (data) => {
      await handleIceCandidate(data.candidate, data.sender);
    });

  }, [state.socket, handleOffer, handleAnswer, handleIceCandidate]);

  const createRoom = () => {
    console.log('Creating room for user:', username);
    console.log('Socket connected:', state.socket?.connected);
    console.log('Socket ID:', state.socket?.id);
    
    if (state.socket && username.trim()) {
      console.log('Emitting create-room event...');
      state.socket.emit('create-room', { username: username.trim() });
      setState(prev => ({
        ...prev,
        currentUser: {
          id: state.socket?.id || '',
          username: username.trim(),
          roomCode: '',
          isAudioEnabled: true
        }
      }));
      
      // Add timeout to detect if room creation fails
      // The timeout will be cleared when room-created event is received
      const timeoutId = setTimeout(() => {
        console.error('❌ Room creation timed out - no response from server');
        alert('Room creation failed. Please check your connection and try again.');
      }, 5000);
      
      // Store timeout ID to clear it when room is created
      // We'll clear this in the room-created event handler
      (window as any).roomCreationTimeout = timeoutId;
    } else {
      console.error('Cannot create room - socket:', !!state.socket, 'username:', username);
      if (!state.socket) {
        alert('Not connected to server. Please refresh the page and try again.');
      }
      if (!username.trim()) {
        alert('Please enter a username.');
      }
    }
  };

  const joinRoom = () => {
    console.log('Attempting to join room:', joinCode, 'for user:', username);
    if (state.socket && username.trim() && joinCode.trim()) {
      state.socket.emit('join-room', { 
        roomCode: joinCode.trim().toUpperCase(), 
        username: username.trim() 
      });
      setState(prev => ({
        ...prev,
        currentUser: {
          id: state.socket?.id || '',
          username: username.trim(),
          roomCode: joinCode.trim().toUpperCase(),
          isAudioEnabled: true
        }
      }));
      
      // Add timeout to detect if room joining fails
      const timeoutId = setTimeout(() => {
        console.error('❌ Room join timed out - no response from server');
        alert('Failed to join room. Please check the room code and try again.');
      }, 5000);
      
      // Store timeout ID to clear it when room is joined
      (window as any).roomCreationTimeout = timeoutId;
    } else {
      console.log('Missing requirements - socket:', !!state.socket, 'username:', username, 'joinCode:', joinCode);
    }
  };

  const sendMessage = () => {
    if (state.socket && messageText.trim()) {
      state.socket.emit('send-message', { text: messageText.trim() });
      setMessageText('');
    }
  };

  // Video toggle removed - voice only app

  const toggleAudio = () => {
    console.log('Toggling audio, current state:', state.isAudioEnabled);
    if (state.localStream) {
      const audioTrack = state.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        console.log('Audio track enabled:', audioTrack.enabled);
        setState(prev => ({ ...prev, isAudioEnabled: !prev.isAudioEnabled }));
        if (state.socket) {
          state.socket.emit('toggle-audio');
        }
      } else {
        console.log('No audio track found!');
      }
    } else {
      console.log('No local stream found!');
    }
  };


  const leaveCall = () => {
    // Stop local stream
    if (state.localStream) {
      state.localStream.getTracks().forEach(track => track.stop());
    }
    
    // Clean up all peer connections
    state.peerConnections.forEach((peerConnection, userId) => {
      peerConnection.close();
      // Remove audio element
      const audio = document.getElementById(`audio-${userId}`);
      if (audio) {
        audio.remove();
      }
    });
    
    // Remove test audio element
    const testAudio = document.getElementById('test-audio');
    if (testAudio) {
      testAudio.remove();
    }
    
    setState(prev => ({
      ...prev,
      isInCall: false,
      localStream: null,
      peerConnections: new Map(),
      users: [],
      messages: [],
      roomCode: ''
    }));
    setShowJoinForm(true);
  };

  // Start call when users are available
  useEffect(() => {
    if (state.isInCall && state.users.length > 1 && !state.localStream) {
      startCall();
    }
  }, [state.isInCall, state.users.length, state.localStream, startCall]);

  // Video elements removed - voice only app

  if (showJoinForm) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '0.5rem', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', width: '100%', maxWidth: '28rem' }}>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', textAlign: 'center', marginBottom: '2rem', color: '#1f2937' }}>
            Voice Calling App
          </h1>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
                Your Name
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  console.log('Username changed:', e.target.value);
                  setUsername(e.target.value);
                }}
                style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', outline: 'none' }}
                placeholder="Enter your name"
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={createRoom}
                disabled={!username.trim()}
                style={{ 
                  flex: 1, 
                  backgroundColor: username.trim() ? '#2563eb' : '#9ca3af', 
                  color: 'white', 
                  padding: '0.5rem 1rem', 
                  borderRadius: '0.375rem', 
                  border: 'none',
                  cursor: username.trim() ? 'pointer' : 'not-allowed',
                  fontSize: '1rem',
                  fontWeight: '500'
                }}
              >
                Create Room
              </button>
            </div>

            <div style={{ position: 'relative', margin: '1rem 0' }}>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center' }}>
                <div style={{ width: '100%', borderTop: '1px solid #d1d5db' }} />
              </div>
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', fontSize: '0.875rem' }}>
                <span style={{ padding: '0 0.5rem', backgroundColor: 'white', color: '#6b7280' }}>Or</span>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
                Room Code
              </label>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => {
                  console.log('Room code changed:', e.target.value);
                  setJoinCode(e.target.value.toUpperCase());
                }}
                style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', outline: 'none' }}
                placeholder="Enter room code"
                maxLength={6}
              />
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                Debug: Username="{username}" JoinCode="{joinCode}" Button enabled: {(!username.trim() || !joinCode.trim()) ? 'NO' : 'YES'}
              </div>
            </div>

            <button
              onClick={() => {
                console.log('Join button clicked - username:', username, 'joinCode:', joinCode);
                console.log('Username trimmed:', username.trim(), 'JoinCode trimmed:', joinCode.trim());
                joinRoom();
              }}
              disabled={!username.trim() || !joinCode.trim()}
              style={{ 
                width: '100%', 
                backgroundColor: (username.trim() && joinCode.trim()) ? '#4b5563' : '#9ca3af', 
                color: 'white', 
                padding: '0.5rem 1rem', 
                borderRadius: '0.375rem', 
                border: 'none',
                cursor: (username.trim() && joinCode.trim()) ? 'pointer' : 'not-allowed',
                fontSize: '1rem',
                fontWeight: '500'
              }}
            >
              Join Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#111827', color: 'white' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#1f2937', padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>Room: {state.roomCode}</h1>
          <p style={{ color: '#9ca3af' }}>{state.users.length} participant{state.users.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={leaveCall}
          style={{ backgroundColor: '#dc2626', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer' }}
        >
          Leave Call
        </button>
      </div>

      <div style={{ display: 'flex', height: 'calc(100vh - 80px)' }}>
        {/* Voice Call Section */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, backgroundColor: '#1f2937', padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {/* Voice Call Interface */}
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎙️</div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Voice Call Active</h2>
              <p style={{ color: '#9ca3af' }}>Speaking with {state.users.length - 1} other participant{state.users.length - 1 !== 1 ? 's' : ''}</p>
              
              {/* Debug Info */}
              <div style={{ marginTop: '1rem', padding: '0.5rem', backgroundColor: '#374151', borderRadius: '0.5rem', fontSize: '0.875rem' }}>
                <div>Socket: {state.socket ? '✅ Connected' : '❌ Disconnected'}</div>
                <div>Local Stream: {state.localStream ? '✅ Active' : '❌ None'}</div>
                <div>Peer Connections: {state.peerConnections.size}</div>
              </div>
              
              {/* Mobile Audio Helper */}
              <div style={{ marginTop: '1rem' }}>
                <button
                  onClick={() => {
                    // Try to play all audio elements
                    const audioElements = document.querySelectorAll('audio');
                    audioElements.forEach(audio => {
                      if (audio.paused) {
                        audio.play().catch(e => console.log('Could not play audio:', e));
                      }
                    });
                    console.log('Attempted to play all audio elements');
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#059669',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    fontSize: '0.875rem',
                    cursor: 'pointer'
                  }}
                >
                  🔊 Play Audio (Mobile)
                </button>
              </div>
            </div>

            {/* Participants List */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'center' }}>
              {state.users.map(user => (
                <div key={user.id} style={{ 
                  backgroundColor: user.isAudioEnabled ? '#374151' : '#6b7280', 
                  padding: '1rem', 
                  borderRadius: '0.5rem', 
                  textAlign: 'center',
                  minWidth: '120px',
                  border: user.isAudioEnabled ? 'none' : '2px solid #dc2626',
                  opacity: user.isAudioEnabled ? 1 : 0.7
                }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
                    {user.isAudioEnabled ? '🎤' : '🔇'}
                  </div>
                  <div style={{ fontWeight: '500' }}>{user.username}</div>
                  {user.id === state.currentUser?.id && (
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>(You)</div>
                  )}
                  {!user.isAudioEnabled && (
                    <div style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: '500', marginTop: '0.25rem' }}>
                      MUTED
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Controls */}
          <div style={{ backgroundColor: '#1f2937', padding: '1.5rem', display: 'flex', justifyContent: 'center', gap: '1rem' }}>
            <button
              onClick={toggleAudio}
              style={{ 
                padding: '1rem 1.5rem', 
                borderRadius: '0.5rem', 
                border: 'none',
                cursor: 'pointer',
                backgroundColor: state.isAudioEnabled ? '#4b5563' : '#dc2626',
                fontSize: '1rem',
                fontWeight: '600',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                minWidth: '120px',
                justifyContent: 'center',
                transition: 'all 0.2s ease'
              }}
            >
              <span style={{ fontSize: '1.25rem' }}>
                {state.isAudioEnabled ? '🎤' : '🔇'}
              </span>
              <span>
                {state.isAudioEnabled ? 'Mute' : 'Unmute'}
              </span>
            </button>
          </div>
        </div>

        {/* Chat Section */}
        <div style={{ width: '320px', backgroundColor: '#1f2937', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid #374151' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: '600' }}>Chat</h2>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {state.messages.map(message => (
              <div
                key={message.id}
                style={{ 
                  padding: '0.5rem', 
                  borderRadius: '0.5rem',
                  backgroundColor: message.senderId === state.currentUser?.id ? '#2563eb' : '#374151',
                  marginLeft: message.senderId === state.currentUser?.id ? '2rem' : '0',
                  marginRight: message.senderId === state.currentUser?.id ? '0' : '2rem'
                }}
              >
                <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>{message.sender}</div>
                <div style={{ fontSize: '0.875rem' }}>{message.text}</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '0.25rem' }}>
                  {new Date(message.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
          
          <div style={{ padding: '1rem', borderTop: '1px solid #374151' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Type a message..."
                style={{ 
                  flex: 1, 
                  padding: '0.5rem 0.75rem', 
                  backgroundColor: '#374151', 
                  border: '1px solid #4b5563', 
                  borderRadius: '0.375rem', 
                  outline: 'none',
                  color: 'white'
                }}
              />
              <button
                onClick={sendMessage}
                style={{ 
                  backgroundColor: '#2563eb', 
                  color: 'white', 
                  padding: '0.5rem 1rem', 
                  borderRadius: '0.375rem', 
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
