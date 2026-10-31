import { useEffect, useRef, useState } from 'react'
import ShuriBlob from "./components/ShuriBlob";
import { FaceLandmarker, GestureRecognizer, FilesetResolver } from '@mediapipe/tasks-vision'
import './App.css'
import shuriIcon from './assets/shuri_icon_only.png'
import shuriLogo from './assets/shuri_logo.png'
import shuriAvatar from './assets/avatar.png'

const API_URL = 'http://127.0.0.1:8000'
const FACE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const GESTURE_MODEL_URL = '/models/gesture_recognizer.task'
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'

function App() {
  const [started, setStarted] = useState(false)
  const [mediaReady, setMediaReady] = useState(false)
  const [userSpeaking, setUserSpeaking] = useState(false)
  const [aiSpeaking, setAiSpeaking] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [expressionCue, setExpressionCue] = useState('NEUTRAL')
  const [gestureCue, setGestureCue] = useState('NO GESTURE')
  const [faceVisible, setFaceVisible] = useState(true)
  const [faceReady, setFaceReady] = useState(false)
  const [error, setError] = useState('')

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioRef = useRef(null)
  const audioChunksRef = useRef([])
  const audioContextRef = useRef(null)
  const audioAnimationRef = useRef(null)
  const visionAnimationRef = useRef(null)
  const faceLandmarkerRef = useRef(null)
  const gestureRecognizerRef = useRef(null)
  const processingRef = useRef(false)
  const aiSpeakingRef = useRef(false)

  const expressionCandidateRef = useRef('NEUTRAL')
  const expressionCandidateSinceRef = useRef(0)
  const lastExpressionRef = useRef('NEUTRAL')
  const gestureCandidateRef = useRef('NO GESTURE')
  const gestureCandidateSinceRef = useRef(0)
  const lastGestureRef = useRef('NO GESTURE')
  const expressionCueRef = useRef('NEUTRAL')
  const gestureCueRef = useRef('NO GESTURE')

  useEffect(() => {
    expressionCueRef.current = expressionCue
  }, [expressionCue])

  useEffect(() => {
    gestureCueRef.current = gestureCue
  }, [gestureCue])

  const startMedia = async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      })
      streamRef.current = stream
      setMediaReady(true)
    } catch (err) {
      console.error(err)
      setError('Camera or microphone access was denied.')
      setStarted(false)
    }
  }

  useEffect(() => {
    if (!mediaReady || !videoRef.current || !streamRef.current) return

    videoRef.current.srcObject = streamRef.current
    videoRef.current.play().catch(console.error)

    const audioTrack = streamRef.current.getAudioTracks()[0]
    if (!audioTrack) return

    const context = new AudioContext()
    const source = context.createMediaStreamSource(streamRef.current)
    const analyser = context.createAnalyser()

    analyser.fftSize = 256
    source.connect(analyser)
    audioContextRef.current = context
    context.resume().catch(() => {})

    const data = new Uint8Array(analyser.frequencyBinCount)

    const detectSpeech = () => {
      analyser.getByteFrequencyData(data)
      const average = data.reduce((sum, value) => sum + value, 0) / data.length

      setUserSpeaking(
        !aiSpeakingRef.current &&
        !processingRef.current &&
        average > 18
      )

      audioAnimationRef.current = requestAnimationFrame(detectSpeech)
    }

    detectSpeech()

    return () => {
      if (audioAnimationRef.current) {
        cancelAnimationFrame(audioAnimationRef.current)
      }
      context.close()
    }
  }, [mediaReady])

  useEffect(() => {
    if (!mediaReady) return

    let cancelled = false

    const setupVision = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_URL)

        try {
          const face = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: FACE_MODEL_URL
            },
            runningMode: 'VIDEO',
            numFaces: 1,
            outputFaceBlendshapes: true,
            minFaceDetectionConfidence: 0.5,
            minFacePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5
          })

          if (cancelled) {
            face.close()
          } else {
            faceLandmarkerRef.current = face
            setFaceReady(true)
          }
        } catch (err) {
          console.error('Face detection setup failed:', err)
          if (!cancelled) {
            setFaceReady(false)
            setFaceVisible(false)
          }
        }

        try {
          const gesture = await GestureRecognizer.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: GESTURE_MODEL_URL
            },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5
          })

          if (cancelled) {
            gesture.close()
          } else {
            gestureRecognizerRef.current = gesture
          }
        } catch (err) {
          console.error('Gesture recognition setup failed:', err)
        }

        const detectVision = () => {
          if (!videoRef.current || videoRef.current.readyState < 2) {
            visionAnimationRef.current = requestAnimationFrame(detectVision)
            return
          }

          const timestamp = performance.now()

          if (faceLandmarkerRef.current) {
            try {
              const result = faceLandmarkerRef.current.detectForVideo(
                videoRef.current,
                timestamp
              )
              updateExpression(result)
            } catch (err) {
              console.error('Face detection error:', err)
            }
          }

          if (gestureRecognizerRef.current) {
            try {
              const result = gestureRecognizerRef.current.recognizeForVideo(
                videoRef.current,
                timestamp
              )
              updateGesture(result)
            } catch (err) {
              console.error('Gesture recognition error:', err)
            }
          }

          visionAnimationRef.current = requestAnimationFrame(detectVision)
        }

        detectVision()
      } catch (err) {
        console.error(err)
        if (!cancelled) {
          setFaceReady(false)
          setFaceVisible(false)
          setError('Vision analysis could not be started.')
        }
      }
    }

    setupVision()

    return () => {
      cancelled = true

      if (visionAnimationRef.current) {
        cancelAnimationFrame(visionAnimationRef.current)
      }

      faceLandmarkerRef.current?.close()
      gestureRecognizerRef.current?.close()

      faceLandmarkerRef.current = null
      gestureRecognizerRef.current = null
    }
  }, [mediaReady])

const updateExpression = (result) => {
  const categories = result?.faceBlendshapes?.[0]?.categories || []

if (categories.length === 0) {
  setFaceVisible(false)
  setExpressionCue('NO FACE DETECTED')
  return
}

setFaceVisible(true)
setExpressionCue('NEUTRAL')

  const scores = Object.fromEntries(
    categories.map(c => [c.categoryName, c.score])
  )

  let cue = 'NEUTRAL'

  if (scores.mouthSmileLeft > 0.55 && scores.mouthSmileRight > 0.55) {
    cue = 'BIG SMILE'
  } else if (scores.mouthSmileLeft > 0.35 && scores.mouthSmileRight > 0.35) {
    cue = 'SMILE'
  } else if (scores.browDownLeft > 0.45 && scores.browDownRight > 0.45) {
    cue = 'FURROWED BROWS'
  } else if (scores.eyeWideLeft > 0.45 && scores.eyeWideRight > 0.45) {
    cue = 'WIDE-EYED'
  } else if (scores.jawOpen > 0.45) {
    cue = 'OPEN MOUTH'
  }

  setExpressionCue(cue)
}
  const updateGesture = result => {
    const gestures = result?.gestures || []
    const landmarks = result?.landmarks || []

    let best = 'NO GESTURE'
    let bestScore = 0

    const names = {
      Thumb_Up: 'THUMBS UP',
      Thumb_Down: 'THUMBS DOWN',
      Victory: 'PEACE',
      Open_Palm: 'OPEN PALM',
      Closed_Fist: 'CLOSED FIST',
      Pointing_Up: 'POINTING UP',
      ILoveYou: 'ROCK ON'
    }
    
    for (const hand of gestures) {
      for (const gesture of hand || []) {
        const score = gesture.score || 0

        if (
          gesture.categoryName === 'None' ||
          score < 0.6 ||
          score <= bestScore
        ) {
          continue
        }

        bestScore = score
        best = names[gesture.categoryName] || best
      }
    }

    for (const hand of landmarks) {
      if (isOkayGesture(hand)) {
        best = 'FINE'
        break
      }
    }

    const now = Date.now()

    if (best !== gestureCandidateRef.current) {
      gestureCandidateRef.current = best
      gestureCandidateSinceRef.current = now
    }

    if (
      now - gestureCandidateSinceRef.current > 500 &&
      best !== lastGestureRef.current
    ) {
      lastGestureRef.current = best
      setGestureCue(best)
    }
  }

  const isOkayGesture = hand => {
    if (!hand || hand.length < 21) return false

    const distance = (a, b) =>
      Math.hypot(a.x - b.x, a.y - b.y)

    const wrist = hand[0]
    const indexTip = hand[8]

    const wristIndex = distance(wrist, indexTip)

    return (
      distance(hand[4], hand[8]) < wristIndex * 0.35 &&
      distance(wrist, hand[12]) > wristIndex * 1.05 &&
      distance(wrist, hand[16]) > wristIndex * 0.9 &&
      distance(wrist, hand[20]) > wristIndex * 0.75
    )
  }

  const startRecording = () => {
    if (
      !streamRef.current ||
      processingRef.current ||
      aiSpeakingRef.current
    ) return

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    setAiSpeaking(false)
    setTranscript('')
    setAiResponse('')
    setError('')
    setIsThinking(false)
    setIsTranscribing(false)

    audioChunksRef.current = []

    const audioTrack = streamRef.current.getAudioTracks()[0]

    if (!audioTrack) {
      setError('Microphone audio is not available.')
      return
    }

    const audioStream = new MediaStream([audioTrack])

    const mimeType = MediaRecorder.isTypeSupported(
      'audio/webm;codecs=opus'
    )
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'

    try {
      const recorder = new MediaRecorder(audioStream, { mimeType })

      mediaRecorderRef.current = recorder

      recorder.ondataavailable = event => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = sendRecording
      recorder.start()

      setIsRecording(true)
    } catch (err) {
      console.error(err)
      setError('Could not start audio recording.')
    }
  }

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop()
    }

    setIsRecording(false)
  }

  const sendRecording = async () => {
    if (!audioChunksRef.current.length) return

    processingRef.current = true
    setIsTranscribing(true)
    setError('')

    const audioBlob = new Blob(audioChunksRef.current, {
      type: 'audio/webm'
    })

    const formData = new FormData()
    formData.append('file', audioBlob, 'recording.webm')

    try {
      const transcriptionResponse = await fetch(
        `${API_URL}/transcribe`,
        {
          method: 'POST',
          body: formData
        }
      )

      if (!transcriptionResponse.ok) {
        throw new Error(
          `Transcription failed: ${transcriptionResponse.status}`
        )
      }

      const transcriptionData =
        await transcriptionResponse.json()

      const text = (
        transcriptionData.text || ''
      ).trim()

      setTranscript(text)

      if (!text) {
        setError('I could not understand the recording.')
        return
      }

      setIsTranscribing(false)
      setIsThinking(true)

      let contextMessage = text

      if (
        expressionCueRef.current !== 'NEUTRAL' ||
        gestureCueRef.current !== 'NO GESTURE'
      ) {
        contextMessage = `
      ${text}

      Visual context:
      Facial cue: ${expressionCueRef.current}
      Hand gesture: ${gestureCueRef.current}

      Treat visual information only as soft conversational context.
      Do not claim to know the user's true emotional state.
      Do not diagnose emotions.
      Do not mention the vision system unless directly relevant.
      `
      }

      const chatResponse = await fetch(
        `${API_URL}/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: contextMessage
          })
        }
      )

      if (!chatResponse.ok) {
        throw new Error(
          `AI response failed: ${chatResponse.status}`
        )
      }

      const chatData = await chatResponse.json()

      const responseText = (
        chatData.response || ''
      ).trim()

      if (!responseText) {
        throw new Error(
          'SHURI returned an empty response.'
        )
      }

      setAiResponse(responseText)
      setIsThinking(false)

      await speakResponse(
        responseText
      )
    }

     catch (err) {
      console.error(err)
      setIsThinking(false)
      setIsTranscribing(false)
      setAiSpeaking(false)
      aiSpeakingRef.current = false
      setError('SHURI could not process that message.')
    } finally {
      processingRef.current = false
      setIsTranscribing(false)
      setIsThinking(false)
      audioChunksRef.current = []
    }
  }

  const speakResponse = async text => {
    try {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        audioRef.current = null
      }

      const response = await fetch(
        `${API_URL}/speak`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ text })
        }
      )

      if (!response.ok) {
        const message = await response.text()
        throw new Error(
          `TTS failed: ${response.status} ${message}`
        )
      }

      const audioBlob = await response.blob()

      if (!audioBlob.size) {
        throw new Error('Empty audio response.')
      }

      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)

      audio.preload = 'auto'
      audioRef.current = audio

      audio.onplay = () => {
        setAiSpeaking(true)
      }

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl)
        audioRef.current = null
        aiSpeakingRef.current = false
        setAiSpeaking(false)
      }

      audio.onerror = event => {
        console.error('SHURI audio error:', event)
        URL.revokeObjectURL(audioUrl)
        audioRef.current = null
        aiSpeakingRef.current = false
        setAiSpeaking(false)
        setError('SHURI could not play the voice response.')
      }

      await audio.play()
    } catch (err) {
      console.error(err)
      aiSpeakingRef.current = false
      setAiSpeaking(false)
      throw err
    }
  }

  const stopEverything = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }

    aiSpeakingRef.current = false
    processingRef.current = false

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop()
    }

    streamRef.current?.getTracks().forEach(
      track => track.stop()
    )

    if (audioAnimationRef.current) {
      cancelAnimationFrame(audioAnimationRef.current)
    }

    if (visionAnimationRef.current) {
      cancelAnimationFrame(visionAnimationRef.current)
    }

    audioContextRef.current?.close()
    faceLandmarkerRef.current?.close()
    gestureRecognizerRef.current?.close()

    streamRef.current = null
    mediaRecorderRef.current = null
    audioContextRef.current = null
    faceLandmarkerRef.current = null
    gestureRecognizerRef.current = null

    setMediaReady(false)
    setUserSpeaking(false)
    setAiSpeaking(false)
    setIsRecording(false)
    setIsTranscribing(false)
    setIsThinking(false)
    setTranscript('')
    setAiResponse('')
    setExpressionCue('NEUTRAL')
    setGestureCue('NO GESTURE')
    setFaceVisible(true)
    setFaceReady(false)
    setError('')
    setStarted(false)
  }

  if (started && mediaReady) {
    return (
      <div className="shuri-app">
        <header className="topbar">
          <div className="brand">
            <img src={shuriIcon} alt="" />
            <span>S.H.U.R.I.</span>
          </div>

        </header>

        <main className="session">
          <div className="conversation">
            <div className="conversation-header">

              <div className="live-state">
                <span></span>

                {isTranscribing
                  ? 'TRANSCRIBING'
                  : isThinking
                    ? 'PROCESSING'
                    : userSpeaking
                      ? 'LISTENING'
                      : aiSpeaking
                        ? 'SPEAKING'
                        : 'READY'}
              </div>
            </div>

            <div className="video-grid">
              <div className="video-window user-window">
                <div className="window-header">
                  <span>DIYA</span>

                  <span
                    className={
                      userSpeaking
                        ? 'active-state'
                        : ''
                    }
                  >
      
                  </span>
                </div>

                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="camera-feed"
                />

                {faceReady && !faceVisible ? (
                  <div className="vision-cue face-warning">
                    FACE NOT VISIBLE
                  </div>
                ) : (
                  <>
                    {gestureCue !== 'NO GESTURE' && (
                      <div className="vision-cue">
                        {gestureCue}
                      </div>
                    )}

                    {expressionCue !== 'NEUTRAL' &&
                      expressionCue !== 'NO FACE DETECTED' && (
                        <div className="vision-cue">
                          {expressionCue}
                        </div>
                      )}
                  </>
                )}

                <div className="window-status">
                  <span
                    className={
                      userSpeaking
                        ? 'pulse-dot'
                        : ''
                    }
                  ></span>

                  {userSpeaking
                    ? 'VOICE DETECTED'
                    : isRecording
                      ? 'SPEAKING'
                      : 'CAMERA ONLINE'}
                </div>
              </div>

              <div
                className={`video-window ai-window ${
                  aiSpeaking
                    ? 'ai-speaking'
                    : isThinking || isTranscribing
                      ? 'ai-thinking'
                      : isRecording || userSpeaking
                        ? 'ai-listening'
                        : 'ai-idle'
                }`}
              >
                <div className="window-header">
                  <span>SHURI</span>

                  <span
                    className={
                      aiSpeaking
                        ? 'active-state'
                        : ''
                    }
                  >
                  </span>
                </div>

                <div className="ai-stage">
                  
              <div className="ai-core">
                <ShuriBlob />
              </div>


                  <div className="ai-wave">
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>

                </div>

                <div className="window-status">
                  <span
                    className={
                      aiSpeaking
                        ? 'pulse-dot'
                        : ''
                    }
                  ></span>

                  {aiSpeaking
                    ? 'VOICE OUTPUT ACTIVE'
                    : isThinking
                      ? 'GENERATING RESPONSE'
                      : 'AI READY'}
                </div>
              </div>
            </div>

            {(transcript || aiResponse) && (
              <div className="conversation-text">
                {transcript && (
                  <div className="message">
                    <div className="message-label">
                      YOU
                    </div>

                    <div className="message-text">
                      {transcript}
                    </div>
                  </div>
                )}

                {aiResponse && (
                  <div className="message ai-message">
                    <div className="message-label">
                      SHURI
                    </div>

                    <div className="message-text">
                      {aiResponse}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="conversation-controls">
              <div className="mic-state">
                <span
                  className={
                    isRecording || userSpeaking
                      ? 'pulse-dot'
                      : ''
                  }
                ></span>

                {isTranscribing
                  ? 'TRANSCRIBING...'
                  : isThinking
                    ? 'PROCESSING...'
                    : isRecording
                      ? 'LISTENING...'
                      : aiSpeaking
                        ? 'SHURI IS SPEAKING'
                        : 'MICROPHONE READY'}
              </div>

              <div className="conversation-buttons">
                {!isRecording &&
                !isTranscribing &&
                !isThinking &&
                !aiSpeaking ? (
                  <button
                    className="primary-button talk-button"
                    onClick={startRecording}
                  >
                    START TALKING
                  </button>
                ) : isRecording ? (
                  <button
                    className="primary-button talk-button recording-button"
                    onClick={stopRecording}
                  >
                    STOP TALKING
                  </button>
                ) : null}

                <button
                  className="secondary-button"
                  onClick={stopEverything}
                >
                  STOP SESSION
                </button>
              </div>
            </div>

            {error && (
              <p className="media-error">
                {error}
              </p>
            )}
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="shuri-app home-screen">
      <header className="topbar home-topbar">
        <div className="home-brand">
          <div className="home-logo">
            <img
              src={shuriLogo}
              alt="S.H.U.R.I."
            />
          </div>

          <div className="home-brand-name">
            <div className="shuri-name">S.H.U.R.I.</div>
          </div>
        </div>

      </header>

      <main className="home">
        <section className="home-center">

          <h1>
            Hey <span>Diya,</span>
          </h1>

          <h2>
            How can I help you today?
          </h2>

          <button
            className="home-mic"
            onClick={() => {
              setStarted(true)
              startMedia()
            }}
            aria-label="Start conversation"
          >
            <svg viewBox="0 0 24 24">
              <rect
                x="9"
                y="3"
                width="6"
                height="11"
                rx="3"
              ></rect>

              <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"></path>
            </svg>
          </button>

          <p className="home-mic-label">
            TAP TO START SESSION
          </p>
        </section>
      </main>

      <footer className="home-footer">
        <span></span>

        <p>
          Speech, Human-emotion & User Response Intelligence
        </p>

        <span></span>
      </footer>
    </div>
  )
}

export default App