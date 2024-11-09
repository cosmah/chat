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
    addDoc 
} from 'firebase/firestore';

// Your web app's Firebase configuration
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

// server config
const servers = {
    iceServers: [
        {
            urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
        },
    ],
    iceCandidatePoolSize: 10,
};

// global states
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// importing dom elements
const webcamButton = document.querySelector('#webcamButton');
const webcamVideo = document.querySelector('#webcamVideo');
const callButton = document.querySelector('#callButton');
const callInput = document.querySelector('#callInput');
const answerButton = document.querySelector('#answerButton');
const remoteVideo = document.querySelector('#remoteVideo');
const hangupButton = document.querySelector('#hangupButton');

webcamButton.onclick = async () => {
    localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    });

    remoteStream = new MediaStream();

    localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
    });

    pc.ontrack = event => {
        event.streams[0].getTracks().forEach(track => {
            remoteStream.addTrack(track);
        });
    };

    webcamVideo.srcObject = localStream;
    remoteVideo.srcObject = remoteStream;

    callButton.disabled = false;
    answerButton.disabled = false;
    webcamButton.disabled = true;
};

callButton.onclick = async () => {
    // Create a new call document
    const callsCol = collection(db, 'calls');
    const callDoc = doc(callsCol);
    const offerCandidates = collection(callDoc, 'offerCandidates');
    const answerCandidates = collection(callDoc, 'answerCandidates');

    callInput.value = callDoc.id;

    // Get candidates for caller, save to db
    pc.onicecandidate = async (event) => {
        if (event.candidate) {
            await addDoc(offerCandidates, event.candidate.toJSON());
        }
    };

    // Create offer
    const offerDescription = await pc.createOffer();
    await pc.setLocalDescription(offerDescription);

    const offer = {
        sdp: offerDescription.sdp,
        type: offerDescription.type,
    };

    await setDoc(callDoc, { offer });

    // Listen for remote answer
    onSnapshot(callDoc, (snapshot) => {
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
};

answerButton.onclick = async () => {
    const callId = callInput.value;
    const callsCol = collection(db, 'calls');
    const callDoc = doc(callsCol, callId);
    const answerCandidates = collection(callDoc, 'answerCandidates');
    const offerCandidates = collection(callDoc, 'offerCandidates');

    pc.onicecandidate = async (event) => {
        if (event.candidate) {
            await addDoc(answerCandidates, event.candidate.toJSON());
        }
    };

    const callData = (await getDoc(callDoc)).data();
    const offerDescription = callData.offer;
    await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

    const answerDescription = await pc.createAnswer();
    await pc.setLocalDescription(answerDescription);

    const answer = {
        type: answerDescription.type,
        sdp: answerDescription.sdp,
    };

    await updateDoc(callDoc, { answer });

    // Listen for remote ICE candidates
    onSnapshot(offerCandidates, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                const candidate = new RTCIceCandidate(change.doc.data());
                pc.addIceCandidate(candidate);
            }
        });
    });
};