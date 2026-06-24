import * as ort from 'onnxruntime-react-native';
import { Asset } from 'expo-asset';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface AiClassification {
  tags:           string[];
  sentiment:      number; // 0 (negative) → 1 (positive)
  emotionalIndex: number; // 0 (calm) → 1 (intense)
  confidence:     number; // 0 → 1, derived from model output entropy
  source:         'model' | 'fallback';
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_SEQ_LEN = 256;
const VOCAB_SIZE  = 30522; // standard WordPiece vocab size (bert-base-uncased)

// Tag labels — must match the model's output logit order when a real model is wired in.
const TAG_LABELS: readonly string[] = [
  'gratitude', 'reflection', 'anxiety', 'joy', 'sadness',
  'motivation', 'family', 'health', 'work', 'nature',
];

// Set to `require('../../assets/models/text_classifier.onnx')` once the model
// file is placed in that path. Keep null to skip native inference entirely and
// route every call through the rule-based fallback.
const MODEL_MODULE: number | null = null;

// ─── Tokenizer ────────────────────────────────────────────────────────────────
// Character-code vocabulary mapping: each character → its Unicode code point,
// clamped to [0, VOCAB_SIZE - 1] so it fits within the model's embedding table.
// Token ID 0 is used as the PAD token for positions beyond the input length.
// Sequences are truncated to MAX_SEQ_LEN; shorter sequences are zero-padded at the tail.
// Replace this function with a proper subword tokenizer (e.g. BPE, WordPiece)
// once a vocabulary file ships alongside the .onnx model weights.

function tokenize(text: string): Int32Array {
  const buf = new Int32Array(MAX_SEQ_LEN); // zero-initialized → PAD token
  const len = Math.min(text.length, MAX_SEQ_LEN);
  for (let i = 0; i < len; i++) {
    buf[i] = Math.min(text.charCodeAt(i), VOCAB_SIZE - 1);
  }
  return buf;
}

// ─── Rule-based fallback ──────────────────────────────────────────────────────
// Instant keyword + regex classifier. Returns the same AiClassification shape
// as the ONNX path so all downstream consumers remain model-agnostic.

const POSITIVE_WORDS =
  /\b(happy|joy|grateful|thankful|love|excited|wonderful|beautiful|great|amazing|bliss|peaceful|proud|hopeful)\b/gi;
const NEGATIVE_WORDS =
  /\b(sad|angry|anxious|worried|frustrated|tired|terrible|awful|stressed|lonely|afraid|hopeless|depressed)\b/gi;

const KEYWORD_TAGS: Array<{ pattern: RegExp; tag: string }> = [
  { pattern: /\b(work|job|project|deadline|meeting|office|career)\b/gi,      tag: 'work'       },
  { pattern: /\b(family|mom|dad|sister|brother|parent|kid|child)\b/gi,       tag: 'family'     },
  { pattern: /\b(health|exercise|sleep|diet|doctor|mental|anxiety)\b/gi,     tag: 'health'     },
  { pattern: /\b(nature|walk|hike|garden|park|sky|tree|ocean|mountain)\b/gi, tag: 'nature'     },
  { pattern: /\b(grateful|thankful|appreciate|blessed|gratitude)\b/gi,       tag: 'gratitude'  },
  { pattern: /\b(goal|achieve|progress|growth|learn|improve|dream)\b/gi,     tag: 'motivation' },
  { pattern: /\b(reflect|think|wonder|question|consider|realize)\b/gi,       tag: 'reflection' },
  { pattern: /\b(happy|joy|laugh|smile|fun|delight|love|excited)\b/gi,       tag: 'joy'        },
  { pattern: /\b(sad|miss|loss|grief|cry|lonely|hurt|regret)\b/gi,           tag: 'sadness'    },
  { pattern: /\b(anxious|worry|stress|fear|nervous|overwhelm)\b/gi,          tag: 'anxiety'    },
];

function ruleBased(text: string): AiClassification {
  const posCount = (text.match(POSITIVE_WORDS) ?? []).length;
  const negCount = (text.match(NEGATIVE_WORDS) ?? []).length;
  const total    = posCount + negCount;

  const sentiment      = total === 0 ? 0.5 : posCount / total;
  const emotionalIndex = Math.min((total / Math.max(text.split(/\s+/).length, 1)) * 5, 1.0);

  const tags = Array.from(
    new Set(
      KEYWORD_TAGS
        .filter(({ pattern }) => { pattern.lastIndex = 0; return pattern.test(text); })
        .map(({ tag }) => tag),
    ),
  );

  return {
    tags:           tags.length > 0 ? tags : ['reflection'],
    sentiment,
    emotionalIndex,
    confidence:     0.6, // static confidence for rule-based path
    source:         'fallback',
  };
}

// ─── Engine singleton ─────────────────────────────────────────────────────────

type EngineState =
  | { status: 'idle'    }
  | { status: 'ready';    session: ort.InferenceSession }
  | { status: 'failed'                                  };

let _state: EngineState = { status: 'idle' };
let _initPromise: Promise<void> | null = null;

async function _load(): Promise<void> {
  if (MODEL_MODULE === null) {
    _state = { status: 'failed' };
    return;
  }

  const asset = Asset.fromModule(MODEL_MODULE);
  await asset.downloadAsync();

  if (!asset.localUri) throw new Error('Asset localUri unavailable after download');

  const session = await ort.InferenceSession.create(asset.localUri, {
    executionProviders: ['cpu'],
  });

  _state = { status: 'ready', session };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const LocalAiEngine = {
  /**
   * Loads the ONNX model weights and creates a long-lived InferenceSession.
   * Safe to call multiple times — initialization is guaranteed to happen exactly once.
   * If the model file is absent or the device cannot allocate the session,
   * the engine silently switches to the rule-based fallback.
   */
  async initializeEngine(): Promise<void> {
    if (_state.status !== 'idle') return;
    if (_initPromise) return _initPromise;

    _initPromise = _load().catch((err) => {
      console.warn('[AI] ONNX session init failed — using rule-based fallback:', err);
      _state = { status: 'failed' };
    });

    return _initPromise;
  },

  /**
   * Classifies a journal text entry. Runs ONNX inference when the model is
   * loaded; otherwise falls back to the keyword analyzer.
   *
   * Always returns a fully populated AiClassification — never throws.
   */
  async classifyJournalText(text: string): Promise<AiClassification> {
    if (!text.trim()) {
      return { tags: [], sentiment: 0.5, emotionalIndex: 0, confidence: 0, source: 'fallback' };
    }

    if (_state.status !== 'ready') {
      return ruleBased(text);
    }

    try {
      const tokens  = tokenize(text);
      const tensor  = new ort.Tensor('int32', tokens, [1, MAX_SEQ_LEN]);
      const inputName = _state.session.inputNames[0];
      const results = await _state.session.run({ [inputName]: tensor });

      const outputName = _state.session.outputNames[0];
      const output     = results[outputName];
      const data       = output.data as Float32Array;

      // Expected output layout: [sentiment, emotionalIndex, ...tag_logits × TAG_LABELS.length]
      // All values are raw logits; we apply a sigmoid-like clamp to normalize to [0, 1].
      const clamp = (v: number) => Math.max(0, Math.min(1, (v + 1) / 2));

      const sentiment      = clamp(data[0] ?? 0);
      const emotionalIndex = clamp(data[1] ?? 0);

      const tagScores = Array.from(data.slice(2, 2 + TAG_LABELS.length));
      const tags = TAG_LABELS.filter((_, i) => (tagScores[i] ?? 0) > 0);

      const confidence = tagScores.length > 0
        ? Math.min(1, tagScores.reduce((a, b) => a + Math.abs(b), 0) / tagScores.length)
        : 0;

      return {
        tags:           tags.length > 0 ? tags : ['reflection'],
        sentiment,
        emotionalIndex,
        confidence,
        source:         'model',
      };
    } catch (err) {
      console.warn('[AI] Inference failed — falling back to rule-based:', err);
      return ruleBased(text);
    }
  },
};
