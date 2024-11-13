import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { 
    getFirestore, 
    collection, 
    doc, 
    setDoc, 
    updateDoc, 
    onSnapshot, 
    getDoc, 
    addDoc,
    deleteDoc
} from 'firebase/firestore';

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBItbzzpMNT8rf7-EmBBGiWSNIJdyIzwv8",
    authDomain: "chat-a309d.firebaseapp.com",
    projectId: "chat-a309d",
    storageBucket: "chat-a309d.firebasestorage.app",
    messagingSenderId: "44315826138",
    appId: "1:44315826138:web:659ca16580cf3d226052e3",
    measurementId: "G-R4E5S10XSS"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

// WebRTC configuration
const servers = {
    iceServers: [
        {
            urls: [
                'stun:stun1.l.google.com:19302',
                'stun:stun2.l.google.com:19302',
                'stun:stun.l.google.com:19302',
                'stun:stun3.l.google.com:19302',
                'stun:stun4.l.google.com:19302'
            ],
        },
    ],
    iceCandidatePoolSize: 10,
};

// Global state
let pc = null;
let localStream = null;
let remoteStream = null;
let currentCallDoc = null;
let localStreamTracks = [];

// DOM elements
const webcamButton = document.querySelector('#webcamButton');
const webcamVideo = document.querySelector('#webcamVideo');
const callButton = document.querySelector('#callButton');
const callInput = document.querySelector('#callInput');
const answerButton = document.querySelector('#answerButton');
const remoteVideo = document.querySelector('#remoteVideo');
const hangupButton = document.querySelector('#hangupButton');

// Helper function to create peer connection
function createPeerConnection() {
    if (pc) {
        pc.close();
    }
    pc = new RTCPeerConnection(servers);
    
    // Add local tracks to peer connection
    if (localStream) {
        localStreamTracks = localStream.getTracks();
        localStreamTracks.forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    // Set up remote stream
    remoteStream = new MediaStream();
    remoteVideo.srcObject = remoteStream;

    // Add remote tracks to remote stream
    pc.ontrack = event => {
        event.streams[0].getTracks().forEach(track => {
            remoteStream.addTrack(track);
        });
    };

    // Error handling
    pc.onerror = (error) => {
        console.error('PeerConnection error:', error);
    };

    pc.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'disconnected' || 
            pc.iceConnectionState === 'failed' || 
            pc.iceConnectionState === 'closed') {
            handleDisconnection();
        }
    };

    return pc;
}

// Initialize webcam and microphone
webcamButton.onclick = async () => {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        webcamVideo.srcObject = localStream;
        
        createPeerConnection();

        callButton.disabled = false;
        answerButton.disabled = false;
        webcamButton.disabled = true;

        console.log('Webcam and microphone initialized');
    } catch (err) {
        console.error('Error accessing media devices:', err);
        alert('Failed to access camera and microphone. Please ensure you have granted the necessary permissions.');
    }
};

// Create a new call
callButton.onclick = async () => {
    try {
        // Create call document
        const callsCol = collection(db, 'calls');
        currentCallDoc = doc(callsCol);
        const offerCandidates = collection(currentCallDoc, 'offerCandidates');
        const answerCandidates = collection(currentCallDoc, 'answerCandidates');

        callInput.value = currentCallDoc.id;

        // Handle ICE candidates
        pc.onicecandidate = async (event) => {
            if (event.candidate) {
                await addDoc(offerCandidates, event.candidate.toJSON());
            }
        };

        // Create and set local description
        const offerDescription = await pc.createOffer();
        await pc.setLocalDescription(offerDescription);

        const offer = {
            sdp: offerDescription.sdp,
            type: offerDescription.type,
        };

        await setDoc(currentCallDoc, { offer });

        // Listen for remote answer
        onSnapshot(currentCallDoc, (snapshot) => {
            const data = snapshot.data();
            if (!pc.currentRemoteDescription && data?.answer) {
                const answerDescription = new RTCSessionDescription(data.answer);
                pc.setRemoteDescription(answerDescription);
            }
        });

        // Listen for remote ICE candidates
        onSnapshot(answerCandidates, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    pc.addIceCandidate(candidate);
                }
            });
        });

        hangupButton.disabled = false;
        callButton.disabled = true;

        console.log('Call created with ID:', currentCallDoc.id);
    } catch (err) {
        console.error('Error creating call:', err);
        alert('Failed to create call. Please try again.');
    }
};

// Answer a call
answerButton.onclick = async () => {
    try {
        const callId = callInput.value;
        if (!callId) {
            alert('Please enter a valid call ID');
            return;
        }

        // Get call document
        const callsCol = collection(db, 'calls');
        currentCallDoc = doc(callsCol, callId);
        const callData = (await getDoc(currentCallDoc)).data();

        if (!callData) {
            alert('Call not found. Please check the call ID.');
            return;
        }

        createPeerConnection();

        const answerCandidates = collection(currentCallDoc, 'answerCandidates');
        const offerCandidates = collection(currentCallDoc, 'offerCandidates');

        pc.onicecandidate = async (event) => {
            if (event.candidate) {
                await addDoc(answerCandidates, event.candidate.toJSON());
            }
        };

        // Set remote description
        const offerDescription = callData.offer;
        await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

        // Create and set local description
        const answerDescription = await pc.createAnswer();
        await pc.setLocalDescription(answerDescription);

        const answer = {
            type: answerDescription.type,
            sdp: answerDescription.sdp,
        };

        await updateDoc(currentCallDoc, { answer });

        // Listen for remote ICE candidates
        onSnapshot(offerCandidates, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    pc.addIceCandidate(candidate);
                }
            });
        });

        hangupButton.disabled = false;
        answerButton.disabled = true;

        console.log('Call answered with ID:', callId);

        // Prompt user to activate camera
        const activateCamera = confirm('Do you want to activate your camera?');
        if (activateCamera) {
            localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            webcamVideo.srcObject = localStream;
            localStreamTracks = localStream.getTracks();
            localStreamTracks.forEach(track => {
                pc.addTrack(track, localStream);
            });

            console.log('Camera activated');
        }
    } catch (err) {
        console.error('Error answering call:', err);
        alert('Failed to answer call. Please check the call ID and try again.');
    }
};

// Handle hangup
async function handleDisconnection() {
    if (pc) {
        pc.close();
        pc = null;
    }
    
    if (localStreamTracks.length > 0) {
        localStreamTracks.forEach(track => track.stop());
        localStreamTracks = [];
    }

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
        remoteStream = null;
    }

    webcamVideo.srcObject = null;
    remoteVideo.srcObject = null;

    // Clean up Firebase documents
    if (currentCallDoc) {
        try {
            await deleteDoc(currentCallDoc);
        } catch (err) {
            console.error('Error deleting call document:', err);
        }
    }

    // Reset UI
    webcamButton.disabled = false;
    callButton.disabled = true;
    answerButton.disabled = true;
    hangupButton.disabled = true;
    callInput.value = '';

    console.log('Disconnected and UI reset');
}

hangupButton.onclick = handleDisconnection;

// Clean up on page unload
window.onbeforeunload = handleDisconnection;