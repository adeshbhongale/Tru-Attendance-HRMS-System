import * as FileSystem from 'expo-file-system/legacy';
import { X } from 'lucide-react-native';
import { useCallback, useEffect, useRef } from 'react';
import { Modal, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { MOBILE_CODES } from '../services/livenessService';

const LIVENESS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; user-select: none; }
  html, body { width: 100%; height: 100%; background: #0f172a; font-family: system-ui, -apple-system, sans-serif; overflow: hidden; color: #fff; }
  .stage { position: relative; width: 100%; height: 100%; border-radius: 24px; overflow: hidden; background: #1e293b; }
  video { width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
  .circle-guide {
    position: absolute; left: 50%; top: 40%;
    width: min(94vw, 66vh); aspect-ratio: 1 / 1;
    transform: translate(-50%, -50%); border-radius: 50%;
    border: 4px solid #64748b;
    box-shadow: 0 0 0 200vmax rgba(15, 23, 42, 0.74);
    pointer-events: none; transition: border-color 0.2s ease;
  }
  .card {
    position: absolute; left: 16px; right: 16px; bottom: 18px;
    background: rgba(15, 23, 42, 0.86); border: 1px solid rgba(255,255,255,0.18);
    border-radius: 18px; padding: 14px 16px; text-align: center; backdrop-filter: blur(8px);
  }
  .step-pill {
    display: inline-block; font-size: 10.5px; font-weight: 800; letter-spacing: 0.08em;
    text-transform: uppercase; color: #a5b4fc; background: rgba(99,102,241,0.18);
    padding: 3px 10px; border-radius: 999px; margin-bottom: 6px;
  }
  .title { font-size: 17px; font-weight: 800; color: #ffffff; line-height: 1.25; }
  .title.verified { color: #34d399; font-size: 19px; }
  .sub { font-size: 12.5px; color: #cbd5e1; margin-top: 4px; line-height: 1.35; }
  .retry {
    display: none; margin-top: 12px; width: 100%; border: none; border-radius: 12px;
    background: #4f46e5; color: #fff; font-size: 14px; font-weight: 800; padding: 11px 16px;
  }
</style>
</head>
<body>
<div class="stage">
  <video id="cam" autoplay playsinline muted></video>
  <div id="ring" class="circle-guide"></div>
  <div class="card">
    <div id="pill" class="step-pill">LIVE CHECK</div>
    <div id="title" class="title">Starting front camera...</div>
    <div id="sub" class="sub">Preparing on-device face verification</div>
    <button id="retry" class="retry" type="button">Try Again</button>
  </div>
</div>

<script type="module">
  const VISION_ESM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs";
  const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";
  const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

  const SESSION_TIMEOUT_MS = 22000;
  const BLINK_OPEN_MAX = 0.30;
  const BLINK_CLOSED_AVG_MIN = 0.43;
  const BLINK_CLOSED_EACH_MIN = 0.34;
  const SMILE_NEUTRAL_MAX = 0.35;
  const SMILE_ACTIVE_MIN = 0.52;
  const SMILE_FRAMES_REQUIRED = 3;

  const video = document.getElementById("cam");
  const ring = document.getElementById("ring");
  const pill = document.getElementById("pill");
  const titleEl = document.getElementById("title");
  const subEl = document.getElementById("sub");
  const retryBtn = document.getElementById("retry");

  const lumaCanvas = document.createElement("canvas");
  lumaCanvas.width = 32;
  lumaCanvas.height = 32;
  const lumaCtx = lumaCanvas.getContext("2d", { willReadFrequently: true });

  let stream = null;
  let landmarker = null;
  let rafId = 0;
  let timeoutId = 0;
  let finished = false;
  let timedOut = false;
  let lastVideoTime = -1;
  let lastInferTs = 0;
  let frameCounter = 0;
  let cachedLuma = 128;

  // Strictly ONLY eye_blink and smile
  let steps = [];
  let stepIndex = 0;
  let sessionStartMs = 0;
  let openBaselineFrames = 0;
  let closedAtMs = null;
  let observedNeutral = false;
  let smileFrames = 0;
  let prevFaceCenter = null;
  let verifiedAtMs = null;
  let snapSent = false;

  function postToNative(payload) {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
  }

  function stopCamera() {
    if (rafId) cancelAnimationFrame(rafId);
    if (timeoutId) clearTimeout(timeoutId);
    if (stream) {
      stream.getTracks().forEach((t) => { try { t.stop(); } catch (_) {} });
      stream = null;
    }
  }

  window.__stopLivenessCamera = stopCamera;

  function setUI(ringHex, pillText, titleText, subText, isVerified = false) {
    ring.style.borderColor = ringHex;
    pill.textContent = pillText;
    titleEl.textContent = titleText;
    titleEl.className = isVerified ? "title verified" : "title";
    subEl.textContent = subText;
  }

  function armSession() {
    steps = Math.random() < 0.5 ? ["eye_blink", "smile"] : ["smile", "eye_blink"];
    stepIndex = 0;
    sessionStartMs = performance.now();
    openBaselineFrames = 0;
    closedAtMs = null;
    observedNeutral = false;
    smileFrames = 0;
    prevFaceCenter = null;
    verifiedAtMs = null;
    snapSent = false;
    timedOut = false;
    retryBtn.style.display = "none";

    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      if (finished || verifiedAtMs !== null) return;
      timedOut = true;
      setUI("#f43f5e", "TIMED OUT", "Verification timed out", "Tap Try Again and complete Blink & Smile inside the circle");
      retryBtn.style.display = "block";
    }, SESSION_TIMEOUT_MS);

    setUI("#64748b", "STEP 1 OF 2", "Position your face in the circle", "Keep your full face clearly visible");
  }

  retryBtn.addEventListener("click", () => {
    if (!landmarker || !stream) {
      init();
      return;
    }
    armSession();
  });

  function sampleLuma() {
    try {
      lumaCtx.drawImage(video, 0, 0, 32, 32);
      const data = lumaCtx.getImageData(6, 6, 20, 20).data;
      let sum = 0;
      const pixels = data.length / 4;
      for (let i = 0; i < data.length; i += 4) {
        sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }
      return sum / pixels;
    } catch (_) {
      return 128;
    }
  }

  function getScore(categories, name) {
    for (let i = 0; i < categories.length; i++) {
      if (categories[i].categoryName === name) return categories[i].score;
    }
    return 0;
  }

  function snapEmployeePhoto() {
    if (snapSent || finished) return;
    snapSent = true;
    finished = true;
    try {
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;
      const longest = Math.max(vw, vh);
      const scale = longest > 960 ? 960 / longest : 1;
      const cw = Math.round(vw * scale);
      const ch = Math.round(vh * scale);

      const snapCanvas = document.createElement("canvas");
      snapCanvas.width = cw;
      snapCanvas.height = ch;
      const ctx = snapCanvas.getContext("2d");
      ctx.translate(cw, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, cw, ch);

      const dataUrl = snapCanvas.toDataURL("image/jpeg", 0.75);
      const commaIdx = dataUrl.indexOf(",");
      const base64 = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;
      const durationMs = Math.round(performance.now() - sessionStartMs);
      stopCamera();

      postToNative({
        verified: true,
        code: "LIVENESS_VERIFIED",
        message: "Live presence verified.",
        base64,
        stepsCompleted: steps,
        durationMs
      });
    } catch (err) {
      stopCamera();
      postToNative({
        verified: false,
        code: "SELFIE_CAPTURE_FAILED",
        message: "Verified live check, but photo capture failed."
      });
    }
  }

  function advanceStep(now) {
    stepIndex += 1;
    openBaselineFrames = 0;
    closedAtMs = null;
    smileFrames = 0;

    if (stepIndex >= steps.length) {
      verifiedAtMs = now;
      if (timeoutId) clearTimeout(timeoutId);
      setUI("#10b981", "VERIFIED", "Verified ✓", "Capturing your photo...", true);
    }
  }

  function evaluateFrame(now) {
    if (finished || timedOut || !landmarker || video.readyState < 2 || !video.videoWidth) return;

    if (video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;

    frameCounter += 1;
    if (frameCounter % 8 === 0) {
      cachedLuma = sampleLuma();
    }

    if (cachedLuma < 30) {
      setUI("#f59e0b", "LIGHTING", "Move to a brighter place", "Face lighting is too dim for verification");
      return;
    }
    if (cachedLuma > 244) {
      setUI("#f59e0b", "LIGHTING", "Avoid harsh backlight", "Step away from direct bright light");
      return;
    }

    const inferTs = Math.max(Math.round(now), lastInferTs + 1);
    lastInferTs = inferTs;

    let res;
    try {
      res = landmarker.detectForVideo(video, inferTs);
    } catch (_) {
      return;
    }

    const faces = res.faceLandmarks || [];
    const blends = res.faceBlendshapes || [];

    if (faces.length === 0 || blends.length === 0) {
      if (prevFaceCenter && verifiedAtMs === null) {
        stepIndex = 0;
        openBaselineFrames = 0;
        closedAtMs = null;
        observedNeutral = false;
        smileFrames = 0;
        prevFaceCenter = null;
      }
      setUI("#64748b", "ALIGN FACE", "Position your face in the circle", "Keep your full face clearly visible");
      return;
    }

    if (faces.length > 1) {
      stepIndex = 0;
      openBaselineFrames = 0;
      closedAtMs = null;
      observedNeutral = false;
      smileFrames = 0;
      prevFaceCenter = null;
      setUI("#f59e0b", "ONE PERSON ONLY", "Only one face allowed", "Make sure nobody else is in the camera frame");
      return;
    }

    const pts = faces[0];
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const faceW = maxX - minX;
    const cx = (minX + maxX) * 0.5;
    const cy = (minY + maxY) * 0.5;

    if (prevFaceCenter && verifiedAtMs === null) {
      const jump = Math.hypot(cx - prevFaceCenter.x, cy - prevFaceCenter.y);
      if (jump > 0.30) {
        stepIndex = 0;
        openBaselineFrames = 0;
        closedAtMs = null;
        observedNeutral = false;
        smileFrames = 0;
      }
    }
    prevFaceCenter = { x: cx, y: cy };

    if (faceW < 0.20) {
      setUI("#f59e0b", "MOVE CLOSER", "Move slightly closer", "Fill the circle with your face");
      return;
    }
    if (Math.abs(cx - 0.5) > 0.26 || Math.abs(cy - 0.47) > 0.28) {
      setUI("#f59e0b", "CENTER FACE", "Center your face in the circle", "Hold the phone at eye level");
      return;
    }

    const nose = pts[1];
    if (nose && faceW > 0.05) {
      const relNoseX = (nose.x - minX) / faceW;
      if (relNoseX < 0.28 || relNoseX > 0.72) {
        setUI("#f59e0b", "LOOK STRAIGHT", "Look straight at the camera", "Keep your head facing forward");
        return;
      }
    }

    const cats = blends[0].categories || [];
    const blinkL = getScore(cats, "eyeBlinkLeft");
    const blinkR = getScore(cats, "eyeBlinkRight");
    const smileL = getScore(cats, "mouthSmileLeft");
    const smileR = getScore(cats, "mouthSmileRight");
    const avgBlink = (blinkL + blinkR) * 0.5;
    const avgSmile = (smileL + smileR) * 0.5;

    if (avgSmile <= SMILE_NEUTRAL_MAX) {
      observedNeutral = true;
    }

    // Both steps verified -> snap crisp eyes-open photo automatically
    if (verifiedAtMs !== null) {
      const waited = now - verifiedAtMs;
      const eyesOpen = blinkL <= BLINK_OPEN_MAX && blinkR <= BLINK_OPEN_MAX;
      if (waited >= 240 && (eyesOpen || waited >= 750)) {
        snapEmployeePhoto();
      }
      return;
    }

    const currentStep = steps[stepIndex];
    const stepLabel = "STEP " + (stepIndex + 1) + " OF " + steps.length;

    if (currentStep === "eye_blink") {
      if (closedAtMs === null) {
        if (blinkL <= BLINK_OPEN_MAX && blinkR <= BLINK_OPEN_MAX) {
          openBaselineFrames += 1;
        } else if (
          openBaselineFrames >= 2 &&
          avgBlink >= BLINK_CLOSED_AVG_MIN &&
          blinkL >= BLINK_CLOSED_EACH_MIN &&
          blinkR >= BLINK_CLOSED_EACH_MIN
        ) {
          closedAtMs = now;
        }
        const prompt = stepIndex === 0 ? "Blink your eyes naturally" : "Great! Now blink your eyes";
        setUI("#6366f1", stepLabel, prompt, "Blink both eyes once inside the circle");
      } else {
        const closedDur = now - closedAtMs;
        if (closedDur > 1000) {
          closedAtMs = null;
          openBaselineFrames = 0;
          setUI("#f59e0b", stepLabel, "Open your eyes and blink naturally", "Do not hold your eyes closed");
        } else if (closedDur >= 30 && blinkL <= BLINK_OPEN_MAX && blinkR <= BLINK_OPEN_MAX) {
          advanceStep(now);
        } else {
          const prompt = stepIndex === 0 ? "Blink your eyes naturally" : "Great! Now blink your eyes";
          setUI("#6366f1", stepLabel, prompt, "Open your eyes to complete blink");
        }
      }
    } else if (currentStep === "smile") {
      if (!observedNeutral) {
        smileFrames = 0;
        setUI("#6366f1", stepLabel, "Relax your face briefly, then smile", "Checking natural expression");
        return;
      }
      if (avgSmile >= SMILE_ACTIVE_MIN && smileL >= 0.40 && smileR >= 0.40 && blinkL < 0.48 && blinkR < 0.48) {
        smileFrames += 1;
        if (smileFrames >= SMILE_FRAMES_REQUIRED) {
          advanceStep(now);
          return;
        }
      } else {
        smileFrames = 0;
      }
      const prompt = stepIndex === 0 ? "Smile naturally" : "Great! Now smile naturally";
      setUI("#6366f1", stepLabel, prompt, "Hold a natural smile for a moment");
    }
  }

  function loop(now) {
    if (finished) return;
    evaluateFrame(now);
    rafId = requestAnimationFrame(loop);
  }

  async function init() {
    retryBtn.style.display = "none";
    try {
      setUI("#64748b", "STARTING", "Opening front camera...", "Allow camera access if prompted");
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      video.srcObject = stream;
      await video.play();

      setUI("#6366f1", "LOADING AI", "Loading on-device face check...", "Initializing Eye Blink & Smile detector");
      const visionModule = await import(VISION_ESM);
      const { FilesetResolver, FaceLandmarker } = visionModule;
      const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);

      try {
        landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numFaces: 2,
          outputFaceBlendshapes: true
        });
      } catch (_) {
        landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
          runningMode: "VIDEO",
          numFaces: 2,
          outputFaceBlendshapes: true
        });
      }

      armSession();
      rafId = requestAnimationFrame(loop);
    } catch (err) {
      stopCamera();
      const msg = (err && err.message) ? err.message : "Could not initialize live camera check";
      setUI("#f43f5e", "SETUP ERROR", "Could not start live check", "Check internet connection for first-time AI load and tap Try Again");
      retryBtn.style.display = "block";
      console.warn("Liveness WebView init error:", msg);
    }
  }

  init();
</script>
</body>
</html>`;

const LivenessCameraModal = ({ visible, purpose = 'punchIn', onComplete }) => {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef(null);
  const completedRef = useRef(false);

  useEffect(() => {
    if (visible) {
      completedRef.current = false;
    }
  }, [visible]);

  const finishOnce = useCallback(
    (payload) => {
      if (completedRef.current) return;
      completedRef.current = true;
      onComplete?.(payload);
    },
    [onComplete]
  );

  const handleCancel = useCallback(() => {
    try {
      webViewRef.current?.injectJavaScript('window.__stopLivenessCamera && window.__stopLivenessCamera(); true;');
    } catch (_) {}
    finishOnce({
      verified: false,
      code: MOBILE_CODES.LIVENESS_CANCELLED,
      message: 'Live attendance verification was cancelled.',
      photo: null,
      capturedAt: null,
      stepsCompleted: [],
      durationMs: 0,
    });
  }, [finishOnce]);

  const handleMessage = useCallback(
    async (event) => {
      try {
        const data = JSON.parse(event?.nativeEvent?.data || '{}');
        if (data.verified && data.base64) {
          let fileUri = `data:image/jpeg;base64,${data.base64}`;
          try {
            if (FileSystem.cacheDirectory) {
              const target = `${FileSystem.cacheDirectory}liveness_selfie_${Date.now()}.jpg`;
              await FileSystem.writeAsStringAsync(target, data.base64, {
                encoding: FileSystem.EncodingType ? FileSystem.EncodingType.Base64 : 'base64',
              });
              fileUri = target;
            }
          } catch (_) {}

          finishOnce({
            verified: true,
            code: MOBILE_CODES.LIVENESS_VERIFIED,
            message: data.message || 'Live presence verified.',
            photo: { uri: fileUri, base64: data.base64 },
            capturedAt: Date.now(),
            stepsCompleted: Array.isArray(data.stepsCompleted) ? data.stepsCompleted : [],
            durationMs: data.durationMs || 0,
          });
          return;
        }

        finishOnce({
          verified: false,
          code: data.code || MOBILE_CODES.SELFIE_CAPTURE_FAILED,
          message: data.message || 'Live verification did not complete.',
          photo: null,
          capturedAt: null,
          stepsCompleted: [],
          durationMs: 0,
        });
      } catch (err) {
        finishOnce({
          verified: false,
          code: MOBILE_CODES.SELFIE_CAPTURE_FAILED,
          message: 'Could not read verified photo.',
          photo: null,
          capturedAt: null,
          stepsCompleted: [],
          durationMs: 0,
        });
      }
    },
    [finishOnce]
  );

  if (!visible) {
    completedRef.current = false;
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={handleCancel}
    >
      <View
        className="flex-1 bg-slate-900 px-5"
        style={{ paddingTop: Math.max(insets.top + 10, 24), paddingBottom: Math.max(insets.bottom + 14, 20) }}
      >
        <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

        {/* Header */}
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-1 mr-3">
            <Text className="text-white text-xl font-extrabold">
              {purpose === 'punchOut' ? 'Punch-Out Live Check' : 'Punch-In Live Check'}
            </Text>
            <Text className="text-slate-400 text-xs font-semibold mt-0.5">
              Blink your eyes & smile — photo captures automatically
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleCancel}
            activeOpacity={0.8}
            className="w-11 h-11 rounded-2xl bg-slate-800 border border-slate-700 justify-center items-center"
          >
            <X size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* Live Video Frame Analyzer */}
        <View className="flex-1 rounded-3xl overflow-hidden bg-slate-800">
          <WebView
            ref={webViewRef}
            originWhitelist={['*']}
            source={{ html: LIVENESS_HTML, baseUrl: 'https://localhost' }}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            allowsInlineMediaPlayback={true}
            mediaPlaybackRequiresUserAction={false}
            mixedContentMode="always"
            onMessage={handleMessage}
            style={{ flex: 1, backgroundColor: '#0f172a' }}
          />
        </View>

        {/* Privacy Reassurance Footer */}
        <Text className="text-slate-400 text-[11px] font-semibold text-center mt-3.5 leading-relaxed">
          Checked 100% on-device. Only Eye Blink & Smile pass verification before capturing your photo.
        </Text>
      </View>
    </Modal>
  );
};

export default LivenessCameraModal;
