import { useEffect, useRef, useState } from 'react'
import {
  FaceLandmarker,
  GestureRecognizer,
  FilesetResolver
} from '@mediapipe/tasks-vision'
import './App.css'

import shuriIcon from './assets/shuri_icon_only.png'
import shuriAvatar from './assets/avatar.png'

const API_URL = 'http://127.0.0.1:8000'

const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

const GESTURE_MODEL_URL = '/models/gesture_recognizer.task'

const WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'

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

  const aiSpeakingRef = useRef(false)
  const processingRef = useRef(false)

  const expressionCueRef = useRef('NEUTRAL')
  const gestureCueRef = useRef('NO GESTURE')

  const lastExpressionRef = useRef('NEUTRAL')
  const expressionCandidateRef = useRef('NEUTRAL')
  const expressionCandidateSinceRef = useRef(0)

  const lastGestureRef = useRef('NO GESTURE')
  const gestureCandidateRef = useRef('NO GESTURE')
  const gestureCandidateSinceRef = useRef(0)

  useEffect(() => {
    expressionCueRef.current = expressionCue
  }, [expressionCue])

  useEffect(() => {
    gestureCueRef.current = gestureCue
  }, [gestureCue])

const startMedia = async () => {
  setError('')

  try {
    const stream =
      await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      })

    streamRef.current = stream
    setMediaReady(true)
  } catch (err) {
    console.error(err)
    setError(
      'Camera or microphone access was denied.'
    )
    setStarted(false)
  }
}

  useEffect(() => {
    if (
      !mediaReady ||
      !videoRef.current ||
      !streamRef.current
    ) {
      return
    }

    videoRef.current.srcObject =
      streamRef.current

    videoRef.current
      .play()
      .catch(console.error)

    const audioTrack =
      streamRef.current.getAudioTracks()[0]

    if (!audioTrack) return

    const audioContext =
      new AudioContext()

    const source =
      audioContext.createMediaStreamSource(
        streamRef.current
      )

    const analyser =
      audioContext.createAnalyser()

    analyser.fftSize = 256
    source.connect(analyser)

    audioContextRef.current =
      audioContext

    const data =
      new Uint8Array(
        analyser.frequencyBinCount
      )

    const detectSpeech = () => {
      analyser.getByteFrequencyData(data)

      const average =
        data.reduce(
          (sum, value) =>
            sum + value,
          0
        ) / data.length

      setUserSpeaking(
        !aiSpeakingRef.current &&
        !processingRef.current &&
        average > 18
      )

      audioAnimationRef.current =
        requestAnimationFrame(
          detectSpeech
        )
    }

    detectSpeech()

    return () => {
      if (audioAnimationRef.current) {
        cancelAnimationFrame(
          audioAnimationRef.current
        )
      }

      audioContext.close()
    }
  }, [mediaReady])

  useEffect(() => {
    if (!mediaReady) return

    let cancelled = false

    const setupVision = async () => {
      try {
        const vision =
          await FilesetResolver.forVisionTasks(
            WASM_URL
          )

        const faceLandmarker =
          await FaceLandmarker.createFromOptions(
            vision,
            {
              baseOptions: {
                modelAssetPath:
                  FACE_MODEL_URL
              },
              runningMode: 'VIDEO',
              numFaces: 1,
              outputFaceBlendshapes: true,
              minFaceDetectionConfidence: 0.5,
              minFacePresenceConfidence: 0.5,
              minTrackingConfidence: 0.5
            }
          )

        const gestureRecognizer =
          await GestureRecognizer.createFromOptions(
            vision,
            {
              baseOptions: {
                modelAssetPath:
                  GESTURE_MODEL_URL
              },
              runningMode: 'VIDEO',
              numHands: 2,
              minHandDetectionConfidence: 0.5,
              minHandPresenceConfidence: 0.5,
              minTrackingConfidence: 0.5
            }
          )

        if (cancelled) {
          faceLandmarker.close()
          gestureRecognizer.close()
          return
        }

        faceLandmarkerRef.current =
          faceLandmarker

        gestureRecognizerRef.current =
          gestureRecognizer

        const detectVision = () => {
          if (
            !videoRef.current ||
            videoRef.current.readyState < 2 ||
            !faceLandmarkerRef.current ||
            !gestureRecognizerRef.current
          ) {
            visionAnimationRef.current =
              requestAnimationFrame(
                detectVision
              )
            return
          }

          const timestamp =
            performance.now()

          try {
            const faceResult =
              faceLandmarkerRef.current
                .detectForVideo(
                  videoRef.current,
                  timestamp
                )

            const gestureResult =
              gestureRecognizerRef.current
                .recognizeForVideo(
                  videoRef.current,
                  timestamp
                )

            updateExpression(
              faceResult
            )

            updateGesture(
              gestureResult
            )
          } catch (err) {
            console.error(err)
          }

          visionAnimationRef.current =
            requestAnimationFrame(
              detectVision
            )
        }

        detectVision()
      } catch (err) {
        console.error(err)
        setError(
          'Vision analysis could not be started.'
        )
      }
    }

    setupVision()

    return () => {
      cancelled = true

      if (visionAnimationRef.current) {
        cancelAnimationFrame(
          visionAnimationRef.current
        )
      }

      if (faceLandmarkerRef.current) {
        faceLandmarkerRef.current.close()
        faceLandmarkerRef.current = null
      }

      if (gestureRecognizerRef.current) {
        gestureRecognizerRef.current.close()
        gestureRecognizerRef.current = null
      }
    }
  }, [mediaReady])

  const updateExpression = result => {
    const categories =
      result?.faceBlendshapes?.[0]
        ?.categories || []

    if (!categories.length) {
      setExpressionCue(
        'NO FACE DETECTED'
      )
      return
    }

    const scores = {}

    categories.forEach(category => {
      scores[
        category.categoryName
      ] = category.score
    })

    const get = name =>
      scores[name] || 0

    const avg = (...names) =>
      names.reduce(
        (sum, name) =>
          sum + get(name),
        0
      ) / names.length

    const smile = avg(
      'mouthSmileLeft',
      'mouthSmileRight'
    )

    const frown = avg(
      'mouthFrownLeft',
      'mouthFrownRight'
    )

    const browDown = avg(
      'browDownLeft',
      'browDownRight'
    )

    const browInnerUp =
      get('browInnerUp')

    const browOuterUp = avg(
      'browOuterUpLeft',
      'browOuterUpRight'
    )

    const eyeWide = avg(
      'eyeWideLeft',
      'eyeWideRight'
    )

    const eyeSquint = avg(
      'eyeSquintLeft',
      'eyeSquintRight'
    )

    const eyeBlink = avg(
      'eyeBlinkLeft',
      'eyeBlinkRight'
    )

    const cheekSquint = avg(
      'cheekSquintLeft',
      'cheekSquintRight'
    )

    const cheekPuff =
      get('cheekPuff')

    const jawOpen =
      get('jawOpen')

    const jawForward =
      get('jawForward')

    const jawLeft =
      get('jawLeft')

    const jawRight =
      get('jawRight')

    const mouthClose =
      get('mouthClose')

    const mouthDimple = avg(
      'mouthDimpleLeft',
      'mouthDimpleRight'
    )

    const mouthFunnel =
      get('mouthFunnel')

    const mouthPucker =
      get('mouthPucker')

    const mouthPress = avg(
      'mouthPressLeft',
      'mouthPressRight'
    )

    const mouthStretch = avg(
      'mouthStretchLeft',
      'mouthStretchRight'
    )

    const mouthRollUpper =
      get('mouthRollUpper')

    const mouthRollLower =
      get('mouthRollLower')

    const mouthShrugUpper =
      get('mouthShrugUpper')

    const mouthShrugLower =
      get('mouthShrugLower')

    const noseSneer = avg(
      'noseSneerLeft',
      'noseSneerRight'
    )

    const upperLipRaise = avg(
      'mouthUpperUpLeft',
      'mouthUpperUpRight'
    )

    const lowerLipDown = avg(
      'mouthLowerDownLeft',
      'mouthLowerDownRight'
    )

    const leftEyeLookUp =
      get('eyeLookUpLeft')

    const rightEyeLookUp =
      get('eyeLookUpRight')

    const leftEyeLookDown =
      get('eyeLookDownLeft')

    const rightEyeLookDown =
      get('eyeLookDownRight')

    const leftEyeLookOut =
      get('eyeLookOutLeft')

    const rightEyeLookOut =
      get('eyeLookOutRight')

    const leftEyeLookIn =
      get('eyeLookInLeft')

    const rightEyeLookIn =
      get('eyeLookInRight')

    let next = 'NEUTRAL'

    if (
      smile > 0.55 &&
      cheekSquint > 0.35
    )
      next = 'BIG SMILE'
    else if (smile > 0.4)
      next = 'SMILE'
    else if (
      frown > 0.42 &&
      browInnerUp > 0.3
    )
      next = 'SAD-LIKE CUE'
    else if (
      frown > 0.32 &&
      browDown > 0.3
    )
      next = 'FROWN'
    else if (
      browDown > 0.5 &&
      mouthPress > 0.3
    )
      next = 'FRUSTRATED CUE'
    else if (browDown > 0.48)
      next = 'FURROWED BROWS'
    else if (
      eyeWide > 0.55 &&
      jawOpen > 0.35
    )
      next = 'SHOCKED CUE'
    else if (
      eyeWide > 0.45 &&
      browInnerUp > 0.4
    )
      next = 'SURPRISED CUE'
    else if (
      browOuterUp > 0.48 &&
      browInnerUp > 0.3
    )
      next = 'ATTENTIVE'
    else if (
      browInnerUp > 0.5 &&
      mouthPress > 0.25
    )
      next = 'THOUGHTFUL CUE'
    else if (
      browInnerUp > 0.42 &&
      mouthStretch > 0.25
    )
      next = 'UNCERTAIN CUE'
    else if (
      eyeSquint > 0.5 &&
      smile > 0.2
    )
      next = 'AMUSED CUE'
    else if (eyeSquint > 0.48)
      next = 'SQUINTING'
    else if (eyeWide > 0.5)
      next = 'WIDE-EYED'
    else if (eyeBlink > 0.55)
      next = 'BLINKING'
    else if (cheekPuff > 0.5)
      next = 'CHEEKS PUFFED'
    else if (mouthPucker > 0.5)
      next = 'PULLED LIPS'
    else if (mouthFunnel > 0.5)
      next = 'FUNNELLED LIPS'
    else if (mouthPress > 0.5)
      next = 'LIPS PRESSED'
    else if (mouthStretch > 0.5)
      next = 'MOUTH STRETCHED'
    else if (
      upperLipRaise > 0.45 &&
      noseSneer > 0.25
    )
      next = 'NOSE WRINKLE'
    else if (upperLipRaise > 0.42)
      next = 'UPPER LIP RAISED'
    else if (lowerLipDown > 0.45)
      next = 'LOWER LIP DROP'
    else if (mouthDimple > 0.45)
      next = 'DIMPLE CUE'
    else if (
      mouthShrugUpper > 0.45 ||
      mouthShrugLower > 0.45
    )
      next = 'MOUTH SHRUG'
    else if (
      mouthRollUpper > 0.45 ||
      mouthRollLower > 0.45
    )
      next = 'LIP ROLL'
    else if (jawOpen > 0.55)
      next = 'OPEN MOUTH'
    else if (jawForward > 0.5)
      next = 'JAW FORWARD'
    else if (
      Math.max(
        jawLeft,
        jawRight
      ) > 0.45
    )
      next = 'JAW SHIFT'
    else if (
      leftEyeLookUp > 0.55 &&
      rightEyeLookUp > 0.55
    )
      next = 'LOOKING UP'
    else if (
      leftEyeLookDown > 0.55 &&
      rightEyeLookDown > 0.55
    )
      next = 'LOOKING DOWN'
    else if (
      (
        leftEyeLookOut > 0.5 &&
        rightEyeLookIn > 0.5
      ) ||
      (
        rightEyeLookOut > 0.5 &&
        leftEyeLookIn > 0.5
      )
    )
      next = 'LOOKING SIDEWAYS'
    else if (
      mouthClose > 0.55 &&
      mouthPress < 0.2
    )
      next = 'CLOSED LIPS'

    const now = Date.now()

    if (
      next !==
      expressionCandidateRef.current
    ) {
      expressionCandidateRef.current =
        next

      expressionCandidateSinceRef.current =
        now
    }

    if (
      now -
        expressionCandidateSinceRef.current >
        700 &&
      next !== lastExpressionRef.current
    ) {
      lastExpressionRef.current =
        next

      setExpressionCue(next)
    }
  }

  const updateGesture = result => {
    const gestures =
      result?.gestures || []

    const landmarks =
      result?.landmarks || []

    let best = 'NO GESTURE'
    let bestScore = 0

    for (
      let i = 0;
      i < gestures.length;
      i++
    ) {
      for (
        const gesture of
        gestures[i] || []
      ) {
        const score =
          gesture.score || 0

        const name =
          gesture.categoryName || ''

        if (
          score < 0.5 ||
          score <= bestScore
        ) {
          continue
        }

        let detected =
          'NO GESTURE'

        if (name === 'Thumb_Up')
          detected =
            'THUMBS UP'
        else if (
          name === 'Thumb_Down'
        )
          detected =
            'THUMBS DOWN'
        else if (
          name === 'Victory'
        )
          detected =
            'PEACE / VICTORY'
        else if (
          name === 'Open_Palm'
        )
          detected =
            'OPEN PALM'
        else if (
          name === 'Closed_Fist'
        )
          detected =
            'CLOSED FIST'
        else if (
          name === 'Pointing_Up'
        )
          detected =
            'POINTING UP'
        else if (
          name === 'ILoveYou'
        )
          detected =
            'I LOVE YOU'

        if (
          detected !==
          'NO GESTURE'
        ) {
          best = detected
          bestScore = score
        }
      }
    }

    for (const hand of landmarks) {
      if (isOkayGesture(hand)) {
        best = 'OK / FINE'
        break
      }
    }

    updateGestureState(best)
  }

  const isOkayGesture = hand => {
    if (
      !hand ||
      hand.length < 21
    ) {
      return false
    }

    const distance = (a, b) =>
      Math.hypot(
        a.x - b.x,
        a.y - b.y
      )

    const wrist = hand[0]
    const thumbTip = hand[4]
    const indexTip = hand[8]
    const middleTip = hand[12]
    const ringTip = hand[16]
    const pinkyTip = hand[20]

    const wi = distance(
      wrist,
      indexTip
    )

    return (
      distance(
        thumbTip,
        indexTip
      ) <
        wi * 0.35 &&
      distance(
        wrist,
        middleTip
      ) >
        wi * 1.05 &&
      distance(
        wrist,
        ringTip
      ) >
        wi * 0.9 &&
      distance(
        wrist,
        pinkyTip
      ) >
        wi * 0.75
    )
  }

  const updateGestureState = next => {
    const now = Date.now()

    if (
      next !==
      gestureCandidateRef.current
    ) {
      gestureCandidateRef.current =
        next

      gestureCandidateSinceRef.current =
        now
    }

    if (
      now -
        gestureCandidateSinceRef.current <
      600
    ) {
      return
    }

    if (
      next !== lastGestureRef.current
    ) {
      lastGestureRef.current =
        next

      setGestureCue(next)
    }
  }

  const startRecording = () => {
    if (
      !streamRef.current ||
      processingRef.current ||
      aiSpeakingRef.current
    ) {
      return
    }

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

    const audioTrack =
      streamRef.current
        .getAudioTracks()[0]

    if (!audioTrack) {
      setError(
        'Microphone audio is not available.'
      )
      return
    }

    const audioStream =
      new MediaStream([
        audioTrack
      ])

    const mimeType =
      MediaRecorder.isTypeSupported(
        'audio/webm;codecs=opus'
      )
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'

    try {
      const recorder =
        new MediaRecorder(
          audioStream,
          { mimeType }
        )

      mediaRecorderRef.current =
        recorder

      recorder.ondataavailable =
        event => {
          if (
            event.data.size > 0
          ) {
            audioChunksRef.current.push(
              event.data
            )
          }
        }

      recorder.onstop =
        sendRecording

      recorder.start()

      setIsRecording(true)
    } catch (err) {
      console.error(err)

      setError(
        'Could not start audio recording.'
      )
    }
  }

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !==
        'inactive'
    ) {
      mediaRecorderRef.current.stop()
    }

    setIsRecording(false)
  }

  const sendRecording = async () => {
    if (
      !audioChunksRef.current.length
    ) {
      return
    }

    processingRef.current = true

    setIsTranscribing(true)
    setError('')

    const audioBlob =
      new Blob(
        audioChunksRef.current,
        {
          type: 'audio/webm'
        }
      )

    const formData =
      new FormData()

    formData.append(
      'file',
      audioBlob,
      'recording.webm'
    )

    try {
      const transcriptionResponse =
        await fetch(
          `${API_URL}/transcribe`,
          {
            method: 'POST',
            body: formData
          }
        )

      if (
        !transcriptionResponse.ok
      ) {
        throw new Error(
          `Transcription failed: ${transcriptionResponse.status}`
        )
      }

      const transcriptionData =
        await transcriptionResponse.json()

      const text =
        (
          transcriptionData.text ||
          ''
        ).trim()

      setTranscript(text)

      if (!text) {
        setError(
          'I could not understand the recording.'
        )
        return
      }

      setIsTranscribing(false)
      setIsThinking(true)

      const contextMessage = `
User message:
${text}

Current facial-expression cue:
${expressionCueRef.current}

Current hand gesture:
${gestureCueRef.current}

Use visual information only as soft conversational context.
Do not claim to know the user's true internal emotional state.
Do not diagnose emotions.
Do not mention the computer vision system.
Only mention visual cues when naturally relevant.

Gesture meanings:
THUMBS UP = good / yes / approval
THUMBS DOWN = no / disapproval
PEACE / VICTORY = peace / victory
OK / FINE = okay / fine / good
OPEN PALM = hello / stop / wait
CLOSED FIST = closed fist
POINTING UP = pointing / one
I LOVE YOU = hand gesture associated with "I love you"
`

      const chatResponse =
        await fetch(
          `${API_URL}/chat`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify({
              message:
                contextMessage
            })
          }
        )

      if (!chatResponse.ok) {
        throw new Error(
          `AI response failed: ${chatResponse.status}`
        )
      }

      const chatData =
        await chatResponse.json()

      const responseText =
        (
          chatData.response ||
          ''
        ).trim()

      if (!responseText) {
        throw new Error(
          'The AI returned an empty response.'
        )
      }

      await speakResponse(
        responseText
      )
    } catch (err) {
      console.error(err)

      setIsThinking(false)
      setIsTranscribing(false)
      setAiSpeaking(false)

      aiSpeakingRef.current = false

      setError(
        'The system could not process that message.'
      )
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

      const response =
        await fetch(
          `${API_URL}/speak`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify({
              text
            })
          }
        )

      if (!response.ok) {
        const message =
          await response.text()

        throw new Error(
          `TTS failed: ${response.status} ${message}`
        )
      }

      const audioBlob =
        await response.blob()

      const audioUrl =
        URL.createObjectURL(
          audioBlob
        )

      const audio =
        new Audio(audioUrl)

      audioRef.current = audio

      audio.onplay = () => {
        setIsThinking(false)
        setAiResponse(text)
        setAiSpeaking(true)

        aiSpeakingRef.current =
          true

        setUserSpeaking(false)
      }

      audio.onended = () => {
        URL.revokeObjectURL(
          audioUrl
        )

        audioRef.current = null

        aiSpeakingRef.current =
          false

        setAiSpeaking(false)
      }

      audio.onerror = event => {
        console.error(
          'Audio error:',
          event
        )

        URL.revokeObjectURL(
          audioUrl
        )

        audioRef.current = null

        aiSpeakingRef.current =
          false

        setAiSpeaking(false)

        setError(
          'The voice response could not be played.'
        )
      }

      await audio.play()
    } catch (err) {
      console.error(err)

      aiSpeakingRef.current =
        false

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
      mediaRecorderRef.current.state !==
        'inactive'
    ) {
      mediaRecorderRef.current.stop()
    }

    streamRef.current
      ?.getTracks()
      .forEach(track =>
        track.stop()
      )

    if (audioAnimationRef.current) {
      cancelAnimationFrame(
        audioAnimationRef.current
      )
    }

    if (visionAnimationRef.current) {
      cancelAnimationFrame(
        visionAnimationRef.current
      )
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
    setStarted(false)
    setExpressionCue('NEUTRAL')
    setGestureCue('NO GESTURE')
  }

  if (started) {
    return (
      <div className="shuri-app">
        <header className="topbar">
          <div className="brand">
            <img
              src={shuriIcon}
              alt=""
            />

            <span>S.H.U.R.I.</span>
          </div>

          {mediaReady && (
            <div className="system-status">
              <span className="status-dot"></span>
              SESSION ACTIVE
            </div>
          )}
        </header>

        <main className="session">

          {mediaReady && (
            <div className="conversation">
              <div className="conversation-header">
                <div>
                  <p className="eyebrow">
                    LIVE SESSION
                  </p>

                  <h2>
                    {isTranscribing
                      ? 'Understanding you, Diya.'
                      : isThinking
                        ? 'Preparing your response.'
                        : aiSpeaking
                          ? 'Speaking to you, Diya.'
                          : "I'm listening, Diya."}
                  </h2>
                </div>

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
                    <span>
                      01 // DIya
                    </span>

                    <span
                      className={
                        userSpeaking
                          ? 'active-state'
                          : ''
                      }
                    >
                      {userSpeaking
                        ? 'SPEAKING'
                        : 'LIVE'}
                    </span>
                  </div>

                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="camera-feed"
                  />

                  {(
                    gestureCue !==
                      'NO GESTURE' ||
                    (
                      expressionCue !==
                        'NEUTRAL' &&
                      expressionCue !==
                        'NO FACE DETECTED'
                    )
                  ) && (
                    <div className="vision-cue">
                      {gestureCue !==
                      'NO GESTURE'
                        ? gestureCue
                        : expressionCue}
                    </div>
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
                        ? 'RECORDING'
                        : 'CAMERA ONLINE'}
                  </div>
                </div>

                <div
                  className={`video-window ai-window ${
                    aiSpeaking
                      ? 'ai-speaking'
                      : ''
                  }`}
                >
                  <div className="window-header">
                    <span>
                      02 // AI CORE
                    </span>

                    <span
                      className={
                        aiSpeaking
                          ? 'active-state'
                          : ''
                      }
                    >
                      {aiSpeaking
                        ? 'SPEAKING'
                        : 'LOCAL CORE'}
                    </span>
                  </div>

                  <div className="ai-stage">
                    <div className="ai-core-ring ring-one"></div>
                    <div className="ai-core-ring ring-two"></div>
                    <div className="ai-core-ring ring-three"></div>

                    <div className="ai-avatar">
                      <img
                        src={shuriAvatar}
                        alt="AI assistant"
                      />
                    </div>

                    <div className="ai-signal">
                      <span></span>
                      <span></span>
                      <span></span>
                      <span></span>
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>

                    <div className="ai-label">
                      <span className="ai-label-dot"></span>
                      AI CORE
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
                        : 'AI CORE READY'}
                  </div>
                </div>
              </div>

              {(transcript ||
                aiResponse) && (
                <div className="conversation-text">
                  {transcript && (
                    <div className="message user-message">
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
                        AI
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
                      isRecording ||
                      userSpeaking
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
                          ? 'AI IS SPEAKING'
                          : 'MICROPHONE READY'}
                </div>

                <div className="conversation-buttons">
                  {!isRecording &&
                  !isTranscribing &&
                  !isThinking &&
                  !aiSpeaking ? (
                    <button
                      className="primary-button talk-button"
                      onClick={
                        startRecording
                      }
                    >
                      START TALKING
                    </button>
                  ) : isRecording ? (
                    <button
                      className="primary-button talk-button recording-button"
                      onClick={
                        stopRecording
                      }
                    >
                      STOP TALKING
                    </button>
                  ) : null}

                  <button
                    className="secondary-button"
                    onClick={
                      stopEverything
                    }
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
          )}
        </main>
      </div>
    )
  }

  return (
    <div className="shuri-app home-screen">
      <header className="topbar">
        <div className="brand">
          <img
            src={shuriIcon}
            alt=""
          />

          <span>S.H.U.R.I.</span>
        </div>

        <div className="system-status">
          <span className="status-dot"></span>
          LOCAL
        </div>
      </header>

      <main className="home">
        <section className="home-center">
          <div className="home-core">
            <div className="home-core-ring ring-one"></div>
            <div className="home-core-ring ring-two"></div>
            <div className="home-core-ring ring-three"></div>

            <div className="home-core-center">
              <span></span>
            </div>
          </div>

          <p className="eyebrow">
            PERSONAL INTELLIGENCE SYSTEM
          </p>

          <div className="waveform">
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

          <h2>
            Hello, Diya.
          </h2>

          <p className="intro">
          </p>

          <button
            className="initialize-button"
            onClick={() => {
              setStarted(true)
              startMedia()
            }}
          >
            <span>
              INITIALIZE SESSION
            </span>

            <span className="arrow">
              →
            </span>
          </button>
        </section>
      </main>

      <footer className="footer">
        <span>LOCAL AI</span>
        <span>VOICE // VISION // CHAT</span>
        <span>PRIVATE SESSION</span>
      </footer>
    </div>
  )
}

export default App